// data/consumables.js
// ============================================================
// Расходники и сырьё. Сырьё (raw: true) нельзя "использовать" —
// оно идёт в крафт на рабочей станции.
// ============================================================

export const CONSUMABLES = [
  // --- Сырьё ---
  {
    id: "healing-herb",
    name: "Лечебная трава",
    icon: "img/items/herbs.png",
    description: "Сырьё для крафта. 3 травы → зелье здоровья на рабочей станции.",
    healAmount: 0,
    shopPrice: 4,
    raw: true,          // нельзя использовать напрямую
  },
  {
    id: "cotton-stalk",
    name: "Стебель хлопка",
    icon: "img/items/cotton_stalk.png",
    description: "Сырьё для крафта. Растёт на гоблинских фермах хлопка. 2 стебля → ткань.",
    healAmount: 0,
    shopPrice: 3,
    raw: true,
  },
  {
    id: "cotton",
    name: "Ткань",
    icon: "img/items/cotton.png",
    description: "Сырьё для крафта. 4 лечебные травы или 2 стебля хлопка → ткань, 3 ткани → бинт.",
    healAmount: 0,
    shopPrice: 6,
    raw: true,
  },

  // --- Расходники ---
  {
    id: "health-potion",
    name: "Зелье здоровья",
    icon: "img/items/potion_red.png",
    description: "Восстанавливает 25 здоровья.",
    healAmount: 25,
    shopPrice: 10,
  },
  {
    id: "big-health-potion",
    name: "Большое зелье здоровья",
    icon: "img/items/big_potion_red.png",
    description: "Восстанавливает 40 здоровья.",
    healAmount: 40,
    shopPrice: 20,
  },
  {
    id: "strong-health-potion",
    name: "Сильное зелье здоровья",
    icon: "img/items/strong_potion_red.png",
    description: "Восстанавливает 70 здоровья.",
    healAmount: 70,
    shopPrice: 40,
  },
  {
    id: "bandage",
    name: "Бинт",
    icon: "img/items/bandage.png",
    description: "Накладывается на рану. Каждый ход лечит её на одну степень тяжести. Если враг попадёт по забинтованной части — бинт уничтожается.",
    healAmount: 0,
    shopPrice: 15,
    bandage: true,   // отмечает предмет как бинт (не расходуется мгновенно)
  },
  {
    id: "dirty-bandage",
    name: "Грязный бинт",
    icon: "img/items/dirt_bandage.png",
    description: "Бинт, снятый с настоящей раны — пропитан кровью и грязью. Использовать в таком виде нельзя, сначала нужно очистить.",
    healAmount: 0,
    shopPrice: 5,
    dirty: true,   // нельзя применить напрямую — только через cleanBandage()
  },
  {
    id: "herbs-bandage",
    name: "Травяной бинт",
    icon: "img/items/herbs_bandage.png",
    description: "Бинт, пропитанный лечебными травами. При наложении сразу даёт +10 HP, дальше лечит рану по ходам как обычный бинт. После снятия травы впитываются — остаётся обычный бинт.",
    healAmount: 0,
    shopPrice: 20,
    bandage: true,
    instantHeal: 10,       // мгновенный бонус HP при наложении
    revertsTo: "bandage",  // во что превращается при снятии
  },
  {
    id: "potion-bandage",
    name: "Зельевой бинт",
    icon: "img/items/heal_bandage.png",
    description: "Обычный бинт, смоченный в зелье здоровья. При наложении сразу даёт +10 HP, а на следующем ходу впитывается ещё раз на +10 HP, дальше лечит рану по ходам как обычный бинт. После снятия зелье впиталось — остаётся обычный бинт.",
    healAmount: 0,
    shopPrice: 30,
    bandage: true,
    instantHeal: 10,        // первый мгновенный бонус — при наложении
    bonusHealCharges: 1,    // сколько ещё раз сработает bonusHealAmount на тиках
    bonusHealAmount: 10,    // второй бонус — на первом тике после наложения
    revertsTo: "bandage",   // во что превращается при снятии
  },
  {
    id: "red-bandage",
    name: "Красный бинт",
    icon: "img/items/heal_bandage.png",
    description: "Бинт, смоченный в большом зелье здоровья. При наложении сразу даёт +15 HP, а на следующем ходу впитывается ещё раз на +15 HP, дальше лечит рану по ходам как обычный бинт. После снятия зелье впиталось — остаётся обычный бинт.",
    healAmount: 0,
    shopPrice: 45,
    bandage: true,
    instantHeal: 15,        // первый мгновенный бонус — при наложении
    bonusHealCharges: 1,    // сколько ещё раз сработает bonusHealAmount на тиках
    bonusHealAmount: 15,    // второй бонус — на первом тике после наложения
    revertsTo: "bandage",   // во что превращается при снятии
  },
  {
    id: "poison-potion",
    name: "Ядовитое зелье",
    icon: "img/items/poisonous_potion.png",
    description: "Можно нанести на оружие — следующий удачный удар отравит врага (флакона хватает на 3 смачивания, потом он пустеет). Пить его не рекомендуется, но если очень хочется — можно, просто по приколу.",
    healAmount: 0,
    shopPrice: 25,
    poison: true,               // отмечает предмет как ядовитое зелье (наносится на оружие)
    poisonCharges: 3,           // сколько раз можно смочить оружие ОДНИМ флаконом
    poisonDamagePercent: 0.08,  // % от maxHP врага за один тик яда
    poisonTicks: 3,             // сколько тиков действует яд после попадания
    selfDamagePercent: 0.1,     // % от maxHP игрока при выпитии "по приколу"
  },
];

export function getConsumableById(id) {
  return CONSUMABLES.find((c) => c.id === id) || null;
}
