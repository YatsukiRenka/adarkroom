A Dark Room（kotoka 魔改版）
===========================

在线游玩：<https://a.kotoka.club>

本仓库基于 [doublespeakgames/adarkroom](https://github.com/doublespeakgames/adarkroom)（MPL-2.0），在原版之上做了以下修改。原版英文说明见文末。

## 模式：原版 / 魔改版

菜单里的「模式」按钮在两种模式间切换，切换前有二次确认。两种模式的存档相互独立（本地和云端都分开保存），切换时会保存当前进度并载入另一模式的存档，没有存档则开始新游戏。

| | 原版 | 魔改版（默认） |
|---|---|---|
| 游戏速度 | x1 / x2 | x1 / x2 / x3 |
| 小屋上限 | 20 | 50 |
| 自动模式 | 无 | 双击有冷却的按钮（或连按两下快捷键）开启自动重复，单击关闭；火已旺盛时不会自动添柴 |

下面的其余改动在两种模式下都有效。

## 游戏体验

- **后台不暂停**：游戏计时器运行在 Web Worker 中，标签页在后台时浏览器不会把游戏节奏拖慢。
- **加速不影响战斗**：战斗期间敌人出手和己方冷却始终按 x1 计时，战斗结束后恢复倍速。
- **战斗快捷键**：默认 1–6 对应攻击按钮，E 吃肉，R 服药，T 注射剂，F 强化，G 护盾，Space 拿走一切，Enter 离开；可在菜单「快捷键」中自定义，按键提示显示在按钮角落。
- **键盘移动**：WASD 和方向键在中文输入法开启时同样可用，方向键不会滚动页面，输入框内的按键不受影响。
- **探索中断保护**：探索途中刷新或关闭网页，下次打开时会把带出的物资退回村里（途中消耗的不退，途中拾取的物品不计入）。
- **界面修复**：村落建筑很多时库存栏不再被截断，内容区高度随内容自适应。
- **存档导入**：除原版的存档代码外，也接受 `ADR1:` 开头的压缩存档代码；无效代码不会覆盖当前存档。部分站点导出的 `ADR1:` 存档以有损方式保存地图迷雾，这类存档的世界地图无法完整还原。

## 语言与清理

- 语言只保留简体中文和英文，默认简体中文；手机等窄屏上菜单中提供 English / 中文 一键切换。
- 补全原版中文翻译缺失的 235 条文本（处刑者终局、制造器、部分遭遇战等）。
- jQuery 改为本地加载；移除 Google Analytics、左下角官网链接、应用商店 / 分享 / GitHub 菜单项，以及 Penrose 推广事件。

## 移动端

- 不再强制跳转到应用商店下载页面。
- **竖屏**：游戏区按屏宽缩放；菜单固定在顶部（一行小按钮，放不下时可左右滑动）；日志固定在底部，约显示六行。
- **横屏**：保持桌面布局并整体缩放，菜单在顶部。
- **探索**：竖屏时地图铺满菜单与日志之间的区域；点击地图时按两条对角线把地图分成上、下、左、右四块，点哪块往哪走；横屏时让玩家位置保持在屏幕中央。
- **数量调整**：点工人分配行或出发物资行，弹出带 −10 / −1 / +1 / +10 大按钮的面板。
- **事件与战斗**：弹窗在屏幕中央显示并等比放大，背后有遮罩防止误触。
- **太空飞行**：触屏时飞船跟随手指移动。

## 登录与云存档

登录为可选项，不登录也能正常游玩。登录通过 [authentik](https://goauthentik.io) 的 forward auth 完成，仅保护 `/api/*`。

- **自动存档**：每 1 / 5 / 10 分钟同步一次（可在云存档窗口中设置），切换标签页或关闭页面时也会同步；云端只保留最新一份。多台设备进度冲突时会询问保留哪一份；新设备上刚开局时直接载入云存档。
- **手动存档**：每种模式 19 个存档位，可命名、重命名、读取、覆盖、删除；列表每页 5 条，第一页第一条固定为自动存档。
- 重启游戏时保留快捷键、语言、云同步状态和另一模式的存档。

## 目录结构

| 路径 | 内容 |
|---|---|
| `script/kotoka/` | 本分支的前端模块：后台计时器、模式切换、自动模式、快捷键、云存档、移动端适配、探索中断保护、翻译 |
| `css/kotoka.css` | 本分支的样式 |
| `server/` | 云存档服务（Python 标准库 + SQLite，含 Dockerfile 和测试） |
| `tools/kotoka/` | Node 测试、翻译缺口扫描脚本、本地开发服务器（模拟登录和 `/api` 反向代理） |

## 开发与测试

```bash
# 前端逻辑测试
for t in tools/kotoka/test-*.js; do node "$t"; done
# 云存档服务测试
cd server && python -m unittest
# 检查是否还有未翻译成中文的文本（应输出 missing: 0）
python tools/kotoka/missing-zh.py . /tmp/missing-zh.json
# 本地运行：先启动 server/app.py，再启动开发服务器（模拟已登录用户）
python tools/kotoka/dev-server.py --uid dev --username dev --secret-file <密钥文件>
```

部署要点：静态文件可直接由 nginx 提供；`index.html` 中所有本地脚本和样式带有 `?v=N` 版本参数，修改 JS/CSS 后需要递增，以绕过 CDN 和浏览器缓存。云存档服务只应通过 nginx 访问，由 nginx 注入用户身份请求头和共享密钥，详见 `server/README.md`。

## 许可证

与原版相同，采用 [MPL-2.0](LICENSE.md)。

---

以下为原版英文说明（Upstream README）

A Dark Room
===========
> "awake. head throbbing. vision blurry. come light the fire."

a minimalist text adventure game for your browser

[Click to play](http://adarkroom.doublespeakgames.com)

<table>
<tr><th colspan=4>Available Languages</tr>
<tr>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=zh_cn">Chinese (Simplified)</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=zh_tw">Chinese (Traditional)</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=en">English</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=fr">French</a></td>
</tr><tr>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=de">German</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=el">Greek</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=id">Indonesian</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=it">Italian</a></td>
</tr><tr>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=ja">Japanese</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=ko">Korean</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=nb">Norwegian</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=pl">Polish</a></td>
</tr><tr>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=pt">Portuguese</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=pt_br">Portuguese (Brazil)</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=ru">Russian</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=es">Spanish</a></td>
</tr><tr>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=sv">Swedish</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=th">Thai</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=tr">Turkish</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=uk">Ukrainian</a></td>
</tr><tr>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=vi">Vietnamese</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=lt_LT">Lithuanian</a></td>
	<td><a href="http://adarkroom.doublespeakgames.com/?lang=gl">Galician</a></td>
</tr>
</table>

or play the latest on [GitHub](http://doublespeakgames.github.io/adarkroom)

<a href="https://itunes.apple.com/us/app/a-dark-room/id736683061"><img src="http://i.imgur.com/DMdnDYq.png" height="50"></a>
<a href="https://play.google.com/store/apps/details?id=com.yourcompany.adarkroom"><img src="http://i.imgur.com/bLWWj4r.png" height="50"></a>
<a href="https://store.steampowered.com/app/2460660/A_Dark_Room/"><img src="https://i.imgur.com/yz6cnU0.png" height="50"></a>
