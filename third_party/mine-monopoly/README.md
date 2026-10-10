# mine-monopoly（静态版）

上游：[FatPaper-1874/mine-monopoly](https://github.com/FatPaper-1874/mine-monopoly)，**GPL-3.0**（见同目录 `LICENSE`）。
`UPSTREAM` 记录了仓库地址和固定的提交；`static-mode.patch` 是在该提交上做的全部改动。本目录不含上游源码。

## 补丁做了什么

由 `VITE_STATIC_MODE=1` 开启，其余行为与上游一致：

- 免登录：没有身份时自动生成一个本机游客，跳过登录页。
- 只留「派对模式」（同一设备轮流玩，可加 AI）：去掉联机房间页签和登出按钮。
- 所有后端请求在发出前就失败，不会去连 localhost。
- 选地图直接弹出文件选择，只能导入本地 `.fpmap` / `.mmmap`（没有服务端地图列表）。
- 路由改用 Hash，Pages 上不需要回退规则；大厅左上角加了「← 街机厅」。
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
- 上游存档按「服务端地图 id」找回地图，静态版导入的地图读不回存档，每次开局要重新导入地图文件。
- 手机只能横屏玩（上游自带横屏引导）。
- 上游缺少 4 个提示音文件（`notification` / `success` / `error` / `info`），控制台会有 404，不影响玩。
