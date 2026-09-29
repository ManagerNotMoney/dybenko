// data/unique-items.js
// ============================================================
// Уникальные предметы — не собираются из материала×формы (см.
// equipment.js/composeEquipment), а существуют как единственный
// фиксированный набор данных. Используют formId из
// equipment-forms.js только для проверки слота/совместимости
// (см. player.equipItem) — сама форма там заблокирована от
// автогенерации через allowedMaterials: [].
// ============================================================

export const UNIQUE_ITEMS = [
  {
    id: "quiver",
    name: "Колчан",
    icon: "img/items/quiver.png",
    slot: "shield",
    formId: "quiver",
    unique: true,
    // Работает только пока в основной руке лук (см. player.rollAttack).
    bowBonus: {
      damagePercent: 0.05,   // +5% урона
      critChance: 0.10,      // +10% шанс крита
      critMultiplier: 0.10,  // +10% к множителю крита
    },
    description: "Колчан со стрелами на бедре — бесполезен без лука в руках, но с ним отдача от каждого выстрела становится куда смертоноснее: +5% урона, +10% шанс крита, +10% к множителю крита (только с луком).",
    shopPrice: 90,
  },
  {
    id: "shirt",
    name: "Рубаха",
    icon: "img/items/shirt.png",
    slot: "chestplate",
    formId: "chestplate",
    unique: true,
    bonus: { agility: 2, stoicism: 1 },
    description: "Простая рубаха странника — не защищает от ударов, но привычна телу: +2 ловкости, +1 стойкость.",
    shopPrice: 0,
  },
  {
    id: "hammer",
    name: "Молоток",
    icon: "img/items/build_hammer.png",
    slot: "weapon",
    formId: "sword",
    unique: true,
    bonus: { damage: 3 },
    description: "Небольшой рабочий молоток — не создан для боя, но в отчаянной ситуации сойдёт: +3 урона.",
    shopPrice: 0,
  },
  {
    id: "sickle",
    name: "Серп",
    icon: "img/items/sickle.png",
    slot: "weapon",
    formId: "sword",
    unique: true,
    bonus: { damage: 4 },
    description: "Изогнутый серп с зазубренным краем — режет глубже, но лучше собирает урожай.",
    shopPrice: 0,
  },
  {
    id: "torch",
    name: "Факел",
    icon: "img/items/torch.png",
    slot: "weapon",
    formId: "sword",
    unique: true,
    bonus: { damage: 2 },
    description: "Горящий факел — больше для света, чем для драки, но обжечь врага тоже можно: +2 урона.",
    shopPrice: 0,
  },
  {
    id: "knife",
    name: "Нож",
    icon: "img/items/knife.png",
    slot: "weapon",
    formId: "sword",
    unique: true,
    bonus: { damage: 5 },
    description: "Короткий острый нож — лёгкий, но бьёт неожиданно сильно: +5 урона.",
    shopPrice: 0,
  },
  {
    id: "torn-pants",
    name: "Рваные штаны",
    icon: "img/items/trousers.png",
    slot: "greaves",
    formId: "greaves",
    unique: true,
    bonus: { agility: 2 },
    description: "Изодранные в клочья штаны — почти не защищают, зато совсем не стесняют движений: +2 ловкости.",
    shopPrice: 0,
  },
  {
    id: "cloth-wraps",
    name: "Тканевые обмотки",
    icon: "img/items/hand_wraps.png",
    slot: "shield",
    formId: "gloves",
    unique: true,
    bonus: { strength: 2, agility: 2 },
    description: "Плотные обмотки на кистях рук вместо перчаток — держат хват крепче и не мешают телу: +2 силы, +2 ловкости.",
    shopPrice: 0,
  },
];

export function getUniqueItemById(id) {
  return UNIQUE_ITEMS.find((i) => i.id === id) || null;
}