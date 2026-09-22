/**
 * dsh-hero-rightbar — the right Sidebar's way in, on a page with no conversation.
 *
 * WHY THIS PLUGIN EXISTS
 *
 * The right Sidebar's only affordance for opening it is `ExpandButton`, an
 * occupant of the `conversation.session.header.corner` seat. The Session header
 * renders no chrome at all while the Session is still blank — the shipped
 * conversation skeleton derives
 *
 *     const hideChrome = session.blank && conversationPhase(session, conversation) === "blank"
 *
 * and, when `hideChrome` is true, renders an empty, `aria-hidden` <header> with
 * none of its seats inside. So on EVERY "no conversation yet" page the column
 * has no way in:
 *
 *   - a New Session that has not been used yet (the hero),
 *   - a blank Session reused by the New Session flow,
 *   - a fresh blank Session in another Workspace (same page, new Session),
 *   - the no-Session empty state (nothing selected at all).
 *
 * The column itself is mounted and perfectly usable in the first three cases —
 * it is only the button that is missing. In the last case the column is keyed
 * by Session id, so there is nothing to open until a Session exists.
 *
 * WHAT THIS PLUGIN DOES
 *
 * It contributes one entry to the frame's additive `shell.overlay` seat: a
 * button drawn exactly where the header corner would draw it (same 28px
 * control, same glyph, same colors, same copy, read from the product's own
 * `sidebarRight` locale namespace). Clicking it does what the shipped button
 * does — expand the column — and when there is no Session to key the column on,
 * it first starts the New Session flow (the same blank Session the product's own
 * 新会话 control creates), then expands. The panel that opens is the product's
 * own, so every docked tab type (Files, previews, third-party docks) keeps
 * working untouched.
 *
 * WHO DECIDES, AND WHY NOT THIS COMPONENT
 *
 * The trigger owns exactly two conditions, and both are ordinary reactive state:
 *
 *   - the conversation surface is the selected main panel;
 *   - the frame reports the right column collapsed — `data-rightbar-collapsed`,
 *     the presentation signal the frame itself writes from its solved geometry.
 *
 * "Is the product already drawing its own control?" is deliberately NOT decided
 * here. It is decided by one CSS rule — `body:has([data-sidebar-right-expand])`
 * — which the browser re-evaluates on every DOM change. An earlier revision
 * asked `document.querySelector` at render time instead, and that read is taken
 * BEFORE React commits: the first render after leaving a Session whose header
 * WAS drawn still saw that Session's button, so the trigger rendered nothing —
 * and because the value was not reactive, nothing ever re-rendered it. The
 * button therefore stayed missing for good on exactly the transition this plugin
 * exists for (a used conversation → a fresh blank Session, for example a New
 * Session in another Workspace), while a page that had never drawn a header
 * worked. Deciding in CSS removes the ordering question: the browser, not React,
 * keeps the answer current.
 *
 * The gate also no longer depends on the Session-list `blank` bit. That bit is a
 * list-summary projection that lags a Session switch and is absent entirely for
 * a Session the list has not filled in yet; with the product's own control
 * arbitrating in CSS, the plugin can simply offer the way in whenever the column
 * is collapsed and the product is not already offering it.
 *
 * ── 中文备注 ───────────────────────────────────────────────────────────────
 * 右侧栏唯一的入口是挂在「会话 header 角落席位」上的展开按钮，而会话头在「空会话」
 * 阶段整段不渲染（hideChrome）：新会话、被复用的空会话、以及完全没有会话的空页面，
 * 都因此没有入口——面板其实是活的，只是没有按钮。
 *
 * 本插件往框架的 `shell.overlay`（root 作用域、可叠加的浮层席位）加一个按钮，
 * 位置/图形/尺寸/配色/文案都对齐产品自带的那颗（文案直接取产品的 `sidebarRight`
 * 文案命名空间，取不到才用自己的兜底文案）。
 *
 * 它只保留两个判定，都是普通响应式状态：会话界面被选中 + 框架报告右栏收起
 * （`data-rightbar-collapsed`，框架自己按算出来的列宽写的呈现信号）。
 *
 * 「产品是不是已经画了自己的按钮」**不在这里判断**，交给一条 CSS：
 * `body:has([data-sidebar-right-expand])` —— 浏览器在任何 DOM 变化后立刻重算。
 * 旧版本改成在 render 期间 `document.querySelector` 查 DOM：那一次读取发生在 React
 * commit 之前，从「有对话的会话」切到「新工作区的空会话」时，读到的还是上一会话
 * header 里的按钮，于是整个组件返回 null；而这个值不是响应式的，之后不会再有
 * 重渲染，按钮就永久消失——正是「一开始（从没画过 header）有效、新建空会话失效」
 * 的原因。判断交给 CSS 之后，这个顺序问题彻底不存在。
 *
 * 同时不再依赖会话列表的 `blank` 位（那是列表摘要投影，切会话时会滞后，而且列表还
 * 没填进来时根本不存在）。既然产品自己的控件已经由 CSS 仲裁，插件只需要在「右栏
 * 收起 + 产品没有提供入口」时把入口补上。
 *
 * 设计边界：本插件不复制任何会话头逻辑，也不隐藏产品的任何东西；产品自己把
 * 按钮画出来时，CSS 立刻把这里藏掉。
 */
window.__ModuleLoader__.load({
	id: "dsh-hero-rightbar",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const react = require("react");
		const primitives = require("@deepseek-ai/dsh-client-ui-primitives");

		/* 中文：自己的文案命名空间（提示语）；按钮本身的文案优先复用产品
		   `sidebarRight` 命名空间里的 chrome.expand / chrome.expandAria。 */
		const NS = "heroRightbar";
		/** The product namespace whose copy the shipped button uses. */
		const PRODUCT_NS = "sidebarRight";

		const zh = {
			expand: "打开侧边栏",
			expandAria: "打开右侧边栏",
			working: "正在打开右侧边栏…",
			needWorkspace: "先选择一个工作区，然后就能打开右侧边栏。",
			failed: "右侧边栏没能打开，稍后再试一次。",
			native: "打开右侧边栏"
		};
		const en = {
			expand: "Open the Sidebar",
			expandAria: "Open the right Sidebar",
			working: "Opening the right Sidebar…",
			needWorkspace: "Choose a workspace first, then the right Sidebar can open.",
			failed: "The right Sidebar did not open. Try again in a moment.",
			native: "Open the right Sidebar"
		};

		/** Services this plugin needs before it can do anything. */
		const inject = ["slots", "locale", "sessions", "uiWorkspace", "sidebarRight"];

		/** The frame's collapsed signal on the right column; the column reports it on the frame root. */
		const COLLAPSED_ATTR = "data-rightbar-collapsed";
		/** The frame's fullscreen signal: the panel covers the viewport, so no way-in is needed. */
		const FULLSCREEN_ATTR = "data-rightbar-fullscreen";
		/** A tab id that can never exist; the readiness probe passes it to a no-op lookup. */
		const PROBE_TAB = "dsh-hero-rightbar/probe";

		const CSS = `
.dsh-hero-rightbar-trigger {
	position: fixed;
	top: 11px;
	right: 12px;
	width: 28px;
	height: 28px;
	padding: 6px;
	display: inline-flex;
	flex: none;
	align-items: center;
	justify-content: center;
	color: var(--dsw-alias-label-secondary);
	background: 0 0;
	border: none;
	border-radius: 28px;
	cursor: pointer;
	pointer-events: auto;
	z-index: 1;
}
.dsh-hero-rightbar-trigger:hover { background: var(--dsw-alias-interactive-bg-hover); }
.dsh-hero-rightbar-trigger[data-busy="true"] { opacity: .6; cursor: default; }
.dsh-hero-rightbar-trigger svg { width: 15px; height: 15px; }
.dsh-hero-rightbar-icon { transform: scaleX(-1); }
.dsh-hero-rightbar-hint {
	position: fixed;
	top: 44px;
	right: 12px;
	max-width: 320px;
	padding: 8px 10px;
	color: var(--dsw-alias-label-primary);
	background: var(--dsw-alias-bg-elevated, var(--dsw-alias-bg-base));
	border: .5px solid var(--dsw-alias-border-l4);
	border-radius: 10px;
	box-shadow: 0 6px 20px rgb(0 0 0 / 24%);
	font-size: 12px;
	line-height: 18px;
	pointer-events: auto;
	z-index: 2;
}
/* The product's own control wins whenever it is on the page. This is the whole
   arbitration: the browser re-evaluates :has() on every DOM change, so the
   trigger can neither double up with the shipped button nor go stale while a
   Session switch commits — and nothing has to read the DOM mid-render.
   The selectors are spelled out rather than interpolated so that this text is
   literally the stylesheet the browser receives (verify/extract-css.mjs slices
   it out and a browser asserts on it).
   Fullscreen covers the viewport with the product's own panel, so the way-in is
   not drawn there either (the overlay sits below that panel). */
body:has([data-sidebar-right-expand]) .dsh-hero-rightbar-trigger,
body:has([data-sidebar-right-expand]) .dsh-hero-rightbar-hint,
body:has([data-rightbar-fullscreen]) .dsh-hero-rightbar-trigger,
body:has([data-rightbar-fullscreen]) .dsh-hero-rightbar-hint { display: none; }
`;

		/** Inject the plugin's stylesheet once per document. */
		function ensureStyles() {
			const id = "dsh-hero-rightbar/styles";
			if (document.querySelector("style[data-plugin-css=" + JSON.stringify(id) + "]") !== null) return;
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-hero-rightbar";
			tag.dataset.pluginCss = id;
			tag.textContent = CSS;
			document.head.appendChild(tag);
		}

		const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

		/**
		 * Poll until the probe answers true.
		 * @param probe - synchronous predicate.
		 * @param timeoutMs - give-up budget.
		 * @returns whether the probe ever answered true.
		 */
		async function waitFor(probe, timeoutMs) {
			const deadline = Date.now() + timeoutMs;
			for (;;) {
				let answer = false;
				try {
					answer = probe() === true;
				} catch (error) {
					answer = false;
				}
				if (answer) return true;
				if (Date.now() >= deadline) return false;
				await sleep(60);
			}
		}

		/**
		 * Build the trigger component for one client context.
		 * @param ctx - the plugin's client context.
		 * @returns the overlay entry's component.
		 */
		function createTrigger(ctx) {
			const tOwn = ctx.locale.bind(NS);
			/* 中文：产品自带按钮的文案直接从产品的命名空间取；命名空间不在时
			   translate 会回落成 key 本身，那就用自己的兜底文案。 */
			const tProduct = ctx.locale.bind(PRODUCT_NS);
			const productCopy = (key, fallbackKey) => {
				const value = tProduct(key);
				return typeof value === "string" && value !== key ? value : tOwn(fallbackKey);
			};

			/**
			 * Whether a Session surface is mounted yet.
			 *
			 * `focus` reaches the controller's `require()`, which is the only
			 * public way to ask "is a Session surface bound" without changing
			 * anything: it throws while nothing is mounted, and a lookup for a
			 * tab that does not exist is a documented no-op once bound. After the
			 * New Session flow the seat mounts a render later, so the click waits
			 * on this instead of guessing.
			 * @returns whether `ctx.sidebarRight` can be driven right now.
			 */
			function surfaceMounted() {
				try {
					ctx.sidebarRight.focus(PROBE_TAB);
					return true;
				} catch (error) {
					return false;
				}
			}

			/**
			 * Whether the frame reports the right column collapsed.
			 *
			 * The frame writes this attribute from its own solved geometry, so it
			 * is the presentation fact itself — not a second guess at product
			 * state. The controller's `isExpanded()` is deliberately not consulted:
			 * its binding belongs to the seat of the Session that was mounted a
			 * moment ago, so across a Session switch it can still report the
			 * previous Session's expanded column and hide the way in.
			 * @returns whether the right column occupies no width right now.
			 */
			function readCollapsed() {
				return document.querySelector("[" + COLLAPSED_ATTR + "]") !== null;
			}

			/* 中文：只监听这两个属性，不监听子节点——流式输出时对话区会疯狂改 DOM，
		   但我们关心的呈现信号只会改这两个属性（右栏展开/收起、全屏进出）。 */
			function subscribeCollapsed(onChange) {
				const observer = new MutationObserver(onChange);
				observer.observe(document.documentElement, {
					attributes: true,
					attributeFilter: [COLLAPSED_ATTR, FULLSCREEN_ATTR],
					subtree: true
				});
				return () => observer.disconnect();
			}

			function Trigger({ usePanelInfo }) {
				/* 中文：只有「会话界面」被选中时才有意义——否则按钮会飘在设置等
				   全局面板上。 */
				const conversationSelected = usePanelInfo((info) => info.activePanelId === null);
				const collapsed = react.useSyncExternalStore(subscribeCollapsed, readCollapsed, readCollapsed);
				const [busy, setBusy] = react.useState(false);
				const [hint, setHint] = react.useState(undefined);

				const click = react.useCallback(async () => {
					if (busy) return;
					setBusy(true);
					setHint(undefined);
					try {
						if (ctx.sessions.list.getSnapshot().current === undefined) {
							/* 中文：右栏状态按会话 id 键控，没有会话就没有可开的面板。
							   先走一次「新会话」流程——和左侧「新会话」按钮同一个动作。 */
							ctx.uiWorkspace.startSession();
							const started = await waitFor(
								() => ctx.sessions.list.getSnapshot().current !== undefined,
								8000
							);
							if (!started) {
								setHint(tOwn("needWorkspace"));
								return;
							}
						}
						const mounted = await waitFor(surfaceMounted, 8000);
						if (!mounted) {
							setHint(tOwn("failed"));
							return;
						}
						if (!ctx.sidebarRight.isExpanded()) ctx.sidebarRight.toggleExpanded();
					} catch (error) {
						setHint(tOwn("failed"));
					} finally {
						setBusy(false);
					}
				}, [busy]);

				react.useEffect(() => {
					if (hint === undefined) return undefined;
					const timer = setTimeout(() => setHint(undefined), 6000);
					return () => clearTimeout(timer);
				}, [hint]);

				/* 中文：产品自己画了按钮、或右栏已经占位/全屏时，CSS 会把这里藏掉；
				   这里只判断两个响应式状态，绝不在 render 期间读 DOM。 */
				if (!conversationSelected || !collapsed) return null;

				const label = productCopy("chrome.expand", "expand");
				return react.createElement(
					react.Fragment,
					null,
					busy
						? react.createElement("div", { className: "dsh-hero-rightbar-hint" }, tOwn("working"))
						: null,
					react.createElement(
						primitives.Tooltip,
						{ label, side: "bottom", delayMs: 500 },
						react.createElement(
							"button",
							{
								type: "button",
								className: "dsh-hero-rightbar-trigger",
								"data-hero-rightbar-trigger": true,
								"data-busy": busy ? "true" : undefined,
								"aria-label": productCopy("chrome.expandAria", "expandAria"),
								onClick: click
							},
							react.createElement(primitives.IconPanelLeftOutline16, {
								className: "dsh-hero-rightbar-icon"
							})
						)
					),
					hint === undefined
						? null
						: react.createElement("div", { className: "dsh-hero-rightbar-hint", role: "status" }, hint)
				);
			}

			return Trigger;
		}

		/**
		 * Install the overlay entry.
		 * @param ctx - the plugin's client context.
		 */
		function apply(ctx) {
			ensureStyles();
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-hero-rightbar: dictionaries");
			const Trigger = createTrigger(ctx);
			ctx.effect(
				() =>
					ctx.slots.inject("shell.overlay", () =>
						ctx.slots.register(
							{
								name: "shell.overlay",
								id: "dsh-hero-rightbar/trigger",
								order: 200,
								locale: NS
							},
							Trigger
						)
					),
				"dsh-hero-rightbar: hero trigger seat"
			);
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
