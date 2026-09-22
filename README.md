# dsh-hero-rightbar

在没有对话的页面上，把**右侧栏的开启按钮**补回来。

```sh
dsh plugin --profile web add /绝对路径/dsh-hero-rightbar-0.1.0.tgz
# 客户端 bundle 由 dsh-client-hmr 监视：改写已安装的
#   <profile>/node_modules/dsh-hero-rightbar/client/client.js
# 会在约 1 秒内原地热替换该插件，不需要重启 dsh，也不需要刷新页面。
```

---

## 1. 为什么原本没有那颗按钮

右侧栏唯一的入口，是挂在**会话 header 角落席位**上的那颗展开按钮：

- `@deepseek-ai/dsh-client-ui-sidebar-right` 把自己的按钮注册进
  `conversation.session.header.corner`；
- 而这个席位所在的 header，在**空会话阶段整段不渲染**——
  `@deepseek-ai/dsh-client-ui-conversation` 的会话骨架里写着：

  ```js
  const hideChrome = session.blank && conversationPhase(session, conversation) === "blank"
  ```

  `hideChrome` 为真时，它渲染的是一个空的、`aria-hidden` 的 `<header>`，
  里面**一个子席位都没有**，角落按钮自然也不存在。

所以在下面几种「还没有对话」的页面上，右栏都没有入口：

| 页面状态 | 右栏本身 | 入口按钮 |
| --- | --- | --- |
| 点「新会话」后的空白会话（hero） | **已挂载、可用** | 不渲染 |
| 被「新会话」复用的空会话 | **已挂载、可用** | 不渲染 |
| **在另一个工作区新建的空会话** | **已挂载、可用** | 不渲染 |
| 完全没有选中会话的空页面 | 无（状态按会话 id 键控） | 不渲染 |

最后一种是因为右栏的状态**按会话 id 键控**（`@deepseek-ai/dsh-client-ui-sidebar-right`
自己的已知限制里写着「没有会话就没有停靠面」），没有会话就没有可展开的面板。

### 1.1 曾经修不好的一种情况（已修）

旧版本在**渲染期间**用 DOM 判断「产品是不是已经画了按钮」：

```js
if (document.querySelector(BUILTIN_SELECTOR) !== null) return null;
```

React 是「先把整棵树 render 完，再 commit DOM」。从**有对话的会话**切到**新的空会话**
（例如新工作区里的新会话）时，组件重渲染的那一刻，旧会话 header 里那颗
`[data-sidebar-right-expand]` **还在真实 DOM 里**，于是判定成「产品已经画了」→
整个组件返回 `null`；而这个判断不是响应式的，commit 之后**不会重新求值**，按钮就
永久消失了。

这正好解释了现象：**页面从没画过 header 时（一开始完全没有会话）有效；一旦进过
有对话的会话、再新建空会话就失效。**

## 2. 这个插件做了什么

往框架**可叠加的浮层席位** `shell.overlay`（root 作用域、`list` 类型）加**一颗按钮**：

- 位置对齐产品自带那颗（`top: 11px; right: 12px`，即 header `padding: 10px 28px 0 20px`
  加上角落席位 `margin-right: -16px` 后的落点）；
- 28px 圆形控件、`IconPanelLeftOutline16` 镜像图标、同样的 hover 底色；
- 文案直接取产品 `sidebarRight` 命名空间里的 `chrome.expand` / `chrome.expandAria`，
  取不到才用自己的兜底文案。

### 2.1 判定只有两条，且都由浏览器保持最新

组件只判断两个**响应式**条件：

1. **会话界面被选中**（`panelInfo.activePanelId === null`，否则按钮会飘在设置等全局面板上）；
2. **框架报告右栏收起**——框架根上的 `data-rightbar-collapsed`，是框架按自己算出的列宽
   写下的呈现信号本身。

「**产品是不是已经画了自己的按钮**」不在这里判断，交给一条 CSS：

```css
body:has([data-sidebar-right-expand]) .dsh-hero-rightbar-trigger { display: none }
body:has([data-rightbar-fullscreen])  .dsh-hero-rightbar-trigger { display: none }
```

`:has()` 由浏览器在**任何 DOM 变化后立刻重算**，所以：

- 产品把按钮画出来时，这里瞬间隐藏 —— **不可能出现两颗按钮**；
- 会话切换 commit 的中间态也不会让这里卡死（不再有「render 读到旧 DOM」这回事）；
- 全屏时产品自己的面板铺满视口（浮层 z-index 更低），这里不画入口。

同时**不再依赖会话列表的 `blank` 位**：那是列表摘要投影，切会话时会滞后，列表还没填进来时
根本不存在。既然产品自己的控件已经由 CSS 仲裁，插件只需要在「右栏收起 + 产品没提供入口时」
把入口补上。

也**不再读 `ctx.sidebarRight.isExpanded()` 作为收起判据**：它的 binding 属于上一个刚挂载的
会话座位，跨会话切换时可能仍报告上一会话的展开状态，从而把入口藏起来。呈现事实以框架自己
写的属性为准。

点击行为与自带按钮一致——**展开右栏**；如果当前没有任何会话（右栏没有可键控的对象），就先走
一次「新会话」流程（和左侧「新会话」按钮同一个动作，创建一个空会话），等座位挂载后立刻展开。
展开出来的是**产品自己的面板**，所以文件、预览、第三方停靠的 tab（技能中心、任务看板、
工作流卡片、插件市场……）全部照旧可用。

## 3. 已知边界

- **没有工作区时会提示**，不会静默失败：没有任何工作区时，「新会话」流程没有目标会话可创建，
  按钮会浮出一条「先选择一个工作区」的提示（6 秒后自动消失）。
- **不改产品任何东西**：不注入 header、不隐藏原按钮、不改会话骨架；只往一个官方留白的浮层
  席位上添一件自己的东西，另加一条只作用于自身类名的 CSS 仲裁。
- **依赖三个稳定接缝**：`shell.overlay` 席位、框架写在根节点上的 `data-rightbar-collapsed` /
  `data-rightbar-fullscreen`、以及 `ctx.sidebarRight` 控制器（`isExpanded` / `toggleExpanded`）。
- **需要 `:has()`**：与产品自身前端同一基线（产品自己的 chat / conversation / trajectory 与
  构建产物 CSS 都在用 `:has()` 和 `@container`）。
- **展开后的收起**走面板自己的控件（tab 条末端那颗），与自带按钮的行为一致。

## 4. 结构

```
dsh-hero-rightbar/
├── package.json          # dsh.bundle.patch + dsh.client(platform: web, inject)
├── cordis.patch.yml      # bundle patch：把插件行插进加载器树
├── lib/index.js          # 宿主半边：无行为（逻辑全在浏览器侧）
├── client/client.js      # 浏览器半边：shell.overlay 入口 + CSS 仲裁 + 点击流程
├── verify/               # 开发期验证：抽取真实 CSS、真浏览器断言、安装一致性
│   ├── extract-css.mjs
│   ├── arbitration.html
│   ├── run.mjs
│   ├── watch-graph.mjs
│   ├── prove-live-reload.mjs
│   └── check-install.mjs
└── README.md
```

无第三方运行期依赖（只用加载器暴露的 `react` 与 `@deepseek-ai/dsh-client-ui-primitives`）。
`verify/` 只在开发期使用，已由 `package.json` 的 `files` 排除在发布产物之外。

## 5. 验证

```sh
node verify/extract-css.mjs        # 从发布的 client.js 里切出真正下发的样式串
node verify/run.mjs                # 本机 Chromium/Edge + puppeteer-core，断言仲裁行为
node verify/check-install.mjs      # 源码 / 安装副本 / tgz / lock 完整性 / 在线下发产物 五方一致
node verify/prove-live-reload.mjs  # 改写安装副本 → 等待 rebuilt 帧 → 校验新 rev 下发内容 → 还原
node verify/watch-graph.mjs 8      # 读在线客户模块图（SSE），确认插件在图中及其 rev
```

`run.mjs` 断言的是「产品控件在不在 DOM 里」这条仲裁，而不是某个组件状态：

| 断言 | 说明 |
| --- | --- |
| 无产品控件 → 入口可见 | 空会话 / 无会话页面 |
| 产品控件出现 → 入口**同一任务内**隐藏 | 不需要任何重渲染 |
| 产品控件消失 → 入口重新可见 | 会话切回空会话 |
| 全屏信号 → 入口隐藏 | 产品面板已铺满 |
| 旧实现模型在同一步骤里保持卡死 | 复现被修掉的那个 bug |

`prove-live-reload.mjs` 证明「装好不用重启」：它给安装副本追加一行注释、等
`/plugins/events` 上的 `rebuilt` 帧点名本插件、把该 rev 的下发内容取回来校验、再还原原始字节，
最后确认文件与自己开工前逐字节一致。

`check-install.mjs` 在最后打印的五方一致性结论形如：

```
OK - source, install, tarball, lockfile and the live server all agree on the fixed bundle
```
