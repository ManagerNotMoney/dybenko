// enemy.js
// ============================================================
// Экземпляр врага в бою + фабрика, подбирающая и масштабирующая
// тип врага под текущую глубину подземелья.
// ============================================================

import { ENEMY_TYPES } from "./data/enemies.js";

// Насколько сильнее становятся враги за каждый уровень глубины.
const HP_SCALING_PER_DEPTH = 0.14;
const DAMAGE_SCALING_PER_DEPTH = 0.08;

// Враги обычно не критуют — крит появляется только у стрелков (wields: "bow"),
// когда их ловкость выше ловкости игрока (см. rollAttack).
const ENEMY_BASE_CRIT_MULTIPLIER = 1.8;
const BOW_CRIT_CHANCE_PER_AGILITY = 0.02;   // +2% шанс крита за очко разницы ловкости
const BOW_CRIT_DAMAGE_PER_AGILITY = 0.03;   // +3% к множителю крита за очко разницы

export class Enemy {
  constructor(typeDef, depth) {
    this.id = typeDef.id;
    this.name = typeDef.name;
    this.icon = typeDef.icon;
    this.level = depth;
    this.wields = typeDef.wields || null;
    this.poisonOnHit = typeDef.poisonOnHit || null; // { chance, damagePercent, ticks } — яд на стреле
    this.drops = typeDef.drops || [];
    this.lore = typeDef.lore || "Об этом существе почти ничего не известно.";
    this.race = typeDef.race || null;

    const scaleHP = 1 + (depth - 1) * HP_SCALING_PER_DEPTH;
    const scaleDmg = 1 + (depth - 1) * DAMAGE_SCALING_PER_DEPTH;

    this.maxHP = Math.round(typeDef.baseHP * scaleHP);
    this.currentHP = this.maxHP;
    this.damage = Math.round(typeDef.baseDamage * scaleDmg);
    // Ловкость врага растёт с глубиной (+1 каждые 5 уровней)
    this.agility = (typeDef.baseAgility || 0) + Math.floor((depth - 1) / 5);
    // Стойкость врага (для парирования мечников): базовое значение из
    // данных типа (baseStoicism, необязательное поле) + рост с глубиной.
    this.stoicism = (typeDef.baseStoicism || 0) + Math.floor((depth - 1) / 6);

    this.xpReward = Math.round(typeDef.xpReward * scaleHP);
    const [goldMin, goldMax] = typeDef.goldReward;
    this.goldReward = Math.round(goldMin + Math.random() * (goldMax - goldMin));

    // Способность "пить зелье": сколько раз за бой враг может себя вылечить,
    // если его HP опустилось ниже 50% (см. healCharges/healPercent в data/enemies.js).
    this.healCharges = typeDef.healCharges || 0;
    this.healChargesLeft = this.healCharges;
    this.healPercent = typeDef.healPercent || 0.3; // на сколько % от maxHP лечит один глоток

    // Яд с оружия игрока (см. player.applyPoisonToWeapon / combat.js):
    // poisonDamagePerTick — фиксированный урон за тик (уже посчитан от
    // maxHP в момент заражения), poisonTicksLeft — сколько тиков осталось.
    this.poisonDamagePerTick = 0;
    this.poisonTicksLeft = 0;
  }

  get isAlive() {
    return this.currentHP > 0;
  }

  /**
   * Пытается выпить зелье вместо хода: если заряды ещё есть и HP <= 50%,
   * лечится на healPercent от maxHP и возвращает восстановленное количество.
   * Иначе возвращает null (значит враг атакует как обычно).
   */
  tryHeal() {
    if (this.healChargesLeft <= 0 || this.currentHP > this.maxHP * 0.5) return null;
    this.healChargesLeft -= 1;
    const amount = Math.round(this.maxHP * this.healPercent);
    this.currentHP = Math.min(this.maxHP, this.currentHP + amount);
    return amount;
  }

  rollAttack(playerAgility = 0) {
    const variance = Math.floor(Math.random() * 3) - 1;
    let amount = Math.max(1, this.damage + variance);

    let isCrit = false;
    if (this.wields === "bow") {
      const agilityDiff = Math.max(0, this.agility - playerAgility);
      const critChance = agilityDiff * BOW_CRIT_CHANCE_PER_AGILITY;
      isCrit = Math.random() < critChance;
      if (isCrit) {
        const critMultiplier = ENEMY_BASE_CRIT_MULTIPLIER + agilityDiff * BOW_CRIT_DAMAGE_PER_AGILITY;
        amount = Math.round(amount * critMultiplier);
      }
    }

    return { amount, isCrit };
  }

  takeDamage(amount) {
    this.currentHP = Math.max(0, this.currentHP - amount);
  }

  /** Заразить ядом: фиксированный урон за тик на заданное число тиков. Повторное заражение обновляет длительность/урон, не складывается. */
  applyPoison(damagePerTick, ticks) {
    this.poisonDamagePerTick = Math.max(1, Math.round(damagePerTick));
    this.poisonTicksLeft = ticks;
  }

  /**
   * Один тик яда (раз за боевой раунд). Возвращает { amount, ticksLeft }
   * или null, если яда нет или враг уже мёртв.
   */
  tickPoison() {
    if (!this.isAlive || this.poisonTicksLeft <= 0) return null;
    const amount = Math.min(this.currentHP, this.poisonDamagePerTick);
    this.currentHP = Math.max(0, this.currentHP - amount);
    this.poisonTicksLeft -= 1;
    return { amount, ticksLeft: this.poisonTicksLeft };
  }
}

/** Подобрать случайный (взвешенный) тип врага, доступный на этой глубине. */
function pickEnemyType(depth) {
  const available = ENEMY_TYPES.filter(
    (t) => depth >= t.minDepth && (t.maxDepth === null || depth <= t.maxDepth)
  );
  const pool = available.length > 0 ? available : ENEMY_TYPES;

  const totalWeight = pool.reduce((sum, t) => sum + t.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const type of pool) {
    roll -= type.weight;
    if (roll <= 0) return type;
  }
  return pool[0];
}

/** Создать врага, подходящего для указанной глубины подземелья. */
export function spawnEnemy(depth) {
  const type = pickEnemyType(depth);
  return new Enemy(type, depth);
}

/**
 * Форс-спавн конкретного типа врага по id, в обход случайного выбора
 * и весов (используется для боссов вроде Гоблина-Короля).
 */
export function spawnEnemyById(id, depth) {
  const type = ENEMY_TYPES.find((t) => t.id === id);
  if (!type) {
    console.warn(`spawnEnemyById: неизвестный id врага "${id}"`);
    return spawnEnemy(depth);
  }
  return new Enemy(type, depth);
}
