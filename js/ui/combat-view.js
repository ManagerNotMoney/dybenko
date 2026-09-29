// ui/combat-view.js
// ============================================================
// Экран боя: карточки игрока/врага, HP/XP, летающий урон, лог,
// модалки level-up и game-over.
// ============================================================

const ATTACK_SLASHES = [
  "img/effects/attack_0.png",
  "img/effects/attack_1.png",
  "img/effects/attack_2.png",
  "img/effects/attack_3.png",
  "img/effects/attack_4.png",
  "img/effects/attack_5.png",
  "img/effects/attack_6.png",
  "img/effects/attack_7.png",
];

import { bus } from "../engine.js";
import { getRaceById } from "../data/races.js";
import { renderIcon } from "./icon.js";

export class CombatView {
  constructor(state, els) {
    this.state = state;
    this.els = els;
    this._interactChoicesOpen = false;
    this._injectEnemyPortraitStyles();
    this._injectPoisonParticles(this.els.enemyCard);
    this._injectPoisonParticles(this.els.playerCard);
    this._injectWoundedTravelerChoiceStyles();
    this._bindEnemyLore();
  }

  /** Один раз создаёт слой с зелёными частицами внутри переданной карточки (враг или игрок). Видимость управляется классом .combatant--poisoned через CSS. */
  _injectPoisonParticles(cardEl) {
    const frame = cardEl?.querySelector(".combatant__frame");
    if (!frame || frame.querySelector(".poison-fx-layer")) return;
    const layer = document.createElement("div");
    layer.className = "poison-fx-layer";
    for (let i = 0; i < 7; i++) {
      const particle = document.createElement("span");
      particle.className = "poison-particle";
      particle.style.setProperty("--px", `${8 + Math.random() * 84}%`);
      particle.style.setProperty("--pdelay", `${(Math.random() * 2.4).toFixed(2)}s`);
      particle.style.setProperty("--pdur", `${(2.6 + Math.random() * 1.8).toFixed(2)}s`);
      particle.style.setProperty("--pscale", `${(0.6 + Math.random() * 0.7).toFixed(2)}`);
      layer.appendChild(particle);
    }
    frame.appendChild(layer);
  }

  _bindEnemyLore() {
    if (this.els.enemyIcon) {
      this.els.enemyIcon.addEventListener("click", () => this.showEnemyLore());
    }
    if (this.els.enemyLoreClose) {
      this.els.enemyLoreClose.addEventListener("click", () => this.hideEnemyLore());
    }
    if (this.els.enemyLoreOverlay) {
      this.els.enemyLoreOverlay.addEventListener("click", (event) => {
        if (event.target.id === "enemy-lore-overlay") this.hideEnemyLore();
      });
    }
    if (this.els.enemyLoreRace) {
      this.els.enemyLoreRace.addEventListener("click", () => {
        const raceId = this.els.enemyLoreRace.dataset.raceId;
        this.hideEnemyLore();
        bus.emit("ui:open-race", { raceId });
      });
    }
  }

  showEnemyLore() {
    const e = this.state.enemy;
    if (!e || !this.els.enemyLoreOverlay) return;

    if (this.els.enemyLoreName) this.els.enemyLoreName.textContent = e.name;
    if (this.els.enemyLoreText) this.els.enemyLoreText.textContent = e.lore;
    if (this.els.enemyLoreIcon) {
      this.els.enemyLoreIcon.innerHTML = e.icon && e.icon.includes(".png")
        ? `<img src="${e.icon}" class="enemy-portrait" alt="${e.name}">`
        : e.icon;
    }
    if (this.els.enemyLoreRace) {
      const race = getRaceById(e.race);
      if (race) {
        this.els.enemyLoreRace.textContent = `Раса: ${race.name} →`;
        this.els.enemyLoreRace.dataset.raceId = race.id;
        this.els.enemyLoreRace.classList.remove("is-hidden");
      } else {
        this.els.enemyLoreRace.classList.add("is-hidden");
      }
    }
    this.els.enemyLoreOverlay.classList.remove("is-hidden");
  }

  hideEnemyLore() {
    if (this.els.enemyLoreOverlay) this.els.enemyLoreOverlay.classList.add("is-hidden");
  }

  _injectEnemyPortraitStyles() {
    if (document.getElementById("enemy-portrait-styles")) return;
    const style = document.createElement("style");
    style.id = "enemy-portrait-styles";
    style.textContent = `
      .hit-slash {
        position: absolute;
        width: 140px;
        height: 140px;
        object-fit: contain;
        pointer-events: none;
        z-index: 5;
        transform-origin: center;
        animation: hitSlashAnim 0.32s ease-out forwards;
        mix-blend-mode: screen;
      }
      @keyframes hitSlashAnim {
        0%   { opacity: 0;   transform: scale(0.6) rotate(var(--slash-rot, 0deg)); }
        15%  { opacity: 1;   transform: scale(1.15) rotate(var(--slash-rot, 0deg)); }
        30%  { opacity: 1;   transform: scale(1.0) rotate(var(--slash-rot, 0deg)); }
        100% { opacity: 0;   transform: scale(1.05) rotate(var(--slash-rot, 0deg)); }
      }
      .hit-slash--crit {
        width: 190px;
        height: 190px;
        filter: drop-shadow(0 0 6px #ffcf40);
      }
      .enemy-portrait {
        width: 80px;
        height: 80px;
        object-fit: cover;
        filter: drop-shadow(0 0 2px #8b0000) drop-shadow(0 0 4px #5a0000) drop-shadow(0 0 8px rgba(139,0,0,0.4));
        display: block;
        image-rendering: auto;
        transition: transform 0.2s ease, filter 0.2s ease;
      }
      .combatant--dying .enemy-portrait {
        filter: grayscale(100%) brightness(0.4) drop-shadow(0 0 2px #333);
        transform: scale(0.9);
      }
      .combatant--hit .enemy-portrait {
        animation: enemyHitShake 0.35s ease;
      }
      @keyframes enemyHitShake {
        0%, 100% { transform: translateX(0); }
        25% { transform: translateX(-4px) rotate(-2deg); }
        75% { transform: translateX(4px) rotate(2deg); }
      }
      .combatant--dodge .combatant__frame {
        animation: dodgeStep 0.4s ease;
      }
      @keyframes dodgeStep {
        0%   { transform: translateX(0); filter: blur(0); }
        30%  { transform: translateX(-18px); filter: blur(2px); opacity: .6; }
        60%  { transform: translateX(10px); filter: blur(1px); opacity: .85; }
        100% { transform: translateX(0); filter: blur(0); opacity: 1; }
      }
      #enemy-card .combatant__portrait {
        cursor: pointer;
      }
      #enemy-card .combatant__portrait:hover .enemy-portrait,
      #enemy-card .combatant__portrait:hover #enemy-icon {
        filter: brightness(1.2);
      }
      .modal--enemy-lore {
        max-width: 440px;
        text-align: center;
      }
      .enemy-lore__name {
        font-family: var(--font-display-deco, var(--font-display));
        font-size: 24px;
        font-weight: 600;
        color: var(--ember, #d4af37);
        letter-spacing: 0.03em;
        margin: 0 0 18px;
      }
      .enemy-lore__name::after {
        content: "";
        display: block;
        width: 44px;
        height: 2px;
        margin: 10px auto 0;
        background: linear-gradient(90deg, transparent, var(--ember, #d4af37), transparent);
      }
      .enemy-lore__frame {
        width: 150px;
        height: 150px;
        margin: 0 auto 18px;
        border-radius: var(--radius-lg, 14px);
        background: radial-gradient(circle at 35% 30%, var(--bg-panel-raised, #2a2430), var(--bg-inset, #1a1620));
        border: 1px solid rgba(194,52,47,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 68px;
        box-shadow: inset 0 0 18px rgba(0,0,0,0.6), 0 0 26px rgba(194,52,47,0.35);
      }
      .enemy-lore__frame .enemy-portrait {
        width: 128px;
        height: 128px;
        border-radius: calc(var(--radius-lg, 14px) - 4px);
        filter: drop-shadow(0 0 3px #8b0000) drop-shadow(0 0 6px rgba(139,0,0,0.4));
      }
      .enemy-lore__label {
        font-family: var(--font-display, inherit);
        font-size: 0.75rem;
        font-weight: 600;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--text-faint, #888);
        text-align: center;
        margin: 0 0 6px;
      }
      .enemy-lore__text {
        font-size: 0.85rem;
        line-height: 1.5;
        color: var(--text-muted, #aaa);
        text-align: center;
      }
      .enemy-lore__race {
        display: block;
        margin: 14px auto 0;
        padding: 6px 14px;
        border-radius: 8px;
        border: 1px solid rgba(212,175,55,.4);
        background: rgba(212,175,55,.08);
        color: #d4af37;
        font-size: 0.75rem;
        cursor: pointer;
        transition: background .15s, border-color .15s;
      }
      .enemy-lore__race:hover {
        background: rgba(212,175,55,.18);
        border-color: rgba(212,175,55,.6);
      }
    `;
    document.head.appendChild(style);
  }

  renderAll() {
    this.renderPlayer();
    if (this.state.phase === "floor-event") {
      this.renderEvent();
    } else {
      this.renderEnemy();
    }
    this.els.depth.textContent = this.state.depth;
    this._renderFloorCounter();
  }

  _renderFloorCounter() {
    const { floorTotal, floorIndex } = this.state;
    const text = floorTotal > 1 ? `${floorIndex + 1} / ${floorTotal}` : "";
    [this.els.enemyCounter, this.els.eventCounter].forEach((el) => {
      if (!el) return;
      el.classList.toggle("is-hidden", floorTotal <= 1);
      el.textContent = text;
    });
  }

  // ----------------------------------------------------------
  // переключение карточки враг / событие
  // ----------------------------------------------------------

  showEnemyCard() {
    this.els.enemyCard.classList.remove("is-hidden");
    this.els.eventCard.classList.add("is-hidden");
    this.els.btnAttack.classList.remove("is-hidden");
    this.els.btnFlee.classList.remove("is-hidden");
    this.els.btnInteract.classList.add("is-hidden");
    this._closeWoundedTravelerChoices(true);
    this._setFleeLabel("Бежать");
  }

  showEventCard(event) {
    this.els.enemyCard.classList.add("is-hidden");
    this.els.eventCard.classList.remove("is-hidden");
    this.els.btnAttack.classList.add("is-hidden");
    this.els.btnFlee.classList.remove("is-hidden");
    this.els.btnInteract.classList.remove("is-hidden");
    this._setFleeLabel("Пройти мимо");
    this._interactRevealed = false;
    this._closeWoundedTravelerChoices(true);
    this._setInteractLabel("Взаимодействовать");
    this.renderEvent(event);
  }

  _setFleeLabel(text) {
    const label = this.els.btnFlee.querySelector(".action-btn__label");
    if (label) label.textContent = text;
  }

  _setInteractLabel(text) {
    const label = this.els.btnInteract.querySelector(".action-btn__label");
    if (label) label.textContent = text;
  }

  /** Текст цены для событий с явной ценой взаимодействия, иначе null. */
  _interactCostLabel(event) {
    if (!event) return null;
    switch (event.kind) {
      case "goblin-priest":
      case "goblin-elder":
      case "penitent-font":
        return `Дать ${event.goldCost} 💰 золота`;
      default:
        return null;
    }
  }

  /**
   * Обрабатывает клик по "Взаимодействовать". У Раненого путника вместо
   * резолва разворачивается веер кнопок-вариантов оплаты прямо на месте
   * кнопки (см. _renderWoundedTravelerChoices) — сам клик по варианту
   * резолвит событие через шину, а не через floorEventManager.resolve().
   * Для событий с фиксированной ценой (жрец, старейшина, купель) первый
   * клик просто показывает цену. Всё остальное резолвится сразу.
   */
  handleInteractClick(event) {
    if (event && event.kind === "wounded-traveler" && !event.resolved) {
      this._renderWoundedTravelerChoices(event);
      return false;
    }

    const costLabel = this._interactCostLabel(event);
    if (costLabel && !this._interactRevealed) {
      this._interactRevealed = true;
      this._setInteractLabel(costLabel);
      return false;
    }
    return true;
  }

  /** Разворачивает на месте кнопки "Взаимодействовать" веер вариантов оплаты. */
  _renderWoundedTravelerChoices(event) {
    if (this._interactChoicesOpen) return;
    this._interactChoicesOpen = true;

    const player = this.state.player;
    const options = (event.costOptions || []).filter(
      (o) => (player.inventory[o.itemId] || 0) >= o.count
    );

    this.els.btnInteract.classList.add("is-hidden");

    const group = document.createElement("div");
    group.className = "interact-choices";
    group.id = "interact-choices";

    if (options.length === 0) {
      const empty = document.createElement("div");
      empty.className = "interact-choices__empty";
      empty.textContent = "Нечем перевязать рану путника";
      group.appendChild(empty);
      this.els.btnInteract.insertAdjacentElement("afterend", group);
      setTimeout(() => {
        this._closeWoundedTravelerChoices();
        this.els.btnInteract.classList.remove("is-hidden");
      }, 1400);
      return;
    }

    options.forEach((option, i) => {
      const btn = document.createElement("button");
      btn.className = "action-btn action-btn--interact-choice";
      btn.style.setProperty("--choice-delay", `${i * 60}ms`);
      btn.innerHTML = `
        <span class="action-btn__icon">${option.icon}</span>
        <span class="action-btn__label">Дать ${option.label}</span>
      `;
      btn.addEventListener("click", () => {
        this._closeWoundedTravelerChoices();
        bus.emit("floorEvent:wounded-traveler-choice", { itemId: option.itemId });
      });
      group.appendChild(btn);
    });

    this.els.btnInteract.insertAdjacentElement("afterend", group);
    requestAnimationFrame(() => group.classList.add("is-open"));
  }

  /** Убирает веер вариантов путника. instant=true — без анимации (смена карточки). */
  _closeWoundedTravelerChoices(instant = false) {
    const group = document.getElementById("interact-choices");
    this._interactChoicesOpen = false;
    if (!group) return;
    if (instant) {
      group.remove();
      return;
    }
    group.classList.remove("is-open");
    group.addEventListener("transitionend", () => group.remove(), { once: true });
    setTimeout(() => group.remove(), 400); // страховка, если transitionend не сработал
  }

  /** Стили для веера кнопок-вариантов у Раненого путника. */
  _injectWoundedTravelerChoiceStyles() {
    if (document.getElementById("wounded-traveler-choice-styles")) return;
    const style = document.createElement("style");
    style.id = "wounded-traveler-choice-styles";
    style.textContent = `
      .interact-choices { display: contents; }
      .action-btn--interact-choice {
        opacity: 0;
        transform: translateY(10px) scale(0.92);
        transition: opacity 0.28s ease, transform 0.28s cubic-bezier(.2,.8,.3,1);
        transition-delay: var(--choice-delay, 0ms);
      }
      .interact-choices.is-open .action-btn--interact-choice {
        opacity: 1;
        transform: translateY(0) scale(1);
      }
      .interact-choices__empty {
        font-size: 12px;
        color: var(--text-faint);
        padding: 8px 14px;
        opacity: 0;
        animation: interactChoiceFade 0.25s ease forwards;
      }
      @keyframes interactChoiceFade {
        from { opacity: 0; transform: translateY(6px); }
        to { opacity: 1; transform: translateY(0); }
      }
    `;
    document.head.appendChild(style);
  }

  renderEvent(event) {
    const e = event || this.state.floorEvent;
    if (!e) return;
    this.els.eventIcon.innerHTML = renderIcon(e.icon);
    this.els.eventName.textContent = e.name;
    this.els.eventDesc.textContent = e.description || "";
  }

  setInteractEnabled(enabled) {
    if (this.els.btnInteract) this.els.btnInteract.disabled = !enabled;
  }

  /** Точка привязки анимации относительно fx-слоя (в долях ширины/высоты anchorEl). */
  _fxAnchorPoint(anchorEl, xRatio = 0.5, yRatio = 0.5) {
    const layer = this.els.fxLayer;
    const anchorRect = anchorEl.getBoundingClientRect();
    const layerRect = layer.getBoundingClientRect();
    return {
      x: anchorRect.left - layerRect.left + anchorRect.width * xRatio,
      y: anchorRect.top - layerRect.top + anchorRect.height * yRatio,
    };
  }

  spawnBandageFall(anchorEl) {
    const { x: cx, y: cy } = this._fxAnchorPoint(anchorEl, 0.5, 0.35);

    const img = document.createElement("img");
    img.src = "img/items/bandage.png";
    img.className = "fx-bandage-fall";
    img.style.left = `${cx}px`;
    img.style.top = `${cy}px`;
    img.style.marginLeft = "-23px";
    img.style.marginTop = "-23px";

    this.els.fxLayer.appendChild(img);
    img.addEventListener("animationend", () => img.remove());
  }
  spawnLootFall(anchorEl, drops) {
    drops.forEach((drop, i) => {
      setTimeout(() => this._spawnItemFall(anchorEl, drop.icon), i * 140);
    });
  }

  _spawnItemFall(anchorEl, iconSrc) {
    const { x: cx, y: cy } = this._fxAnchorPoint(anchorEl, 0.35 + Math.random() * 0.3, 0.35);

    const img = document.createElement("img");
    img.src = iconSrc;
    img.className = "fx-item-fall";
    img.style.left = `${cx}px`;
    img.style.top = `${cy}px`;
    img.style.marginLeft = "-20px";
    img.style.marginTop = "-20px";

    this.els.fxLayer.appendChild(img);
    img.addEventListener("animationend", () => img.remove());
  }

  renderPlayer() {
    const p = this.state.player;
    this.els.playerName.textContent = p.name;
    this.els.playerLevel.textContent = p.level;

    this.els.playerHPFill.style.width = `${(p.currentHP / p.maxHP) * 100}%`;
    this.els.playerHPCurrent.textContent = p.currentHP;
    this.els.playerHPMax.textContent = p.maxHP;

    this.els.playerXPFill.style.width = `${(p.xp / p.xpToNext) * 100}%`;
    this.els.playerXPCurrent.textContent = p.xp;
    this.els.playerXPMax.textContent = p.xpToNext;

    this.els.playerStoicism.textContent = p.stoicism;
    this.els.playerStrength.textContent = p.strength;
    this.els.gold.textContent = p.gold;

    if (this.els.playerArmor) this.els.playerArmor.textContent = p.armor;
    if (this.els.playerAgility) this.els.playerAgility.textContent = p.agility;

    this.els.playerCard.classList.toggle("combatant--poisoned", p.poisonTicksLeft > 0);
  }

  renderEnemy() {
    const e = this.state.enemy;
    if (!e) return;
    if (e.icon && e.icon.includes(".png")) {
      this.els.enemyIcon.innerHTML = `<img src="${e.icon}" class="enemy-portrait" alt="${e.name}" loading="lazy">`;
    } else {
      this.els.enemyIcon.textContent = e.icon;
    }
    this.els.enemyName.textContent = e.name;
    this.els.enemyLevel.textContent = e.level;

    this.els.enemyHPFill.style.width = `${(e.currentHP / e.maxHP) * 100}%`;
    this.els.enemyHPCurrent.textContent = e.currentHP;
    this.els.enemyHPMax.textContent = e.maxHP;
    this.els.enemyDamage.textContent = e.damage;
    if (this.els.enemyAgility) this.els.enemyAgility.textContent = e.agility;

    this.els.enemyCard.classList.remove("combatant--dying");
    this.els.enemyCard.classList.toggle("combatant--poisoned", e.poisonTicksLeft > 0);
    this._updateEnemyDangerTint(e.currentHP, e.maxHP);
  }

  _updateEnemyDangerTint(currentHP, maxHP) {
    const pct = maxHP > 0 ? currentHP / maxHP : 1;
    // Ниже 50% HP карточка начинает краснеть, к 1 HP — максимально красная.
    const intensity = pct >= 0.5 ? 0 : Math.min(1, (0.5 - pct) / 0.5);
    this.els.enemyCard.style.setProperty("--danger-intensity", intensity.toFixed(2));
  }

  onEnemyDamaged({ amount, isCrit, poison }) {
    this.renderEnemy();
    this._flashHit("enemy");
    if (!poison) this._spawnHitSlash(this.els.enemyCard, isCrit);
    this._spawnFloatingText(this.els.enemyCard, `-${amount}`, poison ? "poison" : (isCrit ? "crit" : "damage"));
  }

  onEnemyDied() {
    this.els.enemyCard.classList.add("combatant--dying");
  }

  onEnemyHealed({ amount }) {
    this.renderEnemy();
    if (amount > 0) this._spawnFloatingText(this.els.enemyCard, `+${amount}`, "heal");
  }

  onEnemyDodged() {
    this._flashDodge("enemy");
    this._spawnFloatingText(this.els.enemyCard, "MISS", "miss");
  }

  onEnemyParried() {
    this._flashHit("enemy");
    this._spawnHitSlash(this.els.enemyCard, false);
    this._spawnFloatingText(this.els.enemyCard, "PARRIED", "parry");
  }

  _flashHit(who) {
    const card = who === "player" ? this.els.playerCard : this.els.enemyCard;
    card.classList.remove("combatant--hit");
    void card.offsetWidth;
    card.classList.add("combatant--hit");
  }

  _flashDodge(who) {
    const card = who === "player" ? this.els.playerCard : this.els.enemyCard;
    card.classList.remove("combatant--dodge");
    void card.offsetWidth;
    card.classList.add("combatant--dodge");
  }

  onPlayerDamaged({ amount, blocked, poison }) {
    this.renderPlayer();
    this._flashHit("player");
    if (!poison) this._spawnHitSlash(this.els.playerCard, false);
    this._spawnFloatingText(this.els.playerCard, `-${amount}`, poison ? "poison" : "damage");
    if (blocked > 0) {
      this._spawnFloatingText(this.els.playerCard, `🛡️ -${blocked}`, "heal");
    }
  }

  onPlayerDodged() {
    this._flashDodge("player");
    this._spawnFloatingText(this.els.playerCard, "MISS", "miss");
  }

  onPlayerParried() {
    this._flashHit("player");
    this._spawnHitSlash(this.els.playerCard, false);
    this._spawnFloatingText(this.els.playerCard, "PARRIED", "parry");
  }

  onPlayerHealed({ amount }) {
    this.renderPlayer();
    if (amount > 0) this._spawnFloatingText(this.els.playerCard, `+${amount}`, "heal");
  }

  onPlayerXP({ amount }) {
    this.renderPlayer();
    this._spawnFloatingText(this.els.playerCard, `+${amount} опыта`, "xp");
  }
  _spawnHitSlash(anchorEl, isCrit = false) {
    const { x: cx, y: cy } = this._fxAnchorPoint(anchorEl, 0.5, 0.5);

    const src = ATTACK_SLASHES[Math.floor(Math.random() * ATTACK_SLASHES.length)];
    const img = document.createElement("img");
    img.src = src;
    img.className = `hit-slash${isCrit ? " hit-slash--crit" : ""}`;

    const rot = Math.random() * 60 - 30; // случайный наклон -30..30deg
    img.style.setProperty("--slash-rot", `${rot}deg`);

    img.style.left = `${cx}px`;
    img.style.top = `${cy}px`;
    img.style.marginLeft = `-${isCrit ? 95 : 70}px`;
    img.style.marginTop = `-${isCrit ? 95 : 70}px`;

    // случайно отражаем по горизонтали для разнообразия
    if (Math.random() < 0.5) {
      img.style.transform += " scaleX(-1)";
    }

    this.els.fxLayer.appendChild(img);
    img.addEventListener("animationend", () => img.remove());
  }
  _spawnFloatingText(anchorEl, text, variant) {
    const { x, y } = this._fxAnchorPoint(anchorEl, 0.5, 0.25);

    const node = document.createElement("div");
    node.className = `fx-text fx-text--${variant}`;
    node.textContent = text;
    node.style.left = `${x + (Math.random() * 30 - 15)}px`;
    node.style.top = `${y}px`;

    this.els.fxLayer.appendChild(node);
    node.addEventListener("animationend", () => node.remove());
  }

  appendLog({ text, type }) {
    const line = document.createElement("div");
    line.className = `log__line log__line--${type}`;
    const time = new Date().toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
    line.innerHTML = `<span>${time}</span>${text}`;
    this.els.logBody.prepend(line);

    while (this.els.logBody.children.length > 60) {
      this.els.logBody.removeChild(this.els.logBody.lastChild);
    }
  }

  setButtonsEnabled(enabled) {
    this.els.btnAttack.disabled = !enabled;
    this.els.btnFlee.disabled = !enabled;
  }

  showContinueButton(show) {
    const isEvent = this.state.phase === "floor-event";
    this.els.btnAttack.classList.toggle("is-hidden", show || isEvent);
    this.els.btnFlee.classList.toggle("is-hidden", show);
    this.els.btnInteract.classList.toggle("is-hidden", show || this.state.phase !== "floor-event");
    this.els.btnShop.classList.toggle("is-hidden", !show);
    this.els.btnWorkbench.classList.toggle("is-hidden", !show);
    this.els.btnDescend.classList.toggle("is-hidden", !show);
    if (this.els.btnRest) this.els.btnRest.classList.toggle("is-hidden", !show);
  }

  /** Кнопка отдыха недоступна (не заблокирована, а просто неактивна), если лечить нечего. */
  setRestEnabled(enabled) {
    if (this.els.btnRest) this.els.btnRest.disabled = !enabled;
  }

  /**
   * Экран укрытия при побеге: атака и обычные кнопки зачищенного этажа
   * (лавка/крафт/спуск) скрыты, видны только "Привал" и кнопка побега,
   * временно переименованная в "Идти дальше" (чтобы уйти из укрытия).
   */
  showHideoutButtons(show) {
    const btnFlee = this.els.btnFlee;
    if (btnFlee) {
      if (show) {
        if (btnFlee.dataset.originalLabel === undefined) {
          btnFlee.dataset.originalLabel = btnFlee.textContent;
        }
        btnFlee.textContent = "Идти дальше";
        btnFlee.classList.remove("is-hidden");
        btnFlee.disabled = false;
      } else if (btnFlee.dataset.originalLabel !== undefined) {
        btnFlee.textContent = btnFlee.dataset.originalLabel;
      }
    }

    this.els.btnAttack.classList.toggle("is-hidden", show);
    this.els.btnInteract.classList.add("is-hidden");
    this.els.btnShop.classList.add("is-hidden");
    this.els.btnWorkbench.classList.add("is-hidden");
    this.els.btnDescend.classList.add("is-hidden");
    if (this.els.btnRest) this.els.btnRest.classList.toggle("is-hidden", !show);

    // Экран укрытия: карточка врага и разделитель "VS" скрываются, карточка
    // игрока растягивается на всю ширину арены и плавно всплывает по центру
    // (см. .arena--hideout в arena.css). Заново запускаем CSS-анимацию
    // появления при каждом входе в укрытие, убирая и возвращая класс через
    // reflow — иначе повторный вход (после выхода и нового побега) не
    // переиграет keyframe-анимацию у уже существующего элемента.
    if (this.els.arena) {
      if (show) {
        this.els.arena.classList.remove("arena--hideout");
        // eslint-disable-next-line no-unused-expressions
        this.els.arena.offsetHeight; // форсируем reflow, чтобы animation запустилась заново
        this.els.arena.classList.add("arena--hideout");
      } else {
        this.els.arena.classList.remove("arena--hideout");
      }
    }
  }

  showLevelUpModal() { this.els.levelupOverlay.classList.remove("is-hidden"); }
  hideLevelUpModal() { this.els.levelupOverlay.classList.add("is-hidden"); }

  showGameOver(depth) {
    this.els.gameoverDepth.textContent = depth;
    this.els.gameoverOverlay.classList.remove("is-hidden");
  }
  hideGameOver() { this.els.gameoverOverlay.classList.add("is-hidden"); }
}