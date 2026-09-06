import {
  addConstant,
  addExpressions,
  cloneExpression,
  damage,
  definiteIntegral,
  differentiate,
  divideExpression,
  formatExpression,
  integrate,
  isZero,
  limitAtInfinity,
  multiplyByX,
  multiplyExpression,
  reflectInput,
  scaleExpression,
  squareRootExpression,
  substituteX,
  subtractConstant,
} from '../domain/expression.js';
import { GAMEPLAY_CONFIG } from '../config/gameplay.js';
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
import { generateEndlessWave, generateFiniteSegment } from './level-generator.js';
import { chapterTutorial, generateTutorialWave } from './tutorial-content.js';

const {
  combat: COMBAT,
  economy: ECONOMY,
  effects: EFFECTS,
  geometry: GEOMETRY,
  initialState: INITIAL_STATE,
  limits: LIMITS,
  simulation: SIMULATION,
  wave: WAVE,
} = GAMEPLAY_CONFIG;
const towerPosition = (column, board = BOARD) => (
  GEOMETRY.gridStart
  + ((column + GEOMETRY.cellCenterOffset) / board.columns)
    * (GEOMETRY.gridEnd - GEOMETRY.gridStart)
);

const nextId = (state, prefix) => `${prefix}-${state.nextEntityId++}`;

function seededRandom(state) {
  state.rngState = (state.rngState * 1664525 + 1013904223) >>> 0;
  return state.rngState / 4294967296;
}

function formulaCard(id) {
  return FORMULA_CARDS.find((card) => card.id === id);
}

function parameterKeys(operator) {
  return operator?.kind === 'target' ? (operator.parameterKeys ?? []) : [];
}

function parameterScrollReady(item, operator = OPERATORS[item?.operatorId]) {
  const keys = parameterKeys(operator);
  return keys.length > 0 && keys.every((key) => item?.[key] !== null && item?.[key] !== undefined);
}

function parameterDetails(item, operator = OPERATORS[item?.operatorId]) {
  return Object.fromEntries(parameterKeys(operator).map((key) => [key, item[key]]));
}

function unlockedScrollLibrary(state) {
  return OPERATOR_ORDER
    .map((operatorId) => OPERATORS[operatorId])
    .filter((operator) => operator?.kind !== 'tower' && operator.unlockChapter <= state.chapterIndex)
    .map((operator) => ({
      id: `unlimited-${operator.id}`,
      operatorId: operator.id,
      source: 'unlimited',
      unlimited: true,
    }));
}

function arsenalItems(state) {
  return [...(state.scrollLibrary ?? []), ...state.operatorQueue];
}

function findArsenalItem(state, itemId) {
  return arsenalItems(state).find((item) => item.id === itemId);
}

function towerQueueLength(state) {
  return state.operatorQueue.length;
}

function hasUnlockedTower(state) {
  return Object.values(OPERATORS).some((operator) => (
    operator.kind === 'tower' && operator.unlockChapter <= state.chapterIndex
  ));
}

const towerOperatorIds = (operatorIds = []) => operatorIds.filter(
  (operatorId) => OPERATORS[operatorId]?.kind === 'tower',
);

function drawFormulaCard(state) {
  const index = Math.floor(seededRandom(state) * FORMULA_CARDS.length);
  return { id: nextId(state, 'formula'), cardId: FORMULA_CARDS[index].id, source: 'random' };
}

function drawGodConstant(state) {
  const index = Math.floor(seededRandom(state) * GOD_CONSTANT_VALUES.length);
  return { id: nextId(state, 'constant'), value: GOD_CONSTANT_VALUES[index], source: 'random' };
}

function operatorCounterWeight(operator, requiredTags) {
  const matches = (operator.counterTags ?? []).filter((tag) => requiredTags.includes(tag)).length;
  return ECONOMY.operatorDrawBaseWeight + matches * ECONOMY.operatorDrawCounterTagBonus;
}

function drawOperatorCard(state) {
  const counts = state.operatorQueue.reduce((map, item) => {
    map[item.operatorId] = (map[item.operatorId] ?? 0) + 1;
    return map;
  }, {});
  let candidates = Object.values(OPERATORS).filter((operator) => (
    operator.kind === 'tower'
    &&
    operator.unlockChapter <= state.chapterIndex
    && (counts[operator.id] ?? 0) < ECONOMY.operatorDrawMaxCopies
  ));
  if (candidates.length === 0) {
    candidates = Object.values(OPERATORS).filter((operator) => (
      operator.kind === 'tower' && operator.unlockChapter <= state.chapterIndex
    ));
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
  return { id: nextId(state, 'operator'), operatorId: selected.id, source: 'random' };
}

function addLog(state, equation, tone = 'neutral') {
  state.logs.unshift({ id: nextId(state, 'log'), equation, tone });
  state.logs = state.logs.slice(0, LIMITS.logEntries);
}

function addEffect(state, effect) {
  const createdEffect = { id: nextId(state, 'fx'), ttl: EFFECTS.defaultLifetimeSeconds, ...effect };
  state.effects.push(createdEffect);
  return createdEffect;
}

function addOperatorProjectile(state, operatorId, target, source = null, details = {}) {
  const projectile = OPERATORS[operatorId]?.projectile;
  if (!projectile) throw new Error(`Missing projectile configuration for ${operatorId}`);
  const delay = Math.max(0, Number(details.delay) || 0);
  const travelTime = EFFECTS.projectileTravelSeconds[projectile.trajectory];
  const impactIn = delay + travelTime;
  const laneProjectile = projectile.trajectory === 'lane' && source;
  const destinationPosition = laneProjectile
    ? GEOMETRY.projectileExitPosition
    : target.position;
  return addEffect(state, {
    type: 'projectile',
    operatorId,
    shape: projectile.shape,
    trajectory: projectile.trajectory,
    targetId: target.id,
    initialTargetId: target.id,
    sourceTowerId: source?.id ?? null,
    row: target.row,
    position: destinationPosition,
    ...(source ? { from: source.position } : {}),
    ...(laneProjectile ? {
      currentPosition: source.position,
      destinationPosition,
      impactTargetId: null,
    } : {}),
    ...details,
    delay,
    travelTime,
    impactIn,
    progress: 0,
    status: 'flying',
    impactResolved: false,
    missed: false,
    ttl: impactIn + EFFECTS.projectileImpactLingerSeconds,
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
    position: GEOMETRY.enemySpawnPosition,
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
  enemy.splitExpressions.slice(0, COMBAT.split.maxChildren).forEach((expression, index) => {
    state.enemies.push({
      id: nextId(state, 'enemy'),
      typeId: `${enemy.typeId}-child`,
      name: `${enemy.name}・分項`,
      art: enemy.art,
      family: enemy.family,
      row: enemy.row,
      position: Math.min(
        COMBAT.split.maximumPosition,
        enemy.position + COMBAT.split.positionOffset * index,
      ),
      expression: cloneExpression(expression),
      speed: enemy.speed * COMBAT.split.childSpeedMultiplier,
      reward: Math.max(
        COMBAT.split.minimumReward,
        Math.ceil(enemy.reward * COMBAT.split.childRewardMultiplier),
      ),
      affixes: [],
      shieldExpression: null,
      shieldActive: false,
      splitExpressions: [],
      attackTimer: COMBAT.split.firstAttackDelaySeconds
        + index * COMBAT.split.attackDelayStepSeconds,
      divergentTimer: 0,
      hitFlash: 0,
    });
  });
  addEffect(state, {
    type: 'split',
    row: enemy.row,
    position: enemy.position,
    label: `分裂 ×${Math.min(COMBAT.split.maxChildren, enemy.splitExpressions.length)}`,
  });
}

function finishEnemy(state, enemy, reason) {
  if (enemy.dead) return;
  enemy.dead = true;
  if (state.selectedEnemyId === enemy.id) state.selectedEnemyId = null;
  const baseReward = enemy.reward ?? ENEMY_TYPES[enemy.typeId]?.reward ?? ECONOMY.fallbackEnemyReward;
  const reward = enemy.affixes?.includes('split')
    ? Math.max(
      COMBAT.split.minimumReward,
      Math.ceil(baseReward * COMBAT.split.parentRewardMultiplier),
    )
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
    enemy.hitFlash = COMBAT.enemyHitFlashSeconds;
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
  enemy.hitFlash = COMBAT.enemyHitFlashSeconds;
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
  if (operatorId === 'add') {
    return { kind: 'transform', expression: addConstant(targetExpression, details.parameter) };
  }
  if (operatorId === 'derivative') {
    return { kind: 'transform', expression: differentiate(targetExpression, 'x', 1) };
  }
  if (operatorId === 'partial') {
    return { kind: 'transform', expression: differentiate(targetExpression, 'z', 1) };
  }
  if (operatorId === 'secondDerivative') {
    return { kind: 'transform', expression: differentiate(targetExpression, 'x', 2) };
  }
  if (operatorId === 'subtract') {
    return { kind: 'transform', expression: subtractConstant(targetExpression, details.parameter) };
  }
  if (operatorId === 'multiply') {
    return { kind: 'transform', expression: multiplyExpression(targetExpression, details.parameter) };
  }
  if (operatorId === 'divide') {
    return { kind: 'transform', expression: divideExpression(targetExpression, details.parameter) };
  }
  if (operatorId === 'squareRoot') {
    return { kind: 'transform', expression: squareRootExpression(targetExpression) };
  }
  if (operatorId === 'definiteIntegralTower') {
    return {
      kind: 'transform',
      expression: definiteIntegral(targetExpression, details.lowerBound, details.upperBound, 'x'),
    };
  }
  if (operatorId === 'evaluateTower') {
    return { kind: 'transform', expression: substituteX(targetExpression, details.parameter) };
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
    notify(state, `運算錯誤，砲台已停火：${reason}`, 'danger');
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
  effect.ttl = EFFECTS.projectileImpactLingerSeconds + frameDt;
  effect.row = enemy.row;
  effect.position = enemy.position;
  effect.targetId = enemy.id;
  if (effect.trajectory === 'lane') {
    effect.currentPosition = enemy.position;
    effect.destinationPosition = enemy.position;
    effect.impactTargetId = enemy.id;
  }

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

  enemy.divergentTimer = COMBAT.divergence.durationSeconds;
  enemy.hitFlash = COMBAT.divergence.hitFlashSeconds;
  addEffect(state, {
    type: 'divergent',
    row: enemy.row,
    position: enemy.position,
    label: `發散！×${COMBAT.divergence.damageMultiplier}`,
  });
  const label = outcome.result.status === 'oscillating' ? '極限不存在' : '發散';
  addLog(
    state,
    `lim∞ ${previousText} ${label}：敵人暴走 ${COMBAT.divergence.durationSeconds} 秒`,
    'danger',
  );
  notify(
    state,
    `${label}！移速 ×${COMBAT.divergence.speedMultiplier}、傷害 ×${COMBAT.divergence.damageMultiplier}。`,
    'danger',
  );
}

function advanceProjectileFlight(effect, dt) {
  const reachesDestination = effect.impactIn <= dt + 1e-9;
  effect.impactIn = reachesDestination ? 0 : effect.impactIn - dt;
  const elapsed = effect.delay + effect.travelTime - effect.impactIn;
  effect.progress = Math.max(0, Math.min(1, (elapsed - effect.delay) / effect.travelTime));
  return reachesDestination;
}

function resolveProjectileMiss(effect, frameDt) {
  effect.status = 'missed';
  effect.impactResolved = true;
  effect.missed = true;
  effect.progress = 1;
  effect.impactIn = 0;
  // Keep the projectile at its original destination long enough for the
  // presentation layer to fade it instead of removing it between frames.
  effect.ttl = EFFECTS.projectileImpactLingerSeconds + frameDt;
}

function resolveLaneExit(effect) {
  effect.status = 'exited';
  effect.impactResolved = true;
  effect.missed = true;
  effect.progress = 1;
  effect.impactIn = 0;
  effect.currentPosition = effect.destinationPosition;
  // The glyph is already fully outside the clipped battlefield at this point,
  // so no on-screen fade or linger is needed.
  effect.ttl = 0;
}

function laneProjectilePosition(effect) {
  if (Number.isFinite(effect.currentPosition)) return effect.currentPosition;
  const from = Number(effect.from);
  const destination = Number(effect.destinationPosition ?? effect.position);
  if (!Number.isFinite(from) || !Number.isFinite(destination)) return GEOMETRY.basePosition;
  return from + ((destination - from) * effect.progress);
}

function laneProjectileSpeed(effect) {
  const from = Number(effect.from);
  const destination = Number(effect.destinationPosition ?? effect.position);
  const travelTime = Number(effect.travelTime);
  if (!Number.isFinite(from) || !Number.isFinite(destination) || travelTime <= 0) return 0;
  return Math.max(0, (destination - from) / travelTime);
}

function laneEnemiesAhead(state, effect) {
  const projectilePosition = laneProjectilePosition(effect);
  return state.enemies
    .filter((enemy) => (
      !enemy.dead
      && enemy.row === effect.row
      && enemy.position > GEOMETRY.basePosition
      && enemy.position >= projectilePosition - COMBAT.tower.targetRearTolerance
    ))
    .sort((left, right) => left.position - right.position);
}

function findLaneCollision(state, effect, dt, minimumTime = 0) {
  const projectilePosition = laneProjectilePosition(effect);
  const projectileSpeed = laneProjectileSpeed(effect);
  const flightTime = Math.min(dt, Math.max(0, effect.impactIn));
  if (projectileSpeed <= 0 || flightTime <= 0) return null;

  let collision = null;
  for (const enemy of laneEnemiesAhead(state, effect)) {
    const enemySpeed = blockingTower(state, enemy) ? 0 : enemyMovementSpeed(enemy);
    const gap = Math.max(0, enemy.position - projectilePosition);
    const collisionIn = gap / (projectileSpeed + enemySpeed);
    if (collisionIn + 1e-9 < minimumTime) continue;
    if (collisionIn > flightTime + 1e-9) continue;
    if (timeUntilBase(state, enemy) + 1e-9 < collisionIn) continue;
    if (
      !collision
      || collisionIn < collision.time - 1e-9
      || (
        Math.abs(collisionIn - collision.time) <= 1e-9
        && enemy.position < collision.enemy.position
      )
    ) {
      collision = {
        enemy,
        time: collisionIn,
        position: projectilePosition + projectileSpeed * collisionIn,
      };
    }
  }
  return collision;
}

function advanceLaneProjectile(effect, dt) {
  const reachesExit = advanceProjectileFlight(effect, dt);
  const from = Number(effect.from);
  const destination = Number(effect.destinationPosition);
  effect.currentPosition = from + ((destination - from) * effect.progress);
  return reachesExit;
}

function nextProjectileEvent(state, effect, dt, minimumTime) {
  if (effect.trajectory === 'lane') {
    const collision = findLaneCollision(state, effect, dt, minimumTime);
    const exitIn = effect.impactIn <= dt + 1e-9 ? effect.impactIn : Number.POSITIVE_INFINITY;
    if (collision && collision.time <= exitIn + 1e-9) {
      return { effect, kind: 'lane-impact', ...collision };
    }
    if (exitIn >= minimumTime - 1e-9 && Number.isFinite(exitIn)) {
      return { effect, kind: 'lane-exit', time: exitIn };
    }
    return null;
  }

  const arrivalIn = effect.impactIn;
  if (arrivalIn + 1e-9 < minimumTime || arrivalIn > dt + 1e-9) return null;
  const target = state.enemies.find((enemy) => (
    enemy.id === effect.targetId
    && !enemy.dead
    && enemy.position > GEOMETRY.basePosition
  ));
  if (!target || timeUntilBase(state, target) + 1e-9 < arrivalIn) {
    return { effect, kind: 'drop-miss', time: arrivalIn, target };
  }
  return { effect, kind: 'drop-impact', time: arrivalIn, enemy: target };
}

function resolveLaneCollision(state, event, frameDt) {
  const { effect, enemy, position } = event;
  advanceLaneProjectile(effect, event.time);
  const originalPosition = enemy.position;
  enemy.position = position;
  resolveProjectileImpact(state, effect, enemy, frameDt);
  if (!enemy.dead) enemy.position = originalPosition;
}

function advanceUnresolvedProjectile(state, effect, dt) {
  if (effect.trajectory === 'lane') {
    advanceLaneProjectile(effect, dt);
    effect.targetId = laneEnemiesAhead(state, effect)[0]?.id ?? null;
    return;
  }

  const target = state.enemies.find((enemy) => enemy.id === effect.targetId && !enemy.dead);
  if (target) {
    effect.row = target.row;
    effect.position = target.position;
  }
  advanceProjectileFlight(effect, dt);
}

function attackEnemy(state, tower, enemy) {
  const targetExpression = activeEnemyExpression(enemy);
  const previousText = formatExpression(targetExpression);
  const details = {};

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
      && enemy.position >= tower.position
    ))
    .sort((a, b) => a.position - b.position)[0] ?? null;
}

function updateTowers(state, dt) {
  // Enemies advance from right to left. Resolve towers from the forward edge
  // back toward the core so lane operations follow board order regardless of
  // deployment order.
  const firingOrder = [...state.towers].sort((left, right) => (
    right.position - left.position
  ));
  for (const tower of firingOrder) {
    if (!tower.active) continue;
    tower.cooldown -= dt;
    if (tower.cooldown > 0) continue;

    const target = nearestEnemyInLane(state, tower);
    if (!target) {
      // A ready tower may wait indefinitely, but it must not bank missed
      // cooldown cycles and burst several projectiles when a target appears.
      tower.cooldown = 0;
      continue;
    }

    if (attackEnemy(state, tower, target)) {
      tower.cooldown += OPERATORS[tower.typeId].cooldown;
      tower.fireFlash = COMBAT.towerFireFlashSeconds;
    }
  }
}

function blockingTower(state, enemy) {
  return state.towers
    .filter((tower) => (
      tower.row === enemy.row
      && tower.position <= enemy.position + COMBAT.tower.blockerForwardTolerance
    ))
    .sort((a, b) => b.position - a.position)
    .find((tower) => enemy.position - tower.position < COMBAT.tower.blockingDistance) ?? null;
}

function enemyMovementSpeed(enemy) {
  const speedMultiplier = enemy.divergentTimer > 0 ? COMBAT.divergence.speedMultiplier : 1;
  const affixMultiplier = enemy.affixes?.includes('fast') ? COMBAT.fastAffixSpeedMultiplier : 1;
  const baseSpeed = enemy.speed ?? ENEMY_TYPES[enemy.typeId]?.speed ?? COMBAT.defaultEnemySpeed;
  return baseSpeed * speedMultiplier * affixMultiplier;
}

function timeUntilBase(state, enemy) {
  if (blockingTower(state, enemy)) return Number.POSITIVE_INFINITY;
  const movementSpeed = enemyMovementSpeed(enemy);
  if (movementSpeed <= 0) return Number.POSITIVE_INFINITY;
  return Math.max(0, (enemy.position - GEOMETRY.basePosition) / movementSpeed);
}

function strike(state, enemy, tower) {
  const hit = Math.max(COMBAT.minimumDamage, Math.ceil(damage(enemy.expression)))
    * (enemy.divergentTimer > 0 ? COMBAT.divergence.damageMultiplier : 1);
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
  addEffect(state, {
    type: 'base-damage',
    row: enemy.row,
    position: GEOMETRY.basePosition,
    label: `−${hit}`,
  });
  addLog(state, `${formatExpression(enemy.expression)} 對基地造成 ${hit} 傷害`, 'danger');
}

function updateEnemies(state, dt) {
  for (const enemy of state.enemies) {
    if (enemy.dead) continue;

    const atBase = enemy.position <= GEOMETRY.basePosition;
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
        enemy.attackTimer = COMBAT.enemyAttackIntervalSeconds;
      }
      continue;
    }

    enemy.position = Math.max(
      GEOMETRY.basePosition,
      enemy.position - enemyMovementSpeed(enemy) * dt,
    );
    if (enemy.position <= GEOMETRY.basePosition) {
      strike(state, enemy, null);
      enemy.dead = true;
    }
  }
}

function updateProjectileImpacts(state, dt) {
  const pending = state.effects.filter((effect) => (
    effect.type === 'projectile' && !effect.impactResolved
  ));
  let eventTime = 0;

  while (pending.length > 0) {
    const events = pending
      .map((effect, index) => ({ event: nextProjectileEvent(state, effect, dt, eventTime), index }))
      .filter(({ event }) => event)
      .sort((left, right) => left.event.time - right.event.time || left.index - right.index);
    const next = events[0]?.event;
    if (!next) break;

    pending.splice(pending.indexOf(next.effect), 1);
    eventTime = Math.max(eventTime, next.time);
    if (next.kind === 'lane-impact') {
      resolveLaneCollision(state, next, dt);
    } else if (next.kind === 'lane-exit') {
      advanceLaneProjectile(next.effect, next.time);
      resolveLaneExit(next.effect);
    } else if (next.kind === 'drop-impact') {
      next.effect.row = next.enemy.row;
      next.effect.position = next.enemy.position;
      advanceProjectileFlight(next.effect, next.time);
      resolveProjectileImpact(state, next.effect, next.enemy, dt);
    } else {
      if (next.target && timeUntilBase(state, next.target) + 1e-9 < next.time) {
        next.effect.row = next.target.row;
        next.effect.position = GEOMETRY.basePosition;
      }
      advanceProjectileFlight(next.effect, next.time);
      resolveProjectileMiss(next.effect, dt);
    }
  }

  for (const effect of pending) advanceUnresolvedProjectile(state, effect, dt);
}

function syncResolvedProjectiles(state) {
  for (const effect of state.effects) {
    if (effect.type !== 'projectile' || !effect.impactResolved || effect.missed) continue;
    const target = state.enemies.find((enemy) => enemy.id === effect.targetId && !enemy.dead);
    if (!target) continue;
    effect.row = target.row;
    effect.position = target.position;
    if (effect.trajectory === 'lane') {
      effect.currentPosition = target.position;
      effect.destinationPosition = target.position;
    }
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
      addEffect(state, {
        type: 'queue',
        row: GEOMETRY.effectRow,
        position: GEOMETRY.formulaAndConstantQueueEffectPosition,
        label: '+ 公式',
      });
    }
  }

  if (state.constantQueue.length < CONSTANT_QUEUE_CAPACITY) {
    state.constantCooldown = Math.max(0, state.constantCooldown - dt);
    if (state.constantCooldown <= 0) {
      const item = drawGodConstant(state);
      state.constantQueue.push(item);
      if (!state.selectedConstantId) state.selectedConstantId = item.id;
      state.constantCooldown = CONSTANT_QUEUE_INTERVAL;
      addEffect(state, {
        type: 'queue',
        row: GEOMETRY.effectRow,
        position: GEOMETRY.formulaAndConstantQueueEffectPosition,
        label: '+ k',
      });
    }
  }

  if (hasUnlockedTower(state) && towerQueueLength(state) < OPERATOR_QUEUE_CAPACITY) {
    state.operatorCooldown = Math.max(0, state.operatorCooldown - dt);
    if (state.operatorCooldown <= 0) {
      state.operatorQueue.push(drawOperatorCard(state));
      state.operatorCooldown = OPERATOR_QUEUE_INTERVAL;
      addEffect(state, {
        type: 'queue',
        row: GEOMETRY.effectRow,
        position: GEOMETRY.operatorQueueEffectPosition,
        label: '+ 軍械',
      });
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
  // The enemy card is already gone, but every launched projectile must still
  // hit another enemy or leave the battlefield before the wave can advance.
  if (state.effects.some((effect) => effect.type === 'projectile')) return;
  state.enemies = state.enemies.filter((enemy) => !enemy.dead);
  clearProjectiles(state);

  if (wave.kind === 'tutorial') {
    prepareFiniteSegment(state, 1);
    return;
  }

  if (state.chapterIndex < CHAPTERS.length && wave.segmentIndex === 1) {
    prepareFiniteSegment(state, 2);
    addLog(state, `${CHAPTERS[state.chapterIndex].name}壓力段完成；混合段整備開始`, 'success');
    return;
  }

  if (state.chapterIndex < CHAPTERS.length) {
    state.phase = 'won';
    state.selectedOperator = null;
    state.selectedOperatorItemId = null;
    state.targetingOperator = null;
    state.partialConfirmOpen = false;
    addLog(state, `${CHAPTERS[state.chapterIndex].name}完成！`, 'success');
    return;
  }

  state.endlessRound += 1;
  state.currentWave = generateEndlessWave(state.runSeed, state.endlessRound);
  grantGuaranteedSupply(state, state.currentWave);
  state.phase = 'preparing';
  state.prepDuration = Math.max(
    WAVE.endlessMinimumPreparationSeconds,
    WAVE.endlessPreparationBaseSeconds
      - WAVE.endlessPreparationDecreasePerRoundSeconds * state.endlessRound,
  );
  state.prepRemaining = state.prepDuration;
  state.waveClock = 0;
  state.nextSpawnIndex = 0;
  state.partialUsed = false;
  state.partialConfirmOpen = false;
  state.chain = 0;
  state.selectedOperator = null;
  state.selectedOperatorItemId = null;
  state.targetingOperator = null;
  state.bannerTimer = EFFECTS.endlessBannerSeconds;
  addLog(state, `無限第 ${state.endlessRound - 1} 輪完成；下一輪整備 ${state.prepDuration} 秒`, 'success');
}

function queueItems(state, prefix, values, valueKey, source = 'tutorial') {
  return values.map((value) => ({ id: nextId(state, prefix), [valueKey]: value, source }));
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
  if (COMBAT.tower.durableTypeIds.includes(typeId)) return COMBAT.tower.durableHp;
  return COMBAT.tower.defaultHp;
}

function resetWaveRuntime(state, wave) {
  state.enemies = [];
  state.effects = [];
  state.selectedOperatorItemId = null;
  state.selectedOperator = null;
  state.targetingOperator = null;
  state.selectedEnemyId = null;
  state.partialConfirmOpen = false;
  state.partialUsed = false;
  state.energyClock = 0;
  state.chain = 0;
  state.waveClock = 0;
  state.nextSpawnIndex = 0;
  state.prepDuration = WAVE.finitePreparationSeconds;
  state.prepRemaining = WAVE.finitePreparationSeconds;
  state.currentWave = wave;
  state.segmentIndex = wave.segmentIndex ?? 0;
  state.waveIndex = state.chapterIndex * 3 + state.segmentIndex;
  state.phase = 'preparing';
  state.bannerTimer = EFFECTS.waveBannerSeconds;
}

function configureWave(state, config, supply, wave, source = 'tutorial') {
  state.energy = config.startingEnergy;
  state.operatorQueue = queueItems(
    state,
    'operator',
    towerOperatorIds(supply.starterOperators),
    'operatorId',
    source,
  );
  state.scrollLibrary = unlockedScrollLibrary(state);
  state.formulaQueue = queueItems(state, 'formula', supply.starterFormulaIds, 'cardId', source);
  state.constantQueue = queueItems(state, 'constant', supply.starterConstants, 'value', source);
  state.operatorCooldown = OPERATOR_QUEUE_INTERVAL;
  state.formulaCooldown = FORMULA_QUEUE_INTERVAL;
  state.constantCooldown = CONSTANT_QUEUE_INTERVAL;
  state.selectedFormulaId = state.formulaQueue[0]?.id ?? null;
  state.selectedConstantId = state.constantQueue[0]?.id ?? null;
  if (!state.storedConstants.some((item) => item.id === state.selectedStoredConstantId)) {
    state.selectedStoredConstantId = state.storedConstants[0]?.id ?? null;
  }
  state.towers = [];
  resetWaveRuntime(state, wave);
}

function grantGuaranteedSupply(state, wave) {
  const supply = wave?.guaranteedSupply;
  if (!supply) return false;
  const grantId = `${wave.id}:guaranteed`;
  if (state.receivedSupplyGrantIds.includes(grantId)) return false;

  state.operatorQueue.push(...queueItems(
    state,
    'operator',
    towerOperatorIds(supply.operators ?? supply.starterOperators ?? []),
    'operatorId',
    'guaranteed',
  ));
  state.formulaQueue.push(...queueItems(
    state,
    'formula',
    supply.formulaIds ?? supply.starterFormulaIds ?? [],
    'cardId',
    'guaranteed',
  ));
  state.constantQueue.push(...queueItems(
    state,
    'constant',
    supply.constants ?? supply.starterConstants ?? [],
    'value',
    'guaranteed',
  ));
  state.receivedSupplyGrantIds.push(grantId);
  if (!state.selectedFormulaId) state.selectedFormulaId = state.formulaQueue[0]?.id ?? null;
  if (!state.selectedConstantId) state.selectedConstantId = state.constantQueue[0]?.id ?? null;
  addLog(state, `保障補給已送達：軍械 ${supply.operators?.length ?? 0}、公式 ${supply.formulaIds?.length ?? 0}、k ${supply.constants?.length ?? 0}`, 'success');
  return true;
}

function configurePersistentWave(state, wave) {
  if (!state.formulaQueue.some((item) => item.id === state.selectedFormulaId)) {
    state.selectedFormulaId = state.formulaQueue[0]?.id ?? null;
  }
  if (!state.constantQueue.some((item) => item.id === state.selectedConstantId)) {
    state.selectedConstantId = state.constantQueue[0]?.id ?? null;
  }
  if (!state.storedConstants.some((item) => item.id === state.selectedStoredConstantId)) {
    state.selectedStoredConstantId = state.storedConstants[0]?.id ?? null;
  }
  resetWaveRuntime(state, wave);
  grantGuaranteedSupply(state, wave);
}

function snapshotTutorialState(state) {
  return {
    baseHp: state.baseHp,
    kills: state.kills,
    maxChain: state.maxChain,
    rngState: state.rngState,
    energy: state.energy,
    operatorQueue: state.operatorQueue.map((item) => ({ ...item })),
    scrollLibrary: state.scrollLibrary.map((item) => ({ ...item })),
    formulaQueue: state.formulaQueue.map((item) => ({ ...item })),
    constantQueue: state.constantQueue.map((item) => ({ ...item })),
    operatorCooldown: state.operatorCooldown,
    formulaCooldown: state.formulaCooldown,
    constantCooldown: state.constantCooldown,
    selectedFormulaId: state.selectedFormulaId,
    selectedConstantId: state.selectedConstantId,
    storedConstants: state.storedConstants.map((item) => ({ ...item })),
    selectedStoredConstantId: state.selectedStoredConstantId,
    towers: state.towers.map((tower) => ({ ...tower })),
    receivedSupplyGrantIds: [...state.receivedSupplyGrantIds],
  };
}

function restoreTutorialState(state) {
  const snapshot = state.tutorialSnapshot;
  if (!snapshot) return;
  state.baseHp = snapshot.baseHp;
  state.kills = snapshot.kills;
  state.maxChain = snapshot.maxChain;
  state.rngState = snapshot.rngState;
  state.energy = snapshot.energy;
  state.operatorQueue = snapshot.operatorQueue.map((item) => ({ ...item }));
  state.scrollLibrary = snapshot.scrollLibrary.map((item) => ({ ...item }));
  state.formulaQueue = snapshot.formulaQueue.map((item) => ({ ...item }));
  state.constantQueue = snapshot.constantQueue.map((item) => ({ ...item }));
  state.operatorCooldown = snapshot.operatorCooldown;
  state.formulaCooldown = snapshot.formulaCooldown;
  state.constantCooldown = snapshot.constantCooldown;
  state.selectedFormulaId = snapshot.selectedFormulaId;
  state.selectedConstantId = snapshot.selectedConstantId;
  state.storedConstants = snapshot.storedConstants.map((item) => ({ ...item }));
  state.selectedStoredConstantId = snapshot.selectedStoredConstantId;
  state.towers = snapshot.towers.map((tower) => ({ ...tower }));
  state.receivedSupplyGrantIds = [...snapshot.receivedSupplyGrantIds];
}

function setupTutorialWave(state, chapterIndex, showIntroductions) {
  const config = CHAPTERS[chapterIndex];
  const tutorial = chapterTutorial(chapterIndex);
  configureWave(state, config, tutorial, generateTutorialWave(chapterIndex));
  state.enemyTutorialQueue = showIntroductions ? chapterEnemyTutorials(chapterIndex) : [];
  state.weaponTutorialQueue = showIntroductions ? chapterWeaponTutorials(chapterIndex) : [];
}

function restartTutorialWave(state) {
  restoreTutorialState(state);
  setupTutorialWave(state, state.chapterIndex, false);
  addLog(state, '教學核心歸零；固定演練已重置，不會扣除正式關卡資源。', 'danger');
  notify(state, '教學波已重置，再試一次。', 'neutral');
}

function prepareFiniteSegment(state, segmentIndex) {
  const completedTutorial = state.currentWave.name;
  if (state.currentWave.kind === 'tutorial') restoreTutorialState(state);
  configurePersistentWave(
    state,
    generateFiniteSegment(state.runSeed, state.chapterIndex, segmentIndex),
  );
  state.enemyTutorialQueue = [];
  state.weaponTutorialQueue = [];
  state.tutorialSnapshot = null;
  if (segmentIndex === 1) {
    addLog(state, `${completedTutorial}完成；壓力段整備開始。`, 'success');
  }
}

function initializeLevel(state, levelIndex, skipTutorial) {
  const config = CHAPTERS[levelIndex];
  state.chapterIndex = levelIndex;
  state.levelIndex = levelIndex;
  state.endlessRound = 0;
  state.board = { ...config.board };
  configureWave(
    state,
    config,
    config,
    generateFiniteSegment(state.runSeed, levelIndex, 1),
    'starter',
  );
  state.enemyTutorialQueue = [];
  state.weaponTutorialQueue = [];

  if (skipTutorial) {
    state.tutorialSnapshot = null;
    grantGuaranteedSupply(state, state.currentWave);
    return;
  }

  state.tutorialSnapshot = snapshotTutorialState(state);
  setupTutorialWave(state, levelIndex, true);
}

function initializeEndless(state) {
  state.chapterIndex = CHAPTERS.length;
  state.levelIndex = null;
  state.endlessRound = 1;
  state.board = { ...ENDLESS_CHAPTER.board };
  state.tutorialSnapshot = null;
  state.enemyTutorialQueue = [];
  state.weaponTutorialQueue = [];
  configureWave(
    state,
    ENDLESS_CHAPTER,
    ENDLESS_CHAPTER,
    generateEndlessWave(state.runSeed, 1),
    'starter',
  );
  grantGuaranteedSupply(state, state.currentWave);
}

export function createGame(seed = INITIAL_STATE.defaultSeed, options = {}) {
  const mode = options?.mode ?? 'level';
  if (mode !== 'level' && mode !== 'endless') {
    throw new RangeError("mode must be either 'level' or 'endless'");
  }
  const levelIndex = options?.levelIndex ?? 0;
  if (
    mode === 'level'
    && (!Number.isInteger(levelIndex) || levelIndex < 0 || levelIndex >= CHAPTERS.length)
  ) {
    throw new RangeError(`levelIndex must be between 0 and ${CHAPTERS.length - 1}`);
  }
  const skipTutorial = mode === 'level' && options?.skipTutorial === true;
  const normalizedSeed = Number(seed) >>> 0;
  const initialConfig = mode === 'endless' ? ENDLESS_CHAPTER : CHAPTERS[levelIndex];
  const state = {
    phase: 'intro',
    mode,
    levelIndex: mode === 'level' ? levelIndex : null,
    skipTutorial,
    paused: false,
    speed: INITIAL_STATE.normalSimulationSpeed,
    sound: true,
    baseHp: INITIAL_STATE.baseHp,
    maxBaseHp: INITIAL_STATE.baseHp,
    energy: initialConfig.startingEnergy,
    runSeed: normalizedSeed,
    chapterIndex: mode === 'endless' ? CHAPTERS.length : levelIndex,
    segmentIndex: 0,
    endlessRound: mode === 'endless' ? 1 : 0,
    board: { ...initialConfig.board },
    waveIndex: 0,
    waveClock: 0,
    nextSpawnIndex: 0,
    energyClock: 0,
    currentWave: null,
    prepDuration: WAVE.finitePreparationSeconds,
    prepRemaining: WAVE.finitePreparationSeconds,
    formulaQueue: [],
    formulaCooldown: FORMULA_QUEUE_INTERVAL,
    constantQueue: [],
    constantCooldown: CONSTANT_QUEUE_INTERVAL,
    operatorQueue: [],
    scrollLibrary: [],
    operatorCooldown: OPERATOR_QUEUE_INTERVAL,
    receivedSupplyGrantIds: [],
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
    tutorialVisible: mode === 'level' && !skipTutorial,
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
    nextEntityId: INITIAL_STATE.firstEntityId,
    rngState: (normalizedSeed ^ 0xa511e9b3) >>> 0,
  };
  if (mode === 'endless') initializeEndless(state);
  else initializeLevel(state, levelIndex, skipTutorial);
  state.phase = 'intro';
  state.tutorialVisible = mode === 'level' && !skipTutorial;
  state.logs = [];
  return state;
}

export function startGame(state) {
  if (state.phase !== 'intro') return false;
  state.phase = 'preparing';
  if (state.mode === 'endless') {
    state.tutorialVisible = false;
    addLog(state, '無限證明第 1 輪整備開始。', 'success');
  } else if (state.skipTutorial) {
    state.tutorialVisible = false;
    addLog(state, `第 ${state.chapterIndex + 1} 關壓力段整備開始；已略過教學。`, 'success');
  } else {
    state.tutorialVisible = true;
    addLog(state, `第 ${state.chapterIndex + 1} 關教學開始：先認識新敵人，再親自點擊或拖曳軍械。`, 'success');
  }
  return true;
}

export function tutorialDeploymentProgress(state) {
  const goals = state.currentWave?.kind === 'tutorial'
    ? (state.currentWave.deploymentGoals ?? [])
    : [];
  const matchedTowerIds = new Set();
  const annotatedGoals = goals.map((goal) => {
    const tower = state.towers.find((candidate) => (
      !matchedTowerIds.has(candidate.id)
      && candidate.typeId === goal.typeId
      && candidate.row === goal.row
    ));
    if (tower) matchedTowerIds.add(tower.id);
    return { ...goal, complete: Boolean(tower), towerId: tower?.id ?? null };
  });
  const completed = annotatedGoals.filter((goal) => goal.complete).length;
  return {
    goals: annotatedGoals,
    completed,
    total: annotatedGoals.length,
    complete: completed === annotatedGoals.length,
    next: annotatedGoals.find((goal) => !goal.complete) ?? null,
  };
}

function beginWave(state, awardEarly) {
  if (state.phase !== 'preparing') return false;
  const bonusSeconds = awardEarly
    && state.currentWave.kind !== 'tutorial'
    && state.currentWave.awardsEarlyStart !== false
    ? Math.ceil(Math.max(0, state.prepRemaining))
    : 0;
  const bonus = Math.min(
    ECONOMY.earlyStartEnergyCap,
    bonusSeconds * ECONOMY.earlyStartEnergyPerSecond,
  );
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
  state.bannerTimer = EFFECTS.waveBannerSeconds;
  addLog(state, `${state.currentWave.name}：開始迎擊`, 'success');
  return true;
}

export function startWave(state) {
  if (state.enemyTutorialQueue.length > 0 || state.weaponTutorialQueue.length > 0) {
    notify(state, '先看完本章敵人與軍械教學。', 'danger');
    return false;
  }
  const deployment = tutorialDeploymentProgress(state);
  if (!deployment.complete && deployment.next) {
    const operator = OPERATORS[deployment.next.typeId];
    notify(
      state,
      `請先點擊或拖曳${operator?.name ?? '指定砲台'}，部署到第 ${deployment.next.row + 1} 路。`,
      'danger',
    );
    return false;
  }
  return beginWave(state, true);
}

export function tick(state, rawDt) {
  if (state.paused) return;
  const dt = Math.min(rawDt, SIMULATION.maximumStepSeconds) * state.speed;
  updateTransientState(state, dt);

  if (state.phase === 'preparing') {
    if (state.enemyTutorialQueue.length > 0 || state.weaponTutorialQueue.length > 0) return;
    if (!tutorialDeploymentProgress(state).complete) return;
    updateQueues(state, dt);
    state.prepRemaining = Math.max(0, state.prepRemaining - dt);
    if (state.prepRemaining <= 0) beginWave(state, false);
    return;
  }
  if (state.phase !== 'running') return;

  // Final projectiles may still be flying or resolving. During that visual-only
  // interval, do not advance combat clocks, refill queues, or consume RNG.
  if (
    state.nextSpawnIndex >= state.currentWave.entries.length
    && !state.enemies.some((enemy) => !enemy.dead)
  ) {
    state.enemies = state.enemies.filter((enemy) => !enemy.dead);
    checkWaveState(state);
    return;
  }

  state.waveClock += dt;
  state.energyClock += dt;
  while (state.energyClock >= ECONOMY.energyRefillIntervalSeconds) {
    state.energyClock -= ECONOMY.energyRefillIntervalSeconds;
    state.energy += ECONOMY.energyRefillAmount;
    addEffect(state, {
      type: 'energy',
      row: GEOMETRY.effectRow,
      position: GEOMETRY.energyEffectPosition,
      label: `Σ +${ECONOMY.energyRefillAmount}`,
    });
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
  // A non-lethal impact can resolve before this frame's enemy movement. Keep
  // its short pulse attached to the surviving target in the rendered frame.
  syncResolvedProjectiles(state);
  updateQueues(state, dt);
  state.enemies = state.enemies.filter((enemy) => !enemy.dead);
  checkWaveState(state);
}

function notify(state, text, tone = 'neutral') {
  state.toast = text;
  state.toastTone = tone;
  state.toastTimer = EFFECTS.toastSeconds;
}

export function selectArsenalItem(state, itemId) {
  const item = findArsenalItem(state, itemId);
  const operator = item ? OPERATORS[item.operatorId] : null;
  if (!operator || operator.unlockChapter > state.chapterIndex) {
    notify(state, '這個算子尚未解鎖。', 'danger');
    return false;
  }
  if (
    parameterKeys(operator).length > 0
    && !parameterScrollReady(item, operator)
    && state.selectedStoredConstantId !== null
  ) {
    return inscribeParameterScroll(state, itemId);
  }
  if (parameterKeys(operator).length > 0 && !parameterScrollReady(item, operator)) {
    notify(state, '把工坊圓盤拖到這張捲軸；複合值請先組合存入常數庫。', 'neutral');
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
  const item = arsenalItems(state).find((candidate) => candidate.operatorId === operatorId);
  if (!item) {
    notify(state, '軍械 queue 裡沒有這張牌。', 'danger');
    return false;
  }
  return selectArsenalItem(state, item.id);
}

function consumeOperatorItem(state, itemId = state.selectedOperatorItemId) {
  if (!itemId) return false;
  const item = findArsenalItem(state, itemId);
  const operator = item ? OPERATORS[item.operatorId] : null;
  if (operator?.kind !== 'tower') {
    for (const key of parameterKeys(operator)) delete item[key];
    return true;
  }
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

export function deployTowerFromArsenal(state, itemId, row, column) {
  const operatorItem = state.operatorQueue.find((item) => item.id === itemId);
  const operator = operatorItem ? OPERATORS[operatorItem.operatorId] : null;
  if (!operator || operator.kind !== 'tower' || operator.unlockChapter > state.chapterIndex) return false;
  if (row < 0 || row >= state.board.rows || column < 0 || column >= state.board.placeableColumns) return false;
  if (state.towers.some((tower) => tower.row === row && tower.column === column)) {
    notify(state, '這個位置已經有裝置了。', 'danger');
    return false;
  }
  const tutorialGoal = state.phase === 'preparing'
    ? tutorialDeploymentProgress(state).next
    : null;
  if (tutorialGoal && (tutorialGoal.typeId !== operator.id || tutorialGoal.row !== row)) {
    const goalOperator = OPERATORS[tutorialGoal.typeId];
    notify(
      state,
      `教學下一步：請把${goalOperator?.name ?? '指定砲台'}部署到第 ${tutorialGoal.row + 1} 路。`,
      'danger',
    );
    return false;
  }
  const guidedTutorialDeployment = Boolean(tutorialGoal);
  if (!guidedTutorialDeployment && state.energy < operator.cost) return false;

  if (!guidedTutorialDeployment) state.energy -= operator.cost;
  consumeOperatorItem(state, itemId);
  const hp = towerHp(operator.id);
  state.towers.push({
    id: nextId(state, 'tower'),
    typeId: operator.id,
    row,
    column,
    position: towerPosition(column, state.board),
    hp,
    maxHp: hp,
    cooldown: COMBAT.tower.defaultInitialCooldownSeconds,
    fireFlash: 0,
    active: true,
    ...(guidedTutorialDeployment ? { tutorialDeployment: true } : {}),
  });
  cancelSelection(state);
  addLog(
    state,
    `${guidedTutorialDeployment ? '完成教學部署' : '放置'} ${operator.symbol} ${operator.name}`,
    'success',
  );
  if (guidedTutorialDeployment) {
    notify(state, `${operator.name}部署完成；教學配置不消耗算力。`, 'success');
  }
  return true;
}

export function placeTower(state, row, column) {
  const operatorItem = state.operatorQueue.find((item) => item.id === state.selectedOperatorItemId);
  if (operatorItem?.operatorId !== state.selectedOperator) return false;
  return deployTowerFromArsenal(state, operatorItem.id, row, column);
}

export function recycleTower(state, towerId) {
  const tower = state.towers.find((candidate) => candidate.id === towerId);
  if (!tower) return false;
  if (tower.tutorialDeployment && state.currentWave?.kind === 'tutorial') {
    state.towers = state.towers.filter((candidate) => candidate.id !== towerId);
    state.operatorQueue.push({
      id: nextId(state, 'operator'),
      operatorId: tower.typeId,
      source: 'tutorial',
    });
    cancelSelection(state);
    addLog(state, `收回教學部署 ${OPERATORS[tower.typeId].name}`, 'success');
    notify(state, '教學砲台已收回；牌已放回工房，可重新部署。', 'neutral');
    return true;
  }
  const refund = Math.floor(
    OPERATORS[tower.typeId].cost * ECONOMY.towerRecycleRefundFraction,
  );
  state.towers = state.towers.filter((candidate) => candidate.id !== towerId);
  state.energy += refund;
  addLog(state, `回收 ${OPERATORS[tower.typeId].name}，返還 Σ${refund}`, 'success');
  notify(state, `砲台已回收，補償 Σ${refund}。`, 'success');
  return true;
}

// Compatibility for non-UI callers. The former discard action now follows the
// same half-price recycling rule as the shovel interaction.
export const discardTower = recycleTower;

export function selectEnemy(state, enemyId) {
  const enemy = state.enemies.find((candidate) => candidate.id === enemyId && !candidate.dead);
  state.selectedEnemyId = enemy?.id ?? null;
}

export function castTargetOperatorFromArsenal(state, itemId, enemyId) {
  const operatorItem = findArsenalItem(state, itemId);
  const operatorId = operatorItem?.operatorId;
  const operator = OPERATORS[operatorId];
  const enemy = state.enemies.find((candidate) => (
    candidate.id === enemyId
    && !candidate.dead
    && candidate.position > GEOMETRY.basePosition
  ));
  if (
    !operator
    || operator.kind !== 'target'
    || operator.unlockChapter > state.chapterIndex
    || (parameterKeys(operator).length > 0 && !parameterScrollReady(operatorItem, operator))
    || !enemy
    || state.energy < operator.cost
  ) return false;

  const targetExpression = activeEnemyExpression(enemy);
  const before = formatExpression(targetExpression);
  const details = parameterDetails(operatorItem, operator);
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
  consumeOperatorItem(state, itemId);
  cancelSelection(state);
  addOperatorProjectile(state, operatorId, enemy, null, details);
  notify(state, `${operator.name}已發射；命中後結算。`, 'success');
  return true;
}

export function applyTargetOperator(state, enemyId) {
  const operatorItem = findArsenalItem(state, state.selectedOperatorItemId);
  if (operatorItem?.operatorId !== state.targetingOperator) return false;
  return castTargetOperatorFromArsenal(state, operatorItem.id, enemyId);
}

export function confirmPartial(state) {
  const operator = OPERATORS.partial;
  const operatorItem = findArsenalItem(state, state.selectedOperatorItemId);
  if (
    state.phase !== 'running'
    || !state.partialConfirmOpen
    || state.partialUsed
    || operatorItem?.operatorId !== 'partial'
    || state.energy < operator.cost
  ) return false;
  const targets = state.enemies.filter((enemy) => (
    !enemy.dead && enemy.position > GEOMETRY.basePosition
  ));
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
      delay: Math.min(
        index * EFFECTS.partialProjectileStaggerSeconds,
        EFFECTS.partialProjectileMaximumDelaySeconds,
      ),
    });
  });
  notify(state, `全場偏微分已發射 ${targets.length} 枚彈頭。`, 'success');
  return true;
}

export function partialPreview(state) {
  return state.enemies.filter((enemy) => (
    !enemy.dead && enemy.position > GEOMETRY.basePosition
  )).map((enemy) => {
    const shielded = hasActiveShield(enemy);
    const beforeExpression = activeEnemyExpression(enemy);
    const after = differentiate(beforeExpression, 'z', 1);
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
  state.speed = state.speed === INITIAL_STATE.normalSimulationSpeed
    ? INITIAL_STATE.fastSimulationSpeed
    : INITIAL_STATE.normalSimulationSpeed;
}

export function currentWave(state) {
  return state.currentWave;
}

export function selectedEnemy(state) {
  return state.enemies.find((enemy) => enemy.id === state.selectedEnemyId) ?? null;
}

export function enemyThreat(enemy) {
  return Math.max(0, Math.ceil(damage(enemy.expression)))
    * (enemy.divergentTimer > 0 ? COMBAT.divergence.damageMultiplier : 1);
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

export function storeNumericConstant(state, rawValue, source = '數字鍵盤') {
  if (state.storedConstants.length >= STORED_CONSTANT_CAPACITY) {
    notify(state, `常數庫已滿（${STORED_CONSTANT_CAPACITY}/${STORED_CONSTANT_CAPACITY}）。`, 'danger');
    return false;
  }
  const value = Number(rawValue);
  if (!Number.isFinite(value) || Math.abs(value) > 1_000_000) {
    notify(state, '請輸入有限且絕對值不超過 1,000,000 的常數。', 'danger');
    return false;
  }
  const normalizedValue = Object.is(value, -0) ? 0 : value;
  const stored = {
    id: nextId(state, 'stored-constant'),
    value: normalizedValue,
    source,
  };
  state.storedConstants.push(stored);
  state.selectedStoredConstantId = stored.id;
  cancelSelection(state);
  addLog(state, `${source} → ${normalizedValue}`, 'success');
  notify(state, `常數 ${normalizedValue} 已存入常數庫。`, 'success');
  return true;
}

export function discardArsenalItem(state, itemId) {
  const item = findArsenalItem(state, itemId);
  if (!item) {
    notify(state, '軍械 queue 是空的。', 'danger');
    return false;
  }
  const operator = OPERATORS[item.operatorId];
  if (operator.kind !== 'tower') {
    notify(state, '捲軸是無限供應，不需要丟棄。', 'neutral');
    return false;
  }
  const requiredForTutorial = state.phase === 'preparing'
    && tutorialDeploymentProgress(state).goals.some((goal) => (
      !goal.complete && goal.typeId === item.operatorId
    ));
  if (requiredForTutorial) {
    notify(state, `${operator.name}是目前的教學指定牌，請點擊或拖曳它完成部署。`, 'danger');
    return false;
  }
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

export function inscribeParameterScroll(
  state,
  itemId,
  storedConstantId = state.selectedStoredConstantId,
) {
  const stored = state.storedConstants.find((item) => item.id === storedConstantId);
  if (!stored) return false;
  const changed = inscribeParameterValue(state, itemId, stored.value, stored.source ?? '常數庫');
  if (!changed) return false;
  state.storedConstants = state.storedConstants.filter((candidate) => candidate.id !== stored.id);
  if (state.selectedStoredConstantId === stored.id) state.selectedStoredConstantId = null;
  return true;
}

export function inscribeParameterValue(state, itemId, rawValue, source = '數字圓盤') {
  const value = Number(rawValue);
  if (!Number.isFinite(value) || Math.abs(value) > 1_000_000) {
    notify(state, '請使用有限且絕對值不超過 1,000,000 的常數。', 'danger');
    return false;
  }
  const item = findArsenalItem(state, itemId);
  const operator = item ? OPERATORS[item.operatorId] : null;
  const keys = parameterKeys(operator);
  if (!item || keys.length === 0) {
    notify(state, '這張軍械沒有可刻寫的參數槽。', 'danger');
    return false;
  }
  if (parameterScrollReady(item, operator)) {
    notify(state, '這張捲軸已刻寫完成；要改參數請改用另一張空白捲軸。', 'neutral');
    return false;
  }

  const key = keys.find((candidate) => item[candidate] === null || item[candidate] === undefined);
  const normalizedValue = Object.is(value, -0) ? 0 : value;
  item[key] = normalizedValue;
  cancelSelection(state);

  const ready = parameterScrollReady(item, operator);
  const slotLabel = key === 'lowerBound' ? '下界' : key === 'upperBound' ? '上界' : '參數';
  addLog(state, `${operator.name}${slotLabel}刻寫 ${normalizedValue}（${source}）`, ready ? 'success' : 'neutral');
  notify(
    state,
    ready ? `${operator.name}刻寫完成；再點一次即可選擇目標。` : '下界已刻寫；請再選一個常數刻寫上界。',
    ready ? 'success' : 'neutral',
  );
  return true;
}

export function installAssembly(state, destinationId, storedConstantId) {
  return inscribeParameterScroll(state, destinationId, storedConstantId);
}

export function selectStoredConstant(state, itemId) {
  if (!state.storedConstants.some((item) => item.id === itemId)) return false;
  if (state.targetingOperator || state.partialConfirmOpen || state.selectedOperator) cancelSelection(state);
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
