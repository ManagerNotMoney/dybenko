// ui/character-view.js
// ============================================================
// Модалка персонажа: экипировка (paperdoll), части тела
// (силуэт + лечение) и рюкзак.
// ============================================================
import { bus } from "../engine.js";
import { getEquipmentById } from "../equipment.js";
import { getConsumableById } from "../data/consumables.js";
import { renderIcon, renderItemIcon, isImagePath } from "./icon.js";

// Иконки/суффиксы бонусов экипировки — общие для карточки инвентаря и панели слота.
const STAT_ICONS = { damage: "img/stat/damage.png", armor: "img/stat/armor.png", maxHP: "img/stat/health.png", agility: "img/stat/agility.png", dodgeChance: "💨", goldFind: "img\items\gold.png", critChance: "🎯" };
/** Держим синхронно с SALVAGE_RECIPES в player.js — только для подписи на кнопке. */
const SALVAGE_RECIPES = {
  shirt: { itemId: "cotton", count: 4 },
  "torn-pants": { itemId: "cotton", count: 3 },
  "cloth-wraps": { itemId: "cotton", count: 2 },
};
const STAT_SUFFIX = { dodgeChance: "%", goldFind: "%", critChance: "%" };

export class CharacterView {
  constructor(state, els) {
    this.state = state;
    this.els = els;
    this.selectedBodyPart = null;
    this.healMenuPart = null;
    this.pendingHealItem = null;
    this.selectedEquipSlot = null;
    this._pendingPotionHealPartId = null; // ждём подтверждения, чтобы анимация сыграла на нужной части тела
    this._injectHotspotIconStyles();

    // Анимация заживления — только когда лечение пришло именно от вылитого
    // на рану зелья (не от тика бинта каждый ход), чтобы не спамить эффектом.
    bus.on("player:body-part-healed", ({ partId, amount }) => {
      if (this._pendingPotionHealPartId !== partId) return;
      this._pendingPotionHealPartId = null;
      if (amount > 0) this._playHealAnimation(partId, amount);
    });

    this.els.bodyHotspots = Array.from(document.querySelectorAll(".body-hotspot"));

    this.els.bodyHotspots.forEach((hotspot) => {
      hotspot.addEventListener("click", () => {
        this.selectedBodyPart = hotspot.dataset.part;

        if (this.pendingHealItem) {
          const itemId = this.pendingHealItem;
          const consumable = getConsumableById(itemId);
          if (consumable?.bandage) {
            this.state.player.applyBandage(itemId, this.selectedBodyPart);
          } else {
            this._pendingPotionHealPartId = this.selectedBodyPart;
            this.state.player.useConsumableOnBodyPart(itemId, this.selectedBodyPart);
          }
          this.pendingHealItem = null;
          this.healMenuPart = null;
          this.renderBodyParts();
          this.renderInventory();
          return;
        }

        this.healMenuPart = null;
        this.renderBodyParts();
      });

      hotspot.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        const partId = hotspot.dataset.part;
        this.selectedBodyPart = partId;

        // На тач-устройствах (нет мыши) оставляем старое поведение — инлайн-меню
        // лечения прямо в панели #bodypart-detail, как было раньше.
        const isCoarsePointer = window.matchMedia("(pointer: coarse)").matches;
        if (isCoarsePointer) {
          this.healMenuPart = partId;
          this.renderBodyParts();
          return;
        }

        // На десктопе (мышь) — плавающее контекстное меню рядом с курсором,
        // в духе Project Zomboid.
        this.renderBodyParts(); // подсветить выбранную часть в силуэте и в панели
        this._showBodyPartContextMenu(partId, event.clientX, event.clientY);
      });
    });

    this.els.bodypartDetail.addEventListener("click", (event) => {
      const healBtn = event.target.closest(".bodypart-heal-menu__item");
      if (healBtn && this.healMenuPart) {
        const consumable = getConsumableById(healBtn.dataset.item);
        if (consumable?.bandage) {
          this.state.player.applyBandage(healBtn.dataset.item, this.healMenuPart);
        } else {
          this._pendingPotionHealPartId = this.healMenuPart;
          this.state.player.useConsumableOnBodyPart(healBtn.dataset.item, this.healMenuPart);
        }
        this.healMenuPart = null;
        this.renderBodyParts();
        this.renderInventory();
        return;
      }

      const unbandageBtn = event.target.closest(".bodypart-unbandage-btn");
      if (unbandageBtn) {
        this.state.player.removeBandage(unbandageBtn.dataset.part);
        this.renderBodyParts();
        this.renderInventory();
      }
    });

    const statusList = document.getElementById("health-status-list");
    if (statusList) {
      statusList.addEventListener("click", (event) => {
        const row = event.target.closest(".health-status-row");
        if (!row) return;
        this.selectedBodyPart = row.dataset.part;
        this.healMenuPart = null;
        this.renderBodyParts();
      });
    }

    this.equipSlotEls = [
      { slot: "weapon", el: this.els.slotWeapon },
      { slot: "shield", el: this.els.slotShield },
      { slot: "helmet", el: this.els.slotHelmet },
      { slot: "chestplate", el: this.els.slotChestplate },
      { slot: "greaves", el: this.els.slotGreaves },
      { slot: "boots", el: this.els.slotBoots },
    ];
    this.equipSlotEls.forEach(({ slot, el }) => {
      el.addEventListener("click", () => {
        this.selectedEquipSlot = slot;
        this.renderEquipDetail();
      });
    });

    this.els.equipDetail.addEventListener("click", (event) => {
      const unequipBtn = event.target.closest(".equip-unequip-btn");
      if (unequipBtn) {
        this.state.player.unequipSlot(unequipBtn.dataset.slot);
        this.renderEquipDetail();
      }
    });
  }

  showHealth() {
    this._resetBodyPartSelection();
    this.renderCharStats();
    this.renderBodyParts();
    this.els.healthOverlay.classList.remove("is-hidden");
  }

  hideHealth() {
    this.els.healthOverlay.classList.add("is-hidden");
    this._resetBodyPartSelection();
    this.pendingHealItem = null;
  }

  showInventory() {
    this.renderInventory();
    this.renderEquipDetail();
    this.els.inventoryOverlay.classList.remove("is-hidden");
  }

  hideInventory() {
    this.els.inventoryOverlay.classList.add("is-hidden");
    this.selectedEquipSlot = null;
    this.renderEquipDetail();
  }

  renderCharStats() {
    const p = this.state.player;
    if (!p) return;
    const get = (id) => document.getElementById(id);
    const weaponBonus = p.equipmentBonuses.damage || 0;
    const isDagger = p.equippedWeaponForm === "dagger";
    const baseDmg = isDagger
      ? 4 + p.strength + p.agility + weaponBonus
      : 4 + p.strength * 2 + weaponBonus;
    if (get("cs-hp"))       get("cs-hp").textContent       = `${p.currentHP} / ${p.maxHP}`;
    if (get("cs-dmg"))      get("cs-dmg").textContent      = `${baseDmg}`;
    if (get("cs-armor"))    get("cs-armor").textContent    = `${p.armor}`;
    if (get("cs-stoicism")) get("cs-stoicism").textContent = `${p.stoicism}`;
    if (get("cs-strength")) get("cs-strength").textContent = `${p.strength}`;
    if (get("cs-agility"))  get("cs-agility").textContent  = `${p.agility}`;

    const hpFill = get("health-hp-fill");
    if (hpFill) hpFill.style.width = `${Math.max(0, Math.min(100, (p.currentHP / p.maxHP) * 100))}%`;
    if (get("health-hp-current")) get("health-hp-current").textContent = p.currentHP;
    if (get("health-hp-max"))     get("health-hp-max").textContent     = p.maxHP;
  }

  _resetBodyPartSelection() {
    this.selectedBodyPart = null;
    this.healMenuPart = null;
    this.selectedEquipSlot = null;
    this._closeContextMenu();
  }

  renderEquipDetail() {
    const detail = this.els.equipDetail;
    if (!detail) return;
    const player = this.state.player;
    const slot = this.selectedEquipSlot;

    this.equipSlotEls.forEach(({ slot: s, el }) => {
      el.classList.toggle("is-selected", s === slot);
    });

    if (!slot) {
      detail.innerHTML = `<p class="bodypart-detail__hint">Нажми на слот, чтобы увидеть надетый предмет.</p>`;
      return;
    }

    const itemId = player.equipped[slot];
    const item = itemId ? getEquipmentById(itemId) : null;

    if (!item) {
      detail.innerHTML = `<p class="bodypart-detail__hint">Слот пуст.</p>`;
      return;
    }

    const bonusHTML = Object.entries(item.bonus || {})
      .map(([key, val]) => `<span class="inv-card__bonus">${renderIcon(STAT_ICONS[key] || "✨")} ${val > 0 ? "+" : ""}${val}${STAT_SUFFIX[key] || ""}</span>`)
      .join(" ");

    detail.innerHTML = `
      <div class="bodypart-detail__name">
        <span>${renderItemIcon(item, "equipment")} ${item.name}</span>
      </div>
      ${bonusHTML ? `<div class="bodypart-detail__severity">${bonusHTML}</div>` : ""}
      ${item.description ? `<p class="bodypart-detail__hint">${item.description}</p>` : ""}
      <div class="bodypart-detail__bandage">
        🎽 Надето
        <button class="equip-unequip-btn bodypart-unbandage-btn" data-slot="${slot}">Снять</button>
      </div>
    `;
  }

  isBodyPartsPanelVisible() {
    return !this.els.healthOverlay.classList.contains("is-hidden");
  }

  /**
   * Плавающее контекстное меню части тела (десктоп, ПКМ) — в духе Project Zomboid.
   * Отдельно перечисляет каждый вид бинта (обычный/травяной) и каждое подходящее
   * зелье, вместо общей кнопки "Забинтовать".
   */
  _showBodyPartContextMenu(partId, clientX, clientY) {
    this._closeContextMenu();
    this._injectContextMenuStyles();

    const player = this.state.player;
    const part = player.bodyPartsStatus.find((p) => p.id === partId);
    if (!part) return;

    const isBandaged = Boolean(player.bandagedParts[partId]);
    const isFullyHealthy = part.pct >= 1;

    const bandageEntries = Object.entries(player.inventory)
      .map(([itemId, count]) => ({ itemId, count, consumable: getConsumableById(itemId) }))
      .filter((e) => e.consumable?.bandage && e.count > 0);

    const potionEntries = Object.entries(player.inventory)
      .map(([itemId, count]) => ({ itemId, count, consumable: getConsumableById(itemId) }))
      .filter((e) => e.consumable && e.consumable.healAmount > 0 && !e.consumable.bandage && e.count > 0);

    const items = [];

    if (isBandaged) {
      items.push({ label: "🩹 Снять бинт", action: "unbandage" });
    } else if (isFullyHealthy) {
      items.push({ label: "✅ Часть тела здорова", disabled: true });
    } else {
      bandageEntries.forEach(({ itemId, count, consumable }) => {
        items.push({
          label: `${renderIcon(consumable.icon)} Наложить: ${consumable.name} ×${count}`,
          action: "bandage",
          itemId,
        });
      });
      potionEntries.forEach(({ itemId, count, consumable }) => {
        items.push({
          label: `${renderIcon(consumable.icon)} Вылить: ${consumable.name} ×${count}`,
          action: "potion",
          itemId,
        });
      });
      if (bandageEntries.length === 0 && potionEntries.length === 0) {
        items.push({ label: "Нет подходящих зелий или бинтов", disabled: true });
      }
    }

    const menu = document.createElement("div");
    menu.className = "body-context-menu";
    menu.innerHTML = `
      <div class="body-context-menu__title">${renderIcon(part.icon)} ${part.name} — ${part.label}</div>
      ${items.map((it, idx) => `
        <button class="body-context-menu__item${it.disabled ? " is-disabled" : ""}"
                data-idx="${idx}" ${it.disabled ? "disabled" : ""}>
          ${it.label}
        </button>
      `).join("")}
    `;

    document.body.appendChild(menu);

    // Позиционирование рядом с курсором, с учётом границ окна.
    const rect = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(clientX, window.innerWidth - rect.width - 8));
    const top = Math.max(8, Math.min(clientY, window.innerHeight - rect.height - 8));
    menu.style.left = `${left}px`;
    menu.style.top = `${top}px`;

    menu.addEventListener("click", (event) => {
      const btn = event.target.closest(".body-context-menu__item");
      if (!btn || btn.disabled) return;
      const item = items[Number(btn.dataset.idx)];
      if (!item) return;

      if (item.action === "unbandage") {
        player.removeBandage(partId);
      } else if (item.action === "bandage") {
        player.applyBandage(item.itemId, partId);
      } else if (item.action === "potion") {
        this._pendingPotionHealPartId = partId;
        player.useConsumableOnBodyPart(item.itemId, partId);
      }

      this._closeContextMenu();
      this.renderBodyParts();
      this.renderInventory();
    });

    this._activeContextMenu = menu;

    // Закрыть меню кликом вне его, повторным ПКМ где угодно, или по Escape.
    const closeHandler = (event) => {
      if (menu.contains(event.target)) return;
      this._closeContextMenu();
    };
    const escHandler = (event) => {
      if (event.key === "Escape") this._closeContextMenu();
    };
    // setTimeout(0) — чтобы этот же contextmenu-клик не закрыл меню мгновенно.
    setTimeout(() => {
      document.addEventListener("click", closeHandler);
      document.addEventListener("contextmenu", closeHandler);
      document.addEventListener("keydown", escHandler);
    }, 0);

    this._contextMenuCleanup = () => {
      document.removeEventListener("click", closeHandler);
      document.removeEventListener("contextmenu", closeHandler);
      document.removeEventListener("keydown", escHandler);
    };
  }

  _closeContextMenu() {
    if (this._contextMenuCleanup) {
      this._contextMenuCleanup();
      this._contextMenuCleanup = null;
    }
    if (this._activeContextMenu) {
      this._activeContextMenu.remove();
      this._activeContextMenu = null;
    }
  }

  _injectContextMenuStyles() {
    if (document.getElementById("body-context-menu-styles")) return;
    const style = document.createElement("style");
    style.id = "body-context-menu-styles";
    style.textContent = `
      .body-context-menu {
        position: fixed;
        z-index: 999;
        min-width: 220px;
        max-width: 280px;
        background: linear-gradient(180deg, rgba(30,26,22,.98), rgba(18,15,12,.98));
        border: 1px solid rgba(212,175,55,.35);
        border-radius: 8px;
        box-shadow: 0 8px 24px rgba(0,0,0,.55);
        padding: 6px;
        display: flex;
        flex-direction: column;
        gap: 2px;
        font-size: 0.78rem;
      }
      .body-context-menu__title {
        padding: 6px 8px 8px;
        font-weight: 600;
        color: #d4af37;
        border-bottom: 1px solid rgba(255,255,255,.08);
        margin-bottom: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .body-context-menu__item {
        display: block;
        width: 100%;
        text-align: left;
        padding: 7px 8px;
        border: none;
        border-radius: 5px;
        background: transparent;
        color: inherit;
        cursor: pointer;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .body-context-menu__item:hover:not(:disabled) {
        background: rgba(212,175,55,.16);
      }
      .body-context-menu__item.is-disabled,
      .body-context-menu__item:disabled {
        opacity: .5;
        cursor: not-allowed;
      }
    `;
    document.head.appendChild(style);
  }

  renderBodyParts() {
    const player = this.state.player;
    if (!player) return;

    const statuses = player.bodyPartsStatus;
    const byId = Object.fromEntries(statuses.map((p) => [p.id, p]));

    this.els.bodyHotspots.forEach((hotspot) => {
      const part = byId[hotspot.dataset.part];
      if (!part) return;
      hotspot.className = `body-hotspot bp-${part.key}`;
      hotspot.classList.toggle("is-selected", this.selectedBodyPart === part.id);
      hotspot.classList.toggle("is-bandaged", Boolean(player.bandagedParts[part.id]));
      hotspot.style.display = part.key === "healthy" ? "none" : "flex";
      hotspot.title = `${part.name}: ${part.label} (${part.currentHP}/${part.maxHP})`;
      hotspot.innerHTML = part.icon ? renderIcon(part.icon) : "";
    });

    this._renderHealthStatusList(statuses);

    const detail = this.els.bodypartDetail;
    const selected = this.selectedBodyPart ? byId[this.selectedBodyPart] : null;

    if (!selected) {
      detail.innerHTML = `<p class="bodypart-detail__hint">ЛКМ — посмотреть состояние. ПКМ — вылечить.</p>`;
      return;
    }

    let healMenuHTML = "";
    if (this.healMenuPart === selected.id) {
      const usable = Object.entries(player.inventory)
        .map(([itemId, count]) => ({ itemId, count, consumable: getConsumableById(itemId) }))
        .filter((e) => e.consumable && (e.consumable.healAmount > 0 || e.consumable.bandage));

      healMenuHTML = usable.length === 0
        ? `<div class="bodypart-heal-menu"><p class="bodypart-heal-menu__empty">Нет подходящих зелий или бинтов в рюкзаке.</p></div>`
        : `<div class="bodypart-heal-menu">
            <p class="bodypart-heal-menu__title">Применить лечение:</p>
            ${usable.map(({ itemId, count, consumable }) => `
              <button class="bodypart-heal-menu__item" data-item="${itemId}">
                <span>${renderIcon(consumable.icon)} ${consumable.bandage ? "Забинтовать" : consumable.name}</span>
                <span class="bodypart-heal-menu__count">x${count}</span>
              </button>
            `).join("")}
          </div>`;
    }
    const isBandaged = Boolean(player.bandagedParts[selected.id]);

    detail.innerHTML = `
      <div class="bodypart-detail__name">
        <span>${renderIcon(selected.icon)} ${selected.name}</span>
        <span class="bodypart-detail__hp">${selected.currentHP} / ${selected.maxHP}</span>
      </div>
      <div class="bodypart-detail__bar">
        <div class="bodypart-detail__bar-fill bp-${selected.key}" style="width: ${Math.max(0, selected.pct * 100)}%"></div>
      </div>
      <div class="bodypart-detail__severity bp-${selected.key}">${selected.label}</div>
      ${isBandaged ? `
        <div class="bodypart-detail__bandage">
          🩹 Забинтовано
          <button class="bodypart-unbandage-btn" data-part="${selected.id}">Снять</button>
        </div>
      ` : ""}
      ${healMenuHTML}
    `;
  }
  _renderHealthStatusList(statuses) {
    const list = document.getElementById("health-status-list");
    if (!list) return;
    const wounded = statuses.filter((p) => p.key !== "healthy");
    if (wounded.length === 0) {
      list.innerHTML = `<p class="health-status-list__empty">Все части тела здоровы.</p>`;
      return;
    }
    list.innerHTML = wounded.map((p) => `
      <button class="health-status-row bp-${p.key}" data-part="${p.id}">
        <span class="health-status-row__icon">${renderIcon(p.icon)}</span>
        <span class="health-status-row__name">${p.name}</span>
        <span class="health-status-row__label">${p.label}</span>
        <span class="health-status-row__hp">${p.currentHP}/${p.maxHP}</span>
      </button>
    `).join("");
  }
  renderInventory() {
    const player = this.state.player;
    if (!player) return;

    this._renderEquipSlot("weapon",     this.els.slotWeapon,     this.els.slotWeaponIcon,     this.els.slotWeaponName);
    this._renderEquipSlot("shield",     this.els.slotShield,     this.els.slotShieldIcon,     this.els.slotShieldName);
    this._updateOffhandLabel();
    this._renderEquipSlot("helmet",     this.els.slotHelmet,     this.els.slotHelmetIcon,     this.els.slotHelmetName);
    this._renderEquipSlot("chestplate", this.els.slotChestplate, this.els.slotChestplateIcon, this.els.slotChestplateName);
    this._renderEquipSlot("greaves",    this.els.slotGreaves,    this.els.slotGreavesIcon,    this.els.slotGreavesName);
    this._renderEquipSlot("boots",      this.els.slotBoots,      this.els.slotBootsIcon,      this.els.slotBootsName);

    const grid = this.els.inventoryGrid;
    grid.innerHTML = "";

    const ownedEntries = Object.entries(player.inventory)
      .filter(([itemId, count]) => {
        if (count <= 0) return false;
        const isEquipped = Object.values(player.equipped).includes(itemId);
        // Единственный экземпляр надет — прячем из рюкзака, он "на теле".
        // Если есть запасной (count >= 2), второй всё ещё показываем.
        if (isEquipped && count <= 1) return false;
        return true;
      });

    // Расходники — всегда выше, снаряжение — ниже, разделены полосой.
    // Внутри каждой группы избранное по-прежнему наверху (как раньше),
    // просто теперь оно не мешает зелья с бронёй в одну кучу.
    const byFavorite = ([aId], [bId]) => Number(player.isFavorite(bId)) - Number(player.isFavorite(aId));
    const consumableEntries = ownedEntries.filter(([itemId]) => !getEquipmentById(itemId)).sort(byFavorite);
    const equipmentEntries = ownedEntries.filter(([itemId]) => getEquipmentById(itemId)).sort(byFavorite);

    consumableEntries.forEach(([itemId, count]) => {
      const card = this._buildInvCard(itemId, count);
      if (card) grid.appendChild(card);
    });

    if (consumableEntries.length > 0 && equipmentEntries.length > 0) {
      const divider = document.createElement("div");
      divider.className = "inv-divider";
      divider.innerHTML = `<span class="inv-divider__label">🛡️ Снаряжение</span>`;
      grid.appendChild(divider);
    }

    equipmentEntries.forEach(([itemId, count]) => {
      const card = this._buildInvCard(itemId, count);
      if (card) grid.appendChild(card);
    });

    const visibleCount = consumableEntries.length + equipmentEntries.length;
    this.els.inventoryEmpty.classList.toggle("is-hidden", visibleCount > 0);

    grid.onclick = (e) => {
      const favBtn = e.target.closest(".inv-card__fav-btn");
      if (favBtn) {
        player.toggleFavorite(favBtn.dataset.itemId);
        this.renderInventory();
        return;
      }
      const drinkBtn = e.target.closest(".inv-btn-drink");
      if (drinkBtn) {
        player.useConsumable(drinkBtn.dataset.itemId);
        return;
      }
      const useBtn = e.target.closest(".inv-btn-use");
      if (useBtn && !useBtn.disabled) {
        const { itemId, kind } = useBtn.dataset;
        if (kind === "consumable") {
          const consumable = getConsumableById(itemId);

          if (consumable?.poison) {
            player.applyPoisonToWeapon(itemId);
            this.renderInventory();
            return;
          }

          const isWoundItem = consumable && (consumable.healAmount > 0 || consumable.bandage);
          const hasWounds = player.bodyPartsStatus.some((p) => p.key !== "healthy");

          if (isWoundItem && hasWounds) {
            this.pendingHealItem = itemId;
            this.hideInventory();
            this.showHealth();
          } else {
            player.useConsumable(itemId);
          }
        } else {
          player.equipItem(itemId);
        }
        return;
      }
      const sellBtn = e.target.closest(".inv-btn-sell");
      if (sellBtn) {
        player.sellItem(sellBtn.dataset.itemId);
        return;
      }
      const salvageBtn = e.target.closest(".inv-btn-salvage");
      if (salvageBtn) {
        player.salvageItem(salvageBtn.dataset.itemId);
        this.renderInventory();
        return;
      }
      const cleanBtn = e.target.closest(".inv-btn-clean");
      if (cleanBtn) {
        player.cleanBandage(cleanBtn.dataset.itemId);
        this.renderInventory();
      }
      const soakBtn = e.target.closest(".inv-btn-soak");
      if (soakBtn) {
        player.soakBandage(soakBtn.dataset.itemId, soakBtn.dataset.potionId);
        this.renderInventory();
      }
    };
  }

  /** Собрать DOM-карточку одного предмета рюкзака (используется renderInventory для обеих групп). */
  _buildInvCard(itemId, count) {
    const player = this.state.player;
    const equipment = getEquipmentById(itemId);
    const consumable = !equipment ? getConsumableById(itemId) : null;
    const item = equipment || consumable;
    if (!item) return null;

    const kind = equipment ? "equipment" : "consumable";
    const isEquipped = equipment && Object.values(player.equipped).includes(itemId);
    const isFavorite = player.isFavorite(itemId);
    const canSell = (!isEquipped || count >= 2) && !isFavorite;
    const sellPrice = Math.max(1, Math.floor((item.shopPrice || 10) / 2));

    let bonusHTML = "";
    if (equipment && item.bonus) {
      const daggerNote = item.formId === "dagger" ? " (+ловкость)" : "";
      bonusHTML = Object.entries(item.bonus)
        .map(([stat, val], idx) => `<span class="inv-card__bonus">${renderIcon(STAT_ICONS[stat] || "✨")} ${val > 0 ? "+" : ""}${val}${STAT_SUFFIX[stat] || ""}${idx === 0 ? daggerNote : ""}</span>`)
        .join(" ");
    }

    const isPotion = kind === "consumable" && consumable?.healAmount > 0 && !consumable?.bandage;
    const isPoison = kind === "consumable" && Boolean(consumable?.poison);
    const isDirtyBandage = itemId === "dirty-bandage";
    // Смочить можно только чистый бинт, и только если есть нужное зелье —
    // кнопку не блокируем, а полностью скрываем, если зелья нет в рюкзаке.
    const canSoakBandage = itemId === "bandage" && (player.inventory["health-potion"] || 0) > 0;
    const canSoakBandageBig = itemId === "bandage" && (player.inventory["big-health-potion"] || 0) > 0;

    const useLabel  = kind === "consumable"
      ? (consumable?.dirty ? "🧺 Нужно очистить" : consumable?.raw ? "⚒️ Сырьё (крафт)" : consumable?.bandage ? "Забинтовать" : isPoison ? "Смочить оружие" : "Использовать")
      : isEquipped ? "✓ Надет" : "Надеть";
    const useDisabled = (isEquipped || consumable?.raw || consumable?.dirty) ? "disabled" : "";

    const salvageRecipe = SALVAGE_RECIPES[itemId];

    const card = document.createElement("div");
    card.className = `inv-card${isEquipped ? " inv-card--equipped" : ""}${isFavorite ? " inv-card--favorite" : ""}`;
    card.title = item.description || item.name;
    // Полупрозрачная копия картинки предмета на фоне карточки — чисто для красоты.
    // Только для реальных изображений (эмодзи-иконки фоном не дублируем).
    const bgHTML = isImagePath(item.icon)
      ? `<span class="inv-card__bg" style="background-image:url('${item.icon}')"></span>`
      : "";
    card.innerHTML = `
      ${bgHTML}
      ${isEquipped ? '<span class="inv-card__equipped-badge">надет</span>' : ""}
      <button class="inv-card__fav-btn${isFavorite ? " is-active" : ""}" data-item-id="${itemId}" title="${isFavorite ? "Убрать из избранного" : "В избранное (нельзя продать)"}">${isFavorite ? "★" : "☆"}</button>
      ${count > 1 ? `<span class="inv-card__count">×${count}</span>` : ""}
      <span class="inv-card__icon">${renderItemIcon(item, kind)}</span>
      <span class="inv-card__name">${item.name}</span>
      ${item.materialName ? `<span class="inv-card__material">${item.materialName}</span>` : ""}
      ${bonusHTML}
      <div class="inv-card__actions">
        <button class="inv-card__btn inv-btn-use" data-item-id="${itemId}" data-kind="${kind}" ${useDisabled}>${useLabel}</button>
        ${(isPotion || isPoison) ? `<button class="inv-card__btn inv-btn-drink" data-item-id="${itemId}">Выпить</button>` : ""}
        ${canSoakBandage ? `<button class="inv-card__btn inv-btn-soak" data-item-id="${itemId}" data-potion-id="health-potion">🧪 Смочить</button>` : ""}
        ${canSoakBandageBig ? `<button class="inv-card__btn inv-btn-soak" data-item-id="${itemId}" data-potion-id="big-health-potion">🧪 Смочить</button>` : ""}
        ${salvageRecipe
          ? `<button class="inv-card__btn inv-card__btn--sell inv-btn-salvage" data-item-id="${itemId}">Порвать 🧵×${salvageRecipe.count}</button>`
          : isDirtyBandage
          ? `<button class="inv-card__btn inv-btn-clean" data-item-id="${itemId}">🧼 Очистить</button>`
          : canSell ? `<button class="inv-card__btn inv-card__btn--sell inv-btn-sell" data-item-id="${itemId}">Продать ${sellPrice}💰</button>` : isFavorite ? `<span class="inv-card__fav-lock">🔒 избранное</span>` : ""}
      </div>
    `;
    return card;
  }

  _renderEquipSlot(slot, slotEl, iconEl, nameEl) {
    const player = this.state.player;
    const itemId = player.equipped[slot];
    const item = itemId ? getEquipmentById(itemId) : null;

    slotEl.classList.toggle("equip-slot--filled", Boolean(item));
    slotEl.classList.toggle("is-selected", this.selectedEquipSlot === slot);
    iconEl.innerHTML = item ? renderItemIcon(item, "equipment") : "";
    nameEl.textContent = item ? item.name : "Пусто";
  }

  /** Слот "вторая рука": подпись зависит от того, что надето. */
  _updateOffhandLabel() {
    const labelEl = this.els.slotShieldLabel;
    if (!labelEl) return;
    const itemId = this.state.player.equipped.shield;
    const item = itemId ? getEquipmentById(itemId) : null;
    labelEl.textContent = item
      ? (item.formId === "gloves" ? "Перчатки" : item.formId === "quiver" ? "Колчан" : "Щит")
      : "Рука";
  }
  _injectHotspotIconStyles() {
    if (document.getElementById("hotspot-icon-styles")) return;
    const style = document.createElement("style");
    style.id = "hotspot-icon-styles";
    style.textContent = `
      .body-hotspot .icon-img {
        width: 80%;
        height: 80%;
        object-fit: contain;
        pointer-events: none;
      }
    `;
    document.head.appendChild(style);
  }

  /**
   * Анимация заживления при вылитом на рану зелье: зелёный пульс на месте
   * хотспота + "+HP" улетает вверх + несколько искр в стороны.
   * Координаты хотспота фиксируются ДО возможного renderBodyParts() (который
   * может скрыть иконку, если рана зажила полностью) — сама анимация рендерится
   * fixed-оверлеем поверх всего интерфейса и от последующего display:none
   * на хотспоте никак не зависит.
   */
  _playHealAnimation(partId, amount) {
    const hotspot = this.els.bodyHotspots.find((h) => h.dataset.part === partId);
    if (!hotspot) return;
    this._injectHealAnimationStyles();

    const rect = hotspot.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const fx = document.createElement("div");
    fx.className = "body-heal-fx";
    fx.style.left = `${cx}px`;
    fx.style.top = `${cy}px`;

    const pulse = document.createElement("div");
    pulse.className = "body-heal-fx__pulse";
    fx.appendChild(pulse);

    const text = document.createElement("div");
    text.className = "body-heal-fx__text";
    text.textContent = `+${amount}`;
    fx.appendChild(text);

    const sparkleCount = 6;
    for (let i = 0; i < sparkleCount; i++) {
      const sparkle = document.createElement("span");
      sparkle.className = "body-heal-fx__sparkle";
      const angleRad = ((360 / sparkleCount) * i + (Math.random() * 24 - 12)) * (Math.PI / 180);
      const distance = 20 + Math.random() * 12;
      sparkle.style.setProperty("--sparkle-dx", `${(Math.cos(angleRad) * distance).toFixed(1)}px`);
      sparkle.style.setProperty("--sparkle-dy", `${(Math.sin(angleRad) * distance).toFixed(1)}px`);
      sparkle.style.animationDelay = `${i * 25}ms`;
      fx.appendChild(sparkle);
    }

    document.body.appendChild(fx);
    setTimeout(() => fx.remove(), 950);
  }

  _injectHealAnimationStyles() {
    if (document.getElementById("body-heal-anim-styles")) return;
    const style = document.createElement("style");
    style.id = "body-heal-anim-styles";
    style.textContent = `
      .body-heal-fx {
        position: fixed;
        left: 0;
        top: 0;
        width: 0;
        height: 0;
        z-index: 1000;
        pointer-events: none;
      }
      .body-heal-fx__pulse {
        position: absolute;
        left: 0;
        top: 0;
        width: 34px;
        height: 34px;
        margin: -17px 0 0 -17px;
        border-radius: 50%;
        background: radial-gradient(circle, rgba(140,255,140,.55) 0%, rgba(140,255,140,0) 70%);
        animation: bodyHealPulseFx 0.7s ease-out forwards;
      }
      @keyframes bodyHealPulseFx {
        0%   { opacity: 0; transform: scale(0.4); }
        30%  { opacity: 1; transform: scale(1.3); }
        100% { opacity: 0; transform: scale(1.8); }
      }
      .body-heal-fx__text {
        position: absolute;
        left: 0;
        top: -4px;
        transform: translate(-50%, 0);
        color: #8cff8c;
        font-family: var(--font-mono, monospace);
        font-size: 14px;
        font-weight: 700;
        text-shadow: 0 0 6px rgba(80,220,80,.9), 0 1px 2px rgba(0,0,0,.7);
        white-space: nowrap;
        animation: bodyHealTextFx 0.9s ease-out forwards;
      }
      @keyframes bodyHealTextFx {
        0%   { opacity: 0; transform: translate(-50%, 0) scale(0.8); }
        15%  { opacity: 1; transform: translate(-50%, -8px) scale(1.15); }
        100% { opacity: 0; transform: translate(-50%, -40px) scale(1); }
      }
      .body-heal-fx__sparkle {
        position: absolute;
        left: 0;
        top: 0;
        width: 6px;
        height: 6px;
        margin: -3px 0 0 -3px;
        border-radius: 50%;
        background: radial-gradient(circle, #d4ffd4 0%, rgba(120,230,120,0) 70%);
        animation: bodyHealSparkleFx 0.75s ease-out forwards;
      }
      @keyframes bodyHealSparkleFx {
        0%   { opacity: 1; transform: translate(0, 0) scale(1); }
        100% { opacity: 0; transform: translate(var(--sparkle-dx), var(--sparkle-dy)) scale(0.3); }
      }
    `;
    document.head.appendChild(style);
  }

  _injectCompactInventoryStyles() {
    if (document.getElementById("inv-compact-styles")) return;
    const style = document.createElement("style");
    style.id = "inv-compact-styles";
    style.textContent = `
      .modal--character {
        max-width: 560px !important;
        width: 88vw !important;
        max-height: 92vh !important;
      }
      .character-layout {
        display: grid !important;
        grid-template-columns: 180px 1fr !important;
        gap: 14px !important;
        align-items: start !important;
      }
      .backpack-col {
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .backpack-header {
        display: flex;
        align-items: baseline;
        gap: 10px;
        margin-bottom: 10px;
      }
      .backpack-header__title { font-size: 0.95rem; font-weight: 600; }
      .backpack-header__hint  { font-size: 0.72rem; opacity: .5; }
      .inventory-scroll {
        max-height: 75vh;
        overflow-y: auto;
        overflow-y: overlay; /* современный оверлей-скроллбар не съедает ширину — если браузер его не знает, откатится на auto выше */
        scrollbar-gutter: stable; /* всегда резервируем место под скроллбар — иначе его появление/исчезновение меняет ширину и auto-fill дёргает колонки в бесконечном цикле */
        padding-right: 4px;
      }
      .inventory-scroll::-webkit-scrollbar { width: 4px; }
      .inventory-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,.15); border-radius: 2px; }
      .inventory-grid {
        display: grid !important;
        grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)) !important;
        gap: 6px !important;
      }
      .inv-divider {
        grid-column: 1 / -1;
        display: flex;
        align-items: center;
        gap: 10px;
        margin: 6px 0 2px;
      }
      .inv-divider::before,
      .inv-divider::after {
        content: "";
        flex: 1;
        height: 1px;
        background: rgba(255,255,255,.14);
      }
      .inv-divider__label {
        font-size: 0.68rem;
        font-weight: 600;
        letter-spacing: .06em;
        text-transform: uppercase;
        color: rgba(212,175,55,.8);
        white-space: nowrap;
      }
      .inv-card {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
        padding: 8px 6px 6px;
        background: rgba(255,255,255,.04);
        border: 1px solid rgba(255,255,255,.1);
        border-radius: 8px;
        cursor: default;
        transition: background .15s, border-color .15s;
        text-align: center;
        min-height: 90px;
      }
      .inv-card:hover {
        background: rgba(255,255,255,.08);
        border-color: rgba(255,255,255,.22);
      }
      .inv-card.inv-card--equipped {
        border-color: rgba(212,175,55,.5);
        background: rgba(212,175,55,.07);
      }
      .inv-card__equipped-badge {
        position: absolute;
        top: 4px; left: 4px;
        font-size: 0.58rem;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: .04em;
        color: #d4af37;
        background: rgba(212,175,55,.15);
        padding: 1px 5px;
        border-radius: 3px;
      }
      .inv-card__count {
        position: absolute;
        top: 4px; right: 6px;
        font-size: 0.7rem;
        opacity: .55;
        font-variant-numeric: tabular-nums;
      }
      .inv-card__icon { font-size: 1.6rem; line-height: 1; }
      .inv-card__name {
        font-size: 0.7rem;
        line-height: 1.25;
        opacity: .85;
        word-break: break-word;
        max-width: 100%;
      }
      .inv-card__bonus {
        font-size: 0.68rem;
        font-weight: 600;
        color: #9ee;
        letter-spacing: .02em;
      }
      .inv-card__actions {
        display: flex;
        flex-direction: column;
        gap: 4px;
        width: 100%;
        margin-top: auto;
        opacity: 0;
        pointer-events: none;
        transition: opacity .15s;
      }
      .inv-card:hover .inv-card__actions,
      .inv-card:focus-within .inv-card__actions {
        opacity: 1;
        pointer-events: auto;
      }
      @media (pointer: coarse) {
        .inv-card__actions { opacity: 1; pointer-events: auto; }
        .inv-card { min-height: 130px; }
      }
      .inv-card__btn {
        font-size: 0.65rem;
        padding: 3px 6px;
        border-radius: 4px;
        border: 1px solid rgba(255,255,255,.18);
        background: rgba(255,255,255,.08);
        color: inherit;
        cursor: pointer;
        transition: background .12s;
        white-space: nowrap;
      }
      .inv-card__btn:hover:not(:disabled) { background: rgba(255,255,255,.18); }
      .inv-card__btn:disabled { opacity: .35; cursor: not-allowed; }
      .inv-card__btn--sell {
        border-color: rgba(212,175,55,.35);
        color: #c8a730;
        background: rgba(212,175,55,.06);
      }
      .inv-card__btn--sell:hover:not(:disabled) { background: rgba(212,175,55,.16); }
    `;
    document.head.appendChild(style);
  }
}