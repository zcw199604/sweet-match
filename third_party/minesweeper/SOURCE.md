# 扫雷来源

- GitHub: https://github.com/reed-jones/minesweeper_js
- 固定版本: `d4b923731b6cfb56f4adaf3e522569aaff194705`
- 许可证: MIT，原始全文见本目录 `LICENSE`。
- 实际复用: `main.js` 的 `exploreNearbyTiles` 邻域遍历，移植为 `minesweeper-core.js` 的 `neighbours`，把全局棋盘改成参数、回调改成返回索引数组。
- 本项目新增: 首点九格安全、无重复布雷、迭代空白扩展、快开、终态处理、三档手机棋盘、原创 DOM/CSS 界面。没有引入原项目的 jQuery、PHP 排行榜、图片和字体。
