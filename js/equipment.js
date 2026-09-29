// equipment.js
// ============================================================
// Собирает готовое снаряжение из материала + формы. Ничего не
// хранит — предметы вычисляются на лету по id вида "wood-sword".
// Благодаря этому добавление нового материала или новой формы в
// каталоги (data/materials.js, data/equipment-forms.js) сразу же
// порождает все комбинации без правок здесь.
// ============================================================

import { MATERIALS, getMaterialById } from "./data/materials.js";
import { EQUIPMENT_FORMS, getFormById } from "./data/equipment-forms.js";
import { getUniqueItemById } from "./data/unique-items.js";

export function makeEquipmentId(materialId, formId) {
  return `${materialId}-${formId}`;
}

const STAT_LABELS = {
  damage: "урон",
  armor: "броня",
  maxHP: "макс. HP",
  agility: "ловкость",
  dodgeChance: "шанс уворота",
  goldFind: "доп. золото",
  critChance: "шанс крита",
};

const STAT_SUFFIX = {
  dodgeChance: "%",
  goldFind: "%",
  critChance: "%",
};

/** Собирает полноценный предмет из id материала и id формы. */
export function composeEquipment(materialId, formId) {
  const material = getMaterialById(materialId);
  const form = getFormById(formId);
  if (!material || !form) return null;

  // Некоторые материалы запрещены для определённых слотов
  // (например, "теневая ткань" нельзя пустить на оружие).
  if (material.excludedSlots && material.excludedSlots.includes(form.slot)) {
    return null;
  }

  // Некоторые формы куются только из ограниченного списка материалов
  // (например, перчатки — только кожа и теневая ткань).
  if (form.allowedMaterials && !form.allowedMaterials.includes(materialId)) {
    return null;
  }

  // Некоторые материалы годятся только под ограниченный список форм
  // (например, кожа — только под перчатки).
  if (material.allowedForms && !material.allowedForms.includes(formId)) {
    return null;
  }

  const rawTotal = form.baseBonus + material.bonusValue;
  const scalingIsArmor = form.scalingStat === "armor";
  const totalBonus = material.zeroArmor && scalingIsArmor ? 0 : rawTotal;

  const bonus = {};
  if (totalBonus !== 0) bonus[form.scalingStat] = totalBonus;
  const extraBonus = (material.extraBonusOverrides && material.extraBonusOverrides[formId]) || material.extraBonus;
  if (extraBonus) {
    for (const [stat, value] of Object.entries(extraBonus)) {
      bonus[stat] = (bonus[stat] || 0) + value;
    }
  }

  const slotPenalty = material.agilityPenaltyBySlot && material.agilityPenaltyBySlot[form.slot];
  if (slotPenalty) {
    bonus.agility = (bonus.agility || 0) + slotPenalty;
  }

  const extrasText = extraBonus
    ? Object.entries(extraBonus)
        .map(([stat, value]) => `${STAT_LABELS[stat] || stat} +${value}${STAT_SUFFIX[stat] || ""}`)
        .join(", ")
    : "";

  const penaltyText = slotPenalty ? `${STAT_LABELS.agility} ${slotPenalty}` : "";

  // Описание для кинжала — особое, т.к. урон скалирует от ловкости
  let description;
  if (form.dagger) {
    description = `${form.name}: база ${form.baseBonus}, материал «${material.name.toLowerCase()}» добавляет ${material.bonusValue}. Урон дополнительно усиливается ловкостью.`;
  } else if (form.warhammer) {
    description = `${form.name}: база ${form.baseBonus}, материал «${material.name.toLowerCase()}» добавляет ${material.bonusValue}. Требует силу больше ${form.requiresStrength}. Чем сильнее сила превышает ловкость — тем мощнее удар.`;
  } else if (material.zeroArmor && scalingIsArmor) {
    description = `${form.name} из «${material.name.toLowerCase()}»: не даёт брони, но ${extrasText}.`;
  } else {
    description = `${form.name}: база ${form.baseBonus}, материал «${material.name.toLowerCase()}» добавляет ${material.bonusValue}.`;
  }

  const bonusExtrasParts = [extrasText, penaltyText].filter(Boolean);
  if (bonusExtrasParts.length > 0 && !(material.zeroArmor && scalingIsArmor)) {
    description += ` Также: ${bonusExtrasParts.join(", ")}.`;
  }

  const overrideName = material.nameOverrides && material.nameOverrides[formId];
  const overrideIcon = material.iconOverrides && material.iconOverrides[formId];

  return {
    id: makeEquipmentId(materialId, formId),
    name: overrideName || `${material.name} ${form.name.toLowerCase()}`,
    icon: overrideIcon || form.icon,
    slot: form.slot,
    materialId,
    formId,
    materialName: material.name,
    materialColor: material.glowColor,
    bonus,
    description,
    shopPrice: form.baseBonus * 2 + material.shopPrice,
  };
}

/** Восстанавливает предмет по его id (например "iron-shield" или уникальный "quiver"). */
export function getEquipmentById(id) {
  const unique = getUniqueItemById(id);
  if (unique) return unique;

  for (const material of MATERIALS) {
    for (const form of EQUIPMENT_FORMS) {
      if (makeEquipmentId(material.id, form.id) === id) {
        return composeEquipment(material.id, form.id);
      }
    }
  }
  return null;
}

/** Все возможные комбинации материал×форма — пригодится для магазина. */
export function getAllEquipment() {
  const all = [];
  for (const material of MATERIALS) {
    for (const form of EQUIPMENT_FORMS) {
      const item = composeEquipment(material.id, form.id);
      if (item) all.push(item);
    }
  }
  return all;
}
