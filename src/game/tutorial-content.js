import {
  cloneExpression,
  exponential,
  logarithm,
  polynomial,
  trigonometric,
} from '../domain/expression.js';

const term = (coefficient, xPower = 0, yPower = 0) => ({ coefficient, xPower, yPower });
const p = (...terms) => polynomial(terms);

export const ENEMY_GUIDES = Object.freeze({
  polynomial: {
    id: 'polynomial', label: '多項式', name: '次方墨兔', art: 'enemy-art-polynomial', sample: 'x² + 2x',
    description: '由不同正整數次方組成；微分會降低一次方，但中間係數可能先變大。',
    clue: '觀察最高次方，預留把最後常數再微分一次的時間。',
  },
  'affix-fast': {
    id: 'affix-fast', label: '變異・快進', name: '快進徽章', art: 'enemy-art-polynomial', sample: '移速 ×1.35',
    description: '帶有快進徽章的敵人移動更快，但消去獎勵也會提高。',
    clue: '優先處理快進目標，避免它越過正在攻擊其他敵人的砲台。',
  },
  constant: {
    id: 'constant', label: '常數項', name: '常數背包獸', art: 'enemy-art-polynomial', sample: 'x² + 5',
    description: '變數項消失後，背包中的常數仍然會繼續前進並造成傷害。',
    clue: '用 D² 跳過中間係數，或用正確平移精準消去常數。',
  },
  higherOrder: {
    id: 'higherOrder', label: '高階多項式', name: '階乘巨獸', art: 'enemy-art-brute', sample: 'x⁵',
    description: '高次方會在連續微分時產生很大的階乘係數，錯過就可能重創基地。',
    clue: 'D² 能一次跨過兩階；奇函數也能利用對稱上下界做定積分。',
  },
  multivariable: {
    id: 'multivariable', label: '多變數', name: '雙變數紙獸', art: 'enemy-art-wave', sample: 'x²y',
    description: '對 x 微分時，y 會被視為常數；只含 y 的項對 x 微分會直接歸零。',
    clue: '使用 ∂/∂x，或把 x 代入一個能成為根的數值。',
  },
  'affix-shield': {
    id: 'affix-shield', label: '變異・等式護盾', name: '等式護盾', art: 'enemy-art-wave', sample: 'xy',
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
    clue: '先 D，再 lim∞；Euler 塔裝入 0 也能把它化為常數。',
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
    clue: '用 D²−b²I 共振消去，或先反射成衰減指數再取極限。',
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

const tutorial = (config) => Object.freeze({
  ...config,
  enemyGuideIds: Object.freeze([...config.enemyGuideIds]),
  starterOperators: Object.freeze([...config.starterOperators]),
  starterFormulaIds: Object.freeze([...config.starterFormulaIds]),
  starterConstants: Object.freeze([...config.starterConstants]),
  presetTowers: Object.freeze(config.presetTowers.map((tower) => Object.freeze({ ...tower }))),
  entries: Object.freeze(config.entries.map((enemy) => Object.freeze({ ...enemy }))),
});

export const CHAPTER_TUTORIALS = Object.freeze([
  tutorial({
    id: 'polynomial-basics', objective: '觀察微分砲如何逐階降低次方，並優先處理快進敵人。',
    enemyGuideIds: ['polynomial', 'affix-fast'],
    starterOperators: ['derivative', 'derivative', 'derivative', 'subtract', 'subtract', 'derivative', 'derivative', 'subtract'],
    starterFormulaIds: ['identityK', 'identityK', 'kPlus10', 'doubleK'], starterConstants: [0, 1, 2, 5],
    presetTowers: [
      { typeId: 'derivative', row: 0, column: 1 },
      { typeId: 'derivative', row: 1, column: 1 },
    ],
    entries: [
      entry('polynomial', 0, 0, () => p(term(1, 1))),
      entry('polynomial', 1, 3.5, () => p(term(1, 2)), { affixes: ['fast'], speed: 0.008 }),
    ],
  }),
  tutorial({
    id: 'constant-basics', objective: '用 D² 跳過危險係數；記住最後的常數仍必須化為 0。',
    enemyGuideIds: ['constant'],
    starterOperators: ['secondDerivative', 'secondDerivative', 'integral', 'integral', 'derivative', 'derivative', 'subtract', 'subtract'],
    starterFormulaIds: ['identityK', 'kPlus10', 'kMinus5', 'doubleK'], starterConstants: [-5, 0, 2, 5],
    presetTowers: [
      { typeId: 'secondDerivative', row: 0, column: 1 },
      { typeId: 'secondDerivative', row: 1, column: 1 },
    ],
    entries: [
      entry('constant', 0, 0, () => p(term(1, 2), term(2))),
      entry('constant', 1, 4, () => p(term(2, 1), term(3))),
    ],
  }),
  tutorial({
    id: 'higher-order-basics', objective: '比較 D² 與對稱定積分，安全消去高階奇函數。',
    enemyGuideIds: ['higherOrder'],
    starterOperators: ['secondDerivative', 'secondDerivative', 'definiteIntegralTower', 'derivative', 'derivative', 'integral', 'subtract', 'secondDerivative'],
    starterFormulaIds: ['identityK', 'negateK', 'kSquared', 'doubleK'], starterConstants: [-1, 0, 1, 2],
    presetTowers: [
      { typeId: 'definiteIntegralTower', row: 0, column: 1, lowerBound: -1, upperBound: 1 },
      { typeId: 'secondDerivative', row: 1, column: 1 },
    ],
    entries: [
      entry('higherOrder', 0, 0, () => p(term(1, 3))),
      entry('higherOrder', 1, 5, () => p(term(1, 5)), { speed: 0.0065 }),
    ],
  }),
  tutorial({
    id: 'multivariable-basics', objective: '先用 f(0) 把外層 xy 護盾式化成 0，再用下一發消去相同的本體式。',
    enemyGuideIds: ['multivariable', 'affix-shield'],
    starterOperators: ['partial', 'evaluateTower', 'evaluateTower', 'derivative', 'derivative', 'secondDerivative', 'integral', 'definiteIntegralTower'],
    starterFormulaIds: ['identityK', 'identityK', 'doubleK', 'negateK'], starterConstants: [0, 0, 1, 2],
    presetTowers: [
      { typeId: 'evaluateTower', row: 0, column: 1, parameter: 0 },
      { typeId: 'evaluateTower', row: 1, column: 1, parameter: 0 },
    ],
    entries: [
      entry('multivariable', 0, 0, () => p(term(1, 1, 1)), { affixes: ['shield'] }),
      entry('multivariable', 1, 4, () => p(term(1, 2, 1))),
    ],
  }),
  tutorial({
    id: 'asymptotic-basics', objective: '用 Euler、微分與無窮極限處理分式、對數與分裂。',
    enemyGuideIds: ['rational', 'logarithmic', 'affix-split'],
    starterOperators: ['limit', 'limit', 'limit', 'eulerTower', 'eulerTower', 'derivative', 'derivative', 'evaluateTower'],
    starterFormulaIds: ['identityK', 'identityK', 'negateK', 'kSquared'], starterConstants: [0, 1, 2, 2],
    presetTowers: [
      { typeId: 'eulerTower', row: 0, column: 1, parameter: 2 },
      { typeId: 'derivative', row: 1, column: 1 },
      { typeId: 'eulerTower', row: 2, column: 1, parameter: 1 },
      { typeId: 'eulerTower', row: 2, column: 2, parameter: 2 },
    ],
    entries: [
      entry('rational', 0, 0, () => p(term(1, -2))),
      entry('logarithmic', 1, 4.5, () => logarithm(1)),
      entry('rational', 2, 9, () => p(term(1, -1), term(1, -2)), {
        affixes: ['split'],
        splitExpressionFactories: [() => p(term(1, -1)), () => p(term(1, -2))],
      }),
    ],
  }),
  tutorial({
    id: 'resonance-basics', objective: '配對頻率平方消去週期與指數，也可嘗試反射後取極限。',
    enemyGuideIds: ['trigonometric', 'exponential'],
    starterOperators: ['resonanceTower', 'resonanceTower', 'reflect', 'limit', 'reflect', 'limit', 'secondDerivative', 'definiteIntegralTower'],
    starterFormulaIds: ['identityK', 'kSquared', 'negSquareK', 'doubleK'], starterConstants: [0, 1, 2, -1],
    presetTowers: [
      { typeId: 'resonanceTower', row: 0, column: 1, parameter: 4 },
      { typeId: 'resonanceTower', row: 1, column: 1, parameter: -1 },
    ],
    entries: [
      entry('trigonometric', 0, 0, () => trigonometric('sin', 2, 1)),
      entry('exponential', 1, 4.5, () => exponential(1, 1)),
    ],
  }),
]);

export function chapterTutorial(chapterIndex) {
  const config = CHAPTER_TUTORIALS[chapterIndex];
  if (!config) throw new RangeError(`chapterIndex must be between 0 and ${CHAPTER_TUTORIALS.length - 1}`);
  return config;
}

export function generateTutorialWave(chapterIndex) {
  const config = chapterTutorial(chapterIndex);
  const entries = config.entries.map((fixture, index) => {
    const guide = ENEMY_GUIDES[fixture.family];
    const expression = fixture.createExpression();
    return {
      id: `tutorial-${chapterIndex}-${index}`,
      spawnAt: fixture.spawnAt,
      row: fixture.row,
      typeId: `tutorial-${fixture.family}`,
      name: guide?.name ?? '教學函數',
      art: guide?.art ?? 'enemy-art-polynomial',
      family: fixture.family,
      expression: cloneExpression(expression),
      speed: fixture.speed,
      reward: fixture.reward,
      affixes: [...fixture.affixes],
      splitExpressions: (fixture.splitExpressionFactories ?? []).map((factory) => cloneExpression(factory())),
    };
  });
  const families = [...new Set(entries.map((enemy) => enemy.family))];
  return {
    id: `tutorial-${config.id}`,
    kind: 'tutorial',
    name: `第 ${chapterIndex + 1} 章・教學波`,
    hint: config.objective,
    objective: config.objective,
    theme: '固定演練',
    chapterIndex,
    endlessRound: 0,
    entries,
    requiredTags: families,
    summary: {
      total: entries.length,
      families: families.map((id) => ({
        id,
        label: ENEMY_GUIDES[id]?.label ?? id,
        count: entries.filter((enemy) => enemy.family === id).length,
      })),
      mutationCount: entries.reduce((total, enemy) => total + enemy.affixes.length, 0),
      danger: '教學',
    },
  };
}
