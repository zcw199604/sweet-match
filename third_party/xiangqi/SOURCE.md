# xiangqi.js

- Upstream: https://github.com/lengyanyu258/xiangqi.js
- Commit: `f9019ac2303d4b80ef0b82fd0515bfb55a80a62b`
- Retrieved: 2026-10-10
- License: BSD-2-Clause, preserved in `LICENSE` and the source header.
- Used by: `xiangqi-core.js` for move generation, legality, check, checkmate,
  stalemate, undo, and the upstream draw rules.
- Local compatibility patch: added `export { Xiangqi };` at the end of
  `xiangqi.js` so the vendored module works in native browser ESM and Node ESM.
  No external requests or package dependencies are needed at runtime.

The board, controls, and basic two-ply material AI are original project code.
The upstream treats threefold repetition and 120 plies without a capture as a
draw. It does not enforce tournament-specific perpetual-check/chase penalties.
