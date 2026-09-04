import {
  cloneExpression,
  damage,
  definiteIntegral,
  differentiate,
  formatExpression,
  integrate,
  isZero,
  limitAtInfinity,
  reflectInput,
  subtractConstant,
} from '../domain/expression.js';
import {
  BOARD,
  CONSTANT_QUEUE_CAPACITY,
  CONSTANT_QUEUE_INTERVAL,
  ENEMY_TYPES,
  FORMULA_CARDS,
  FORMULA_QUEUE_CAPACITY,
  FORMULA_QUEUE_INTERVAL,
  GOD_CONSTANT_VALUES,
  INTEGRATION_CONSTANTS,
  OPERATORS,
  WAVES,
} from './content.js';

const GRID_START = 0.155;
const GRID_END = 0.89;
const BASE_POSITION = 0.125;
const ATTACK_INTERVAL = 1.15;
const ENERGY_INTERVAL = 5;
const ENERGY_GAIN = 25;
const INITIAL_FORMULA_IDS = ['kPlus10', 'kMinus5', 'doubleK', 'negateK'];
const INITIAL_CONSTANT_VALUES = [5, 2, -3, 7];

const towerPosition = (column) => (
  GRID_START + ((column + 0.5) / BOARD.columns) * (GRID_END - GRID_START)
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

function spawnEnemy(state, [typeId, row]) {
  const type = ENEMY_TYPES[typeId];
  state.enemies.push({
    id: nextId(state, 'enemy'),
    typeId,
    row,
    position: 0.955,
    expression: type.create(),
    attackTimer: 0,
    divergentTimer: 0,
    hitFlash: 0,
  });
}

function finishEnemy(state, enemy, reason) {
  if (enemy.dead) return;
  enemy.dead = true;
  state.energy += ENEMY_TYPES[enemy.typeId].reward;
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
}

function transformEnemy(state, enemy, nextExpression, source, previousText) {
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
}

function attackEnemy(state, tower, enemy) {
  const previousText = formatExpression(enemy.expression);
  let nextExpression;

  if (tower.typeId === 'derivative') {
    nextExpression = differentiate(enemy.expression, 'x', 1);
  } else if (tower.typeId === 'secondDerivative') {
    nextExpression = differentiate(enemy.expression, 'x', 2);
  } else if (tower.typeId === 'subtract') {
    nextExpression = subtractConstant(enemy.expression, tower.parameter);
  } else if (tower.typeId === 'definiteIntegralTower') {
    try {
      nextExpression = definiteIntegral(enemy.expression, tower.lowerBound, tower.upperBound, 'x');
    } catch {
      tower.active = false;
      notify(state, '定積分後仍含自由變數；這座塔已停火。', 'danger');
      addLog(state, `∫ ${previousText} 仍含 y，定積分塔停火`, 'danger');
      return;
    }
  } else {
    return;
  }

  transformEnemy(state, enemy, nextExpression, tower.typeId, previousText);
  addEffect(state, {
    type: tower.typeId === 'subtract' ? 'subtract-projectile' : 'projectile',
    row: tower.row,
    from: tower.position,
    position: enemy.position,
    label: tower.typeId === 'subtract'
      ? `−${tower.parameter}`
      : tower.typeId === 'secondDerivative'
        ? 'D²'
        : tower.typeId === 'definiteIntegralTower'
          ? `∫${tower.lowerBound}→${tower.upperBound}`
          : 'D',
  });
}

function nearestEnemyInLane(state, row, origin) {
  return state.enemies
    .filter((enemy) => !enemy.dead && enemy.row === row && enemy.position >= origin - 0.035)
    .sort((a, b) => a.position - b.position)[0] ?? null;
}

function updateTowers(state, dt) {
  for (const tower of state.towers) {
    const awaitingParameter = tower.typeId === 'subtract' && tower.parameter === null;
    const awaitingBounds = tower.typeId === 'definiteIntegralTower'
      && (tower.lowerBound === null || tower.upperBound === null);
    if (!tower.active || awaitingParameter || awaitingBounds) continue;
    tower.cooldown -= dt;
    if (tower.cooldown > 0) continue;

    const target = nearestEnemyInLane(state, tower.row, tower.position);
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

    const blocker = blockingTower(state, enemy);
    const atBase = enemy.position <= BASE_POSITION;
    if (blocker || atBase) {
      if (enemy.attackTimer <= 0) {
        strike(state, enemy, blocker);
        enemy.attackTimer = ATTACK_INTERVAL;
      }
      continue;
    }

    const speedMultiplier = enemy.divergentTimer > 0 ? 1.5 : 1;
    enemy.position = Math.max(BASE_POSITION, enemy.position - ENEMY_TYPES[enemy.typeId].speed * speedMultiplier * dt);
  }
}

function updateTransientState(state, dt) {
  for (const tower of state.towers) {
    tower.fireFlash = Math.max(0, tower.fireFlash - dt);
  }
  for (const effect of state.effects) effect.ttl -= dt;
  state.effects = state.effects.filter((effect) => effect.ttl > 0);
  state.bannerTimer = Math.max(0, state.bannerTimer - dt);
  state.toastTimer = Math.max(0, state.toastTimer - dt);
}

function updateQueues(state, dt) {
  if (state.formulaQueue.length >= FORMULA_QUEUE_CAPACITY) {
    state.formulaCooldown = 0;
  } else {
    state.formulaCooldown = Math.max(0, state.formulaCooldown - dt);
    if (state.formulaCooldown <= 0) {
      const item = drawFormulaCard(state);
      state.formulaQueue.push(item);
      if (!state.selectedFormulaId) state.selectedFormulaId = item.id;
      state.formulaCooldown = FORMULA_QUEUE_INTERVAL;
      addEffect(state, { type: 'queue', row: -1, position: 0.94, label: '+ 公式' });
    }
  }

  if (state.constantQueue.length >= CONSTANT_QUEUE_CAPACITY) {
    state.constantCooldown = 0;
  } else {
    state.constantCooldown = Math.max(0, state.constantCooldown - dt);
    if (state.constantCooldown <= 0) {
      const item = drawGodConstant(state);
      state.constantQueue.push(item);
      if (!state.selectedConstantId) state.selectedConstantId = item.id;
      state.constantCooldown = CONSTANT_QUEUE_INTERVAL;
      addEffect(state, { type: 'queue', row: -1, position: 0.94, label: '+ k' });
    }
  }
}

function checkWaveState(state) {
  if (state.baseHp <= 0) {
    state.phase = 'lost';
    state.selectedOperator = null;
    state.targetingOperator = null;
    return;
  }

  const wave = WAVES[state.waveIndex];
  const allSpawned = state.nextSpawnIndex >= wave.entries.length;
  const noneAlive = !state.enemies.some((enemy) => !enemy.dead);
  if (!allSpawned || !noneAlive) return;

  if (state.waveIndex === WAVES.length - 1) {
    state.phase = 'won';
    addLog(state, '所有函數都已化為 0，證明完成！', 'success');
  } else {
    state.waveIndex += 1;
    state.phase = 'intermission';
    state.energy += 90;
    state.partialUsed = false;
    state.bannerTimer = 2.4;
    addLog(state, `第 ${state.waveIndex} 波完成，獲得 Σ90`, 'success');
  }
}

export function createGame(seed = 20260905) {
  return {
    phase: 'intro',
    paused: false,
    speed: 1,
    sound: true,
    baseHp: 500,
    maxBaseHp: 500,
    energy: 540,
    waveIndex: 0,
    waveClock: 0,
    nextSpawnIndex: 0,
    energyClock: 0,
    formulaQueue: INITIAL_FORMULA_IDS.map((cardId, index) => ({ id: `formula-seed-${index}`, cardId })),
    formulaCooldown: FORMULA_QUEUE_INTERVAL,
    constantQueue: INITIAL_CONSTANT_VALUES.map((value, index) => ({ id: `constant-seed-${index}`, value })),
    constantCooldown: CONSTANT_QUEUE_INTERVAL,
    selectedFormulaId: 'formula-seed-0',
    selectedConstantId: 'constant-seed-0',
    assemblyValue: null,
    assemblySource: null,
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
    bannerTimer: 0,
    toast: '',
    toastTone: 'neutral',
    toastTimer: 0,
    kills: 0,
    chain: 0,
    maxChain: 0,
    nextEntityId: 100,
    rngState: seed >>> 0,
  };
}

export function startGame(state) {
  state.phase = 'planning';
  state.tutorialVisible = true;
  addLog(state, '選擇算子，點擊發亮格子放置。', 'success');
}

export function startWave(state) {
  if (!['planning', 'intermission'].includes(state.phase)) return false;
  state.phase = 'running';
  state.waveClock = 0;
  state.nextSpawnIndex = 0;
  state.partialUsed = false;
  state.selectedOperator = null;
  state.targetingOperator = null;
  state.bannerTimer = 2.6;
  addLog(state, `第 ${state.waveIndex + 1} 波：${WAVES[state.waveIndex].name}`, 'success');
  return true;
}

export function tick(state, rawDt) {
  const dt = Math.min(rawDt, 0.2) * state.speed;
  updateTransientState(state, dt);
  if (state.phase !== 'running' || state.paused) return;

  state.waveClock += dt;
  state.energyClock += dt;
  while (state.energyClock >= ENERGY_INTERVAL) {
    state.energyClock -= ENERGY_INTERVAL;
    state.energy += ENERGY_GAIN;
    addEffect(state, { type: 'energy', row: -1, position: 0.82, label: `Σ +${ENERGY_GAIN}` });
  }

  const wave = WAVES[state.waveIndex];
  while (
    state.nextSpawnIndex < wave.entries.length
    && wave.entries[state.nextSpawnIndex][2] <= state.waveClock
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

export function selectOperator(state, operatorId) {
  const operator = OPERATORS[operatorId];
  if (!operator || operator.unlockWave > state.waveIndex) {
    notify(state, '這個算子尚未解鎖。', 'danger');
    return false;
  }
  if (state.energy < operator.cost) {
    notify(state, `算力不足，還需要 Σ${operator.cost - state.energy}。`, 'danger');
    return false;
  }
  if (operatorId === 'partial' && state.partialUsed) {
    notify(state, '本波的偏微分卷軸已經用過。', 'danger');
    return false;
  }

  if (operator.kind === 'tower') {
    state.selectedOperator = state.selectedOperator === operatorId ? null : operatorId;
    state.targetingOperator = null;
    state.partialConfirmOpen = false;
  } else if (operator.kind === 'target') {
    state.targetingOperator = state.targetingOperator === operatorId ? null : operatorId;
    state.selectedOperator = null;
    state.partialConfirmOpen = false;
    if (state.targetingOperator) notify(state, '點擊一隻敵人套用這個算子。', 'success');
  } else {
    state.partialConfirmOpen = true;
    state.selectedOperator = null;
    state.targetingOperator = null;
  }
  return true;
}

export function cancelSelection(state) {
  state.selectedOperator = null;
  state.targetingOperator = null;
  state.partialConfirmOpen = false;
}

export function placeTower(state, row, column) {
  const operator = OPERATORS[state.selectedOperator];
  if (!operator || operator.kind !== 'tower') return false;
  if (row < 0 || row >= BOARD.rows || column < 0 || column >= BOARD.placeableColumns) return false;
  if (state.towers.some((tower) => tower.row === row && tower.column === column)) {
    notify(state, '這個位置已經有裝置了。', 'danger');
    return false;
  }
  if (state.energy < operator.cost) return false;

  state.energy -= operator.cost;
  const hp = operator.id === 'definiteIntegralTower' ? 180 : operator.id === 'secondDerivative' ? 150 : 120;
  state.towers.push({
    id: nextId(state, 'tower'),
    typeId: operator.id,
    row,
    column,
    position: towerPosition(column),
    hp,
    maxHp: hp,
    cooldown: operator.id === 'subtract' ? 0.7 : 0.25,
    fireFlash: 0,
    active: true,
    parameter: operator.id === 'subtract' ? null : undefined,
    lowerBound: operator.id === 'definiteIntegralTower' ? null : undefined,
    upperBound: operator.id === 'definiteIntegralTower' ? null : undefined,
  });
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
  const enemy = state.enemies.find((candidate) => candidate.id === enemyId && !candidate.dead);
  if (!operator || !enemy || state.energy < operator.cost) return false;

  const before = formatExpression(enemy.expression);
  state.energy -= operator.cost;
  state.targetingOperator = null;

  if (operatorId === 'integral') {
    const index = Math.floor(seededRandom(state) * INTEGRATION_CONSTANTS.length);
    const constant = INTEGRATION_CONSTANTS[index];
    const after = integrate(enemy.expression, constant, 'x');
    transformEnemy(state, enemy, after, 'integral', before);
    notify(state, `積分常數揭曉：C = ${constant}`, constant === 0 ? 'success' : 'neutral');
  } else if (operatorId === 'reflect') {
    transformEnemy(state, enemy, reflectInput(enemy.expression), 'reflect', before);
  } else if (operatorId === 'limit') {
    const result = limitAtInfinity(enemy.expression);
    if (result.status === 'finite') {
      transformEnemy(state, enemy, cloneExpression(result.expression), 'limit', before);
    } else {
      enemy.divergentTimer = 6;
      enemy.hitFlash = 0.4;
      addEffect(state, { type: 'divergent', row: enemy.row, position: enemy.position, label: '發散！×2' });
      addLog(state, `lim∞ ${before} 發散：敵人暴走 6 秒`, 'danger');
      notify(state, '極限發散！移速 ×1.5、傷害 ×2。', 'danger');
    }
  }

  state.enemies = state.enemies.filter((candidate) => !candidate.dead);
  checkWaveState(state);
  return true;
}

export function confirmPartial(state) {
  const operator = OPERATORS.partial;
  if (!state.partialConfirmOpen || state.partialUsed || state.energy < operator.cost) return false;
  state.partialConfirmOpen = false;
  state.partialUsed = true;
  state.energy -= operator.cost;

  for (const enemy of state.enemies) {
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
    const after = differentiate(enemy.expression, 'x', 1);
    return {
      id: enemy.id,
      before: formatExpression(enemy.expression),
      after: formatExpression(after),
      dies: isZero(after),
      damageBefore: damage(enemy.expression),
      damageAfter: damage(after),
    };
  });
}

export function togglePause(state) {
  if (!['running', 'planning', 'intermission'].includes(state.phase)) return;
  state.paused = !state.paused;
}

export function toggleSpeed(state) {
  state.speed = state.speed === 1 ? 2 : 1;
}

export function currentWave(state) {
  return WAVES[state.waveIndex];
}

export function selectedEnemy(state) {
  return state.enemies.find((enemy) => enemy.id === state.selectedEnemyId) ?? null;
}

export function enemyThreat(enemy) {
  return Math.max(0, Math.ceil(damage(enemy.expression))) * (enemy.divergentTimer > 0 ? 2 : 1);
}

export function getTowerPosition(column) {
  return towerPosition(column);
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

export function prepareAssembly(state) {
  if (state.assemblyValue !== null) {
    notify(state, '先把手上的常數裝入一座空槽塔。', 'danger');
    return false;
  }
  const assembly = currentAssembly(state);
  if (!assembly) {
    notify(state, '兩條 queue 都要有 top 才能組合。', 'danger');
    return false;
  }
  state.formulaQueue = state.formulaQueue.filter((item) => item.id !== assembly.formula.queueId);
  state.constantQueue = state.constantQueue.filter((item) => item.id !== assembly.constant.id);
  state.selectedFormulaId = state.formulaQueue[0]?.id ?? null;
  state.selectedConstantId = state.constantQueue[0]?.id ?? null;
  state.assemblyValue = assembly.value;
  state.assemblySource = `${assembly.formula.label}｜k=${assembly.constant.value}`;
  state.selectedOperator = null;
  state.targetingOperator = null;
  addLog(state, `${assembly.formula.label}，k=${assembly.constant.value} → ${assembly.value}`, 'success');
  notify(state, `常數 ${assembly.value} 已組好；點擊有空槽的塔。`, 'success');
  return true;
}

export function installAssembly(state, towerId) {
  if (state.assemblyValue === null) return false;
  const tower = state.towers.find((candidate) => candidate.id === towerId);
  if (!tower || !['subtract', 'definiteIntegralTower'].includes(tower.typeId)) {
    notify(state, '這座塔沒有可裝入常數的空槽。', 'danger');
    return false;
  }

  const value = state.assemblyValue;
  if (tower.typeId === 'subtract') {
    tower.parameter = value;
    addLog(state, `參數平移砲完成：P(x) − ${value}`, 'success');
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

  state.assemblyValue = null;
  state.assemblySource = null;
  tower.active = true;
  notify(state, tower.typeId === 'subtract' ? `塔已啟動：P−${value}` : '積分界已裝入。', 'success');
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
