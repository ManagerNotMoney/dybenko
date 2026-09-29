// floor-event-manager.js
// ============================================================
// Обработка не-боевых узлов этажа (фонтаны, сундуки и т.д.).
// Как и CombatManager — не трогает DOM, только меняет данные
// (Player) и эмитит события через bus.
// ============================================================
import { bus } from "./engine.js";
import { CONSUMABLES } from "./data/consumables.js";
import { renderIcon } from "./ui/icon.js";
import { composeEquipment } from "./equipment.js";
import { EQUIPMENT_FORMS } from "./data/equipment-forms.js";
import { BODY_PARTS } from "./data/body-parts.js";

/** Доп. дроп с гоблинских ферм (трава/хлопок), если в руке подходящее оружие. */
const FARM_TOOL_BONUS = {
  knife: [2, 3],
  sickle: [3, 5],
};

export class FloorEventManager {
  constructor(state) {
    this.state = state;
    bus.on("floorEvent:wounded-traveler-choice", ({ itemId }) => this._handleWoundedTravelerChoice(itemId));
  }

  /** Игрок нажал "Взаимодействовать" на текущем узле-событии. */
  resolve() {
    const { floorEvent } = this.state;
    if (!floorEvent || floorEvent.resolved || this.state.isBusy) return;

    // Торговец не резолвится мгновенно — открывается его лавка,
    // событие завершится, только когда игрок уйдёт (см. leaveMerchant).
    // Путник-Лекарь работает по той же схеме, что и скелет-торговец.
    if (floorEvent.kind === "skeleton-merchant" || floorEvent.kind === "traveler-healer") {
      this.state.isBusy = true;
      bus.emit("floorEvent:merchant-opened", { event: floorEvent });
      return;
    }

    this.state.isBusy = true;
    floorEvent.resolved = true;

    switch (floorEvent.kind) {
      case "fountain":
        this._resolveFountain(floorEvent);
        break;
      case "chest":
        this._resolveChest(floorEvent);
        break;
      case "trap-chest":
        this._resolveTrapChest(floorEvent);
        break;
      case "goblin-farm":
        this._resolveGoblinFarm(floorEvent);
        break;
      case "goblin-stash":
        this._resolveGoblinStash(floorEvent);
        break;
      case "goblin-brew":
        this._resolveGoblinBrew(floorEvent);
        break;
      case "bone-pile":
        this._resolveBonePile(floorEvent);
        break;
      case "sword-in-stone":
        this._resolveSwordInStone(floorEvent);
        break;
      case "training-dummy":
        this._resolveTrainingDummy(floorEvent);
        break;
      case "blood-altar":
        this._resolveBloodAltar(floorEvent);
        break;
      case "wall-whisper":
        this._resolveWallWhisper(floorEvent);
        break;
      case "hanged-corpse":
        this._resolveHangedCorpse(floorEvent);
        break;
      case "penitent-font":
        this._resolvePenitentFont(floorEvent);
        break;
      case "rat-nest":
        this._resolveRatNest(floorEvent);
        break;
      case "bat-arch":
        this._resolveBatArch(floorEvent);
        break;
      case "goblin-priest":
        this._resolveGoblinPriest(floorEvent);
        break;
      case "goblin-elder":
        this._resolveGoblinElder(floorEvent);
        break;
      default:
        bus.emit("combat:log", { text: "Ничего не произошло.", type: "system" });
    }

    // Ловушка сундука могла убить игрока (_resolveTrapChest сама
    // выставляет phase = "defeat") — очередь этажа продолжать нельзя.
    if (this.state.phase === "defeat") {
      this.state.isBusy = false;
      return;
    }

    bus.emit("floorEvent:resolved", { event: floorEvent });
    this.state.isBusy = false;
  }

  /**
   * Купить у торговца-события по индексу в его stock. Диспетчер между
   * двумя разными моделями продажи — см. _buyFromSkeletonMerchant и
   * _buyFromTravelerHealer. Возвращает true при успехе.
   */
  buyFromMerchant(index) {
    const { floorEvent } = this.state;
    if (!floorEvent || floorEvent.resolved || !floorEvent.stock) return false;

    if (floorEvent.kind === "skeleton-merchant") return this._buyFromSkeletonMerchant(index);
    if (floorEvent.kind === "traveler-healer") return this._buyFromTravelerHealer(index);
    return false;
  }

  /**
   * Скелет-торговец: покупка ЛЮБОГО одного предмета сразу завершает визит —
   * торговец уходит и очередь этажа продвигается дальше, без лишнего клика
   * на "закрыть".
   */
  _buyFromSkeletonMerchant(index) {
    const { player, floorEvent } = this.state;
    const entry = floorEvent.stock[index];
    if (!entry || entry.sold) return false;

    if (!player.spendGold(entry.price)) {
      bus.emit("combat:log", { text: "Не хватает золота.", type: "system" });
      return false;
    }

    player.addItem(entry.id);
    entry.sold = true;
    bus.emit("combat:log", {
      text: `Куплено у торговца: ${renderIcon(entry.icon)} ${entry.name} (-${entry.price} золота).`,
      type: "good",
    });

    this.leaveMerchant();
    return true;
  }

  /**
   * Путник-Лекарь: в отличие от скелета, покупка НЕ закрывает визит — у него
   * по 3 шт. каждой позиции (зелья, бинты), можно набрать несколько штук
   * за один заход, пока не кончится товар или золото. Уходит игрок сам,
   * кнопкой закрытия (см. leaveMerchant).
   */
  _buyFromTravelerHealer(index) {
    const { player, floorEvent } = this.state;
    const entry = floorEvent.stock[index];
    if (!entry || entry.remaining <= 0) return false;

    if (!player.spendGold(entry.price)) {
      bus.emit("combat:log", { text: "Не хватает золота.", type: "system" });
      return false;
    }

    player.addItem(entry.id);
    entry.remaining -= 1;
    bus.emit("combat:log", {
      text: `Куплено у Путника-Лекаря: ${renderIcon(entry.icon)} ${entry.name} (-${entry.price} золота, осталось ${entry.remaining}).`,
      type: "good",
    });

    this._checkTravelerHealerSoldOut(floorEvent);
    return true;
  }

  /** Игрок нажимает "✕" на модалке торговца-события. */
  leaveMerchant() {
    const { floorEvent } = this.state;
    if (!floorEvent || floorEvent.resolved) return;
    if (floorEvent.kind !== "skeleton-merchant" && floorEvent.kind !== "traveler-healer") return;

    // Путник-Лекарь по "✕" никуда не уходит — просто прячем окно, сток
    // сохраняется как есть, и его снова можно открыть кнопкой
    // "Взаимодействовать" (например, сходив тем временем в инвентарь).
    // Насовсем узел завершится сам, когда у него кончится весь товар —
    // см. _checkTravelerHealerSoldOut.
    if (floorEvent.kind === "traveler-healer") {
      this.state.isBusy = false;
      return;
    }

    floorEvent.resolved = true;
    bus.emit("combat:log", { text: "Скелет-торговец рассыпается в пыль и исчезает во тьме.", type: "system" });
    bus.emit("floorEvent:resolved", { event: floorEvent });
    this.state.isBusy = false;
  }

  /** Если у Путника-Лекаря распродано всё до последней позиции — он уходит сам. */
  _checkTravelerHealerSoldOut(floorEvent) {
    if (floorEvent.kind !== "traveler-healer") return;
    if (floorEvent.stock.some((entry) => entry.remaining > 0)) return;

    floorEvent.resolved = true;
    bus.emit("combat:log", { text: "Путник-Лекарь собирает пожитки и растворяется в темноте коридора — товар кончился.", type: "system" });
    bus.emit("floorEvent:resolved", { event: floorEvent });
    this.state.isBusy = false;
  }

  _resolveGoblinStash(event) {
    const { player } = this.state;

    // Собираем пул всех валидных комбинаций материал×форма для
    // разрешённых материалов (composeEquipment сам отсеет несовместимые
    // сочетания, например перчатки из меди, вернув null).
    const pool = event.materials
      .flatMap((materialId) => EQUIPMENT_FORMS.map((form) => composeEquipment(materialId, form.id)))
      .filter(Boolean);

    if (pool.length === 0) {
      bus.emit("combat:log", { text: "Тайник оказался пуст.", type: "system" });
      return;
    }

    const item = pool[Math.floor(Math.random() * pool.length)];
    player.addItem(item.id); // сам эмитит player:item-added

    bus.emit("combat:log", {
      text: `${renderIcon(event.icon)} В тайнике находится: ${renderIcon(item.icon)} ${item.name}!`,
      type: "good",
    });
    bus.emit("player:item-found", { item });
    bus.emit("floorEvent:loot", { drops: [{ icon: item.icon }] });
  }

  _resolveGoblinBrew(event) {
    const { player } = this.state;
    const isPoison = Math.random() < 0.5;

    if (isPoison) {
      const dmg = Math.max(1, Math.round(player.maxHP * event.poisonDamagePercent));
      // Яд действует изнутри, в обход брони — форсируем полное пробитие
      // огромной "ловкостью атакующего", чтобы effectiveArmor стал 0.
      const { taken } = player.takeDamage(dmg, player.armor + dmg); // takeDamage сам эмитит player:damaged / player:died
      bus.emit("combat:log", {
        text: `${renderIcon(event.icon)} Зелье оказывается отравленным! Ты теряешь ${taken} здоровья.`,
        type: "damage",
      });
      if (!player.isAlive) {
        bus.emit("combat:log", { text: "Яд гоблина оказался смертельным...", type: "system" });
        this.state.phase = "defeat";
      }
    } else {
      const amount = Math.round(player.maxHP * event.healPercent);
      player.healWounds(amount); // сам эмитит player:healed и player:body-part-healed
      bus.emit("combat:log", {
        text: `${renderIcon(event.icon)} Зелье оказывается целебным! Ты восстанавливаешь ${amount} здоровья.`,
        type: "good",
      });
    }
  }

  _resolveBonePile(event) {
    const { player } = this.state;

    if (Math.random() >= event.itemChance) {
      bus.emit("combat:log", {
        text: `${renderIcon(event.icon)} Ты копаешься в костях, но не находишь ничего ценного.`,
        type: "system",
      });
      return;
    }

    const pool = EQUIPMENT_FORMS
      .map((form) => composeEquipment("bone", form.id))
      .filter(Boolean);

    if (pool.length === 0) return;

    const item = pool[Math.floor(Math.random() * pool.length)];
    player.addItem(item.id); // сам эмитит player:item-added

    bus.emit("combat:log", {
      text: `${renderIcon(event.icon)} Среди костей находится: ${renderIcon(item.icon)} ${item.name}!`,
      type: "good",
    });
    bus.emit("player:item-found", { item });
    bus.emit("floorEvent:loot", { drops: [{ icon: item.icon }] });
  }

  _resolveSwordInStone(event) {
    const { player } = this.state;

    if (player.strength <= event.requiredStrength) {
      bus.emit("combat:log", {
        text: `${event.icon} Ты пытаешься вытащить меч, но тебе не хватает силы. Клинок не поддаётся.`,
        type: "system",
      });
      return;
    }

    const goldSword = composeEquipment("gold", "sword");
    if (goldSword) {
      player.addItem(goldSword.id); // сам эмитит player:item-added
      bus.emit("player:item-found", { item: goldSword });
      bus.emit("floorEvent:loot", { drops: [{ icon: goldSword.icon }] });
    }

    player.applyStatChoice("stoicism");
    player.applyStatChoice("stoicism"); // +2 стойкости
    player.applyStatChoice("strength");
    player.applyStatChoice("strength"); // +2 силы

    bus.emit("combat:log", {
      text: `${event.icon} Меч со звоном выходит из камня — ты избранный! ${goldSword ? renderIcon(goldSword.icon) + " " + goldSword.name + " " : ""}получен, +2 стойкости, +2 силы!`,
      type: "good",
    });
  }

  _resolveTrainingDummy(event) {
    const { player } = this.state;

    // Определяем форму текущего оружия по itemId (materialId-formId),
    // сверяясь с формами слота "weapon" — без обращения к equipment.js.
    const weaponForms = EQUIPMENT_FORMS.filter((f) => f.slot === "weapon");
    const equippedWeaponId = player.equipped.weapon;
    const weaponForm = equippedWeaponId
      ? weaponForms.find((f) => equippedWeaponId.endsWith(`-${f.id}`))
      : null;

    const REWARDS = {
      sword: { stat: "stoicism", amount: 3, label: "мечом" },
      bow: { stat: "agility", amount: 2, label: "луком" },
      dagger: { stat: "agility", amount: 3, label: "кинжалом" },
      warhammer: { stat: "strength", amount: 2, label: "боевым молотом" },
      axe: { stat: "strength", amount: 3, label: "топором" },
    };

    const reward = weaponForm && REWARDS[weaponForm.id]
      ? REWARDS[weaponForm.id]
      : { stat: "stoicism", amount: 2, label: "голыми руками" };

    for (let i = 0; i < reward.amount; i++) player.applyStatChoice(reward.stat);

    const statLabel = { stoicism: "стойкости", strength: "силы", agility: "ловкости" }[reward.stat];

    bus.emit("combat:log", {
      text: `${renderIcon(event.icon)} Ты бьёшь по манекену ${reward.label} — тело навсегда закрепляет привычку: +${reward.amount} ${statLabel}!`,
      type: "good",
    });
  }

  _resolveBloodAltar(event) {
    const { player } = this.state;
    const cost = Math.max(1, Math.round(player.maxHP * event.hpCostPercent));
    // Полное пробитие, как у яда зельевара — алтарь забирает кровь напрямую, в обход брони.
    const { taken } = player.takeDamage(cost, player.armor + cost); // takeDamage сам эмитит player:damaged / player:died

    bus.emit("combat:log", {
      text: `${renderIcon(event.icon)} Алтарь пьёт твою кровь: -${taken} здоровья.`,
      type: "damage",
    });

    if (!player.isAlive) {
      bus.emit("combat:log", { text: "Алтарь забрал слишком много — кровь утекает без остатка...", type: "system" });
      this.state.phase = "defeat";
      return; // мёртвому награду не выдаём
    }

    for (let i = 0; i < event.statBonus.stoicism; i++) player.applyStatChoice("stoicism");
    bus.emit("combat:log", {
      text: `Камень насыщается — тело наливается стойкостью: +${event.statBonus.stoicism} стойкости!`,
      type: "good",
    });
  }

  /** Игрок выбрал конкретный вариант оплаты в веере кнопок (см. CombatView). */
  _handleWoundedTravelerChoice(itemId) {
    const { player, floorEvent } = this.state;
    if (!floorEvent || floorEvent.kind !== "wounded-traveler" || floorEvent.resolved || this.state.isBusy) return;

    const option = (floorEvent.costOptions || []).find((o) => o.itemId === itemId);
    if (!option) return;

    const have = player.inventory[option.itemId] || 0;
    if (have < option.count) return; // подстраховка — кнопка не должна была быть доступна

    this.state.isBusy = true;
    floorEvent.resolved = true;

    // Прямое списание из инвентаря — в Player нет отдельного removeItem(),
    // а inventory документирован как обычный объект { itemId: count }.
    player.inventory[option.itemId] -= option.count;

    const reward = this._rollTravelerReward(player);
    if (!reward) {
      bus.emit("combat:log", {
        text: `${renderIcon(floorEvent.icon)} Путник забирает ${option.icon} ${option.label}, перевязывает рану и молча уходит во тьму.`,
        type: "system",
      });
    } else {
      player.addItem(reward.id); // сам эмитит player:item-added
      bus.emit("combat:log", {
        text: `${renderIcon(floorEvent.icon)} Путник забирает ${option.icon} ${option.label} и в благодарность протягивает: ${renderIcon(reward.icon)} ${reward.name}!`,
        type: "good",
      });
      bus.emit("player:item-found", { item: reward });
      bus.emit("floorEvent:loot", { drops: [{ icon: reward.icon }] });
    }

    bus.emit("floorEvent:resolved", { event: floorEvent });
    this.state.isBusy = false;
  }

  /** Выбирает пул награды путника по доминирующей характеристике игрока. */
  _rollTravelerReward(player) {
    const stats = [
      { key: "agility", value: player.agility },
      { key: "strength", value: player.strength },
      { key: "stoicism", value: player.stoicism },
      { key: "armor", value: player.armor },
    ];
    const top = stats.reduce((best, s) => (s.value > best.value ? s : best), stats[0]);

    let pool = [];
    if (top.key === "agility") {
      // Теневая ткань исключает оружие (excludedSlots в materials.js),
      // поэтому докидываем костяной кинжал отдельно.
      pool = EQUIPMENT_FORMS
        .map((form) => composeEquipment("shadow-cloth", form.id))
        .filter(Boolean);
      const boneDagger = composeEquipment("bone", "dagger");
      if (boneDagger) pool.push(boneDagger);
    } else if (top.key === "strength" || top.key === "armor") {
      pool = EQUIPMENT_FORMS
        .map((form) => composeEquipment("iron", form.id))
        .filter(Boolean);
    } else {
      // Кожа: allowedForms в materials.js исключает оружие и щиты —
      // "кожаных мечей" в пуле физически быть не может.
      pool = EQUIPMENT_FORMS
        .map((form) => composeEquipment("leather", form.id))
        .filter(Boolean);
    }

    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  _resolveWallWhisper(event) {
    const { player } = this.state;
    const success = Math.random() < event.successChance;

    if (success) {
      const pool = EQUIPMENT_FORMS
        .map((form) => composeEquipment("gold", form.id))
        .filter(Boolean);

      if (pool.length === 0) {
        bus.emit("combat:log", { text: `${renderIcon(event.icon)} Шёпот стихает, так и не дав ничего взамен.`, type: "system" });
        return;
      }

      const item = pool[Math.floor(Math.random() * pool.length)];
      player.addItem(item.id); // сам эмитит player:item-added

      bus.emit("combat:log", {
        text: `${renderIcon(event.icon)} Рука нащупывает что-то в темноте: ${renderIcon(item.icon)} ${item.name}!`,
        type: "good",
      });
      bus.emit("player:item-found", { item });
      bus.emit("floorEvent:loot", { drops: [{ icon: item.icon }] });
      return;
    }

    // Неудача — стена откусывает самую здоровую кисть.
    const left = player.bodyParts["left-hand"];
    const right = player.bodyParts["right-hand"];

    if (left.currentHP <= 0 && right.currentHP <= 0) {
      bus.emit("combat:log", { text: `${renderIcon(event.icon)} Шёпот тянется к твоим кистям, но там уже нечего откусывать.`, type: "system" });
      return;
    }

    const targetPartId = left.currentHP >= right.currentHP ? "left-hand" : "right-hand";
    const part = player.bodyParts[targetPartId];
    const partDef = BODY_PARTS.find((d) => d.id === targetPartId);

    // incoming = ровно текущее HP кисти. attackerAgility = Infinity гарантирует
    // penetration >= armor при ЛЮБОМ значении брони игрока (в отличие от
    // "armor + lethalAmount", который обнулял броню, только если HP кисти
    // было не меньше самой брони) -> effectiveArmor = 0 -> taken = incoming ->
    // кисть уходит точно в 0, без "перелива" урона на другую часть тела.
    const lethalAmount = part.currentHP;
    const attackerAgility = Infinity;
    const { taken } = player.takeDamage(lethalAmount, attackerAgility, targetPartId); // takeDamage сам эмитит player:damaged / player:body-part-damaged / player:died

    bus.emit("combat:log", {
      text: `${renderIcon(event.icon)} Стена смыкается на твоей руке — ${partDef.nameAcc} с хрустом исчезает во тьме! -${taken} HP.`,
      type: "damage",
    });

    if (!player.isAlive) {
      bus.emit("combat:log", { text: "Кровь хлещет из культи — этого оказалось слишком много...", type: "system" });
      this.state.phase = "defeat";
    }
  }

  _resolveHangedCorpse(event) {
    const { player } = this.state;

    // Сначала карманы — с шансом в них снаряжение из разрешённых материалов.
    if (Math.random() < event.itemChance) {
      const pool = event.materials
        .flatMap((materialId) => EQUIPMENT_FORMS.map((form) => composeEquipment(materialId, form.id)))
        .filter(Boolean);

      if (pool.length > 0) {
        const item = pool[Math.floor(Math.random() * pool.length)];
        player.addItem(item.id); // сам эмитит player:item-added
        bus.emit("combat:log", {
          text: `${renderIcon(event.icon)} В истлевших карманах находится: ${renderIcon(item.icon)} ${item.name}!`,
          type: "good",
        });
        bus.emit("player:item-found", { item });
        bus.emit("floorEvent:loot", { drops: [{ icon: item.icon }] });
      }
    } else {
      bus.emit("combat:log", { text: `${renderIcon(event.icon)} Карманы трупа пусты.`, type: "system" });
    }

    // Кандалы могут полоснуть по шее — не отдельный урон, а прямое погружение
    // раны в тир кровотечения: дальше её подхватит обычный tickBleeding().
    if (Math.random() < event.cutChance) {
      const neck = player.bodyParts["neck"];
      const targetHP = Math.floor(neck.maxHP * 0.6); // надёжно попадает в тир "рана" (начало кровотечения)
      const cut = Math.max(1, neck.currentHP - targetHP);
      const attackerAgility = player.armor + cut; // полное пробитие, как у алтаря и яда зельевара
      const { taken } = player.takeDamage(cut, attackerAgility, "neck"); // takeDamage сам эмитит player:damaged / player:body-part-damaged / player:died

      bus.emit("combat:log", {
        text: `⛓️ Цепь дёргается и полосует тебе шею! -${taken} HP. Рана начинает кровоточить.`,
        type: "damage",
      });

      if (!player.isAlive) {
        bus.emit("combat:log", { text: "Кровь заливает горло — с этим не совладать...", type: "system" });
        this.state.phase = "defeat";
      }
    }
  }

  _resolvePenitentFont(event) {
    const { player } = this.state;

    if (player.currentHP >= player.maxHP) {
      bus.emit("combat:log", { text: `${renderIcon(event.icon)} Ты и так полностью здоров — купель никак не реагирует.`, type: "system" });
      return;
    }

    if (!player.spendGold(event.goldCost)) {
      bus.emit("combat:log", { text: `${renderIcon(event.icon)} Не хватает золота, чтобы купель откликнулась (нужно ${event.goldCost}).`, type: "system" });
      return;
    }

    // Передаём maxHP как "amount" — healWounds сама ограничит применение
    // недостачей каждой части, так что это гарантированно полное исцеление.
    const healed = player.healWounds(player.maxHP); // сам эмитит player:healed и player:body-part-healed

    bus.emit("combat:log", {
      text: `${renderIcon(event.icon)} Купель забирает ${event.goldCost} золота — раны затягиваются без следа (+${healed} HP).`,
      type: "good",
    });
  }

  _resolveRatNest(event) {
    const { player } = this.state;

    if (Math.random() < event.successChance) {
      const [min, max] = event.goldReward;
      const baseGold = Math.floor(Math.random() * (max - min + 1)) + min;
      const gold = player.gainGoldWithBonus(baseGold); // сам эмитит player:gold-changed
      bus.emit("combat:log", {
        text: `${renderIcon(event.icon)} Рука нащупывает в трухе несколько монет: +${gold}💰`,
        type: "good",
      });
      bus.emit("floorEvent:loot", { drops: [{ icon: "img/items/gold.png" }] });
      return;
    }

    // Крысы кусают за самую слабую (наиболее раненую) живую часть тела —
    // приоритет отдаём уже повреждённым, а не случайной здоровой части.
    const woundedParts = BODY_PARTS.filter((d) => {
      const part = player.bodyParts[d.id];
      return part.currentHP > 0 && part.currentHP < part.maxHP;
    });

    let targetPartId = null;
    if (woundedParts.length > 0) {
      targetPartId = woundedParts.reduce((worst, d) => {
        const pct = player.bodyParts[d.id].currentHP / player.bodyParts[d.id].maxHP;
        const worstPct = player.bodyParts[worst.id].currentHP / player.bodyParts[worst.id].maxHP;
        return pct < worstPct ? d : worst;
      }).id;
    }

    const dmg = Math.max(1, Math.round(player.maxHP * event.biteDamagePercent));
    const { taken } = player.takeDamage(dmg, 0, targetPartId); // takeDamage сам эмитит player:damaged / player:body-part-damaged / player:died

    bus.emit("combat:log", {
      text: `${renderIcon(event.icon)} Крысы бросаются на руку и кусают! -${taken} HP.`,
      type: "damage",
    });

    if (!player.isAlive) {
      bus.emit("combat:log", { text: "Стая не унимается, пока не добивает тебя...", type: "system" });
      this.state.phase = "defeat";
    }
  }

  _resolveBatArch(event) {
    const { player } = this.state;

    const allPartsMax = BODY_PARTS.every((def) => {
      const part = player.bodyParts[def.id];
      return part.currentHP >= part.maxHP;
    });

    if (allPartsMax) {
      // Прямая прибавка +1 (а не applyStatChoice, который даёт +2) —
      // тот же паттерн, что и в applyStatChoice: меняем stat, затем
      // пересчитываем HP частей тела, т.к. maxHP зависит от stoicism/strength.
      player._baseStrength += event.statBonus.strength;
      player.stoicism += event.statBonus.stoicism;
      player._baseAgility += event.statBonus.agility;
      player._reconcileHPAfterEquipChange();

      bus.emit("combat:log", {
        text: `${renderIcon(event.icon)} Мыши облетают тебя стороной, не найдя ни единой раны — тело благословенно закаляется: +${event.statBonus.strength} силы, +${event.statBonus.agility} ловкости, +${event.statBonus.stoicism} стойкости!`,
        type: "good",
      });
      return;
    }

    // Не в идеальном здоровье — каждая незажившая (но ещё живая) часть
    // тела обнуляется. Уже уничтоженные части (currentHP === 0) не трогаем —
    // им уже нечего терять.
    const damagedParts = BODY_PARTS.filter((def) => {
      const part = player.bodyParts[def.id];
      return part.currentHP > 0 && part.currentHP < part.maxHP;
    });

    if (damagedParts.length === 0) {
      bus.emit("combat:log", {
        text: `${renderIcon(event.icon)} Мыши проносятся мимо — свежих ран не нашлось, но и благословения тебе нет.`,
        type: "system",
      });
      return;
    }

    const hitNames = [];
    for (const def of damagedParts) {
      if (!player.isAlive) break; // остановиться, если суммарный урон уже добил игрока

      const part = player.bodyParts[def.id];
      const lethalAmount = part.currentHP;
      const attackerAgility = player.armor + lethalAmount; // полное пробитие, точно в 0
      player.takeDamage(lethalAmount, attackerAgility, def.id); // takeDamage сам эмитит player:damaged / player:body-part-damaged / player:died
      hitNames.push(def.nameAcc);
    }

    bus.emit("combat:log", {
      text: `${renderIcon(event.icon)} Стая раздирает когтями каждую незажившую рану! Уничтожены: ${hitNames.join(", ")}.`,
      type: "damage",
    });

    if (!player.isAlive) {
      bus.emit("combat:log", { text: "Кровь льётся отовсюду разом — тело не выдерживает...", type: "system" });
      this.state.phase = "defeat";
    }
  }

  _resolveGoblinPriest(event) {
    const { player } = this.state;

    if (!player.spendGold(event.goldCost)) {
      bus.emit("combat:log", {
        text: `${renderIcon(event.icon)} У тебя нет ${event.goldCost} золота — священник презрительно отворачивается и продолжает бормотать молитву.`,
        type: "system",
      });
      return;
    }

    player.addItem(event.rewardItemId); // сам эмитит player:item-added
    this.state.priestBribed = true;

    const potion = CONSUMABLES.find((c) => c.id === event.rewardItemId);
    const potionLabel = potion ? `${renderIcon(potion.icon)} ${potion.name}` : event.rewardItemId;

    bus.emit("combat:log", {
      text: `${renderIcon(event.icon)} Священник принимает золото и с гнилой улыбкой протягивает: ${potionLabel}. "Королю сегодня повезёт меньше..." — шепчет он вслед.`,
      type: "good",
    });
    if (potion) bus.emit("player:item-found", { item: potion });
    bus.emit("floorEvent:loot", { drops: [{ icon: potion ? potion.icon : event.icon }] });
  }

  _resolveGoblinElder(event) {
    const { player } = this.state;

    if (!player.spendGold(event.goldCost)) {
      bus.emit("combat:log", {
        text: `${renderIcon(event.icon)} У тебя нет ${event.goldCost} золота — старейшина разочарованно отпускает твой рукав и растворяется в тенях.`,
        type: "system",
      });
      return;
    }

    this.state.elderBribed = true;

    bus.emit("combat:log", {
      text: `${renderIcon(event.icon)} "Гоблин-Король узурпировал трон... помоги мне свергнуть его," — шепчет старейшина, забирая золото. Он внимательно оглядывает тебя с ног до головы и бесшумно скрывается во тьме.`,
      type: "system",
    });
  }

  _resolveGoblinFarm(event) {
    const { player } = this.state;
    const [min, max] = event.rewardRange;
    let amount = Math.floor(Math.random() * (max - min + 1)) + min;

    // Нож/серп в руке — доп. дроп с фермы (см. FARM_TOOL_BONUS).
    const toolRange = FARM_TOOL_BONUS[player.equipped.weapon];
    let bonusAmount = 0;
    if (toolRange) {
      const [bMin, bMax] = toolRange;
      bonusAmount = Math.floor(Math.random() * (bMax - bMin + 1)) + bMin;
      amount += bonusAmount;
    }

    for (let i = 0; i < amount; i++) player.addItem(event.resource); // сам эмитит player:item-added

    const resourceDef = CONSUMABLES.find((c) => c.id === event.resource);
    const label = resourceDef ? resourceDef.name : event.resource;
    const bonusNote = bonusAmount > 0 ? ` (+${bonusAmount} за инструмент в руке)` : "";

    bus.emit("combat:log", {
      text: `${renderIcon(event.icon)} Ты собираешь урожай: ${renderIcon(event.resourceIcon)} ${label} ×${amount}${bonusNote}.`,
      type: "good",
    });

    const drops = Array.from({ length: amount }, () => ({ icon: event.resourceIcon }));
    bus.emit("floorEvent:loot", { drops });
  }

  _resolveFountain(event) {
    const { player } = this.state;
    const amount = Math.round(player.maxHP * event.healPercent);
    player.healWounds(amount); // сам эмитит player:healed и player:body-part-healed
    bus.emit("combat:log", {
      text: `${renderIcon(event.icon)} Ты пьёшь из фонтана: раны затягиваются, +${amount} здоровья.`,
      type: "good",
    });
  }

  _resolveChest(event) {
    this._grantLoot(event);
  }

  _resolveTrapChest(event) {
    const { player } = this.state;
    const triggered = Math.random() < event.trapChance;

    if (triggered) {
      const dmg = Math.max(1, Math.round(player.maxHP * event.trapDamagePercent));
      const { taken } = player.takeDamage(dmg, 0); // takeDamage сам эмитит player:damaged / player:died
      bus.emit("combat:log", {
        text: `💥 Ловушка! Сундук наносит тебе ${taken} урона.`,
        type: "damage",
      });
      if (!player.isAlive) {
        bus.emit("combat:log", { text: "Ловушка оказалась смертельной...", type: "system" });
        this.state.phase = "defeat";
        return; // мёртвому лут не выдаём
      }
    } else {
      bus.emit("combat:log", { text: "Замок щёлкает — ловушки не было.", type: "system" });
    }

    this._grantLoot(event);
  }

  _grantLoot(event) {
    const { player } = this.state;
    const drops = [];

    if (event.goldReward) {
      const [min, max] = event.goldReward;
      const baseGold = Math.floor(Math.random() * (max - min + 1)) + min;
      const gold = player.gainGoldWithBonus(baseGold); // сам эмитит player:gold-changed
      bus.emit("combat:log", { text: `Найдено золото: +${gold}💰`, type: "good" });
      drops.push({ icon: "img/items/gold.png" });
    }

    if (event.itemChance && Math.random() < event.itemChance) {
      const item = this._rollRandomItem();
      if (item) {
        player.addItem(item.id); // сам эмитит player:item-added
        bus.emit("combat:log", { text: `Находка: ${renderIcon(item.icon)} ${item.name}!`, type: "system" });
        bus.emit("player:item-found", { item });
        drops.push({ icon: item.icon });
      }
    }

    if (drops.length > 0) {
      bus.emit("floorEvent:loot", { drops });
    }
  }

  _rollRandomItem() {
    // Пока просто случайный не-сырьевой расходник.
    // Если захочешь дропать снаряжение — импортни composeEquipment
    // и MATERIALS/EQUIPMENT_FORMS и подмешай их сюда так же, как в combat.js.
    const pool = CONSUMABLES.filter((c) => !c.raw);
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }
}