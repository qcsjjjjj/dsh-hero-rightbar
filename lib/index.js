/**
 * dsh-hero-rightbar host entry.
 *
 * The whole plugin lives in the browser: it contributes one entry to the frame's
 * `shell.overlay` seat and drives `ctx.sidebarRight` from there. Nothing here
 * faces the model, registers a route, or touches the filesystem, so this host
 * half only exists because a bundle-patch row is a plugin row — the profile's
 * `dsh.profile.bundles` registers the package and the loader needs a module to
 * apply.
 *
 * ── 中文备注 ───────────────────────────────────────────────────────────────
 * 这个插件的全部逻辑都在浏览器侧（往 shell.overlay 加一颗按钮，点击时驱动
 * ctx.sidebarRight）。宿主半边没有面向模型、路由或文件系统的任何东西，它存在
 * 只是因为 bundle patch 的一行就是一个插件行：profile 的 dsh.profile.bundles
 * 登记了这个包，加载器需要一个模块来 apply。
 */

/** Stable Cordis plugin name; matches the package name the bundle patch inserts. */
export const name = 'dsh-hero-rightbar'

/** No host-side behaviour; see the file header. */
export function apply() {}
