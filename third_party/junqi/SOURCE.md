# 军棋来源与改编

通过 GitHub 插件发现候选后，使用 `gh api` 核实固定提交和许可证。

- 使用项目：[samuelyuan/online-junqi](https://github.com/samuelyuan/online-junqi)
- 固定提交：`f5ba2e8cedaa7e1dc3975349d5bbe097f2d5e13a`
- 许可证：MIT，原文保留于本目录 `LICENSE`。
- 改编来源：[`src/lib/BoardConstants.ts`](https://github.com/samuelyuan/online-junqi/blob/f5ba2e8cedaa7e1dc3975349d5bbe097f2d5e13a/src/lib/BoardConstants.ts) 的行营、大本营、铁路位置；[`src/lib/Piece.ts`](https://github.com/samuelyuan/online-junqi/blob/f5ba2e8cedaa7e1dc3975349d5bbe097f2d5e13a/src/lib/Piece.ts) 的战斗优先级（炸弹、军旗、地雷/工兵、军衔），转为本项目 ES 模块数据和 `battleOutcome`。
- 本地位置：`junqi-core.js`。其余翻棋状态机、寻路、AI、DOM 界面、样式、测试为本次新写。
- 未引入原项目 Socket.IO、Express、jQuery、服务端、素材或依赖；没有连接其在线服务。

评估但未复用：[chengxg/junqi-client-vue](https://github.com/chengxg/junqi-client-vue)，固定提交 `fef6bd11403988cdf346e2bce2f36d954c451191`，GitHub 许可证接口显示 MIT。其 README 主要描述带组合棋子的“工兵扛军旗”变体，依赖 Vue、Socket.IO 与旧后端，未复制代码或素材。

本项目整合的是离线 **双人军棋翻棋版**，支持单人对基础电脑和同屏双人。使用 12×5 标准路径与完整 50 子；10 个行营起始为空，50 子在其余兵站随机盖放。首次翻棋确定阵营，不采用原项目的布阵/联机模式；军旗可随机出现于兵站，行营安全、大本营禁出、铁路直行与工兵转弯均在界面规则里说明。
