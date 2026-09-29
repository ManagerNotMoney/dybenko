// ui/trade-view.js
// ============================================================
// Лавка торговца и рабочая станция (крафт).
// ============================================================
import { bus } from "../engine.js";
import { getShopListing, purchase } from "../shop.js";
import { getConsumableById } from "../data/consumables.js";
import { RECIPES } from "../data/crafting.js";
import { renderIcon, renderItemIcon } from "./icon.js";

export class TradeView {
  constructor(state, els) {
    this.state = state;
    this.els = els;
  }

  // ---------- лавка ----------
  showShop() {
    this._decorateShopTitle();
    this.renderShop();
    this.els.shopOverlay.classList.remove("is-hidden");
  }

  hideShop() {
    this.els.shopOverlay.classList.add("is-hidden");
  }

  _decorateShopTitle() {
    const titleEl = this.els.shopOverlay?.querySelector(".modal__title");
    if (!titleEl || titleEl.dataset.marketTitle) return;
    titleEl.dataset.marketTitle = "1";
    const original = titleEl.textContent.trim();
    titleEl.classList.add("market-title");
    titleEl.innerHTML = `
      <span class="market-title__eyebrow">Здесь всё имеет цену</span>
      <span class="market-title__main">
        <span class="market-title__flourish" aria-hidden="true"></span>
        ${original}
        <span class="market-title__flourish" aria-hidden="true"></span>
      </span>
    `;
  }

  renderShop() {
    const player = this.state.player;
    this.els.shopGoldValue.textContent = player.gold;

    const grid = this.els.shopGrid;
    grid.innerHTML = "";

    getShopListing().forEach((entry, index) => {
      const affordable = player.gold >= entry.price;
      const card = document.createElement("div");
      card.className = "shop-item";
      card.innerHTML = `
        <span class="shop-item__rivet shop-item__rivet--l"></span>
        <span class="shop-item__rivet shop-item__rivet--r"></span>
        <span class="shop-item__medallion">${renderItemIcon(entry, entry.kind)}</span>
        <span class="shop-item__name">${entry.name}</span>
        <span class="shop-item__desc">${entry.description}</span>
        <button class="shop-item__buy${affordable ? "" : " shop-item__buy--locked"}"
                data-index="${index}" ${affordable ? "" : "disabled"}
                title="${affordable ? "" : "Не хватает золота"}">
          <span class="shop-item__coin">${entry.price}</span>
          <span class="shop-item__buy-label">${affordable ? "Купить" : "Заперто"}</span>
        </button>
      `;

      card.addEventListener("mousemove", (e) => {
        // "Зона покупки" — пока курсор над кнопкой, выравниваем карточку
        // в анфас и держим её неподвижной, чтобы по кнопке было легко попасть.
        if (e.target.closest(".shop-item__buy")) {
          card.style.transition = "transform 0.12s ease";
          card.style.transform = "rotateX(0deg) rotateY(0deg) translateZ(8px)";
          return;
        }

        card.style.transition = "transform 0.08s ease, box-shadow 0.18s ease, border-color 0.18s ease";

        const rect = card.getBoundingClientRect();
        const cx = rect.left + rect.width  / 2;
        const cy = rect.top  + rect.height / 2;
        const dx = (e.clientX - cx) / (rect.width  / 2);
        const dy = (e.clientY - cy) / (rect.height / 2);

        const rotX = -dy * 10;
        const rotY =  dx * 10;

        card.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg) translateZ(8px)`;
        const mx = ((e.clientX - rect.left) / rect.width)  * 100;
        const my = ((e.clientY - rect.top)  / rect.height) * 100;
        card.style.setProperty("--mx", `${mx}%`);
        card.style.setProperty("--my", `${my}%`);
      });

      card.addEventListener("mouseleave", () => {
        card.style.transform = "rotateX(0deg) rotateY(0deg) translateZ(0px)";
        card.style.transition = "transform 0.45s cubic-bezier(.2,.8,.3,1), box-shadow 0.18s ease, border-color 0.18s ease";
      });

      card.addEventListener("mouseenter", () => {
        card.style.transition = "transform 0.08s ease, box-shadow 0.18s ease, border-color 0.18s ease";
      });

      grid.appendChild(card);
    });
  }

  buyByIndex(index) {
    const listing = getShopListing();
    const entry = listing[index];
    if (!entry) return;
    purchase(this.state.player, entry);
    this.renderShop();
  }

  // ---------- рабочая станция / крафт ----------
  showWorkbench() {
    // Сбрасываем выбор способа крафта — при каждом открытии меню
    // переключатель должен заново подобрать первый доступный вариант.
    this._craftSelection = {};
    this.renderCraftingGrid();
    this.els.workbenchOverlay.classList.remove("is-hidden");
  }

  hideWorkbench() {
    this.els.workbenchOverlay.classList.add("is-hidden");
  }

  renderCraftingGrid() {
    const player = this.state.player;
    const grid = this.els.craftingGrid;
    grid.innerHTML = "";

    // Запоминаем выбранный способ крафта на предмет (itemId -> index),
    // чтобы переключатель не сбрасывался на первый вариант при перерисовке.
    this._craftSelection = this._craftSelection || {};

    // Группируем рецепты по результату — один и тот же предмет может
    // крафтиться несколькими способами (разные ингредиенты).
    const groups = [];
    const groupsByItemId = new Map();
    RECIPES.forEach((recipe) => {
      const itemId = recipe.result.itemId;
      if (!groupsByItemId.has(itemId)) {
        const group = { itemId, recipes: [] };
        groupsByItemId.set(itemId, group);
        groups.push(group);
      }
      groupsByItemId.get(itemId).recipes.push(recipe);
    });

    const isRecipeVisible = (recipe) =>
      Object.keys(recipe.ingredients).some((id) => (player.inventory[id] || 0) > 0);

    const visibleGroups = groups.filter((group) => group.recipes.some(isRecipeVisible));

    if (visibleGroups.length === 0) {
      grid.innerHTML = `<p class="craft-grid__empty">Пока нет ингредиентов для крафта. Собирай их у врагов.</p>`;
      return;
    }

    const canCraftRecipe = (recipe) =>
      Object.entries(recipe.ingredients).every(
        ([id, count]) => (player.inventory[id] || 0) >= count
      );

    visibleGroups.forEach((group) => {
      const variantCount = group.recipes.length;

      let activeIndex = this._craftSelection[group.itemId];
      if (activeIndex == null || activeIndex >= variantCount) {
        // По умолчанию — первый вариант, который реально можно скрафтить
        // прямо сейчас; если такого нет, просто первый по списку.
        const firstCraftable = group.recipes.findIndex(canCraftRecipe);
        activeIndex = firstCraftable !== -1 ? firstCraftable : 0;
        // Сохраняем сразу, иначе cycleVariant при первом же скролле
        // будет отталкиваться от 0, а не от реально показанного варианта.
        this._craftSelection[group.itemId] = activeIndex;
      }
      const recipe = group.recipes[activeIndex];

      const canCraft = canCraftRecipe(recipe);

      const ingLines = Object.entries(recipe.ingredients)
        .map(([id, need]) => {
          const have = player.inventory[id] || 0;
          const enough = have >= need;
          const consumable = getConsumableById(id);
          const label = consumable ? `${renderIcon(consumable.icon)} ${consumable.name}` : id;
          return `<span class="craft-ing ${enough ? "craft-ing--ok" : "craft-ing--lack"}">${label}: ${have}/${need}</span>`;
        })
        .join("");

      const variantsHTML = variantCount > 1
        ? `<div class="craft-card__variants" role="tablist" aria-label="Способ крафта">
            ${group.recipes.map((_, i) => `
              <button type="button"
                      class="craft-card__variant${i === activeIndex ? " craft-card__variant--active" : ""}"
                      data-item-id="${group.itemId}"
                      data-variant-index="${i}"
                      title="Способ ${i + 1} из ${variantCount}"
                      aria-label="Способ ${i + 1} из ${variantCount}"
                      aria-selected="${i === activeIndex}"
              ></button>
            `).join("")}
          </div>`
        : "";

      const card = document.createElement("div");
      card.className = "craft-card";
      card.title = recipe.description;
      card.innerHTML = `
        <span class="craft-card__icon">${renderIcon(recipe.icon)}</span>
        <div class="craft-card__body">
          <span class="craft-card__name">${recipe.name}</span>  
          <div class="craft-card__ings">${ingLines}</div>
          ${variantsHTML}
        </div>
        <button class="craft-card__btn ${canCraft ? "" : "craft-card__btn--disabled"}"
                data-recipe-id="${recipe.id}" ${canCraft ? "" : "disabled"}
                title="${canCraft ? "Сделать" : "Не хватает материалов"}">
          ⚒️
        </button>
      `;

      if (variantCount > 1) {
        const cycleVariant = (dir) => {
          const current = this._craftSelection[group.itemId] || 0;
          this._craftSelection[group.itemId] = (current + dir + variantCount) % variantCount;
          this.renderCraftingGrid();
        };

        // Колёсико мыши — над всей карточкой рецепта.
        card.addEventListener("wheel", (e) => {
          e.preventDefault();
          cycleVariant(e.deltaY > 0 ? 1 : -1);
        }, { passive: false });

        // Свайп по всей карточке (для мобилок) — считаем свайпом только
        // явно горизонтальный жест, чтобы не мешать вертикальному скроллу.
        let touchStart = null;
        card.addEventListener("touchstart", (e) => {
          touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }, { passive: true });

        card.addEventListener("touchend", (e) => {
          if (!touchStart) return;
          const dx = e.changedTouches[0].clientX - touchStart.x;
          const dy = e.changedTouches[0].clientY - touchStart.y;
          touchStart = null;
          if (Math.abs(dx) < 30 || Math.abs(dx) < Math.abs(dy)) return; // не горизонтальный/слишком короткий свайп
          cycleVariant(dx < 0 ? 1 : -1);
        }, { passive: true });
      }

      grid.appendChild(card);
    });

    grid.onclick = (e) => {
      const variantBtn = e.target.closest(".craft-card__variant");
      if (variantBtn) {
        this._craftSelection[variantBtn.dataset.itemId] = Number(variantBtn.dataset.variantIndex);
        this.renderCraftingGrid();
        return;
      }

      const btn = e.target.closest(".craft-card__btn");
      if (!btn || btn.disabled) return;
      const recipe = RECIPES.find((r) => r.id === btn.dataset.recipeId);
      if (!recipe) return;
      const result = player.craft(recipe);
      if (result.ok) {
        bus.emit("combat:log", {
          text: `Сделано: ${renderIcon(recipe.icon)} ${recipe.name}!`,
          type: "good",
        });
      }
    };
  }
  // ---------- торговцы-события (скелет-торговец, путник-лекарь) ----------
  showMerchant() {
    this._decorateMerchantHeader();
    this.renderMerchant();
    this.els.merchantOverlay.classList.remove("is-hidden");
  }

  hideMerchant() {
    this.els.merchantOverlay.classList.add("is-hidden");
  }

  /** Заголовок и подзаголовок модалки берутся из самого события — раньше
   *  они были захардкожены под скелета-торговца и не подходили Путнику. */
  _decorateMerchantHeader() {
    const event = this.state.floorEvent;
    if (!event) return;
    const titleEl = this.els.merchantOverlay?.querySelector(".modal__title");
    const subtitleEl = this.els.merchantOverlay?.querySelector(".modal__subtitle");
    if (titleEl) titleEl.textContent = `${event.icon} ${event.name}`;
    if (subtitleEl) subtitleEl.textContent = event.description || "";
  }

  renderMerchant() {
    const player = this.state.player;
    const event = this.state.floorEvent;
    if (!event) return;

    this.els.merchantGoldValue.textContent = player.gold;

    const grid = this.els.merchantGrid;
    grid.innerHTML = "";

    // Скелет-торговец продаёт снаряжение поштучно (entry.sold), Путник-Лекарь —
    // расходники с ограниченным количеством каждой позиции (entry.remaining).
    const isHealer = event.kind === "traveler-healer";

    (event.stock || []).forEach((entry, index) => {
      const soldOut = isHealer ? entry.remaining <= 0 : entry.sold;
      const affordable = !soldOut && player.gold >= entry.price;
      const card = document.createElement("div");
      card.className = "shop-item";
      card.innerHTML = `
        <span class="shop-item__rivet shop-item__rivet--l"></span>
        <span class="shop-item__rivet shop-item__rivet--r"></span>
        <span class="shop-item__medallion">${renderItemIcon(entry, isHealer ? "consumable" : "equipment")}</span>
        <span class="shop-item__name">${entry.name}</span>
        <span class="shop-item__desc">${entry.description}</span>
        <button class="shop-item__buy${affordable ? "" : " shop-item__buy--locked"}"
                data-index="${index}" ${affordable ? "" : "disabled"}
                title="${soldOut ? "" : affordable ? "" : "Не хватает золота"}">
          <span class="shop-item__coin">${entry.price}</span>
          <span class="shop-item__buy-label">${soldOut ? "Распродано" : isHealer ? `Купить ×${entry.remaining}` : "Купить"}</span>
        </button>
      `;
      grid.appendChild(card);
    });
  }
}