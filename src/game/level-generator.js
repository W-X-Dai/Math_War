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
import { GENERATION_CONFIG } from '../config/generation.js';
import { CHAPTERS, ENDLESS_CHAPTER, OPERATORS } from './content.js';
import { finiteEncounterSchedule, finiteLaneRoles } from './encounters.js';

const UINT32_RANGE = 0x1_0000_0000;

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

function nonZeroCoefficient(rng, maximum = GENERATION_CONFIG.expressions.coefficient.defaultMaximum) {
  const magnitude = integer(rng, 1, maximum);
  return chance(rng, GENERATION_CONFIG.expressions.coefficient.negativeChance) ? -magnitude : magnitude;
}

function uniqueIntegers(rng, count, minimum, maximum) {
  const pool = Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index);
  return shuffle(rng, pool).slice(0, Math.min(count, pool.length));
}

function finiteExpression(rng, role) {
  const config = GENERATION_CONFIG.expressions;
  const power = role.powerRange ? integer(rng, role.powerRange[0], role.powerRange[1]) : null;
  switch (role.family) {
    case 'constant':
      return polynomial([{ coefficient: nonZeroCoefficient(rng, config.constant.coefficientMaximum), xPower: 0, yPower: 0 }]);
    case 'polynomial':
      return polynomial([{ coefficient: nonZeroCoefficient(rng), xPower: power, yPower: 0 }]);
    case 'higherOrder':
      return polynomial([{ coefficient: nonZeroCoefficient(rng, config.higherOrder.coefficientMaximum), xPower: power, yPower: 0 }]);
    case 'multivariable':
      return polynomial([{
        coefficient: nonZeroCoefficient(rng, config.multivariable.coefficientMaximum),
        xPower: power,
        yPower: integer(rng, role.yPowerRange[0], role.yPowerRange[1]),
      }]);
    case 'rational':
      return polynomial([{ coefficient: nonZeroCoefficient(rng, config.rational.coefficientMaximum), xPower: power, yPower: 0 }]);
    case 'logarithmic':
      return logarithm(nonZeroCoefficient(rng, config.logarithmic.coefficientMaximum));
    case 'trigonometric': {
      const coefficient = () => nonZeroCoefficient(rng, config.trigonometric.coefficientMaximum);
      if (role.form === 'mixed') {
        return addExpressions(
          trigonometric('sin', role.frequency, coefficient()),
          trigonometric('cos', role.frequency, coefficient()),
        );
      }
      return trigonometric(chance(rng, 0.5) ? 'sin' : 'cos', role.frequency, coefficient());
    }
    case 'exponential':
      return exponential(role.rate, nonZeroCoefficient(rng, config.exponential.coefficientMaximum));
    default:
      throw new RangeError(`unknown finite expression family: ${role.family}`);
  }
}

function basisExpressions(expression) {
  const normalized = normalizeExpression(expression);
  return [
    ...normalized.terms.map((term) => polynomial([term])),
    ...normalized.exponentials.map((term) => exponential(term.rate, term.coefficient)),
    ...normalized.trigTerms.map((term) => trigonometric(term.kind, term.rate, term.coefficient)),
    ...normalized.logTerms.map((term) => logarithm(term.coefficient, term.xPower)),
  ];
}

function splitChildren(expression, hasSplit) {
  if (!hasSplit) return [];
  const basis = basisExpressions(expression);
  return basis.length === 2 ? basis.map(cloneExpression) : [];
}

function selectFiniteAffixes(rng, role) {
  const choices = role.possibleAffixes ?? [];
  if (choices.length === 0 || !chance(rng, GENERATION_CONFIG.finite.affixChance)) return [];
  return [pick(rng, choices)];
}

function requiredScrollUses(entries) {
  return entries.reduce((total, entry) => (
    total
    + 1
    + (entry.affixes?.includes('shield') ? 1 : 0)
    + (entry.splitExpressions?.length ?? 0)
  ), 0);
}

function counterRequirement(role, entries = []) {
  const parameters = role.counter.parameters ?? [];
  return {
    row: role.row,
    family: role.family,
    scrollUses: Math.max(1, requiredScrollUses(entries)),
    operators: role.counter.operatorIds.map((operatorId, index) => ({
      operatorId,
      ...(parameters[index] == null ? {} : { parameter: parameters[index] }),
    })),
  };
}

function parameterMaterials(operatorId, parameter) {
  if (operatorId === 'resonanceTower' && parameter > 0 && Number.isInteger(Math.sqrt(parameter))) {
    return { formulaId: 'kSquared', constant: Math.sqrt(parameter) };
  }
  if (operatorId === 'resonanceTower' && parameter < 0 && Number.isInteger(Math.sqrt(-parameter))) {
    return { formulaId: 'negSquareK', constant: Math.sqrt(-parameter) };
  }
  return { formulaId: 'identityK', constant: parameter };
}

function guaranteeForRequirements(requirements) {
  const guaranteedSupply = { operators: [], formulaIds: [], constants: [] };
  const guaranteedTowerRows = new Set();
  for (const requirement of requirements) {
    for (const operator of requirement.operators) {
      const definition = OPERATORS[operator.operatorId];
      if (!definition?.parameterKeys?.length) {
        const rowKey = `${requirement.row}:${operator.operatorId}`;
        if (guaranteedTowerRows.has(rowKey)) continue;
        guaranteedTowerRows.add(rowKey);
      }
      const copies = definition?.parameterKeys?.length ? (requirement.scrollUses ?? 1) : 1;
      for (let copy = 0; copy < copies; copy += 1) {
        guaranteedSupply.operators.push(operator.operatorId);
        if (operator.parameter == null) continue;
        const materials = parameterMaterials(operator.operatorId, operator.parameter);
        guaranteedSupply.formulaIds.push(materials.formulaId);
        guaranteedSupply.constants.push(materials.constant);
      }
    }
  }
  return guaranteedSupply;
}

function dangerLabel(wave) {
  const config = GENERATION_CONFIG.danger;
  const mutationCount = wave.entries.reduce((total, entry) => total + entry.affixes.length, 0);
  const averageDamage = wave.entries.reduce((total, entry) => total + damage(entry.expression), 0) / wave.entries.length;
  const score = wave.entries.length * config.enemyCountWeight
    + mutationCount * config.mutationWeight
    + averageDamage * config.averageDamageWeight;
  return config.tiers.find((tier) => score < tier.maximumExclusive)?.label ?? config.maximumLabel;
}

function expressionRanges(entries) {
  const powers = [];
  const frequencies = [];
  let mixedFrequencyElite = false;
  for (const entry of entries) {
    const expression = normalizeExpression(entry.expression);
    powers.push(...expression.terms.map((term) => term.xPower));
    powers.push(...expression.logTerms.map((term) => term.xPower));
    const entryRates = [
      ...expression.exponentials.map((term) => term.rate),
      ...expression.trigTerms.map((term) => term.rate),
    ];
    frequencies.push(...entryRates);
    if (new Set(entryRates).size > 1) mixedFrequencyElite = true;
  }
  return {
    ...(powers.length ? { powerRange: [Math.min(...powers), Math.max(...powers)] } : {}),
    ...(frequencies.length ? { frequencyRange: [Math.min(...frequencies), Math.max(...frequencies)] } : {}),
    ...(mixedFrequencyElite ? { mixedFrequencyElite: true } : {}),
  };
}

export function summarizeWave(wave) {
  const counts = new Map();
  const byLane = new Map();
  let mutationCount = 0;
  for (const entry of wave.entries) {
    counts.set(entry.family, (counts.get(entry.family) ?? 0) + 1);
    mutationCount += entry.affixes.length;
    if (!byLane.has(entry.row)) byLane.set(entry.row, []);
    byLane.get(entry.row).push(entry);
  }
  return {
    total: wave.entries.length,
    families: [...counts.entries()].map(([id, count]) => ({
      id,
      label: GENERATION_CONFIG.families[id].label,
      count,
    })),
    mutationCount,
    danger: dangerLabel(wave),
    lanes: [...byLane.entries()].sort(([left], [right]) => left - right).map(([row, entries]) => {
      const families = [...new Set(entries.map((entry) => entry.family))];
      return {
        row,
        family: families.length === 1 ? families[0] : 'mixed',
        families,
        ...expressionRanges(entries),
        possibleAffixes: [...new Set(entries.flatMap((entry) => entry.possibleAffixes ?? entry.affixes))].sort(),
      };
    }),
  };
}

function finiteEntry(seed, streamName, index, event, role, rng, chapterIndex) {
  const expression = finiteExpression(rng, role);
  const affixes = selectFiniteAffixes(rng, role);
  const meta = GENERATION_CONFIG.families[role.family];
  const rewardConfig = GENERATION_CONFIG.rewards;
  const hasFast = affixes.includes('fast');
  const hasShield = affixes.includes('shield');
  return {
    id: `${streamName}-${mixSeed(seed, streamName, index).toString(16)}`,
    spawnAt: round(event.spawnAt, GENERATION_CONFIG.spawn.timePrecision),
    row: event.row,
    typeId: `procedural-${role.family}`,
    name: meta.name,
    art: meta.art,
    family: role.family,
    expression: cloneExpression(expression),
    speed: round(
      meta.speed * (GENERATION_CONFIG.finite.speed.baseMultiplier
        + chapterIndex * GENERATION_CONFIG.finite.speed.perChapter),
      GENERATION_CONFIG.output.speedPrecision,
    ),
    reward: Math.ceil(
      meta.reward
      * (rewardConfig.finite.baseMultiplier + chapterIndex * rewardConfig.finite.perChapter)
      * (hasFast ? rewardConfig.affixMultipliers.fast : 1)
      * (hasShield ? rewardConfig.affixMultipliers.shield : 1),
    ),
    affixes,
    splitExpressions: splitChildren(expression, affixes.includes('split')),
    possibleAffixes: [...(role.possibleAffixes ?? [])],
  };
}

export function generateFiniteSegment(seed, chapterIndex, segmentIndex) {
  if (!Number.isInteger(chapterIndex) || chapterIndex < 0 || chapterIndex >= CHAPTERS.length) {
    throw new RangeError(`chapterIndex must be between 0 and ${CHAPTERS.length - 1}`);
  }
  if (segmentIndex !== 1 && segmentIndex !== 2) {
    throw new RangeError('segmentIndex must be 1 (pressure) or 2 (mixed)');
  }
  const chapter = CHAPTERS[chapterIndex];
  const segment = chapter.segments[segmentIndex - 1];
  const streamName = `chapter-${chapterIndex}-segment-${segmentIndex}`;
  const countRng = createSeededRng(seed, 'level', streamName, 'count');
  const count = integer(countRng, segment.countRange[0], segment.countRange[1]);
  const schedule = finiteEncounterSchedule(
    createSeededRng(seed, 'level', streamName, 'schedule'),
    count,
    chapter.board.rows,
    segment.kind,
  );
  const roles = finiteLaneRoles(
    createSeededRng(seed, 'level', streamName, 'roles'),
    chapterIndex,
    segment.kind,
    schedule.map((event) => event.row),
  );
  const rolesByRow = new Map(roles.map((role) => [role.row, role]));
  const expressionRng = createSeededRng(seed, 'level', streamName, 'expressions');
  const entries = schedule.map((event, index) => finiteEntry(
    seed, streamName, index, event, rolesByRow.get(event.row), expressionRng, chapterIndex,
  ));
  const counterRequirements = roles.map((role) => counterRequirement(
    role,
    entries.filter((entry) => entry.row === role.row),
  ));
  const wave = {
    id: `${chapter.id}-${segment.kind}`,
    kind: 'challenge',
    name: `${chapter.name}・${segment.kind === 'pressure' ? '壓力段' : '混合段'}`,
    hint: chapter.hint,
    theme: chapter.theme,
    chapterIndex,
    endlessRound: 0,
    segmentIndex,
    segmentKind: segment.kind,
    awardsEarlyStart: segmentIndex === 1,
    entries,
    requiredTags: [...new Set(entries.map((entry) => entry.family))],
    counterRequirements,
    guaranteedSupply: guaranteeForRequirements(counterRequirements),
  };
  wave.summary = summarizeWave(wave);
  return wave;
}

/** Compatibility wrapper; omitted segmentIndex means the first formal segment. */
export function generateFiniteWave(seed, chapterIndex, segmentIndex = 1) {
  return generateFiniteSegment(seed, chapterIndex, segmentIndex);
}

function applyEndlessIncrement(state, axis, config) {
  if (state[axis] >= config.maximum) return false;
  state[axis] = Math.min(config.maximum, state[axis] + config.amount);
  return true;
}

export function endlessDifficulty(roundNumber) {
  if (!Number.isInteger(roundNumber) || roundNumber < 1) {
    throw new RangeError('endless round must be a positive integer');
  }
  const config = GENERATION_CONFIG.endless;
  const state = { ...config.baseline, allowedAffixes: [...config.baseline.allowedAffixes] };
  let introducedAxis = 'baseline';
  for (const introduction of config.introductions) {
    if (introduction.round > roundNumber) break;
    Object.assign(state, introduction.patch ?? {});
    if (introduction.addAffix && !state.allowedAffixes.includes(introduction.addAffix)) {
      state.allowedAffixes.push(introduction.addAffix);
    }
    if (introduction.round === roundNumber) introducedAxis = introduction.axis;
  }

  let rotationCursor = 0;
  for (let currentRound = 12; currentRound <= roundNumber; currentRound += 1) {
    let appliedAxis = null;
    for (let attempt = 0; attempt < config.rotation.length; attempt += 1) {
      const index = (rotationCursor + attempt) % config.rotation.length;
      const axis = config.rotation[index];
      if (!applyEndlessIncrement(state, axis, config.increments[axis])) continue;
      rotationCursor = (index + 1) % config.rotation.length;
      appliedAxis = axis;
      break;
    }
    if (currentRound === roundNumber) introducedAxis = appliedAxis ?? 'capped';
  }
  return { ...state, stageAxis: introducedAxis };
}

function endlessExpression(rng, family, difficulty) {
  const config = GENERATION_CONFIG.expressions;
  switch (family) {
    case 'constant':
      return polynomial([{ coefficient: nonZeroCoefficient(rng, config.constant.coefficientMaximum), xPower: 0, yPower: 0 }]);
    case 'polynomial': {
      const count = integer(rng, 1, Math.min(difficulty.maxItems, difficulty.maxPower));
      return polynomial(uniqueIntegers(rng, count, 1, difficulty.maxPower).map((xPower) => ({
        coefficient: nonZeroCoefficient(rng), xPower, yPower: 0,
      })));
    }
    case 'higherOrder': {
      const count = integer(rng, 1, Math.min(difficulty.maxItems, Math.max(1, difficulty.maxPower - 2)));
      return polynomial(uniqueIntegers(rng, count, 3, Math.max(3, difficulty.maxPower)).map((xPower) => ({
        coefficient: nonZeroCoefficient(rng, config.higherOrder.coefficientMaximum), xPower, yPower: 0,
      })));
    }
    case 'multivariable': {
      const count = integer(rng, 1, Math.min(difficulty.maxItems, Math.max(1, difficulty.maxPower - 2)));
      return polynomial(uniqueIntegers(rng, count, 3, Math.max(3, difficulty.maxPower)).map((xPower) => ({
        coefficient: nonZeroCoefficient(rng, config.multivariable.coefficientMaximum),
        xPower,
        yPower: integer(rng, config.multivariable.yPower.minimum, config.multivariable.yPower.maximum),
      })));
    }
    case 'rational':
      return polynomial([{ coefficient: nonZeroCoefficient(rng, config.rational.coefficientMaximum), xPower: pick(rng, config.rational.powers), yPower: 0 }]);
    case 'logarithmic':
      return logarithm(nonZeroCoefficient(rng, config.logarithmic.coefficientMaximum));
    case 'trigonometric': {
      const frequency = pick(rng, config.trigonometric.frequencies);
      const first = trigonometric(chance(rng, 0.5) ? 'sin' : 'cos', frequency, nonZeroCoefficient(rng, config.trigonometric.coefficientMaximum));
      if (difficulty.maxItems < 2 || !chance(rng, 0.45)) return first;
      const secondKind = first.trigTerms[0].kind === 'sin' ? 'cos' : 'sin';
      return addExpressions(first, trigonometric(secondKind, frequency, nonZeroCoefficient(rng, config.trigonometric.coefficientMaximum)));
    }
    case 'exponential':
      return exponential(pick(rng, config.exponential.rates), nonZeroCoefficient(rng, config.exponential.coefficientMaximum));
    default:
      throw new RangeError(`unknown endless expression family: ${family}`);
  }
}

function endlessSchedule(rng, count, rowCount, difficulty) {
  const rows = shuffle(rng, Array.from({ length: rowCount }, (_, row) => row));
  const packs = [];
  let remaining = count;
  let index = 0;
  while (remaining > 0) {
    const size = Math.min(difficulty.packSize, remaining);
    packs.push({ row: rows[index % rows.length], size });
    remaining -= size;
    index += 1;
  }
  const events = [];
  packs.forEach((pack, packIndex) => {
    const group = Math.floor(packIndex / difficulty.simultaneousLanes);
    for (let member = 0; member < pack.size; member += 1) {
      events.push({ row: pack.row, spawnAt: group * 5 + member * GENERATION_CONFIG.spawn.packGapSeconds });
    }
  });
  return events.sort((left, right) => left.spawnAt - right.spawnAt || left.row - right.row);
}

function selectEndlessAffixes(rng, difficulty, maySplit) {
  if (difficulty.allowedAffixes.length === 0 || !chance(rng, difficulty.affixChance)) return [];
  const choices = difficulty.allowedAffixes.filter((affix) => affix !== 'split' || maySplit);
  if (choices.length === 0) return [];
  const first = pick(rng, choices);
  if (difficulty.maxAffixes < 2 || !chance(rng, 0.3)) return [first];
  if (first === 'fast') {
    const secondChoices = choices.filter((affix) => affix === 'shield' || affix === 'split');
    return secondChoices.length ? ['fast', pick(rng, secondChoices)] : ['fast'];
  }
  return choices.includes('fast') ? ['fast', first] : [first];
}

function endlessCounterForEntry(entry) {
  const expression = normalizeExpression(entry.expression);
  if (entry.family === 'trigonometric') {
    const parameters = [...new Set(expression.trigTerms.map((term) => term.rate ** 2))];
    return parameters.map((parameter) => ({ operatorId: 'resonanceTower', parameter }));
  }
  if (entry.family === 'exponential') {
    const parameters = [...new Set(expression.exponentials.map((term) => -(term.rate ** 2)))];
    return parameters.map((parameter) => ({ operatorId: 'resonanceTower', parameter }));
  }
  if (entry.family === 'rational') {
    const parameters = [...new Set(expression.terms.map((term) => -term.xPower))];
    return parameters.map((parameter) => ({ operatorId: 'eulerTower', parameter }));
  }
  if (entry.family === 'logarithmic') {
    return [{ operatorId: 'evaluateTower', parameter: 1 }];
  }
  return [];
}

export function generateEndlessWave(seed, roundNumber) {
  const difficulty = endlessDifficulty(roundNumber);
  const streamName = `endless-${roundNumber}`;
  const schedule = endlessSchedule(
    createSeededRng(seed, 'level', streamName, 'schedule'),
    difficulty.count,
    ENDLESS_CHAPTER.board.rows,
    difficulty,
  );
  const rng = createSeededRng(seed, 'level', streamName, 'expressions');
  const families = ENDLESS_CHAPTER.families;
  const entries = schedule.map((event, index) => {
    const family = pick(rng, families);
    const meta = GENERATION_CONFIG.families[family];
    let expression = endlessExpression(rng, family, difficulty);
    const isMixedElite = difficulty.mixedFrequencyElite && index === 0;
    if (isMixedElite) {
      const secondFrequency = Math.max(2, difficulty.eliteMaxFrequency);
      expression = addExpressions(
        trigonometric('cos', 1, nonZeroCoefficient(rng)),
        trigonometric('cos', secondFrequency, nonZeroCoefficient(rng)),
      );
    }
    const effectiveFamily = isMixedElite ? 'trigonometric' : family;
    const effectiveMeta = GENERATION_CONFIG.families[effectiveFamily];
    const basis = basisExpressions(expression);
    const affixes = isMixedElite ? [] : selectEndlessAffixes(rng, difficulty, basis.length === 2);
    const rewardConfig = GENERATION_CONFIG.rewards;
    return {
      id: `${streamName}-${mixSeed(seed, streamName, index).toString(16)}`,
      spawnAt: round(event.spawnAt, GENERATION_CONFIG.spawn.timePrecision),
      row: event.row,
      typeId: `procedural-${effectiveFamily}`,
      name: isMixedElite ? `混頻${effectiveMeta.name}` : meta.name,
      art: effectiveMeta.art,
      family: effectiveFamily,
      expression: cloneExpression(expression),
      speed: round(effectiveMeta.speed * difficulty.speedMultiplier, GENERATION_CONFIG.output.speedPrecision),
      reward: Math.ceil(
        effectiveMeta.reward
        * (rewardConfig.endless.baseMultiplier + Math.min(
          rewardConfig.endless.maximumRoundBonus,
          roundNumber * rewardConfig.endless.perRound,
        ))
        * (affixes.includes('fast') ? rewardConfig.affixMultipliers.fast : 1)
        * (affixes.includes('shield') ? rewardConfig.affixMultipliers.shield : 1),
      ),
      affixes,
      splitExpressions: splitChildren(expression, affixes.includes('split')),
      possibleAffixes: [...difficulty.allowedAffixes],
      ...(isMixedElite ? { eliteKind: 'mixed-frequency' } : {}),
    };
  });
  const counterRequirements = entries.flatMap((entry) => {
    const operators = endlessCounterForEntry(entry);
    if (!operators.length) return [];
    return [{
      row: entry.row,
      family: entry.family,
      entryId: entry.id,
      scrollUses: 1 + (entry.affixes.includes('shield') ? 1 : 0) + entry.splitExpressions.length,
      ...(entry.eliteKind === 'mixed-frequency'
        ? { warning: '混頻精英需要兩個已預告的共振參數' }
        : {}),
      operators,
    }];
  });
  const wave = {
    id: streamName,
    kind: 'endless',
    name: `無限證明 ${roundNumber}`,
    hint: ENDLESS_CHAPTER.hint,
    theme: ENDLESS_CHAPTER.theme,
    chapterIndex: CHAPTERS.length,
    endlessRound: roundNumber,
    entries,
    requiredTags: [...new Set(entries.map((entry) => entry.family))],
    counterRequirements,
    guaranteedSupply: guaranteeForRequirements(counterRequirements),
    difficulty,
  };
  wave.summary = summarizeWave(wave);
  return wave;
}
