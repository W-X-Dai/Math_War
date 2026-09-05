import {
  addExpressions,
  cloneExpression,
  damage,
  exponential,
  logarithm,
  normalizeExpression,
  polynomial,
  trigonometric,
} from '../domain/expression.js';
import { CHAPTERS, ENDLESS_CHAPTER } from './content.js';

const UINT32_RANGE = 0x1_0000_0000;
const FAMILY_META = Object.freeze({
  polynomial: { label: '多項式', name: '次方墨兔', art: 'enemy-art-polynomial', speed: 0.020, reward: 28 },
  constant: { label: '常數項', name: '常數背包獸', art: 'enemy-art-polynomial', speed: 0.0165, reward: 40 },
  higherOrder: { label: '高階多項式', name: '階乘巨獸', art: 'enemy-art-brute', speed: 0.0115, reward: 62 },
  multivariable: { label: '多變數', name: '雙變數紙獸', art: 'enemy-art-wave', speed: 0.014, reward: 68 },
  rational: { label: '分式', name: '漸近潛獸', art: 'enemy-art-wave', speed: 0.017, reward: 74 },
  logarithmic: { label: '對數', name: '對數捲獸', art: 'enemy-art-brute', speed: 0.0135, reward: 84 },
  trigonometric: { label: '三角函數', name: '週期浪獸', art: 'enemy-art-wave', speed: 0.016, reward: 94 },
  exponential: { label: '指數函數', name: '指數飛蛾', art: 'enemy-art-exponential', speed: 0.0135, reward: 110 },
});

function seedText(seed) {
  if (typeof seed === 'number' && Number.isFinite(seed)) return String(seed >>> 0);
  return String(seed ?? '0');
}

/** Stable 32-bit FNV-1a hash used to isolate procedural RNG streams. */
export function mixSeed(seed, ...parts) {
  const text = [seedText(seed), ...parts.map(String)].join('|');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  hash += hash << 13;
  hash ^= hash >>> 7;
  hash += hash << 3;
  hash ^= hash >>> 17;
  hash += hash << 5;
  return hash >>> 0;
}

/** Mulberry32: deterministic and local; callers cannot perturb another stream. */
export function createSeededRng(seed, ...streamParts) {
  let state = mixSeed(seed, ...streamParts);
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / UINT32_RANGE;
  };
}

const integer = (rng, minimum, maximum) => minimum + Math.floor(rng() * (maximum - minimum + 1));
const pick = (rng, values) => values[Math.floor(rng() * values.length)];
const chance = (rng, probability) => rng() < probability;
const round = (value, precision = 4) => Number(value.toFixed(precision));

function shuffle(rng, values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = integer(rng, 0, index);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

function nonZeroCoefficient(rng, maximum = 4) {
  const magnitude = integer(rng, 1, maximum);
  return chance(rng, 0.25) ? -magnitude : magnitude;
}

function uniqueIntegers(rng, count, minimum, maximum) {
  const pool = Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index);
  return shuffle(rng, pool).slice(0, Math.min(count, pool.length));
}

function makePolynomial(rng, maxPower, maxItems, minimumPower = 1) {
  const count = integer(rng, 1, Math.min(maxItems, Math.max(1, maxPower - minimumPower + 1)));
  const powers = uniqueIntegers(rng, count, minimumPower, maxPower);
  return polynomial(powers.map((xPower) => ({ coefficient: nonZeroCoefficient(rng), xPower, yPower: 0 })));
}

function makeConstantExpression(rng, maxPower, maxItems) {
  const variableItems = Math.max(1, Math.min(maxItems - 1, integer(rng, 1, 2)));
  const variable = makePolynomial(rng, Math.max(1, maxPower), variableItems);
  const constant = polynomial([{ coefficient: nonZeroCoefficient(rng, 6), xPower: 0, yPower: 0 }]);
  return addExpressions(variable, constant);
}

function makeHigherOrder(rng, maxPower, maxItems) {
  const upper = Math.max(3, maxPower);
  const count = integer(rng, 1, Math.min(maxItems, upper - 2));
  const powers = uniqueIntegers(rng, count, 3, upper);
  return polynomial(powers.map((xPower) => ({ coefficient: nonZeroCoefficient(rng, 3), xPower, yPower: 0 })));
}

function makeMultivariable(rng, maxPower, maxItems) {
  const count = integer(rng, 1, Math.min(3, maxItems));
  const terms = [];
  const used = new Set();
  while (terms.length < count) {
    const xPower = integer(rng, 0, Math.min(3, maxPower));
    const yPower = integer(rng, 1, Math.min(4, maxPower));
    const key = `${xPower}:${yPower}`;
    if (used.has(key)) continue;
    used.add(key);
    terms.push({ coefficient: nonZeroCoefficient(rng, 3), xPower, yPower });
  }
  return polynomial(terms);
}

function makeRational(rng, maxItems) {
  const count = integer(rng, 1, Math.min(4, maxItems));
  const powers = uniqueIntegers(rng, count, -4, -1);
  return polynomial(powers.map((xPower) => ({ coefficient: nonZeroCoefficient(rng, 4), xPower, yPower: 0 })));
}

function makeLogarithmic(rng, maxItems) {
  // p=-1 would integrate to (ln|x|)^2/2, which is deliberately outside the
  // game's finite basis. Keep generated logarithms closed under our operators.
  const count = integer(rng, 1, Math.min(2, maxItems));
  const powers = uniqueIntegers(rng, count, 0, 1);
  return addExpressions(...powers.map((xPower) => logarithm(nonZeroCoefficient(rng, 3), xPower)));
}

function makeTrigonometric(rng, maxFrequency, maxItems) {
  const available = [];
  for (let rate = 1; rate <= maxFrequency; rate += 1) {
    available.push(['sin', rate], ['cos', rate]);
  }
  const count = integer(rng, 1, Math.min(maxItems, available.length));
  return addExpressions(...shuffle(rng, available).slice(0, count).map(([kind, rate]) => (
    trigonometric(kind, rate, nonZeroCoefficient(rng, 3))
  )));
}

function makeExponential(rng, maxFrequency, maxItems) {
  const count = integer(rng, 1, Math.min(maxItems, maxFrequency));
  const rates = uniqueIntegers(rng, count, 1, maxFrequency);
  return addExpressions(...rates.map((rate) => exponential(
    chance(rng, 0.18) ? -rate : rate,
    nonZeroCoefficient(rng, 3),
  )));
}

function createExpression(rng, family, limits) {
  switch (family) {
    case 'polynomial': return makePolynomial(rng, limits.maxPower, limits.maxItems);
    case 'constant': return makeConstantExpression(rng, limits.maxPower, limits.maxItems);
    case 'higherOrder': return makeHigherOrder(rng, limits.maxPower, limits.maxItems);
    case 'multivariable': return makeMultivariable(rng, limits.maxPower, limits.maxItems);
    case 'rational': return makeRational(rng, limits.maxItems);
    case 'logarithmic': return makeLogarithmic(rng, limits.maxItems);
    case 'trigonometric': return makeTrigonometric(rng, limits.maxFrequency, limits.maxItems);
    case 'exponential': return makeExponential(rng, limits.maxFrequency, limits.maxItems);
    default: throw new RangeError(`unknown expression family: ${family}`);
  }
}

function basisExpressions(expression) {
  const normalized = normalizeExpression(expression);
  return [
    ...normalized.terms.map((term) => polynomial([term])),
    ...(normalized.exponentials ?? []).map((term) => exponential(term.rate, term.coefficient)),
    ...(normalized.trigTerms ?? []).map((term) => trigonometric(term.kind, term.rate, term.coefficient)),
    ...(normalized.logTerms ?? []).map((term) => logarithm(term.coefficient, term.xPower)),
  ];
}

function selectFiniteAffixes(rng, chapterIndex, maySplit) {
  const mutationChance = [0.12, 0.16, 0.2, 0.25, 0.3, 0.36][chapterIndex];
  if (!chance(rng, mutationChance)) return [];
  const choices = ['fast'];
  if (chapterIndex >= 3) choices.push('shield');
  if (chapterIndex >= 4 && maySplit) choices.push('split');
  return [pick(rng, choices)];
}

function selectEndlessAffixes(rng, roundNumber, maySplit) {
  if (!chance(rng, Math.min(0.72, 0.25 + roundNumber * 0.025))) return [];
  const choices = ['fast', 'shield', ...(maySplit ? ['split'] : [])];
  const first = pick(rng, choices);
  const affixes = [first];
  if (roundNumber < 8 || !chance(rng, Math.min(0.48, 0.1 + (roundNumber - 8) * 0.018))) return affixes;

  // The only legal double combinations are fast+shield and fast+split.
  if (first === 'fast') affixes.push(pick(rng, maySplit ? ['shield', 'split'] : ['shield']));
  else affixes.unshift('fast');
  return affixes;
}

function splitChildren(expression, hasSplit) {
  if (!hasSplit) return [];
  const basis = basisExpressions(expression);
  return basis.length === 2 ? basis.map(cloneExpression) : [];
}

function balancedRows(rng, count, rows) {
  const result = [];
  while (result.length < count) {
    result.push(...shuffle(rng, Array.from({ length: rows }, (_, row) => row)));
  }
  return result.slice(0, count);
}

function familySchedule(rng, families, count) {
  const scheduled = [...families];
  while (scheduled.length < count) scheduled.push(pick(rng, families));
  return shuffle(rng, scheduled.slice(0, count));
}

function dangerLabel(wave) {
  const mutationCount = wave.entries.reduce((total, entry) => total + entry.affixes.length, 0);
  const averageDamage = wave.entries.reduce((total, entry) => total + damage(entry.expression), 0) / wave.entries.length;
  const score = wave.entries.length + mutationCount * 1.5 + averageDamage * 0.22;
  if (score < 11) return '低';
  if (score < 18) return '中';
  if (score < 27) return '高';
  return '極高';
}

export function summarizeWave(wave) {
  const counts = new Map();
  let mutationCount = 0;
  for (const entry of wave.entries) {
    counts.set(entry.family, (counts.get(entry.family) ?? 0) + 1);
    mutationCount += entry.affixes.length;
  }
  return {
    total: wave.entries.length,
    families: [...counts.entries()].map(([id, count]) => ({ id, label: FAMILY_META[id].label, count })),
    mutationCount,
    danger: dangerLabel(wave),
  };
}

function generateWave({ seed, chapter, chapterIndex, endlessRound = 0, count, limits, speedScale }) {
  const streamName = endlessRound > 0 ? `endless-${endlessRound}` : `chapter-${chapterIndex}`;
  const rng = createSeededRng(seed, 'level', streamName);
  const rows = balancedRows(rng, count, chapter.board.rows);
  const families = familySchedule(rng, chapter.families, count);
  const entries = [];
  let spawnAt = 0;

  for (let index = 0; index < count; index += 1) {
    const family = families[index];
    const meta = FAMILY_META[family];
    const expression = createExpression(rng, family, limits);
    const basis = basisExpressions(expression);
    const affixes = endlessRound > 0
      ? selectEndlessAffixes(rng, endlessRound, basis.length === 2)
      : selectFiniteAffixes(rng, chapterIndex, basis.length === 2);
    const hasFast = affixes.includes('fast');
    const hasShield = affixes.includes('shield');
    const rewardScale = endlessRound > 0 ? 1 + Math.min(1.5, endlessRound * 0.045) : 1 + chapterIndex * 0.06;
    const splitExpressions = splitChildren(expression, affixes.includes('split'));

    entries.push({
      id: `${streamName}-${mixSeed(seed, streamName, index).toString(16)}`,
      spawnAt: round(spawnAt, 3),
      row: rows[index],
      typeId: `procedural-${family}`,
      name: meta.name,
      art: meta.art,
      family,
      expression: cloneExpression(expression),
      // Affix modifiers are applied by the engine so each multiplier has one
      // authoritative owner. This value contains only chapter/round scaling.
      speed: round(meta.speed * speedScale, 6),
      reward: Math.ceil(meta.reward * rewardScale * (hasFast ? 1.2 : 1) * (hasShield ? 1.25 : 1)),
      affixes,
      splitExpressions,
    });
    spawnAt += chapter.spawnInterval * (0.86 + rng() * 0.28);
  }

  const wave = {
    id: endlessRound > 0 ? `endless-${endlessRound}` : chapter.id,
    name: endlessRound > 0 ? `無限證明 ${endlessRound}` : chapter.name,
    hint: chapter.hint,
    theme: chapter.theme,
    chapterIndex,
    endlessRound,
    entries,
    requiredTags: [...new Set(entries.map((entry) => entry.family))],
  };
  wave.summary = summarizeWave(wave);
  return wave;
}

export function generateFiniteWave(seed, chapterIndex) {
  if (!Number.isInteger(chapterIndex) || chapterIndex < 0 || chapterIndex >= CHAPTERS.length) {
    throw new RangeError(`chapterIndex must be between 0 and ${CHAPTERS.length - 1}`);
  }
  const chapter = CHAPTERS[chapterIndex];
  const countRng = createSeededRng(seed, 'level', `chapter-${chapterIndex}`, 'count');
  const count = integer(countRng, chapter.countRange[0], chapter.countRange[1]);
  return generateWave({
    seed,
    chapter,
    chapterIndex,
    count,
    limits: { maxItems: 4, maxPower: Math.min(6, 3 + chapterIndex), maxFrequency: 2 },
    speedScale: 1 + chapterIndex * 0.035,
  });
}

export function endlessDifficulty(roundNumber) {
  if (!Number.isInteger(roundNumber) || roundNumber < 1) {
    throw new RangeError('endless round must be a positive integer');
  }
  return {
    count: Math.min(14 + 2 * (roundNumber - 1), 36),
    maxItems: Math.min(5, 2 + Math.floor(roundNumber / 5)),
    maxPower: Math.min(8, 6 + Math.floor(roundNumber / 4)),
    maxFrequency: Math.min(3, 2 + Math.floor(roundNumber / 6)),
    speedMultiplier: Math.min(1.75, 1 + (roundNumber - 1) * 0.055),
  };
}

export function generateEndlessWave(seed, roundNumber) {
  const difficulty = endlessDifficulty(roundNumber);
  return generateWave({
    seed,
    chapter: ENDLESS_CHAPTER,
    chapterIndex: CHAPTERS.length,
    endlessRound: roundNumber,
    count: difficulty.count,
    limits: {
      maxItems: difficulty.maxItems,
      maxPower: difficulty.maxPower,
      maxFrequency: difficulty.maxFrequency,
    },
    speedScale: difficulty.speedMultiplier,
  });
}
