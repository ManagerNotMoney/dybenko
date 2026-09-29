// ui.js
// ============================================================
// Координатор представления. Сам ничего не рендерит — находит
// DOM-элементы, создаёт CombatView / CharacterView / TradeView
// и связывает их с шиной событий.
// ============================================================

import { bus } from "./engine.js";
import { CombatView } from "./ui/combat-view.js";
import { CharacterView } from "./ui/character-view.js";
import { TradeView } from "./ui/trade-view.js";
import { RacesView } from "./ui/races-view.js";
import { RecordsView } from "./ui/records-view.js";

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(state) {
    this.state = state;
    this.els = {
      depth: $("depth-value"),
      gold: $("gold-value"),

      playerName: $("player-name"),
      playerLevel: $("player-level"),
      playerHPFill: $("player-hp-fill"),
      playerHPCurrent: $("player-hp-current"),
      playerHPMax: $("player-hp-max"),
      playerXPFill: $("player-xp-fill"),
      playerXPCurrent: $("player-xp-current"),
      playerXPMax: $("player-xp-max"),
      playerStoicism: $("player-stoicism"),
      playerStrength: $("player-strength"),
      playerArmor: $("player-armor"),
      playerAgility: $("player-agility"),
      playerCard: $("player-card"),

      enemyIcon: $("enemy-icon"),
      enemyName: $("enemy-name"),
      enemyLevel: $("enemy-level"),
      enemyHPFill: $("enemy-hp-fill"),
      enemyHPCurrent: $("enemy-hp-current"),
      enemyHPMax: $("enemy-hp-max"),
      enemyDamage: $("enemy-damage"),
      enemyAgility: $("enemy-agility"),
      enemyCard: $("enemy-card"),
      enemyCounter: $("enemy-counter"),

      equipDetail: $("equip-detail"),
      eventCard: $("event-card"),
      eventIcon: $("event-icon"),
      eventName: $("event-name"),
      eventDesc: $("event-desc"),
      eventCounter: $("event-counter"),
      btnInteract: $("btn-interact"),

      arena: $("arena"),
      arenaDivider: document.querySelector(".arena__divider"),

      fxLayer: $("fx-layer"),
      logBody: $("log-body"),

      btnAttack: $("btn-attack"),
      btnFlee: $("btn-flee"),
      btnShop: $("btn-shop"),
      btnWorkbench: $("btn-workbench"),
      btnDescend: $("btn-descend"),

      btnRest: $("btn-rest"),
      btnHealth: $("btn-health"),
      healthOverlay: $("health-overlay"),
      healthClose: $("health-close"),
      btnInventory: $("btn-inventory"),
      inventoryOverlay: $("inventory-overlay"),
      inventoryClose: $("inventory-close"),

      btnRaces: $("btn-races"),
      racesOverlay: $("races-overlay"),
      racesClose: $("races-close"),
      racesList: $("races-list"),
      slotWeapon: $("slot-weapon"),
      bodyHotspots: null,
      bodypartDetail: $("bodypart-detail"),
      slotWeaponIcon: $("slot-weapon-icon"),
      slotWeaponName: $("slot-weapon-name"),
      slotShield: $("slot-shield"),
      slotShieldLabel: $("slot-shield-label"),
      slotShieldIcon: $("slot-shield-icon"),
      slotShieldName: $("slot-shield-name"),
      slotHelmet: $("slot-helmet"),
      slotHelmetIcon: $("slot-helmet-icon"),
      slotHelmetName: $("slot-helmet-name"),
      slotChestplate: $("slot-chestplate"),
      slotChestplateIcon: $("slot-chestplate-icon"),
      slotChestplateName: $("slot-chestplate-name"),
      slotGreaves: $("slot-greaves"),
      slotGreavesIcon: $("slot-greaves-icon"),
      slotGreavesName: $("slot-greaves-name"),
      slotBoots: $("slot-boots"),
      slotBootsIcon: $("slot-boots-icon"),
      slotBootsName: $("slot-boots-name"),
      inventoryGrid: $("inventory-grid"),
      inventoryEmpty: $("inventory-empty"),

      shopOverlay: $("shop-overlay"),
      shopClose: $("shop-close"),
      shopGoldValue: $("shop-gold-value"),
      shopGrid: $("shop-grid"),
      btnDescendFromShop: $("btn-descend-from-shop"),

      merchantOverlay: $("merchant-overlay"),
      merchantClose: $("merchant-close"),
      merchantGoldValue: $("merchant-gold-value"),
      merchantGrid: $("merchant-grid"),

      workbenchOverlay: $("workbench-overlay"),
      workbenchClose: $("workbench-close"),
      craftingGrid: $("crafting-grid"),
      btnDescendFromWorkbench: $("btn-descend-from-workbench"),

      levelupOverlay: $("levelup-overlay"),
      gameoverOverlay: $("gameover-overlay"),
      gameoverDepth: $("gameover-depth"),

      enemyLoreOverlay: $("enemy-lore-overlay"),
      enemyLoreClose: $("enemy-lore-close"),
      enemyLoreIcon: $("enemy-lore-icon"),
      enemyLoreName: $("enemy-lore-name"),
      enemyLoreText: $("enemy-lore-text"),
      enemyLoreRace: $("enemy-lore-race"),

      btnRecords: $("btn-records"),
      recordsOverlay: $("records-overlay"),
      recordsClose: $("records-close"),
      recordsBody: $("records-body"),
    };

    this.combat = new CombatView(this.state, this.els);
    this.character = new CharacterView(this.state, this.els);
    this.trade = new TradeView(this.state, this.els);
    this.races = new RacesView(this.state, this.els);
    this.records = new RecordsView(this.state, this.els);

    this._bindEvents();
  }

  _bindEvents() {
    bus.on("player:bandage-changed", (payload) => {
      if (this.character.isBodyPartsPanelVisible()) this.character.renderBodyParts();
      if (payload?.broken) this.combat.spawnBandageFall(this.els.playerCard);
    });
    bus.on("floorEvent:loot", ({ drops }) => this.combat.spawnLootFall(this.els.eventCard, drops));
    bus.on("player:damaged", (payload) => this.combat.onPlayerDamaged(payload));
    bus.on("player:dodged", () => this.combat.onPlayerDodged());
    bus.on("player:parried", () => this.combat.onPlayerParried());
    bus.on("player:body-part-healed", () => {
      if (this.character.isBodyPartsPanelVisible()) { this.character.renderBodyParts(); this.character.renderCharStats(); }
    });
    bus.on("player:body-part-damaged", () => {
      if (this.character.isBodyPartsPanelVisible()) { this.character.renderBodyParts(); this.character.renderCharStats(); }
    });
    bus.on("player:healed", (payload) => this.combat.onPlayerHealed(payload));
    bus.on("player:xp-gained", (payload) => this.combat.onPlayerXP(payload));
    bus.on("player:leveled-up", () => this.combat.renderPlayer());
    bus.on("player:crafted", () => this.trade.renderCraftingGrid());

    bus.on("enemy:damaged", (payload) => this.combat.onEnemyDamaged(payload));
    bus.on("enemy:dodged", () => this.combat.onEnemyDodged());
    bus.on("enemy:parried", () => this.combat.onEnemyParried());
    bus.on("enemy:died", () => this.combat.onEnemyDied());
    bus.on("enemy:healed", (payload) => this.combat.onEnemyHealed(payload));
    bus.on("enemy:loot", ({ drops }) => this.combat.spawnLootFall(this.els.enemyCard, drops));

    // Кнопки блокируются на время разрешения хода — раньше они оставались
    // кликабельными во время всех анимаций, потому что эти события никто не слушал.
    bus.on("combat:turn-start", () => this.combat.setButtonsEnabled(false));
    bus.on("combat:turn-end", () => this.combat.setButtonsEnabled(true));

    bus.on("combat:log", (payload) => this.combat.appendLog(payload));

    bus.on("player:item-added", () => this.character.renderInventory());
    bus.on("player:item-used", () => this.character.renderInventory());
    bus.on("player:item-sold", () => this.character.renderInventory());
    bus.on("player:gold-changed", () => {
      this.combat.renderPlayer();
      if (!this.els.shopOverlay.classList.contains("is-hidden")) this.trade.renderShop();
      if (!this.els.merchantOverlay.classList.contains("is-hidden")) this.trade.renderMerchant();
    });
    bus.on("player:equipment-changed", () => {
      this.combat.renderPlayer();
      this.character.renderInventory();
      this.character.renderEquipDetail();
    });
    bus.on("ui:open-race", ({ raceId }) => this.showRacesModal(raceId));
  }

  // ---- делегирование для main.js ----
  renderAll() { this.combat.renderAll(); }
  showEnemyCard() { this.combat.showEnemyCard(); }
  showEventCard(event) { this.combat.showEventCard(event); }
  handleInteractClick(event) { return this.combat.handleInteractClick(event); }
  setButtonsEnabled(enabled) { this.combat.setButtonsEnabled(enabled); }
  showContinueButton(show) { this.combat.showContinueButton(show); }
  setRestEnabled(enabled) { this.combat.setRestEnabled(enabled); }
  showHideoutButtons(show) { this.combat.showHideoutButtons(show); }
  setInteractEnabled(enabled) { this.combat.setInteractEnabled(enabled); }
  renderPlayer() { this.combat.renderPlayer(); }
  showLevelUpModal() { this.combat.showLevelUpModal(); }
  hideLevelUpModal() { this.combat.hideLevelUpModal(); }
  showGameOver(depth) { this.combat.showGameOver(depth); }
  hideGameOver() { this.combat.hideGameOver(); }

  showHealthModal() { this.character.showHealth(); }
  hideHealthModal() { this.character.hideHealth(); }

  showInventoryModal() { this.character.showInventory(); }
  hideInventoryModal() { this.character.hideInventory(); }

  showRacesModal(raceId) { this.races.show(raceId); }
  hideRacesModal() { this.races.hide(); }

  showRecordsModal() { this.records.show(); }
  hideRecordsModal() { this.records.hide(); }

  showShopModal() { this.trade.showShop(); }
  hideShopModal() { this.trade.hideShop(); }
  buyShopItemByIndex(index) { this.trade.buyByIndex(index); }

  showMerchantModal() { this.trade.showMerchant(); }
  hideMerchantModal() { this.trade.hideMerchant(); }
  renderMerchant() { this.trade.renderMerchant(); }

  showWorkbenchModal() { this.trade.showWorkbench(); }
  hideWorkbenchModal() { this.trade.hideWorkbench(); }
}