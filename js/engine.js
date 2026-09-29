// engine.js
// ============================================================
// Минимальное ядро игры: шина событий + центральное состояние.
// Все остальные модули общаются ТОЛЬКО через события EventBus —
// это и делает архитектуру модульной и легко расширяемой:
// чтобы добавить новую механику, не нужно трогать существующий код,
// достаточно подписаться на нужные события или испустить новые.
// ============================================================

/**
 * Простая шина событий (паттерн pub/sub).
 */
export class EventBus {
  constructor() {
    this.listeners = new Map();
  }

  /** Подписаться на событие. Возвращает функцию отписки. */
  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event).add(handler);
    return () => this.off(event, handler);
  }

  off(event, handler) {
    this.listeners.get(event)?.delete(handler);
  }

  /** Испустить событие со всеми слушателями. */
  emit(event, payload) {
    this.listeners.get(event)?.forEach((handler) => handler(payload));
  }
}

/**
 * Глобальное состояние раунда подземелья.
 * Хранит только "сырые" данные — никакой DOM-логики здесь нет.
 */
export class GameState {
  constructor() {
    this.player = null;
    this.enemy = null;
    this.floorEvent = null;    // текущий не-боевой узел (фонтан, сундук и т.д.)
    this.depth = 1;
    this.phase = "idle"; // idle | combat | floor-event | floor-cleared | victory | defeat | leveling
    this.isBusy = false;
    this.floorQueue = [];      // узлы этажа: { type: 'combat', enemy } | { type: 'event', event }
    this.floorIndex = 0;       // сколько узлов уже пройдено на этаже
    this.floorTotal = 0;       // всего узлов на этаже
    this.skeletonMerchantSpawned = false; // скелет-торговец бывает только 1 раз за забег
    this.swordInStoneSpawned = false;     // меч в камне бывает только 1 раз за забег
    this.goblinPriestSpawned = false;     // гоблин-священник бывает только 1 раз за забег (этажи 1-39)
    this.priestBribed = false;            // если true — Гоблин-Король на 40 этаже спавнится без зелий лечения
    this.elderBribed = false;             // если true — Гоблин-Король на 40 этаже получает +10 урона и +1 заряд лечения

    // Укрытие при побеге (см. CombatManager.flee()): вместо мгновенного
    // побега игрок иногда находит укромное место, где можно отсидеться.
    this.hideoutRestsMax = 0;      // сколько раз всего можно отдохнуть в этом укрытии (3-8, роллится при находке)
    this.hideoutRestsUsed = 0;     // сколько раз уже отдохнул
    this.hideoutWarned = false;    // было ли уже предупреждение "кто-то подходит" (на 2-м привале)
    this.hideoutAmbushPending = false; // если true — следующий враг гарантированно бьёт первым (см. forceEnemyInitiative)
    // Гарантирует, что в СЛЕДУЮЩЕМ бою инициативу не бросают, а враг бьёт
    // первым — расплата за то, что игрок пересидел в укрытии (см. playerAttack в combat.js).
    this.forceEnemyInitiative = false;
  }

  reset() {
    this.depth = 1;
    this.phase = "idle";
    this.isBusy = false;
    this.floorEvent = null;
    this.floorQueue = [];
    this.floorIndex = 0;
    this.floorTotal = 0;
    this.initiativeRolled = false;
    this.skeletonMerchantSpawned = false;
    this.swordInStoneSpawned = false;
    this.goblinPriestSpawned = false;
    this.priestBribed = false;
    this.elderBribed = false;
    this.hideoutRestsMax = 0;
    this.hideoutRestsUsed = 0;
    this.hideoutWarned = false;
    this.hideoutAmbushPending = false;
    this.forceEnemyInitiative = false;
  }
}

/** Единая шина событий для всего приложения. */
export const bus = new EventBus();

/**
 * Каталог событий, на которые можно подписываться (для справки):
 *
 *  player:damaged            { amount, blocked, penetrated, incoming, current, max }
 *  player:dodged             { incoming }
 *  player:parried            {}
 *  player:healed             { amount, current, max }
 *  player:body-part-damaged  { partId, amount, current, max, pct, ...severity }
 *  player:body-part-healed   { partId, amount, current, max, pct, ...severity }
 *  player:bandage-changed    { partId, active, broken? }
 *  player:leveled-up         { level }
 *  player:died               {}
 *  player:xp-gained          { amount, current, max }
 *  player:gold-changed       { gold }
 *  player:equipment-changed  { slot, itemId }
 *  player:item-added         { itemId, count }
 *  player:item-used          { itemId }
 *  player:item-sold          { itemId, goldGained }
 *  player:item-found         { item }
 *  player:crafted            { recipe }
 *
 *  enemy:damaged   { amount, isCrit, current, max }
 *  enemy:dodged    {}
 *  enemy:parried   {}
 *  enemy:died      { enemy, xp, gold }
 *  enemy:loot      { drops }
 *
 *  combat:log        { text, type }
 *  combat:turn-start
 *  combat:turn-end
 *
*  floorEvent:merchant-opened  { event }
 *  floorEvent:resolved         { event }
 *  floorEvent:loot             { drops }
 *  floorEvent:sword-claimed    { item }
 *
 *  hideout:found     { restsMax }
 *
 *  ui:open-race  { raceId }
 */
