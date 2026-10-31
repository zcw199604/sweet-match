# klotski

- Upstream: https://github.com/jeantimex/klotski
- Commit: `6e54380cd881e72da74e61df1dda07ebc0e695b0`
- Retrieved: 2026-10-30
- License: MIT, preserved in `LICENSE`.
- Used by: `klotski-levels.js` — the names, block shapes/positions and minimum
  move counts (par) of the 39 solvable classic 4×5 layouts.
- Not used: the upstream BFS/Dijkstra solver, UMD build and browser UI. The
  game logic, drag/snap input, drawing and undo in `klotski-core.js` /
  `klotski.js` are original project code.

Upstream counts a move the way its README describes: sliding the same block
continuously (in one or more cells, in any direction) counts as one move. The
local game counts one drag as one move, so par and the three-star threshold
use the same unit. The upstream 40th layout 走投无路 has no solution and is not
included; the remaining layouts are sorted from 22 to 138 moves for the level
curve.
