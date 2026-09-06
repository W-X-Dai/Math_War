import {
  exponential,
  logarithm,
  polynomial,
  trigonometric,
} from '../domain/expression.js';
import { deepFreeze } from './freeze.js';
import { GAMEPLAY_CONFIG } from './gameplay.js';

const term = (coefficient, xPower = 0, yPower = 0) => ({ coefficient, xPower, yPower });
const p = (...terms) => polynomial(terms);

export const ENEMY_GUIDES = deepFreeze({
  polynomial: {
    id: 'polynomial', label: '多項式', name: '次方墨兔', art: 'enemy-art-polynomial', sample: 'x² + 2x',
    description: '由不同正整數次方組成；微分會降低一次方，但中間係數可能先變大。',
    clue: '觀察最高次方，預留把最後常數再微分一次的時間。',
  },
  'affix-fast': {
    id: 'affix-fast', label: '變異・快進', name: '快進徽章', art: 'enemy-art-polynomial', sample: `移速 ×${GAMEPLAY_CONFIG.combat.fastAffixSpeedMultiplier}`,
    description: '帶有快進徽章的敵人移動更快，但消去獎勵也會提高。',
    clue: '優先處理快進目標，避免它越過正在攻擊其他敵人的砲台。',
  },
  constant: {
    id: 'constant', label: '常數', name: '常數背包獸', art: 'enemy-art-polynomial', sample: '−3',
    description: '最簡單的怪物只有一個帶正負號的數字；要把這個數字精準化為 0。',
    clue: '正數用減法，負數用加法；刻寫與絕對值相同的數字即可消去。',
  },
  higherOrder: {
    id: 'higherOrder', label: '高階多項式', name: '階乘巨獸', art: 'enemy-art-brute', sample: 'x⁵',
    description: '高次方會在連續微分時產生很大的階乘係數，錯過就可能重創基地。',
    clue: 'D² 能一次跨過兩階；奇函數也能利用對稱上下界做定積分。',
  },
  multivariable: {
    id: 'multivariable', label: '多變數', name: '雙變數紙獸', art: 'enemy-art-wave', sample: 'x²z',
    description: 'D 只對 x 微分；高耗能的全場捲軸則對 z 偏微分，適合同時壓低多變數項的 z 次方。',
    clue: 'z 只改變讀法，不增加 x 方向的消去階數；可依相同 x 次方安排 D，或蓄算力用 ∂/∂z。',
  },
  'affix-shield': {
    id: 'affix-shield', label: '變異・等式護盾', name: '等式護盾', art: 'enemy-art-wave', sample: 'xz',
    description: '護盾會把一份獨立的式子卡疊在本體上；算子會先改寫護盾式，歸零後才露出本體。',
    clue: '護盾式起始為本體式的複本。先把外層化成 0，下一發才會作用在本體。',
  },
  rational: {
    id: 'rational', label: '分式', name: '漸近潛獸', art: 'enemy-art-wave', sample: 'x⁻²',
    description: '負次方在 x 趨近無窮時會歸零，也能被匹配次方的 Euler 算子消去。',
    clue: 'x⁻ⁿ 對應 xD+nI；或直接使用無窮極限。',
  },
  logarithmic: {
    id: 'logarithmic', label: '對數', name: '對數捲獸', art: 'enemy-art-brute', sample: 'ln|x|',
    description: '對數在無窮遠會發散，但微分一次會變成可以取極限的 1/x。',
    clue: '刻寫 f(1) 可直接利用 ln|1|=0，避免自動砲台連續改寫目標。',
  },
  'affix-split': {
    id: 'affix-split', label: '變異・分裂', name: '分裂徽章', art: 'enemy-art-brute', sample: '歸零後分成兩項',
    description: '多項敵人歸零後會拆成兩隻單項敵人；子代不會再次分裂。',
    clue: '先確認同一路仍有後續火力，不要把分裂當成立即清場。',
  },
  trigonometric: {
    id: 'trigonometric', label: '三角函數', name: '週期浪獸', art: 'enemy-art-wave', sample: 'sin(2x)',
    description: '週期函數不會在無窮遠收斂，直接使用極限會觸發暴走。',
    clue: 'D²+b²I 能消去頻率 b；完整週期定積分也是替代解。',
  },
  exponential: {
    id: 'exponential', label: '指數函數', name: '指數飛蛾', art: 'enemy-art-exponential', sample: 'eˣ',
    description: '微分只會改變係數，不會自然變成零；正指數在無窮遠還會發散。',
    clue: '用 D²−b²I 消去；衰減指數可直接取極限，成長指數則要先反射或用共振。',
  },
});

const entry = (family, row, spawnAt, createExpression, overrides = {}) => ({
  family,
  row,
  spawnAt,
  createExpression,
  affixes: [],
  speed: 0.0075,
  reward: 20,
  ...overrides,
});

const tutorial = (config) => ({
  ...config,
  enemyGuideIds: [...config.enemyGuideIds],
  starterOperators: [...config.starterOperators],
  starterFormulaIds: [...config.starterFormulaIds],
  starterConstants: [...config.starterConstants],
  presetTowers: config.presetTowers.map((tower) => ({ ...tower })),
  entries: config.entries.map((enemy) => ({ ...enemy })),
});

export const CHAPTER_TUTORIALS = deepFreeze([
  tutorial({
    id: 'foundation-recognition', objective: '辨認正負常數，分別用加法與減法把數字精準化為 0。',
    enemyGuideIds: ['constant'],
    starterOperators: ['add', 'subtract'],
    starterFormulaIds: ['identityK', 'identityK', 'identityK'], starterConstants: [2, 3, 4],
    presetTowers: [],
    entries: [
      entry('constant', 0, 0, () => p(term(2))),
      entry('constant', 1, 3.5, () => p(term(-3))),
      entry('constant', 0, 7, () => p(term(4))),
    ],
  }),
  tutorial({
    id: 'factorial-recognition', objective: '比較 D、D² 與 √ 的降階速度；大型算術捲軸先做前處理，最後仍要化為 0。',
    enemyGuideIds: ['higherOrder', 'polynomial'],
    starterOperators: ['secondDerivative', 'secondDerivative', 'integral', 'integral', 'derivative', 'derivative', 'subtract', 'subtract'],
    starterFormulaIds: ['identityK', 'doubleK', 'negateK'], starterConstants: [0, 1, 2],
    presetTowers: [
      { typeId: 'secondDerivative', row: 0, column: 1 },
      { typeId: 'derivative', row: 1, column: 1 },
    ],
    entries: [
      entry('higherOrder', 0, 0, () => p(term(1, 4))),
      entry('higherOrder', 0, 5, () => p(term(1, 5)), { speed: 0.0065 }),
      entry('polynomial', 1, 9, () => p(term(1, 2))),
    ],
  }),
  tutorial({
    id: 'asymptotic-recognition', objective: '確認 D 無法消去 x⁻¹，為兩隻分式各刻寫一張參數 1 的 Euler 捲軸。',
    enemyGuideIds: ['rational', 'polynomial'],
    starterOperators: ['eulerTower', 'eulerTower', 'limit', 'limit', 'derivative', 'derivative', 'secondDerivative', 'integral'],
    starterFormulaIds: ['identityK', 'identityK', 'kSquared'], starterConstants: [1, 1, 2],
    presetTowers: [
      { typeId: 'derivative', row: 1, column: 1 },
    ],
    entries: [
      entry('rational', 0, 0, () => p(term(1, -1))),
      entry('rational', 0, 5, () => p(term(-2, -1))),
      entry('polynomial', 1, 9, () => p(term(1, 2))),
    ],
  }),
  tutorial({
    id: 'composition-recognition', objective: '練習用 f(1) 直接消去對數、用 Euler 捲軸消去分式，並以 D² 處理多變數。',
    enemyGuideIds: ['logarithmic', 'rational', 'multivariable'],
    starterOperators: ['derivative', 'eulerTower', 'eulerTower', 'secondDerivative', 'evaluateTower', 'partial', 'derivative', 'secondDerivative'],
    starterFormulaIds: ['identityK', 'identityK', 'identityK'], starterConstants: [1, 1, 2],
    presetTowers: [
      { typeId: 'secondDerivative', row: 2, column: 1 },
    ],
    entries: [
      entry('logarithmic', 0, 0, () => logarithm(1)),
      entry('rational', 1, 5, () => p(term(1, -2))),
      entry('multivariable', 2, 10, () => p(term(1, 4, 2))),
    ],
  }),
  tutorial({
    id: 'periodic-recognition', objective: '辨認頻率 1 與 2，為每隻敵人刻寫對應的正平方共振捲軸。',
    enemyGuideIds: ['trigonometric'],
    starterOperators: ['resonanceTower', 'resonanceTower', 'resonanceTower', 'definiteIntegralTower', 'derivative', 'secondDerivative', 'limit', 'integral'],
    starterFormulaIds: ['kSquared', 'kSquared', 'kSquared'], starterConstants: [1, 2, 2],
    presetTowers: [],
    entries: [
      entry('trigonometric', 0, 0, () => trigonometric('sin', 1, 1)),
      entry('trigonometric', 1, 4.5, () => trigonometric('cos', 2, 1)),
      entry('trigonometric', 1, 9, () => ({
        ...trigonometric('sin', 2, 1),
        trigTerms: [
          { kind: 'sin', rate: 2, coefficient: 1 },
          { kind: 'cos', rate: 2, coefficient: 1 },
        ],
      })),
    ],
  }),
  tutorial({
    id: 'exponential-recognition', objective: '分辨三角的正平方與指數的負平方捲軸；成長指數不能直接取極限。',
    enemyGuideIds: ['trigonometric', 'exponential'],
    starterOperators: ['resonanceTower', 'resonanceTower', 'reflect', 'limit', 'reflect', 'limit', 'secondDerivative', 'derivative'],
    starterFormulaIds: ['negSquareK', 'negSquareK', 'kSquared'], starterConstants: [1, 2, 1],
    presetTowers: [],
    entries: [
      entry('exponential', 0, 0, () => exponential(1, 1)),
      entry('exponential', 1, 4.5, () => exponential(-2, 1)),
      entry('trigonometric', 2, 9, () => trigonometric('sin', 1, 1)),
    ],
  }),
]);
