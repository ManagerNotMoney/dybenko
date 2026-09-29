// data/floor-events.js
// ============================================================
// Каталог не-боевых узлов этажа: фонтаны, сундуки, ловушки и т.д.
// Построен по аналогии с data/enemies.js.
// ============================================================

export const FLOOR_EVENT_TYPES = [
  {
    id: "healing-fountain",
    name: "Лечебный фонтан",
    icon: "⛲",
    kind: "fountain",        // тип обработчика в FloorEventManager
    weight: 10,
    minDepth: 1,
    maxDepth: null,
    description: "Прозрачная вода источает тепло и лёгкое сияние.",
    healPercent: 0.5,        // восстанавливает 50% от maxHP
  },
  {
    id: "treasure-chest",
    name: "Сундук",
    icon: "🎁",
    kind: "chest",
    weight: 8,
    minDepth: 1,
    maxDepth: null,
    description: "Потёртый деревянный сундук, запертый на ржавый замок.",
    goldReward: [10, 30],
    itemChance: 0.6,
  },
  {
    id: "trapped-chest",
    name: "Подозрительный сундук",
    icon: "📦",
    kind: "trap-chest",
    weight: 4,
    minDepth: 2,
    maxDepth: null,
    description: "Что-то в этом сундуке настораживает...",
    trapChance: 0.5,
    trapDamagePercent: 0.15, // % от maxHP при срабатывании ловушки
    goldReward: [15, 40],
    itemChance: 0.7,
  },
  {
    id: "skeleton-merchant",
    name: "Скелет-Торговец",
    icon: "💀",
    kind: "skeleton-merchant",
    weight: 5,
    minDepth: 20,
    maxDepth: 40,
    description: "Дребезжащий силуэт среди костей раскладывает на истлевшей ткани костяные диковины.",
  },
  {
    id: "traveler-healer",
    name: "Путник-Лекарь",
    icon: "🧑‍⚕️",
    kind: "traveler-healer",
    weight: 14,
    minDepth: 1,
    maxDepth: null,
    description: "Странствующий лекарь раскладывает на потёртой холстине зелья и свежие бинты — но запасы у него не бесконечны.",
  },
  {
    id: "goblin-herb-farm",
    name: "Гоблинская ферма (травы)",
    icon: "🌿",
    kind: "goblin-farm",
    weight: 6,
    minDepth: 1,
    maxDepth: 40,
    description: "Гоблины разбили грядки с лечебными травами прямо посреди подземелья.",
    resource: "healing-herb",
    resourceIcon: "img/items/herbs.png",
    rewardRange: [2, 5],
  },
  {
    id: "goblin-cotton-farm",
    name: "Гоблинская ферма (хлопок)",
    icon: "🌾",
    kind: "goblin-farm",
    weight: 6,
    minDepth: 1,
    maxDepth: 40,
    description: "Кривые грядки хлопка — похоже, гоблины освоили не только травы.",
    resource: "cotton-stalk",
    resourceIcon: "img/items/cotton_stalk.png",
    rewardRange: [2, 4],
  },
  {
    id: "goblin-weapon-stash",
    name: "Оружейный тайник гоблинов",
    icon: "🗡️",
    kind: "goblin-stash",
    weight: 5,
    minDepth: 3,
    maxDepth: 40,
    description: "Свалка помятого оружия и доспехов — гоблины натаскали трофеев со всего подземелья.",
    materials: ["wood", "copper"], // из чего может быть найденный предмет
  },
  {
    id: "goblin-brew-seller",
    name: "Гоблин-Зельевар",
    icon: "img/enemies/goblin_warrior.png",
    kind: "goblin-brew",
    weight: 5,
    minDepth: 1,
    maxDepth: 40,
    description: "Мутный гоблин протягивает флягу с булькающим варевом и хитро улыбается.",
    healPercent: 0.25,          // 50% шанс: лечит 25% от maxHP
    poisonDamagePercent: 0.2,   // 50% шанс: травит на 20% от maxHP
  },
  {
    id: "bone-pile",
    name: "Гора костей",
    icon: "🦴",
    kind: "bone-pile",
    weight: 6,
    minDepth: 40,
    maxDepth: 100,
    description: "Курган из побелевших костей — если покопаться, можно найти что-то стоящее.",
    itemChance: 0.25,
  },
  {
    id: "sword-in-stone",
    name: "Меч в камне",
    icon: "⚔️",
    kind: "sword-in-stone",
    weight: 3,
    minDepth: 10,
    maxDepth: 40,
    description: "Древний клинок, наполовину вросший в камень, тускло светится золотом.",
    requiredStrength: 12,   // нужно строго больше этого значения силы
    statBonus: { stoicism: 2, strength: 2 },
  },
  {
    id: "training-dummy",
    name: "Тренировочный манекен",
    icon: "🎯",
    kind: "training-dummy",
    weight: 2,
    minDepth: 1,
    maxDepth: 40,
    description: "Потрёпанное чучело из соломы и тряпья — самое время проверить удар.",
  },
  {
    id: "blood-altar",
    name: "Кровавый алтарь",
    icon: "🩸",
    kind: "blood-altar",
    weight: 4,
    minDepth: 5,
    maxDepth: null,
    description: "Тёмный камень, испещрённый рунами, алчет свежей крови в обмен на стойкость духа.",
    hpCostPercent: 0.25,     // забирает 25% от maxHP
    statBonus: { stoicism: 5 },
  },
  {
    id: "wounded-traveler",
    name: "Раненый путник",
    icon: "🧎",
    kind: "wounded-traveler",
    weight: 20,
    minDepth: 1,
    maxDepth: null,
    description: "Путник зажимает рану и с надеждой смотрит на твой пояс с бинтами.",
    costOptions: [
      { itemId: "bandage", count: 2, label: "2 бинта", icon: "🩹" },
      { itemId: "herbs-bandage", count: 2, label: "2 травяных бинта", icon: "🌿" },
      { itemId: "potion-bandage", count: 1, label: "зельевой бинт", icon: "🧪" },
      { itemId: "red-bandage", count: 1, label: "красный бинт", icon: "🔴" },
    ],
  },
  {
    id: "whispering-wall-hole",
    name: "Дыра в стене",
    icon: "👂",
    kind: "wall-whisper",
    weight: 4,
    minDepth: 3,
    maxDepth: null,
    description: "Из тёмной трещины доносится вкрадчивый шёпот, зовущий просунуть руку внутрь.",
    successChance: 0.3,
  },
  {
    id: "hanged-corpse",
    name: "Повешенный в цепях",
    icon: "⛓️",
    kind: "hanged-corpse",
    weight: 5,
    minDepth: 3,
    maxDepth: null,
    description: "Раскачивающееся в цепях тело — карманы могут скрывать что-то ценное, но кандалы остры как бритва.",
    itemChance: 0.5,
    materials: ["iron", "copper"],
    cutChance: 0.35,
  },
  {
    id: "penitent-font",
    name: "Купель раскаяния",
    icon: "🕯️",
    kind: "penitent-font",
    weight: 5,
    minDepth: 1,
    maxDepth: null,
    description: "Тёмная вода в купели требует золото взамен на полное исцеление.",
    goldCost: 40,
  },
  {
    id: "rat-nest",
    name: "Крысиное гнездо",
    icon: "🐀",
    kind: "rat-nest",
    weight: 6,
    minDepth: 1,
    maxDepth: null,
    description: "Куча трухлявой соломы и костей шевелится и попискивает — что-то там определённо есть.",
    successChance: 0.5,
    goldReward: [5, 15],
    biteDamagePercent: 0.08,
  },
  {
    id: "bat-arch",
    name: "Арка летучих мышей",
    icon: "🦇",
    kind: "bat-arch",
    weight: 4,
    minDepth: 5,
    maxDepth: null,
    description: "Проход затянут шевелящейся тучей летучих мышей — обойти арку невозможно, только пройти насквозь.",
    statBonus: { strength: 1, agility: 1, stoicism: 1 },
  },
  {
    id: "goblin-priest",
    name: "Гоблин-Священник",
    icon: "📿",
    kind: "goblin-priest",
    weight: 3,
    minDepth: 1,
    maxDepth: 39,
    description: "Сгорбленная фигура в рваной рясе бормочет молитву своему богу и протягивает костлявую ладонь за подношением.",
    goldCost: 150,
    rewardItemId: "strong-health-potion",
  },
  {
    id: "goblin-elder",
    name: "Гоблин-Старейшина",
    icon: "🪓",
    kind: "goblin-elder",
    weight: 0,          // не выпадает случайно — форс-вставляется на 35 этаже (см. main.js)
    minDepth: 35,
    maxDepth: 35,
    description: "Безоружный старик-гоблин выходит из тени и цепко хватает тебя за рукав, озираясь на своих сородичей.",
    goldCost: 50,
  },
];


import { composeEquipment } from "../equipment.js";
import { EQUIPMENT_FORMS } from "./equipment-forms.js";
import { CONSUMABLES } from "./consumables.js";

const MERCHANT_PRICE_VARIANCE = 0.2;
const MERCHANT_PRICE_MULTIPLIER = 14; // товары скелета-торговца дороже обычной лавки в 3 раза

function merchantPriceFor(baseShopPrice) {
  const boostedPrice = baseShopPrice * MERCHANT_PRICE_MULTIPLIER;
  const min = Math.max(1, Math.round(boostedPrice * (1 - MERCHANT_PRICE_VARIANCE)));
  const max = Math.round(boostedPrice * (1 + MERCHANT_PRICE_VARIANCE));
  return Math.floor(min + Math.random() * (max - min + 1));
}

/** Генерирует 4 случайных костяных предмета для скелета-торговца. */
function rollSkeletonMerchantStock() {
  const pool = EQUIPMENT_FORMS
    .map((form) => composeEquipment("bone", form.id))
    .filter(Boolean);

  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, 4).map((item) => ({
    ...item,
    price: merchantPriceFor(item.shopPrice),
    sold: false,
  }));
}

// Путник-Лекарь дороже обычной лавки, но не так сильно, как скелет —
// он гарантированно продаёт именно то, что нужно (зелья/бинты), просто
// ограниченным количеством: ровно 4 случайных вида по 3 штуки каждого.
const HEALER_PRICE_MULTIPLIER = 1.20;
const HEALER_STOCK_PER_ITEM = 3;
const HEALER_ITEM_TYPES = 4;

function healerPriceFor(baseShopPrice) {
  return Math.max(1, Math.round(baseShopPrice * HEALER_PRICE_MULTIPLIER));
}

/** Путник-Лекарь торгует 4 случайными видами лечебных расходников (зелья/бинты), по 3 шт. каждого вида. */
function rollTravelerHealerStock() {
  const pool = CONSUMABLES.filter((c) => !c.raw && (c.healAmount > 0 || c.bandage));
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, HEALER_ITEM_TYPES).map((c) => ({
    ...c,
    price: healerPriceFor(c.shopPrice),
    remaining: HEALER_STOCK_PER_ITEM,
  }));
}

export function buildEventInstance(eventType) {
  const instance = { ...eventType, resolved: false };
  if (eventType.kind === "skeleton-merchant") {
    instance.stock = rollSkeletonMerchantStock();
  }
  if (eventType.kind === "traveler-healer") {
    instance.stock = rollTravelerHealerStock();
  }
  return instance;
}

/**
 * Аналог spawnEnemy(depth) — выбирает случайный тип события по весу и глубине.
 * excludeIds — id событий, которые уже нельзя выпадать (например, торговец,
 * который уже был в этом забеге).
 */
export function spawnFloorEvent(depth, excludeIds = []) {
  const available = FLOOR_EVENT_TYPES.filter(
    (e) => (e.minDepth == null || depth >= e.minDepth) &&
           (e.maxDepth == null || depth <= e.maxDepth) &&
           !excludeIds.includes(e.id)
  );
  if (available.length === 0) return null;

  const totalWeight = available.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.random() * totalWeight;
  for (const eventType of available) {
    roll -= eventType.weight;
    if (roll <= 0) return buildEventInstance(eventType);
  }
  return buildEventInstance(available[available.length - 1]);
}