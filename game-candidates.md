# 下一批游戏的 GitHub 检索（2026-10-30）

用 `gh` 把已经收录的品类和 GitHub 上的开源实现对照了一遍，看还缺什么、哪些能按本项目的做法（纯规则模块 + Canvas 视图 + 本机存档 + 关卡榜）接进来。结论先说：**泡泡龙、打砖块、华容道**是三款性价比最高的补位，**贪吃蛇**几乎白送，**国际象棋**是最该补的一块但工作量最大。

> 2026-10-30 更新：华容道、贪吃蛇、打砖块、泡泡龙四款已经按这份清单做完，编号 ARCADE 36–39，见 README 的「第三批小游戏」。国际象棋仍待排期。

## 检索方法

```bash
gh search repos "<品类>" --language javascript --sort stars --limit 5 \
  --json fullName,stargazersCount,license,updatedAt
gh api repos/<owner>/<repo> \
  --jq '"\(.license.spdx_id) \(.language) \(.size) \(.pushed_at)"'
gh api repos/<owner>/<repo>/contents/<path>   # 看目录、LICENSE、关卡数据
```

筛选条件：

- **许可证明确**（MIT / BSD / Apache / Unlicense），AGPL 和无许可证的一律不碰；
- **纯前端 JS**，不是 Unity / Godot / WebGPU 工程，规则或关卡数据能直接读；
- 玩法能落进 360×640 的竖屏 Canvas，单局 1～5 分钟；
- 和已有游戏不重复（已有 40 款，见下）。

## 现有覆盖与缺口

| 已有 | 覆盖的体验 |
| --- | --- |
| 泡噗 2 / 3、山山兔、方块爆破、三消勇者团、抓大鹅 | 接球、节奏、拼块、三消战斗、3D 抓物 |
| 挪车接客、倒水排序、箭头消除、拧螺丝、沙画、六角排序、羊了个羊、毛线三消 | 解谜 / 排序 / 分层消除 |
| 俄罗斯方块、2048、合成大西瓜 | 落块、数字滑动、物理合成 |
| 空中大厨、跑得快、斗地主、纸牌接龙 | 时间管理、牌局 |
| 数独、数织、扫雷、麻将连连看、推箱子 | 逻辑推理 |
| 象棋、围棋、五子棋、黑白棋、国际跳棋、中国跳棋、军棋、斗兽棋、飞行棋 | 棋类 |

**缺口**：街机厅最经典的三种反应类玩法一个都没有——**泡泡龙、打砖块、贪吃蛇（以及射击）**；棋类里独缺**国际象棋**；滑块类只有推箱子，没有**华容道**；纸牌只有 Klondike，没有**蜘蛛纸牌 / 麻将纸牌**。

## 候选

按「品类缺口 × 实现成本」排序。星数只作参考，主要看许可证和代码能不能读。

| # | 候选 | 参考仓库 | 许可 | ★ | 可复用的部分 | 工作量 |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | **泡泡龙** | [rembound/Bubble-Shooter-HTML5](https://github.com/rembound/Bubble-Shooter-HTML5) | MIT | 58 | 单文件 1062 行：六边形网格、圆与圆碰撞、同色洪泛消除、悬空球掉落、整排下移、结束判定 | 中 |
| 2 | **打砖块** | [jakesgordon/javascript-breakout](https://github.com/jakesgordon/javascript-breakout) | MIT¹ | 78 | `levels.js` 10 关砖块布局与四套配色；球/挡板/砖块的 AABB 碰撞与多段砖 | 低–中 |
| 3 | **华容道** | [jeantimex/klotski](https://github.com/jeantimex/klotski) | MIT | 51 | `hrd-games.json` 40 个经典布局（横刀立马、指挥若定……）；`klotski.js` 的 Zobrist 哈希 + BFS 求解器，可离线算出每关最少步数当 par | 低 |
| 4 | **贪吃蛇** | [epidemian/snake](https://github.com/epidemian/snake) | Unlicense | 1398 | 网格移动、穿墙、食物生成、逐步加速（12.7 KB 单文件） | 极低 |
| 5 | **国际象棋** | [jhlywa/chess.js](https://github.com/jhlywa/chess.js) + [lhartikk/simple-chess-ai](https://github.com/lhartikk/simple-chess-ai) | BSD-2 + Apache-2.0 | 4440 / 945 | chess.js 的走子生成、王车易位、吃过路兵、将军/将死/逼和/三次重复；simple-chess-ai 的 alpha-beta 与子力+位置评估 | 高 |
| 6 | **麻将纸牌** | [ffalt/mah](https://github.com/ffalt/mah) | MIT | 154 | `boards.json` 84 个分层布局（动物 / 建筑 / 形状 / 符号 / 植物），坐标格式紧凑，可转成自家的层叠数据 | 中 |
| 7 | **太空侵略者** | [victorqribeiro/invaderz](https://github.com/victorqribeiro/invaderz) | MIT | 711 | 单文件 Canvas：编队整体下移、子弹与命中、清屏过关；遗传算法那部分不用 | 低–中 |
| 8 | **蜘蛛纸牌** | [lklynet/spider-solitaire](https://github.com/lklynet/spider-solitaire) | MIT | 32 | `src/engine/deck.ts` 与 `moves.ts` 的纯规则（TS，可直接读），可复用现有接龙的牌面渲染 | 中 |
| 9 | **四子棋** | [caleb531/connect-four](https://github.com/caleb531/connect-four) | MIT | 32 | 四方向连线的胜负判定 | 极低 |

¹ 仓库的 license 字段显示 `NOASSERTION`，但 `LICENSE` 文件是标准 MIT 原文（Jake Gordon）。要复用代码的话，在 `third_party/` 里照 `SOURCE.md` + `LICENSE` 的流程记一笔。

### 为什么不选这些

| 仓库 | 原因 |
| --- | --- |
| thomasahle/numberlink（一笔画） | AGPL-3.0，传染性许可，和本项目「自带许可全文」的做法冲突 |
| channingallen/tower-defense、kubowania/breakout、SimonHung/Klotski | 没有许可证，不能复用代码或数据 |
| toji/spookyball | WebGPU + 自成一套渲染管线，接不进 `kit.js` |
| Mindustry、FXGLGames | Java / 体量完全不符 |
| itlwei/Chess | 名字是 chess，实际是**中国象棋**，项目里已有 |
| soundanalogous/Breakout | 是 Arduino 硬件库，只是撞名 |
| lhartikk/simple-chess-ai 的 UI | 只有一张 8×8 表格，没有需要参考的画面 |

## 建议

**先做（三款，正好三种完全不同的手感）**

1. **泡泡龙** — 街机厅的招牌品类，现在一款都没有。六边形网格 + 瞄准线 + 同色洪泛 + 悬空掉落，规则和画面都能沿用 `orb` / `candy` 画笔；关卡可以按「行数、颜色数、空洞率」程序生成，第 1 关 5 色 6 行，慢慢加。
2. **打砖块** — 和俄罗斯方块、泡泡龙凑齐「街机三件套」。砖块用字符矩阵描述（`levels.js` 就是这么做的），10 关之后按行数/硬度生成；挡板拖动 + 道具（加宽、多球、粘球）够玩很久。
3. **华容道** — 中文语境里认知度极高，40 个布局是现成的，求解器还能给每关算出最少步数，正好对上项目里「三星 = 不超过 par」的既有做法；交互和推箱子几乎一样，可以共用方向键、拖动、撤销的代码习惯。

**顺手加（便宜）**

4. **贪吃蛇** — 半天就能做完，做「无尽 + 障碍关 + 穿墙开关」三档，榜单记分数。它和 2048 一样属于「打开就能玩一局」的填充位。

**单独排期**

5. **国际象棋** — 棋类只差这一款，但它是这批里唯一需要认真做引擎的：规则（王车易位、吃过路兵、升变、将死/逼和/三次重复）加上电脑 AI。可行路径是把 chess.js 以 `third_party` 方式 vendor（BSD-2，和现在的象棋引擎同一套流程），AI 自己写 alpha-beta + 子力/位置表，三档难度用搜索深度和随机扰动区分。预计是前四款加起来的工作量。

**备选（看想不想扩）**

- **麻将纸牌** — 和「麻将连连看」不重复：这是分层消除，牌被压住就拿不到；84 个布局可以直接挑十几个。
- **四子棋** — 规则半天，正好挂到现有的联机回合制框架上（五子棋/黑白棋/国际跳棋/斗兽棋那套），做成一款**在线双人**小游戏。
- **蜘蛛纸牌** — 现有接龙的牌面、拖拽、撤销都能复用，主要工作是发牌和「同花色顺子整组移动」的规则。

## 接进来的样子

每款按现有约定拆成两层，不改公共部分：

```
<id>-core.js     纯规则，node --test 直接跑（不碰 DOM）
<id>.js          canvasGame({ width: 360, height: 640 }) + 绘制/交互
test/<id>.test.js         关卡可解性、关键判定、计分
test/e2e/new-games.spec.js  点击流程、结算提交、整屏布局
```

登记的地方：`app.js` 的 `MODE_META` / `SOLO_ONLY` / `buildKitStage` 分支，`index.html` 的大厅卡片，`leaderboard-core.js` 的 `BOARDS`（闯关类记最高关卡，计分类记分数），`README.md` 的游戏清单。存档用 `kit.js` 的 `store('pao-<id>')`，榜单用 `postScore`。

三款先做的都按「闯关 + 最高关卡榜」设计，和 ARCADE 23–35 那批一致；如果泡泡龙想加无尽模式，就再开一份 `bubble-endless` 榜，做法和泡噗 3 一样。
