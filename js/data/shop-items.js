// data/shop-items.js
// ============================================================
// Витрина торговца. Пул товаров теперь строится автоматически
// из каталогов MATERIALS × EQUIPMENT_FORMS — добавил новый
// материал или форму в data/materials.js или data/equipment-forms.js —
// он сам появится в лавке, без правок этого файла.
// ============================================================

import { getMaterialById } from "./materials.js";
import { getAllEquipment } from "../equipment.js";
import { CONSUMABLES } from "./consumables.js";
import { UNIQUE_ITEMS } from "./unique-items.js";

// разброс цены вокруг базовой (±20%)
const PRICE_VARIANCE = 0.2;

function priceRange(base) {
  return {
    priceMin: Math.max(1, Math.round(base * (1 - PRICE_VARIANCE))),
    priceMax: Math.round(base * (1 + PRICE_VARIANCE)),
  };
}

/** Все комбинации материал×форма, у которых материал вообще продаётся. */
function buildEquipmentPool() {
  return getAllEquipment()
    .filter((item) => getMaterialById(item.materialId).shopPrice > 0) // напр. кость — только дроп, не в продаже
    .map((item) => ({
      type: "equipment",
      materialId: item.materialId,
      formId: item.formId,
      ...priceRange(item.shopPrice),
    }));
}

/**
 * Расходники (кроме сырья) — зелья здоровья (healAmount > 0) полностью
 * убраны из обычной лавки, теперь их можно купить только у Путника-Лекаря
 * (см. floor-events.js). Бинты (bandage: true) сюда тоже не попадают —
 * их единственный гарантированный источник покупки — тот же Путник-Лекарь.
 */
function buildConsumablePool() {
  return CONSUMABLES
    .filter((c) => !c.raw && !c.bandage && !c.dirty && !(c.healAmount > 0))
    .map((c) => ({
      type: "consumable",
      consumableId: c.id,
      ...priceRange(c.shopPrice),
    }));
}

/**
 * Уникальные предметы (например, колчан) — продаются как есть, без материал×форма.
 * shopPrice: 0 означает "не продаётся в лавке" (например, Рубаха — только дроп/квест).
 */
function buildUniquePool() {
  return UNIQUE_ITEMS
    .filter((item) => item.shopPrice > 0)
    .map((item) => ({
      type: "unique",
      itemId: item.id,
      ...priceRange(item.shopPrice),
    }));
}

const SHOP_POOL = [...buildEquipmentPool(), ...buildConsumablePool(), ...buildUniquePool()];

/** Сколько позиций показывать в лавке за одно посещение. */
const SHOP_SLOTS = 6;

/**
 * Генерирует случайный список товаров для лавки.
 * Каждый раз разный — вызывается при открытии магазина.
 */
export function generateShopListing() {
  const shuffled = [...SHOP_POOL].sort(() => Math.random() - 0.5);
  const seen = new Set();
  const chosen = [];
  for (const entry of shuffled) {
    const key = entry.type === "equipment"
      ? `${entry.materialId}-${entry.formId}`
      : entry.type === "unique"
        ? entry.itemId
        : entry.consumableId;
    if (seen.has(key)) continue;
    seen.add(key);
    chosen.push(entry);
    if (chosen.length >= SHOP_SLOTS) break;
  }

  return chosen.map((entry) => ({
    ...entry,
    price: Math.floor(entry.priceMin + Math.random() * (entry.priceMax - entry.priceMin + 1)),
  }));
}