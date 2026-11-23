# 猫撫でシミュレーター（pet-the-cat.pages.dev）来源说明

- 原站：<https://pet-the-cat.pages.dev/>
- 作者：[@zubububu](https://x.com/zubububu)（游戏里的 `@zubububu` 链接是他本人的 X 账号，原样保留在画面下方）
- 取回时间：2026-11-24
- 存档：`pet-the-cat.pages.dev.html` —— 原站首页原封不动的一份，574 KB

## 这份存档是什么

原站是一个整页应用，而且整页被三层打包过，所以直接读 HTML 什么都看不到：

1. **编码层**：文件是 UTF-16LE，`<body>` 里只有一个
   `<script type="application/octet-stream" id="pack">`，内容是「每个字符装 14 bit → 拆成两个 7 bit 字节」的准 base64。
2. **引导层**：解出来是一段 3 KB 引导脚本，自带一个 LZMA range coder（11 位概率）+ 字典解压器，
   把 564929 字节摊成 148225 字节，再解出 `{ CSS+HTML 串 / JS 串 / 资源目录 JSON / 资源二进制 }`。
3. **资源层**：资源二进制里是 27 个 AVIF 精灵——房间背景、13 只猫的本体、13 条尾巴、两只手。
   每张只存了裁剪块，目录里的 `x, y, w, h, W, H` 说明这块要贴回多大的画布（猫本体是 1517×935，
   尾巴 684×200，手 1024×1536）。

`scripts/sync-petcat.mjs` 把这三层解开，并把原页面的逻辑改写成街机厅的模块形态
（`petcat/`，细节见仓库根目录 README 的「摸猫模拟器」一节）。要重新生成就跑 `npm run sync:petcat`。

## 复用范围

- **素材**（27 张 AVIF 精灵、原页面 CSS、DOM 结构、SVG 图标）：原样取自上面这份存档，没有重新绘制，
  也没有改动画面参数。生成物在 `petcat/assets/`、`petcat/style.css`、`petcat/room.js`。
- **逻辑**（约 125 KB）：原样保留，只做了「能装进街机厅舞台」的必要改写——
  资源从 `Blob` 换成文件 URL、DOM 查询走 Shadow DOM 门面、纯数学抽到 `petcat/petcat-core.js`、
  动画循环和监听能被卸载。改写清单逐条写在 `scripts/sync-petcat.mjs` 里，没有改玩法数值。
- **没有**做任何绕过或破解：原站没有登录、付费、广告或防拷逻辑，页面里能拿到的就是全部内容。

## 许可证

原站没有声明开源许可证，仓库里也不含作者提供的任何许可文本。这里把它当作「个人本机复刻」处理：
存档留作溯源，改编产物只在本地运行，页面上保留作者署名和原站链接。
如果作者希望撤下，删掉 `petcat/`、`third_party/petcat/` 和 `scripts/sync-petcat.mjs`
以及 `app.js`/`index.html` 里对应的登记即可，不牵连其他游戏。
