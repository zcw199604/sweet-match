# 五款棋盘游戏的 GitHub 检索与风格参考

2026-10-10 使用 `gh search repos` 检索 `gomoku`、`aeroplane-chess`、`flying-chess`、`reversi`、`othello`、`international draughts`、`draughts`、`jungle-chess` 和 `dou shou qi`，再通过 `gh api` 检查仓库元数据、提交、README、文件树及相关界面文件。

新增游戏的规则、电脑策略、DOM/CSS 棋盘和大厅缩略图由本项目原创实现；以下项目是玩法、结构和布局参考，没有复制它们的代码、图片、字体或音频，也没有引入 npm 依赖或上游在线服务。

| 游戏 | 候选与固定提交 | 上游许可 | 核对内容与本项目风格 |
| --- | --- | --- | --- |
| 五子棋 | [yyjhao/HTML5-Gomoku](https://github.com/yyjhao/HTML5-Gomoku/tree/a664ec1e7788c7cbdfbe223fb86f34162f9e006d) | MIT（`license.txt`） | README、`style/style.css` 与图片目录；上游采用 JQuery Mobile、木纹棋盘及 Web Worker。本项目保留木色交叉线与黑白棋子，用 CSS 绘制，15×15 自由五子棋。 |
| 飞行棋 | [Cat-FE/Aeroplane-Chess](https://github.com/Cat-FE/Aeroplane-Chess/tree/bd5ac292f974e7b3374308d8bd844ec44e56ae2a) | MIT | README、`src/Game/styles/chessboard.scss` 与棋盘目录；采用熟悉的四色机场、十字航道布局，以糖果粉、薄荷、暖黄和蓝色呈现。 |
| 黑白棋 | [intel/webapps-annex](https://github.com/intel/webapps-annex/tree/764a6a6abfe41254200e62158d3ca6242602803d) | Apache-2.0；上游图片另为 CC-BY-3.0 | README、`app/css/annex.css` 与图片目录；上游为图片棋盘与旧 App Framework。本项目以薄荷绿格盘、立体黑白棋子、落点提示和双方子数呈现。 |
| 国际跳棋 | [shubhendusaurabh/draughts.js](https://github.com/shubhendusaurabh/draughts.js/tree/1572dc88e6a7ca371b82c8886b87227d42e6e30b) 与 [draughtsboardJS](https://github.com/shubhendusaurabh/draughtsboardJS/tree/a3e474e79a45e276006b811c65467e17222da97f) | MPL-2.0 | README 的 W31–50/B1–20 开局、规则与可换棋子主题的棋盘组件；本项目使用 10×10 奶紫棋盘、奶油/紫色圆片及王冠，原创实现最多吃子路线。 |
| 斗兽棋 | [josephburnett/dsq](https://github.com/josephburnett/dsq/tree/052b58cf772bcb7366e2de82b0e3ea2436e2800a) | MIT | README、`pkg/html/html.go` 的 7×9 布局与动物格渲染；本项目使用草地、蓝色河流、兽穴、陷阱和红蓝动物牌。动物图标使用系统 emoji，各平台外观可能不同。 |

另外核对了 `lihongxun945/gobang`、`huanghaibin91/Reversi` 和 `arnemileswinter/jungle-chess-web`：GitHub 未识别明确许可证，因此没有复用其代码或素材。`ZTMYO/MinimalistAeroplaneChess` 为 AGPL-3.0，没有引入其代码。搜索中的 Ludo 项目只作为相近品类候选，实际实现采用飞行棋跳格、飞跃与撞机规则。

## 本项目实现约定

- `gomoku-core.js`、`reversi-core.js`、`draughts-core.js`、`jungle-core.js`：可单独测试的纯规则，`applyMove` 返回新状态。四款视图共享 `board-games.js`，样式为 `board-games.css`。
- `aeroplane-core.js`、`aeroplane.js`、`aeroplane.css`：独立的骰子状态机、四色棋盘和计时器。
- 四款两人棋默认玩家先手对基础电脑，可改同屏双人并悔棋；飞行棋为玩家对三名基础电脑，或同屏四人。模式切换和返回大厅取消电脑计时器。
- 棋盘首次进入时由 `app.js` 懒加载；重开和离开不保存牌局。五款均计入最近常玩与活跃时长，不创建全球排名，也不参与局域网房间同步。
- 五子棋采用无禁手的自由规则；国际跳棋实现最多吃子、双向吃、飞王、整条连吃、回合结束升王、无路可走判负、三次重复和连续 25 回合仅王走动无吃子和棋，尚不包含比赛中的特殊残局限步判和。
- 飞行棋采用本项目明确列出的起飞、跳飞、反弹及连续三次六点变体，详见游戏内规则。电脑为休闲策略，不是专业棋力引擎。

验证入口：`npm test` 与 `npx playwright test test/e2e/board-games.spec.js test/e2e/classic-games.spec.js`。规则测试覆盖关键胜负与特殊走法；浏览器测试覆盖桌面、iPhone、iPad 的加载、棋盘适配、人机落子、双人、悔棋、重开、退出计时器与最近常玩。
