// data/crafting.js
// ============================================================
// Рецепты для рабочей станции.
// ingredients: { itemId: count } — что нужно из инвентаря
// result:      { itemId, count } — что получится
// ============================================================

export const RECIPES = [
{
    id: "craft-health-potion",
    name: "Зелье здоровья",
    icon: "img/items/potion_red.png",
    ingredients: { "healing-herb": 3 },
    result: { itemId: "health-potion", count: 1 },
    description: "3 лечебные травы → Зелье здоровья (+25 HP)",
  },
  {
    id: "craft-big-health-potion",
    name: "Большое зелье здоровья",
    icon: "img/items/big_potion_red.png",
    ingredients: { "healing-herb": 6 },
    result: { itemId: "big-health-potion", count: 1 },
    description: "6 лечебных трав → Большое зелье (+40 HP)",
  },
  {
      id: "craft-big-health-potion-from-potions",
      name: "Большое зелье здоровья", 
      icon: "img/items/big_potion_red.png",
      ingredients: { "health-potion": 2 },
      result: { itemId: "big-health-potion", count: 1 },
      description: "2 зелья здоровья → Большое зелье (+40 HP)",
  },
  {
    id: "craft-cotton",
    name: "Ткань",
    icon: "img/items/cotton.png",
    ingredients: { "healing-herb": 4 },
    result: { itemId: "cotton", count: 1 },
    description: "4 лечебные травы → Ткань",
  },
  {
    id: "craft-cotton-from-stalks",
    name: "Ткань",
    icon: "img/items/cotton.png",
    ingredients: { "cotton-stalk": 2 },
    result: { itemId: "cotton", count: 1 },
    description: "2 стебля хлопка → Ткань",
  },
  {
    id: "craft-bandage",
    name: "Бинт",
    icon: "img/items/bandage.png",
    ingredients: { "cotton": 3 },
    result: { itemId: "bandage", count: 1 },
    description: "3 ткани → Бинт",
  },
  {
    id: "craft-herbs-bandage",
    name: "Травяной бинт",
    icon: "img/items/herbs_bandage.png",
    ingredients: { "bandage": 1, "healing-herb": 2 },
    result: { itemId: "herbs-bandage", count: 1 },
    description: "Бинт + 2 лечебные травы → Травяной бинт (+10 HP сразу при наложении)",
  },
  {
    id: "craft-red-bandage",
    name: "Красный бинт",
    icon: "img/items/heal_bandage.png",
    ingredients: { "bandage": 1, "big-health-potion": 1 },
    result: { itemId: "red-bandage", count: 1 },
    description: "Бинт + Большое зелье здоровья → Красный бинт (+15 HP сразу при наложении)",
  },
  {
    id: "craft-cloth-wraps",
    name: "Тканевые обмотки",
    icon: "img/items/hand_wraps.png",
    ingredients: { "cotton": 3 },
    result: { itemId: "cloth-wraps", count: 1 },
    description: "3 ткани → Тканевые обмотки (+2 силы, +2 ловкости)",
  },
];
