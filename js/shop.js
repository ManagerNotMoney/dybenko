// shop.js
// ============================================================
// Превращает данные из data/shop-items.js в готовые для отображения
// товары и обрабатывает покупку/продажу.
// ============================================================

import { bus } from "./engine.js";
import { generateShopListing } from "./data/shop-items.js";
import { composeEquipment } from "./equipment.js";
import { getConsumableById } from "./data/consumables.js";
import { getUniqueItemById } from "./data/unique-items.js";
import { renderIcon } from "./ui/icon.js";

// Текущий список лавки — генерируется при каждом открытии магазина
let _currentListing = null;

/** Генерирует свежий список при открытии лавки. */
export function refreshShopListing() {
  _currentListing = generateShopListing().map((entry) => {
    if (entry.type === "equipment") {
      const item = composeEquipment(entry.materialId, entry.formId);
      return item ? { ...item, price: entry.price, kind: "equipment" } : null;
    }
    if (entry.type === "unique") {
      const item = getUniqueItemById(entry.itemId);
      return item ? { ...item, price: entry.price, kind: "equipment" } : null;
    }
    const consumable = getConsumableById(entry.consumableId);
    return consumable ? { ...consumable, price: entry.price, kind: "consumable" } : null;
  }).filter(Boolean);
  return _currentListing;
}

/** Возвращает текущий список (без перегенерации). */
export function getShopListing() {
  return _currentListing || refreshShopListing();
}

/** Пытается купить товар у игрока. Возвращает true при успехе. */
export function purchase(player, shopItem) {
  if (!player.spendGold(shopItem.price)) {
    bus.emit("combat:log", { text: "Не хватает золота.", type: "system" });
    return false;
  }

  player.addItem(shopItem.id);
  bus.emit("combat:log", {
    text: `Куплено: ${renderIcon(shopItem.icon)} ${shopItem.name} (-${shopItem.price} золота).`,
    type: "good",
  });
  return true;
}
