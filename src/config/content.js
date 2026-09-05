import { exponential, polynomial } from '../domain/expression.js';
import { deepFreeze } from './freeze.js';

const board = (rows, columns, placeableColumns) => Object.freeze({ rows, columns, placeableColumns });

export const OPERATOR_QUEUE_CAPACITY = 8;
export const OPERATOR_QUEUE_INTERVAL = 8;
export const STORED_CONSTANT_CAPACITY = 5;
export const CONSTANT_QUEUE_CAPACITY = 10;
export const CONSTANT_QUEUE_INTERVAL = 7.5;
export const FORMULA_QUEUE_CAPACITY = 10;
export const FORMULA_QUEUE_INTERVAL = 6;

export const OPERATOR_ORDER = deepFreeze([
  'derivative', 'subtract', 'secondDerivative', 'definiteIntegralTower',
  'integral', 'partial', 'evaluateTower', 'limit', 'eulerTower', 'reflect',
  'resonanceTower',
]);

export const OPERATORS = deepFreeze({
  derivative: {
    id: 'derivative', symbol: 'D', name: '微分砲', cost: 100, kind: 'tower',
    projectile: { shape: 'derivative', trajectory: 'lane' },
    cooldown: 1.75, art: 'tower-art-derivative', unlockChapter: 0, unlockWave: 0,
    counterTags: ['polynomial', 'constant', 'higherOrder', 'multivariable', 'logarithmic'],
    description: '同一路每次命中做一次 d/dx，直到公式化為 0。',
  },
  subtract: {
    id: 'subtract', symbol: 'x−[ ]', name: '參數平移砲', cost: 80, kind: 'tower',
    projectile: { shape: 'subtract', trajectory: 'lane' },
    cooldown: 2.2, art: 'tower-art-subtract', unlockChapter: 0, unlockWave: 0,
    counterTags: ['constant'],
    description: '空槽塔：把工坊組出的常數裝入後，持續施放 P(x)−k。',
  },
  secondDerivative: {
    id: 'secondDerivative', symbol: 'D²', name: '高階砲', cost: 150, kind: 'tower',
    projectile: { shape: 'second-derivative', trajectory: 'lane' },
    cooldown: 2.2, art: 'tower-art-second', unlockChapter: 1, unlockWave: 1,
    counterTags: ['higherOrder', 'polynomial', 'constant', 'multivariable'],
    description: '一發連做兩次微分，能跳過危險的中間係數。',
  },
  definiteIntegralTower: {
    id: 'definiteIntegralTower', symbol: '∫[ ]→[ ]', name: '定積分塔', cost: 150, kind: 'tower',
    projectile: { shape: 'definite-integral', trajectory: 'lane' },
    cooldown: 5.2, art: 'tower-art-integral', unlockChapter: 4, unlockWave: 4,
    counterTags: ['polynomial', 'trigonometric'],
    description: '雙空槽塔：裝入下界與上界後，把目標化成定積分常數。',
  },
  integral: {
    id: 'integral', symbol: '∫ + C', name: '不定積分', cost: 175, kind: 'target',
    projectile: { shape: 'indefinite-integral', trajectory: 'drop' },
    art: 'combo-art-integral', unlockChapter: 1, unlockWave: 1,
    counterTags: ['higherOrder', 'rational'],
    description: '一次性：積分後隨機抽 C。降係數、升階數，走投無路時賭一把。',
  },
  reflect: {
    id: 'reflect', symbol: 'x ↦ −x', name: '輸入反射', cost: 75, kind: 'target',
    projectile: { shape: 'reflection', trajectory: 'drop' },
    art: 'combo-art-reflect', unlockChapter: 5, unlockWave: 5,
    counterTags: ['exponential'],
    description: '一次性：令 F(x) → F(−x)，可把成長指數變成衰減指數。',
  },
  limit: {
    id: 'limit', symbol: 'lim ∞', name: '無窮極限', cost: 225, kind: 'target',
    projectile: { shape: 'limit', trajectory: 'drop' },
    art: 'combo-art-limit', unlockChapter: 2, unlockWave: 2,
    counterTags: ['rational', 'logarithmic', 'exponential'],
    description: '一次性：有限結果會取代原式；不存在或發散時敵人暴走。',
  },
  partial: {
    id: 'partial', symbol: '∂/∂x', name: '全場偏微分', cost: 400, kind: 'global',
    projectile: { shape: 'partial', trajectory: 'drop' },
    art: 'tower-art-partial', unlockChapter: 3, unlockWave: 3,
    counterTags: ['multivariable'],
    description: '昂貴卷軸：全場對 x 偏微分一次；每輪限用一次。',
  },
  evaluateTower: {
    id: 'evaluateTower', symbol: 'f([ ])', name: '代入塔', cost: 130, kind: 'tower',
    projectile: { shape: 'evaluation', trajectory: 'lane' },
    cooldown: 6, art: 'tower-art-subtract', unlockChapter: 3, unlockWave: 3,
    counterTags: ['polynomial', 'constant', 'multivariable', 'rational', 'logarithmic', 'trigonometric', 'exponential'],
    description: '空槽塔：裝入 k 後把目標代入 x=k；代到根時可直接歸零。',
  },
  eulerTower: {
    id: 'eulerTower', symbol: 'xD＋[ ]I', name: 'Euler 塔', cost: 210, kind: 'tower',
    projectile: { shape: 'euler', trajectory: 'lane' },
    cooldown: 3.8, art: 'tower-art-second', unlockChapter: 2, unlockWave: 2,
    counterTags: ['polynomial', 'rational', 'logarithmic'],
    description: '空槽塔：施作 xD+kI；適合處理齊次、分式與對數函數。',
  },
  resonanceTower: {
    id: 'resonanceTower', symbol: 'D²＋[ ]I', name: '共振塔', cost: 240, kind: 'tower',
    projectile: { shape: 'resonance', trajectory: 'lane' },
    cooldown: 4.2, art: 'tower-art-second', unlockChapter: 4, unlockWave: 4,
    counterTags: ['trigonometric', 'exponential'],
    description: '空槽塔：施作 D²+kI；裝入正確頻率平方即可共振消去。',
  },
});

const p = (terms) => polynomial(terms);
const term = (coefficient, xPower = 0, yPower = 0) => ({ coefficient, xPower, yPower });

// Stable named fixtures are retained for compatibility. Procedural entries carry
// complete enemy data and do not look themselves up in this table at runtime.
export const ENEMY_TYPES = deepFreeze({
  linear: { name: '一次墨兔', art: 'enemy-art-polynomial', family: 'polynomial', speed: 0.020, reward: 26, create: () => p([term(1, 1)]) },
  square: { name: '平方墨兔', art: 'enemy-art-polynomial', family: 'polynomial', speed: 0.018, reward: 32, create: () => p([term(1, 2)]) },
  shiftedSquare: { name: '常數背包獸', art: 'enemy-art-polynomial', family: 'constant', speed: 0.015, reward: 42, create: () => p([term(1, 2), term(20)]) },
  shiftedCube: { name: '三次背包獸', art: 'enemy-art-polynomial', family: 'constant', speed: 0.014, reward: 48, create: () => p([term(1, 3), term(30)]) },
  factorial: { name: '階乘巨獸', art: 'enemy-art-brute', family: 'higherOrder', speed: 0.0105, reward: 72, create: () => p([term(1, 5)]) },
  emergency: { name: '高係數浪獸', art: 'enemy-art-wave', family: 'higherOrder', speed: 0.017, reward: 60, create: () => p([term(120, 1)]) },
  yOnly: { name: '純 y 摺獸', art: 'enemy-art-wave', family: 'multivariable', speed: 0.017, reward: 52, create: () => p([term(1, 0, 4), term(10)]) },
  mixed: { name: '雙變數紙獸', art: 'enemy-art-polynomial', family: 'multivariable', speed: 0.012, reward: 70, create: () => p([term(1, 2, 3), term(20)]) },
  exponential: { name: '指數飛蛾', art: 'enemy-art-exponential', family: 'exponential', speed: 0.0135, reward: 110, create: () => exponential(1, 1) },
});

const chapter = (config) => deepFreeze({
  ...config,
  board: board(config.board.rows, config.board.columns, config.board.placeableColumns),
  // Compatibility fields describe the first formal segment. New consumers
  // should use `segments` and the generated wave's `guaranteedSupply`.
  countRange: [...config.segments[0].countRange],
});

const supply = (operators, formulaIds = [], constants = []) => ({
  operators,
  formulaIds,
  constants,
});

const segment = (index, kind, countRange, families, guaranteedSupply) => ({
  index,
  kind,
  countRange,
  families,
  guaranteedSupply,
});

export const CHAPTERS = Object.freeze([
  chapter({
    id: 'foundation', name: '基礎防線', theme: '常數與低階多項式', hint: '判斷常數、一次式與二次式，把 D 放在能完成最後一次消去的位置。',
    board: { rows: 4, columns: 7, placeableColumns: 4 }, startingEnergy: 540,
    spawnInterval: 2.2, families: ['constant', 'polynomial'],
    starterOperators: ['derivative', 'derivative', 'derivative', 'derivative', 'derivative', 'subtract', 'subtract', 'subtract'],
    starterFormulaIds: ['identityK', 'doubleK', 'negateK', 'kPlus10'], starterConstants: [0, 1, 2, 5],
    segments: [
      segment(1, 'pressure', [6, 8], ['constant', 'polynomial'], supply(['derivative', 'derivative', 'derivative', 'derivative'])),
      segment(2, 'mixed', [8, 10], ['constant', 'polynomial'], supply(['derivative', 'derivative', 'derivative', 'derivative'])),
    ],
  }),
  chapter({
    id: 'factorial-crisis', name: '階乘危機', theme: '高階多項式', hint: '用 D 清理低階快敵，用 D² 高效率壓低三至五次式。',
    board: { rows: 4, columns: 8, placeableColumns: 5 }, startingEnergy: 620,
    spawnInterval: 1.95, families: ['higherOrder', 'polynomial'],
    starterOperators: ['secondDerivative', 'secondDerivative', 'secondDerivative', 'secondDerivative', 'derivative', 'derivative', 'integral', 'integral'],
    starterFormulaIds: ['identityK', 'doubleK', 'negateK', 'kPlus10'], starterConstants: [0, 1, 2, 5],
    segments: [
      segment(1, 'pressure', [8, 10], ['higherOrder'], supply(['secondDerivative', 'secondDerivative', 'secondDerivative', 'secondDerivative'])),
      segment(2, 'mixed', [10, 12], ['higherOrder', 'polynomial'], supply(['secondDerivative', 'secondDerivative', 'derivative', 'derivative'])),
    ],
  }),
  chapter({
    id: 'asymptotic-breakthrough', name: '漸近突破', theme: '單項分式', hint: 'D 無法消去負次方；用 Euler 持續反制，把無窮極限留給漏怪救場。',
    board: { rows: 5, columns: 9, placeableColumns: 5 }, startingEnergy: 1120,
    spawnInterval: 1.75, families: ['rational', 'polynomial'],
    starterOperators: ['eulerTower', 'eulerTower', 'eulerTower', 'eulerTower', 'eulerTower', 'limit', 'derivative', 'derivative'],
    starterFormulaIds: ['identityK', 'identityK', 'identityK', 'identityK', 'identityK'], starterConstants: [1, 1, 1, 1, 1],
    segments: [
      segment(1, 'pressure', [7, 9], ['rational'], supply(
        ['eulerTower', 'eulerTower', 'eulerTower', 'eulerTower', 'eulerTower'],
        ['identityK', 'identityK', 'identityK', 'identityK', 'identityK'], [1, 1, 1, 1, 1],
      )),
      segment(2, 'mixed', [9, 11], ['rational', 'polynomial'], supply(
        ['eulerTower', 'eulerTower', 'eulerTower', 'derivative', 'derivative'],
        ['identityK', 'identityK', 'identityK'], [1, 1, 1],
      )),
    ],
  }),
  chapter({
    id: 'composition', name: '組合推導', theme: '對數、分式與高階式', hint: '依路線排出兩步塔序：例如先微分對數，再交給參數 1 的 Euler 塔。',
    board: { rows: 5, columns: 10, placeableColumns: 6 }, startingEnergy: 1180,
    spawnInterval: 1.55, families: ['logarithmic', 'rational', 'higherOrder', 'multivariable'],
    starterOperators: ['derivative', 'eulerTower', 'eulerTower', 'eulerTower', 'secondDerivative', 'secondDerivative', 'evaluateTower', 'partial'],
    starterFormulaIds: ['identityK', 'identityK', 'identityK'], starterConstants: [1, 1, 2],
    segments: [
      segment(1, 'pressure', [10, 12], ['logarithmic', 'rational', 'higherOrder'], supply(
        ['derivative', 'eulerTower', 'eulerTower', 'eulerTower', 'secondDerivative'],
        ['identityK', 'identityK', 'identityK'], [1, 1, 2],
      )),
      segment(2, 'mixed', [12, 14], ['logarithmic', 'rational', 'higherOrder', 'multivariable'], supply(
        ['derivative', 'eulerTower', 'eulerTower', 'eulerTower', 'secondDerivative', 'secondDerivative'],
        ['identityK', 'identityK', 'identityK'], [1, 1, 2],
      )),
    ],
  }),
  chapter({
    id: 'periodic-defense', name: '週期防線', theme: '單頻三角式', hint: '讀出每路頻率，為共振塔裝上 b²；同頻 sin 與 cos 共用同一參數。',
    board: { rows: 6, columns: 11, placeableColumns: 7 }, startingEnergy: 1500,
    spawnInterval: 1.38, families: ['trigonometric', 'rational'],
    starterOperators: ['resonanceTower', 'resonanceTower', 'resonanceTower', 'resonanceTower', 'resonanceTower', 'resonanceTower', 'definiteIntegralTower', 'derivative'],
    starterFormulaIds: ['kSquared', 'kSquared', 'kSquared', 'kSquared', 'kSquared', 'kSquared'], starterConstants: [1, 1, 1, 2, 2, 2],
    segments: [
      segment(1, 'pressure', [10, 12], ['trigonometric'], supply(
        ['resonanceTower', 'resonanceTower', 'resonanceTower', 'resonanceTower', 'resonanceTower', 'resonanceTower'],
        ['kSquared', 'kSquared', 'kSquared', 'kSquared', 'kSquared', 'kSquared'], [1, 1, 1, 2, 2, 2],
      )),
      segment(2, 'mixed', [12, 14], ['trigonometric', 'rational'], supply(
        ['resonanceTower', 'resonanceTower', 'resonanceTower', 'resonanceTower', 'eulerTower', 'eulerTower'],
        ['kSquared', 'kSquared', 'kSquared', 'kSquared', 'identityK', 'identityK'], [1, 1, 2, 2, 1, 2],
      )),
    ],
  }),
  chapter({
    id: 'exponential-duel', name: '指數交鋒', theme: '成長與衰減指數', hint: '三角用 +b²，指數用 −b²；衰減可取極限，成長式必須先反射或共振。',
    board: { rows: 6, columns: 12, placeableColumns: 7 }, startingEnergy: 1500,
    spawnInterval: 1.22, families: ['exponential', 'trigonometric'],
    starterOperators: ['resonanceTower', 'resonanceTower', 'resonanceTower', 'resonanceTower', 'resonanceTower', 'resonanceTower', 'reflect', 'limit'],
    starterFormulaIds: ['negSquareK', 'negSquareK', 'negSquareK', 'negSquareK', 'negSquareK', 'negSquareK'], starterConstants: [1, 1, 1, 2, 2, 2],
    segments: [
      segment(1, 'pressure', [12, 14], ['exponential'], supply(
        ['resonanceTower', 'resonanceTower', 'resonanceTower', 'resonanceTower', 'resonanceTower', 'resonanceTower'],
        ['negSquareK', 'negSquareK', 'negSquareK', 'negSquareK', 'negSquareK', 'negSquareK'], [1, 1, 1, 2, 2, 2],
      )),
      segment(2, 'mixed', [14, 16], ['exponential', 'trigonometric'], supply(
        ['resonanceTower', 'resonanceTower', 'resonanceTower', 'resonanceTower', 'resonanceTower', 'resonanceTower'],
        ['negSquareK', 'negSquareK', 'negSquareK', 'negSquareK', 'kSquared', 'kSquared'], [1, 1, 2, 2, 1, 2],
      )),
    ],
  }),
]);

export const ENDLESS_CHAPTER = chapter({
  id: 'endless', name: '無限證明', theme: '無限', hint: '所有函數族都可能出現；讓現有防線適應每次新的命題。',
  board: { rows: 7, columns: 12, placeableColumns: 7 }, startingEnergy: 1100,
  spawnInterval: 1.12,
  families: ['polynomial', 'constant', 'higherOrder', 'multivariable', 'rational', 'logarithmic', 'trigonometric', 'exponential'],
  starterOperators: ['derivative', 'secondDerivative', 'definiteIntegralTower', 'limit', 'reflect', 'evaluateTower', 'eulerTower', 'resonanceTower'],
  starterFormulaIds: ['identityK', 'doubleK', 'kSquared', 'negSquareK'], starterConstants: [0, 1, 2, Math.PI],
  segments: [segment(1, 'endless', [14, 36], [
    'polynomial', 'constant', 'higherOrder', 'multivariable', 'rational',
    'logarithmic', 'trigonometric', 'exponential',
  ], supply([]))],
});

// Compatibility exports while the presentation layer migrates to dynamic boards.
export const BOARD = CHAPTERS[0].board;
export const WAVES = CHAPTERS;

export const INTEGRATION_CONSTANTS = deepFreeze([-10, -5, 0, 5, 10]);
export const GOD_CONSTANT_VALUES = deepFreeze([-10, -7, -5, -3, -2, -1, 0, 1, 2, 3, 5, 7, 10, -Math.PI, Math.PI]);

export const FORMULA_CARDS = deepFreeze([
  { id: 'identityK', label: 'k', evaluate: ({ k }) => k },
  { id: 'kPlus10', label: 'k + 10', evaluate: ({ k }) => k + 10 },
  { id: 'kMinus5', label: 'k − 5', evaluate: ({ k }) => k - 5 },
  { id: 'doubleK', label: '2k', evaluate: ({ k }) => 2 * k },
  { id: 'negateK', label: '−k', evaluate: ({ k }) => -k },
  { id: 'kSquaredMinus5', label: 'k² − 5', evaluate: ({ k }) => k ** 2 - 5 },
  { id: 'tripleK', label: '3k', evaluate: ({ k }) => 3 * k },
  { id: 'kPlus5', label: 'k + 5', evaluate: ({ k }) => k + 5 },
  { id: 'tenMinusK', label: '10 − k', evaluate: ({ k }) => 10 - k },
  { id: 'kSquared', label: 'k²', evaluate: ({ k }) => k ** 2 },
  { id: 'negSquareK', label: '−k²', evaluate: ({ k }) => -(k ** 2) },
  { id: 'doubleKPlus2', label: '2k + 2', evaluate: ({ k }) => 2 * k + 2 },
]);
