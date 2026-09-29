// data/body-parts.js
// ============================================================
// Части тела игрока.
// hpShare   — доля от общего maxHP, которая достаётся части тела.
// hitWeight — вес при случайном выборе, куда попадает атака врага
//             (туловище — самая крупная цель, голова — самая редкая).
// nameAcc   — форма в винительном падеже, для боевого лога
//             ("наносит удар в ...").
// ============================================================

export const BODY_PARTS = [
  { id: "head",       name: "Голова",       nameAcc: "голову",       icon: "🎯", hpShare: 0.13,  hitWeight: 6  },
  { id: "neck",        name: "Шея",          nameAcc: "шею",          icon: "🔘", hpShare: 0.04,  hitWeight: 3  },
  { id: "torso",       name: "Туловище",     nameAcc: "туловище",     icon: "🟫", hpShare: 0.30,  hitWeight: 38 },
  { id: "left-arm",    name: "Левая рука",   nameAcc: "левую руку",   icon: "💪", hpShare: 0.10,  hitWeight: 10 },
  { id: "right-arm",   name: "Правая рука",  nameAcc: "правую руку",  icon: "💪", hpShare: 0.10,  hitWeight: 10 },
  { id: "left-hand",   name: "Левая кисть",  nameAcc: "левую кисть",  icon: "🖐️", hpShare: 0.04,  hitWeight: 5  },
  { id: "right-hand",  name: "Правая кисть", nameAcc: "правую кисть", icon: "🖐️", hpShare: 0.04,  hitWeight: 5  },
  { id: "left-leg",    name: "Левая нога",   nameAcc: "левую ногу",   icon: "🦵", hpShare: 0.10,  hitWeight: 11 },
  { id: "right-leg",   name: "Правая нога",  nameAcc: "правую ногу",  icon: "🦵", hpShare: 0.10,  hitWeight: 11 },
  { id: "left-foot",   name: "Левая стопа",  nameAcc: "левую стопу",  icon: "🦶", hpShare: 0.025, hitWeight: 3  },
  { id: "right-foot",  name: "Правая стопа", nameAcc: "правую стопу", icon: "🦶", hpShare: 0.025, hitWeight: 3  },
];

const WOUND_ICONS = [
  "img/wounds/damage_0.png", // царапина
  "img/wounds/damage_1.png", // рана
  "img/wounds/damage_2.png", // Глубокая рана
  "img/wounds/damage_3.png", // Тяжёлое ранение
  "img/wounds/damage_4.png", // Искалечено
];

// Синяк и гематома — вне общей последовательности damage_0..4 (это не
// "лёгкие версии царапины", а две отдельные самые слабые степени перед
// ней), поэтому не кладём их в WOUND_ICONS и не трогаем нумерацию woundIcon().
const BRUISE_ICON = "img/wounds/damage_5.png";
const HEMATOMA_ICON = "img/wounds/damage_6.png";

// Степени, которые заживают сами на привале без бинта (см. main.js restTick /
// player.healMinorInjuries) — синяк и гематома, лёгкие ушибы, а не открытые раны.
export const MINOR_INJURY_KEYS = ["bruise", "hematoma"];

function woundIcon(index) {
  return WOUND_ICONS[Math.min(index, WOUND_ICONS.length - 1)];
}

export function getWoundSeverity(pct) {
  if (pct >= 1)    return { key: "healthy",      label: "Здорова",         icon: null };
  if (pct >= 0.95) return { key: "bruise",       label: "Синяк",           icon: BRUISE_ICON };
  if (pct >= 0.85) return { key: "hematoma",     label: "Гематома",        icon: HEMATOMA_ICON };
  if (pct >= 0.75) return { key: "scratch",      label: "Царапина",       icon: woundIcon(0) };
  if (pct >= 0.5)  return { key: "wound",        label: "Рана",            icon: woundIcon(1) };
  if (pct >= 0.25) return { key: "deep-wound",   label: "Глубокая рана",   icon: woundIcon(2) };
  if (pct > 0)     return { key: "severe-wound", label: "Тяжёлое ранение", icon: woundIcon(3) };
  return               { key: "disabled",     label: "Искалечено",        icon: woundIcon(4) };
}

/** Взвешенно выбрать случайную часть тела, куда пришёлся удар. */
export function pickHitBodyPart() {
  const totalWeight = BODY_PARTS.reduce((sum, def) => sum + def.hitWeight, 0);
  let roll = Math.random() * totalWeight;
  for (const def of BODY_PARTS) {
    roll -= def.hitWeight;
    if (roll <= 0) return def.id;
  }
  return BODY_PARTS[0].id;
}
/** Поднять часть тела на один "грейд" исцеления (используется бинтами). */
export function healBodyPartByOneGrade(part) {
  const pct = part.maxHP > 0 ? part.currentHP / part.maxHP : 0;
  let targetHP;
  if (pct <= 0)        targetHP = Math.max(1, Math.ceil(part.maxHP * 0.01)); // disabled -> severe-wound
  else if (pct < 0.25) targetHP = Math.ceil(part.maxHP * 0.25);              // -> deep-wound
  else if (pct < 0.5)  targetHP = Math.ceil(part.maxHP * 0.5);               // -> wound
  else if (pct < 0.75) targetHP = Math.ceil(part.maxHP * 0.75);              // -> scratch
  else                 targetHP = part.maxHP;                               // -> healthy

  part.currentHP = Math.min(part.maxHP, Math.max(part.currentHP, targetHP));
}

/**
 * Распределяет общий maxHP игрока по частям тела согласно их hpShare.
 * Раньше maxHP каждой части считался независимым Math.round(...), из-за
 * чего сумма maxHP всех частей могла НЕ совпадать с общим maxHP игрока
 * (расхождение в несколько HP из-за округления) — одна из причин бага
 * "тело полностью здорово, а общий HP ниже максимума". Торс (самая
 * крупная часть) забирает остаток после округления остальных частей —
 * сумма всегда точно равна totalMaxHP.
 */
export function distributePartMaxHPs(totalMaxHP) {
  const maxHPs = {};
  let assigned = 0;
  for (const def of BODY_PARTS) {
    if (def.id === "torso") continue;
    const value = Math.max(1, Math.round(totalMaxHP * def.hpShare));
    maxHPs[def.id] = value;
    assigned += value;
  }
  maxHPs["torso"] = Math.max(1, totalMaxHP - assigned);
  return maxHPs;
}