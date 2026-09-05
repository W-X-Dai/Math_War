import test from 'node:test';
import assert from 'node:assert/strict';

import {
  exponential,
  formatExpression,
  logarithm,
  polynomial,
  trigonometric,
} from '../src/domain/expression.js';
import {
  advanceWeaponTutorial,
  applyTargetOperator,
  chapterWeaponTutorials,
  confirmPartial,
  createGame,
  currentAssembly,
  discardArsenalItem,
  discardConstantItem,
  discardFormulaItem,
  discardStoredConstant,
  installAssembly,
  partialPreview,
  placeTower,
  prepareAssembly,
  selectArsenalItem,
  selectConstantItem,
  selectFormulaItem,
  selectStoredConstant,
  startGame,
  startWave,
  tick,
  togglePause,
} from '../src/game/engine.js';
import {
  CHAPTERS,
  CONSTANT_QUEUE_CAPACITY,
  ENDLESS_CHAPTER,
  FORMULA_QUEUE_CAPACITY,
  INTEGRATION_CONSTANTS,
  OPERATOR_QUEUE_CAPACITY,
  OPERATORS,
  STORED_CONSTANT_CAPACITY,
} from '../src/game/content.js';

const term = (coefficient, xPower = 0, yPower = 0) => ({ coefficient, xPower, yPower });

function testEnemy(expression, overrides = {}) {
  return {
    id: overrides.id ?? 'enemy-test', typeId: 'procedural-test', name: '測試函數',
    art: 'enemy-art-polynomial', family: 'polynomial', row: 0, position: 0.72,
    expression, speed: 0.01, reward: 40, affixes: [], shieldActive: false,
    splitExpressions: [], attackTimer: 99, divergentTimer: 0, hitFlash: 0,
    ...overrides,
  };
}

function freezeSpawns(state) {
  state.currentWave = { ...state.currentWave, entries: [{ spawnAt: 999, row: 0 }] };
  state.nextSpawnIndex = 0;
  state.phase = 'running';
}

function addArsenalCard(state, operatorId, id = `manual-${operatorId}`) {
  state.operatorQueue.push({ id, operatorId });
  return id;
}

function configuredTower(typeId, parameter, overrides = {}) {
  return {
    id: `tower-${typeId}`, typeId, row: 0, column: 0, position: 0.2,
    hp: 150, maxHp: 150, cooldown: 0, fireFlash: 0, active: true,
    parameter, lowerBound: undefined, upperBound: undefined, ...overrides,
  };
}

function projectileEffects(state) {
  return state.effects.filter((effect) => effect.type === 'projectile');
}

function advanceBy(state, seconds) {
  let remaining = seconds;
  while (remaining > 1e-9) {
    const step = Math.min(0.1, remaining);
    tick(state, step);
    remaining -= step;
  }
}

function assertProjectile(effect, operatorId, expected = {}) {
  assert.ok(effect, `${operatorId} should emit a projectile`);
  assert.equal(effect.operatorId, operatorId);
  assert.equal(effect.shape, OPERATORS[operatorId].projectile.shape);
  assert.equal(effect.trajectory, OPERATORS[operatorId].projectile.trajectory);
  assert.equal(effect.status, 'flying');
  assert.equal(effect.impactResolved, false);
  assert.equal(effect.missed, false);
  assert.equal(effect.progress, 0);
  assert.equal(effect.travelTime, effect.trajectory === 'lane' ? 0.52 : 0.56);
  assert.equal(effect.impactIn, effect.travelTime + (effect.delay ?? 0));
  for (const [key, value] of Object.entries(expected)) assert.equal(effect[key], value);
}

test('a seeded game starts with deterministic content and an eight-card arsenal', () => {
  const first = createGame(12345);
  const replay = createGame(12345);
  assert.equal(first.phase, 'intro');
  assert.equal(first.runSeed, 12345);
  assert.deepEqual(first.currentWave, replay.currentWave);
  assert.deepEqual(first.board, { rows: 4, columns: 7, placeableColumns: 4 });
  assert.equal(first.operatorQueue.length, OPERATOR_QUEUE_CAPACITY);
  assert.deepEqual(first.operatorQueue.map((item) => item.operatorId), CHAPTERS[0].starterOperators);
});

test('preparation starts early for five energy per displayed second', () => {
  const state = createGame(10);
  assert.equal(startGame(state), true);
  tick(state, 0.2);
  const before = state.energy;
  assert.equal(startWave(state), true);
  assert.equal(state.phase, 'running');
  assert.equal(state.energy, before + 150);
  assert.equal(state.prepRemaining, 0);
});

test('preparation auto-starts without bonus and pause freezes its clock', () => {
  const state = createGame(11);
  startGame(state);
  state.prepRemaining = 0.1;
  const before = state.energy;
  assert.equal(togglePause(state), true);
  tick(state, 0.2);
  assert.equal(state.prepRemaining, 0.1);
  togglePause(state);
  tick(state, 0.2);
  assert.equal(state.phase, 'running');
  assert.equal(state.energy, before);
});

test('new chapter weapons pause preparation until their tutorials are read', () => {
  assert.deepEqual(chapterWeaponTutorials(0), []);
  assert.deepEqual(chapterWeaponTutorials(1), ['secondDerivative', 'integral']);
  assert.deepEqual(chapterWeaponTutorials(2), ['definiteIntegralTower']);
  assert.deepEqual(chapterWeaponTutorials(3), ['partial', 'evaluateTower']);
  assert.deepEqual(chapterWeaponTutorials(4), ['limit', 'eulerTower']);
  assert.deepEqual(chapterWeaponTutorials(5), ['reflect', 'resonanceTower']);
  assert.deepEqual(chapterWeaponTutorials(CHAPTERS.length), []);

  const state = createGame(111);
  state.phase = 'running';
  state.currentWave = { ...state.currentWave, entries: [] };
  state.nextSpawnIndex = 0;
  tick(state, 0.01);
  assert.equal(state.chapterIndex, 1);
  assert.deepEqual(state.weaponTutorialQueue, ['secondDerivative', 'integral']);

  const prepBefore = state.prepRemaining;
  const formulaCooldownBefore = state.formulaCooldown;
  tick(state, 1);
  assert.equal(state.prepRemaining, prepBefore);
  assert.equal(state.formulaCooldown, formulaCooldownBefore);
  assert.equal(startWave(state), false);

  assert.equal(advanceWeaponTutorial(state), true);
  assert.deepEqual(state.weaponTutorialQueue, ['integral']);
  assert.equal(advanceWeaponTutorial(state), true);
  assert.deepEqual(state.weaponTutorialQueue, []);
  tick(state, 0.2);
  assert.ok(state.prepRemaining < prepBefore);
});

test('placing a tower consumes one matching card and its energy cost', () => {
  const state = createGame(12);
  startGame(state);
  const item = state.operatorQueue.find((card) => card.operatorId === 'derivative');
  const countBefore = state.operatorQueue.filter((card) => card.operatorId === 'derivative').length;
  const energyBefore = state.energy;
  assert.equal(selectArsenalItem(state, item.id), true);
  assert.equal(placeTower(state, 0, 0), true);
  assert.equal(state.energy, energyBefore - OPERATORS.derivative.cost);
  assert.equal(state.operatorQueue.filter((card) => card.operatorId === 'derivative').length, countBefore - 1);
  assert.equal(state.selectedOperatorItemId, null);
});

test('failed arsenal selection keeps both card and energy', () => {
  const state = createGame(13);
  startGame(state);
  const item = state.operatorQueue.find((card) => card.operatorId === 'derivative');
  state.energy = 0;
  assert.equal(selectArsenalItem(state, item.id), false);
  assert.equal(state.operatorQueue.some((card) => card.id === item.id), true);
  assert.equal(state.energy, 0);
});

test('an enemy damages the base once and leaves without a kill reward', () => {
  const state = createGame(131);
  freezeSpawns(state);
  const leakingEnemy = testEnemy(polynomial(12), {
    position: 0.12,
    attackTimer: 99,
    reward: 80,
  });
  state.enemies.push(leakingEnemy);
  const energyBefore = state.energy;

  tick(state, 0.05);
  assert.equal(state.baseHp, 488);
  assert.equal(state.enemies.length, 0);
  assert.equal(state.kills, 0);
  assert.equal(state.energy, energyBefore);

  tick(state, 5);
  assert.equal(state.baseHp, 488);
});

test('non-leading formula and constant cards assemble and install', () => {
  const state = createGame(14);
  const formula = state.formulaQueue.find((item) => item.cardId === 'doubleK');
  const constant = state.constantQueue.find((item) => item.value === 2);
  const subtractCard = state.operatorQueue.find((item) => item.operatorId === 'subtract');
  assert.equal(selectFormulaItem(state, formula.id), true);
  assert.equal(selectConstantItem(state, constant.id), true);
  assert.equal(currentAssembly(state).value, 4);
  assert.equal(prepareAssembly(state), true);
  assert.equal(state.storedConstants.length, 1);
  assert.equal(state.storedConstants[0].value, 4);
  assert.equal(selectArsenalItem(state, subtractCard.id), true);
  assert.equal(placeTower(state, 0, 0), true);
  assert.equal(installAssembly(state, state.towers[0].id), true);
  assert.equal(state.towers[0].parameter, 4);
  assert.equal(state.storedConstants.length, 0);
  assert.equal(state.formulaQueue.some((item) => item.id === formula.id), false);
  assert.equal(state.constantQueue.some((item) => item.id === constant.id), false);
});

test('assembled constants store up to five without consuming materials on overflow', () => {
  const state = createGame(141);
  state.formulaQueue = Array.from({ length: 6 }, (_, index) => ({
    id: `formula-cap-${index}`,
    cardId: 'identityK',
  }));
  state.constantQueue = Array.from({ length: 6 }, (_, index) => ({
    id: `constant-cap-${index}`,
    value: index + 1,
  }));
  state.selectedFormulaId = state.formulaQueue[0].id;
  state.selectedConstantId = state.constantQueue[0].id;

  for (let index = 0; index < STORED_CONSTANT_CAPACITY; index += 1) {
    assert.equal(prepareAssembly(state), true);
  }
  assert.deepEqual(state.storedConstants.map((item) => item.value), [1, 2, 3, 4, 5]);
  const formulasBefore = state.formulaQueue.length;
  const constantsBefore = state.constantQueue.length;
  assert.equal(prepareAssembly(state), false);
  assert.equal(state.formulaQueue.length, formulasBefore);
  assert.equal(state.constantQueue.length, constantsBefore);
});

test('any stored constant can be selected, discarded, or consumed by a tower', () => {
  const state = createGame(142);
  state.storedConstants = [
    { id: 'stored-a', value: 2, source: 'k｜k=2' },
    { id: 'stored-b', value: 7, source: 'k｜k=7' },
    { id: 'stored-c', value: 11, source: 'k｜k=11' },
  ];
  state.selectedStoredConstantId = 'stored-a';
  const ordinaryTower = configuredTower('derivative');
  const configurableTower = configuredTower('subtract', null);
  state.towers.push(ordinaryTower, configurableTower);

  assert.equal(selectStoredConstant(state, 'stored-b'), true);
  assert.equal(installAssembly(state, ordinaryTower.id), false);
  assert.equal(state.storedConstants.length, 3);
  assert.equal(installAssembly(state, configurableTower.id), true);
  assert.equal(configurableTower.parameter, 7);
  assert.deepEqual(state.storedConstants.map((item) => item.value), [2, 11]);
  assert.equal(discardStoredConstant(state, 'stored-c'), true);
  assert.deepEqual(state.storedConstants.map((item) => item.value), [2]);
  assert.equal(selectStoredConstant(state, 'stored-a'), true);
  assert.equal(state.selectedStoredConstantId, null);
});

test('all three queues refill during preparation and respect capacity', () => {
  const state = createGame(15);
  startGame(state);
  state.operatorQueue.pop();
  state.formulaQueue.pop();
  state.constantQueue.pop();
  state.operatorCooldown = 0.01;
  state.formulaCooldown = 0.01;
  state.constantCooldown = 0.01;
  tick(state, 0.02);
  assert.equal(state.operatorQueue.length, OPERATOR_QUEUE_CAPACITY);
  assert.equal(state.formulaQueue.length, 4);
  assert.equal(state.constantQueue.length, 4);
  assert.ok(state.formulaQueue.length <= FORMULA_QUEUE_CAPACITY);
  assert.ok(state.constantQueue.length <= CONSTANT_QUEUE_CAPACITY);
});

test('any arsenal, formula, or constant item can be discarded', () => {
  const state = createGame(16);
  const [arsenal, formula, constant] = [state.operatorQueue[4], state.formulaQueue[2], state.constantQueue[3]];
  assert.equal(discardArsenalItem(state, arsenal.id), true);
  assert.equal(discardFormulaItem(state, formula.id), true);
  assert.equal(discardConstantItem(state, constant.id), true);
  assert.equal(state.operatorQueue.some((item) => item.id === arsenal.id), false);
  assert.equal(state.formulaQueue.some((item) => item.id === formula.id), false);
  assert.equal(state.constantQueue.some((item) => item.id === constant.id), false);
});

test('chapter completion repairs HP and resets map, economy, towers, and queues', () => {
  const state = createGame(17);
  state.phase = 'running';
  state.currentWave = { ...state.currentWave, entries: [] };
  state.nextSpawnIndex = 0;
  state.baseHp = 350;
  state.energy = 1;
  state.storedConstants = [{ id: 'persistent-constant', value: 9, source: 'k+10｜k=-1' }];
  state.selectedStoredConstantId = 'persistent-constant';
  state.towers.push(configuredTower('derivative'));
  tick(state, 0.01);
  assert.equal(state.chapterIndex, 1);
  assert.equal(state.phase, 'preparing');
  assert.equal(state.baseHp, 450);
  assert.equal(state.energy, CHAPTERS[1].startingEnergy);
  assert.deepEqual(state.board, CHAPTERS[1].board);
  assert.equal(state.towers.length, 0);
  assert.deepEqual(state.operatorQueue.map((item) => item.operatorId), CHAPTERS[1].starterOperators);
  assert.deepEqual(state.storedConstants, [{ id: 'persistent-constant', value: 9, source: 'k+10｜k=-1' }]);
  assert.equal(state.selectedStoredConstantId, 'persistent-constant');
});

test('entering endless resets once, then later rounds preserve the defense', () => {
  const state = createGame(18);
  state.chapterIndex = CHAPTERS.length - 1;
  state.waveIndex = state.chapterIndex;
  state.phase = 'running';
  state.currentWave = { ...state.currentWave, entries: [] };
  state.nextSpawnIndex = 0;
  state.baseHp = 300;
  state.storedConstants = [{ id: 'endless-constant', value: Math.PI, source: 'k｜k=π' }];
  state.selectedStoredConstantId = 'endless-constant';
  tick(state, 0.01);
  assert.equal(state.chapterIndex, CHAPTERS.length);
  assert.equal(state.endlessRound, 1);
  assert.equal(state.energy, ENDLESS_CHAPTER.startingEnergy);
  assert.equal(state.baseHp, 400);
  assert.deepEqual(state.board, ENDLESS_CHAPTER.board);
  assert.equal(state.storedConstants[0].value, Math.PI);
  assert.equal(state.selectedStoredConstantId, 'endless-constant');

  const persistentTower = configuredTower('derivative');
  state.towers.push(persistentTower);
  state.energy = 777;
  state.phase = 'running';
  state.currentWave = { ...state.currentWave, entries: [] };
  state.nextSpawnIndex = 0;
  tick(state, 0.01);
  assert.equal(state.endlessRound, 2);
  assert.equal(state.phase, 'preparing');
  assert.equal(state.prepDuration, 28);
  assert.equal(state.energy, 777);
  assert.equal(state.towers[0].id, persistentTower.id);
});

test('new parameter towers apply their mathematical operators', async (t) => {
  const cases = [
    ['D² + 4I annihilates sin(2x)', 'resonanceTower', 4, trigonometric('sin', 2, 3)],
    ['xD + 2I annihilates x^-2', 'eulerTower', 2, polynomial([term(5, -2)])],
    ['f(1) annihilates x - 1', 'evaluateTower', 1, polynomial([term(1, 1), term(-1)])],
  ];
  for (const [name, typeId, parameter, expression] of cases) {
    await t.test(name, () => {
      const state = createGame(20 + parameter);
      freezeSpawns(state);
      const target = testEnemy(expression);
      state.enemies.push(target);
      state.towers.push(configuredTower(typeId, parameter));
      tick(state, 0.01);
      assert.equal(state.enemies.length, 1);
      assert.equal(formatExpression(target.expression), formatExpression(expression));
      const [projectile] = projectileEffects(state);
      advanceBy(state, projectile.impactIn + 0.001);
      assert.equal(state.enemies.length, 0);
    });
  }
});

test('evaluation at a singularity pauses the tower without changing the enemy', () => {
  const state = createGame(23);
  freezeSpawns(state);
  const target = testEnemy(polynomial([term(1, -1)]));
  const tower = configuredTower('evaluateTower', 0);
  state.enemies.push(target);
  state.towers.push(tower);
  tick(state, 0.01);
  assert.equal(tower.active, false);
  assert.equal(formatExpression(target.expression), 'x^-1');
});

test('a shield blocks one global transform while consuming its card', () => {
  const state = createGame(24);
  state.chapterIndex = 3;
  freezeSpawns(state);
  const cardId = addArsenalCard(state, 'partial');
  const target = testEnemy(polynomial([term(1, 2)]), { affixes: ['shield'], shieldActive: true });
  state.enemies.push(target);
  const energyBefore = state.energy;
  assert.equal(selectArsenalItem(state, cardId), true);
  assert.equal(partialPreview(state)[0].shielded, true);
  assert.equal(confirmPartial(state), true);
  assert.equal(target.shieldActive, true);
  advanceBy(state, 0.561);
  assert.equal(target.shieldActive, false);
  assert.equal(formatExpression(target.expression), 'x^2');
  assert.equal(state.operatorQueue.some((item) => item.id === cardId), false);
  assert.equal(state.energy, energyBefore - OPERATORS.partial.cost);
});

test('a shield blocks tower and divergent single-target transforms once', () => {
  const towerState = createGame(241);
  freezeSpawns(towerState);
  const towerTarget = testEnemy(polynomial([term(1, 1)]), { shieldActive: true, affixes: ['shield'] });
  towerState.enemies.push(towerTarget);
  towerState.towers.push(configuredTower('derivative', undefined));
  tick(towerState, 0.05);
  assert.equal(towerTarget.shieldActive, true);
  advanceBy(towerState, 0.521);
  assert.equal(towerTarget.shieldActive, false);
  assert.equal(formatExpression(towerTarget.expression), 'x');

  const targetState = createGame(242);
  targetState.chapterIndex = 5;
  freezeSpawns(targetState);
  targetState.operatorQueue = [];
  const limitId = addArsenalCard(targetState, 'limit');
  const limitTarget = testEnemy(trigonometric('sin', 1), {
    family: 'trigonometric', shieldActive: true, affixes: ['shield'],
  });
  targetState.enemies.push(limitTarget);
  const energyBefore = targetState.energy;
  selectArsenalItem(targetState, limitId);
  assert.equal(applyTargetOperator(targetState, limitTarget.id), true);
  assert.equal(limitTarget.shieldActive, true);
  advanceBy(targetState, 0.561);
  assert.equal(limitTarget.shieldActive, false);
  assert.equal(limitTarget.divergentTimer, 0);
  assert.equal(targetState.energy, energyBefore - OPERATORS.limit.cost);
  assert.equal(targetState.operatorQueue.some((item) => item.id === limitId), false);
});

test('a split enemy creates two unmodified non-recursive children', () => {
  const state = createGame(25);
  state.chapterIndex = 3;
  freezeSpawns(state);
  const cardId = addArsenalCard(state, 'partial');
  state.enemies.push(testEnemy(polynomial(8), {
    affixes: ['split'], splitExpressions: [polynomial([term(1, 1)]), polynomial(2)],
  }));
  selectArsenalItem(state, cardId);
  assert.equal(confirmPartial(state), true);
  assert.equal(state.kills, 0);
  advanceBy(state, 0.561);
  assert.equal(state.kills, 1);
  assert.equal(state.enemies.length, 2);
  assert.ok(state.enemies.every((enemy) => enemy.affixes.length === 0));
  assert.ok(state.enemies.every((enemy) => enemy.splitExpressions.length === 0));
});

test('reflect then limit consumes two cards and eliminates e^x', () => {
  const state = createGame(26);
  state.chapterIndex = 5;
  freezeSpawns(state);
  state.operatorQueue = [];
  const reflectId = addArsenalCard(state, 'reflect');
  const limitId = addArsenalCard(state, 'limit');
  const target = testEnemy(exponential(1), { id: 'exponential-target', family: 'exponential' });
  state.enemies.push(target);
  selectArsenalItem(state, reflectId);
  assert.equal(applyTargetOperator(state, target.id), true);
  assert.equal(formatExpression(target.expression), 'e^x');
  advanceBy(state, 0.561);
  assert.equal(formatExpression(target.expression), 'e^-x');
  selectArsenalItem(state, limitId);
  assert.equal(applyTargetOperator(state, target.id), true);
  assert.equal(state.enemies.length, 1);
  advanceBy(state, 0.561);
  assert.equal(state.enemies.length, 0);
  assert.equal(state.operatorQueue.length, 0);
});

test('an unsupported indefinite integral keeps its arsenal card and energy', () => {
  const state = createGame(261);
  state.chapterIndex = 5;
  freezeSpawns(state);
  state.operatorQueue = [];
  const integralId = addArsenalCard(state, 'integral');
  const target = testEnemy(logarithm(1, -1), { family: 'logarithmic' });
  state.enemies.push(target);
  const energyBefore = state.energy;
  const rngBefore = state.rngState;

  assert.equal(selectArsenalItem(state, integralId), true);
  assert.equal(applyTargetOperator(state, target.id), false);
  assert.equal(state.energy, energyBefore);
  assert.equal(state.rngState, rngBefore);
  assert.equal(state.operatorQueue.some((item) => item.id === integralId), true);
  assert.equal(formatExpression(target.expression), 'x^-1ln|x|');
});

test('trigonometric and logarithmic limits trigger divergence', () => {
  for (const [expression, family] of [
    [trigonometric('cos', 1, 2), 'trigonometric'], [logarithm(1), 'logarithmic'],
  ]) {
    const state = createGame(family === 'trigonometric' ? 27 : 28);
    state.chapterIndex = 5;
    freezeSpawns(state);
    state.operatorQueue = [];
    const limitId = addArsenalCard(state, 'limit');
    const target = testEnemy(expression, { family });
    state.enemies.push(target);
    selectArsenalItem(state, limitId);
    assert.equal(applyTargetOperator(state, target.id), true);
    assert.equal(target.divergentTimer, 0);
    advanceBy(state, 0.561);
    assert.equal(target.divergentTimer, 6);
  }
});

test('every tower attack emits its own semantic projectile metadata', async (t) => {
  const cases = [
    {
      operatorId: 'derivative',
      expression: polynomial([term(1, 2)]),
      expected: {},
    },
    {
      operatorId: 'subtract',
      parameter: 3,
      expression: polynomial([term(1, 1)]),
      expected: { parameter: 3 },
    },
    {
      operatorId: 'secondDerivative',
      expression: polynomial([term(1, 3)]),
      expected: {},
    },
    {
      operatorId: 'definiteIntegralTower',
      expression: polynomial([term(1, 1)]),
      tower: { lowerBound: 0, upperBound: 1 },
      expected: { lowerBound: 0, upperBound: 1 },
    },
    {
      operatorId: 'evaluateTower',
      parameter: 2,
      expression: polynomial([term(1, 1), term(1)]),
      expected: { parameter: 2 },
    },
    {
      operatorId: 'eulerTower',
      parameter: 1,
      expression: polynomial([term(1, 2)]),
      expected: { parameter: 1 },
    },
    {
      operatorId: 'resonanceTower',
      parameter: 1,
      expression: exponential(1, 2),
      expected: { parameter: 1 },
    },
  ];

  assert.deepEqual(
    cases.map(({ operatorId }) => operatorId).sort(),
    Object.values(OPERATORS).filter(({ kind }) => kind === 'tower').map(({ id }) => id).sort(),
  );

  for (const [index, fixture] of cases.entries()) {
    await t.test(fixture.operatorId, () => {
      const state = createGame(300 + index);
      freezeSpawns(state);
      state.towers = [];
      state.effects = [];
      const target = testEnemy(fixture.expression);
      const targetPosition = target.position;
      state.enemies = [target];
      state.towers.push(configuredTower(
        fixture.operatorId,
        fixture.parameter,
        fixture.tower,
      ));

      tick(state, 0.01);

      const projectiles = projectileEffects(state);
      assert.equal(projectiles.length, 1);
      assertProjectile(projectiles[0], fixture.operatorId, {
        targetId: target.id,
        sourceTowerId: `tower-${fixture.operatorId}`,
        row: 0,
        from: 0.2,
        position: targetPosition,
        ...fixture.expected,
      });
    });
  }
});

test('every single-target operator emits a falling semantic projectile', async (t) => {
  const cases = [
    {
      operatorId: 'integral',
      expression: polynomial([term(1, 2)]),
    },
    {
      operatorId: 'reflect',
      expression: exponential(1),
    },
    {
      operatorId: 'limit',
      expression: polynomial([term(1, -1)]),
    },
  ];

  assert.deepEqual(
    cases.map(({ operatorId }) => operatorId).sort(),
    Object.values(OPERATORS).filter(({ kind }) => kind === 'target').map(({ id }) => id).sort(),
  );

  for (const [index, fixture] of cases.entries()) {
    await t.test(fixture.operatorId, () => {
      const state = createGame(400 + index);
      state.chapterIndex = 5;
      freezeSpawns(state);
      state.towers = [];
      state.effects = [];
      state.operatorQueue = [];
      const target = testEnemy(fixture.expression, { row: 2, position: 0.68 });
      state.enemies = [target];
      const cardId = addArsenalCard(state, fixture.operatorId);
      assert.equal(selectArsenalItem(state, cardId), true);

      assert.equal(applyTargetOperator(state, target.id), true);

      const projectiles = projectileEffects(state);
      assert.equal(projectiles.length, 1);
      assertProjectile(projectiles[0], fixture.operatorId, {
        targetId: target.id,
        sourceTowerId: null,
        row: target.row,
        position: target.position,
      });
      assert.equal(projectiles[0].from, undefined);
      if (fixture.operatorId === 'integral') {
        assert.ok(INTEGRATION_CONSTANTS.includes(projectiles[0].integrationConstant));
      }
    });
  }
});

test('a projectile changes the enemy only when its flight reaches the impact boundary', () => {
  const state = createGame(450);
  freezeSpawns(state);
  state.towers = [];
  state.effects = [];
  const target = testEnemy(polynomial([term(1, 2)]), { id: 'timed-impact' });
  const tower = configuredTower('derivative');
  state.enemies = [target];
  state.towers = [tower];

  tick(state, 0.01);
  const [projectile] = projectileEffects(state);
  assertProjectile(projectile, 'derivative', {
    targetId: target.id,
    sourceTowerId: tower.id,
  });
  tower.cooldown = 999;
  assert.equal(formatExpression(target.expression), 'x^2');
  assert.equal(state.effects.some((effect) => effect.type === 'operator'), false);

  advanceBy(state, projectile.travelTime - 0.001);
  assert.equal(formatExpression(target.expression), 'x^2');
  assert.equal(projectile.status, 'flying');
  assert.equal(projectile.impactResolved, false);
  assert.ok(projectile.progress > 0.99 && projectile.progress < 1);

  advanceBy(state, 0.002);
  assert.equal(formatExpression(target.expression), '2x');
  assert.equal(projectile.status, 'impacted');
  assert.equal(projectile.impactResolved, true);
  assert.equal(projectile.missed, false);
  assert.equal(projectile.progress, 1);
  assert.equal(state.effects.filter((effect) => effect.type === 'operator').length, 1);
});

test('pause freezes projectile flight and impact timing', () => {
  const state = createGame(451);
  freezeSpawns(state);
  state.towers = [];
  state.effects = [];
  const target = testEnemy(polynomial([term(1, 3)]), { id: 'paused-impact' });
  const tower = configuredTower('derivative');
  state.enemies = [target];
  state.towers = [tower];

  tick(state, 0.01);
  const [projectile] = projectileEffects(state);
  tower.cooldown = 999;
  advanceBy(state, 0.2);
  const impactBeforePause = projectile.impactIn;
  const ttlBeforePause = projectile.ttl;
  const progressBeforePause = projectile.progress;

  assert.equal(togglePause(state), true);
  advanceBy(state, 1);
  assert.equal(formatExpression(target.expression), 'x^3');
  assert.equal(projectile.impactIn, impactBeforePause);
  assert.equal(projectile.ttl, ttlBeforePause);
  assert.equal(projectile.progress, progressBeforePause);
  assert.equal(projectile.impactResolved, false);

  assert.equal(togglePause(state), true);
  advanceBy(state, impactBeforePause + 0.001);
  assert.equal(formatExpression(target.expression), '3x^2');
  assert.equal(projectile.status, 'impacted');
});

test('concurrent projectiles recalculate against the expression at each impact', () => {
  const state = createGame(452);
  freezeSpawns(state);
  state.effects = [];
  const target = testEnemy(polynomial([term(1, 2)]), { id: 'concurrent-impact' });
  const firstTower = configuredTower('derivative', undefined, { id: 'tower-derivative-a' });
  const secondTower = configuredTower('derivative', undefined, {
    id: 'tower-derivative-b', column: 1, position: 0.3,
  });
  state.enemies = [target];
  state.towers = [firstTower, secondTower];

  tick(state, 0.01);
  const projectiles = projectileEffects(state);
  assert.equal(projectiles.length, 2);
  assert.equal(formatExpression(target.expression), 'x^2');
  firstTower.cooldown = 999;
  secondTower.cooldown = 999;

  advanceBy(state, 0.521);
  assert.equal(formatExpression(target.expression), '2');
  assert.ok(projectiles.every((projectile) => projectile.impactResolved));
});

test('a later projectile misses a target killed by an earlier impact without duplicate reward', () => {
  const state = createGame(453);
  state.chapterIndex = 5;
  freezeSpawns(state);
  state.operatorQueue = [];
  state.effects = [];
  const target = testEnemy(polynomial(7), { id: 'missed-target' });
  const tower = configuredTower('derivative');
  state.enemies = [target];
  state.towers = [tower];

  tick(state, 0.01);
  const [killingProjectile] = projectileEffects(state);
  tower.cooldown = 999;
  const reflectId = addArsenalCard(state, 'reflect');
  assert.equal(selectArsenalItem(state, reflectId), true);
  assert.equal(applyTargetOperator(state, target.id), true);
  const laterProjectile = projectileEffects(state).find((effect) => effect.operatorId === 'reflect');
  const energyAfterLaunch = state.energy;

  advanceBy(state, killingProjectile.travelTime + 0.001);
  assert.equal(state.kills, 1);
  assert.equal(state.energy, energyAfterLaunch + target.reward);
  assert.equal(killingProjectile.status, 'impacted');
  assert.equal(laterProjectile.status, 'missed');
  assert.equal(laterProjectile.impactResolved, true);
  assert.equal(laterProjectile.missed, true);

  const logsAfterMiss = state.logs.length;
  advanceBy(state, 0.2);
  assert.equal(state.kills, 1);
  assert.equal(state.energy, energyAfterLaunch + target.reward);
  assert.equal(state.logs.length, logsAfterMiss);
});

test('a due projectile misses an enemy already at the base before body damage leaks', () => {
  const state = createGame(454);
  state.chapterIndex = 5;
  freezeSpawns(state);
  state.towers = [];
  state.operatorQueue = [];
  state.effects = [];
  const target = testEnemy(polynomial(12), {
    id: 'base-boundary-target',
    position: 0.126,
    reward: 80,
  });
  state.enemies = [target];
  const reflectId = addArsenalCard(state, 'reflect');
  assert.equal(selectArsenalItem(state, reflectId), true);
  assert.equal(applyTargetOperator(state, target.id), true);
  const [projectile] = projectileEffects(state);
  target.position = 0.125;
  projectile.impactIn = 0;
  const baseHpBefore = state.baseHp;
  const energyAfterLaunch = state.energy;

  tick(state, 0.01);

  assert.equal(projectile.status, 'missed');
  assert.equal(projectile.impactResolved, true);
  assert.equal(projectile.missed, true);
  assert.equal(formatExpression(target.expression), '12');
  assert.equal(state.baseHp, baseHpBefore - 12);
  assert.equal(state.enemies.length, 0);
  assert.equal(state.kills, 0);
  assert.equal(state.energy, energyAfterLaunch);
});

test('an enemy reaching the base earlier in the same frame makes its projectile miss', () => {
  const state = createGame(457);
  state.chapterIndex = 5;
  freezeSpawns(state);
  state.towers = [];
  state.operatorQueue = [];
  state.effects = [];
  const target = testEnemy(polynomial(12), {
    id: 'base-first-target', position: 0.126, speed: 0.01, reward: 80,
  });
  state.enemies = [target];
  const reflectId = addArsenalCard(state, 'reflect');
  assert.equal(selectArsenalItem(state, reflectId), true);
  assert.equal(applyTargetOperator(state, target.id), true);
  const [projectile] = projectileEffects(state);
  projectile.impactIn = 0.2;
  const baseHpBefore = state.baseHp;
  const energyAfterLaunch = state.energy;

  tick(state, 0.2);

  assert.equal(projectile.status, 'missed');
  assert.equal(projectile.missed, true);
  assert.equal(formatExpression(target.expression), '12');
  assert.equal(state.baseHp, baseHpBefore - 12);
  assert.equal(state.enemies.length, 0);
  assert.equal(state.kills, 0);
  assert.equal(state.energy, energyAfterLaunch);
});

test('a projectile arriving before the base crossing in the same frame hits first', () => {
  const state = createGame(458);
  state.chapterIndex = 3;
  freezeSpawns(state);
  state.towers = [];
  state.operatorQueue = [];
  state.effects = [];
  const target = testEnemy(polynomial(7), {
    id: 'projectile-first-target', position: 0.126, speed: 0.01,
  });
  state.enemies = [target];
  const cardId = addArsenalCard(state, 'partial');
  assert.equal(selectArsenalItem(state, cardId), true);
  assert.equal(confirmPartial(state), true);
  const [projectile] = projectileEffects(state);
  projectile.impactIn = 0.05;
  const baseHpBefore = state.baseHp;
  const energyAfterLaunch = state.energy;

  tick(state, 0.2);

  assert.equal(projectile.status, 'impacted');
  assert.equal(projectile.missed, false);
  assert.equal(state.baseHp, baseHpBefore);
  assert.equal(state.enemies.length, 0);
  assert.equal(state.kills, 1);
  assert.equal(state.energy, energyAfterLaunch + target.reward);
});

test('global partial remains retryable when no live target can be hit', () => {
  const state = createGame(455);
  state.chapterIndex = 3;
  freezeSpawns(state);
  state.towers = [];
  state.enemies = [];
  state.operatorQueue = [];
  state.effects = [];
  const cardId = addArsenalCard(state, 'partial');
  const energyBefore = state.energy;
  assert.equal(selectArsenalItem(state, cardId), true);
  assert.equal(state.partialConfirmOpen, true);

  assert.equal(confirmPartial(state), false);

  assert.equal(state.partialConfirmOpen, true);
  assert.equal(state.selectedOperatorItemId, cardId);
  assert.equal(state.operatorQueue.some((item) => item.id === cardId), true);
  assert.equal(state.energy, energyBefore);
  assert.equal(state.partialUsed, false);
  assert.equal(projectileEffects(state).length, 0);
});

test('the final impact pulse finishes before endless mode advances', () => {
  const state = createGame(456);
  state.chapterIndex = CHAPTERS.length;
  state.endlessRound = 1;
  state.phase = 'running';
  state.currentWave = { ...state.currentWave, entries: [] };
  state.nextSpawnIndex = 0;
  state.towers = [];
  state.effects = [];
  const target = testEnemy(polynomial(7), { id: 'last-impact-target', reward: 0 });
  const tower = configuredTower('derivative');
  state.enemies = [target];
  state.towers = [tower];
  const waveBeforeImpact = state.currentWave;

  tick(state, 0.01);
  const [projectile] = projectileEffects(state);
  tower.cooldown = 999;
  advanceBy(state, projectile.impactIn - 0.001);
  const resourcesBeforeImpact = {
    energy: state.energy,
    energyClock: state.energyClock,
    rngState: state.rngState,
  };

  advanceBy(state, 0.002);

  assert.equal(state.kills, 1);
  assert.equal(projectile.status, 'impacted');
  assert.equal(state.phase, 'running');
  assert.equal(state.endlessRound, 1);
  assert.strictEqual(state.currentWave, waveBeforeImpact);
  assert.deepEqual(
    { energy: state.energy, energyClock: state.energyClock, rngState: state.rngState },
    resourcesBeforeImpact,
  );

  advanceBy(state, projectile.ttl + 0.001);
  assert.equal(state.phase, 'preparing');
  assert.equal(state.endlessRound, 2);
  assert.notStrictEqual(state.currentWave, waveBeforeImpact);
  assert.equal(state.enemies.length, 0);
});

test('global partial differentiation hits each live enemy at its staggered impact', () => {
  const state = createGame(500);
  state.chapterIndex = 3;
  freezeSpawns(state);
  state.towers = [];
  state.effects = [];
  state.operatorQueue = [];
  state.enemies = [
    testEnemy(polynomial([term(1, 2)]), { id: 'partial-a', row: 0, position: 0.62 }),
    testEnemy(polynomial([term(1, 3)]), { id: 'partial-b', row: 2, position: 0.81 }),
    testEnemy(polynomial([term(1, 4)]), {
      id: 'partial-dead', row: 1, position: 0.71, dead: true,
    }),
  ];
  const cardId = addArsenalCard(state, 'partial');
  assert.equal(selectArsenalItem(state, cardId), true);

  assert.equal(confirmPartial(state), true);

  const projectiles = projectileEffects(state);
  assert.equal(projectiles.length, 2);
  assert.deepEqual(
    projectiles.map(({ row, position }) => ({ row, position })),
    [{ row: 0, position: 0.62 }, { row: 2, position: 0.81 }],
  );
  assert.equal(projectiles[0].delay, 0);
  assert.equal(projectiles[0].impactIn, 0.56);
  assert.equal(projectiles[1].delay, 0.035);
  assert.ok(Math.abs(projectiles[1].impactIn - 0.595) < 1e-12);
  assert.equal(formatExpression(state.enemies[0].expression), 'x^2');
  assert.equal(formatExpression(state.enemies[1].expression), 'x^3');

  advanceBy(state, 0.561);
  assert.equal(formatExpression(state.enemies[0].expression), '2x');
  assert.equal(formatExpression(state.enemies[1].expression), 'x^3');
  assert.equal(projectiles[0].status, 'impacted');
  assert.equal(projectiles[1].status, 'flying');

  advanceBy(state, 0.035);
  assert.equal(formatExpression(state.enemies[1].expression), '3x^2');
  assert.equal(projectiles[1].status, 'impacted');
});
