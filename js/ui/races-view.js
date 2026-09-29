// ui/races-view.js
// ============================================================
// Летопись подземелья: расы отображаются как развёрнутая книга —
// слева "корешок" с печатями-медальонами рас, справа текущая
// "страница" с гербом расы, лором и известными особями.
// ============================================================
import { RACES, getEnemiesByRace } from "../data/races.js";
import { renderIcon } from "./icon.js";

export class RacesView {
	constructor(state, els) {
		this.state = state;
		this.els = els;
		this._activeId = null;
		this._railEl = null;
		this._pageEl = null;
		this._lastWheelAt = 0;
		this._injectStyles();
		this._injectTitleDecor();
	}

	show(raceId = null) {
		this._injectTitleDecor();
		this.render(raceId || this._activeId);
		this.els.racesOverlay.classList.remove("is-hidden");

		if (raceId) {
			requestAnimationFrame(() => {
				const node = this._railEl?.querySelector(`[data-race-id="${raceId}"]`);
				if (!node) return;
				node.classList.add("races-codex__node--pulse");
				setTimeout(() => node.classList.remove("races-codex__node--pulse"), 1200);
			});
		}
	}

	hide() {
		this.els.racesOverlay.classList.add("is-hidden");
	}

	render(preferredId = null) {
		const list = this.els.racesList;
		if (!list) return;

		if (!RACES.length) {
			list.innerHTML = `<p class="races-codex__empty">Летопись рас пока пуста.</p>`;
			return;
		}

		const activeId =
			(preferredId && RACES.some((r) => r.id === preferredId) && preferredId) ||
			(this._activeId && RACES.some((r) => r.id === this._activeId) && this._activeId) ||
			RACES[0].id;
		this._activeId = activeId;

		list.innerHTML = "";

		const codex = document.createElement("div");
		codex.className = "races-codex";

		const rail = document.createElement("div");
		rail.className = "races-codex__rail";
		rail.setAttribute("role", "tablist");
		rail.setAttribute("aria-label", "Расы подземелья");

		RACES.forEach((race, i) => {
			const node = document.createElement("button");
			node.type = "button";
			node.className = "races-codex__node" + (race.id === activeId ? " is-active" : "");
			node.dataset.raceId = race.id;
			node.setAttribute("role", "tab");
			node.setAttribute("aria-selected", race.id === activeId ? "true" : "false");
			node.title = race.name;
			node.innerHTML = renderIcon(race.icon);
			node.addEventListener("click", () => this._setActive(race.id));
			node.addEventListener("keydown", (e) => this._handleRailKeydown(e, i));
			rail.appendChild(node);
		});

		rail.addEventListener("wheel", (e) => this._handleRailWheel(e), { passive: false });

		const page = document.createElement("div");
		page.className = "races-codex__page";
		page.setAttribute("role", "tabpanel");

		codex.appendChild(rail);
		codex.appendChild(page);
		list.appendChild(codex);

		this._railEl = rail;
		this._pageEl = page;
		this._renderPage(activeId);
	}

	_renderPage(raceId) {
		const race = RACES.find((r) => r.id === raceId);
		if (!race || !this._pageEl) return;

		const examples = getEnemiesByRace(race.id);
		const examplesHTML = examples.length
			? examples
					.map((e) => `<span class="races-codex__specimen" title="${e.name}">${renderIcon(e.icon)}</span>`)
					.join("")
			: `<p class="races-codex__no-specimens">Существа этой расы ещё не встречались в забегах.</p>`;

		this._pageEl.innerHTML = `
			<div class="races-codex__page-inner">
				<div class="races-codex__seal">${renderIcon(race.icon)}</div>
				<h4 class="races-codex__name">${race.name}</h4>
				<p class="races-codex__count">${examples.length} ${this._pluralizeSpecies(examples.length)} в бестиарии</p>
				<div class="races-codex__rule"></div>
				<p class="races-codex__desc">${race.description}</p>
				<div class="races-codex__examples-label">Известные особи</div>
				<div class="races-codex__specimens">${examplesHTML}</div>
			</div>
		`;
	}

	_setActive(raceId) {
		if (raceId === this._activeId) return;
		this._activeId = raceId;

		this._railEl?.querySelectorAll(".races-codex__node").forEach((n) => {
			const active = n.dataset.raceId === raceId;
			n.classList.toggle("is-active", active);
			n.setAttribute("aria-selected", active ? "true" : "false");
		});

		this._renderPage(raceId);
	}

	_handleRailKeydown(e, index) {
		const dirs = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
		if (!(e.key in dirs)) return;
		e.preventDefault();
		const next = (index + dirs[e.key] + RACES.length) % RACES.length;
		const nextNode = this._railEl?.children[next];
		if (!nextNode) return;
		nextNode.focus();
		this._setActive(RACES[next].id);
	}

	_handleRailWheel(e) {
		if (RACES.length < 2) return;
		e.preventDefault();

		const dir = e.deltaY > 0 ? 1 : e.deltaY < 0 ? -1 : 0;
		if (!dir) return;

		// Трекпад шлёт много wheel-событий за один жест —
		// не даём одному свайпу пролистать сразу несколько рас.
		const now = performance.now();
		if (now - this._lastWheelAt < 260) return;
		this._lastWheelAt = now;

		const currentIndex = RACES.findIndex((r) => r.id === this._activeId);
		const nextIndex = (currentIndex + dir + RACES.length) % RACES.length;
		this._setActive(RACES[nextIndex].id);
		this._railEl?.children[nextIndex]?.scrollIntoView({ block: "nearest", inline: "nearest" });
	}

	_pluralizeSpecies(n) {
		const mod10 = n % 10;
		const mod100 = n % 100;
		if (mod10 === 1 && mod100 !== 11) return "вид";
		if ([2, 3, 4].includes(mod10) && ![12, 13, 14].includes(mod100)) return "вида";
		return "видов";
	}

	_injectTitleDecor() {
		const titleEl = this.els.racesOverlay?.querySelector(".modal__title");
		if (!titleEl || titleEl.dataset.codexTitle) return;
		titleEl.dataset.codexTitle = "1";
		titleEl.classList.add("races-codex__title");
		titleEl.innerHTML = `
			<span class="races-codex__title-eyebrow">Хроники подземелья</span>
			<span class="races-codex__title-main">
				<span class="races-codex__title-flourish" aria-hidden="true"></span>
				Бестиарий
				<span class="races-codex__title-flourish" aria-hidden="true"></span>
			</span>
		`;
	}

	_injectStyles() {
		if (document.getElementById("races-view-styles")) return;
		const style = document.createElement("style");
		style.id = "races-view-styles";
		style.textContent = `
			.modal--races {
				position: relative;
				width: min(780px, 100%);
				max-width: 780px;
				max-height: 85vh;
				overflow: hidden;
				text-align: left;
				display: flex;
				flex-direction: column;
				padding: 26px 30px 26px 44px;
				border-radius: 6px 22px 22px 6px;
				background:
					repeating-linear-gradient(180deg, rgba(224,178,95,.05) 0 2px, rgba(224,178,95,0) 2px 6px) right / 6px 100% no-repeat,
					linear-gradient(122deg, var(--bg-panel-raised) 0%, var(--bg-panel) 55%, var(--bg-panel-raised) 100%);
				box-shadow:
					var(--shadow-deep),
					0 0 40px var(--ember-glow),
					8px 9px 0 -3px var(--bg-inset),
					8px 9px 0 -2px var(--border-stone),
					16px 17px 0 -7px var(--bg-inset),
					16px 17px 0 -6px var(--border-stone-soft);
			}
			.modal--races::before {
				content: "";
				position: absolute;
				top: 5px;
				bottom: 5px;
				left: 5px;
				width: 24px;
				border-radius: 3px 0 0 3px;
				pointer-events: none;
				background:
					repeating-linear-gradient(180deg, rgba(224,178,95,.4) 0 2px, transparent 2px 36px) left 5px top 16px / 100% 100% no-repeat,
					linear-gradient(90deg, var(--bg-inset), var(--border-stone-soft) 55%, var(--bg-inset));
				box-shadow: inset -3px 0 6px rgba(0,0,0,.5), 2px 0 10px rgba(0,0,0,.45);
			}
			.modal--races::after {
				content: "";
				position: absolute;
				inset: 0;
				border-radius: inherit;
				pointer-events: none;
				mix-blend-mode: overlay;
				opacity: .5;
				background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.07'/></svg>");
				background-size: 160px 160px;
			}
			.modal--races .modal__title {
				text-align: center;
				flex-shrink: 0;
			}
			.modal--races .modal__close {
				width: 34px;
				height: 34px;
				background: radial-gradient(circle at 35% 30%, var(--blood-dim), var(--blood) 70%);
				border: 1px solid rgba(224,178,95,.5);
				box-shadow: 0 0 10px rgba(194,52,47,.4), inset 0 0 6px rgba(0,0,0,.4);
			}
			.modal--races .modal__close:hover {
				border-color: var(--gold);
				background: radial-gradient(circle at 35% 30%, var(--blood), var(--ember-dim) 80%);
				box-shadow: 0 0 16px rgba(255,122,60,.5), inset 0 0 6px rgba(0,0,0,.4);
			}
			.races-list {
				display: flex;
				flex: 1;
				min-height: 0;
				margin-top: 16px;
			}
			.races-codex__empty {
				text-align: center;
				color: var(--text-faint);
				font-size: 13px;
				margin-top: 16px;
			}

			/* ---------- codex layout ---------- */
			.races-codex {
				display: flex;
				flex: 1;
				min-height: 0;
				width: 100%;
				gap: 8px;
			}

			/* ---------- rail (spine of medallions) ---------- */
			.races-codex__rail {
				position: relative;
				flex: 0 0 92px;
				display: flex;
				flex-direction: column;
				align-items: center;
				gap: 4px;
				padding: 24px 18px;
				min-height: 0;
				overflow-y: auto;
				overflow-x: hidden;
				scrollbar-width: none;
				cursor: ns-resize;
				background-image: repeating-linear-gradient(
					180deg,
					rgba(255,255,255,0) 0px,
					rgba(255,255,255,0) 3px,
					rgba(255,255,255,.02) 3px,
					rgba(255,255,255,.02) 4px
				);
				box-shadow: inset -10px 0 18px -14px rgba(0,0,0,.7);
			}
			.races-codex__rail::-webkit-scrollbar { display: none; }
			.races-codex__rail::before {
				content: "";
				position: absolute;
				top: 46px;
				bottom: 46px;
				left: 50%;
				width: 2px;
				transform: translateX(-50%);
				background: linear-gradient(180deg, transparent, var(--border-stone) 15%, var(--border-stone) 85%, transparent);
				pointer-events: none;
			}
			.races-codex__node {
				position: relative;
				z-index: 1;
				flex-shrink: 0;
				width: 54px;
				height: 54px;
				margin: 6px 0;
				padding: 0;
				border-radius: 50%;
				border: 1px solid var(--border-stone);
				background: radial-gradient(circle at 35% 30%, var(--bg-panel-raised), var(--bg-inset));
				display: flex;
				align-items: center;
				justify-content: center;
				font-size: 24px;
				color: var(--text-faint);
				cursor: pointer;
				transition: border-color .2s ease, box-shadow .2s ease, transform .15s ease;
			}
			.races-codex__node .icon-img { width: 32px; height: 32px; border-radius: 50%; object-fit: cover; }
			.races-codex__node:hover { border-color: var(--rune); transform: translateY(-1px); }
			.races-codex__node:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
			.races-codex__node.is-active {
				border-color: var(--gold);
				box-shadow: 0 0 0 3px rgba(224,178,95,.15), 0 0 18px var(--ember-glow);
			}
			.races-codex__node.is-active::after {
				content: "";
				position: absolute;
				inset: -5px;
				border-radius: 50%;
				border: 1px dashed rgba(224,178,95,.5);
				animation: races-codex-spin 14s linear infinite;
			}
			@keyframes races-codex-spin { to { transform: rotate(360deg); } }
			@keyframes races-codex-pulse {
				0%, 100% { box-shadow: 0 0 0 3px rgba(224,178,95,.15), 0 0 18px var(--ember-glow); }
				50% { box-shadow: 0 0 0 7px rgba(224,178,95,.35), 0 0 30px var(--ember-glow); }
			}
			.races-codex__node--pulse { animation: races-codex-pulse .6s ease-in-out 2; }

			/* ---------- page ---------- */
			.races-codex__page {
				position: relative;
				flex: 1;
				min-width: 0;
				min-height: 0;
				overflow-y: auto;
				overflow-x: hidden;
				padding: 26px 14px 12px 28px;
				margin-left: 4px;
				border-left: 1px solid var(--border-stone-soft);
				perspective: 1200px;

				background-color: rgba(236,229,218,.012);
				background-image: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix type='saturate' values='0'/></filter><rect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/></svg>");
				background-size: 140px 140px;
				box-shadow:
					inset 26px 0 20px -22px rgba(0,0,0,.55),
					inset 0 26px 18px -22px rgba(0,0,0,.4),
					inset 0 -26px 18px -22px rgba(0,0,0,.4);

				scrollbar-width: thin;
				scrollbar-color: rgba(224,178,95,.55) rgba(255,255,255,.06);
			}
			.races-codex__page::-webkit-scrollbar { width: 8px; }
			.races-codex__page::-webkit-scrollbar-track { background: transparent; margin: 4px 0; }
			.races-codex__page::-webkit-scrollbar-thumb {
				background: rgba(224,178,95,.55);
				border-radius: 4px;
				border: 2px solid transparent;
				background-clip: padding-box;
			}
			.races-codex__page::-webkit-scrollbar-thumb:hover {
				background: rgba(224,178,95,.8);
				background-clip: padding-box;
			}
			.races-codex__page-inner {
				transform-origin: left center;
				animation: races-codex-page-turn .45s cubic-bezier(.22,.68,.32,1);
			}
			@keyframes races-codex-page-turn {
				from { opacity: 0; transform: rotateY(-10deg) translateX(8px); }
				to { opacity: 1; transform: rotateY(0deg) translateX(0); }
			}

			.races-codex__seal {
				position: relative;
				width: 64px;
				height: 64px;
				margin: 0 auto 10px;
				border-radius: 50%;
				border: 1px solid var(--gold);
				background: radial-gradient(circle at 35% 30%, var(--bg-panel-raised), var(--bg-inset));
				box-shadow: 0 0 24px var(--rune-glow);
				display: flex;
				align-items: center;
				justify-content: center;
				font-size: 32px;
			}
			.races-codex__seal::before {
				content: "";
				position: absolute;
				inset: -6px;
				border-radius: 50%;
				border: 1px dashed rgba(155,123,240,.4);
			}
			.races-codex__seal .icon-img { width: 42px; height: 42px; border-radius: 50%; object-fit: cover; }

			.races-codex__name {
				margin: 0 0 4px;
				text-align: center;
				font-family: var(--font-display-deco);
				font-size: 20px;
				letter-spacing: .03em;
				color: var(--gold);
			}
			.races-codex__count {
				margin: 0 0 14px;
				text-align: center;
				font-family: var(--font-mono);
				font-size: 10px;
				letter-spacing: .08em;
				text-transform: uppercase;
				color: var(--text-faint);
			}
			.races-codex__rule {
				position: relative;
				width: 70%;
				height: 1px;
				margin: 0 auto 14px;
				background: linear-gradient(90deg, transparent, var(--border-stone), transparent);
			}
			.races-codex__rule::after {
				content: "\\2726";
				position: absolute;
				top: 50%;
				left: 50%;
				transform: translate(-50%, -50%);
				background: var(--bg-panel);
				color: var(--text-faint);
				font-size: 10px;
				padding: 0 6px;
			}
			.races-codex__desc {
				margin: 0 0 18px;
				font-family: var(--font-body);
				font-size: 13px;
				line-height: 1.7;
				color: var(--text-muted);
			}
			.races-codex__examples-label {
				display: flex;
				align-items: center;
				gap: 8px;
				margin: 0 0 8px;
				font-family: var(--font-mono);
				font-size: 10px;
				letter-spacing: .12em;
				text-transform: uppercase;
				color: var(--text-faint);
			}
			.races-codex__examples-label::after {
				content: "";
				flex: 1;
				height: 1px;
				background: var(--border-stone-soft);
			}
			.races-codex__specimens {
				display: flex;
				flex-wrap: wrap;
				gap: 8px;
			}
			.races-codex__specimen {
				width: 44px;
				height: 44px;
				border-radius: 10px;
				overflow: hidden;
				background: var(--bg-inset);
				border: 1px solid var(--border-stone);
				display: flex;
				align-items: center;
				justify-content: center;
				transition: border-color .15s ease, transform .15s ease;
			}
			.races-codex__specimen .icon-img { width: 100%; height: 100%; object-fit: cover; }
			.races-codex__specimen:hover { border-color: var(--ember); transform: translateY(-2px); }
			.races-codex__no-specimens {
				margin: 0;
				font-size: 12px;
				color: var(--text-faint);
				font-style: italic;
			}

			/* ---------- title ---------- */
			.modal--races .modal__title.races-codex__title {
				display: flex;
				flex-direction: column;
				align-items: center;
				gap: 7px;
				margin: 0 0 4px;
			}
			.races-codex__title-eyebrow {
				font-family: var(--font-mono);
				font-size: 10px;
				letter-spacing: .3em;
				text-transform: uppercase;
				color: var(--text-faint);
			}
			.races-codex__title-main {
				display: flex;
				align-items: center;
				gap: 12px;
				font-family: var(--font-display-deco);
				font-size: 27px;
				letter-spacing: .05em;
				color: var(--gold);
				text-shadow: 0 0 18px var(--ember-glow);
			}
			.races-codex__title-flourish {
				position: relative;
				width: 36px;
				height: 1px;
				background: linear-gradient(90deg, transparent, var(--border-stone));
			}
			.races-codex__title-main .races-codex__title-flourish:last-child {
				background: linear-gradient(90deg, var(--border-stone), transparent);
			}
			.races-codex__title-flourish::after {
				content: "";
				position: absolute;
				top: 50%;
				left: 50%;
				width: 5px;
				height: 5px;
				background: var(--gold);
				opacity: .8;
				transform: translate(-50%, -50%) rotate(45deg);
			}

			@media (max-width: 420px) {
				.races-codex__title-main { font-size: 22px; gap: 8px; }
				.races-codex__title-flourish { width: 22px; }
			}

			@media (prefers-reduced-motion: reduce) {
				.races-codex__page-inner { animation: none; }
				.races-codex__node.is-active::after { animation: none; }
				.races-codex__node--pulse { animation: none; }
			}

			/* ---------- mobile: rail becomes a horizontal strip on top ---------- */
			@media (max-width: 560px) {
				.modal--races {
					padding: 22px 18px;
					border-radius: 14px;
					box-shadow: var(--shadow-deep), 0 0 40px var(--ember-glow);
				}
				.modal--races::before { display: none; }
				.races-codex { flex-direction: column; }
				.races-codex__rail {
					flex: 0 0 auto;
					flex-direction: row;
					overflow-x: auto;
					overflow-y: visible;
					padding: 20px 10px 24px;
					cursor: default;
				}
				.races-codex__rail::before {
					top: 50%;
					left: 24px;
					right: 24px;
					bottom: auto;
					width: auto;
					height: 2px;
					transform: translateY(-50%);
				}
				.races-codex__node { margin: 0 10px; }
				.races-codex__page {
					border-left: none;
					border-top: 1px solid var(--border-stone-soft);
					margin-left: 0;
					padding: 26px 6px 4px;
				}
			}
		`;
		document.head.appendChild(style);
	}
}