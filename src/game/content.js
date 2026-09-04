import { exponential, polynomial } from '../domain/expression.js';

export const BOARD = Object.freeze({ rows: 5, columns: 8, placeableColumns: 5 });

export const OPERATOR_ORDER = [
  'derivative',
  'subtract',
  'secondDerivative',
  'definiteIntegralTower',
  'integral',
  'reflect',
  'limit',
  'partial',
];

export const OPERATORS = Object.freeze({
  derivative: {
    id: 'derivative',
    key: '1',
    symbol: 'D',
    name: '微分砲',
    cost: 100,
    kind: 'tower',
    cooldown: 1.75,
    art: 'tower-art-derivative',
    unlockWave: 0,
    description: '同一路每次命中做一次 d/dx，直到公式化為 0。',
  },
  subtract: {
    id: 'subtract',
    key: '2',
    symbol: 'x−[ ]',
    name: '參數平移砲',
    cost: 80,
    kind: 'tower',
    cooldown: 2.2,
    art: 'tower-art-subtract',
    unlockWave: 0,
    description: '空槽塔：把工坊組出的常數裝入後，持續施放 P(x)−k。',
  },
  secondDerivative: {
    id: 'secondDerivative',
    key: '3',
    symbol: 'D²',
    name: '高階砲',
    cost: 180,
    kind: 'tower',
    cooldown: 3.7,
    art: 'tower-art-second',
    unlockWave: 1,
    description: '一發連做兩次微分，能跳過危險的中間係數。',
  },
  definiteIntegralTower: {
    id: 'definiteIntegralTower',
    key: '4',
    symbol: '∫[ ]→[ ]',
    name: '定積分塔',
    cost: 150,
    kind: 'tower',
    cooldown: 5.2,
    art: 'tower-art-integral',
    unlockWave: 2,
    description: '雙空槽塔：裝入下界與上界後，把目標化成定積分常數。',
  },
  integral: {
    id: 'integral',
    key: '5',
    symbol: '∫ + C',
    name: '不定積分',
    cost: 175,
    kind: 'target',
    art: 'combo-art-integral',
    unlockWave: 1,
    description: '一次性：積分後隨機抽 C。降係數、升階數，走投無路時賭一把。',
  },
  reflect: {
    id: 'reflect',
    key: '6',
    symbol: 'x ↦ −x',
    name: '輸入反射',
    cost: 75,
    kind: 'target',
    art: 'combo-art-reflect',
    unlockWave: 3,
    description: '一次性：令 F(x) → F(−x)，可把 eˣ 變成 e⁻ˣ。',
  },
  limit: {
    id: 'limit',
    key: '7',
    symbol: 'lim ∞',
    name: '無窮極限',
    cost: 225,
    kind: 'target',
    art: 'combo-art-limit',
    unlockWave: 3,
    description: '一次性：極限為 0 才消滅；若發散，敵人會暴走。',
  },
  partial: {
    id: 'partial',
    key: '8',
    symbol: '∂/∂x',
    name: '全場偏微分',
    cost: 400,
    kind: 'global',
    art: 'tower-art-partial',
    unlockWave: 2,
    description: '昂貴卷軸：全場對 x 偏微分一次；每波限用一次。',
  },
});

const p = (terms) => polynomial(terms);
const term = (coefficient, xPower = 0, yPower = 0) => ({ coefficient, xPower, yPower });

export const ENEMY_TYPES = Object.freeze({
  linear: {
    name: '一次墨兔',
    art: 'enemy-art-polynomial',
    speed: 0.020,
    reward: 26,
    create: () => p([term(1, 1)]),
  },
  square: {
    name: '平方墨兔',
    art: 'enemy-art-polynomial',
    speed: 0.018,
    reward: 32,
    create: () => p([term(1, 2)]),
  },
  shiftedSquare: {
    name: '常數背包獸',
    art: 'enemy-art-polynomial',
    speed: 0.015,
    reward: 42,
    create: () => p([term(1, 2), term(20)]),
  },
  shiftedCube: {
    name: '三次背包獸',
    art: 'enemy-art-polynomial',
    speed: 0.014,
    reward: 48,
    create: () => p([term(1, 3), term(30)]),
  },
  factorial: {
    name: '階乘巨獸',
    art: 'enemy-art-brute',
    speed: 0.0105,
    reward: 72,
    create: () => p([term(1, 5)]),
  },
  emergency: {
    name: '高係數浪獸',
    art: 'enemy-art-wave',
    speed: 0.017,
    reward: 60,
    create: () => p([term(120, 1)]),
  },
  yOnly: {
    name: '純 y 摺獸',
    art: 'enemy-art-wave',
    speed: 0.017,
    reward: 52,
    create: () => p([term(1, 0, 4), term(10)]),
  },
  mixed: {
    name: '雙變數紙獸',
    art: 'enemy-art-polynomial',
    speed: 0.012,
    reward: 70,
    create: () => p([term(1, 2, 3), term(20)]),
  },
  exponential: {
    name: '指數飛蛾',
    art: 'enemy-art-exponential',
    speed: 0.0135,
    reward: 110,
    create: () => exponential(1, 1),
  },
});

export const WAVES = Object.freeze([
  {
    name: '一次暖身',
    hint: '先在有敵人的路放置 D 微分砲。常數還要再微分一次。',
    entries: [
      ['linear', 0, 0.0], ['square', 2, 1.8], ['linear', 4, 3.6],
      ['square', 1, 5.4], ['linear', 3, 7.2],
    ],
  },
  {
    name: '常數陷阱',
    hint: 'P−10 能削掉 +20，但打過頭就會把它推成負數、重新升高傷害。',
    entries: [
      ['shiftedSquare', 0, 0.0], ['square', 3, 1.6], ['shiftedCube', 1, 3.2],
      ['shiftedSquare', 4, 4.8], ['square', 2, 6.4], ['shiftedCube', 3, 8.0],
    ],
  },
  {
    name: '階乘風暴',
    hint: 'x⁵ 被微分後會升到 120 傷害。必要時用 ∫+C 降係數、換取時間。',
    entries: [
      ['factorial', 2, 0.0], ['emergency', 0, 2.8], ['shiftedSquare', 4, 4.6],
      ['factorial', 1, 7.0], ['emergency', 3, 9.4],
    ],
  },
  {
    name: '偏微分試煉',
    hint: '全場 ∂/∂x 會消去不含 x 的項，但也可能讓其他怪物係數暴增。',
    entries: [
      ['mixed', 0, 0.0], ['yOnly', 2, 1.4], ['factorial', 4, 3.0],
      ['mixed', 3, 4.8], ['yOnly', 1, 6.2], ['mixed', 2, 8.1],
    ],
  },
  {
    name: '指數壓境',
    hint: 'eˣ 微分後仍是 eˣ。先用 x↦−x，再用 lim∞ 完成必殺連鎖。',
    entries: [
      ['exponential', 1, 0.0], ['factorial', 3, 2.8], ['shiftedCube', 0, 4.4],
      ['exponential', 4, 7.0], ['mixed', 2, 9.2], ['factorial', 1, 11.0],
    ],
  },
]);

export const INTEGRATION_CONSTANTS = Object.freeze([-10, -5, 0, 5, 10]);

export const GOD_CONSTANT_VALUES = Object.freeze([-5, -3, -2, 0, 1, 2, 3, 5, 7, 10]);
export const CONSTANT_QUEUE_CAPACITY = 10;
export const CONSTANT_QUEUE_INTERVAL = 7.5;
export const FORMULA_QUEUE_CAPACITY = 10;
export const FORMULA_QUEUE_INTERVAL = 6;

export const FORMULA_CARDS = Object.freeze([
  { id: 'kPlus10', label: 'k + 10', evaluate: ({ k }) => k + 10 },
  { id: 'kMinus5', label: 'k − 5', evaluate: ({ k }) => k - 5 },
  { id: 'doubleK', label: '2k', evaluate: ({ k }) => 2 * k },
  { id: 'negateK', label: '−k', evaluate: ({ k }) => -k },
  { id: 'kSquaredMinus5', label: 'k² − 5', evaluate: ({ k }) => k ** 2 - 5 },
  { id: 'tripleK', label: '3k', evaluate: ({ k }) => 3 * k },
  { id: 'kPlus5', label: 'k + 5', evaluate: ({ k }) => k + 5 },
  { id: 'tenMinusK', label: '10 − k', evaluate: ({ k }) => 10 - k },
  { id: 'kSquared', label: 'k²', evaluate: ({ k }) => k ** 2 },
  { id: 'doubleKPlus2', label: '2k + 2', evaluate: ({ k }) => 2 * k + 2 },
]);
