// player.js
// ============================================================
// Игрок и его характеристики.
//
// Стойкость (stoicism)  -> +10 макс. ХП  +1 броня за очко
// Сила (strength)       -> +2 урона       +5 макс. ХП за очко
// Ловкость (agility)    -> влияет на инициативу в бою
//                          (кто атакует первым)
// Броня (armor)         -> поглощает N единиц входящего урона
//                          (от снаряжения + стойкости)
// ============================================================

import { bus } from "./engine.js";
import { getEquipmentById } from "./equipment.js";
import { getMaterialById } from "./data/materials.js";
import { getFormById } from "./data/equipment-forms.js";
import { getConsumableById } from "./data/consumables.js";
import { getUniqueItemById } from "./data/unique-items.js";
import { BODY_PARTS, getWoundSeverity, pickHitBodyPart, healBodyPartByOneGrade, distributePartMaxHPs, MINOR_INJURY_KEYS } from "./data/body-parts.js";
import { renderIcon } from "./ui/icon.js";

const BASE_HP             = 50;
const HP_PER_STOICISM     = 10;   // +10 maxHP за очко стойкости
const ARMOR_PER_STOICISM  = 1;    // +1 броня за очко стойкости
const HP_PER_STRENGTH     = 5;    // +5 maxHP за очко силы
const BASE_DAMAGE         = 4;
const DAMAGE_PER_STRENGTH = 2;    // +2 урона за очко силы
const CRIT_CHANCE         = 0.12;
const CRIT_MULTIPLIER     = 1.8;
const BOW_CRIT_CHANCE_PER_AGILITY = 0.02;   // +2% шанс крита за очко разницы ловкости
const BOW_CRIT_DAMAGE_PER_AGILITY = 0.03;   // +3% к множителю крита за очко разницы

// Кровотечение из раны на шее: % от МАКСИМАЛЬНОГО (не текущего!) HP за тик.
// Если считать от текущего HP — HP будет асимптотически стремиться к нулю
// и игрок никогда реально не умрёт от кровопотери. От максимума — гарантированно
// дойдёт до нуля за конечное число тиков. Царапина ("scratch") не кровоточит.
const NECK_BLEED_PCT_BY_GRADE = {
  wound:         0.05,
  "deep-wound":  0.10,
  "severe-wound":0.15,
  disabled:      0.20,
};

const EQUIPMENT_SLOTS = ["weapon", "shield", "helmet", "chestplate", "greaves", "boots"];

/** Предметы, которые нельзя продать за золото — только порвать на сырьё (см. Player.salvageItem). */
const SALVAGE_RECIPES = {
  shirt: { itemId: "cotton", count: 4 },
  "torn-pants": { itemId: "cotton", count: 3 },
  "cloth-wraps": { itemId: "cotton", count: 2 },
};

/**
 * Комбо-бонусы — в отличие от сетов (materials.js -> setBonus), это связка
 * КОНКРЕТНЫХ форм из РАЗНЫХ материалов в конкретных слотах. Все requires
 * должны совпасть одновременно (materialId + formId в любом из слотов),
 * тогда добавляется bonus.
 */
const EQUIPMENT_COMBOS = [
  {
    id: "shadow-bone-assassin",
    requires: [
      { formId: "gloves", materialId: "shadow-cloth" },
      { formId: "dagger", materialId: "bone" },
    ],
    bonus: { strength: 5, agility: 5 },
  },
];

export class Player {
  constructor({ name = "Странник", stoicism = 1, strength = 1, agility = 1 } = {}) {
    this.name = name;
    this.level = 1;
    this.xp = 0;
    this.gold = 0;

    this.stoicism = stoicism;
    this._baseStrength = strength;
    this._baseAgility = agility;

    this.inventory = {};
    this.equipped = Object.fromEntries(EQUIPMENT_SLOTS.map((slot) => [slot, null]));
    this.favorites = new Set();

    // currentHP больше НЕ отдельное поле — это и было источником бага
    // "раны зажили, а цифра HP нет" (кровотечение и точечное лечение
    // зельем трогали только это поле, не части тела, из-за чего они
    // расходились). Теперь currentHP — вычисляемое свойство, см. геттер
    // ниже: сумма HP всех частей тела.

    // Части тела: у каждой своё максимальное и текущее ХП, производное
    // от общего maxHP игрока (см. data/body-parts.js). distributePartMaxHPs
    // гарантирует, что сумма maxHP частей ТОЧНО равна общему maxHP.
    this.bodyParts = {};
    const partMaxHPs = distributePartMaxHPs(this.maxHP);
    for (const def of BODY_PARTS) {
      const partMaxHP = partMaxHPs[def.id];
      this.bodyParts[def.id] = { maxHP: partMaxHP, currentHP: partMaxHP };
    }
    this.bandagedParts = {};
    // Для каждой забинтованной части — было ли ранение "настоящим" (царапина
    // и хуже) в момент наложения бинта, а не лёгким синяком/гематомой.
    // Определяет, станет ли бинт грязным при снятии. См. applyBandage/removeBandage.
    this.bandageAppliedOnOpenWound = {};
    // Для каждой забинтованной части — сколько ещё раз сработает "второй"
    // бонусный тик лечения (см. consumable.bonusHealCharges, например у
    // зельевого бинта potion-bandage). См. applyBandage/tickBandages.
    this.bandageBonusHealLeft = {};

    // Яд на оружии: пока null — оружие "чистое". После applyPoisonToWeapon()
    // хранит { damagePercent, ticks, icon, name } и срабатывает разово на
    // следующем УСПЕШНОМ ударе (не увёрнутом, не парированном), см. combat.js.
    this.weaponPoison = null;
    // Яд, полученный от отравленной стрелы врага (лучники) — фиксированный
    // урон за тик на объявленное число тиков. Симметрично Enemy.applyPoison/
    // tickPoison в enemy.js, но снимает HP через _drainOtherBodyParts,
    // как и кровотечение из шеи (единственный источник правды — части тела).
    this.poisonDamagePerTick = 0;
    this.poisonTicksLeft = 0;
    // Сколько "смачиваний" осталось у уже начатого флакона данного itemId —
    // сам флакон в инвентаре остаётся обычным стакаемым предметом (count),
    // это отдельный счётчик того, сколько раз можно нанести яд с ОДНОГО
    // флакона, прежде чем он опустеет и удалится из инвентаря.
    this.poisonFlaskCharges = {};

    // Стартовое снаряжение — выдаётся сразу заэкипированным.
    this._grantStartingGear(["torch", "cloth-wraps", "torn-pants"]);
  }

  /** Кладёт в инвентарь и сразу надевает уникальные стартовые предметы. */
  _grantStartingGear(itemIds) {
    for (const itemId of itemIds) {
      this.inventory[itemId] = (this.inventory[itemId] || 0) + 1;
      const item = getEquipmentById(itemId);
      if (item) this.equipped[item.slot] = itemId;
    }
  }

  /** Список частей тела с текущим состоянием и градацией ранения — для UI. */
  get bodyPartsStatus() {
    return BODY_PARTS.map((def) => {
      const part = this.bodyParts[def.id];
      const pct = part.maxHP > 0 ? part.currentHP / part.maxHP : 0;
      const severity = getWoundSeverity(pct);
      return {
        id: def.id,
        name: def.name,
        currentHP: part.currentHP,
        maxHP: part.maxHP,
        pct,
        ...severity,
        icon: severity.icon || def.icon,
      };
    });
  }

  /**
   * Текущее HP игрока — ВЫЧИСЛЯЕМОЕ свойство, сумма currentHP всех частей
   * тела. Раньше это было отдельное поле this.currentHP, которое
   * поддерживалось вручную в takeDamage/heal/healWounds/tickBandages/
   * tickBleeding и легко расходилось с реальным состоянием частей тела.
   * Теперь части тела — единственный источник правды, рассинхронизация
   * в принципе невозможна.
   */
  get currentHP() {
    if (!this.bodyParts) return 0;
    return Object.values(this.bodyParts).reduce((sum, part) => sum + Math.max(0, part.currentHP), 0);
  }

  /** Пересчитать maxHP частей тела при изменении общего maxHP, сохраняя % здоровья. */
  _reconcileBodyParts() {
    if (!this.bodyParts) return;
    const partMaxHPs = distributePartMaxHPs(this.maxHP);
    for (const def of BODY_PARTS) {
      const part = this.bodyParts[def.id];
      const ratio = part.maxHP > 0 ? part.currentHP / part.maxHP : 1;
      const newMax = partMaxHPs[def.id];
      part.maxHP = newMax;
      part.currentHP = Math.max(0, Math.min(newMax, Math.round(newMax * ratio)));
    }
  }

  /** Суммарные бонусы от всей надетой экипировки, включая сеты и комбо. */
  get equipmentBonuses() {
    const totals = {};
    const materialBySlot = {};
    const equippedPairs = []; // [{ formId, materialId }] — для комбо-бонусов

    for (const slot of EQUIPMENT_SLOTS) {
      const item = getEquipmentById(this.equipped[slot]);
      if (!item) continue;
      materialBySlot[slot] = item.materialId;
      if (item.formId && item.materialId) {
        equippedPairs.push({ formId: item.formId, materialId: item.materialId });
      }
      if (!item.bonus) continue;
      for (const [stat, value] of Object.entries(item.bonus)) {
        totals[stat] = (totals[stat] || 0) + value;
      }
    }

    this._applySetBonuses(totals, materialBySlot);
    this._applyComboBonuses(totals, equippedPairs);
    return totals;
  }

  /** Комбо: конкретные form+material в разных слотах одновременно (см. EQUIPMENT_COMBOS). */
  _applyComboBonuses(totals, equippedPairs) {
    for (const combo of EQUIPMENT_COMBOS) {
      const satisfied = combo.requires.every((req) =>
        equippedPairs.some((p) => p.formId === req.formId && p.materialId === req.materialId)
      );
      if (!satisfied) continue;
      for (const [stat, value] of Object.entries(combo.bonus)) {
        totals[stat] = (totals[stat] || 0) + value;
      }
    }
  }

  /**
   * Бонусы сета: считаются отдельно от обычных бонусов предметов.
   * Порог 1 — все 4 слота брони (helmet/chestplate/greaves/boots) одного
   * материала → material.setBonus.armorBonus.
   * Порог 2 — вдобавок weapon и shield того же материала (весь комплект,
   * 6 из 6 слотов) → ДОПОЛНИТЕЛЬНО material.setBonus.fullBonus.
   */
  _applySetBonuses(totals, materialBySlot) {
    const ARMOR_SLOTS = ["helmet", "chestplate", "greaves", "boots"];
    const GEAR_SLOTS = ["weapon", "shield"];

    const baseMaterial = materialBySlot[ARMOR_SLOTS[0]];
    if (!baseMaterial) return;

    const fullArmor = ARMOR_SLOTS.every((slot) => materialBySlot[slot] === baseMaterial);
    if (!fullArmor) return;

    const material = getMaterialById(baseMaterial);
    if (!material?.setBonus) return;

    if (material.setBonus.armorBonus) {
      for (const [stat, value] of Object.entries(material.setBonus.armorBonus)) {
        totals[stat] = (totals[stat] || 0) + value;
      }
    }

    const fullSet = GEAR_SLOTS.every((slot) => materialBySlot[slot] === baseMaterial);
    if (fullSet && material.setBonus.fullBonus) {
      for (const [stat, value] of Object.entries(material.setBonus.fullBonus)) {
        totals[stat] = (totals[stat] || 0) + value;
      }
    }
  }

  get maxHP() {
    return BASE_HP
      + (this.stoicism + (this.equipmentBonuses.stoicism || 0)) * HP_PER_STOICISM
      + this.strength * HP_PER_STRENGTH
      + (this.equipmentBonuses.maxHP || 0);
  }

  /** Ловкость = базовая + бонус от экипировки (например, теневой ткани). */
  get agility() {
    return this._baseAgility + (this.equipmentBonuses.agility || 0);
  }

  /** Сила = базовая + бонус от экипировки (например, золотого сета). */
  get strength() {
    return this._baseStrength + (this.equipmentBonuses.strength || 0);
  }

  /** Доп. шанс уворота от атак (0..1), суммируется со всей надетой экипировки. */
  get dodgeChance() {
    return (this.equipmentBonuses.dodgeChance || 0) / 100;
  }

  /** Доп. множитель золота (0..N), суммируется со всей надетой золотой экипировки. */
  get goldFind() {
    return (this.equipmentBonuses.goldFind || 0) / 100;
  }

  /**
   * Броня = бонус от снаряжения + 1 за каждое очко стойкости.
   * Поглощает N урона каждую атаку (минимум 1 урон всегда проходит).
   */
  get armor() {
    return (this.equipmentBonuses.armor || 0)
      + (this.stoicism + (this.equipmentBonuses.stoicism || 0)) * ARMOR_PER_STOICISM;
  }

  get xpToNext() {
    return Math.round(40 * Math.pow(1.35, this.level - 1));
  }

  get isAlive() {
    return this.currentHP > 0;
  }

  /** Есть ли на теле хотя бы один синяк/гематома — легчайшие степени, заживающие на привале без бинта. */
  get hasMinorInjuries() {
    return BODY_PARTS.some((def) => {
      const part = this.bodyParts[def.id];
      if (!part || part.currentHP >= part.maxHP) return false;
      const pct = part.maxHP > 0 ? part.currentHP / part.maxHP : 0;
      return MINOR_INJURY_KEYS.includes(getWoundSeverity(pct).key);
    });
  }

  /**
   * Средний % здоровья ног (обе ноги + обе стопы), взвешенный по их maxHP.
   * Используется как шанс успешного побега/поиска укрытия в
   * CombatManager.flee(): здоровые ноги — 100% шанс уйти, полностью
   * уничтоженные (все 4 части = 0 HP) — 0%, между ними — линейно.
   */
  get legHealthPct() {
    const LEG_PART_IDS = ["left-leg", "right-leg", "left-foot", "right-foot"];
    let totalCurrent = 0;
    let totalMax = 0;
    for (const partId of LEG_PART_IDS) {
      const part = this.bodyParts[partId];
      if (!part) continue;
      totalCurrent += Math.max(0, part.currentHP);
      totalMax += part.maxHP;
    }
    return totalMax > 0 ? totalCurrent / totalMax : 1;
  }

  /** Возвращает formId надетого оружия или null. */
  get equippedWeaponForm() {
    const weaponId = this.equipped["weapon"];
    if (!weaponId) return null;
    const item = getEquipmentById(weaponId);
    return item ? item.formId : null;
  }

  rollAttack(enemyAgility = 0) {
    const variance = Math.floor(Math.random() * 3) - 1;
    const weaponBonus = this.equipmentBonuses.damage || 0;
    const isDagger = this.equippedWeaponForm === "dagger";
    const isBow = this.equippedWeaponForm === "bow";
    const isWarhammer = this.equippedWeaponForm === "warhammer";

    let amount;
    if (isDagger) {
      // Кинжал: базовый урон + материал + сила + ловкость
      amount = Math.max(1, BASE_DAMAGE + this.strength + this.agility + weaponBonus + variance);
    } else if (isWarhammer) {
      // Боевой молот: чем больше сила превышает ловкость, тем мощнее удар
      const strengthGap = this.strength - this.agility;
      amount = Math.max(1, BASE_DAMAGE + this.strength + strengthGap * 2 + weaponBonus + variance);
    } else {
      amount = Math.max(1, BASE_DAMAGE + this.strength * DAMAGE_PER_STRENGTH + weaponBonus + variance);
    }

    let critChance = CRIT_CHANCE + (this.equipmentBonuses.critChance || 0) / 100;
    let critMultiplier = CRIT_MULTIPLIER;

    if (isBow) {
      // Лук: разница в ловкости с врагом → доп. шанс крита и доп. % урона крита
      const agilityDiff = Math.max(0, this.agility - enemyAgility);
      critChance += agilityDiff * BOW_CRIT_CHANCE_PER_AGILITY;
      critMultiplier += agilityDiff * BOW_CRIT_DAMAGE_PER_AGILITY;

      // Колчан — уникальный предмет во второй руке, срабатывает только с луком.
      const quiver = this.equipped.shield === "quiver" ? getUniqueItemById("quiver") : null;
      if (quiver?.bowBonus) {
        amount = Math.round(amount * (1 + quiver.bowBonus.damagePercent));
        critChance += quiver.bowBonus.critChance;
        critMultiplier += quiver.bowBonus.critMultiplier;
      }
    }

    const isCrit = Math.random() < critChance;
    if (isCrit) amount = Math.round(amount * critMultiplier);
    return { amount, isCrit };
  }

  /**
   * Бросок инициативы: d20 + agility.
   * CombatManager сравнивает бросок игрока с броском врага,
   * чтобы определить кто атакует первым.
   */
  rollInitiative() {
    return Math.floor(Math.random() * 20) + 1 + this.agility;
  }

  /**
   * Получить урон с учётом брони и пробития.
   * Пробитие = max(0, ловкость атакующего - броня).
   * Эффективная броня = max(0, броня - пробитие).
   * Итоговый урон = max(1, incoming - effectiveArmor).
   * Возвращает { blocked, taken, penetrated }.
   */
  takeDamage(incoming, attackerAgility = 0, targetPartId = null) {
    const penetration = Math.max(0, attackerAgility - this.armor);
    const effectiveArmor = Math.max(0, this.armor - penetration);
    const blocked = Math.min(effectiveArmor, incoming - 1);
    const taken = Math.max(1, incoming - effectiveArmor);

    // this.currentHP больше не отдельное поле — оно уменьшится само,
    // ровно настолько, насколько мы реально распределим `taken` по
    // частям тела в цикле ниже.

    // Распределяем урон по частям тела: если урон превышает остаток HP
    // выбранной части (или часть уже уничтожена), избыток "переходит"
    // на другую случайную живую часть тела — вместо того, чтобы пропадать.
    const hitParts = [];
    const triedParts = new Set();
    let remaining = taken;
    let currentPartId = targetPartId || pickHitBodyPart();

    while (remaining > 0) {
      const part = this.bodyParts[currentPartId];
      triedParts.add(currentPartId);

      if (!part || part.currentHP <= 0) {
        const nextPartId = this._pickAnotherBodyPart(triedParts);
        if (!nextPartId) break; // все части тела уже уничтожены
        currentPartId = nextPartId;
        continue;
      }

      const partDef = BODY_PARTS.find((d) => d.id === currentPartId);
      const wasDisabled = part.currentHP <= 0;
      const applied = Math.min(remaining, part.currentHP);
      part.currentHP -= applied;
      remaining -= applied;
      const nowDisabled = part.currentHP <= 0;

      const pct = part.maxHP > 0 ? part.currentHP / part.maxHP : 0;
      const severity = getWoundSeverity(pct);

      const hadBandage = Boolean(this.bandagedParts[currentPartId]);
      if (hadBandage) {
        delete this.bandagedParts[currentPartId];
        delete this.bandageBonusHealLeft[currentPartId];
      }

      hitParts.push({
        id: currentPartId,
        name: partDef.name,
        nameAcc: partDef.nameAcc,
        icon: partDef.icon,
        currentHP: part.currentHP,
        maxHP: part.maxHP,
        pct,
        amount: applied,
        newlyDisabled: nowDisabled && !wasDisabled,
        ...severity,
      });

      bus.emit("player:body-part-damaged", { partId: currentPartId, amount: applied, current: part.currentHP, max: part.maxHP, pct, ...severity });

      if (hadBandage) {
        bus.emit("player:bandage-changed", { partId: currentPartId, active: false, broken: true });
        bus.emit("combat:log", { text: `Удар срывает и уничтожает бинт на ${partDef.nameAcc}!`, type: "damage" });
      }

      if (remaining > 0) {
        const nextPartId = this._pickAnotherBodyPart(triedParts);
        if (!nextPartId) break;
        bus.emit("combat:log", { text: `Урон проходит сквозь ${partDef.nameAcc} на другую часть тела!`, type: "damage" });
        currentPartId = nextPartId;
      }
    }

    bus.emit("player:damaged", { amount: taken, blocked, penetrated: penetration, incoming, current: this.currentHP, max: this.maxHP });

    if (this.currentHP === 0) {
      bus.emit("player:died", {});
    }

    const mainHit = hitParts[0] || null;

    return {
      blocked,
      taken,
      penetrated: penetration,
      part: mainHit,
      hitParts,
    };
  }

  /** Выбрать случайную живую часть тела, кроме уже задействованных. Возвращает id или null, если таких нет. */
  _pickAnotherBodyPart(excludeIds) {
    const candidates = BODY_PARTS.filter(
      (def) => !excludeIds.has(def.id) && this.bodyParts[def.id].currentHP > 0
    );
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)].id;
  }

  /**
   * Простое лечение — теперь алиас healWounds(). Раньше heal() поднимал
   * только общую цифру HP, не трогая части тела — источник рассинхрона.
   * Раз currentHP вычисляется из частей тела, "лечение мимо частей тела"
   * физически невозможно и не нужно.
   */
  heal(amount) {
    return this.healWounds(amount);
  }

  /**
   * Комплексное лечение (для не-боевых эффектов вроде фонтана):
   * восстанавливает общее HP И одновременно подлечивает КАЖДУЮ
   * часть тела на ту же величину (капается недостающим HP части).
   * В отличие от heal() — реально закрывает раны, а не только
   * поднимает общую цифру HP.
   */
  healWounds(amount) {
    // amount — это ОБЩИЙ пул лечения на всё тело (как у зелья), а не бюджет
    // на КАЖДУЮ часть отдельно. Раньше каждая часть получала до `amount` HP
    // независимо от других — из-за этого зелье на 25 HP при нескольких ранах
    // могло закрыть суммарно 100+ HP, а при одной глубокой ране — не долечить
    // её до конца, хотя по ощущениям зелье "потрачено полностью".
    //
    // Лечим сначала самые тяжёлые раны — иначе часть тела, которая просто
    // первая по списку (например, голова), забирала бы себе весь пул зелья,
    // оставляя более раненые части вообще без лечения.
    let remaining = amount;
    let totalPartsHealed = 0;

    const woundedDefsBySeverity = [...BODY_PARTS].sort((a, b) => {
      const pctA = this.bodyParts[a.id].maxHP > 0 ? this.bodyParts[a.id].currentHP / this.bodyParts[a.id].maxHP : 0;
      const pctB = this.bodyParts[b.id].maxHP > 0 ? this.bodyParts[b.id].currentHP / this.bodyParts[b.id].maxHP : 0;
      return pctA - pctB;
    });

    for (const def of woundedDefsBySeverity) {
      if (remaining <= 0) break;

      const part = this.bodyParts[def.id];
      const missing = part.maxHP - part.currentHP;
      if (missing <= 0) continue;

      const applied = Math.min(remaining, missing);
      part.currentHP += applied;
      totalPartsHealed += applied;
      remaining -= applied;

      const pct = part.maxHP > 0 ? part.currentHP / part.maxHP : 0;
      const severity = getWoundSeverity(pct);
      bus.emit("player:body-part-healed", {
        partId: def.id, amount: applied, current: part.currentHP, max: part.maxHP, pct, ...severity,
      });

      // Часть полностью зажила — бинт на ней больше не нужен.
      if (part.currentHP >= part.maxHP && this.bandagedParts[def.id]) {
        this.removeBandage(def.id);
      }
    }

    // this.currentHP — вычисляемое свойство (сумма частей тела), оно уже
    // поднялось само, ровно на totalPartsHealed — отдельная синхронизация
    // не нужна и рассинхрон в принципе невозможен.
    bus.emit("player:healed", { amount: totalPartsHealed, current: this.currentHP, max: this.maxHP });
    return totalPartsHealed;
  }

  gainXP(amount) {
    this.xp += amount;
    bus.emit("player:xp-gained", { amount, current: this.xp, max: this.xpToNext });

    const levelsGained = [];
    while (this.xp >= this.xpToNext) {
      this.xp -= this.xpToNext;
      this.level += 1;
      levelsGained.push(this.level);

      // Каждый уровень: +1 ко всем характеристикам автоматически
      const prevMaxHP = this.maxHP;
      this.stoicism += 1;
      this._baseStrength += 1;
      this._baseAgility += 1;
      this._reconcileHPAfterEquipChange(prevMaxHP);
    }
    levelsGained.forEach((level) => bus.emit("player:leveled-up", { level }));
  }

  gainGold(amount) {
    this.gold += amount;
    bus.emit("player:gold-changed", { gold: this.gold });
  }

  /**
   * Получить золото из "внешнего" источника (враг, сундук, фонтан и т.п.)
   * с учётом бонуса goldFind от золотой экипировки.
   * Возвращает итоговое (уже увеличенное) количество золота — пригодится для лога.
   */
  gainGoldWithBonus(baseAmount) {
    const finalAmount = Math.round(baseAmount * (1 + this.goldFind));
    this.gainGold(finalAmount);
    return finalAmount;
  }

  spendGold(amount) {
    if (this.gold < amount) return false;
    this.gold -= amount;
    bus.emit("player:gold-changed", { gold: this.gold });
    return true;
  }

  applyStatChoice(stat) {
    if (stat === "stoicism") {
      this.stoicism += 2;
      this._reconcileHPAfterEquipChange();
    } else if (stat === "strength") {
      this._baseStrength += 2;
      this._reconcileHPAfterEquipChange();
    } else if (stat === "agility") {
      this._baseAgility += 2;
    }
  }

  // ----------------------------------------------------------
  // инвентарь и экипировка
  // ----------------------------------------------------------

  addItem(itemId) {
    this.inventory[itemId] = (this.inventory[itemId] || 0) + 1;
    bus.emit("player:item-added", { itemId, count: this.inventory[itemId] });
  }

  getItemCount(itemId) {
    return this.inventory[itemId] || 0;
  }

  equipItem(itemId) {
    const item = getEquipmentById(itemId);
    if (!item || !this.inventory[itemId]) return;

    // Проверка требования к характеристике (например, молот требует силу > 10)
    const gearForm = getFormById(item.formId);
    if (gearForm?.requiresStrength && this.strength <= gearForm.requiresStrength) {
      bus.emit("combat:log", {
        text: `Недостаточно силы, чтобы поднять «${item.name}» (нужно больше ${gearForm.requiresStrength}).`,
        type: "system",
      });
      return;
    }

    // Проверка совместимости щита с оружием
    if (item.slot === "shield") {
      const weaponId = this.equipped["weapon"];
      if (weaponId) {
        const weapon = getEquipmentById(weaponId);
        const weaponForm = weapon ? getFormById(weapon.formId) : null;
        const shieldForm = getFormById(item.formId);
        if (weaponForm && weaponForm.twoHanded) {
          // двуручное оружие — только малый щит
          if (!shieldForm?.smallShield) {
            bus.emit("combat:log", {
              text: `Двуручное оружие несовместимо с обычным щитом.`,
              type: "system",
            });
            return;
          }
          // малый щит + двуручное: разрешено только если allowSmallShield
          if (!weaponForm.allowSmallShield) {
            bus.emit("combat:log", {
              text: `Это оружие требует обеих рук — щит невозможен.`,
              type: "system",
            });
            return;
          }
        }
      }
    }

    // Если надеваем двуручное оружие — снять обычный щит
    if (item.slot === "weapon") {
      const form = getFormById(item.formId);
      if (form?.twoHanded) {
        const shieldId = this.equipped["shield"];
        if (shieldId) {
          const shieldItem = getEquipmentById(shieldId);
          const shieldForm = shieldItem ? getFormById(shieldItem.formId) : null;
          // если щит не малый или двуручное не поддерживает малый щит
          if (!shieldForm?.smallShield || !form.allowSmallShield) {
            const prevMaxHP = this.maxHP;
            this.equipped["shield"] = null;
            this._reconcileHPAfterEquipChange(prevMaxHP);
            bus.emit("player:equipment-changed", { slot: "shield", itemId: null });
            bus.emit("combat:log", {
              text: `Щит снят: двуручное оружие требует обеих рук.`,
              type: "system",
            });
          }
        }
      }
    }

    const prevMaxHP = this.maxHP;
    this.equipped[item.slot] = itemId;
    this._reconcileHPAfterEquipChange(prevMaxHP);

    bus.emit("player:equipment-changed", { slot: item.slot, itemId });
  }

  /** Снимок текущего снаряжения (для рекордов и т.п.) — только занятые слоты. */
  getEquipmentSnapshot() {
    return EQUIPMENT_SLOTS
      .map((slot) => {
        const itemId = this.equipped[slot];
        if (!itemId) return null;
        const item = getEquipmentById(itemId);
        if (!item) return null;
        return { slot, name: item.name, icon: item.icon };
      })
      .filter(Boolean);
  }

  unequipSlot(slot) {
    if (!this.equipped[slot]) return;
    const prevMaxHP = this.maxHP;
    this.equipped[slot] = null;
    this._reconcileHPAfterEquipChange(prevMaxHP);

    bus.emit("player:equipment-changed", { slot, itemId: null });
  }

  /**
   * Продать предмет из рюкзака за половину его shopPrice.
   * Нельзя продать надетый предмет (сначала снять).
   * Возвращает { ok, reason, goldGained }.
   */
  isFavorite(itemId) {
    return this.favorites.has(itemId);
  }

  /** Переключить звёздочку "избранное" — избранные нельзя продать. */
  toggleFavorite(itemId) {
    const active = this.favorites.has(itemId);
    if (active) this.favorites.delete(itemId);
    else this.favorites.add(itemId);
    bus.emit("player:favorite-changed", { itemId, active: !active });
    return !active;
  }

  sellItem(itemId) {
    const isEquipped = Object.values(this.equipped).includes(itemId);
    const count = this.inventory[itemId] || 0;
    if (SALVAGE_RECIPES[itemId]) return { ok: false, reason: "unsellable" };
    if (this.favorites.has(itemId)) return { ok: false, reason: "favorite" };
    if (isEquipped && count < 2) return { ok: false, reason: "equipped" };
    if (!count) return { ok: false, reason: "not_owned" };

    const equipment = getEquipmentById(itemId);
    const consumable = !equipment ? getConsumableById(itemId) : null;
    const item = equipment || consumable;
    if (!item) return { ok: false, reason: "unknown" };

    const sellPrice = Math.max(1, Math.floor((item.shopPrice || 10) / 2));

    this.inventory[itemId] -= 1;
    if (this.inventory[itemId] <= 0) delete this.inventory[itemId];

    this.gainGold(sellPrice);
    bus.emit("player:item-sold", { itemId, goldGained: sellPrice });
    bus.emit("combat:log", {
      text: `Продано: ${renderIcon(item.icon)} ${item.name} (+${sellPrice} золота).`,
      type: "good",
    });
    return { ok: true, goldGained: sellPrice };
  }

  /**
   * Порвать предмет на сырьё вместо продажи — для вещей с shopPrice: 0,
   * которые нельзя продать за золото (см. SALVAGE_RECIPES). Работает
   * только для itemId из этого списка — вызывается отдельной кнопкой в UI.
   */
  salvageItem(itemId) {
    const recipe = SALVAGE_RECIPES[itemId];
    if (!recipe) return { ok: false, reason: "unknown" };
    const isEquipped = Object.values(this.equipped).includes(itemId);
    const count = this.inventory[itemId] || 0;
    if (isEquipped && count < 2) return { ok: false, reason: "equipped" };
    if (!count) return { ok: false, reason: "not_owned" };

    this.inventory[itemId] -= 1;
    if (this.inventory[itemId] <= 0) delete this.inventory[itemId];

    for (let i = 0; i < recipe.count; i++) this.addItem(recipe.itemId);

    const item = getEquipmentById(itemId);
    const materialItem = getConsumableById(recipe.itemId);
    bus.emit("player:item-sold", { itemId, goldGained: 0 });
    bus.emit("combat:log", {
      text: `${item?.name || itemId} порвано на сырьё: +${recipe.count} ${renderIcon(materialItem?.icon || "")} ${materialItem?.name || recipe.itemId}.`,
      type: "good",
    });
    return { ok: true, gained: recipe.count };
  }

  useConsumable(itemId) {
    const consumable = getConsumableById(itemId);
    if (!consumable || !this.inventory[itemId]) return false;

    if (consumable.bandage) {
      bus.emit("combat:log", {
        text: `${renderIcon(consumable.icon)} ${consumable.name} нужно наложить на раненую часть тела.`,
        type: "system",
      });
      return false;
    }

    if (consumable.poison) {
      // "Выпить" ядовитое зелье вместо того, чтобы смочить им оружие — чисто
      // по приколу. Полноценный DOT (как у врагов) тут ни к чему — это
      // шутки ради, а не отдельная механика самоотравления, поэтому один
      // плоский урон вместо тиков.
      this.inventory[itemId] -= 1;
      if (this.inventory[itemId] <= 0) delete this.inventory[itemId];

      bus.emit("player:item-used", { itemId });
      bus.emit("combat:log", {
        text: `${renderIcon(consumable.icon)} Ты выпиваешь ${consumable.name.toLowerCase()}... просто по приколу. Это было зря.`,
        type: "system",
      });

      const desired = Math.max(1, Math.round(this.maxHP * (consumable.selfDamagePercent || 0.1)));
      const taken = this._drainOtherBodyParts(desired, 1, null);
      if (taken > 0) {
        bus.emit("player:damaged", { amount: taken, blocked: 0, penetrated: 0, incoming: taken, current: this.currentHP, max: this.maxHP });
        bus.emit("combat:log", { text: `🤢 Яд обжигает изнутри: -${taken} HP.`, type: "damage" });
      }

      return true;
    }

    if (consumable.healAmount && this.currentHP >= this.maxHP) {
      bus.emit("combat:log", {
        text: `Здоровье уже полное — ${consumable.name} не расходуется.`,
        type: "system",
      });
      return false;
    }

    this.inventory[itemId] -= 1;
    if (this.inventory[itemId] <= 0) delete this.inventory[itemId];

    if (consumable.healAmount) this.healWounds(consumable.healAmount);

    bus.emit("player:item-used", { itemId });
    bus.emit("combat:log", { text: `Использовано: ${renderIcon(consumable.icon)} ${consumable.name}.`, type: "good" });
    return true;
  }
  /**
   * Общая логика лечения одной части тела на amount HP: поднимает и часть,
   * и общий HP-пул, эмитит player:healed / player:body-part-healed.
   * Используется useConsumableOnBodyPart и applyBandage (instantHeal).
   */
  _healBodyPart(partId, amount) {
    const part = this.bodyParts[partId];
    const missingPart = part.maxHP - part.currentHP;
    const appliedToPart = Math.min(amount, missingPart);
    part.currentHP += appliedToPart;

    // Раньше сюда добавлялся ПОЛНЫЙ amount зелья, даже если часть тела
    // почти не была ранена и реально приняла куда меньше (appliedToPart) —
    // общий HP-бар "прыгал" сильнее, чем видимое лечение раны. Теперь
    // currentHP — сумма частей тела, поэтому он растёт ровно на
    // appliedToPart, синхронно с тем, что видно на теле.

    const pct = part.maxHP > 0 ? part.currentHP / part.maxHP : 0;
    const severity = getWoundSeverity(pct);
    const fullyHealed = part.currentHP >= part.maxHP;
    const partDef = BODY_PARTS.find((d) => d.id === partId);

    bus.emit("player:healed", { amount: appliedToPart, current: this.currentHP, max: this.maxHP });
    bus.emit("player:body-part-healed", { partId, amount: appliedToPart, current: part.currentHP, max: part.maxHP, pct, ...severity });

    return { appliedToPart, appliedOverall: appliedToPart, fullyHealed, partDef };
  }
  /**
   * Применить расходник (зелье и т.п.) прицельно к одной части тела.
   * Лечит эту часть на её healAmount (не больше её недостающего HP),
   * а также восстанавливает столько же общего HP игрока (как обычное зелье).
   * Возвращает true при успехе.
   */
  useConsumableOnBodyPart(itemId, partId) {
    const consumable = getConsumableById(itemId);
    const part = this.bodyParts[partId];
    if (!consumable || !consumable.healAmount || !this.inventory[itemId] || !part) return false;

    if (part.currentHP >= part.maxHP) {
      bus.emit("combat:log", { text: `Эта часть тела уже полностью здорова.`, type: "system" });
      return false;
    }

    this.inventory[itemId] -= 1;
    if (this.inventory[itemId] <= 0) delete this.inventory[itemId];

    const { appliedToPart, fullyHealed, partDef } = this._healBodyPart(partId, consumable.healAmount);

    bus.emit("player:item-used", { itemId });
    bus.emit("combat:log", {
      text: fullyHealed
        ? `Использовано: ${renderIcon(consumable.icon)} ${consumable.name}. Рана на ${partDef.nameAcc} полностью затянулась!`
        : `Использовано: ${renderIcon(consumable.icon)} ${consumable.name} на ${partDef.nameAcc} (+${appliedToPart} HP).`,
      type: "good",
    });
    return true;
  }
  /**
   * Смочить оружие ядовитым зельем: расходует одно "смачивание" у текущего
   * флакона (у каждого флакона их consumable.poisonCharges на старте) и
   * заряжает оружие — следующий УСПЕШНЫЙ удар (см. combat.js) отравит врага
   * и разрядит оружие. Когда у флакона заканчиваются собственные заряды —
   * он удаляется из инвентаря целиком (потрачен и рассыпался).
   */
  applyPoisonToWeapon(itemId) {
    const consumable = getConsumableById(itemId);
    if (!consumable || !consumable.poison || !this.inventory[itemId]) return false;

    if (!this.equipped.weapon) {
      bus.emit("combat:log", { text: "Нечего смачивать ядом — оружие не надето.", type: "system" });
      return false;
    }

    if (this.poisonFlaskCharges[itemId] == null) {
      this.poisonFlaskCharges[itemId] = consumable.poisonCharges;
    }

    this.weaponPoison = {
      damagePercent: consumable.poisonDamagePercent,
      ticks: consumable.poisonTicks,
      icon: consumable.icon,
      name: consumable.name,
    };

    this.poisonFlaskCharges[itemId] -= 1;
    const chargesLeft = this.poisonFlaskCharges[itemId];

    bus.emit("player:item-used", { itemId });
    bus.emit("combat:log", {
      text: `${renderIcon(consumable.icon)} Ты обмакиваешь оружие в ${consumable.name.toLowerCase()}. Следующий удар отравит врага. (Осталось смачиваний: ${chargesLeft})`,
      type: "good",
    });

    if (chargesLeft <= 0) {
      this.inventory[itemId] -= 1;
      if (this.inventory[itemId] <= 0) delete this.inventory[itemId];
      delete this.poisonFlaskCharges[itemId];
      bus.emit("combat:log", { text: `Флакон яда опустел и рассыпается в труху.`, type: "system" });
    }

    return true;
  }
  /**
   * Смочить обычный бинт в зелье здоровья: расходует 1 обычный бинт + 1 зелье,
   * взамен выдаёт пропитанный бинт. Маленькое зелье (health-potion) даёт
   * "зельевой бинт" (potion-bandage, +10/+10 HP), большое (big-health-potion)
   * даёт "красный бинт" (red-bandage, +15/+15 HP). Травяной или уже пропитанный
   * бинт смочить нельзя — только чистый "bandage".
   */
  soakBandage(bandageItemId = "bandage", potionId = "health-potion") {
    const SOAK_RECIPES = {
      "health-potion": { result: "potion-bandage", label: "зелье здоровья" },
      "big-health-potion": { result: "red-bandage", label: "большое зелье здоровья" },
    };
    const recipe = SOAK_RECIPES[potionId];

    if (bandageItemId !== "bandage" || !this.inventory[bandageItemId]) return false;
    if (!recipe) return false;
    if (!this.inventory[potionId]) {
      bus.emit("combat:log", { text: `Нужно ${recipe.label}, чтобы смочить бинт.`, type: "system" });
      return false;
    }

    this.inventory[bandageItemId] -= 1;
    if (this.inventory[bandageItemId] <= 0) delete this.inventory[bandageItemId];
    this.inventory[potionId] -= 1;
    if (this.inventory[potionId] <= 0) delete this.inventory[potionId];

    this.addItem(recipe.result);

    bus.emit("player:item-used", { itemId: potionId });
    bus.emit("combat:log", { text: "🧪 Бинт смочен в зелье здоровья — теперь при наложении он лечит вдвойне.", type: "good" });
    return true;
  }
  applyBandage(itemId, partId) {
    const consumable = getConsumableById(itemId);
    const part = this.bodyParts[partId];
    if (!consumable || !consumable.bandage || !this.inventory[itemId] || !part) return false;
    if (this.bandagedParts[partId]) {
      bus.emit("combat:log", { text: `На эту часть тела уже наложен бинт.`, type: "system" });
      return false;
    }
    if (part.currentHP >= part.maxHP) {
      bus.emit("combat:log", { text: `Эта часть тела уже полностью здорова — бинт не нужен.`, type: "system" });
      return false;
    }

    this.inventory[itemId] -= 1;
    if (this.inventory[itemId] <= 0) delete this.inventory[itemId];
    this.bandagedParts[partId] = itemId;

    // Царапина и любая рана тяжелее — "настоящая" рана (бинт запачкается
    // при снятии). Синяк/гематома — нет (см. MINOR_INJURY_KEYS).
    const pctAtApply = part.maxHP > 0 ? part.currentHP / part.maxHP : 0;
    const severityAtApply = getWoundSeverity(pctAtApply);
    this.bandageAppliedOnOpenWound[partId] =
      severityAtApply.key !== "healthy" && !MINOR_INJURY_KEYS.includes(severityAtApply.key);

    const partDef = BODY_PARTS.find((d) => d.id === partId);
    bus.emit("player:item-used", { itemId });
    bus.emit("player:bandage-changed", { partId, active: true });
    bus.emit("combat:log", { text: `${renderIcon(consumable.icon)} Наложен бинт на ${partDef.nameAcc}.`, type: "good" });

    // Травяной бинт (и любой другой бинт с instantHeal) лечит сразу при наложении.
    if (consumable.instantHeal) {
      const { appliedToPart, fullyHealed } = this._healBodyPart(partId, consumable.instantHeal);

      bus.emit("combat:log", {
        text: fullyHealed
          ? `Травы полностью затягивают рану на ${partDef.nameAcc}!`
          : `Травы в бинте сразу затягивают рану: +${appliedToPart} HP.`,
        type: "good",
      });
    }

    // Зельевой бинт (и любой другой бинт с bonusHealCharges): сверх мгновенного
    // instantHeal, ещё bonusHealCharges раз сработает bonusHealAmount на
    // следующих тиках tickBandages — см. там.
    if (consumable.bonusHealCharges) {
      this.bandageBonusHealLeft[partId] = consumable.bonusHealCharges;
    }

    return true;
  }
  /** Добровольно снять бинт — возвращается в рюкзак для повторного использования. */
  removeBandage(partId) {
    const itemId = this.bandagedParts[partId];
    if (!itemId) return false;

    delete this.bandagedParts[partId];
    const wasOpenWound = Boolean(this.bandageAppliedOnOpenWound[partId]);
    delete this.bandageAppliedOnOpenWound[partId];
    delete this.bandageBonusHealLeft[partId];

    // Травяной бинт после снятия деградирует в обычный (травы уже впитались) —
    // но если бинт снят с настоящей раны, он в любом случае становится грязным,
    // это приоритетнее деградации трав.
    const consumable = getConsumableById(itemId);
    const returnedId = wasOpenWound ? "dirty-bandage" : (consumable?.revertsTo || itemId);
    this.addItem(returnedId);

    const partDef = BODY_PARTS.find((d) => d.id === partId);
    bus.emit("player:bandage-changed", { partId, active: false });
    const note = wasOpenWound
      ? " Бинт пропитался кровью и стал грязным — его нужно очистить перед повторным использованием."
      : (returnedId !== itemId ? " Травы впитались — вернулся обычный бинт." : "");
    bus.emit("combat:log", { text: `Бинт снят с ${partDef.nameAcc} и возвращён в рюкзак.${note}`, type: "system" });
    return true;
  }
  /** Очистить грязный бинт — возвращает его в обычный, готовый к повторному наложению. */
  cleanBandage(itemId) {
    if (itemId !== "dirty-bandage" || !this.inventory[itemId]) return false;

    this.inventory[itemId] -= 1;
    if (this.inventory[itemId] <= 0) delete this.inventory[itemId];
    this.addItem("bandage");

    bus.emit("player:item-used", { itemId });
    bus.emit("combat:log", { text: `🧼 Грязный бинт отстиран дочиста — снова готов к использованию.`, type: "good" });
    return true;
  }
  /** Раз за боевой ход: все забинтованные части лечатся на грейд (плюс бонус зельевого бинта на первом тике). */
  tickBandages() {
    for (const partId of Object.keys(this.bandagedParts)) {
      const part = this.bodyParts[partId];
      if (!part) continue;

      // Зельевой бинт (и любой другой бинт с bonusHealCharges): сверх
      // обычного лечения по грейду ниже, ещё раз впитывается зелье, которым
      // он смочен (+bonusHealAmount HP за заряд, см. soakBandage/applyBandage).
      if (this.bandageBonusHealLeft[partId] > 0) {
        const bandageConsumable = getConsumableById(this.bandagedParts[partId]);
        const bonusAmount = bandageConsumable?.bonusHealAmount || 0;
        const { appliedToPart, fullyHealed, partDef: bonusPartDef } = this._healBodyPart(partId, bonusAmount);

        this.bandageBonusHealLeft[partId] -= 1;
        if (this.bandageBonusHealLeft[partId] <= 0) delete this.bandageBonusHealLeft[partId];

        if (appliedToPart > 0) {
          bus.emit("combat:log", {
            text: fullyHealed
              ? `🧪 Зелье в бинте окончательно затягивает рану на ${bonusPartDef.nameAcc}!`
              : `🧪 Зелье в бинте впитывается в ${bonusPartDef.nameAcc}: +${appliedToPart} HP.`,
            type: "good",
          });
        }

        if (part.currentHP >= part.maxHP) {
          this.removeBandage(partId);
          continue;
        }
      }

      const before = part.currentHP;
      healBodyPartByOneGrade(part);
      const partHealed = part.currentHP - before;

      // currentHP вычисляется из частей тела — он уже поднялся сам сразу
      // после healBodyPartByOneGrade(part) выше, просто оповещаем UI.
      if (partHealed > 0) {
        bus.emit("player:healed", { amount: partHealed, current: this.currentHP, max: this.maxHP });
      }

      const pct = part.maxHP > 0 ? part.currentHP / part.maxHP : 0;
      const severity = getWoundSeverity(pct);
      bus.emit("player:body-part-healed", { partId, amount: partHealed, current: part.currentHP, max: part.maxHP, pct, ...severity });

      if (partHealed > 0) {
        const partDef = BODY_PARTS.find((d) => d.id === partId);
        const fullyHealed = part.currentHP >= part.maxHP;
        bus.emit("combat:log", {
          text: fullyHealed
            ? `Бинт полностью излечивает рану на ${partDef.nameAcc}!`
            : `Бинт лечит ${partDef.nameAcc} до состояния «${severity.label}».`,
          type: "good",
        });
      }

      if (part.currentHP >= part.maxHP) this.removeBandage(partId);
    }
  }
  /**
   * Только на привале (не между тиками боя!) — синяки и гематомы, самые
   * лёгкие степени ранений, заживают сами, без бинта. Открытые раны
   * (scratch и тяжелее) это не лечит — для них по-прежнему нужен бинт
   * или зелье. Вызывается из restTick() в main.js, а не из боевого цикла.
   * Возвращает массив id залеченных частей (для лога/UI).
   */
  healMinorInjuries() {
    const healedParts = [];
    for (const def of BODY_PARTS) {
      const part = this.bodyParts[def.id];
      if (!part || part.currentHP >= part.maxHP) continue;

      const pct = part.maxHP > 0 ? part.currentHP / part.maxHP : 0;
      const severity = getWoundSeverity(pct);
      if (!MINOR_INJURY_KEYS.includes(severity.key)) continue;

      const before = part.currentHP;
      part.currentHP = part.maxHP;
      const healedAmount = part.currentHP - before;
      healedParts.push(def.id);

      bus.emit("player:healed", { amount: healedAmount, current: this.currentHP, max: this.maxHP });
      bus.emit("player:body-part-healed", {
        partId: def.id,
        amount: healedAmount,
        current: part.currentHP,
        max: part.maxHP,
        pct: 1,
        key: "healthy",
        label: "Здорова",
        icon: null,
      });
    }

    if (healedParts.length > 0) {
      bus.emit("combat:log", {
        text: "Мелкие синяки и гематомы затягиваются сами собой во время привала.",
        type: "good",
      });
    }

    return healedParts;
  }
  /**
   * Раз за тик (боевой ход или вне боя): если на шее рана степени
   * "wound" или хуже — снимает фиксированный % от maxHP (не от текущего
   * HP, см. комментарий у NECK_BLEED_PCT_BY_GRADE). Не трогает саму
   * шею (её currentHP) — кровотечение не ухудшает рану само по себе,
   * только повторный удар в бою может это сделать.
   * Возвращает { amount, severity, current } или null, если крови нет
   * или игрок уже мёртв (чтобы не долбить события на труп).
   */
  tickBleeding() {
    if (!this.isAlive) return null;

    const neck = this.bodyParts["neck"];
    if (!neck) return null;

    const pct = neck.maxHP > 0 ? neck.currentHP / neck.maxHP : 0;
    const severity = getWoundSeverity(pct);
    const bleedPct = NECK_BLEED_PCT_BY_GRADE[severity.key];
    if (!bleedPct) return null; // healthy / scratch — не кровоточит

    // Забинтованная шея всё ещё сочится (бинт не лечит мгновенно), но
    // не даёт кровотечению добить игрока до нуля — пол в 1 HP вместо 0.
    const isBandaged = Boolean(this.bandagedParts["neck"]);
    const floor = isBandaged ? 1 : 0;

    // Раньше кровотечение снимало HP только "в общем", не трогая части
    // тела — из-за этого части могли быть полностью залечены зельем, а
    // общий HP-бар оставался ниже максимума и его было нечем долечить
    // (healWounds лечит по недостающему HP частей, а недостатка там уже
    // не было). Теперь кровопотеря честно снимается с частей тела —
    // пропорционально, со всех частей КРОМЕ самой шеи (рана от этого не
    // усугубляется сама по себе, как и было задумано) — общий HP-бар и
    // части тела больше не могут разойтись.
    const desired = Math.max(1, Math.round(this.maxHP * bleedPct));
    const taken = this._drainOtherBodyParts(desired, floor, "neck");
    if (taken <= 0) return null; // уже уперлись в пол (0 или 1) — тик тихо пропускаем

    // Переиспользуем ровно тот же контракт, что и takeDamage(): UI обновляет
    // HP-бар и запускает геймовер не сам по себе, а именно по этим двум
    // событиям — свой отдельный "player:bled" никто не слушал, поэтому
    // HP на карточке "зависал", а геймовер не появлялся вообще.
    bus.emit("player:damaged", { amount: taken, blocked: 0, penetrated: 0, incoming: taken, current: this.currentHP, max: this.maxHP });
    bus.emit("combat:log", {
      text: isBandaged
        ? `🩸 Бинт на шее сочится кровью, но держит рану (${severity.label.toLowerCase()}): -${taken} HP.`
        : `🩸 Кровь хлещет из раны на шее (${severity.label.toLowerCase()}): -${taken} HP.`,
      type: "damage",
    });

    if (this.currentHP === 0) {
      bus.emit("player:died", {});
    }

    return { amount: taken, severity: severity.key, current: this.currentHP, bandaged: isBandaged };
  }

  /** Заразить игрока ядом со стрелы: фиксированный урон за тик на заданное число тиков. Повторное заражение обновляет длительность/урон, не складывается. */
  applyPoison(damagePerTick, ticks) {
    this.poisonDamagePerTick = Math.max(1, Math.round(damagePerTick));
    this.poisonTicksLeft = ticks;
  }

  /**
   * Один тик яда (раз за боевой раунд, аналог tickBleeding()). В отличие
   * от кровотечения из шеи, яд не щадит ни одну часть тела и может убить
   * (floor = 0). Возвращает { amount, ticksLeft } или null, если яда нет
   * или игрок уже мёртв.
   */
  tickPoison() {
    if (!this.isAlive || this.poisonTicksLeft <= 0) return null;

    const taken = this._drainOtherBodyParts(this.poisonDamagePerTick, 0, null);
    this.poisonTicksLeft -= 1;
    if (taken <= 0) return { amount: 0, ticksLeft: this.poisonTicksLeft };

    bus.emit("player:damaged", { amount: taken, blocked: 0, penetrated: 0, incoming: taken, current: this.currentHP, max: this.maxHP, poison: true });
    bus.emit("combat:log", {
      text: this.poisonTicksLeft > 0
        ? `☠️ Яд разъедает тебя изнутри: -${taken} HP (ещё ${this.poisonTicksLeft} х.).`
        : `☠️ Яд в последний раз обжигает тебя: -${taken} HP. Действие яда закончилось.`,
      type: "damage",
    });

    if (this.currentHP === 0) {
      bus.emit("player:died", {});
    }

    return { amount: taken, ticksLeft: this.poisonTicksLeft };
  }

  /**
   * Снимает до `amount` HP пропорционально со всех частей тела, кроме
   * excludePartId, не давая общему HP уйти ниже floor. Используется
   * кровотечением из шеи: ослабляет тело в целом, но не усугубляет саму
   * рану на шее. Рассылает player:body-part-damaged по каждой затронутой
   * части, чтобы силуэт в CharacterView обновился визуально, а не только
   * общий HP-бар. Возвращает реально снятое количество HP.
   */
  _drainOtherBodyParts(amount, floor, excludePartId) {
    const eligible = BODY_PARTS.filter(
      (def) => def.id !== excludePartId && this.bodyParts[def.id].currentHP > 0
    );
    if (eligible.length === 0) return 0;

    const availableAboveFloor = Math.max(0, this.currentHP - floor);
    let remaining = Math.min(amount, availableAboveFloor);
    if (remaining <= 0) return 0;

    const totalEligibleHP = eligible.reduce((sum, def) => sum + this.bodyParts[def.id].currentHP, 0);
    let drained = 0;

    for (const def of eligible) {
      if (remaining <= 0) break;
      const part = this.bodyParts[def.id];
      const share = totalEligibleHP > 0 ? part.currentHP / totalEligibleHP : 1 / eligible.length;
      const wanted = Math.min(part.currentHP, remaining, Math.round(amount * share) || 1);
      if (wanted <= 0) continue;

      part.currentHP -= wanted;
      drained += wanted;
      remaining -= wanted;

      const pct = part.maxHP > 0 ? part.currentHP / part.maxHP : 0;
      const severity = getWoundSeverity(pct);
      bus.emit("player:body-part-damaged", { partId: def.id, amount: wanted, current: part.currentHP, max: part.maxHP, pct, ...severity });
    }

    return drained;
  }
  /**
   * Скрафтить предмет по рецепту.
   * Возвращает { ok, reason } — ok: true при успехе.
   */
  craft(recipe) {
    // Проверяем, хватает ли ингредиентов
    for (const [itemId, needed] of Object.entries(recipe.ingredients)) {
      if ((this.inventory[itemId] || 0) < needed) {
        return { ok: false, reason: "not_enough" };
      }
    }
    // Списываем ингредиенты
    for (const [itemId, needed] of Object.entries(recipe.ingredients)) {
      this.inventory[itemId] -= needed;
      if (this.inventory[itemId] <= 0) delete this.inventory[itemId];
    }
    // Добавляем результат
    const { itemId, count = 1 } = recipe.result;
    for (let i = 0; i < count; i++) this.addItem(itemId);

    bus.emit("player:crafted", { recipe });
    return { ok: true };
  }

  _reconcileHPAfterEquipChange() {
    // Части тела пересчитываются с сохранением % здоровья — currentHP
    // (вычисляемое свойство, сумма частей тела) обновится автоматически,
    // отдельно его больше нигде выставлять не нужно.
    this._reconcileBodyParts();
  }
}