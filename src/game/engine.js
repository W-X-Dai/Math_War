import {
  addExpressions,
  cloneExpression,
  damage,
  definiteIntegral,
  differentiate,
  evaluateAt,
  formatExpression,
  integrate,
  isEulerCompatible,
  isZero,
  limitAtInfinity,
  multiplyByX,
  polynomial,
  reflectInput,
  scaleExpression,
  subtractConstant,
} from '../domain/expression.js';
import {
  BOARD,
  CHAPTERS,
  CONSTANT_QUEUE_CAPACITY,
  CONSTANT_QUEUE_INTERVAL,
  ENDLESS_CHAPTER,
  ENEMY_TYPES,
  FORMULA_CARDS,
  FORMULA_QUEUE_CAPACITY,
  FORMULA_QUEUE_INTERVAL,
  GOD_CONSTANT_VALUES,
  INTEGRATION_CONSTANTS,
  OPERATOR_QUEUE_CAPACITY,
  OPERATOR_QUEUE_INTERVAL,
  OPERATOR_ORDER,
  OPERATORS,
  STORED_CONSTANT_CAPACITY,
} from './content.js';
import { generateEndlessWave, generateFiniteWave } from './level-generator.js';

const GRID_START = 0.155;
const GRID_END = 0.89;
const BASE_POSITION = 0.125;
const ATTACK_INTERVAL = 1.15;
const ENERGY_INTERVAL = 5;
const ENERGY_GAIN = 25;
const towerPosition = (column, board = BOARD) => (
  GRID_START + ((column + 0.5) / board.columns) * (GRID_END - GRID_START)
);

const nextId = (state, prefix) => `${prefix}-${state.nextEntityId++}`;

function seededRandom(state) {
  state.rngState = (state.rngState * 1664525 + 1013904223) >>> 0;
  return state.rngState / 4294967296;
}

function formulaCard(id) {
  return FORMULA_CARDS.find((card) => card.id === id);
}

function drawFormulaCard(state) {
  const index = Math.floor(seededRandom(state) * FORMULA_CARDS.length);
  return { id: nextId(state, 'formula'), cardId: FORMULA_CARDS[index].id };
}

function drawGodConstant(state) {
  const index = Math.floor(seededRandom(state) * GOD_CONSTANT_VALUES.length);
  return { id: nextId(state, 'constant'), value: GOD_CONSTANT_VALUES[index] };
}

function operatorCounterWeight(operator, requiredTags) {
  const matches = (operator.counterTags ?? []).filter((tag) => requiredTags.includes(tag)).length;
  return 1 + matches * 3;
}

function drawOperatorCard(state) {
  const counts = state.operatorQueue.reduce((map, item) => {
    map[item.operatorId] = (map[item.operatorId] ?? 0) + 1;
    return map;
  }, {});
  let candidates = Object.values(OPERATORS).filter((operator) => (
    operator.unlockChapter <= state.chapterIndex && (counts[operator.id] ?? 0) < 3
  ));
  if (candidates.length === 0) {
    candidates = Object.values(OPERATORS).filter((operator) => operator.unlockChapter <= state.chapterIndex);
  }
  const requiredTags = state.currentWave?.requiredTags ?? [];
  const totalWeight = candidates.reduce(
    (total, operator) => total + operatorCounterWeight(operator, requiredTags),
    0,
  );
  let roll = seededRandom(state) * totalWeight;
  const selected = candidates.find((operator) => {
    roll -= operatorCounterWeight(operator, requiredTags);
    return roll <= 0;
  }) ?? candidates.at(-1);
  return { id: nextId(state, 'operator'), operatorId: selected.id };
}

function addLog(state, equation, tone = 'neutral') {
  state.logs.unshift({ id: nextId(state, 'log'), equation, tone });
  state.logs = state.logs.slice(0, 8);
}

function addEffect(state, effect) {
  state.effects.push({ id: nextId(state, 'fx'), ttl: 0.9, ...effect });
}

function operatorLabel(id) {
  return OPERATORS[id]?.symbol ?? id;
}

function spawnEnemy(state, entry) {
  const legacyEntry = Array.isArray(entry);
  const typeId = legacyEntry ? entry[0] : entry.typeId;
  const row = legacyEntry ? entry[1] : entry.row;
  const type = ENEMY_TYPES[typeId] ?? {};
  state.enemies.push({
    id: nextId(state, 'enemy'),
    typeId,
    name: entry.name ?? type.name ?? '程序函數',
    art: entry.art ?? type.art ?? 'enemy-art-polynomial',
    family: entry.family ?? 'polynomial',
    row,
    position: 0.955,
    expression: cloneExpression(entry.expression ?? type.create()),
    speed: entry.speed ?? type.speed,
    reward: entry.reward ?? type.reward,
    affixes: [...(entry.affixes ?? [])],
    shieldActive: (entry.affixes ?? []).includes('shield'),
    splitExpressions: (entry.splitExpressions ?? []).map(cloneExpression),
    attackTimer: 0,
    divergentTimer: 0,
    hitFlash: 0,
  });
}

function spawnSplitChildren(state, enemy) {
  if (!enemy.affixes?.includes('split') || !enemy.splitExpressions?.length) return;
  enemy.splitExpressions.slice(0, 2).forEach((expression, index) => {
    state.enemies.push({
      id: nextId(state, 'enemy'),
      typeId: `${enemy.typeId}-child`,
      name: `${enemy.name}・分項`,
      art: enemy.art,
      family: enemy.family,
      row: enemy.row,
      position: Math.min(0.97, enemy.position + 0.014 * index),
      expression: cloneExpression(expression),
      speed: enemy.speed * 1.05,
      reward: Math.max(8, Math.ceil(enemy.reward * 0.35)),
      affixes: [],
      shieldActive: false,
      splitExpressions: [],
      attackTimer: 0.35 + index * 0.12,
      divergentTimer: 0,
      hitFlash: 0,
    });
  });
  addEffect(state, {
    type: 'split',
    row: enemy.row,
    position: enemy.position,
    label: `分裂 ×${Math.min(2, enemy.splitExpressions.length)}`,
  });
}

function finishEnemy(state, enemy, reason) {
  if (enemy.dead) return;
  enemy.dead = true;
  const baseReward = enemy.reward ?? ENEMY_TYPES[enemy.typeId]?.reward ?? 20;
  const reward = enemy.affixes?.includes('split')
    ? Math.max(8, Math.ceil(baseReward * 0.6))
    : baseReward;
  state.energy += reward;
  state.kills += 1;
  state.chain += 1;
  state.maxChain = Math.max(state.maxChain, state.chain);
  addEffect(state, {
    type: 'vanish',
    row: enemy.row,
    position: enemy.position,
    label: '＝ 0',
  });
  addLog(state, `${reason}　→ 0　消去！`, 'success');
  spawnSplitChildren(state, enemy);
}

function transformEnemy(state, enemy, nextExpression, source, previousText) {
  if (enemy.shieldActive) {
    enemy.shieldActive = false;
    enemy.hitFlash = 0.32;
    addEffect(state, {
      type: 'shield',
      row: enemy.row,
      position: enemy.position,
      label: '護盾破裂',
    });
    addLog(state, `${operatorLabel(source)}　被等式護盾抵銷`, 'danger');
    return false;
  }
  enemy.expression = nextExpression;
  enemy.hitFlash = 0.32;
  const nextText = formatExpression(nextExpression);
  addEffect(state, {
    type: 'operator',
    row: enemy.row,
    position: enemy.position,
    label: operatorLabel(source),
    equation: `${previousText} → ${nextText}`,
  });

  if (isZero(nextExpression)) {
    finishEnemy(state, enemy, `${source}: ${previousText}`);
  } else {
    addLog(state, `${operatorLabel(source)}　${previousText} → ${nextText}`);
  }
  return true;
}

function attackEnemy(state, tower, enemy) {
  const previousText = formatExpression(enemy.expression);
  let nextExpression;

  try {
    if (tower.typeId === 'derivative') {
      nextExpression = differentiate(enemy.expression, 'x', 1);
    } else if (tower.typeId === 'secondDerivative') {
      nextExpression = differentiate(enemy.expression, 'x', 2);
    } else if (tower.typeId === 'subtract') {
      nextExpression = subtractConstant(enemy.expression, tower.parameter);
    } else if (tower.typeId === 'definiteIntegralTower') {
      nextExpression = definiteIntegral(enemy.expression, tower.lowerBound, tower.upperBound, 'x');
    } else if (tower.typeId === 'evaluateTower') {
      nextExpression = polynomial(evaluateAt(enemy.expression, tower.parameter));
    } else if (tower.typeId === 'resonanceTower') {
      nextExpression = addExpressions(
        differentiate(enemy.expression, 'x', 2),
        scaleExpression(enemy.expression, tower.parameter),
      );
    } else if (tower.typeId === 'eulerTower') {
      nextExpression = addExpressions(
        multiplyByX(differentiate(enemy.expression, 'x', 1)),
        scaleExpression(enemy.expression, tower.parameter),
      );
    } else {
      return;
    }
  } catch (error) {
    tower.active = false;
    const reason = error instanceof Error ? error.message : '定義域錯誤';
    notify(state, '運算遇到定義域或自由變數；這座塔已停火。', 'danger');
    addLog(state, `${operatorLabel(tower.typeId)} ${previousText} 無法運算：${reason}`, 'danger');
    return;
  }

  transformEnemy(state, enemy, nextExpression, tower.typeId, previousText);
  addEffect(state, {
    type: tower.typeId === 'subtract' ? 'subtract-projectile' : 'projectile',
    row: tower.row,
    from: tower.position,
    position: enemy.position,
    label: tower.typeId === 'subtract' ? `−${tower.parameter}`
      : tower.typeId === 'secondDerivative' ? 'D²'
        : tower.typeId === 'definiteIntegralTower' ? `∫${tower.lowerBound}→${tower.upperBound}`
          : tower.typeId === 'evaluateTower' ? `f(${tower.parameter})`
            : tower.typeId === 'eulerTower' ? `xD+${tower.parameter}I`
              : tower.typeId === 'resonanceTower' ? `D²+${tower.parameter}I`
                : 'D',
  });
}

function nearestEnemyInLane(state, tower) {
  return state.enemies
    .filter((enemy) => (
      !enemy.dead
      && enemy.row === tower.row
      && enemy.position >= tower.position - 0.035
      && (tower.typeId !== 'eulerTower' || isEulerCompatible(enemy.expression))
    ))
    .sort((a, b) => a.position - b.position)[0] ?? null;
}

function updateTowers(state, dt) {
  for (const tower of state.towers) {
    const awaitingParameter = ['subtract', 'evaluateTower', 'eulerTower', 'resonanceTower'].includes(tower.typeId)
      && tower.parameter === null;
    const awaitingBounds = tower.typeId === 'definiteIntegralTower'
      && (tower.lowerBound === null || tower.upperBound === null);
    if (!tower.active || awaitingParameter || awaitingBounds) continue;
    tower.cooldown -= dt;
    if (tower.cooldown > 0) continue;

    const target = nearestEnemyInLane(state, tower);
    if (!target) {
      tower.cooldown = Math.min(tower.cooldown, 0);
      continue;
    }

    attackEnemy(state, tower, target);
    tower.cooldown += OPERATORS[tower.typeId].cooldown;
    tower.fireFlash = 0.28;
  }
}

function blockingTower(state, enemy) {
  return state.towers
    .filter((tower) => tower.row === enemy.row && tower.position <= enemy.position + 0.014)
    .sort((a, b) => b.position - a.position)
    .find((tower) => enemy.position - tower.position < 0.065) ?? null;
}

function strike(state, enemy, tower) {
  const hit = Math.max(1, Math.ceil(damage(enemy.expression))) * (enemy.divergentTimer > 0 ? 2 : 1);
  if (tower) {
    tower.hp -= hit;
    addEffect(state, {
      type: 'damage',
      row: tower.row,
      position: tower.position,
      label: `−${hit}`,
    });
    if (tower.hp <= 0) {
      addLog(state, `${OPERATORS[tower.typeId].name} 被係數 ${hit} 擊穿`, 'danger');
      state.towers = state.towers.filter((candidate) => candidate.id !== tower.id);
    }
    return;
  }

  state.baseHp = Math.max(0, state.baseHp - hit);
  state.chain = 0;
  addEffect(state, { type: 'base-damage', row: enemy.row, position: BASE_POSITION, label: `−${hit}` });
  addLog(state, `${formatExpression(enemy.expression)} 對基地造成 ${hit} 傷害`, 'danger');
}

function updateEnemies(state, dt) {
  for (const enemy of state.enemies) {
    if (enemy.dead) continue;
    enemy.attackTimer = Math.max(0, enemy.attackTimer - dt);
    enemy.divergentTimer = Math.max(0, enemy.divergentTimer - dt);
    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);

    const atBase = enemy.position <= BASE_POSITION;
    if (atBase) {
      // Reaching the proof core is a leak, not a new combat target: settle the
      // current coefficient damage once, then remove the enemy without reward.
      strike(state, enemy, null);
      enemy.dead = true;
      continue;
    }

    const blocker = blockingTower(state, enemy);
    if (blocker) {
      if (enemy.attackTimer <= 0) {
        strike(state, enemy, blocker);
        enemy.attackTimer = ATTACK_INTERVAL;
      }
      continue;
    }

    const speedMultiplier = enemy.divergentTimer > 0 ? 1.5 : 1;
    const affixMultiplier = enemy.affixes?.includes('fast') ? 1.35 : 1;
    const baseSpeed = enemy.speed ?? ENEMY_TYPES[enemy.typeId]?.speed ?? 0.015;
    enemy.position = Math.max(BASE_POSITION, enemy.position - baseSpeed * speedMultiplier * affixMultiplier * dt);
  }
}

function updateTransientState(state, dt) {
  for (const tower of state.towers) {
    tower.fireFlash = Math.max(0, tower.fireFlash - dt);
  }
  if (state.effects.length > 0) {
    for (const effect of state.effects) effect.ttl -= dt;
    const liveEffects = state.effects.filter((effect) => effect.ttl > 0);
    if (liveEffects.length !== state.effects.length) state.effects = liveEffects;
  }
  state.bannerTimer = Math.max(0, state.bannerTimer - dt);
  state.toastTimer = Math.max(0, state.toastTimer - dt);
}

function updateQueues(state, dt) {
  if (state.formulaQueue.length < FORMULA_QUEUE_CAPACITY) {
    state.formulaCooldown = Math.max(0, state.formulaCooldown - dt);
    if (state.formulaCooldown <= 0) {
      const item = drawFormulaCard(state);
      state.formulaQueue.push(item);
      if (!state.selectedFormulaId) state.selectedFormulaId = item.id;
      state.formulaCooldown = FORMULA_QUEUE_INTERVAL;
      addEffect(state, { type: 'queue', row: -1, position: 0.94, label: '+ 公式' });
    }
  }

  if (state.constantQueue.length < CONSTANT_QUEUE_CAPACITY) {
    state.constantCooldown = Math.max(0, state.constantCooldown - dt);
    if (state.constantCooldown <= 0) {
      const item = drawGodConstant(state);
      state.constantQueue.push(item);
      if (!state.selectedConstantId) state.selectedConstantId = item.id;
      state.constantCooldown = CONSTANT_QUEUE_INTERVAL;
      addEffect(state, { type: 'queue', row: -1, position: 0.94, label: '+ k' });
    }
  }

  if (state.operatorQueue.length < OPERATOR_QUEUE_CAPACITY) {
    state.operatorCooldown = Math.max(0, state.operatorCooldown - dt);
    if (state.operatorCooldown <= 0) {
      state.operatorQueue.push(drawOperatorCard(state));
      state.operatorCooldown = OPERATOR_QUEUE_INTERVAL;
      addEffect(state, { type: 'queue', row: -1, position: 0.9, label: '+ 軍械' });
    }
  }
}

function checkWaveState(state) {
  if (state.baseHp <= 0) {
    state.phase = 'lost';
    state.selectedOperator = null;
    state.selectedOperatorItemId = null;
    state.targetingOperator = null;
    state.partialConfirmOpen = false;
    return;
  }

  const wave = state.currentWave;
  const allSpawned = state.nextSpawnIndex >= wave.entries.length;
  const noneAlive = !state.enemies.some((enemy) => !enemy.dead);
  if (!allSpawned || !noneAlive) return;

  if (state.chapterIndex < CHAPTERS.length - 1) {
    const completedName = CHAPTERS[state.chapterIndex].name;
    state.baseHp = Math.min(state.maxBaseHp, state.baseHp + state.maxBaseHp * 0.2);
    resetForChapter(state, state.chapterIndex + 1);
    addLog(state, `${completedName}完成；基地修復 100，進入${CHAPTERS[state.chapterIndex].name}`, 'success');
    return;
  }

  if (state.chapterIndex === CHAPTERS.length - 1) {
    const completedName = CHAPTERS[state.chapterIndex].name;
    state.baseHp = Math.min(state.maxBaseHp, state.baseHp + state.maxBaseHp * 0.2);
    resetForChapter(state, CHAPTERS.length);
    addLog(state, `${completedName}完成；無限證明已展開`, 'success');
    return;
  }

  state.endlessRound += 1;
  state.currentWave = generateEndlessWave(state.runSeed, state.endlessRound);
  state.phase = 'preparing';
  state.prepDuration = Math.max(10, 32 - 2 * state.endlessRound);
  state.prepRemaining = state.prepDuration;
  state.waveClock = 0;
  state.nextSpawnIndex = 0;
  state.partialUsed = false;
  state.partialConfirmOpen = false;
  state.chain = 0;
  state.selectedOperator = null;
  state.selectedOperatorItemId = null;
  state.targetingOperator = null;
  state.bannerTimer = 2.4;
  addLog(state, `無限第 ${state.endlessRound - 1} 輪完成；下一輪整備 ${state.prepDuration} 秒`, 'success');
}

function queueItems(state, prefix, values, valueKey) {
  return values.map((value) => ({ id: nextId(state, prefix), [valueKey]: value }));
}

function chapterConfig(index) {
  return index < CHAPTERS.length ? CHAPTERS[index] : ENDLESS_CHAPTER;
}

export function chapterWeaponTutorials(chapterIndex) {
  if (chapterIndex <= 0 || chapterIndex >= CHAPTERS.length) return [];
  return OPERATOR_ORDER.filter((operatorId) => OPERATORS[operatorId]?.unlockChapter === chapterIndex);
}

function resetForChapter(state, chapterIndex) {
  const config = chapterConfig(chapterIndex);
  state.chapterIndex = chapterIndex;
  state.waveIndex = chapterIndex;
  state.endlessRound = chapterIndex >= CHAPTERS.length ? 1 : 0;
  state.board = { ...config.board };
  state.energy = config.startingEnergy;
  state.towers = [];
  state.enemies = [];
  state.effects = [];
  state.operatorQueue = queueItems(state, 'operator', config.starterOperators, 'operatorId');
  state.formulaQueue = queueItems(state, 'formula', config.starterFormulaIds, 'cardId');
  state.constantQueue = queueItems(state, 'constant', config.starterConstants, 'value');
  state.operatorCooldown = OPERATOR_QUEUE_INTERVAL;
  state.formulaCooldown = FORMULA_QUEUE_INTERVAL;
  state.constantCooldown = CONSTANT_QUEUE_INTERVAL;
  state.selectedOperatorItemId = null;
  state.selectedOperator = null;
  state.targetingOperator = null;
  state.selectedFormulaId = state.formulaQueue[0]?.id ?? null;
  state.selectedConstantId = state.constantQueue[0]?.id ?? null;
  state.selectedEnemyId = null;
  if (!state.storedConstants.some((item) => item.id === state.selectedStoredConstantId)) {
    state.selectedStoredConstantId = state.storedConstants[0]?.id ?? null;
  }
  state.partialConfirmOpen = false;
  state.partialUsed = false;
  state.weaponTutorialQueue = chapterWeaponTutorials(chapterIndex);
  state.energyClock = 0;
  state.chain = 0;
  state.waveClock = 0;
  state.nextSpawnIndex = 0;
  state.prepDuration = 30;
  state.prepRemaining = 30;
  state.currentWave = chapterIndex < CHAPTERS.length
    ? generateFiniteWave(state.runSeed, chapterIndex)
    : generateEndlessWave(state.runSeed, 1);
  state.phase = 'preparing';
  state.bannerTimer = 2.6;
}

export function createGame(seed = 20260905) {
  const normalizedSeed = Number(seed) >>> 0;
  const state = {
    phase: 'intro',
    paused: false,
    speed: 1,
    sound: true,
    baseHp: 500,
    maxBaseHp: 500,
    energy: 0,
    runSeed: normalizedSeed,
    chapterIndex: 0,
    endlessRound: 0,
    board: { ...CHAPTERS[0].board },
    waveIndex: 0,
    waveClock: 0,
    nextSpawnIndex: 0,
    energyClock: 0,
    currentWave: null,
    prepDuration: 30,
    prepRemaining: 30,
    formulaQueue: [],
    formulaCooldown: FORMULA_QUEUE_INTERVAL,
    constantQueue: [],
    constantCooldown: CONSTANT_QUEUE_INTERVAL,
    operatorQueue: [],
    operatorCooldown: OPERATOR_QUEUE_INTERVAL,
    selectedFormulaId: null,
    selectedConstantId: null,
    selectedOperatorItemId: null,
    storedConstants: [],
    selectedStoredConstantId: null,
    towers: [],
    enemies: [],
    effects: [],
    logs: [],
    selectedOperator: null,
    targetingOperator: null,
    selectedEnemyId: null,
    partialConfirmOpen: false,
    partialUsed: false,
    tutorialVisible: true,
    weaponTutorialQueue: [],
    bannerTimer: 0,
    toast: '',
    toastTone: 'neutral',
    toastTimer: 0,
    kills: 0,
    chain: 0,
    maxChain: 0,
    nextEntityId: 100,
    rngState: (normalizedSeed ^ 0xa511e9b3) >>> 0,
  };
  resetForChapter(state, 0);
  state.phase = 'intro';
  state.tutorialVisible = true;
  state.logs = [];
  return state;
}

export function startGame(state) {
  if (state.phase !== 'intro') return false;
  state.phase = 'preparing';
  state.tutorialVisible = true;
  addLog(state, '整備開始：從軍械 queue 選牌並配置防線。', 'success');
  return true;
}

function beginWave(state, awardEarly) {
  if (state.phase !== 'preparing') return false;
  const bonusSeconds = awardEarly ? Math.ceil(Math.max(0, state.prepRemaining)) : 0;
  const bonus = Math.min(150, bonusSeconds * 5);
  if (bonus > 0) {
    state.energy += bonus;
    addLog(state, `提早開戰：${bonusSeconds} 秒轉為 Σ${bonus}`, 'success');
  }
  state.phase = 'running';
  state.prepRemaining = 0;
  state.waveClock = 0;
  state.nextSpawnIndex = 0;
  state.partialUsed = false;
  state.selectedOperator = null;
  state.selectedOperatorItemId = null;
  state.targetingOperator = null;
  state.bannerTimer = 2.6;
  addLog(state, `${state.currentWave.name}：開始迎擊`, 'success');
  return true;
}

export function startWave(state) {
  if (state.weaponTutorialQueue.length > 0) {
    notify(state, '先看完本章新軍械教學。', 'danger');
    return false;
  }
  return beginWave(state, true);
}

export function tick(state, rawDt) {
  const dt = Math.min(rawDt, 0.2) * state.speed;
  updateTransientState(state, dt);
  if (state.paused) return;

  if (state.phase === 'preparing') {
    if (state.weaponTutorialQueue.length > 0) return;
    updateQueues(state, dt);
    state.prepRemaining = Math.max(0, state.prepRemaining - dt);
    if (state.prepRemaining <= 0) beginWave(state, false);
    return;
  }
  if (state.phase !== 'running') return;

  state.waveClock += dt;
  state.energyClock += dt;
  while (state.energyClock >= ENERGY_INTERVAL) {
    state.energyClock -= ENERGY_INTERVAL;
    state.energy += ENERGY_GAIN;
    addEffect(state, { type: 'energy', row: -1, position: 0.82, label: `Σ +${ENERGY_GAIN}` });
  }

  const wave = state.currentWave;
  while (
    state.nextSpawnIndex < wave.entries.length
    && wave.entries[state.nextSpawnIndex].spawnAt <= state.waveClock
  ) {
    spawnEnemy(state, wave.entries[state.nextSpawnIndex]);
    state.nextSpawnIndex += 1;
  }

  updateTowers(state, dt);
  updateEnemies(state, dt);
  updateQueues(state, dt);
  state.enemies = state.enemies.filter((enemy) => !enemy.dead);
  checkWaveState(state);
}

function notify(state, text, tone = 'neutral') {
  state.toast = text;
  state.toastTone = tone;
  state.toastTimer = 2.4;
}

export function selectArsenalItem(state, itemId) {
  const item = state.operatorQueue.find((candidate) => candidate.id === itemId);
  const operator = item ? OPERATORS[item.operatorId] : null;
  if (!operator || operator.unlockChapter > state.chapterIndex) {
    notify(state, '這個算子尚未解鎖。', 'danger');
    return false;
  }
  if (state.energy < operator.cost) {
    notify(state, `算力不足，還需要 Σ${operator.cost - state.energy}。`, 'danger');
    return false;
  }
  if (operator.id === 'partial' && state.partialUsed) {
    notify(state, '本波的偏微分卷軸已經用過。', 'danger');
    return false;
  }
  if (operator.id === 'partial' && state.phase !== 'running') {
    notify(state, '全場偏微分只能在波次進行中施放。', 'danger');
    return false;
  }

  if (state.selectedOperatorItemId === itemId) {
    cancelSelection(state);
    return true;
  }

  if (operator.kind === 'tower') {
    state.selectedOperator = operator.id;
    state.selectedOperatorItemId = itemId;
    state.targetingOperator = null;
    state.partialConfirmOpen = false;
  } else if (operator.kind === 'target') {
    state.targetingOperator = operator.id;
    state.selectedOperatorItemId = itemId;
    state.selectedOperator = null;
    state.partialConfirmOpen = false;
    notify(state, '點擊一隻敵人套用這個算子。', 'success');
  } else {
    state.partialConfirmOpen = true;
    state.selectedOperatorItemId = itemId;
    state.selectedOperator = null;
    state.targetingOperator = null;
  }
  return true;
}

export function selectOperator(state, operatorId) {
  const item = state.operatorQueue.find((candidate) => candidate.operatorId === operatorId);
  if (!item) {
    notify(state, '軍械 queue 裡沒有這張牌。', 'danger');
    return false;
  }
  return selectArsenalItem(state, item.id);
}

function consumeOperatorItem(state, itemId = state.selectedOperatorItemId) {
  if (!itemId) return false;
  const before = state.operatorQueue.length;
  state.operatorQueue = state.operatorQueue.filter((item) => item.id !== itemId);
  return state.operatorQueue.length < before;
}

export function cancelSelection(state) {
  state.selectedOperator = null;
  state.selectedOperatorItemId = null;
  state.targetingOperator = null;
  state.partialConfirmOpen = false;
}

export function placeTower(state, row, column) {
  const operator = OPERATORS[state.selectedOperator];
  const operatorItem = state.operatorQueue.find((item) => item.id === state.selectedOperatorItemId);
  if (!operator || operator.kind !== 'tower' || operatorItem?.operatorId !== operator.id) return false;
  if (row < 0 || row >= state.board.rows || column < 0 || column >= state.board.placeableColumns) return false;
  if (state.towers.some((tower) => tower.row === row && tower.column === column)) {
    notify(state, '這個位置已經有裝置了。', 'danger');
    return false;
  }
  if (state.energy < operator.cost) return false;

  state.energy -= operator.cost;
  consumeOperatorItem(state);
  const hp = operator.id === 'definiteIntegralTower' ? 180
    : ['secondDerivative', 'resonanceTower', 'eulerTower'].includes(operator.id) ? 150
      : 120;
  const configurable = ['subtract', 'evaluateTower', 'eulerTower', 'resonanceTower'].includes(operator.id);
  state.towers.push({
    id: nextId(state, 'tower'),
    typeId: operator.id,
    row,
    column,
    position: towerPosition(column, state.board),
    hp,
    maxHp: hp,
    cooldown: operator.id === 'subtract' ? 0.7 : 0.25,
    fireFlash: 0,
    active: true,
    parameter: configurable ? null : undefined,
    lowerBound: operator.id === 'definiteIntegralTower' ? null : undefined,
    upperBound: operator.id === 'definiteIntegralTower' ? null : undefined,
  });
  state.selectedOperator = null;
  state.selectedOperatorItemId = null;
  addLog(state, `放置 ${operator.symbol} ${operator.name}`, 'success');
  return true;
}

export function toggleTower(state, towerId) {
  const tower = state.towers.find((candidate) => candidate.id === towerId);
  if (!tower) return false;
  tower.active = !tower.active;
  notify(state, `${OPERATORS[tower.typeId].name}${tower.active ? '恢復運算' : '暫停運算'}`, tower.active ? 'success' : 'neutral');
  return true;
}

export function discardTower(state, towerId) {
  const tower = state.towers.find((candidate) => candidate.id === towerId);
  if (!tower) return false;
  state.towers = state.towers.filter((candidate) => candidate.id !== towerId);
  addLog(state, `拆除 ${OPERATORS[tower.typeId].name}（算力不退還）`, 'danger');
  notify(state, '砲台已丟棄，算力不退還。', 'neutral');
  return true;
}

export function selectEnemy(state, enemyId) {
  state.selectedEnemyId = enemyId;
}

export function applyTargetOperator(state, enemyId) {
  const operatorId = state.targetingOperator;
  const operator = OPERATORS[operatorId];
  const operatorItem = state.operatorQueue.find((item) => item.id === state.selectedOperatorItemId);
  const enemy = state.enemies.find((candidate) => candidate.id === enemyId && !candidate.dead);
  if (!operator || operatorItem?.operatorId !== operatorId || !enemy || state.energy < operator.cost) return false;

  const before = formatExpression(enemy.expression);
  let nextExpression = null;
  let integrationConstant = null;
  let limitResult = null;

  try {
    if (operatorId === 'integral') {
      const previousRngState = state.rngState;
      const index = Math.floor(seededRandom(state) * INTEGRATION_CONSTANTS.length);
      integrationConstant = INTEGRATION_CONSTANTS[index];
      try {
        nextExpression = integrate(enemy.expression, integrationConstant, 'x');
      } catch (error) {
        state.rngState = previousRngState;
        throw error;
      }
    } else if (operatorId === 'reflect') {
      nextExpression = reflectInput(enemy.expression);
    } else if (operatorId === 'limit') {
      limitResult = limitAtInfinity(enemy.expression);
    }
  } catch (error) {
    const reason = error instanceof Error ? error.message : '定義域錯誤';
    notify(state, `這張牌無法作用：${reason}`, 'danger');
    addLog(state, `${operator.symbol} ${before} 無法運算：${reason}`, 'danger');
    return false;
  }

  state.energy -= operator.cost;
  consumeOperatorItem(state);
  state.targetingOperator = null;
  state.selectedOperatorItemId = null;

  if (operatorId === 'integral') {
    transformEnemy(state, enemy, nextExpression, 'integral', before);
    notify(
      state,
      `積分常數揭曉：C = ${integrationConstant}`,
      integrationConstant === 0 ? 'success' : 'neutral',
    );
  } else if (operatorId === 'reflect') {
    transformEnemy(state, enemy, nextExpression, 'reflect', before);
  } else if (operatorId === 'limit') {
    if (limitResult.status === 'finite') {
      transformEnemy(state, enemy, cloneExpression(limitResult.expression), 'limit', before);
    } else if (enemy.shieldActive) {
      transformEnemy(state, enemy, cloneExpression(enemy.expression), 'limit', before);
    } else {
      enemy.divergentTimer = 6;
      enemy.hitFlash = 0.4;
      addEffect(state, { type: 'divergent', row: enemy.row, position: enemy.position, label: '發散！×2' });
      const label = limitResult.status === 'oscillating' ? '極限不存在' : '發散';
      addLog(state, `lim∞ ${before} ${label}：敵人暴走 6 秒`, 'danger');
      notify(state, `${label}！移速 ×1.5、傷害 ×2。`, 'danger');
    }
  }

  state.enemies = state.enemies.filter((candidate) => !candidate.dead);
  checkWaveState(state);
  return true;
}

export function confirmPartial(state) {
  const operator = OPERATORS.partial;
  const operatorItem = state.operatorQueue.find((item) => item.id === state.selectedOperatorItemId);
  if (
    state.phase !== 'running'
    || !state.partialConfirmOpen
    || state.partialUsed
    || operatorItem?.operatorId !== 'partial'
    || state.energy < operator.cost
  ) return false;
  state.partialConfirmOpen = false;
  state.partialUsed = true;
  state.energy -= operator.cost;
  consumeOperatorItem(state);
  state.selectedOperatorItemId = null;

  for (const enemy of [...state.enemies]) {
    if (enemy.dead) continue;
    const before = formatExpression(enemy.expression);
    const after = differentiate(enemy.expression, 'x', 1);
    transformEnemy(state, enemy, after, 'partial', before);
  }
  state.enemies = state.enemies.filter((enemy) => !enemy.dead);
  addEffect(state, { type: 'global', row: 2, position: 0.55, label: '∂ / ∂x' });
  notify(state, '全場偏微分已結算。', 'success');
  checkWaveState(state);
  return true;
}

export function partialPreview(state) {
  return state.enemies.map((enemy) => {
    const after = enemy.shieldActive
      ? cloneExpression(enemy.expression)
      : differentiate(enemy.expression, 'x', 1);
    return {
      id: enemy.id,
      before: formatExpression(enemy.expression),
      after: formatExpression(after),
      dies: isZero(after),
      shielded: enemy.shieldActive,
      damageBefore: damage(enemy.expression),
      damageAfter: damage(after),
    };
  });
}

export function togglePause(state) {
  if (!['running', 'preparing'].includes(state.phase)) return false;
  state.paused = !state.paused;
  return true;
}

export function advanceWeaponTutorial(state) {
  if (state.phase !== 'preparing' || state.weaponTutorialQueue.length === 0) return false;
  state.weaponTutorialQueue.shift();
  if (state.weaponTutorialQueue.length === 0) {
    addLog(state, '新軍械教學完成；整備倒數開始。', 'success');
  }
  return true;
}

export function toggleSpeed(state) {
  state.speed = state.speed === 1 ? 2 : 1;
}

export function currentWave(state) {
  return state.currentWave;
}

export function selectedEnemy(state) {
  return state.enemies.find((enemy) => enemy.id === state.selectedEnemyId) ?? null;
}

export function enemyThreat(enemy) {
  return Math.max(0, Math.ceil(damage(enemy.expression))) * (enemy.divergentTimer > 0 ? 2 : 1);
}

export function getTowerPosition(column, board = BOARD) {
  return towerPosition(column, board);
}

export function topFormula(state) {
  const item = state.formulaQueue[0];
  const card = item ? formulaCard(item.cardId) : null;
  return card ? { ...card, queueId: item.id } : null;
}

export function topGodConstant(state) {
  return state.constantQueue[0] ?? null;
}

export function currentAssembly(state) {
  const formulaItem = state.formulaQueue.find((item) => item.id === state.selectedFormulaId)
    ?? state.formulaQueue[0];
  const constant = state.constantQueue.find((item) => item.id === state.selectedConstantId)
    ?? state.constantQueue[0];
  const card = formulaItem ? formulaCard(formulaItem.cardId) : null;
  if (!card || !constant) return null;
  return {
    formula: { ...card, queueId: formulaItem.id },
    constant,
    value: card.evaluate({ k: constant.value }),
  };
}

export function discardFormulaItem(state, itemId) {
  const item = state.formulaQueue.find((candidate) => candidate.id === itemId);
  const card = item ? formulaCard(item.cardId) : null;
  if (!card) {
    notify(state, '公式 queue 是空的。', 'danger');
    return false;
  }
  state.formulaQueue = state.formulaQueue.filter((candidate) => candidate.id !== itemId);
  if (!state.formulaQueue.some((item) => item.id === state.selectedFormulaId)) {
    state.selectedFormulaId = state.formulaQueue[0]?.id ?? null;
  }
  addLog(state, `捨棄公式 ${card.label}`, 'danger');
  notify(state, `已捨棄 ${card.label}`, 'neutral');
  return true;
}

export function discardConstantItem(state, itemId) {
  const item = state.constantQueue.find((candidate) => candidate.id === itemId);
  if (!item) {
    notify(state, 'k queue 是空的。', 'danger');
    return false;
  }
  state.constantQueue = state.constantQueue.filter((candidate) => candidate.id !== itemId);
  if (!state.constantQueue.some((item) => item.id === state.selectedConstantId)) {
    state.selectedConstantId = state.constantQueue[0]?.id ?? null;
  }
  addLog(state, `捨棄上帝常數 k = ${item.value}`, 'danger');
  notify(state, `已捨棄 k = ${item.value}`, 'neutral');
  return true;
}

export function discardStoredConstant(state, itemId) {
  const item = state.storedConstants.find((candidate) => candidate.id === itemId);
  if (!item) {
    notify(state, '已組裝常數庫是空的。', 'danger');
    return false;
  }
  state.storedConstants = state.storedConstants.filter((candidate) => candidate.id !== itemId);
  if (state.selectedStoredConstantId === itemId) {
    state.selectedStoredConstantId = state.storedConstants[0]?.id ?? null;
  }
  addLog(state, `捨棄已組裝常數 ${item.value}`, 'danger');
  notify(state, `已捨棄常數 ${item.value}`, 'neutral');
  return true;
}

export function discardArsenalItem(state, itemId) {
  const item = state.operatorQueue.find((candidate) => candidate.id === itemId);
  if (!item) {
    notify(state, '軍械 queue 是空的。', 'danger');
    return false;
  }
  const operator = OPERATORS[item.operatorId];
  state.operatorQueue = state.operatorQueue.filter((candidate) => candidate.id !== itemId);
  if (state.selectedOperatorItemId === itemId) cancelSelection(state);
  addLog(state, `捨棄軍械 ${operator.name}`, 'danger');
  notify(state, `已捨棄 ${operator.name}`, 'neutral');
  return true;
}

export function prepareAssembly(state) {
  if (state.storedConstants.length >= STORED_CONSTANT_CAPACITY) {
    notify(state, `常數庫已滿（${STORED_CONSTANT_CAPACITY}/${STORED_CONSTANT_CAPACITY}）。`, 'danger');
    return false;
  }
  const assembly = currentAssembly(state);
  if (!assembly) {
    notify(state, '兩條 queue 都要有材料才能組合。', 'danger');
    return false;
  }
  state.formulaQueue = state.formulaQueue.filter((item) => item.id !== assembly.formula.queueId);
  state.constantQueue = state.constantQueue.filter((item) => item.id !== assembly.constant.id);
  state.selectedFormulaId = state.formulaQueue[0]?.id ?? null;
  state.selectedConstantId = state.constantQueue[0]?.id ?? null;
  const stored = {
    id: nextId(state, 'stored-constant'),
    value: assembly.value,
    source: `${assembly.formula.label}｜k=${assembly.constant.value}`,
  };
  state.storedConstants.push(stored);
  state.selectedStoredConstantId = stored.id;
  state.selectedOperator = null;
  state.selectedOperatorItemId = null;
  state.targetingOperator = null;
  state.partialConfirmOpen = false;
  addLog(state, `${assembly.formula.label}，k=${assembly.constant.value} → ${assembly.value}`, 'success');
  notify(state, `常數 ${assembly.value} 已存入常數庫。`, 'success');
  return true;
}

export function installAssembly(state, towerId) {
  const stored = state.storedConstants.find((item) => item.id === state.selectedStoredConstantId);
  if (!stored) return false;
  const tower = state.towers.find((candidate) => candidate.id === towerId);
  const configurable = ['subtract', 'definiteIntegralTower', 'evaluateTower', 'eulerTower', 'resonanceTower'];
  if (!tower || !configurable.includes(tower.typeId)) {
    notify(state, '這座塔沒有可裝入常數的空槽。', 'danger');
    return false;
  }

  const value = stored.value;
  if (tower.typeId === 'subtract') {
    tower.parameter = value;
    addLog(state, `參數平移砲完成：P(x) − ${value}`, 'success');
  } else if (tower.typeId === 'evaluateTower') {
    tower.parameter = value;
    addLog(state, `代入塔完成：f(${value})`, 'success');
  } else if (tower.typeId === 'eulerTower') {
    tower.parameter = value;
    addLog(state, `Euler 塔完成：xD + ${value}I`, 'success');
  } else if (tower.typeId === 'resonanceTower') {
    tower.parameter = value;
    addLog(state, `共振塔完成：D² + ${value}I`, 'success');
  } else if (tower.lowerBound === null) {
    tower.lowerBound = value;
    addLog(state, `定積分塔下界裝入 ${value}`, 'success');
  } else if (tower.upperBound === null) {
    tower.upperBound = value;
    addLog(state, `定積分塔上界裝入 ${value}`, 'success');
  } else {
    tower.lowerBound = value;
    tower.upperBound = null;
    addLog(state, `定積分塔重新組裝：下界 ${value}，等待上界`, 'success');
  }

  state.storedConstants = state.storedConstants.filter((item) => item.id !== stored.id);
  state.selectedStoredConstantId = state.storedConstants[0]?.id ?? null;
  tower.active = true;
  notify(state, tower.typeId === 'definiteIntegralTower' ? '積分界已裝入。' : '參數塔已啟動。', 'success');
  return true;
}

export function selectStoredConstant(state, itemId) {
  if (!state.storedConstants.some((item) => item.id === itemId)) return false;
  state.selectedStoredConstantId = state.selectedStoredConstantId === itemId ? null : itemId;
  return true;
}

export function formulaQueueDetails(state) {
  const constant = state.constantQueue.find((item) => item.id === state.selectedConstantId)?.value
    ?? state.constantQueue[0]?.value;
  return state.formulaQueue.map((item) => {
    const card = formulaCard(item.cardId);
    return {
      id: item.id,
      label: card.label,
      value: constant === undefined ? null : card.evaluate({ k: constant }),
      selected: item.id === state.selectedFormulaId,
    };
  });
}

export function constantQueueDetails(state) {
  return state.constantQueue.map((item) => ({ ...item, selected: item.id === state.selectedConstantId }));
}

export function selectFormulaItem(state, itemId) {
  if (!state.formulaQueue.some((item) => item.id === itemId)) return false;
  state.selectedFormulaId = itemId;
  return true;
}

export function selectConstantItem(state, itemId) {
  if (!state.constantQueue.some((item) => item.id === itemId)) return false;
  state.selectedConstantId = itemId;
  return true;
}
