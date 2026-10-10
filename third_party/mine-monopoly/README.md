# mine-monopoly（静态版）

上游：[FatPaper-1874/mine-monopoly](https://github.com/FatPaper-1874/mine-monopoly)，**GPL-3.0**（见同目录 `LICENSE`）。
`UPSTREAM` 记录了仓库地址和固定的提交；`static-mode.patch` 是在该提交上做的全部改动。本目录不含上游源码。

## 补丁做了什么

由 `VITE_STATIC_MODE=1` 开启，其余行为与上游一致：

- 免登录：没有身份时自动生成一个本机游客，跳过登录页。
- 只留「派对模式」（同一设备轮流玩，可加 AI）：去掉联机房间页签和登出按钮。
- 所有后端请求在发出前就失败，不会去连 localhost。
- 选地图：先列出随站点发布的内置地图（`monopoly-maps/`，构建时放进 `maps/` 并生成 `maps/index.json`），也可以导入本地 `.fpmap` / `.mmmap`；没有内置地图时直接弹出文件选择。没有服务端地图列表。
- 路由改用 Hash，Pages 上不需要回退规则；大厅左上角加了「← 街机厅」。
- 存档：本地 IndexedDB 之外，按街机身份（同源 `localStorage` 的 `pao-pw`）同步到 `/api/monopoly-saves`（`src/core/save/CloudSyncSaveStorage.ts`，服务端见仓库根目录的 `monopoly-saves-core.js`）。保存、删除先落本地，云端走 localStorage 里的发件箱，失败下次重试；没登录或接口不可用时就是纯本地。
- Web 构建不再生成 `.gz` 副本和体积分析页。

## 构建

```
npm run build:monopoly
```

克隆固定提交 → 打补丁 → `vite build --mode web` → 产物放到 `./monopoly/`（已在 `.gitignore`，部署 workflow 里会现场构建）。
需要 Node 22+ 和能访问 GitHub / npm。

## 升级上游或修改补丁

1. 在上游检出里改代码，`git add -N` 新文件后 `git diff --binary > static-mode.patch`。
2. 更新 `UPSTREAM` 里的提交，重新 `npm run build:monopoly`，在桌面和手机横屏下各走一遍：进大厅 → 开启本地派对 → 选地图。

## 已知限制

- 没有联机对战，也没有榜单、最近常玩的统计。
- 云存档是「合并显示」：在另一台设备上删掉的存档，这台设备如果本地还留着一份，仍会显示（删除它即可）；云端独有的存档读出来用，不会缓存回本机。
- 存档里只记地图的 id 和版本，不含地图本身，所以读档前要先选好同一张地图（房间里也只会列出当前地图的存档）。内置地图的存、读已实测可用；上游「地图不匹配时去服务端取图」的分支在静态版走不通，但正常界面流程碰不到它。
- 手机只能横屏玩（上游自带横屏引导）。
- 上游缺少 4 个提示音文件（`notification` / `success` / `error` / `info`），控制台会有 404，不影响玩。
