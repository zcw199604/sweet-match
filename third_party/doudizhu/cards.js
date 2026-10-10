// Adapted from linzhipeng/doudizhu (MIT), commit 0d81437dda008c161072c787f768de8f402a85b5.
// Preserves the upstream card IDs and getWeight mapping; ES module + injected RNG.
export function weightOf(id) {
  if (!Number.isInteger(id) || id < 0 || id > 53) return null;
  if (id <= 7) return Math.ceil((id + 1) / 4) + 11;
  if (id <= 51) return Math.ceil((id + 1) / 4) - 2;
  return id === 52 ? 14 : 15;
}
export function shuffledDeal(rng = Math.random) {
  const deck = [0];
  for (let i = 1; i <= 53; i += 1) {
    const rnd = Math.min(i, Math.max(0, Math.floor(rng() * (i + 1))));
    deck[i] = deck[rnd]; deck[rnd] = i;
  }
  const hands = [[], [], []];
  deck.slice(0, 51).forEach((id, index) => hands[index % 3].push(id));
  return { hands, bottom: deck.slice(51) };
}
