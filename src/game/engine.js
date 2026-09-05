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
import { chapterTutorial, generateTutorialWave } from './tutorial-content.js';

const GRID_START = 0.155;
const GRID_END = 0.89;
const BASE_POSITION = 0.125;
const ATTACK_INTERVAL = 1.15;
const ENERGY_INTERVAL = 5;
const ENERGY_GAIN = 25;
const PROJECTILE_TRAVEL_SECONDS = Object.freeze({
  lane: 0.52,
  drop: 0.56,
});
const PROJECTILE_IMPACT_LINGER = 0.3;
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
  const createdEffect = { id: nextId(state, 'fx'), ttl: 0.9, ...effect };
  state.effects.push(createdEffect);
  return createdEffect;
}

function addOperatorProjectile(state, operatorId, target, source = null, details = {}) {
  const projectile = OPERATORS[operatorId]?.projectile;
  if (!projectile) throw new Error(`Missing projectile configuration for ${operatorId}`);
  const delay = Math.max(0, Number(details.delay) || 0);
  const travelTime = PROJECTILE_TRAVEL_SECONDS[projectile.trajectory];
  const impactIn = delay + travelTime;
  return addEffect(state, {
    type: 'projectile',
    operatorId,
    shape: projectile.shape,
    trajectory: projectile.trajectory,
    targetId: target.id,
    sourceTowerId: source?.id ?? null,
    row: target.row,
    position: target.position,
    ...(source ? { from: source.position } : {}),
    ...details,
    delay,
    travelTime,
    impactIn,
    progress: 0,
    status: 'flying',
    impactResolved: false,
    missed: false,
    ttl: impactIn + PROJECTILE_IMPACT_LINGER,
  });
}

function operatorLabel(id) {
  return OPERATORS[id]?.symbol ?? id;
}

function hasActiveShield(enemy) {
  return enemy.shieldExpression !== null && enemy.shieldExpression !== undefined;
}

export function activeEnemyExpression(enemy) {
  return hasActiveShield(enemy) ? enemy.shieldExpression : enemy.expression;
}

function spawnEnemy(state, entry) {
  const legacyEntry = Array.isArray(entry);
  const typeId = legacyEntry ? entry[0] : entry.typeId;
  const row = legacyEntry ? entry[1] : entry.row;
  const type = ENEMY_TYPES[typeId] ?? {};
  const expression = cloneExpression(entry.expression ?? type.create());
  const affixes = [...(entry.affixes ?? [])];
  const shieldSource = affixes.includes('shield')
    ? (entry.shieldExpression ?? expression)
    : null;
  const shieldExpression = shieldSource && !isZero(shieldSource)
    ? cloneExpression(shieldSource)
    : null;
  state.enemies.push({
    id: nextId(state, 'enemy'),
    typeId,
    name: entry.name ?? type.name ?? '程序函數',
    art: entry.art ?? type.art ?? 'enemy-art-polynomial',
    family: entry.family ?? 'polynomial',
    row,
    position: 0.955,
    expression,
    speed: entry.speed ?? type.speed,
    reward: entry.reward ?? type.reward,
    affixes,
    shieldExpression,
    // Kept as a synchronized compatibility mirror while presentation code
    // migrates to the expression itself as the authoritative shield state.
    shieldActive: shieldExpression !== null,
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
      shieldExpression: null,
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
  const nextText = formatExpression(nextExpression);
  if (hasActiveShield(enemy)) {
    enemy.hitFlash = 0.32;
    if (!isZero(nextExpression)) {
      enemy.shieldExpression = nextExpression;
      enemy.shieldActive = true;
      addEffect(state, {
        type: 'operator',
        row: enemy.row,
        position: enemy.position,
        label: operatorLabel(source),
        equation: `${previousText} → ${nextText}`,
        layer: 'shield',
      });
      addLog(state, `護盾 ${operatorLabel(source)}　${previousText} → ${nextText}`);
      return true;
    }

    enemy.shieldExpression = null;
    enemy.shieldActive = false;
    addEffect(state, {
      type: 'shield',
      row: enemy.row,
      position: enemy.position,
      label: '護盾破裂',
      equation: `${previousText} → ${nextText}`,
    });
    addLog(state, `護盾 ${operatorLabel(source)}　${previousText} → 0　破除！`, 'success');
    return true;
  }

  enemy.expression = nextExpression;
  enemy.hitFlash = 0.32;
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

function evaluateOperatorOutcome(operatorId, targetExpression, details = {}) {
  if (operatorId === 'derivative' || operatorId === 'partial') {
    return { kind: 'transform', expression: differentiate(targetExpression, 'x', 1) };
  }
  if (operatorId === 'secondDerivative') {
    return { kind: 'transform', expression: differentiate(targetExpression, 'x', 2) };
  }
  if (operatorId === 'subtract') {
    return { kind: 'transform', expression: subtractConstant(targetExpression, details.parameter) };
  }
  if (operatorId === 'definiteIntegralTower') {
    return {
      kind: 'transform',
      expression: definiteIntegral(targetExpression, details.lowerBound, details.upperBound, 'x'),
    };
  }
  if (operatorId === 'evaluateTower') {
    return { kind: 'transform', expression: polynomial(evaluateAt(targetExpression, details.parameter)) };
  }
  if (operatorId === 'resonanceTower') {
    return {
      kind: 'transform',
      expression: addExpressions(
        differentiate(targetExpression, 'x', 2),
        scaleExpression(targetExpression, details.parameter),
      ),
    };
  }
  if (operatorId === 'eulerTower') {
    return {
      kind: 'transform',
      expression: addExpressions(
        multiplyByX(differentiate(targetExpression, 'x', 1)),
        scaleExpression(targetExpression, details.parameter),
      ),
    };
  }
  if (operatorId === 'integral') {
    return {
      kind: 'transform',
      expression: integrate(targetExpression, details.integrationConstant, 'x'),
    };
  }
  if (operatorId === 'reflect') {
    return { kind: 'transform', expression: reflectInput(targetExpression) };
  }
  if (operatorId === 'limit') {
    return { kind: 'limit', result: limitAtInfinity(targetExpression) };
  }
  throw new Error(`Unsupported operator: ${operatorId}`);
}

function reportOperatorError(state, operatorId, previousText, error, sourceTowerId = null) {
  const reason = error instanceof Error ? error.message : '定義域錯誤';
  const tower = sourceTowerId
    ? state.towers.find((candidate) => candidate.id === sourceTowerId)
    : null;
  if (tower) {
    tower.active = false;
    notify(state, '運算遇到定義域或自由變數；這座塔已停火。', 'danger');
  } else {
    notify(state, `命中時無法作用：${reason}`, 'danger');
  }
  addLog(state, `${operatorLabel(operatorId)} ${previousText} 無法運算：${reason}`, 'danger');
}

function resolveProjectileImpact(state, effect, enemy, frameDt) {
  effect.status = 'impacted';
  effect.impactResolved = true;
  effect.progress = 1;
  effect.impactIn = 0;
  // updateTransientState subtracts this frame immediately after resolution;
  // include it so even a long or 2× frame still renders the full hit pulse.
  effect.ttl = PROJECTILE_IMPACT_LINGER + frameDt;
  effect.row = enemy.row;
  effect.position = enemy.position;

  const targetExpression = activeEnemyExpression(enemy);
  const previousText = formatExpression(targetExpression);
  let outcome;
  try {
    outcome = evaluateOperatorOutcome(effect.operatorId, targetExpression, effect);
  } catch (error) {
    reportOperatorError(state, effect.operatorId, previousText, error, effect.sourceTowerId);
    return;
  }

  if (outcome.kind === 'transform') {
    transformEnemy(state, enemy, outcome.expression, effect.operatorId, previousText);
    if (effect.operatorId === 'integral') {
      notify(
        state,
        `積分常數揭曉：C = ${effect.integrationConstant}`,
        effect.integrationConstant === 0 ? 'success' : 'neutral',
      );
    }
    return;
  }

  if (outcome.result.status === 'finite') {
    transformEnemy(
      state,
      enemy,
      cloneExpression(outcome.result.expression),
      effect.operatorId,
      previousText,
    );
    return;
  }

  enemy.divergentTimer = 6;
  enemy.hitFlash = 0.4;
  addEffect(state, {
    type: 'divergent',
    row: enemy.row,
    position: enemy.position,
    label: '發散！×2',
  });
  const label = outcome.result.status === 'oscillating' ? '極限不存在' : '發散';
  addLog(state, `lim∞ ${previousText} ${label}：敵人暴走 6 秒`, 'danger');
  notify(state, `${label}！移速 ×1.5、傷害 ×2。`, 'danger');
}

function attackEnemy(state, tower, enemy) {
  const targetExpression = activeEnemyExpression(enemy);
  const previousText = formatExpression(targetExpression);
  const details = {
    parameter: tower.parameter,
    lowerBound: tower.lowerBound,
    upperBound: tower.upperBound,
  };

  try {
    // Preflight keeps invalid towers from firing, but the result is discarded.
    // The live expression is evaluated again when the projectile actually hits.
    evaluateOperatorOutcome(tower.typeId, targetExpression, details);
  } catch (error) {
    reportOperatorError(state, tower.typeId, previousText, error, tower.id);
    return false;
  }

  addOperatorProjectile(state, tower.typeId, enemy, tower, details);
  return true;
}

function nearestEnemyInLane(state, tower) {
  return state.enemies
    .filter((enemy) => (
      !enemy.dead
      && enemy.row === tower.row
      && enemy.position >= tower.position - 0.035
      && (tower.typeId !== 'eulerTower' || isEulerCompatible(activeEnemyExpression(enemy)))
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

    if (attackEnemy(state, tower, target)) {
      tower.cooldown += OPERATORS[tower.typeId].cooldown;
      tower.fireFlash = 0.28;
    }
  }
}

function blockingTower(state, enemy) {
  return state.towers
    .filter((tower) => tower.row === enemy.row && tower.position <= enemy.position + 0.014)
    .sort((a, b) => b.position - a.position)
    .find((tower) => enemy.position - tower.position < 0.065) ?? null;
}

function enemyMovementSpeed(enemy) {
  const speedMultiplier = enemy.divergentTimer > 0 ? 1.5 : 1;
  const affixMultiplier = enemy.affixes?.includes('fast') ? 1.35 : 1;
  const baseSpeed = enemy.speed ?? ENEMY_TYPES[enemy.typeId]?.speed ?? 0.015;
  return baseSpeed * speedMultiplier * affixMultiplier;
}

function timeUntilBase(state, enemy) {
  if (blockingTower(state, enemy)) return Number.POSITIVE_INFINITY;
  const movementSpeed = enemyMovementSpeed(enemy);
  if (movementSpeed <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, (enemy.position - BASE_POSITION) / movementSpeed);
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

    enemy.position = Math.max(BASE_POSITION, enemy.position - enemyMovementSpeed(enemy) * dt);
    if (enemy.position <= BASE_POSITION) {
      strike(state, enemy, null);
      enemy.dead = true;
    }
  }
}

function updateProjectileImpacts(state, dt) {
  const flyingProjectiles = state.effects
    .map((effect, index) => ({ effect, index }))
    .filter(({ effect }) => effect.type === 'projectile' && !effect.impactResolved)
    .sort((left, right) => (
      left.effect.impactIn - right.effect.impactIn || left.index - right.index
    ))
    .map(({ effect }) => effect);

  for (const effect of flyingProjectiles) {
    const target = state.enemies.find((enemy) => (
      enemy.id === effect.targetId
      && !enemy.dead
      && enemy.position > BASE_POSITION
    ));
    if (!target) {
      effect.status = 'missed';
      effect.impactResolved = true;
      effect.missed = true;
      effect.ttl = 0;
      continue;
    }

    // Resolve events chronologically inside a long frame. If this enemy reaches
    // the proof core before this projectile would arrive, the shot is a miss;
    // updateEnemies will settle the body damage later in the same tick.
    const baseIn = timeUntilBase(state, target);
    if (baseIn <= dt + 1e-9 && baseIn + 1e-9 < effect.impactIn) {
      effect.status = 'missed';
      effect.impactResolved = true;
      effect.missed = true;
      effect.ttl = 0;
      continue;
    }

    effect.row = target.row;
    effect.position = target.position;
    const reachesTarget = effect.impactIn <= dt + 1e-9;
    effect.impactIn = reachesTarget ? 0 : effect.impactIn - dt;
    const elapsed = effect.delay + effect.travelTime - effect.impactIn;
    effect.progress = Math.max(0, Math.min(1, (elapsed - effect.delay) / effect.travelTime));
    if (reachesTarget) resolveProjectileImpact(state, effect, target, dt);
  }
}

function updateTransientState(state, dt) {
  for (const tower of state.towers) {
    tower.fireFlash = Math.max(0, tower.fireFlash - dt);
  }
  // Age existing enemy timers before resolving this frame's hits so a newly
  // applied hit flash or six-second divergence receives its full duration.
  for (const enemy of state.enemies) {
    enemy.attackTimer = Math.max(0, enemy.attackTimer - dt);
    enemy.divergentTimer = Math.max(0, enemy.divergentTimer - dt);
    enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
  }
  if (state.phase === 'running') updateProjectileImpacts(state, dt);
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

function clearProjectiles(state) {
  state.effects = state.effects.filter((effect) => effect.type !== 'projectile');
}

function checkWaveState(state) {
  const wave = state.currentWave;
  if (state.baseHp <= 0) {
    clearProjectiles(state);
    if (wave?.kind === 'tutorial') {
      restartTutorialWave(state);
      return;
    }
    state.phase = 'lost';
    state.selectedOperator = null;
    state.selectedOperatorItemId = null;
    state.targetingOperator = null;
    state.partialConfirmOpen = false;
    return;
  }

  const allSpawned = state.nextSpawnIndex >= wave.entries.length;
  const noneAlive = !state.enemies.some((enemy) => !enemy.dead);
  if (!allSpawned || !noneAlive) return;
  // Let Vue render the final glyph at contact and finish its short hit pulse
  // before configureWave clears effects for the next chapter or tutorial.
  if (state.effects.some((effect) => (
    effect.type === 'projectile' && effect.status === 'impacted'
  ))) return;
  state.enemies = state.enemies.filter((enemy) => !enemy.dead);
  clearProjectiles(state);

  if (wave.kind === 'tutorial') {
    prepareFiniteChallenge(state);
    return;
  }

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
  if (chapterIndex < 0 || chapterIndex >= CHAPTERS.length) return [];
  return OPERATOR_ORDER.filter((operatorId) => OPERATORS[operatorId]?.unlockChapter === chapterIndex);
}

export function chapterEnemyTutorials(chapterIndex) {
  if (chapterIndex < 0 || chapterIndex >= CHAPTERS.length) return [];
  return [...chapterTutorial(chapterIndex).enemyGuideIds];
}

function towerHp(typeId) {
  if (typeId === 'definiteIntegralTower') return 180;
  if (['secondDerivative', 'resonanceTower', 'eulerTower'].includes(typeId)) return 150;
  return 120;
}

function createPresetTower(state, spec) {
  const configurable = ['subtract', 'evaluateTower', 'eulerTower', 'resonanceTower'].includes(spec.typeId);
  const hp = towerHp(spec.typeId);
  return {
    id: nextId(state, 'tutorial-tower'),
    typeId: spec.typeId,
    row: spec.row,
    column: spec.column,
    position: towerPosition(spec.column, state.board),
    hp,
    maxHp: hp,
    cooldown: 0.25,
    fireFlash: 0,
    active: true,
    parameter: configurable ? (spec.parameter ?? null) : undefined,
    lowerBound: spec.typeId === 'definiteIntegralTower' ? (spec.lowerBound ?? null) : undefined,
    upperBound: spec.typeId === 'definiteIntegralTower' ? (spec.upperBound ?? null) : undefined,
    tutorialPreset: true,
  };
}

function configureWave(state, config, supply, wave, presetTowers = []) {
  state.energy = config.startingEnergy;
  state.enemies = [];
  state.effects = [];
  state.operatorQueue = queueItems(state, 'operator', supply.starterOperators, 'operatorId');
  state.formulaQueue = queueItems(state, 'formula', supply.starterFormulaIds, 'cardId');
  state.constantQueue = queueItems(state, 'constant', supply.starterConstants, 'value');
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
  state.energyClock = 0;
  state.chain = 0;
  state.waveClock = 0;
  state.nextSpawnIndex = 0;
  state.prepDuration = 30;
  state.prepRemaining = 30;
  state.currentWave = wave;
  state.phase = 'preparing';
  state.bannerTimer = 2.6;
  state.towers = presetTowers.map((tower) => createPresetTower(state, tower));
}

function snapshotTutorialState(state) {
  return {
    baseHp: state.baseHp,
    kills: state.kills,
    maxChain: state.maxChain,
    rngState: state.rngState,
    storedConstants: state.storedConstants.map((item) => ({ ...item })),
    selectedStoredConstantId: state.selectedStoredConstantId,
  };
}

function restoreTutorialState(state) {
  const snapshot = state.tutorialSnapshot;
  if (!snapshot) return;
  state.baseHp = snapshot.baseHp;
  state.kills = snapshot.kills;
  state.maxChain = snapshot.maxChain;
  state.rngState = snapshot.rngState;
  state.storedConstants = snapshot.storedConstants.map((item) => ({ ...item }));
  state.selectedStoredConstantId = snapshot.selectedStoredConstantId;
}

function setupTutorialWave(state, chapterIndex, showIntroductions) {
  const config = CHAPTERS[chapterIndex];
  const tutorial = chapterTutorial(chapterIndex);
  configureWave(state, config, tutorial, generateTutorialWave(chapterIndex), tutorial.presetTowers);
  state.enemyTutorialQueue = showIntroductions ? chapterEnemyTutorials(chapterIndex) : [];
  state.weaponTutorialQueue = showIntroductions ? chapterWeaponTutorials(chapterIndex) : [];
}

function restartTutorialWave(state) {
  restoreTutorialState(state);
  setupTutorialWave(state, state.chapterIndex, false);
  addLog(state, '教學核心歸零；固定演練已重置，不會扣除正式關卡資源。', 'danger');
  notify(state, '教學波已重置，再試一次。', 'neutral');
}

function prepareFiniteChallenge(state) {
  const completedTutorial = state.currentWave.name;
  restoreTutorialState(state);
  const config = CHAPTERS[state.chapterIndex];
  configureWave(state, config, config, generateFiniteWave(state.runSeed, state.chapterIndex));
  state.enemyTutorialQueue = [];
  state.weaponTutorialQueue = [];
  state.tutorialSnapshot = null;
  addLog(state, `${completedTutorial}完成；正式隨機波整備開始。`, 'success');
}

function resetForChapter(state, chapterIndex) {
  const config = chapterConfig(chapterIndex);
  state.chapterIndex = chapterIndex;
  state.waveIndex = chapterIndex;
  state.endlessRound = chapterIndex >= CHAPTERS.length ? 1 : 0;
  state.board = { ...config.board };
  if (chapterIndex < CHAPTERS.length) {
    state.tutorialSnapshot = snapshotTutorialState(state);
    setupTutorialWave(state, chapterIndex, true);
    return;
  }
  state.tutorialSnapshot = null;
  state.enemyTutorialQueue = [];
  state.weaponTutorialQueue = [];
  configureWave(state, config, config, generateEndlessWave(state.runSeed, 1));
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
    enemyTutorialQueue: [],
    weaponTutorialQueue: [],
    tutorialSnapshot: null,
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
  addLog(state, '第 1 章教學開始：先認識新敵人與固定教具。', 'success');
  return true;
}

function beginWave(state, awardEarly) {
  if (state.phase !== 'preparing') return false;
  const bonusSeconds = awardEarly && state.currentWave.kind !== 'tutorial'
    ? Math.ceil(Math.max(0, state.prepRemaining))
    : 0;
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
  if (state.enemyTutorialQueue.length > 0 || state.weaponTutorialQueue.length > 0) {
    notify(state, '先看完本章敵人與軍械教學。', 'danger');
    return false;
  }
  return beginWave(state, true);
}

export function tick(state, rawDt) {
  if (state.paused) return;
  const dt = Math.min(rawDt, 0.2) * state.speed;
  updateTransientState(state, dt);

  if (state.phase === 'preparing') {
    if (state.enemyTutorialQueue.length > 0 || state.weaponTutorialQueue.length > 0) return;
    updateQueues(state, dt);
    state.prepRemaining = Math.max(0, state.prepRemaining - dt);
    if (state.prepRemaining <= 0) beginWave(state, false);
    return;
  }
  if (state.phase !== 'running') return;

  // A final hit may keep its impact pulse alive briefly. During that visual-only
  // linger, do not advance combat clocks, refill queues, or consume RNG.
  if (
    state.nextSpawnIndex >= state.currentWave.entries.length
    && !state.enemies.some((enemy) => !enemy.dead)
  ) {
    checkWaveState(state);
    return;
  }

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
  if (tower.tutorialPreset) {
    notify(state, '教學預置砲台不能丟棄。', 'neutral');
    return false;
  }
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
  const enemy = state.enemies.find((candidate) => (
    candidate.id === enemyId
    && !candidate.dead
    && candidate.position > BASE_POSITION
  ));
  if (!operator || operatorItem?.operatorId !== operatorId || !enemy || state.energy < operator.cost) return false;

  const targetExpression = activeEnemyExpression(enemy);
  const before = formatExpression(targetExpression);
  const details = {};
  const previousRngState = state.rngState;

  try {
    if (operatorId === 'integral') {
      const index = Math.floor(seededRandom(state) * INTEGRATION_CONSTANTS.length);
      details.integrationConstant = INTEGRATION_CONSTANTS[index];
    }
    // Validate before consuming the card. The actual operation is recalculated
    // against the active enemy layer only after the falling glyph makes contact.
    evaluateOperatorOutcome(operatorId, targetExpression, details);
  } catch (error) {
    state.rngState = previousRngState;
    const reason = error instanceof Error ? error.message : '定義域錯誤';
    notify(state, `這張牌無法作用：${reason}`, 'danger');
    addLog(state, `${operator.symbol} ${before} 無法運算：${reason}`, 'danger');
    return false;
  }

  state.energy -= operator.cost;
  consumeOperatorItem(state);
  state.targetingOperator = null;
  state.selectedOperatorItemId = null;
  addOperatorProjectile(state, operatorId, enemy, null, details);
  notify(state, `${operator.symbol} 彈頭已發射；命中後結算。`, 'success');
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
  const targets = state.enemies.filter((enemy) => !enemy.dead && enemy.position > BASE_POSITION);
  if (targets.length === 0) {
    notify(state, '目前沒有可命中的敵人，偏微分尚未施放。', 'neutral');
    return false;
  }
  state.partialConfirmOpen = false;
  state.partialUsed = true;
  state.energy -= operator.cost;
  consumeOperatorItem(state);
  state.selectedOperatorItemId = null;

  targets.forEach((enemy, index) => {
    addOperatorProjectile(state, 'partial', enemy, null, {
      delay: Math.min(index * 0.035, 0.18),
    });
  });
  notify(state, `全場偏微分已發射 ${targets.length} 枚彈頭。`, 'success');
  return true;
}

export function partialPreview(state) {
  return state.enemies.filter((enemy) => (
    !enemy.dead && enemy.position > BASE_POSITION
  )).map((enemy) => {
    const shielded = hasActiveShield(enemy);
    const beforeExpression = activeEnemyExpression(enemy);
    const after = differentiate(beforeExpression, 'x', 1);
    const reachesZero = isZero(after);
    return {
      id: enemy.id,
      before: formatExpression(beforeExpression),
      after: formatExpression(after),
      dies: !shielded && reachesZero,
      shielded,
      breaksShield: shielded && reachesZero,
      layer: shielded ? 'shield' : 'body',
      damageBefore: damage(beforeExpression),
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

export function advanceEnemyTutorial(state) {
  if (state.phase !== 'preparing' || state.enemyTutorialQueue.length === 0) return false;
  state.enemyTutorialQueue.shift();
  if (state.enemyTutorialQueue.length === 0) {
    addLog(state, '新敵人介紹完成；接著確認本章新軍械。', 'success');
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
