// 三消勇者团 sprites: original SVG figures for the four heroes and the nine monsters.
//
// The same language as art.js: chibi proportions (about 2.5 heads tall), one chunky
// ink outline so every shape reads at phone size, flat colour with a single shadow
// tone on the side away from the light (top left) and a white highlight. Heroes face
// right, monsters face left, feet on the bottom edge of the view box.
//
// A few parts carry class names so CSS and quest.js can move them on their own:
//   qa-arm   the weapon arm (its pivot is set inline as transform-origin)
//   qa-blink eyes · qa-cape scarves, plumes · qa-wing wings (.r = the far wing)
//   qa-glow  orbs, flames, glowing eyes · qa-tip where a spell leaves from
//
// The markup is static and authored here; it is parsed once with DOMParser and cloned,
// so no runtime text ever reaches it.
const INK = '#2a2340';
const SKIN = '#ffd9bf';
const SKIN_SHADE = '#f2b99a';
const GOLD = '#ffcf4a';

// An outlined limb: a fat ink stroke with the colour stroked over it.
const limb = (d, color, width = 5) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${width + 3.6}"/><path d="${d}" fill="none" stroke="${color}" stroke-width="${width}"/>`;
const svg = (box, body, defs = '') => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box}" class="qa">${defs ? `<defs>${defs}</defs>` : ''}<g stroke="${INK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round">${body}</g></svg>`;
// Eyes: two inked ovals with a catch-light, grouped so they can blink together.
const eyes = (a, b, rx = 2.6, ry = 3.6, color = INK) => `<g class="qa-blink"><ellipse cx="${a[0]}" cy="${a[1]}" rx="${rx}" ry="${ry}" fill="${color}" stroke="none"/><ellipse cx="${b[0]}" cy="${b[1]}" rx="${rx}" ry="${ry}" fill="${color}" stroke="none"/><circle cx="${a[0] + rx * 0.35}" cy="${a[1] - ry * 0.4}" r="${rx * 0.4}" fill="#fff" stroke="none"/><circle cx="${b[0] + rx * 0.35}" cy="${b[1] - ry * 0.4}" r="${rx * 0.4}" fill="#fff" stroke="none"/></g>`;
const blush = (x, y, rx = 3, ry = 1.8) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#ff8aa3" opacity=".55" stroke="none"/>`;
const star = (x, y, r, color = '#ffe58a') => {
  const points = Array.from({ length: 10 }, (_, k) => {
    const angle = (Math.PI / 5) * k - Math.PI / 2, reach = k % 2 ? r * 0.45 : r;
    return `${(x + Math.cos(angle) * reach).toFixed(1)},${(y + Math.sin(angle) * reach).toFixed(1)}`;
  });
  return `<polygon points="${points.join(' ')}" fill="${color}" stroke="none"/>`;
};

// ---- heroes (view box 100 × 120) ----

// 战士: steel half-helm with a red plume, red tunic over a breastplate, scarf streaming back, broadsword up.
const WARRIOR = svg('0 0 100 120', `
  <path class="qa-cape" d="M42 63 C32 61 22 66 10 60 C15 68 21 72 13 79 C25 79 34 75 43 71 Z" fill="#e8476b"/>
  <path stroke="none" fill="#b02a4c" d="M38 66 C30 68 22 70 17 70 C22 73 20 76 16 78 C26 77 33 74 40 70 Z"/>
  ${limb('M38 70 Q31 79 33 88', '#8e9bb0')}
  <circle cx="33" cy="89" r="4.2" fill="${SKIN}"/>
  <path d="M39 97 V110 Q39 115 44 115 H51 Q53 115 53 112 V97 Z" fill="#6e4628"/>
  <path d="M54 97 V110 Q54 115 59 115 H67 Q70 115 69 111 L67 106 V97 Z" fill="#8a5a3a"/>
  <path d="M39 104 H53 M54 104 H67" fill="none" stroke-width="1.6"/>
  <path d="M36 64 Q34 82 31 100 Q50 105 69 100 Q66 82 64 64 Q50 60 36 64 Z" fill="#e8476b"/>
  <path stroke="none" fill="#b02a4c" d="M37.5 66 Q35.5 82 33.2 98.6 Q38 100.6 43 101 Q41 84 42.5 66 Z"/>
  <path d="M33 96 Q50 101 67 96" fill="none" stroke="${GOLD}" stroke-width="2.4"/>
  <path d="M41 68 Q50 72 59 68 L58.5 80 Q50 84 41.5 80 Z" fill="#c9d3e0"/>
  <path stroke="none" fill="#fff" opacity=".7" d="M44 70.5 Q46 71.4 48 71.6 L47.6 77 Q45.6 76.8 44.2 76 Z"/>
  <path d="M34 84 Q50 88 66 84 L66.6 90 Q50 94 33.4 90 Z" fill="#7a4a2a"/>
  <rect x="46" y="85.4" width="8" height="7" rx="1.6" fill="${GOLD}"/>
  <path d="M35 62 Q50 71 65 62 Q63 56.5 50 57.5 Q37 56.5 35 62 Z" fill="#e8476b"/>
  <path d="M42 62.5 Q50 66 58 62.5" fill="none" stroke="#b02a4c" stroke-width="1.6"/>
  <ellipse cx="33" cy="45" rx="4" ry="5" fill="${SKIN}"/>
  <circle cx="51" cy="42" r="20" fill="${SKIN}"/>
  <path stroke="none" fill="${SKIN_SHADE}" d="M33.6 47 Q37 59.6 50 61.6 Q40.6 56 38.6 45 Z"/>
  <path d="M34 37 Q44 31 70 34.5 L70.6 41 Q66.6 37.6 64.4 42 Q60.4 37 56.4 41.6 Q52.4 37 48.6 41 Q42.6 37 36.4 43 Z" fill="#7a4a2a"/>
  <path class="qa-cape" d="M47 19 Q43 5 29 4 Q35 8.4 33.4 14 Q25.4 12 21 18.6 Q31 18.4 38 23 Z" fill="#e8476b"/>
  <path d="M29 40.6 Q28 18 50 17 Q72 17 72.4 36 L74.4 38.4 Q50 34 27.6 42.6 Z" fill="#c9d3e0"/>
  <path stroke="none" fill="#8e9bb0" d="M31 39 Q31 22.4 44 19.4 Q36.4 26 37.4 37.4 Z"/>
  <path d="M57 21 Q66.4 23 68.6 30" fill="none" stroke="#fff" stroke-width="2.2" opacity=".85"/>
  <circle cx="40" cy="35.4" r="1.2" fill="#8e9bb0" stroke="none"/><circle cx="52" cy="33.6" r="1.2" fill="#8e9bb0" stroke="none"/><circle cx="64" cy="34" r="1.2" fill="#8e9bb0" stroke="none"/>
  ${eyes([58, 47], [68, 47])}
  <path d="M54 40 L61 42 M65 42 L71.4 39.4" fill="none" stroke-width="2.2"/>
  <path d="M60 54.6 Q64 57 68 53.6" fill="none" stroke-width="1.8"/>
  ${blush(70.6, 51.4)}
  <g class="qa-arm" style="transform-origin:60px 68px">
    <g transform="rotate(18 76 80)">
      <path d="M73 76 L73 38 L76 31 L79 38 L79 76 Z" fill="#eef2f8"/>
      <path stroke="none" fill="#b9c3d3" d="M76.4 37 L78.6 38.6 L78.6 75.6 L76.4 75.6 Z"/>
      <path d="M76 39 V73" fill="none" stroke="#9aa6b8" stroke-width="1.2"/>
      ${limb('M68.4 76.4 H83.6', GOLD, 2.6)}
      ${limb('M76 78 V86', '#7a4a2a', 2.6)}
      <circle cx="76" cy="88.4" r="2.6" fill="${GOLD}"/>
    </g>
    ${limb('M60 68 Q68 74 73.6 79.6', '#c9d3e0')}
    <circle cx="75" cy="81" r="4.8" fill="${SKIN}"/>
  </g>`);

// 法师: tall floppy hat with a gold band and a star, lilac hair, robe trimmed in gold, crystal-orb staff.
const MAGE = svg('0 0 100 120', `
  <path d="M31 44 Q25 64 34 73 L45 61 Z" fill="#d9d2ff"/>
  <ellipse cx="44" cy="115" rx="6.4" ry="3.2" fill="#3b2a8f"/>
  <ellipse cx="60" cy="115" rx="7.4" ry="3.2" fill="#3b2a8f"/>
  <path d="M38 62 Q30 90 25 113 Q50 118 75 113 Q70 90 62 62 Q50 58 38 62 Z" fill="#8e7bff"/>
  <path stroke="none" fill="#6a55e0" d="M38.6 64 Q31.4 90 27 111 Q33 113 38.4 113.4 Q38 88 44 64 Z"/>
  <path d="M52 66 Q54 90 56 115" fill="none" stroke="${GOLD}" stroke-width="2.6"/>
  <path d="M26.6 110.4 Q50 116.4 73.6 110.4" fill="none" stroke="${GOLD}" stroke-width="2.6"/>
  ${star(40, 98, 3.4)}${star(66, 92, 2.6)}${star(46, 84, 2)}
  <path d="M34 80 Q50 85 66 80 L66.8 85.4 Q50 90.4 33.2 85.4 Z" fill="#5440c9"/>
  <circle cx="51" cy="86" r="2.6" fill="${GOLD}"/>
  <path d="M37 61 Q50 70 63 61 L61 57 Q50 63 39 57 Z" fill="#5440c9"/>
  <circle cx="51" cy="45" r="19" fill="${SKIN}"/>
  <path stroke="none" fill="${SKIN_SHADE}" d="M34 49 Q37.4 60 50 63 Q40 57 38.4 47 Z"/>
  <path d="M32 45 Q32 31 46 29 L70 32.4 Q72.4 40 70.6 45 Q66.4 39 62.4 43 Q58.4 37 54.4 42 Q48.4 36 42.4 43 Q38.4 39 34.6 49 Z" fill="#e6e0ff"/>
  <path d="M41 37 Q46 35 50 37" fill="none" stroke="#b9afe8" stroke-width="1.4"/>
  <ellipse cx="50" cy="31.4" rx="27" ry="6.6" fill="#5440c9"/>
  <path d="M30 30.4 Q34 14 28 3 Q44 5 56 14 Q64 22 68.4 30.4 Q50 34.4 30 30.4 Z" fill="#8e7bff"/>
  <path stroke="none" fill="#6a55e0" d="M32.4 29 Q36.4 16 31.4 6.4 Q38.4 14 40.4 30 Z"/>
  <path d="M31.6 25 Q50 29 66.2 25 L67.6 29.6 Q50 33.6 30.6 29.6 Z" fill="${GOLD}"/>
  ${star(48, 16, 4.4)}
  <path d="M56 14.6 Q62 18 64.6 23" fill="none" stroke="#c8bdff" stroke-width="1.8"/>
  ${eyes([58.4, 48], [67.4, 48], 2.8, 3.8)}
  <path d="M54.6 41.4 Q57.6 40 60.6 41.4 M64.4 41.4 Q67.4 40 70 41.6" fill="none" stroke-width="1.6"/>
  <path d="M60.4 55.4 Q63.4 57.6 66.4 55.4" fill="none" stroke-width="1.8"/>
  ${blush(70, 52.6)}
  <g class="qa-arm" style="transform-origin:58px 68px">
    ${limb('M76 36 V114', '#8a5a3a', 3)}
    <path d="M69.4 30 Q69.4 38.4 76 38.4 Q82.6 38.4 82.6 30" fill="none" stroke="${INK}" stroke-width="5"/>
    <path d="M69.4 30 Q69.4 38.4 76 38.4 Q82.6 38.4 82.6 30" fill="none" stroke="${GOLD}" stroke-width="2.4"/>
    <circle class="qa-glow" cx="76" cy="26.6" r="11" fill="url(#qa-mage-halo)" stroke="none"/>
    <circle class="qa-tip" cx="76" cy="26.6" r="7" fill="url(#qa-mage-orb)"/>
    <circle cx="73.6" cy="24" r="2" fill="#fff" stroke="none"/>
    <path d="M55 63 Q66 65 73 73 L70.6 82 Q62 80.4 55.6 74 Z" fill="#8e7bff"/>
    <path d="M71 80 L73 72" fill="none" stroke="${GOLD}" stroke-width="2"/>
    <circle cx="74.4" cy="76.6" r="4.6" fill="${SKIN}"/>
  </g>`,
  `<radialGradient id="qa-mage-orb" cx=".4" cy=".35"><stop offset="0" stop-color="#fff"/><stop offset=".45" stop-color="#d6ceff"/><stop offset="1" stop-color="#7a63f0"/></radialGradient>
   <radialGradient id="qa-mage-halo"><stop offset=".4" stop-color="#b3a6ff" stop-opacity=".8"/><stop offset="1" stop-color="#b3a6ff" stop-opacity="0"/></radialGradient>`);

// 盾卫: open-faced steel helm with a gold crest and nose guard, gold plate, round pauldrons, big kite shield.
const GUARDIAN = svg('0 0 100 120', `
  <path d="M37 98 V111 Q37 116 42 116 H50 V98 Z" fill="#7d8aa3"/>
  <path d="M53 98 V111 Q53 116 58 116 H67 Q69.6 116 68.6 112 L67 108 V98 Z" fill="#9aa6bc"/>
  <path d="M53 106 H67" fill="none" stroke-width="1.6"/>
  <circle cx="34" cy="68" r="9" fill="#9aa6bc"/>
  <path d="M34 64 Q32 84 34 100 Q50 105 66 100 Q68 84 66 64 Q50 59 34 64 Z" fill="#ffd543"/>
  <path stroke="none" fill="#c49a0a" d="M35.4 66 Q33.4 84 35.6 98.4 Q39 100 42.4 100.4 Q40.4 84 41.4 65 Z"/>
  <path d="M36 80 Q50 84.6 64 80" fill="none" stroke-width="1.8"/>
  <path d="M44 68 Q46 72 45 77" fill="none" stroke="#fff" stroke-width="2" opacity=".7"/>
  <path d="M33.6 92 Q50 98 66.4 92 L68.4 102.4 Q50 108.4 31.6 102.4 Z" fill="#9aa6bc"/>
  <path d="M42 96 L41 105 M50 97.6 V107 M58 96.6 L59 105.6" fill="none" stroke-width="1.4"/>
  <path class="qa-cape" d="M40 18.6 Q48 4 63 12 Q56 14.6 52 22 Q46.4 18 40 18.6 Z" fill="#ffd543"/>
  <path d="M28 46 Q26 18 50 17 Q74 18 73 44 Q73 60 62 63 L40 63 Q28 60 28 46 Z" fill="#b8c4d6"/>
  <path stroke="none" fill="#7d8aa3" d="M30.4 46 Q29 24 42 19.6 Q34.4 30 36 50 Q36.6 58 40.4 61 Q30.6 57.6 30.4 46 Z"/>
  <path d="M60 21 Q68.6 24 70.6 32" fill="none" stroke="#fff" stroke-width="2.2" opacity=".85"/>
  <path d="M48 35 H70 Q72.4 35 72.4 38.6 V54 Q72.4 58.4 68 58.4 H50 Q45.6 58.4 45.6 54 V38.6 Q45.6 35 48 35 Z" fill="${SKIN}"/>
  <path stroke="none" fill="${SKIN_SHADE}" d="M46.6 50 Q48 57 54 57.6 H48.6 Q46.6 56 46.6 50 Z"/>
  ${eyes([55.4, 46], [66.4, 46], 2.4, 3.4)}
  <path d="M51.6 40.4 L57.6 42 M63.6 42 L69.6 40.2" fill="none" stroke-width="2"/>
  ${limb('M61 33 V48.6', '#b8c4d6', 2.6)}
  <path d="M56.6 53.4 H65" fill="none" stroke-width="1.8"/>
  <circle cx="31.6" cy="45" r="1.3" fill="#7d8aa3" stroke="none"/><circle cx="32.6" cy="53" r="1.3" fill="#7d8aa3" stroke="none"/>
  <circle cx="66" cy="68" r="9.6" fill="#b8c4d6"/>
  <path d="M61 64 Q64 61.6 68 62.6" fill="none" stroke="#fff" stroke-width="2" opacity=".85"/>
  <g class="qa-arm" style="transform-origin:62px 72px">
    ${limb('M64 72 Q70 78 72 84', '#9aa6bc')}
    <path d="M60 58 H92 Q93.4 58 93.4 60 V80 Q93.4 98 76.6 108.4 Q59.6 98 59.6 80 V60 Q59.6 58 60 58 Z" fill="#c49a0a"/>
    <path stroke="none" fill="#fff4c7" d="M63.6 62 H89.4 V80 Q89.4 95 76.6 103.4 Q63.6 95 63.6 80 Z"/>
    <path stroke="none" fill="#ffe9a3" d="M76.6 62 H89.4 V80 Q89.4 95 76.6 103.4 Z"/>
    ${limb('M76.6 67.4 V94.6', '#e0b300', 4.4)}
    ${limb('M66.6 79 H86.6', '#e0b300', 4.4)}
    <circle cx="62.4" cy="61" r="1.2" fill="#fff4c7" stroke="none"/><circle cx="90.6" cy="61" r="1.2" fill="#fff4c7" stroke="none"/>
    <path d="M66 64.4 Q66 76 68 84" fill="none" stroke="#fff" stroke-width="2.2" opacity=".9"/>
  </g>`);

// 牧师: white hood lined in green, blonde braid, white robe with a green stole and a gold cross, ring-and-cross staff.
const PRIEST = svg('0 0 100 120', `
  ${limb('M33 50 Q24 70 30 90', '#ffd98a', 4.6)}
  <circle cx="30.4" cy="91" r="3" fill="#44c986"/>
  <ellipse cx="44" cy="115.4" rx="6.4" ry="3" fill="#8a5a3a"/>
  <ellipse cx="60" cy="115.4" rx="7" ry="3" fill="#8a5a3a"/>
  <path d="M37 62 Q30 90 26 114 Q50 119 74 114 Q70 90 63 62 Q50 58 37 62 Z" fill="#fdfbf3"/>
  <path stroke="none" fill="#e3ddcc" d="M37.6 64 Q31.6 90 28 112 Q33.6 114 38.6 114.4 Q38.4 88 43 64 Z"/>
  ${limb('M44 63 Q43 86 41.4 112', '#44c986', 4)}
  ${limb('M57.6 63 Q59 86 60.6 112', '#44c986', 4)}
  ${limb('M60.4 96 V106.4 M55.8 100.6 H65', GOLD, 2.2)}
  <path d="M34.4 84 Q50 89.4 65.6 84" fill="none" stroke="${INK}" stroke-width="4.6"/>
  <path d="M34.4 84 Q50 89.4 65.6 84" fill="none" stroke="${GOLD}" stroke-width="2.2"/>
  <path d="M47 88 Q46 94 48 98" fill="none" stroke="${GOLD}" stroke-width="2"/>
  <path d="M28 50 Q24 20 50 18 Q76 20 74 46 Q74 60 66 64 L36 64 Q28 60 28 50 Z" fill="#fdfbf3"/>
  <path stroke="none" fill="#e3ddcc" d="M30.4 50 Q28 26 42 21 Q34 32 35.6 52 Q36 59.4 39.4 63 L36.4 63 Q30.6 59 30.4 50 Z"/>
  <circle cx="52" cy="46" r="17.6" fill="${SKIN}"/>
  <path stroke="none" fill="${SKIN_SHADE}" d="M36.4 50 Q39.6 60 51 62.6 Q42 57 40.6 48 Z"/>
  <path d="M35.6 45 Q37.6 30 52 30 Q66.4 30 68.4 42.6 Q63.4 37 58.4 40.4 Q54.4 35 49.4 40 Q43.4 36 38.4 47 Z" fill="#ffd98a"/>
  <path d="M43.4 34.6 Q47.4 33 51.4 34" fill="none" stroke="#e8b85a" stroke-width="1.4"/>
  <path d="M33 53 Q29.6 26 52 24 Q74.4 26 71.4 50" fill="none" stroke="${INK}" stroke-width="7.4"/>
  <path d="M33 53 Q29.6 26 52 24 Q74.4 26 71.4 50" fill="none" stroke="#44c986" stroke-width="3.6"/>
  <path d="M55 48.6 Q58 45.4 61 48.6 M64.6 48.6 Q67.6 45.4 70.6 48.6" fill="none" stroke-width="2"/>
  <path d="M59.6 54.4 Q63 57.4 66.4 54.4" fill="none" stroke-width="1.8"/>
  ${blush(69.6, 52.6)}${blush(53, 53, 2.6, 1.6)}
  <g class="qa-arm" style="transform-origin:58px 68px">
    ${limb('M78.4 32 V114', '#e0b45a', 3)}
    <circle cx="78.4" cy="23.6" r="8.4" fill="none" stroke="${INK}" stroke-width="5.2"/>
    <circle cx="78.4" cy="23.6" r="8.4" fill="none" stroke="${GOLD}" stroke-width="2.6"/>
    ${limb('M78.4 16.6 V30.6 M71.4 23.6 H85.4', GOLD, 2.2)}
    <circle class="qa-glow" cx="78.4" cy="23.6" r="9" fill="url(#qa-priest-halo)" stroke="none"/>
    <circle class="qa-tip" cx="78.4" cy="23.6" r="3.2" fill="#6ff0ab"/>
    <path d="M55 63 Q66 65 73.6 73.4 L71 82 Q62 80.4 55.6 74 Z" fill="#fdfbf3"/>
    <path d="M71.6 81 L73.6 73" fill="none" stroke="#44c986" stroke-width="2"/>
    <circle cx="76.6" cy="77" r="4.6" fill="${SKIN}"/>
  </g>`,
  '<radialGradient id="qa-priest-halo"><stop offset=".3" stop-color="#a8f0cc" stop-opacity=".9"/><stop offset="1" stop-color="#a8f0cc" stop-opacity="0"/></radialGradient>');

// ---- monsters (view box 120 × 120, facing left) ----

// 史莱姆: a glossy jelly with bubbles inside, a curl on top, big eyes and an open grin.
const SLIME = svg('0 0 120 120', `
  <path d="M58 48 Q60 33 71 36 Q65 40 68 50" fill="#7ee26d" stroke="#1f6e2c"/>
  <path d="M14 110 Q10 76 36 58 Q56 42 80 54 Q108 70 106 110 Q90 116 60 116 Q30 116 14 110 Z" fill="url(#qa-slime-body)" stroke="#1f6e2c" stroke-width="2.6"/>
  <path stroke="none" fill="#2a8a38" opacity=".35" d="M90 66 Q106 78 104 108 Q96 112 86 113 Q98 94 90 66 Z"/>
  <circle cx="84" cy="92" r="4.2" fill="#fff" opacity=".35" stroke="none"/><circle cx="93" cy="80" r="2.6" fill="#fff" opacity=".35" stroke="none"/><circle cx="76" cy="103" r="2.2" fill="#fff" opacity=".35" stroke="none"/><circle cx="26" cy="100" r="2.2" fill="#fff" opacity=".3" stroke="none"/>
  <ellipse cx="42" cy="68" rx="11" ry="6" transform="rotate(-32 42 68)" fill="#fff" opacity=".8" stroke="none"/>
  <circle cx="55" cy="58" r="2.4" fill="#fff" opacity=".8" stroke="none"/>
  ${eyes([42, 84], [60, 84], 4.4, 5.8, '#173a1c')}
  <path d="M44 95 Q51 103 59 95 Q51 99 44 95 Z" fill="#1f4a22" stroke="#173a1c" stroke-width="1.6"/>
  <path stroke="none" fill="#ff8aa3" d="M48.6 98.6 Q51 101 53.6 98.8 Q51 99.6 48.6 98.6 Z"/>
  ${blush(33, 92, 3.6, 2)}${blush(69, 92, 3.6, 2)}`,
  '<radialGradient id="qa-slime-body" cx=".4" cy=".3" r=".75"><stop offset="0" stop-color="#d6ffc4"/><stop offset=".45" stop-color="#7ee26d"/><stop offset=".85" stop-color="#3fb24a"/><stop offset="1" stop-color="#2a8a38"/></radialGradient>');

// 洞穴蝠: a round purple bat with scalloped wings, pointed ears, red eyes and two fangs.
const BAT = svg('0 0 120 120', `
  <g class="qa-wing r" style="transform-origin:70px 58px">
    <path d="M70 56 Q86 34 113 36 Q106 45 108 54 Q100 52 96 61 Q90 56 86 67 Q80 60 70 67 Z" fill="#543b85"/>
    <path d="M72 59 L109 39 M74 61 L96 59 M74 63 L86 65" fill="none" stroke="#2f2056" stroke-width="1.6"/>
  </g>
  <path d="M51 51 L45 32 L58 44 Z" fill="#6b4fa0"/><path stroke="none" fill="#d99ac4" d="M50 47 L47.6 38 L54 44 Z"/>
  <path d="M69 51 L75 32 L62 44 Z" fill="#6b4fa0"/>
  <ellipse cx="60" cy="61" rx="15.6" ry="14.4" fill="#6b4fa0"/>
  <path stroke="none" fill="#543b85" d="M66 49 Q76 56 74 66 Q70 74 62 75.4 Q72 66 66 49 Z"/>
  <ellipse cx="57" cy="66" rx="8" ry="7" fill="#9b80cf" stroke="none"/>
  <path d="M52 52.6 Q56 51.6 59 53.6" fill="none" stroke="#9b80cf" stroke-width="1.6"/>
  <g class="qa-blink"><ellipse cx="52.4" cy="58" rx="3.6" ry="4.2" fill="#ff4d6d" stroke="none"/><ellipse cx="64" cy="58" rx="3.4" ry="4.2" fill="#ff4d6d" stroke="none"/><ellipse cx="51.2" cy="58.4" rx="1.4" ry="2.6" fill="${INK}" stroke="none"/><ellipse cx="62.8" cy="58.4" rx="1.4" ry="2.6" fill="${INK}" stroke="none"/><circle cx="53.6" cy="56.4" r="1" fill="#fff" stroke="none"/><circle cx="65.2" cy="56.4" r="1" fill="#fff" stroke="none"/></g>
  <path d="M50 66 Q57 69.4 66 66" fill="none" stroke-width="1.8"/>
  <path d="M52.6 67.2 L54.4 72 L56.2 67.8 Z M60.2 67.8 L62 72 L63.8 67.2 Z" fill="#fff" stroke-width="1.4"/>
  <path d="M55 74.4 L54 79.6 M58 75 L58 80 M64 74.4 L65.4 79.6" fill="none" stroke-width="2"/>
  <g class="qa-wing" style="transform-origin:50px 58px">
    <path d="M50 56 Q34 34 7 36 Q14 45 12 54 Q20 52 24 61 Q30 56 34 67 Q40 60 50 67 Z" fill="#6b4fa0"/>
    <path d="M48 59 L11 39 M46 61 L24 59 M46 63 L34 65" fill="none" stroke="#432f70" stroke-width="1.6"/>
    <path stroke="none" fill="#8a6fc0" d="M44 52 Q30 40 15 39 Q30 43 42 56 Z"/>
  </g>`);

// 哥布林: long ears, hooked nose, yellow slit eyes, jagged grin, leather vest, a rusty dagger.
const GOBLIN = svg('0 0 120 120', `
  ${limb('M73 72 Q80 80 82 88', '#7dbb4a', 5.4)}
  <circle cx="82.6" cy="90" r="4.6" fill="#8fcf5a"/>
  ${limb('M53 97 V109', '#7dbb4a', 5.4)}${limb('M67 97 V109', '#5e9a35', 5.4)}
  <path d="M44 114 Q44 108 52 108 H57 V114 Z M60 114 Q60 108 66 108 H71 V114 Z" fill="#6e4628"/>
  <path d="M46 66 Q42 84 46 100 Q60 104 74 100 Q78 84 72 66 Q60 62 46 66 Z" fill="#8fcf5a"/>
  <path stroke="none" fill="#5e9a35" d="M66 66 Q74 70 75.6 84 Q75.4 94 73 99.6 Q70 100.6 67 101 Q72 84 66 66 Z"/>
  <path d="M46 67 Q43 84 46 99 Q51 101 56 101 L57 68 Q51 66 46 67 Z" fill="#8a5a3a"/>
  <path d="M72 67 Q76 84 74 99 Q69 101 64 101 L63 68 Q68 66 72 67 Z" fill="#6e4628"/>
  <path d="M49 74 L53 75 M48.6 84 L53 85" fill="none" stroke="#c99a6a" stroke-width="1.6"/>
  <path d="M46 94 Q60 98 74 94 L72 104 L64 101 L60 107 L56 101 L48 104 Z" fill="#a37a4a"/>
  <path d="M46 93.6 Q60 98 74 93.6" fill="none" stroke="#5a3a20" stroke-width="2.6"/>
  <path d="M43 43 L12 33 Q21 49 43 55 Z" fill="#8fcf5a"/>
  <path stroke="none" fill="#d99aa0" d="M39.6 45.6 L21 37.6 Q27.6 46 39.6 51 Z"/>
  <path d="M77 43 L106 30 Q98 48 77 55 Z" fill="#7dbb4a"/>
  <ellipse cx="60" cy="46" rx="20.4" ry="18.4" fill="#8fcf5a"/>
  <path stroke="none" fill="#7dbb4a" d="M68 30 Q81 38 79.6 50 Q78 60 68 64 Q76 50 68 30 Z"/>
  <path d="M58 28.6 Q55 22 59 17 M62.6 28.4 Q64 21.6 69 19.6 M54 30 Q50 25 51 21" fill="none" stroke-width="1.8"/>
  <circle cx="72" cy="40" r="1.6" fill="#5e9a35" stroke="none"/><circle cx="69" cy="54" r="1.2" fill="#5e9a35" stroke="none"/>
  <path d="M41.6 36 L52.4 40.6 M57.6 40.6 L67.4 35.6" fill="none" stroke-width="2.6"/>
  <g class="qa-blink"><ellipse cx="48" cy="45" rx="4.4" ry="3.8" fill="#ffe14d"/><ellipse cx="62.4" cy="45" rx="4" ry="3.8" fill="#ffe14d"/><ellipse cx="46.8" cy="45" rx="1.2" ry="3" fill="${INK}" stroke="none"/><ellipse cx="61.2" cy="45" rx="1.2" ry="3" fill="${INK}" stroke="none"/></g>
  <path d="M54 46 Q43 51 39.4 59 Q48 59.6 56.4 54.4 Z" fill="#7dbb4a"/>
  <path d="M44 61 Q56 69.6 70 59 Q58 63.6 44 61 Z" fill="#3a1a1a"/>
  <path d="M48 61.6 L50 65 L52 62.4 Z M58.6 62.6 L60.6 66 L62.6 62 Z M65 61 L66.4 63.6 L67.6 60.4 Z" fill="#fffbe8" stroke-width="1.2"/>
  <g class="qa-arm" style="transform-origin:48px 70px">
    <path d="M34 79 L12 70.4 L17 77.4 L32 85 Z" fill="#c9cfd8"/>
    <path stroke="none" fill="#b06a3a" opacity=".75" d="M20 73.4 L24 75 L22 77.4 Z M27 78 L29 79.6 L27.6 80.6 Z"/>
    <path d="M15 72 L31 80.4" fill="none" stroke="#fff" stroke-width="1.4" opacity=".8"/>
    ${limb('M33.6 77 L37.6 88.6', '#6e4628', 2.6)}
    ${limb('M48 70 Q42 76 37.6 82', '#8fcf5a', 5.4)}
    <circle cx="36.4" cy="83.6" r="4.8" fill="#8fcf5a"/>
  </g>`);

// 骷髅兵: a dented iron helmet, skull with cyan pin-light eyes, ribcage and spine, round wooden shield, notched sword.
const SKELETON = svg('0 0 120 120', `
  <circle cx="86" cy="78" r="17" fill="#8a5a3a"/>
  <path d="M73 70 H99 M71 79 H101 M73 88 H99" fill="none" stroke="#5a3a20" stroke-width="1.6"/>
  <circle cx="86" cy="78" r="17" fill="none" stroke="#6d7480" stroke-width="3"/>
  <circle cx="86" cy="78" r="4.6" fill="#9aa1ac"/>
  ${limb('M72 67 Q80 72 83 78', '#f1ead8', 3.6)}
  ${limb('M55 98 L53 112', '#f1ead8', 3.6)}${limb('M66 98 L68 112', '#e0d6bd', 3.6)}
  <path d="M46 116 Q46 111 53 111 H57 V116 Z M64 116 Q64 111 70 111 H73 V116 Z" fill="#e0d6bd"/>
  <path d="M50 93.6 Q60 89.6 70 93.6 L68.4 100.4 Q60 97.6 51.6 100.4 Z" fill="#f1ead8"/>
  ${limb('M60 62 V94', '#f1ead8', 4)}
  ${limb('M50 70 Q60 66 70 70 M49 76.4 Q60 72.4 71 76.4 M50 83 Q60 79 70 83', '#f1ead8', 3.2)}
  ${limb('M46 65.6 H74', '#f1ead8', 3.6)}
  <path d="M44 36 Q44 18 62 18 Q80 18 80 36 Q80 46 74 50 L74 56 Q62 60.4 50 56 L50 50 Q44 46 44 36 Z" fill="#f1ead8"/>
  <path stroke="none" fill="#cfc4a8" d="M70 21 Q80 26 79.6 38 Q79 46 73 50 L73 55 Q70 56.6 67 57.4 Q74 40 70 21 Z"/>
  <ellipse cx="54" cy="37" rx="5.6" ry="6.2" fill="${INK}"/>
  <ellipse cx="68" cy="37" rx="5" ry="6.2" fill="${INK}"/>
  <circle class="qa-glow" cx="52.6" cy="38" r="2" fill="#7ff3ff" stroke="none"/>
  <circle class="qa-glow" cx="66.6" cy="38" r="1.8" fill="#7ff3ff" stroke="none"/>
  <path d="M60.6 44.4 L58.4 49 H62.6 Z" fill="${INK}"/>
  <path d="M51.6 52 H72.4 M55 50 V56 M59 50 V57 M63 50 V57 M67 50 V56" fill="none" stroke-width="1.4"/>
  <path d="M42 30.4 Q44 12 62 12 Q82 12 82.4 30.4 Q62 25 42 30.4 Z" fill="#8c7a6b"/>
  <path stroke="none" fill="#6e5c4e" d="M70 13.4 Q81 17 82 30 Q76 28.4 72 28 Q74 20 70 13.4 Z"/>
  <path stroke="none" fill="#b5653a" opacity=".8" d="M48 22 Q52 20 54 23 Q51 25 48 24 Z M64 16 Q67 15 68 17.6 Q66 19 64 18 Z"/>
  <path d="M56 13 L58 18 L55.6 22" fill="none" stroke-width="1.4"/>
  <path d="M71 20 L68 25.6 L71 29.6" fill="none" stroke="#b5aa8e" stroke-width="1.4"/>
  <g class="qa-arm" style="transform-origin:50px 68px">
    <g transform="rotate(-22 37 82)">
      <path d="M34 80 L34 45 L37 38 L40 45 L40 80 Z" fill="#b9bec8"/>
      <path stroke="none" fill="#2a2340" d="M40 56 L38.4 58 L40 60 Z M34 66 L35.6 68 L34 70 Z"/>
      <path stroke="none" fill="#b5653a" opacity=".7" d="M37.4 72 L39.4 72.6 L39.4 76 L37.6 75 Z"/>
      ${limb('M30.6 80.6 H43.4', '#8c7a6b', 2.6)}
      ${limb('M37 82 V89', '#6e4628', 2.6)}
    </g>
    ${limb('M50 68 Q44 75 39 82', '#f1ead8', 3.6)}
    <circle cx="38.4" cy="83" r="3.8" fill="#f1ead8"/>
  </g>`);

// 石像魔 (boss): a crouching stone demon with curled horns, stone wings, glowing ember eyes, fangs, cracks and moss.
const GARGOYLE = svg('0 0 120 120', `
  <g class="qa-wing r" style="transform-origin:76px 54px">
    <path d="M74 54 Q90 22 116 12 Q108 24 112 32 Q100 30 98 40 Q92 36 88 48 Q82 44 78 60 Z" fill="#7a8090"/>
    <path d="M78 54 L110 18 M82 56 L98 38 M80 58 L88 46" fill="none" stroke="#5a5f6b" stroke-width="1.6"/>
  </g>
  <g class="qa-wing" style="transform-origin:42px 54px">
    <path d="M46 54 Q30 20 4 12 Q12 24 8 32 Q20 30 22 41 Q28 36 32 49 Q38 44 42 60 Z" fill="#9aa0ad"/>
    <path d="M44 54 L10 18 M40 56 L22 38 M40 58 L32 46" fill="none" stroke="#6b7180" stroke-width="1.6"/>
    <path stroke="none" fill="#c2c7d1" d="M40 46 Q28 26 14 18 Q30 28 38 50 Z"/>
  </g>
  <ellipse cx="78" cy="100" rx="14" ry="12" fill="#8a90a0"/>
  <path d="M34 60 Q30 90 40 106 L80 106 Q92 90 86 60 Q60 48 34 60 Z" fill="#9aa0ad"/>
  <path stroke="none" fill="#7a8090" d="M74 56 Q88 62 87 82 Q86 96 80 105 L72 105 Q82 82 74 56 Z"/>
  <path d="M46 70 Q56 74 66 70 M48 82 Q56 85 64 82" fill="none" stroke="#7a8090" stroke-width="1.8"/>
  <path d="M64 66 L70 75 L66 82 M52 90 L56 98 L53 104" fill="none" stroke="#4e535e" stroke-width="1.6"/>
  <path stroke="none" fill="#6fae5a" d="M36 63 Q41 58.6 47 62.6 Q43 66.6 36.6 65 Z M80 92 Q84 89.6 87 92.6 Q84 94.6 80.6 93.6 Z"/>
  <ellipse cx="44" cy="100" rx="14" ry="12" fill="#a8aebb"/>
  <path d="M30 110 Q28 116 34 116 L44 116 Q50 116 48 110" fill="#8a90a0"/>
  <path d="M32 113 L28 118 M37 114 L35 119 M42 114 L42 119" fill="none" stroke-width="2.4"/>
  <path d="M44 28.6 Q32 14 39 3 Q44 16 53 24 Z" fill="#d9d2c0"/>
  <path d="M41.6 18 L46.6 16 M43 10.4 L47 10" fill="none" stroke="#a89f88" stroke-width="1.4"/>
  <path d="M70 26.6 Q81 12 77 1.6 Q70 14 64 22 Z" fill="#c4bca8"/>
  <path d="M38 44 Q36 24 56 22 Q78 22 78 42 Q78 54 68 58 L46 58 Q38 54 38 44 Z" fill="#a8aebb"/>
  <path stroke="none" fill="#8a90a0" d="M68 24.6 Q79 30 78 44 Q77 54 68 58 L64 58 Q74 44 68 24.6 Z"/>
  <path d="M39.4 38 L56 43 L72.6 38" fill="none" stroke-width="3.2"/>
  <path d="M42 40 L55 44 L43 48.6 Z M72 39.6 L59 44 L71 47.6 Z" fill="#3a2a30" stroke="none"/>
  <path class="qa-glow" d="M43.4 41.4 L53.4 44.2 L44.2 47 Z M70.6 41 L60.6 44.2 L69.8 46.4 Z" fill="#ffb02e" stroke="none"/>
  <circle cx="47" cy="44.2" r="1.3" fill="#fff6c0" stroke="none"/><circle cx="66" cy="43.8" r="1.2" fill="#fff6c0" stroke="none"/>
  <path d="M42 50 Q56 60.6 72 50 Q66 56.6 56 57.4 Q48 56.6 42 50 Z" fill="#3a2a30"/>
  <path d="M46.6 51.6 L48.6 57 L50.6 53 Z M62 53 L64 57.4 L66 51.6 Z" fill="#f5f0e0" stroke-width="1.4"/>
  <path d="M60 26 L57 31 L60 34" fill="none" stroke="#4e535e" stroke-width="1.4"/>
  <g class="qa-arm" style="transform-origin:40px 66px">
    ${limb('M40 66 Q32 74 26 84', '#a8aebb', 7)}
    <circle cx="24.4" cy="86" r="6" fill="#a8aebb"/>
    <path d="M20 82 L12 82.6 M19 86.6 L11 90 M21.6 90.4 L16 96.4" fill="none" stroke-width="2.6"/>
    <path d="M20 82 L12 82.6 M19 86.6 L11 90 M21.6 90.4 L16 96.4" fill="none" stroke="#e8e2d0" stroke-width="1"/>
  </g>`);

// 幽灵: a tattered translucent sheet trailing back, hollow eyes with blue pin-lights, a wailing mouth, reaching arm.
const WRAITH = svg('0 0 120 120', `
  <path d="M30 60 Q30 22 60 20 Q90 22 90 60 L92 94 Q96 104 106 108 Q95 111 88 104 Q86 112 78 115 Q80 106 74 104 Q70 114 62 112 Q66 104 58 102 Q52 110 44 106 Q50 98 44 92 Q36 88 30 60 Z" fill="#eaf1ff" fill-opacity=".94" stroke="#6f80b8"/>
  <path stroke="none" fill="#b9c9ef" d="M74 26 Q90 34 90 60 L92 94 Q96 104 104 107.4 Q95 109 88.6 102 Q86 108 80 112 Q83 100 78 92 Q86 60 74 26 Z"/>
  <path stroke="none" fill="#fff" opacity=".8" d="M38 46 Q40 32 52 27 Q42 36 42 50 Z"/>
  <path d="M98 42 Q106 36 102 27 M104 60 Q112 58 112 50 M24 40 Q18 34 22 26" fill="none" stroke="#b9c9ef" stroke-width="2"/>
  <ellipse cx="46" cy="48" rx="6.4" ry="8.6" fill="#1d2140"/>
  <ellipse cx="63" cy="48" rx="5.8" ry="8.6" fill="#1d2140"/>
  <circle class="qa-glow" cx="45" cy="49" r="2" fill="#9fd8ff" stroke="none"/>
  <circle class="qa-glow" cx="62" cy="49" r="1.8" fill="#9fd8ff" stroke="none"/>
  <path d="M40 38 L51 42 M58 42 L68 38" fill="none" stroke="#6f80b8" stroke-width="1.8"/>
  <ellipse cx="53" cy="67" rx="5.4" ry="7.6" fill="#1d2140"/>
  <path d="M50 70 Q53 73 56 70" fill="none" stroke="#3a4380" stroke-width="1.6"/>
  <g class="qa-arm" style="transform-origin:38px 66px">
    <path d="M36 62 Q22 64 11 72 Q17 75 22 73.4 Q19 80 24 82.4 Q29 74 40 75 Z" fill="#eaf1ff" fill-opacity=".94" stroke="#6f80b8"/>
    <path d="M13 72 L8 70 M15 74.6 L10 76 M21 79 L17.6 82" fill="none" stroke="#6f80b8" stroke-width="1.6"/>
  </g>`);

// 食人魔: a huge olive brute with a belly, unibrow, tusks, loincloth on a rope, and a spiked wooden club.
const OGRE = svg('0 0 120 120', `
  ${limb('M85 66 Q93 76 95 88', '#8f9a58', 9)}
  <circle cx="95" cy="91" r="6.4" fill="#a8b46e"/>
  ${limb('M50 100 L48 111', '#a8b46e', 10)}${limb('M73 100 L75 111', '#8f9a58', 10)}
  <path d="M38 117 Q38 110 48 110 H54 V117 Z M70 117 Q70 110 78 110 H84 V117 Z" fill="#6e4628"/>
  <path d="M36 64 Q26 92 40 106 Q62 114 84 106 Q96 92 86 64 Q62 54 36 64 Z" fill="#a8b46e"/>
  <path stroke="none" fill="#7f8a4a" d="M78 60 Q92 70 90 90 Q88 102 82 107 Q74 109 70 109.6 Q86 90 78 60 Z"/>
  <path stroke="none" fill="#c4cf8a" d="M42 74 Q48 68 56 70 Q48 76 46 86 Q42 82 42 74 Z"/>
  <ellipse cx="58" cy="90" rx="2" ry="2.6" fill="#7f8a4a"/>
  <path d="M52 72 Q53 75 51 77 M58 70 Q59 73 57.6 75 M64 72 Q65 75 63.6 77" fill="none" stroke="#6b7536" stroke-width="1.4"/>
  ${limb('M40 66 L82 92', '#8a5a3a', 3.4)}
  <path d="M38 97 Q62 105 86 97 L82 111 L72 107 L62 113 L52 107 L42 111 Z" fill="#9a6a3c"/>
  <path d="M37.6 96.6 Q62 104.6 86.4 96.6" fill="none" stroke="#5a3a20" stroke-width="3.4"/>
  <path d="M50 101 L52 106 M70 101.4 L68 106.6" fill="none" stroke="#5a3a20" stroke-width="1.4"/>
  <ellipse cx="79.4" cy="44" rx="4.4" ry="6" fill="#97a35f"/>
  <path d="M46 46 Q44 26 62 24 Q80 26 78 46 Q78 60 62 62 Q46 60 46 46 Z" fill="#a8b46e"/>
  <path stroke="none" fill="#8f9a58" d="M70 27 Q79 33 77.6 47 Q76 58 66 61.4 Q75 46 70 27 Z"/>
  <path d="M56 26 Q55 21 58 18 M62 25 Q63 20 67 18.4 M68 27 Q71 23 75 23" fill="none" stroke-width="1.6"/>
  <path d="M47.6 38.6 Q56 33.4 67 38" fill="none" stroke-width="3.8"/>
  <g class="qa-blink"><ellipse cx="52.4" cy="42.6" rx="2.4" ry="2.6" fill="#7a1a1a" stroke="none"/><ellipse cx="62.4" cy="42.6" rx="2.2" ry="2.6" fill="#7a1a1a" stroke="none"/><circle cx="53" cy="41.8" r=".9" fill="#fff" stroke="none"/><circle cx="63" cy="41.8" r=".9" fill="#fff" stroke="none"/></g>
  <ellipse cx="52" cy="48.6" rx="5.4" ry="4.2" fill="#97a35f"/>
  <path d="M48 55 Q58 59.4 69 54.6" fill="none" stroke-width="2.4"/>
  <path d="M50.4 56 L48.6 48.6 L53.6 55 Z M63.4 56.4 L63.6 49.4 L66.6 55.4 Z" fill="#fffbe8" stroke-width="1.6"/>
  <g class="qa-arm" style="transform-origin:42px 68px">
    <path d="M31 86 L15 40 Q13 29 22 27 Q31 27 33 37 L37 84 Z" fill="#9a6a3c"/>
    <path stroke="none" fill="#6e4628" d="M27 34 Q31 32 32.4 38 L36 82 L33 84 Q30 60 27 34 Z"/>
    <path d="M19.6 46 Q23 44 22 52 M24 62 Q27 60 26.4 68" fill="none" stroke="#6e4628" stroke-width="1.4"/>
    <path d="M16 46 L9.4 43.6 M17.6 57 L11 57 M21 34 L17 27.6 M30.6 33 L34 27 M33 47 L39 46" fill="none" stroke-width="2.6"/>
    <path d="M16 46 L9.4 43.6 M17.6 57 L11 57 M21 34 L17 27.6 M30.6 33 L34 27 M33 47 L39 46" fill="none" stroke="#d9d2c0" stroke-width="1"/>
    ${limb('M44 68 Q38 76 33 83', '#a8b46e', 9)}
    <circle cx="32.4" cy="85" r="6.6" fill="#a8b46e"/>
    <path d="M28 82.4 Q32 81 35 83" fill="none" stroke-width="1.4"/>
  </g>`);

// 幼龙: a young red-orange dragon, cream belly plates and horns, slit yellow eye, little wings, spade tail, smoke puffs.
const DRAKE = svg('0 0 120 120', `
  ${limb('M80 98 Q102 104 106 82', '#ff7a45', 6)}
  <path d="M106 84 L99 72 L113 72.6 Z" fill="#c94a22"/>
  <g class="qa-wing r" style="transform-origin:76px 62px">
    <path d="M72 62 Q86 30 110 25 Q103 36 107 43 Q97 42 95 51 Q87 48 85 61 Z" fill="#ff9f7a"/>
    <path d="M74 60 L106 29 M78 60 L95 47 M80 61 L86 52" fill="none" stroke="#c94a22" stroke-width="1.6"/>
  </g>
  <ellipse cx="78" cy="97" rx="13" ry="11" fill="#e8622f"/>
  <path d="M70 114 Q70 108 78 108 H86 Q88 114 82 114 Z" fill="#e8622f"/>
  <path d="M73 114.6 L71 118 M78 114.6 L77 118" fill="none" stroke-width="2"/>
  <path d="M44 70 Q40 96 54 106 Q72 112 86 102 Q92 84 80 66 Q62 56 44 70 Z" fill="#ff7a45"/>
  <path stroke="none" fill="#e8622f" d="M76 64 Q90 76 88 92 Q86 102 80 106 Q86 84 76 64 Z"/>
  <path d="M60 62 L62 56 L65.6 61 M68 63 L71.6 57.4 L73.6 64 M76 67 L80.6 62.6 L81 69.6" fill="#ffe0a3" stroke-width="1.6"/>
  <path d="M48 76 Q46 96 58 104 Q66 106 70 102 Q62 90 60 74 Z" fill="#ffe0a3"/>
  <path d="M48.4 82 Q54 83 60.6 80 M48.6 89 Q55 90 62.6 87 M51 96 Q57 97 65 94" fill="none" stroke="#e8b46a" stroke-width="1.6"/>
  ${limb('M54 100 L52 111', '#ff7a45', 6)}
  <path d="M44 116 Q44 110 52 110 H58 Q59 116 53 116 Z" fill="#ff7a45"/>
  <path d="M44.6 113 L41.6 116 M48.6 114 L46.6 118" fill="none" stroke-width="2"/>
  <path d="M52 30 Q60 18 71 15 Q64 24 60 34 Z" fill="#ffe0a3"/>
  <path d="M44 28 Q48 16 57 11 Q52 21 50 30 Z" fill="#f2cc85"/>
  <path d="M44 66 Q34 62 30 52 L16 52 Q9.6 50 12 44 Q16 38 28 38 Q34 26 50 28 Q64 30 62 46 Q60 58 52 66 Z" fill="#ff7a45"/>
  <path stroke="none" fill="#e8622f" d="M54 31 Q63 36 61.6 47 Q60 57 52.6 65 L47 65 Q58 50 54 31 Z"/>
  <path d="M15 50.4 Q25 52.4 34 50" fill="none" stroke-width="1.8"/>
  <circle cx="16" cy="43.6" r="1.4" fill="${INK}" stroke="none"/>
  <path d="M21.4 50.6 L23.4 55 L25.4 51 Z" fill="#fff" stroke-width="1.4"/>
  <g class="qa-blink"><ellipse cx="38" cy="41" rx="5.4" ry="5.8" fill="#ffe14d"/><ellipse cx="36.8" cy="41.4" rx="1.4" ry="4.2" fill="${INK}" stroke="none"/><circle cx="39.4" cy="38.8" r="1.2" fill="#fff" stroke="none"/></g>
  <path d="M31 34 L44 36.4" fill="none" stroke-width="2.4"/>
  <circle class="qa-glow" cx="8" cy="39" r="3" fill="#d9d2e0" stroke="none"/><circle class="qa-glow" cx="4" cy="33" r="2" fill="#d9d2e0" stroke="none"/>
  <g class="qa-arm" style="transform-origin:50px 76px">
    ${limb('M50 76 Q44 82 40 88', '#ff7a45', 5.4)}
    <path d="M37 86 L32 87 M37.6 89.6 L33 92 M40.6 91 L38 95" fill="none" stroke-width="2"/>
  </g>`);

// 巫妖王 (boss): a floating hooded skull in a gold crown, green eye-fire, tattered royal robe, skull staff with a green flame.
const LICH = svg('0 0 120 120', `
  <ellipse class="qa-glow" cx="60" cy="66" rx="50" ry="52" fill="url(#qa-lich-aura)" stroke="none"/>
  <path d="M38 50 Q26 80 22 110 L30 104 L36 114 L44 106 L52 116 L60 106 L68 116 L76 106 L84 114 L90 104 L98 110 Q94 80 82 50 Q60 40 38 50 Z" fill="#3b2a6b"/>
  <path stroke="none" fill="#241845" d="M74 48 Q88 62 93 84 Q96 96 97 108 L90 103 L84 112 L80 104 Q86 76 74 48 Z"/>
  <path d="M60 58 L60 106" fill="none" stroke="#2a2340" stroke-width="5"/>
  <path d="M60 58 L60 106" fill="none" stroke="#d9a93a" stroke-width="2.4"/>
  <path class="qa-glow" d="M51 76 L54 80 L51 84 M69 76 L66 80 L69 84 M50 94 H54 M66 94 H70" fill="none" stroke="#7dffb0" stroke-width="1.6"/>
  <path d="M38 70 Q60 76 82 70 L83 76 Q60 82 37 76 Z" fill="#241845"/>
  <circle cx="60" cy="76" r="4" fill="#e8e0cc"/>
  <circle cx="58.6" cy="75.6" r=".9" fill="${INK}" stroke="none"/><circle cx="61.4" cy="75.6" r=".9" fill="${INK}" stroke="none"/>
  ${limb('M82 58 Q92 60 96 50', '#3b2a6b', 7)}
  <path d="M94 47 L92 40 M97 46.6 L98 39 M99 49 L104 44" fill="none" stroke="#e8e0cc" stroke-width="2"/>
  <circle class="qa-glow" cx="99" cy="38" r="4" fill="#7dffb0" stroke="none" opacity=".8"/>
  <path d="M34 50 Q30 18 60 12 Q90 18 86 50 Q80 60 60 62 Q40 60 34 50 Z" fill="#2c1f52"/>
  <path stroke="none" fill="#3e2c70" d="M38 46 Q36 24 54 16 Q42 28 43 48 Z"/>
  <path d="M42 48 Q42 26 60 24 Q78 26 78 48 Q72 56 60 56 Q48 56 42 48 Z" fill="#120b26"/>
  <path d="M46 40 Q46 28 60 28 Q74 28 74 40 Q74 48 68 50 L68 54 Q60 57 52 54 L52 50 Q46 48 46 40 Z" fill="#e8e0cc"/>
  <path stroke="none" fill="#bdb29a" d="M66 30 Q74 34 73.6 42 Q73 48 67.4 50 L67.4 53.4 Q65 54.6 63 55 Q69 42 66 30 Z"/>
  <ellipse cx="54" cy="40" rx="4.4" ry="5" fill="${INK}"/><ellipse cx="66" cy="40" rx="4" ry="5" fill="${INK}"/>
  <circle class="qa-glow" cx="53.4" cy="40.6" r="2.4" fill="#7dffb0" stroke="none"/>
  <circle class="qa-glow" cx="65.4" cy="40.6" r="2.2" fill="#7dffb0" stroke="none"/>
  <path d="M60 45 L58.4 48 H61.6 Z" fill="${INK}"/>
  <path d="M53 51.6 H67 M56 50 V54 M60 50 V55 M64 50 V54" fill="none" stroke-width="1.2"/>
  <path d="M41 19 L45 5 L52 13.6 L60 1 L68 13.6 L75 5 L79 19 Q60 14.4 41 19 Z" fill="${GOLD}"/>
  <path stroke="none" fill="#d9a93a" d="M68 13.6 L75 5 L79 19 Q73 17.6 70 17.4 Z"/>
  <circle cx="60" cy="12" r="2.4" fill="#ff4d6d"/><circle cx="48" cy="15" r="1.6" fill="#7dffb0"/><circle cx="72" cy="15" r="1.6" fill="#7dffb0"/>
  <g class="qa-arm" style="transform-origin:42px 60px">
    ${limb('M28 36 V114', '#3a2e44', 3.4)}
    <circle cx="28" cy="31" r="6" fill="#e8e0cc"/>
    <path d="M24.4 36 H31.6 L30.6 39 H25.4 Z" fill="#e8e0cc" stroke-width="1.6"/>
    <circle cx="25.6" cy="30.4" r="1.6" fill="${INK}" stroke="none"/><circle cx="30" cy="30.4" r="1.4" fill="${INK}" stroke="none"/>
    <path class="qa-glow qa-tip" d="M28 25 Q19 17 25.4 6 Q27.4 13 31 11 Q36.6 19 28 25 Z" fill="#7dffb0" stroke="#2f9a6a" stroke-width="1.6"/>
    <path stroke="none" fill="#e9fff2" d="M28 22 Q24 18 27 12.6 Q28.4 16.4 30.4 16 Q31 20 28 22 Z"/>
    <path d="M40 56 Q30 60 28 70 L38 74.6 Q42 66 46 64 Z" fill="#3b2a6b"/>
    <path d="M26 66 Q22 68 24 72 M30 64.6 Q34 66 32.6 70" fill="none" stroke="#e8e0cc" stroke-width="2.2"/>
  </g>`,
  '<radialGradient id="qa-lich-aura"><stop offset=".3" stop-color="#7dffb0" stop-opacity=".22"/><stop offset="1" stop-color="#7dffb0" stop-opacity="0"/></radialGradient>');

const HERO_MARKUP = [WARRIOR, MAGE, GUARDIAN, PRIEST];
const FOE_MARKUP = { slime: SLIME, bat: BAT, goblin: GOBLIN, skeleton: SKELETON, gargoyle: GARGOYLE, wraith: WRAITH, ogre: OGRE, drake: DRAKE, lich: LICH };
export const FOE_IDS = Object.keys(FOE_MARKUP);

const parsed = new Map();
// A fresh copy of a sprite, or null if the markup is missing or fails to parse.
function build(key, markup) {
  if (!markup) return null;
  if (!parsed.has(key)) {
    const doc = new DOMParser().parseFromString(markup, 'image/svg+xml');
    parsed.set(key, doc.getElementsByTagName('parsererror').length ? null : doc.documentElement);
  }
  const source = parsed.get(key);
  return source ? document.importNode(source, true) : null;
}
export const heroSprite = (index) => build(`hero-${index}`, HERO_MARKUP[index]);
export const foeSprite = (id) => build(`foe-${id}`, FOE_MARKUP[id]);
