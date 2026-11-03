# Desktop-UI 本地开发交接（2026-11-02）

## 接手先看

- 用户要求：**暂时不要上传 GitHub**。没有进行本轮提交或推送。
- 源码：`D:\Apps\Seelen-UI-lite`；运行程序：`app\seelen-ui.exe`。
- 阅读根目录 `AGENTS.md`。保留现有未提交修改，不要 reset/clean；还有新增未跟踪文件。
- 当前 SHA256：`58E6D8ACE196C7D0356EB3C49F727856B679AC601B89B94BABA597A6FF1A59FE`。
- 当前进程已核实从 D 盘启动；计划任务 `\Seelen\Seelen UI Service` 管理服务。
- `LOCAL-LITE.md` 是早期记录，部分描述已过期（天气/硬件/波形等后来已加入），以当前源码和配置为准。

## 当前需求和验证边界

用户最近要求展开时不要从椭圆突然变成长方形，并放到屏幕最顶部。已部署：统一收起/展开的大圆角和内边距，去掉圆角过渡，仅宽度过渡 180ms；`app/my-desktop.json` 和源码默认 `topOffset=0`。编译成功，读取运行配置确认位置为 0；当时用户处于全屏状态，未打断全屏做最终视觉验收。

原子岛在全屏应用时会隐藏。当前 hover 展开关闭；可以点标题展开。播放音乐保持显示受设置控制，向上拖动手动隐藏。录屏避让是手动预设（topOffset=80，关闭 hover/顶部触发），**没有实现自动录屏检测**。用户最新要求最顶部优先，不能直接改回 80。

重点复测：

1. **文件拖入**：此前多轮仅前端修改未解决。现已实现原生 OLE 目标注册，真实 Windows Forms FileDrop 测试返回 Copy，收到 enter/over/drop，文件引用落到暂存列表；测试引用已移除。尚未收到用户对此版本从资源管理器拖入成功的确认，不能宣称所有场景已解决。
2. **歌词**：有长句滚动、渐进高亮，修复 stale session 进度重复重置和 CSS 变量继承问题；目前是按行时长插值，不是 QQ 原始逐字时间戳卡拉 OK。用户之前反馈卡顿/不生效，仍需按当前 QQ 播放实际观察。
3. **展开与录屏条**：点击会取消待执行 hover 定时器，面板 slide 160ms。不可见感应区常态缩至 4px，拖入时增大。顶部布局仍可能与 Windows 截图工具顶部录屏条重叠，用手动避让预设。
4. 天气/硬件读取、通知点击、蓝牙电量受系统和设备能力影响，不要仅凭编译成功当作真实验收。

## 关键文件

| 功能 | 路径 |
| --- | --- |
| 原子岛、歌词/显示定时器 | `src/ui/svelte/weg/components/QQLyrics.svelte` |
| 工具页、文件暂存、通知 | `src/ui/svelte/weg/components/IslandExtras.svelte` |
| 波形 | `src/ui/svelte/weg/components/WaveformPanel.svelte`、`src/ui/svelte/weg/flyWaveform.ts` |
| 主题 | `src/static/themes/default/styles/weg.scss` |
| 专用中文设置 | `src/ui/react/settings/LiteSettings.tsx` |
| 配置归一化/默认值 | `libs/desktop-lite/preferences.ts`、`src/static/lite-defaults.json` |
| 当前用户配置 | `app/my-desktop.json`（更新时保留） |
| 原生拖放 | `src/background/widgets/weg/native_drop.rs`、`src/background/widgets/webview.rs` |
| 拖放透明窗口/事件 | `libs/ui/react/utils/layered.ts`、`src/ui/svelte/weg/state/settings.svelte.ts`、`src/ui/svelte/weg/index.ts` |
| QQ 歌词后端 | `src/background/modules/media/lyrics.rs` |
| 应用菜单分类 | `src/ui/svelte/apps-menu/components/CategoriesView.svelte`、`FolderModal.svelte` |

原生拖放要同时 Revoke/Register 根 HWND 和所有子 HWND；只注册根窗口实际仍会失败。STA 使用 window.with_webview；原生 emit Tauri drag 事件；前端 retainDuringDrag 保留命中区域。已确认当时资源管理器与应用均未提权，问题不是 UAC。

配置/文件引用：`%APPDATA%\com.seelen.seelen-ui\data\seelen-weg\island-shelf.json`。这是引用列表，原文件留在原处；不要清理用户引用或文件。QQ 本地缓存曾使用 `D:\QQMusicCache\QQMusicLyricNew`。

日志：`%LOCALAPPDATA%\com.seelen.seelen-ui\logs\Seelen UI.log`，服务日志同目录。包含私人通知/文件路径，勿公开原文。

## Fly Island 参考

视频对应项目已从抖音正文确认：<https://github.com/flyl1u/fly-island>，参考快照 `5e06f7c`，MIT。详见 `documentation/fly-island-integration.md`，授权保留在 `vendor/fly-island/`。

已借鉴交互保护、玻璃/经典预设、样式记忆、通知列表和波形曲线。没有启动第二个岛或嵌入整个 React 应用。通知使用现有 Windows 通知，不是直接读取 QQ/微信聊天。上游没有找到可直接解决 QQ 同步歌词或文件暂存拖放的实现。

## 构建、部署

工具在 PATH 中不一定可见，PowerShell 使用：

```powershell
Set-Location 'D:\Apps\Seelen-UI-lite'
& 'C:\Program Files\nodejs\node.exe' node_modules/typescript/bin/tsc --noEmit --pretty false
& 'C:\Program Files\nodejs\node.exe' node_modules/svelte-check/bin/svelte-check --tsconfig ./tsconfig.json
& 'C:\Program Files\nodejs\node.exe' scripts/build.ts --production
& 'C:\Users\bin\.cargo\bin\cargo.exe' build -p seelen-ui --bins --features custom-protocol
```

禁止为了测试使用 release 构建；不需要二进制时用 cargo check。Rust nightly 版本见 rust-toolchain.toml。上次 TS/Svelte 检查 0 错误，最近 UI/native debug 构建通过；仅有已存在的 logger.rs 未使用 import 警告。

更新时先 Stop-ScheduledTask（Seelen UI Service），停止 seelen-ui 进程再覆盖，避免服务拉起导致文件锁。从 target/debug 复制匹配的 exe、SHA256SUMS 和 SHA256SUMS.sig 到 app，并同步静态资源到 app/static；不要覆盖 my-desktop.json。完整构建还需配套 slu-service.exe、slu.exe、sluhk.dll；当前这些已在 app 中。

正常启动用 Start-Process app/seelen-ui.exe -ArgumentList --silent -WindowStyle Hidden，再恢复计划任务。不要打开可见后台终端。

调试助手 `scripts/check-lite-runtime.cjs` 支持 CDP eval、--cdp 和 --screenshot。需临时设置 WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS='--remote-debugging-port=9225' 后启动应用；调试完移除变量并正常重启关闭端口。默认没有开启端口。

`scripts/check-native-drop.ps1` 是历史原生拖放复测脚本，会移动鼠标；硬编码物理坐标 (1280,165) 对应旧 topOffset=80/150% 缩放。**当前顶部为 0，必须根据实际窗口位置调整坐标再运行**。不要盲跑。测试后只移除测试文件引用。

## 本轮存储清理

已通过 `cargo clean` 删除 Rust target 构建产物，Cargo 报告删除 49,750 个文件、约 26.1 GiB。当前运行 app 的哈希、进程路径及 PID 清理前后保持一致。原生拖放测试助手已复制到 scripts。

自动审批拒绝了批量删除其他文件的操作，包括旧备份可执行文件及临时下载目录，因此没有执行这些删除。dist、历史备份、旧构建日志/截图、`D:\Apps\island-reference`、C 盘原版 zip/MSIX 仍保留。当前源码/.git、lockfiles、node_modules、vendor 授权和用户配置均保留。若后续清理，逐项核实用途和路径，避免误删配置或绕过审批。

清理不会减少运行内存；首次 native 编译会重新生成大体积缓存，耗时增加。不要为了交接验证再重建完整 target。清理统计见 `documentation/cleanup-2026-11-02.json`。
