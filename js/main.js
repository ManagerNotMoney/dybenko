// main.js
// ============================================================
// Точка входа. Создаёт состояние игры, связывает модули и вешает
// обработчики на кнопки.
// ============================================================

import { bus, GameState } from "./engine.js";
import { Player } from "./player.js";
import { spawnEnemy, spawnEnemyById } from "./enemy.js";
import { spawnFloorEvent, FLOOR_EVENT_TYPES, buildEventInstance } from "./data/floor-events.js";
import { CombatManager } from "./combat.js";
import { FloorEventManager } from "./floor-event-manager.js";
import { UI } from "./ui.js";
import { refreshShopListing } from "./shop.js";

const state = new GameState();
const ui = new UI(state);
const combat = new CombatManager(state);
const floorEvents = new FloorEventManager(state);

// ----------------------------------------------------------
// Сколько врагов появляется на этаже.
// Глубина 1–4: 1 враг. Далее: 2–3, иногда 4.
// ----------------------------------------------------------
function enemyCountForDepth(depth) {
  if (depth < 5)  return 1;
  if (depth < 10) return Math.random() < 0.5 ? 1 : 2;
  if (depth < 20) return Math.floor(Math.random() * 2) + 2; // 2-3
  return Math.floor(Math.random() * 3) + 2; // 2-4
}

// Шанс и количество не-боевых событий (фонтаны, сундуки) на этаже.
function eventCountForDepth(depth) {
  if (depth < 2) return 0;
  return Math.random() < 0.45 ? 1 : 0;
}

function startNewRun() {
  state.reset();
  state.player = new Player({ name: "Странник", stoicism: 1, strength: 1, agility: 1 });
  // Стартовая рубаха — надета с самого начала каждого забега.
  state.player.addItem("shirt");
  state.player.equipItem("shirt");
  // Базовый набор выживания в рюкзаке: мелкое зелье здоровья и бинт.
  state.player.addItem("health-potion");
  state.player.addItem("bandage");
  ui.hideGameOver();
  startFloor();
}

// Этажи-боссы: глубина -> id врага, который заспавнится гарантированно
// и в одиночку (без обычных врагов и событий на этаже).
const BOSS_FLOORS = {
  40: "goblin-king",
};

function buildRegularFloorNodes(depth) {
  // Боевые узлы
  const enemyCount = enemyCountForDepth(depth);
  const nodes = Array.from({ length: enemyCount }, () => ({
    type: "combat",
    enemy: spawnEnemy(depth),
  }));

  // Не-боевые узлы — вставляем в случайную позицию очереди
  const eventCount = eventCountForDepth(depth);
  for (let i = 0; i < eventCount; i++) {
    const excludeIds = [
      ...(state.skeletonMerchantSpawned ? ["skeleton-merchant"] : []),
      ...(state.swordInStoneSpawned ? ["sword-in-stone"] : []),
      ...(state.goblinPriestSpawned ? ["goblin-priest"] : []),
    ];
    const event = spawnFloorEvent(depth, excludeIds);
    if (!event) continue;
    if (event.id === "skeleton-merchant") state.skeletonMerchantSpawned = true;
    if (event.id === "sword-in-stone") state.swordInStoneSpawned = true;
    if (event.id === "goblin-priest") state.goblinPriestSpawned = true;
    const insertAt = Math.floor(Math.random() * (nodes.length + 1));
    nodes.splice(insertAt, 0, { type: "event", event });
  }

  // Гоблин-Старейшина — не выпадает по весу (weight: 0 в floor-events.js),
  // а гарантированно появляется на 35 этаже, но замешан в случайную позицию
  // очереди вместе с обычными врагами и событиями, чтобы не выглядеть форс-спавном.
  if (depth === 35) {
    const elderType = FLOOR_EVENT_TYPES.find((e) => e.id === "goblin-elder");
    if (elderType) {
      const elderEvent = buildEventInstance(elderType);
      const insertAt = Math.floor(Math.random() * (nodes.length + 1));
      nodes.splice(insertAt, 0, { type: "event", event: elderEvent });
    }
  }

  return nodes;
}

function startFloor() {
  const bossId = BOSS_FLOORS[state.depth];

  let nodes;
  if (bossId) {
    const bossEnemy = spawnEnemyById(bossId, state.depth);
    // Если игрок подкупил гоблина-священника раньше в этом забеге —
    // Король выходит на бой без единого заряда лечения.
    if (bossId === "goblin-king" && state.priestBribed) {
      bossEnemy.healCharges = 0;
      bossEnemy.healChargesLeft = 0;
    }
    // Если игрок подкупил гоблина-старейшину на 35 этаже — старейшина
    // "помог" Королю укрепить власть: +10 урона и +1 заряд лечения.
    if (bossId === "goblin-king" && state.elderBribed) {
      bossEnemy.damage += 10;
      bossEnemy.healCharges += 1;
      bossEnemy.healChargesLeft += 1;
    }
    nodes = [{ type: "combat", enemy: bossEnemy, isBoss: true }];
  } else {
    nodes = buildRegularFloorNodes(state.depth);
  }

  state.floorQueue = nodes;
  state.floorIndex = 0;
  state.floorTotal = nodes.length;

  // Обновляем ассортимент магазина один раз при входе на этаж
  refreshShopListing();

  spawnNextFromQueue();
}

function spawnNextFromQueue() {
  const node = state.floorQueue[state.floorIndex];
  if (!node) return;

  if (node.type === "combat") {
    spawnCombatNode(node);
  } else {
    spawnEventNode(node);
  }
}

function spawnCombatNode(node) {
  const enemy = node.enemy;

  state.enemy = enemy;
  state.floorEvent = null;
  state.phase = "combat";
  state.isBusy = false;
  state.initiativeRolled = false; // сбрасываем для каждого нового врага

  ui.showEnemyCard();
  ui.renderAll();
  ui.showContinueButton(false);
  ui.setButtonsEnabled(true);

  const isFirst = state.floorIndex === 0;
  const queueText = state.floorTotal > 1
    ? ` [${state.floorIndex + 1}/${state.floorTotal}]`
    : "";

  bus.emit("combat:log", {
    text: node.isBoss
      ? `⚠️ Глубина ${state.depth}: тебе преграждает путь ${enemy.name}!`
      : isFirst
        ? `Глубина ${state.depth}${queueText}: из тьмы появляется ${enemy.name}.`
        : `Следующий противник${queueText}: ${enemy.name}!`,
    type: "system",
  });

  if (node.isBoss && enemy.id === "goblin-king" && state.priestBribed) {
    bus.emit("combat:log", { text: "Гоблин-Священник сдержал слово — на поясе Короля не осталось ни одной фляги...", type: "good" });
  }
  if (node.isBoss && enemy.id === "goblin-king" && state.elderBribed) {
    bus.emit("combat:log", { text: "Старейшина предал тебя — Король вооружён и защищён лучше, чем прежде...", type: "damage" });
  }
}

function spawnEventNode(node) {
  const event = node.event;

  state.floorEvent = event;
  state.enemy = null;
  state.phase = "floor-event";
  state.isBusy = false;

  ui.showEventCard(event);
  ui.renderAll();
  ui.showContinueButton(false);
  ui.setInteractEnabled(true);
  ui.setButtonsEnabled(true);

  const queueText = state.floorTotal > 1
    ? ` [${state.floorIndex + 1}/${state.floorTotal}]`
    : "";

  bus.emit("combat:log", {
    text: `${event.icon}${queueText} Ты натыкаешься на: ${event.name}.`,
    type: "system",
  });
}

// Общий переход к следующему узлу очереди этажа (после боя или события).
function advanceFloorQueue(delay = 650) {
  state.floorIndex += 1;
  const hasMore = state.floorIndex < state.floorTotal;

  setTimeout(() => {
    if (hasMore) {
      spawnNextFromQueue();
    } else {
      state.phase = "floor-cleared";
      ui.showContinueButton(true);
      refreshRestButton();
    }
  }, delay);
}

/** Доступность кнопки "Привал" — есть смысл жать её, только если есть активные бинты. */
function refreshRestButton() {
  const hasBandages = Object.keys(state.player.bandagedParts).length > 0;
  const hasMinorInjuries = state.player.hasMinorInjuries;
  ui.setRestEnabled(hasBandages || hasMinorInjuries);
}

// Бинт можно наложить/снять прямо на экране "этаж зачищен" (через рюкзак) —
// раньше кнопка "Привал" узнавала об этом только при СЛЕДУЮЩЕЙ зачистке
// этажа, потому что refreshRestButton() вызывался только в advanceFloorQueue
// и после самого тика. Теперь она реагирует сразу на изменение бинтов.
bus.on("player:bandage-changed", () => refreshRestButton());

// Отдых на зачищенном этаже: один тик = один бинт заживает на грейд (как за
// боевой ход), но и кровотечение из шеи (если есть) тоже продолжается —
// отдых не останавливает кровопотерю, поэтому спамить его без разбора рискованно.
function restTick() {
  if (state.phase !== "floor-cleared" || state.isBusy || !state.player.isAlive) return;

  const player = state.player;
  const hasBandages = Object.keys(player.bandagedParts).length > 0;
  const hasMinorInjuries = player.hasMinorInjuries;
  if (!hasBandages && !hasMinorInjuries) {
    bus.emit("combat:log", { text: "Отдыхать здесь незачем — на теле нет бинтов, которые могли бы затянуться, и заметных ушибов тоже нет.", type: "system" });
    return;
  }

  bus.emit("combat:log", { text: "Ты устраиваешь короткий привал, чтобы перевести дух...", type: "system" });
  player.tickBandages();
  player.healMinorInjuries();
  player.tickBleeding();

  refreshRestButton();
}

/** Доступность "Привала" в укрытии — не по бинтам, а по оставшемуся лимиту попыток. */
function refreshHideoutRestButton() {
  ui.setRestEnabled(state.hideoutRestsUsed < state.hideoutRestsMax);
}

// Отдых в укрытии при побеге: работает как обычный привал (бинты/кровотечение/
// ушибы), но лимитирован hideoutRestsMax попытками, и начиная со 2-го раза
// рискует привлечь внимание. На 2-м привале — только предупреждение, с 3-го —
// следующий бой начнётся с гарантированного удара врага первым (см. combat.js).
function restHideout() {
  if (state.phase !== "hideout" || state.isBusy || !state.player.isAlive) return;

  const player = state.player;
  bus.emit("combat:log", { text: "Ты пережидаешь в укрытии, стараясь не шуметь...", type: "system" });
  player.tickBandages();
  player.healMinorInjuries();
  player.tickBleeding();

  if (!state.player.isAlive) return; // кровотечение могло добить — дальше говорить не о чем

  state.hideoutRestsUsed += 1;

  if (state.hideoutRestsUsed === 2 && !state.hideoutWarned) {
    state.hideoutWarned = true;
    bus.emit("combat:log", { text: "⚠️ Со стороны коридора доносятся тихие шаги — кто-то приближается...", type: "damage" });
  } else if (state.hideoutRestsUsed > 2) {
    state.hideoutAmbushPending = true;
    bus.emit("combat:log", { text: "Шаги всё ближе — оставаться здесь и дальше слишком рискованно.", type: "damage" });
  }

  if (state.hideoutRestsUsed >= state.hideoutRestsMax) {
    bus.emit("combat:log", { text: "Укрытие больше не безопасно — пора уходить.", type: "system" });
    leaveHideout();
    return;
  }

  refreshHideoutRestButton();
}

// Уйти из укрытия (добровольно или принудительно, когда лимит попыток
// исчерпан) — этаж перегенерируется, как и при обычном мгновенном побеге.
// Если игрок успел "насидеть" риск (3+ привала) — следующий бой начнётся
// с гарантированного удара врага первым.
function leaveHideout() {
  if (state.phase !== "hideout") return;

  const ambush = state.hideoutAmbushPending;
  state.hideoutAmbushPending = false;
  state.forceEnemyInitiative = ambush;

  bus.emit("combat:log", {
    text: ambush
      ? "Ты выбираешься из укрытия — шаги за спиной слышны совсем близко..."
      : "Ты выбираешься из укрытия и продолжаешь путь.",
    type: "system",
  });

  ui.showHideoutButtons(false);
  startFloor();
}

function descend() {
  state.player.tickBandages();
  state.depth += 1;
  startFloor();
}

// Пропустить текущий узел-событие (фонтан/сундук/ферма) без взаимодействия.
function skipFloorEvent() {
  const { floorEvent } = state;
  if (!floorEvent || floorEvent.resolved || state.isBusy) return;

  floorEvent.resolved = true;
  bus.emit("combat:log", { text: `Ты проходишь мимо: ${floorEvent.name}.`, type: "system" });
  bus.emit("floorEvent:resolved", { event: floorEvent });
}

// ----------------------------------------------------------
// обработчики кнопок
// ----------------------------------------------------------

document.getElementById("btn-attack").addEventListener("click", () => {
  combat.playerAttack();
});

document.getElementById("btn-flee").addEventListener("click", () => {
  if (state.phase === "floor-event") {
    skipFloorEvent();
    return;
  }
  if (state.phase === "hideout") {
    leaveHideout();
    return;
  }
  if (state.isBusy) return; // ход ещё разрешается — combat.flee() всё равно откажет
  combat.flee();
  setTimeout(() => {
    if (state.phase === "hideout") {
      // Укрытие найдено — вместо перезапуска этажа показываем экран привала.
      ui.setButtonsEnabled(true);
      ui.showHideoutButtons(true);
      refreshHideoutRestButton();
    } else if (state.phase === "fled") {
      // Обычный побег — перезапускаем весь этаж
      startFloor();
    }
    // Иначе (фаза осталась "combat") — побег провалился из-за раненых ног,
    // бой продолжается как обычно, ничего дополнительно делать не нужно:
    // _failedFleeAttack() в combat.js уже разрешил ход и снял isBusy сам.
  }, 400);
});
document.getElementById("btn-interact").addEventListener("click", () => {
  if (!ui.handleInteractClick(state.floorEvent)) return;
  ui.setInteractEnabled(false);
  floorEvents.resolve();
});

document.getElementById("merchant-close").addEventListener("click", () => {
  ui.hideMerchantModal();
  floorEvents.leaveMerchant();
  // Путник-Лекарь по "✕" не завершает узел (в отличие от скелета) — если
  // событие всё ещё активно, кнопку "Взаимодействовать" нужно включить
  // заново вручную, иначе она останется заблокированной навсегда:
  // spawnEventNode() (единственное место, где она обычно разблокируется)
  // для уже существующего узла повторно не вызывается.
  if (state.floorEvent && !state.floorEvent.resolved) {
    ui.setInteractEnabled(true);
  }
});

document.getElementById("merchant-grid").addEventListener("click", (event) => {
  const buyBtn = event.target.closest(".shop-item__buy");
  if (!buyBtn || buyBtn.disabled) return;
  const bought = floorEvents.buyFromMerchant(Number(buyBtn.dataset.index));
  if (bought) {
    // Модалку закрываем, только если торговец реально ушёл (событие
    // resolved) — у скелета это происходит сразу, у Путника-Лекаря
    // только когда игрок сам нажмёт "закрыть".
    if (state.floorEvent?.resolved) {
      ui.hideMerchantModal();
    } else {
      ui.renderMerchant();
    }
  }
});

document.getElementById("btn-shop").addEventListener("click", () => {
  ui.showShopModal();
});

document.getElementById("btn-descend").addEventListener("click", () => {
  descend();
});

document.getElementById("btn-rest").addEventListener("click", () => {
  if (state.phase === "hideout") {
    restHideout();
  } else {
    restTick();
  }
});

document.getElementById("btn-workbench").addEventListener("click", () => {
  ui.showWorkbenchModal();
});

document.getElementById("btn-restart").addEventListener("click", () => {
  startNewRun();
});

// ----------------------------------------------------------
// рабочая станция (только крафт)
// ----------------------------------------------------------

document.getElementById("workbench-close").addEventListener("click", () => {
  ui.hideWorkbenchModal();
});

document.getElementById("workbench-overlay").addEventListener("click", (event) => {
  if (event.target.id === "workbench-overlay") ui.hideWorkbenchModal();
});

document.getElementById("btn-descend-from-workbench").addEventListener("click", () => {
  ui.hideWorkbenchModal();
  descend();
});

// ----------------------------------------------------------
// лавка торговца
// ----------------------------------------------------------

document.getElementById("shop-close").addEventListener("click", () => {
  ui.hideShopModal();
});

document.getElementById("btn-descend-from-shop").addEventListener("click", () => {
  ui.hideShopModal();
  descend();
});

document.getElementById("shop-grid").addEventListener("click", (event) => {
  const buyBtn = event.target.closest(".shop-item__buy");
  if (!buyBtn || buyBtn.disabled) return;
  ui.buyShopItemByIndex(Number(buyBtn.dataset.index));
});

// ----------------------------------------------------------
// персонаж / инвентарь
// ----------------------------------------------------------

document.getElementById("btn-health").addEventListener("click", () => {
  ui.showHealthModal();
});

document.getElementById("health-close").addEventListener("click", () => {
  ui.hideHealthModal();
});

document.getElementById("health-overlay").addEventListener("click", (event) => {
  if (event.target.id === "health-overlay") ui.hideHealthModal();
});

document.getElementById("btn-inventory").addEventListener("click", () => {
  ui.showInventoryModal();
});

document.getElementById("inventory-close").addEventListener("click", () => {
  ui.hideInventoryModal();
});

document.getElementById("inventory-overlay").addEventListener("click", (event) => {
  if (event.target.id === "inventory-overlay") ui.hideInventoryModal();
});

document.getElementById("topbar-title").addEventListener("click", () => {
  ui.showRacesModal();
});

document.getElementById("topbar-title").addEventListener("keydown", (event) => {
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    ui.showRacesModal();
  }
});

document.getElementById("races-close").addEventListener("click", () => {
  ui.hideRacesModal();
});

document.getElementById("races-overlay").addEventListener("click", (event) => {
  if (event.target.id === "races-overlay") ui.hideRacesModal();
});

document.getElementById("btn-records").addEventListener("click", () => {
  ui.showRecordsModal();
});

document.getElementById("records-close").addEventListener("click", () => {
  ui.hideRecordsModal();
});

document.getElementById("records-overlay").addEventListener("click", (event) => {
  if (event.target.id === "records-overlay") ui.hideRecordsModal();
});

document.getElementById("choice-stoicism").addEventListener("click", () => {
  state.player.applyStatChoice("stoicism");
  ui.hideLevelUpModal();
  ui.renderPlayer();
});

document.getElementById("choice-strength").addEventListener("click", () => {
  state.player.applyStatChoice("strength");
  ui.hideLevelUpModal();
  ui.renderPlayer();
});

document.getElementById("choice-agility").addEventListener("click", () => {
  state.player.applyStatChoice("agility");
  ui.hideLevelUpModal();
  ui.renderPlayer();
});

// ----------------------------------------------------------
// реакция на исход боя
// ----------------------------------------------------------

bus.on("enemy:died", () => {
  ui.setButtonsEnabled(false);
  advanceFloorQueue(650);
});

bus.on("floorEvent:resolved", () => {
  advanceFloorQueue(500);
});

bus.on("floorEvent:merchant-opened", () => {
  ui.showMerchantModal();
});

bus.on("player:leveled-up", ({ level }) => {
  bus.emit("combat:log", { text: `Новый уровень: ${level}! Можно усилить героя.`, type: "good" });
  ui.showLevelUpModal();
});

bus.on("player:died", () => {
  state.phase = "defeat";
  ui.setButtonsEnabled(false);
  setTimeout(() => ui.showGameOver(state.depth), 700);
});

// ----------------------------------------------------------
// главное меню и версия билда
// ----------------------------------------------------------
const BUILD_VERSION = "1.1.0";
const BUILD_NAME = "Новый Мир / Новая Жизнь!";

document.getElementById("topbar-build").textContent = `Build ${BUILD_VERSION}`;
document.getElementById("main-menu-build").textContent =
  `BUILD ${BUILD_VERSION} — «${BUILD_NAME.toUpperCase()}»`;
document.getElementById("changelog-current-version").textContent = `v${BUILD_VERSION}`;

function animateMenuToGame() {
  const menu = document.getElementById("main-menu");
  const menuTitle = document.querySelector(".main-menu__title");
  const menuSigil = document.querySelector(".main-menu__sigil");
  const topbarTitle = document.getElementById("topbar-title");
  const topbarSigil = document.querySelector(".topbar__sigil");
  const changelog = document.querySelector(".main-menu__changelog");
  const restOfContent = document.querySelectorAll(
    ".main-menu__flourish, .main-menu__subtitle, .main-menu__start, .main-menu__build"
  );

  const startRect = menuTitle.getBoundingClientRect();
  const endRect = topbarTitle.getBoundingClientRect();
  const startFontSize = parseFloat(getComputedStyle(menuTitle).fontSize);
  const endFontSize = parseFloat(getComputedStyle(topbarTitle).fontSize);
  const scale = endFontSize / startFontSize;

  // Клон заголовка, летящий поверх всего интерфейса
  const flyingTitle = document.createElement("div");
  flyingTitle.textContent = menuTitle.textContent;
  flyingTitle.className = "main-menu__title main-menu__title--flying";
  flyingTitle.style.left = `${startRect.left}px`;
  flyingTitle.style.top = `${startRect.top}px`;
  document.body.appendChild(flyingTitle);

  menuTitle.style.visibility = "hidden";
  topbarTitle.style.visibility = "hidden";

  changelog?.classList.add("main-menu__changelog--exit");
  restOfContent.forEach((el) => el.classList.add("main-menu__fade-out"));
  menuSigil?.classList.add("main-menu__sigil--exit");

  requestAnimationFrame(() => {
    flyingTitle.style.transform =
      `translate(${endRect.left - startRect.left}px, ${endRect.top - startRect.top}px) scale(${scale})`;
    flyingTitle.style.opacity = "0.92";
  });

  flyingTitle.addEventListener("transitionend", () => {
    flyingTitle.remove();
    topbarTitle.style.visibility = "";
    menu.classList.add("is-hidden");

    if (topbarSigil) {
      topbarSigil.classList.add("topbar__sigil--enter");
      topbarSigil.addEventListener(
        "animationend",
        () => topbarSigil.classList.remove("topbar__sigil--enter"),
        { once: true }
      );
    }

    startNewRun();
  }, { once: true });
}

document.getElementById("btn-start-game").addEventListener("click", animateMenuToGame, { once: true });

document.getElementById("btn-about-game").addEventListener("click", () => {
  document.getElementById("about-overlay").classList.remove("is-hidden");
});
document.getElementById("about-close").addEventListener("click", () => {
  document.getElementById("about-overlay").classList.add("is-hidden");
});
document.getElementById("about-overlay").addEventListener("click", (event) => {
  if (event.target.id === "about-overlay") {
    document.getElementById("about-overlay").classList.add("is-hidden");
  }
});

// ----------------------------------------------------------
// старт
// ----------------------------------------------------------

window.addEventListener("beforeunload", (e) => {
  e.preventDefault();
  e.returnValue = "";
});

window.debug = { state, bus };