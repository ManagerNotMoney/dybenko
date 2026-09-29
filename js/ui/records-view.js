// ui/records-view.js
// ============================================================
// Модалка с лучшим забегом: глубина, от кого погиб, характеристики,
// снаряжение, с которым дошёл.
// ============================================================
import { getBestRecord } from "../records.js";
import { renderIcon } from "./icon.js";

const STAT_META = [
  { key: "stoicism", label: "Стойкость", icon: "img/stat/stoicism.png" },
  { key: "strength",  label: "Сила",      icon: "img/stat/strength.png" },
  { key: "agility",   label: "Ловкость",  icon: "img/stat/agility.png" },
];

export class RecordsView {
  constructor(state, els) {
    this.state = state;
    this.els = els;
  }

  show() {
    this.render();
    this.els.recordsOverlay.classList.remove("is-hidden");
  }

  hide() {
    this.els.recordsOverlay.classList.add("is-hidden");
  }

  render() {
    const record = getBestRecord();
    const body = this.els.recordsBody;

    if (!record) {
      body.innerHTML = `
        <p class="records-empty">Забегов ещё не было.<br>Спустись в подземелье и напиши первую страницу легенды.</p>
      `;
      return;
    }

    const statsHTML = STAT_META.map(({ key, label, icon }) => `
      <div class="records-stat">
        <img src="${icon}" class="icon-img records-stat__icon" alt="">
        <span class="records-stat__value">${record[key]}</span>
        <span class="records-stat__label">${label}</span>
      </div>
    `).join("");

    const equipmentHTML = record.equipment && record.equipment.length
      ? record.equipment.map((item) => `
          <div class="records-equip" title="${item.name}">
            <span class="records-equip__icon">${renderIcon(item.icon)}</span>
            <span class="records-equip__name">${item.name}</span>
          </div>
        `).join("")
      : `<p class="records-empty records-empty--small">Голышом, без единой вещи...</p>`;

    body.innerHTML = `
      <div class="records-depth">
        <span class="records-depth__value">${record.depth}</span>
        <span class="records-depth__label">глубина подземелья</span>
      </div>
      <p class="records-level">${record.level} уровень</p>

      <div class="records-killer">
        <span class="records-killer__icon">${renderIcon(record.killedBy.icon)}</span>
        <span class="records-killer__text">Погиб от руки:<br><b>${record.killedBy.name}</b></span>
      </div>

      <div class="records-stats">${statsHTML}</div>

      <div class="records-section-label">Снаряжение в момент гибели</div>
      <div class="records-equipment">${equipmentHTML}</div>
    `;
  }
}