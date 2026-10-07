# 泡姆街机厅网页合作版

这是一个保留核心操作、使用原创 Canvas 画面的网页改编版，包含：

- **泡噗 2**：拖动瞄准并发射同色泡泡，三个相连会消除，悬空泡泡会掉落。
- **泡噗 3**：在泡泡墙中加入石块障碍，利用反弹轨迹连续命中；连续失误会触发升压。
- **山山兔队长大作战：泡姆狂潮**：两人选择列，抓取同色堆再放回，组成三连并处理连锁；泡泡上涨到顶端会结束回合。

画布使用固定逻辑坐标并按 `devicePixelRatio` 缩放，页面在桌面、手机竖屏、手机横屏和平板上都能操作。桌面支持鼠标和键盘，触屏支持拖动瞄准、松手发射以及底部的大按钮。

## 本地运行

静态页面不需要构建：

```bash
npx serve .
```

浏览器打开终端显示的地址即可。也可以用任意静态服务器托管项目根目录。

## 局域网双人

Cloudflare Pages 只托管静态文件，房间码服务需要单独运行 Node 服务：

```bash
npm install
npm run lan
```

终端会打印电脑的局域网 IPv4 地址。手机和平板连接同一个 Wi‑Fi 后，打开该地址的 `8787` 端口；在“联机”弹窗中填写服务地址，房主点击“创建房间”，伙伴输入 6 位房间码加入。房主运行规则和计时，伙伴接收快照并发送操作，双方共用同一局。

如果页面部署在 Cloudflare Pages，可以在弹窗的“局域网服务地址”中填写可访问的 Node 服务地址。也可以使用“Cloudflare Pages 直连”标签，手工交换 WebRTC 的 offer/answer，不需要房间服务。

## Cloudflare Pages

创建 Pages 项目时使用本仓库：

- **Build command**：留空
- **Build output directory**：`/`（项目根目录）
- **Functions**：无需配置

`app.js`、`game-core.js`、`style.css` 和 `index.html` 会作为静态资源直接发布。Node 局域网服务不能由 Pages 进程托管，需要在局域网电脑或另一台可访问的 Node 主机上运行。

### GitHub Actions 自动部署

仓库内的 `.github/workflows/deploy-pages.yml` 会在 `main` 分支有新提交时运行 `npm ci`、`npm test`，测试通过后使用 Wrangler 自动部署到 Cloudflare Pages，也可以在 GitHub Actions 页面手动运行。

在 GitHub 仓库的 **Settings → Secrets and variables → Actions** 中配置：

- **Repository secret** `CLOUDFLARE_API_TOKEN`：Cloudflare API Token。Token 至少需要 Pages 编辑权限，并限制在目标账号内使用。
- **Repository variable** `CLOUDFLARE_ACCOUNT_ID`：Cloudflare 账号 ID。
- **Repository variable** `CLOUDFLARE_PAGES_PROJECT`：Pages 项目名称，必须先在 Cloudflare Pages 创建。

工作流通过 `${{ secrets.CLOUDFLARE_API_TOKEN }}` 和 `${{ vars.CLOUDFLARE_ACCOUNT_ID }}`、`${{ vars.CLOUDFLARE_PAGES_PROJECT }}` 读取这些配置，并在部署前检查是否为空。不要把 API Token 写进仓库文件或普通变量。

## 验证

```bash
npm test
npm run test:e2e
```

核心规则和局域网 API 使用 Node 测试；Playwright 使用本机 Chrome 检查桌面、iPhone 13 和 iPad 视口的无横向溢出、游戏入口、Canvas、移动控制和触控发射。
