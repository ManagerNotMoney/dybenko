// data/equipment-forms.js
// ============================================================
// Формы снаряжения.
//
// twoHanded: true   — двуручное оружие, нельзя носить щит/малый щит
// compatibleWith    — для щитов: список formId оружий, с которыми
//                     щит совместим. Если undefined — совместим со всем
//                     (кроме двуручного). "all" тоже значит «всё».
//
// dagger: true      — кинжал, урон скалируется от ловкости + силы
//                     (см. player.js rollAttack)
// ============================================================

export const EQUIPMENT_FORMS = [
  {
    id: "sword",
    name: "Меч",
    icon: "img/items/sword.png",
    slot: "weapon",
    baseBonus: 5,
    scalingStat: "damage",
    twoHanded: false,
  },
  {
    id: "bow",
    name: "Лук",
    icon: "img/items/bow.png",
    slot: "weapon",
    baseBonus: 6,
    scalingStat: "damage",
    twoHanded: true,
    allowSmallShield: true,
    bow: true,                // разница в ловкости с врагом даёт доп. шанс и % крита
  },
  {
    id: "axe",
    name: "Топор",
    icon: "img/items/axe.png",
    slot: "weapon",
    baseBonus: 8,
    scalingStat: "damage",
    twoHanded: true,
    allowSmallShield: true,
  },
  {
    id: "spear",
    name: "Копьё",
    icon: "img/items/spear.png",
    slot: "weapon",
    baseBonus: 9,
    scalingStat: "damage",
    twoHanded: true,
    allowSmallShield: true,
  },
  {
    id: "warhammer",
    name: "Боевой молот",
    icon: "img/items/hammer.png",
    slot: "weapon",
    baseBonus: 7,
    scalingStat: "damage",
    twoHanded: true,
    allowSmallShield: true,
    warhammer: true,
    requiresStrength: 10,     // нельзя надеть, если сила <= 10
  },
  {
    id: "dagger",
    name: "Кинжал",
    icon: "img/items/dagger.png",
    slot: "weapon",
    baseBonus: 3,
    scalingStat: "damage",
    twoHanded: false,
    dagger: true,              // урон = база + материал + сила + ловкость
  },
  {
    id: "shield",
    name: "Щит",
    icon: "img/items/shield.png",
    slot: "shield",
    baseBonus: 4,
    scalingStat: "armor",
    smallShield: false,
  },
  {
    id: "small-shield",
    name: "Малый щит",
    icon: "img/items/small_shield.png",
    slot: "shield",
    baseBonus: 1,
    scalingStat: "armor",
    smallShield: true,
  },
  {
    id: "gloves",
    name: "Перчатки",
    icon: "img/items/gloves.png",
    slot: "shield",
    baseBonus: 0,
    scalingStat: "armor",
    smallShield: true,
    allowedMaterials: ["leather", "shadow-cloth"],
  },
  {
    id: "quiver",
    name: "Колчан",
    icon: "img/items/quiver.png",
    slot: "shield",
    baseBonus: 0,
    scalingStat: "armor",
    smallShield: true,       // для player.equipItem() — трактуется как малый щит
    allowedMaterials: [],    // пустой список -> composeEquipment никогда не соберёт
                             // "wood-quiver"/"iron-quiver" и т.п. — колчан существует
                             // только как единственный объект в data/unique-items.js
  },
  {
    id: "helmet",
    name: "Шлем",
    icon: "img/items/helmet.png",
    slot: "helmet",
    baseBonus: 2,
    scalingStat: "armor",
  },
  {
    id: "chestplate",
    name: "Нагрудник",
    icon: "img/items/chest.png",
    slot: "chestplate",
    baseBonus: 5,
    scalingStat: "armor",
  },
  {
    id: "greaves",
    name: "Поножи",
    icon: "img/items/pants.png",
    slot: "greaves",
    baseBonus: 3,
    scalingStat: "armor",
  },
  {
    id: "boots",
    name: "Ботинки",
    icon: "img/items/shoes.png",
    slot: "boots",
    baseBonus: 2,
    scalingStat: "armor",
  },
];

export function getFormById(id) {
  return EQUIPMENT_FORMS.find((f) => f.id === id) || null;
}
