import { deepFreeze } from './freeze.js';

/**
 * Developer-tunable parameters for procedural enemy and wave generation.
 *
 * Finite lane roles are declarative: a role fixes the counter-relevant family,
 * power/frequency range, and parameter for the whole segment. Generated waves
 * expose concrete guarantees as `{ operators, formulaIds, constants }`; each
 * formulaId and constant at the same position can assemble the needed value.
 */
export const GENERATION_CONFIG = deepFreeze({
  families: {
    polynomial: { label: '低階多項式', name: '次方墨兔', art: 'enemy-art-polynomial', speed: 0.020, reward: 28 },
    constant: { label: '常數', name: '常數背包獸', art: 'enemy-art-polynomial', speed: 0.0165, reward: 40 },
    higherOrder: { label: '高階多項式', name: '階乘巨獸', art: 'enemy-art-brute', speed: 0.0115, reward: 62 },
    multivariable: { label: '多變數變體', name: '雙變數紙獸', art: 'enemy-art-wave', speed: 0.014, reward: 68 },
    rational: { label: '分式', name: '漸近潛獸', art: 'enemy-art-wave', speed: 0.017, reward: 74 },
    logarithmic: { label: '對數', name: '對數捲獸', art: 'enemy-art-brute', speed: 0.0135, reward: 84 },
    trigonometric: { label: '三角函數', name: '週期浪獸', art: 'enemy-art-wave', speed: 0.016, reward: 94 },
    exponential: { label: '指數函數', name: '指數飛蛾', art: 'enemy-art-exponential', speed: 0.0135, reward: 110 },
  },
  expressions: {
    coefficient: { defaultMaximum: 4, negativeChance: 0.25 },
    polynomial: { power: { minimum: 1, maximum: 2 } },
    constant: { coefficientMaximum: 6 },
    higherOrder: { power: { minimum: 3, maximum: 5 }, coefficientMaximum: 3 },
    multivariable: {
      xPower: { minimum: 3, maximum: 5 },
      yPower: { minimum: 1, maximum: 3 },
      coefficientMaximum: 3,
    },
    rational: { powers: [-1, -2], coefficientMaximum: 4 },
    logarithmic: { coefficientMaximum: 3 },
    trigonometric: { frequencies: [1, 2], coefficientMaximum: 3 },
    exponential: { rates: [-2, -1, 1, 2], coefficientMaximum: 3 },
  },
  rewards: {
    finite: { baseMultiplier: 1, perChapter: 0.06 },
    endless: { baseMultiplier: 1, perRound: 0.045, maximumRoundBonus: 1.5 },
    affixMultipliers: { fast: 1.2, shield: 1.25 },
  },
  spawn: {
    packSize: { minimum: 2, maximum: 3 },
    packGapSeconds: 0.85,
    regroupSeconds: 5,
    mixedPairGapSeconds: 0.85,
    timePrecision: 3,
  },
  danger: {
    enemyCountWeight: 1,
    mutationWeight: 1.5,
    averageDamageWeight: 0.22,
    tiers: [
      { maximumExclusive: 11, label: '低' },
      { maximumExclusive: 18, label: '中' },
      { maximumExclusive: 27, label: '高' },
    ],
    maximumLabel: '極高',
  },
  finite: {
    speed: { baseMultiplier: 1, perChapter: 0.025 },
    affixChance: 0.34,
    // One role per lane. Repeated blueprints are rotated by seed, but their
    // counter signature never changes inside one segment.
    roles: [
      {
        pressure: [
          { family: 'constant', coefficient: 1, powerRange: [0, 0], counter: { operatorIds: ['subtract'], parameters: [1] } },
          { family: 'constant', coefficient: -1, powerRange: [0, 0], counter: { operatorIds: ['add'], parameters: [1] } },
          { family: 'constant', coefficient: 2, powerRange: [0, 0], counter: { operatorIds: ['subtract'], parameters: [2] } },
          { family: 'constant', coefficient: -2, powerRange: [0, 0], counter: { operatorIds: ['add'], parameters: [2] } },
        ],
        mixed: [
          { family: 'constant', coefficient: 3, powerRange: [0, 0], counter: { operatorIds: ['subtract'], parameters: [3] } },
          { family: 'constant', coefficient: -3, powerRange: [0, 0], counter: { operatorIds: ['add'], parameters: [3] } },
          { family: 'constant', coefficient: 4, powerRange: [0, 0], counter: { operatorIds: ['subtract'], parameters: [4] } },
          { family: 'constant', coefficient: -4, powerRange: [0, 0], counter: { operatorIds: ['add'], parameters: [4] } },
        ],
      },
      {
        pressure: Array.from({ length: 4 }, () => (
          { family: 'higherOrder', powerRange: [3, 5], counter: { operatorIds: ['secondDerivative'] } }
        )),
        mixed: [
          { family: 'higherOrder', powerRange: [3, 5], counter: { operatorIds: ['secondDerivative'] } },
          { family: 'polynomial', powerRange: [1, 2], possibleAffixes: ['fast'], counter: { operatorIds: ['derivative'] } },
          { family: 'higherOrder', powerRange: [3, 5], counter: { operatorIds: ['secondDerivative'] } },
          { family: 'polynomial', powerRange: [1, 2], possibleAffixes: ['fast'], counter: { operatorIds: ['derivative'] } },
        ],
      },
      {
        pressure: Array.from({ length: 5 }, () => (
          { family: 'rational', powerRange: [-1, -1], parameter: 1, counter: { operatorIds: ['eulerTower'], parameters: [1] } }
        )),
        mixed: [
          { family: 'rational', powerRange: [-1, -1], parameter: 1, possibleAffixes: ['fast'], counter: { operatorIds: ['eulerTower'], parameters: [1] } },
          { family: 'polynomial', powerRange: [1, 2], possibleAffixes: ['fast'], counter: { operatorIds: ['derivative'] } },
          { family: 'rational', powerRange: [-1, -1], parameter: 1, possibleAffixes: ['fast'], counter: { operatorIds: ['eulerTower'], parameters: [1] } },
          { family: 'polynomial', powerRange: [1, 2], possibleAffixes: ['fast'], counter: { operatorIds: ['derivative'] } },
          { family: 'rational', powerRange: [-1, -1], parameter: 1, possibleAffixes: ['fast'], counter: { operatorIds: ['eulerTower'], parameters: [1] } },
        ],
      },
      {
        pressure: [
          { family: 'logarithmic', powerRange: [0, 0], counter: { operatorIds: ['evaluateTower'], parameters: [1] } },
          { family: 'rational', powerRange: [-1, -1], parameter: 1, counter: { operatorIds: ['eulerTower'], parameters: [1] } },
          { family: 'rational', powerRange: [-2, -2], parameter: 2, counter: { operatorIds: ['eulerTower'], parameters: [2] } },
          { family: 'higherOrder', powerRange: [3, 5], counter: { operatorIds: ['secondDerivative'] } },
          { family: 'higherOrder', powerRange: [3, 5], counter: { operatorIds: ['secondDerivative'] } },
        ],
        mixed: [
          { family: 'logarithmic', powerRange: [0, 0], counter: { operatorIds: ['evaluateTower'], parameters: [1] } },
          { family: 'rational', powerRange: [-1, -1], parameter: 1, possibleAffixes: ['shield'], counter: { operatorIds: ['eulerTower'], parameters: [1] } },
          { family: 'rational', powerRange: [-2, -2], parameter: 2, counter: { operatorIds: ['eulerTower'], parameters: [2] } },
          { family: 'higherOrder', powerRange: [3, 5], possibleAffixes: ['shield'], counter: { operatorIds: ['secondDerivative'] } },
          { family: 'multivariable', powerRange: [3, 5], yPowerRange: [1, 3], counter: { operatorIds: ['secondDerivative'] } },
        ],
      },
      {
        pressure: [1, 2, 1, 2, 1, 2].map((frequency) => ({
          family: 'trigonometric', frequencyRange: [frequency, frequency], frequency,
          form: 'single', counter: { operatorIds: ['resonanceTower'], parameters: [frequency ** 2] },
        })),
        mixed: [
          ...[1, 2, 1, 2].map((frequency) => ({
            family: 'trigonometric', frequencyRange: [frequency, frequency], frequency,
            form: 'mixed', possibleAffixes: ['split'], counter: { operatorIds: ['resonanceTower'], parameters: [frequency ** 2] },
          })),
          { family: 'rational', powerRange: [-1, -1], parameter: 1, counter: { operatorIds: ['eulerTower'], parameters: [1] } },
          { family: 'rational', powerRange: [-2, -2], parameter: 2, counter: { operatorIds: ['eulerTower'], parameters: [2] } },
        ],
      },
      {
        pressure: [-1, 1, -2, 2, -1, 2].map((rate) => ({
          family: 'exponential', frequencyRange: [rate, rate], rate,
          counter: { operatorIds: ['resonanceTower'], parameters: [-(rate ** 2)] },
        })),
        mixed: [
          ...[-1, 1, -2, 2].map((rate) => ({
            family: 'exponential', frequencyRange: [rate, rate], rate,
            possibleAffixes: ['fast', 'shield'], counter: { operatorIds: ['resonanceTower'], parameters: [-(rate ** 2)] },
          })),
          { family: 'trigonometric', frequencyRange: [1, 1], frequency: 1, form: 'mixed', possibleAffixes: ['split'], counter: { operatorIds: ['resonanceTower'], parameters: [1] } },
          { family: 'trigonometric', frequencyRange: [2, 2], frequency: 2, form: 'mixed', possibleAffixes: ['split'], counter: { operatorIds: ['resonanceTower'], parameters: [4] } },
        ],
      },
    ],
  },
  endless: {
    baseline: {
      count: 14,
      packSize: 1,
      simultaneousLanes: 1,
      allowedAffixes: [],
      affixChance: 0.3,
      maxAffixes: 1,
      speedMultiplier: 1,
      maxItems: 2,
      maxPower: 5,
      eliteMaxFrequency: 2,
      mixedFrequencyElite: false,
    },
    introductions: [
      { round: 2, axis: 'packs', patch: { packSize: 2 } },
      { round: 3, axis: 'simultaneousLanes', patch: { simultaneousLanes: 2 } },
      { round: 4, axis: 'fast', addAffix: 'fast' },
      { round: 5, axis: 'shield', addAffix: 'shield' },
      { round: 6, axis: 'split', addAffix: 'split' },
      { round: 7, axis: 'speed', patch: { speedMultiplier: 1.1 } },
      { round: 8, axis: 'items', patch: { maxItems: 3 } },
      { round: 9, axis: 'power', patch: { maxPower: 6 } },
      { round: 10, axis: 'mixedFrequencyElite', patch: { mixedFrequencyElite: true } },
      { round: 11, axis: 'doubleAffix', patch: { maxAffixes: 2 } },
    ],
    rotation: ['count', 'speedMultiplier', 'maxItems', 'maxPower', 'eliteMaxFrequency', 'affixChance'],
    increments: {
      count: { amount: 2, maximum: 36 },
      speedMultiplier: { amount: 0.08, maximum: 1.75 },
      maxItems: { amount: 1, maximum: 5 },
      maxPower: { amount: 1, maximum: 8 },
      eliteMaxFrequency: { amount: 1, maximum: 4 },
      affixChance: { amount: 0.06, maximum: 0.72 },
    },
  },
  output: { speedPrecision: 6 },
});
