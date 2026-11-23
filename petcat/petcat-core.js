// 猫撫でシミュレーター的纯逻辑：毛色表、精灵清单校验、画布布局换算、指针映射、毛发法线表。
// 全部不碰 DOM，test/petcat.test.js 直接 import 来测；petcat-engine.js 只负责画和收事件。

// 原站的设计稿尺寸：猫和手都按 1517×935 的房间坐标摆放（精灵里存的是裁剪块 + 这块在整张里的位置）。
export const ROOM = { width: 1517, height: 935, base: 0.831 };

// 毛色顺序和原站毛色条一致。saba（银虎斑）没有贴图，是拿 mugi 的贴图现场合成的。
export const COATS = [
  { id: 'kuro', zh: '黑猫', jp: '黒猫' },
  { id: 'mugi', zh: '橘虎斑', jp: '茶トラ' },
  { id: 'hana', zh: '三花', jp: '三毛猫' },
  { id: 'shiro', zh: '白猫', jp: '白猫' },
  { id: 'saba', zh: '银虎斑', jp: 'サバトラ' },
  { id: 'hachi', zh: '奶牛猫', jp: 'ハチワレ' },
  { id: 'sabi', zh: '玳瑁', jp: 'サビ猫' },
  { id: 'gray', zh: '蓝猫', jp: 'グレー単色' },
  { id: 'kiji', zh: '狸花', jp: 'キジトラ' },
  { id: 'siam', zh: '暹罗', jp: 'シャム猫' },
  { id: 'ragdoll', zh: '布偶', jp: 'ラグドール' },
  { id: 'siberian', zh: '西伯利亚', jp: 'サイベリアン' },
  { id: 'norwegian', zh: '挪威森林猫', jp: 'ノルウェージャン・フォレスト・キャット' }
];

export const COAT_IDS = COATS.map((coat) => coat.id);

const BY_ID = new Map(COATS.map((coat) => [coat.id, coat]));

export function coatName(id, lang = 'zh') {
  const coat = BY_ID.get(id);
  if (!coat) return id;
  return lang === 'jp' ? coat.jp : coat.zh;
}

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// 毛发法线表：上半 256 项是顺毛方向，下半 256 项是逆毛（-3.825*lit 的那一条）。
export function buildNapFactor() {
  const table = new Float64Array(512);
  for (let i = 0; i < 256; i++) {
    const fibre = i / 127.5 - 1;
    table[i] = -6.885 + 3.06 + 8.16 * fibre;
    table[256 + i] = -6.885 - 3.06 - 8.16 * fibre - 3.825 * Math.max(fibre, 0);
  }
  return table;
}

/**
 * 把舞台的像素尺寸换算成房间坐标下的画布参数。
 * topCrop 是 CSS 里 --top-crop（窄屏会裁掉上方一块），原站用的是同一个公式。
 */
export function computeView({ width, height, dpr, catScale, topCrop }) {
  const framedHeight = height / (1 - topCrop);
  const zoom = Math.max(width / ROOM.width, framedHeight / ROOM.height);
  const roomW = ROOM.width * zoom;
  const roomH = ROOM.height * zoom;
  const roomX = (width - roomW) / 2;
  const roomY = (framedHeight - roomH) / 2 - (framedHeight - height);
  const baseW = roomW * ROOM.base;
  const baseH = roomH * ROOM.base;
  const w = baseW * catScale;
  const h = baseH * catScale;
  const x = roomX + roomW * 0.006 + (baseW - w) * 0.46;
  const y = roomY + (roomH - baseH) * 0.49 + (baseH - h) * 0.51;
  const kittenAmount = clamp((0.86 - catScale) / (0.86 - 0.65), 0, 1);
  const upperNeckExtra = kittenAmount * clamp(baseW * 0.062, 24, 44) / w;
  return {
    width, height, dpr, x, y, w, h,
    roomX, roomY, roomW, roomH, baseW, baseH,
    kitten: catScale <= 0.79,
    upperNeckExtra,
    handWidth: baseW * 0.895,
    touchLift: Math.min(62, framedHeight * 0.215) + 40,
    framedHeight
  };
}

/**
 * 把指针位置换成 0~1 的舞台坐标。横屏时整个舞台转了 90°，所以先换轴；
 * 触屏的手会挡住指尖，所以往上抬 touchLift。
 */
export function pointerToStage({ rect, rotated, clientX, clientY, lift = 0, view }) {
  const x = rotated ? clientY - rect.top : clientX - rect.left;
  const y = rotated ? rect.right - clientX : clientY - rect.top;
  return { u: (x - view.x) / view.w, v: (y - view.y - lift) / view.h };
}

// 精灵清单一项是八元组 [字节偏移, 字节数, x, y, w, h, W, H]：
// 图里存的是 x,y,w,h 那块裁剪，游戏把它贴回 W×H（这里统一 1517×935）的画布坐标。
export function atlasEntry(atlas, name) {
  const entry = atlas?.[name];
  if (!Array.isArray(entry) || entry.length !== 8) return null;
  return entry;
}

// 每只猫要有本体和尾巴两条；saba 是合成的，不用贴图。
export function missingSprites(atlas, ids = COAT_IDS) {
  const missing = [];
  for (const id of ids) {
    if (id === 'saba') continue;
    for (const name of [id, `${id}-tail`]) if (!atlasEntry(atlas, name)) missing.push(name);
  }
  for (const name of ['room', 'hand-slim', 'grip-slim']) if (!atlasEntry(atlas, name)) missing.push(name);
  return missing;
}
