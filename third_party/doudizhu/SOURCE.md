# Source

- Repository: https://github.com/linzhipeng/doudizhu
- Commit: 0d81437dda008c161072c787f768de8f402a85b5
- License: MIT
- Reused: `Card.getWeight`, insertion shuffle and round-robin dealing are adapted in `cards.js`, retaining upstream card IDs. The original `upstream-doudizhu.js` is preserved for review, with trailing whitespace normalized.
- Changes: named ES module exports, numeric card validation, injected RNG for deterministic tests. Rule validation, hint/AI move generation, state management and UI are original project code.
