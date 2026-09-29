// data/materials.js
// ============================================================
// Материалы — это "из чего сделано" снаряжение. Сам по себе
// материал не привязан к мечу или щиту: он просто даёт числовой
// бонус, который применяется к той характеристике, что использует
// форма предмета (см. equipment-forms.js).
//
// Чтобы добавить новый материал — добавь объект в массив.
// Он автоматически скрещивается со всеми формами в equipment.js
// (getAllEquipment), так что "железный щит" появится сам, как
// только заведёшь материал "iron" — отдельно его создавать не надо.
// ============================================================

export const MATERIALS = [
  {
    id: "wood",
    name: "Деревянный",
    icon: "🟫",
    tier: 1,
    bonusValue: 2,
    shopPrice: 12,
    glowColor: "#6e3906",   // коричневый
    iconOverrides: {
      "small-shield": "img/items/wooden_small_shield.png",
      chestplate: "img/items/wooden_chest.png",
      shield: "img/items/wooden_shield.png",
      spear: "img/items/wooden_spear.png",
      bow: "img/items/wooden_bow.png",
    },
    nameOverrides: {
      spear: "Деревянная пика",
    },
    // Бонус сета. armorBonus включается, если все 4 слота брони (шлем,
    // нагрудник, поножи, ботинки) — этот материал. fullBonus добавляется
    // ДОПОЛНИТЕЛЬНО, если вдобавок оружие и щит тоже этого материала
    // (то есть надет весь комплект целиком, 6 из 6 слотов).
    setBonus: {
      armorBonus: { stoicism: 5, agility: 2 },
      fullBonus: { agility: 2 },
    },
  },
  {
    id: "copper",
    name: "Медный",
    icon: "🔸",
    tier: 1,
    bonusValue: 3,
    shopPrice: 20,
    glowColor: "#ff7d13",   // оранжевый
    iconOverrides: {
      shield: "img/items/copper_shield.png",
    },
  },
  {
    id: "iron",
    name: "Железный",
    icon: "⛓️",
    tier: 2,
    bonusValue: 5,
    shopPrice: 40,
    glowColor: "#e8e8e8",   // белый/серебристый
    agilityPenaltyBySlot: {
      helmet: -2,
      chestplate: -1,
      greaves: -1,
      boots: -2,
    },
  },
  {
    id: "goblin-steel",
    name: "Гоблинская Сталь",
    icon: "🟩",
    tier: 2,
    bonusValue: 7,          // между железом (5) и костью (8)
    shopPrice: 65,
    glowColor: "#506930",   // болотно-зелёный
  },
  {
    id: "leather",
    name: "Кожаный",
    icon: "🧤",
    tier: 2,
    bonusValue: 2,
    shopPrice: 30,
    glowColor: "#8b5a2b",
    extraBonus: { agility: 2 },  // за КАЖДУЮ надетую вещь: +2 ловкость
    allowedForms: ["helmet", "chestplate", "greaves", "boots", "gloves"], // кожа — только броня, без оружия и щитов
    nameOverrides: {
      gloves: "Кожаные перчатки",
      chestplate: "Клёпанный нагрудник",
      boots: "Сапоги",
    },
  },
  {
    id: "bone",
    name: "Костяной",
    icon: "🦴",
    tier: 3,
    bonusValue: 8,
    shopPrice: 0,
    glowColor: "#c9b6ff",   // бледно-фиолетовый — самый редкий, выделяется
    iconOverrides: {
      axe: "img/items/bone_axe.png",
      dagger: "img/items/bone_dagger.png",
      spear: "img/items/bone_spear.png",
      chestplate: "img/items/bone_chest.png",
      bow: "img/items/bone_bow.png",
    },
    nameOverrides: {
      spear: "Костянная Пика",
    },
  },
  {
    id: "indestructible-steel",
    name: "Нерушимая Сталь",
    icon: "🔩",
    tier: 4,
    bonusValue: 12,         // кость (8) + 4
    shopPrice: 370,
    glowColor: "#5ac8fa",   // холодный сталь-синий
  },
  {
    id: "gold",
    name: "Золотой",
    icon: "🟡",
    tier: 3,
    bonusValue: 4,
    shopPrice: 80,
    glowColor: "#ffd700",              // золотой
    extraBonus: { goldFind: 15 },      // за КАЖДУЮ надетую вещь: +15% к получаемому золоту
    nameOverrides: {
      helmet: "Золотая Корона",
    },
    iconOverrides: {
      helmet: "img/items/crown.png",
      chestplate: "img/items/gold_chest.png",
      sword: "img/items/gold_sword.png",
      shield: "img/items/gold_shield.png",
    },
    // armorBonus — все 4 слота брони золотые. fullBonus — вдобавок оружие
    // (любое: меч/топор/копьё/и т.д.) и щит/малый щит тоже золотые.
    setBonus: {
      armorBonus: { goldFind: 15 },
      fullBonus: { strength: 2, goldFind: 5 },
    },
  },
  {
    id: "shadow-cloth",
    name: "Теневая ткань",
    icon: "🌫️",
    tier: 3,
    bonusValue: 0,               // не участвует в обычном скейлинге формы (armor/damage)
    shopPrice: 60,
    glowColor: "#4b3f66",        // тёмно-сизый
    excludedSlots: ["weapon"],   // никакого оружия — кинжалы, мечи и т.д. из неё не куются
    zeroArmor: true,             // полностью обнуляет броню предмета, даже базовую от формы
    extraBonus: { agility: 2, dodgeChance: 5 }, // за КАЖДУЮ надетую вещь: +2 ловкость, +5% шанс уворота
    extraBonusOverrides: {
      gloves: { agility: 5, dodgeChance: 5 },
    },
    // armorBonus — все 4 слота брони теневые. Оружие из тени не куётся
    // (excludedSlots: ["weapon"]), поэтому fullBonus для этого материала
    // не нужен — полного комплекта из 6 частей физически не бывает.
    setBonus: {
      armorBonus: { dodgeChance: 10, agility: 5 },
    },
    nameOverrides: {
      helmet: "Капюшон теней",
      chestplate: "Теневая рубаха",
      greaves: "Теневые штаны",
      boots: "Теневые лапти",
      "small-shield": "Теневой щит",
      gloves: "Теневые перчатки",
    },
    iconOverrides: {
      helmet: "img/items/shadow_helmet.png",
      chestplate: "img/items/shadow_chest.png",
      gloves: "img/items/shadow_gloves.png",
      shield: "img/items/shadow_shield.png",
      "small-shield": "img/items/shadow_small_shield.png",
    },
  },
  {
    id: "elusive-cloth",
    name: "Неуловимая ткань",
    icon: "💨",
    tier: 4,
    bonusValue: 0,               // как теневая ткань — не скейлит броню формы
    shopPrice: 100,
    glowColor: "#7d6fb3",        // светлее и ярче тени
    excludedSlots: ["weapon"],
    zeroArmor: true,
    // Сильнее теневой ткани на +3 ловкости / +3% уворота за вещь
    // (у теневой: agility 2, dodge 5 → тут 5 и 8).
    extraBonus: { agility: 5, dodgeChance: 8 },
    extraBonusOverrides: {
      gloves: { agility: 8, dodgeChance: 10 },
    },
    // Бонус полного комплекта брони — сильнее, чем у обычной тени.
    setBonus: {
      armorBonus: { dodgeChance: 15, agility: 8 },
    },
    nameOverrides: {
      helmet: "Капюшон неуловимости",
      chestplate: "Неуловимая роба",
      greaves: "Неуловимые штаны",
      boots: "Неуловимые сапоги",
      "small-shield": "Неуловимый щит",
      gloves: "Неуловимые перчатки",
    },
    // Текстуры намеренно те же, что у теневой ткани — по задумке визуально
    // не отличаются от обычной тени.
    iconOverrides: {
      helmet: "img/items/shadow_helmet.png",
      chestplate: "img/items/shadow_chest.png",
      gloves: "img/items/shadow_gloves.png",
      shield: "img/items/shadow_shield.png",
      "small-shield": "img/items/shadow_small_shield.png",
    },
  },
  {
    id: "light-cloth",
    name: "Лёгкая ткань",
    icon: "🕊️",
    tier: 3,
    bonusValue: 0,
    shopPrice: 45,
    glowColor: "#e8dcc8",        // светлый, почти белёсый
    excludedSlots: ["weapon"],
    zeroArmor: true,
    // Слабее тени по ловкости (agility 1 против 2 у тени), но даёт
    // +5% шанс крита за каждый надетый элемент.
    extraBonus: { agility: 1, critChance: 5 },
    // Полный комплект брони — ещё +10% крита сверху.
    setBonus: {
      armorBonus: { critChance: 10 },
    },
    nameOverrides: {
      helmet: "Лёгкий капюшон",
      chestplate: "Лёгкая роба",
      greaves: "Лёгкие штаны",
      boots: "Лёгкие сапоги",
      "small-shield": "Лёгкий щит",
      gloves: "Лёгкие перчатки",
    },
  },
];

export function getMaterialById(id) {
  return MATERIALS.find((m) => m.id === id) || null;
}
