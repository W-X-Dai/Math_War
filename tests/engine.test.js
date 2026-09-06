import { GAMEPLAY_CONFIG } from '../src/config/gameplay.js';
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
  activeEnemyExpression,
  advanceEnemyTutorial,
  advanceWeaponTutorial,
  applyTargetOperator,
  castTargetOperatorFromArsenal,
  chapterEnemyTutorials,
  chapterWeaponTutorials,
  confirmPartial,
  createGame,
  discardTower,
  enemyThreat,
  currentAssembly,
  discardArsenalItem,
  discardConstantItem,
  discardFormulaItem,
  discardStoredConstant,
  deployTowerFromArsenal,
  installAssembly,
  inscribeParameterValue,
  partialPreview,
  placeTower,
  prepareAssembly,
  recycleTower,
  selectArsenalItem,
  selectConstantItem,
  selectFormulaItem,
  selectStoredConstant,
  startGame,
  startWave,
  storeNumericConstant,
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
  OPERATOR_ORDER,
  OPERATORS,
  STORED_CONSTANT_CAPACITY,
} from '../src/game/content.js';
import { CHAPTER_TUTORIALS, generateTutorialWave } from '../src/game/tutorial-content.js';
import { generateFiniteWave } from '../src/game/level-generator.js';

const term = (coefficient, xPower = 0, yPower = 0) => ({ coefficient, xPower, yPower });

function testEnemy(expression, overrides = {}) {
  return {
    id: overrides.id ?? 'enemy-test', typeId: 'procedural-test', name: '測試函數',
    art: 'enemy-art-polynomial', family: 'polynomial', row: 0, position: 0.72,
    expression, speed: 0.01, reward: 40, affixes: [], shieldExpression: null, shieldActive: false,
    splitExpressions: [], attackTimer: 99, divergentTimer: 0, hitFlash: 0,
    ...overrides,
  };
}

function freezeSpawns(state) {
  // Isolate combat assertions from periodic income, even with long flight settings.
  state.energyClock = -1000;
  state.currentWave = { ...state.currentWave, entries: [{ spawnAt: 999, row: 0 }] };
  state.nextSpawnIndex = 0;
  state.phase = 'running';
}

function addArsenalCard(state, operatorId, id = `manual-${operatorId}`) {
  const collection = OPERATORS[operatorId].kind === 'tower'
    ? state.operatorQueue
    : state.scrollLibrary;
  collection.push({ id, operatorId, source: OPERATORS[operatorId].kind === 'tower' ? 'manual' : 'unlimited', unlimited: OPERATORS[operatorId].kind !== 'tower' });
  state.energy = Math.max(state.energy, OPERATORS[operatorId].cost);
  return id;
}

function addConfiguredScroll(state, operatorId, details, id = `manual-${operatorId}`) {
  state.scrollLibrary.push({ id, operatorId, source: 'unlimited', unlimited: true, ...details });
  state.energy = Math.max(state.energy, OPERATORS[operatorId].cost);
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

function stationaryLaneCollisionIn(projectile, enemy) {
  const currentPosition = projectile.currentPosition ?? projectile.from;
  const destination = projectile.destinationPosition ?? projectile.position;
  const speed = (destination - projectile.from) / projectile.travelTime;
  return Math.max(0, (enemy.position - currentPosition) / speed);
}

function setLaneProjectilePosition(projectile, position) {
  projectile.currentPosition = position;
  projectile.progress = (position - projectile.from)
    / (projectile.destinationPosition - projectile.from);
  projectile.impactIn = projectile.travelTime * (1 - projectile.progress);
  projectile.ttl = projectile.impactIn + GAMEPLAY_CONFIG.effects.projectileImpactLingerSeconds;
}

const towerIds = (operatorIds) => operatorIds.filter(
  (operatorId) => OPERATORS[operatorId]?.kind === 'tower',
);

function assertProjectile(effect, operatorId, expected = {}) {
  assert.ok(effect, `${operatorId} should emit a projectile`);
  assert.equal(effect.operatorId, operatorId);
  assert.equal(effect.shape, OPERATORS[operatorId].projectile.shape);
  assert.equal(effect.trajectory, OPERATORS[operatorId].projectile.trajectory);
  assert.equal(effect.status, 'flying');
  assert.equal(effect.impactResolved, false);
  assert.equal(effect.missed, false);
  assert.equal(effect.progress, 0);
  assert.equal(effect.travelTime, GAMEPLAY_CONFIG.effects.projectileTravelSeconds[effect.trajectory]);
  assert.equal(effect.impactIn, effect.travelTime + (effect.delay ?? 0));
  for (const [key, value] of Object.entries(expected)) assert.equal(effect[key], value);
}

function dismissIntroductions(state) {
  while (state.enemyTutorialQueue.length > 0) assert.equal(advanceEnemyTutorial(state), true);
  while (state.weaponTutorialQueue.length > 0) assert.equal(advanceWeaponTutorial(state), true);
}

test('the compatible default starts level one with its deterministic tutorial sandbox', () => {
  const first = createGame(12345);
  const replay = createGame(12345, { mode: 'level', levelIndex: 0, skipTutorial: false });
  assert.equal(first.phase, 'intro');
  assert.equal(first.mode, 'level');
  assert.equal(first.levelIndex, 0);
  assert.equal(first.skipTutorial, false);
  assert.equal(first.runSeed, 12345);
  assert.deepEqual(first.currentWave, replay.currentWave);
  assert.equal(first.currentWave.kind, 'tutorial');
  assert.deepEqual(first.currentWave, generateTutorialWave(0));
  assert.deepEqual(first.board, { rows: 4, columns: 7, placeableColumns: 4 });
  assert.equal(first.operatorQueue.length, towerIds(CHAPTER_TUTORIALS[0].starterOperators).length);
  assert.deepEqual(first.operatorQueue.map((item) => item.operatorId), towerIds(CHAPTER_TUTORIALS[0].starterOperators));
  assert.deepEqual(first.scrollLibrary.map((item) => item.operatorId), ['add', 'subtract']);
  assert.equal(first.towers.length, CHAPTER_TUTORIALS[0].presetTowers.length);
  assert.ok(first.towers.every((tower) => tower.tutorialPreset));
  assert.deepEqual(
    first.tutorialSnapshot.operatorQueue.map((item) => item.operatorId),
    towerIds(CHAPTERS[0].starterOperators),
  );
  assert.deepEqual(
    first.tutorialSnapshot.formulaQueue.map((item) => item.cardId),
    CHAPTERS[0].starterFormulaIds,
  );
  assert.deepEqual(
    first.tutorialSnapshot.constantQueue.map((item) => item.value),
    CHAPTERS[0].starterConstants,
  );
  const presetTowerCount = first.towers.length;
  assert.equal(presetTowerCount, 0);
  assert.equal(discardTower(first, 'missing-tutorial-tower'), false);
  assert.equal(first.towers.length, presetTowerCount);
});

test('all six levels can start independently with their own fresh formal loadout', () => {
  for (const [levelIndex, chapter] of CHAPTERS.entries()) {
    const state = createGame(12000 + levelIndex, {
      mode: 'level',
      levelIndex,
      skipTutorial: true,
    });
    assert.equal(state.phase, 'intro');
    assert.equal(state.mode, 'level');
    assert.equal(state.chapterIndex, levelIndex);
    assert.equal(state.levelIndex, levelIndex);
    assert.equal(state.skipTutorial, true);
    assert.equal(state.baseHp, state.maxBaseHp);
    assert.equal(state.energy, chapter.startingEnergy);
    assert.deepEqual(state.board, chapter.board);
    assert.deepEqual(
      state.operatorQueue.filter((item) => item.source === 'starter').map((item) => item.operatorId),
      towerIds(chapter.starterOperators),
    );
    assert.deepEqual(
      state.scrollLibrary.map((item) => item.operatorId),
      Object.values(OPERATORS)
        .filter((operator) => operator.kind !== 'tower' && operator.unlockChapter <= levelIndex)
        .sort((left, right) => OPERATOR_ORDER.indexOf(left.id) - OPERATOR_ORDER.indexOf(right.id))
        .map((operator) => operator.id),
    );
    assert.ok(state.scrollLibrary.every((item) => item.unlimited && item.source === 'unlimited'));
    assert.deepEqual(
      state.formulaQueue.filter((item) => item.source === 'starter').map((item) => item.cardId),
      chapter.starterFormulaIds,
    );
    assert.deepEqual(
      state.constantQueue.filter((item) => item.source === 'starter').map((item) => item.value),
      chapter.starterConstants,
    );
    assert.equal(state.towers.length, 0);
    assert.equal(state.storedConstants.length, 0);
    assert.equal(state.kills, 0);
    assert.equal(state.maxChain, 0);
    assert.equal(state.currentWave.segmentIndex, 1);
    assert.deepEqual(state.currentWave, generateFiniteWave(12000 + levelIndex, levelIndex, 1));
    assert.equal(state.enemyTutorialQueue.length, 0);
    assert.equal(state.weaponTutorialQueue.length, 0);
    assert.equal(state.tutorialSnapshot, null);
    assert.equal(state.receivedSupplyGrantIds.length, 1);
  }
});

test('starting another level never inherits resources or statistics from the previous game', () => {
  const previous = createGame(99, { levelIndex: 4, skipTutorial: true });
  previous.baseHp = 7;
  previous.energy = 1;
  previous.kills = 20;
  previous.maxChain = 12;
  previous.towers.push(configuredTower('derivative'));
  previous.storedConstants.push({ id: 'old-constant', value: 9 });

  const next = createGame(100, { levelIndex: 2, skipTutorial: true });
  assert.equal(next.baseHp, next.maxBaseHp);
  assert.equal(next.energy, CHAPTERS[2].startingEnergy);
  assert.equal(next.kills, 0);
  assert.equal(next.maxChain, 0);
  assert.equal(next.towers.length, 0);
  assert.equal(next.storedConstants.length, 0);
});

test('startGame logs the selected level path or independent endless mode', () => {
  const tutorial = createGame(1, { levelIndex: 3 });
  assert.equal(startGame(tutorial), true);
  assert.match(tutorial.logs[0].equation, /第 4 關教學開始/);

  const skipped = createGame(2, { levelIndex: 3, skipTutorial: true });
  assert.equal(startGame(skipped), true);
  assert.match(skipped.logs[0].equation, /第 4 關壓力段整備開始；已略過教學/);

  const endless = createGame(3, { mode: 'endless' });
  assert.equal(startGame(endless), true);
  assert.match(endless.logs[0].equation, /無限證明第 1 輪整備開始/);
});

test('tutorial preparation starts without an early-start bonus', () => {
  const state = createGame(10);
  assert.equal(startGame(state), true);
  dismissIntroductions(state);
  tick(state, 0.2);
  const before = state.energy;
  assert.equal(startWave(state), true);
  assert.equal(state.phase, 'running');
  assert.equal(state.energy, before);
  assert.equal(state.prepRemaining, 0);
});

test('only the pressure segment awards early-start energy', () => {
  const state = createGame(101);
  startGame(state);
  dismissIntroductions(state);
  state.phase = 'running';
  state.currentWave = { ...state.currentWave, entries: [] };
  state.nextSpawnIndex = 0;
  tick(state, 0.01);
  const before = state.energy;
  assert.equal(state.currentWave.kind, 'challenge');
  assert.equal(startWave(state), true);
  assert.equal(state.energy, before + 150);

  state.currentWave = { ...state.currentWave, entries: [] };
  state.nextSpawnIndex = 0;
  tick(state, 0.01);
  assert.equal(state.currentWave.segmentIndex, 2);
  const beforeMixed = state.energy;
  assert.equal(startWave(state), true);
  assert.equal(state.energy, beforeMixed);
});

test('preparation auto-starts without bonus and pause freezes its clock', () => {
  const state = createGame(11);
  startGame(state);
  dismissIntroductions(state);
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

test('new enemies and weapons pause preparation until their introductions are read', () => {
  assert.deepEqual(chapterWeaponTutorials(0), ['add', 'subtract']);
  assert.deepEqual(
    chapterWeaponTutorials(1),
    ['derivative', 'secondDerivative', 'multiply', 'divide', 'squareRoot', 'integral'],
  );
  assert.deepEqual(chapterWeaponTutorials(2), ['limit', 'eulerTower']);
  assert.deepEqual(chapterWeaponTutorials(3), ['partial', 'evaluateTower']);
  assert.deepEqual(chapterWeaponTutorials(4), ['definiteIntegralTower', 'resonanceTower']);
  assert.deepEqual(chapterWeaponTutorials(5), ['reflect']);
  assert.deepEqual(chapterWeaponTutorials(CHAPTERS.length), []);
  assert.deepEqual(chapterEnemyTutorials(0), ['constant']);
  assert.deepEqual(chapterEnemyTutorials(4), ['trigonometric']);
  assert.deepEqual(chapterEnemyTutorials(CHAPTERS.length), []);

  const state = createGame(111);
  startGame(state);
  assert.deepEqual(state.enemyTutorialQueue, ['constant']);
  assert.deepEqual(state.weaponTutorialQueue, ['add', 'subtract']);

  const prepBefore = state.prepRemaining;
  const formulaCooldownBefore = state.formulaCooldown;
  tick(state, 1);
  assert.equal(state.prepRemaining, prepBefore);
  assert.equal(state.formulaCooldown, formulaCooldownBefore);
  assert.equal(startWave(state), false);

  assert.equal(advanceEnemyTutorial(state), true);
  assert.deepEqual(state.enemyTutorialQueue, []);
  assert.equal(advanceWeaponTutorial(state), true);
  assert.deepEqual(state.weaponTutorialQueue, ['subtract']);
  assert.equal(advanceWeaponTutorial(state), true);
  assert.deepEqual(state.weaponTutorialQueue, []);
  tick(state, 0.2);
  assert.ok(state.prepRemaining < prepBefore);
});

test('clearing a tutorial wave restores sandbox state and opens the seeded challenge', () => {
  const state = createGame(112);
  startGame(state);
  dismissIntroductions(state);
  state.phase = 'running';
  state.currentWave = { ...state.currentWave, entries: [] };
  state.nextSpawnIndex = 0;
  state.baseHp = 410;
  state.energy = 1;
  state.kills = 9;
  state.maxChain = 9;
  tick(state, 0.01);

  assert.equal(state.chapterIndex, 0);
  assert.equal(state.currentWave.kind, 'challenge');
  assert.equal(state.phase, 'preparing');
  assert.equal(state.baseHp, 500);
  assert.equal(state.energy, CHAPTERS[0].startingEnergy);
  assert.equal(state.kills, 0);
  assert.equal(state.maxChain, 0);
  assert.equal(state.towers.length, 0);
  assert.deepEqual(
    state.operatorQueue.map((item) => item.operatorId),
    towerIds([...CHAPTERS[0].starterOperators, ...state.currentWave.guaranteedSupply.operators]),
  );
  assert.deepEqual(
    state.operatorQueue.filter((item) => item.source === 'starter').map((item) => item.operatorId),
    towerIds(CHAPTERS[0].starterOperators),
  );
  assert.deepEqual(
    state.operatorQueue.filter((item) => item.source === 'guaranteed').map((item) => item.operatorId),
    towerIds(state.currentWave.guaranteedSupply.operators),
  );
  assert.deepEqual(state.currentWave, generateFiniteWave(112, 0));
});

test('losing a tutorial wave restarts its sandbox instead of ending the run', () => {
  const state = createGame(113);
  startGame(state);
  dismissIntroductions(state);
  state.phase = 'running';
  state.baseHp = 0;
  tick(state, 0.01);
  assert.equal(state.phase, 'preparing');
  assert.equal(state.baseHp, 500);
  assert.equal(state.currentWave.kind, 'tutorial');
  assert.equal(state.enemyTutorialQueue.length, 0);
  assert.equal(state.weaponTutorialQueue.length, 0);
  assert.ok(state.towers.every((tower) => tower.tutorialPreset));
});

test('placing a tower consumes one matching card and its energy cost', () => {
  const state = createGame(12, { levelIndex: 1, skipTutorial: true });
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

test('drag-style tower deployment uses the dragged card without relying on selection', () => {
  const state = createGame(121, { levelIndex: 1, skipTutorial: true });
  startGame(state);
  const dragged = state.operatorQueue.find((card) => card.operatorId === 'derivative');
  const selected = state.operatorQueue.find((card) => card.id !== dragged.id);
  const energyBefore = state.energy;
  state.selectedOperatorItemId = selected.id;
  state.selectedOperator = selected.operatorId;

  assert.equal(deployTowerFromArsenal(state, dragged.id, 0, 0), true);
  assert.equal(state.energy, energyBefore - OPERATORS.derivative.cost);
  assert.equal(state.operatorQueue.some((card) => card.id === dragged.id), false);
  assert.equal(state.operatorQueue.some((card) => card.id === selected.id), true);
  assert.equal(state.towers[0].typeId, 'derivative');
  assert.equal(state.selectedOperatorItemId, null);
});

test('recycling a player tower returns half its original cost regardless of damage', () => {
  const state = createGame(120);
  const tower = configuredTower('secondDerivative', undefined, { hp: 17, maxHp: 150 });
  state.towers = [tower];
  state.energy = 9;

  assert.equal(recycleTower(state, tower.id), true);
  assert.equal(state.energy, 9 + OPERATORS.secondDerivative.cost / 2);
  assert.equal(state.towers.length, 0);
  assert.match(state.logs[0].equation, /返還/);
  assert.equal(recycleTower(state, tower.id), false);
});

test('failed arsenal selection keeps both card and energy', () => {
  const state = createGame(13, { levelIndex: 1, skipTutorial: true });
  startGame(state);
  const item = state.operatorQueue.find((card) => card.operatorId === 'derivative');
  state.energy = 0;
  assert.equal(selectArsenalItem(state, item.id), false);
  assert.equal(state.operatorQueue.some((card) => card.id === item.id), true);
  assert.equal(state.energy, 0);
});

test('a shielded enemy uses its body damage at the base and leaves without a kill reward', () => {
  const state = createGame(131);
  freezeSpawns(state);
  const leakingEnemy = testEnemy(polynomial(12), {
    position: 0.12,
    attackTimer: 99,
    reward: 80,
    affixes: ['shield'],
    shieldExpression: polynomial(99),
    shieldActive: true,
  });
  state.enemies.push(leakingEnemy);
  const energyBefore = state.energy;

  assert.equal(enemyThreat(leakingEnemy), 12);
  tick(state, 0.05);
  assert.equal(state.baseHp, 488);
  assert.equal(state.enemies.length, 0);
  assert.equal(state.kills, 0);
  assert.equal(state.energy, energyBefore);

  tick(state, 5);
  assert.equal(state.baseHp, 488);
});

test('non-leading formula and constant cards assemble and inscribe a scroll', () => {
  const state = createGame(14, { levelIndex: 1, skipTutorial: true });
  const formula = state.formulaQueue.find((item) => item.cardId === 'doubleK');
  const constant = state.constantQueue.find((item) => item.value === 2);
  const subtractCard = state.scrollLibrary.find((item) => item.operatorId === 'subtract');
  assert.equal(selectFormulaItem(state, formula.id), true);
  assert.equal(selectConstantItem(state, constant.id), true);
  assert.equal(currentAssembly(state).value, 4);
  assert.equal(prepareAssembly(state), true);
  assert.equal(state.storedConstants.length, 1);
  assert.equal(state.storedConstants[0].value, 4);
  assert.equal(selectArsenalItem(state, subtractCard.id), true);
  assert.equal(subtractCard.parameter, 4);
  assert.equal(state.towers.some((tower) => tower.typeId === 'subtract'), false);
  assert.equal(state.scrollLibrary.some((item) => item.id === subtractCard.id), true);
  assert.equal(state.storedConstants.length, 0);
  assert.equal(state.formulaQueue.some((item) => item.id === formula.id), false);
  assert.equal(state.constantQueue.some((item) => item.id === constant.id), false);
});

test('a blank parameter scroll cannot target until it has been inscribed', () => {
  const state = createGame(140);
  state.chapterIndex = 5;
  state.operatorQueue = [];
  const cardId = addArsenalCard(state, 'eulerTower');
  const energyBefore = state.energy;

  assert.equal(selectArsenalItem(state, cardId), false);
  assert.equal(state.targetingOperator, null);
  assert.equal(state.scrollLibrary.some((item) => item.id === cardId), true);
  assert.equal(state.energy, energyBefore);
});

test('a definite-integral scroll records both bounds before entering targeting mode', () => {
  const state = createGame(143);
  state.chapterIndex = 5;
  state.operatorQueue = [];
  state.storedConstants = [
    { id: 'lower', value: 0 },
    { id: 'upper', value: Math.PI },
  ];
  state.selectedStoredConstantId = 'lower';
  const cardId = addArsenalCard(state, 'definiteIntegralTower');
  const card = state.scrollLibrary.find((item) => item.id === cardId);

  assert.equal(selectArsenalItem(state, cardId), true);
  assert.equal(card.lowerBound, 0);
  assert.equal(card.upperBound, undefined);
  assert.equal(state.selectedStoredConstantId, null);
  assert.equal(selectStoredConstant(state, 'upper'), true);
  assert.equal(selectArsenalItem(state, cardId), true);
  assert.equal(card.upperBound, Math.PI);
  assert.equal(state.selectedStoredConstantId, null);
  assert.equal(selectArsenalItem(state, cardId), true);
  assert.equal(state.targetingOperator, 'definiteIntegralTower');
  assert.equal(state.selectedOperatorItemId, cardId);
  assert.equal(selectArsenalItem(state, cardId), true);
  state.storedConstants = [{ id: 'replacement', value: 7 }];
  state.selectedStoredConstantId = 'replacement';
  assert.equal(selectArsenalItem(state, cardId), true);
  assert.equal(card.lowerBound, 0);
  assert.equal(card.upperBound, Math.PI);
  assert.equal(state.storedConstants[0].id, 'replacement');
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

test('numeric keypad constants support signed values and pi up to library capacity', () => {
  const state = createGame(1411);
  state.storedConstants = [];
  assert.equal(storeNumericConstant(state, -12.5), true);
  assert.equal(storeNumericConstant(state, Math.PI, '數字鍵盤 π'), true);
  assert.deepEqual(state.storedConstants.map((item) => item.value), [-12.5, Math.PI]);
  assert.equal(state.selectedStoredConstantId, state.storedConstants[1].id);
  assert.equal(storeNumericConstant(state, Number.POSITIVE_INFINITY), false);
  assert.equal(state.storedConstants.length, 2);
});

test('any stored constant can be selected, discarded, or inscribed on a parameter scroll', () => {
  const state = createGame(142);
  state.storedConstants = [
    { id: 'stored-a', value: 2, source: 'k｜k=2' },
    { id: 'stored-b', value: 7, source: 'k｜k=7' },
    { id: 'stored-c', value: 11, source: 'k｜k=11' },
  ];
  state.selectedStoredConstantId = 'stored-a';
  const ordinaryCard = { id: 'ordinary-card', operatorId: 'derivative' };
  const parameterScroll = { id: 'parameter-scroll', operatorId: 'eulerTower' };
  state.operatorQueue.push(ordinaryCard);
  state.scrollLibrary.push(parameterScroll);

  assert.equal(selectStoredConstant(state, 'stored-b'), true);
  assert.equal(installAssembly(state, ordinaryCard.id), false);
  assert.equal(state.storedConstants.length, 3);
  assert.equal(installAssembly(state, parameterScroll.id), true);
  assert.equal(parameterScroll.parameter, 7);
  assert.deepEqual(state.storedConstants.map((item) => item.value), [2, 11]);
  assert.equal(discardStoredConstant(state, 'stored-c'), true);
  assert.deepEqual(state.storedConstants.map((item) => item.value), [2]);
  assert.equal(selectStoredConstant(state, 'stored-a'), true);
  assert.equal(state.selectedStoredConstantId, 'stored-a');
  assert.equal(selectStoredConstant(state, 'stored-a'), true);
  assert.equal(state.selectedStoredConstantId, null);
});

test('drag-style inscription uses the dropped constant instead of the selected constant', () => {
  const state = createGame(1421);
  state.storedConstants = [
    { id: 'selected-constant', value: 2, source: 'selected' },
    { id: 'dragged-constant', value: 7, source: 'dragged' },
  ];
  state.selectedStoredConstantId = 'selected-constant';
  const cardId = addArsenalCard(state, 'eulerTower');
  const parameterScroll = state.scrollLibrary.find((item) => item.id === cardId);

  assert.equal(installAssembly(state, cardId, 'dragged-constant'), true);
  assert.equal(parameterScroll.parameter, 7);
  assert.deepEqual(state.storedConstants.map((item) => item.id), ['selected-constant']);
  assert.equal(state.selectedStoredConstantId, 'selected-constant');
});

test('numeric discs inscribe direct constants without using stored inventory', () => {
  const state = createGame(1422);
  state.storedConstants = [{ id: 'kept-constant', value: -4, source: 'stored' }];
  state.selectedStoredConstantId = 'kept-constant';
  const cardId = addArsenalCard(state, 'definiteIntegralTower');
  const parameterScroll = state.scrollLibrary.find((item) => item.id === cardId);

  assert.equal(inscribeParameterValue(state, cardId, 0, '圓盤 0'), true);
  assert.equal(parameterScroll.lowerBound, 0);
  assert.equal(inscribeParameterValue(state, cardId, Math.E, '圓盤 e'), true);
  assert.equal(parameterScroll.upperBound, Math.E);
  assert.deepEqual(state.storedConstants, [{ id: 'kept-constant', value: -4, source: 'stored' }]);
  assert.equal(state.selectedStoredConstantId, 'kept-constant');
  assert.equal(inscribeParameterValue(state, cardId, Math.PI), false);
  assert.equal(inscribeParameterValue(state, cardId, Number.POSITIVE_INFINITY), false);
});

test('drag-style target casting rejects blank scrolls without consuming selected constants', () => {
  const state = createGame(1422);
  state.chapterIndex = 5;
  freezeSpawns(state);
  state.operatorQueue = [];
  state.storedConstants = [{ id: 'selected-constant', value: 9, source: 'selected' }];
  state.selectedStoredConstantId = 'selected-constant';
  const target = testEnemy(polynomial([term(1, 1)]), { speed: 0 });
  state.enemies.push(target);
  const blankCardId = addArsenalCard(state, 'eulerTower');
  const energyBefore = state.energy;

  assert.equal(castTargetOperatorFromArsenal(state, blankCardId, target.id), false);
  assert.deepEqual(state.storedConstants.map((item) => item.id), ['selected-constant']);
  assert.equal(state.scrollLibrary.find((item) => item.id === blankCardId).parameter, undefined);
  assert.equal(state.energy, energyBefore);
});

test('drag-style inscription fills both definite-integral bounds in order', () => {
  const state = createGame(1424);
  state.chapterIndex = 5;
  state.operatorQueue = [];
  state.storedConstants = [
    { id: 'lower-bound', value: 0, source: 'lower' },
    { id: 'upper-bound', value: Math.PI, source: 'upper' },
  ];
  const cardId = addArsenalCard(state, 'definiteIntegralTower');
  const card = state.scrollLibrary.find((item) => item.id === cardId);

  assert.equal(installAssembly(state, cardId, 'lower-bound'), true);
  assert.equal(card.lowerBound, 0);
  assert.equal(card.upperBound, undefined);
  assert.equal(installAssembly(state, cardId, 'upper-bound'), true);
  assert.equal(card.upperBound, Math.PI);
  assert.equal(state.storedConstants.length, 0);
});

test('drag-style target casting fires a configured scroll directly at the dropped enemy', () => {
  const state = createGame(1423);
  state.chapterIndex = 5;
  freezeSpawns(state);
  state.operatorQueue = [];
  const target = testEnemy(polynomial([term(4, -2)]), { speed: 0 });
  state.enemies.push(target);
  const cardId = addConfiguredScroll(state, 'eulerTower', { parameter: 2 });
  const energyBefore = state.energy;

  assert.equal(castTargetOperatorFromArsenal(state, cardId, target.id), true);
  assert.equal(state.energy, energyBefore - OPERATORS.eulerTower.cost);
  assert.equal(projectileEffects(state)[0].targetId, target.id);
  assert.equal(projectileEffects(state)[0].parameter, 2);
  assert.equal(state.scrollLibrary.find((item) => item.id === cardId).parameter, undefined);
});

test('tower and compatibility material queues refill during preparation and respect capacity', () => {
  const state = createGame(15, { levelIndex: 1, skipTutorial: true });
  startGame(state);
  state.operatorQueue = state.operatorQueue.slice(0, OPERATOR_QUEUE_CAPACITY - 1);
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

test('chapter one safely skips tower refill when no tower has been unlocked', () => {
  const state = createGame(151, { levelIndex: 0, skipTutorial: true });
  startGame(state);
  state.operatorQueue = [];
  state.formulaQueue = Array.from(
    { length: FORMULA_QUEUE_CAPACITY },
    (_, index) => ({ id: `full-formula-${index}`, cardId: 'identityK' }),
  );
  state.constantQueue = Array.from(
    { length: CONSTANT_QUEUE_CAPACITY },
    (_, index) => ({ id: `full-constant-${index}`, value: index + 1 }),
  );
  state.operatorCooldown = 0;
  const rngBefore = state.rngState;

  assert.doesNotThrow(() => tick(state, 0.01));
  assert.deepEqual(state.operatorQueue, []);
  assert.equal(state.rngState, rngBefore);
  assert.equal(state.effects.some((effect) => effect.type === 'queue' && effect.label === '+ 軍械'), false);
});

test('tower, formula, and constant items can be discarded while unlimited scrolls cannot', () => {
  const state = createGame(16, { levelIndex: 1, skipTutorial: true });
  const [arsenal, formula, constant] = [state.operatorQueue[0], state.formulaQueue[2], state.constantQueue[3]];
  const scroll = state.scrollLibrary[0];
  assert.equal(discardArsenalItem(state, arsenal.id), true);
  assert.equal(discardArsenalItem(state, scroll.id), false);
  assert.equal(discardFormulaItem(state, formula.id), true);
  assert.equal(discardConstantItem(state, constant.id), true);
  assert.equal(state.operatorQueue.some((item) => item.id === arsenal.id), false);
  assert.equal(state.scrollLibrary.some((item) => item.id === scroll.id), true);
  assert.equal(state.formulaQueue.some((item) => item.id === formula.id), false);
  assert.equal(state.constantQueue.some((item) => item.id === constant.id), false);
});

test('pressure resources continue into mixed and clearing mixed wins the selected level', () => {
  const state = createGame(17, { levelIndex: 1, skipTutorial: true });
  startGame(state);
  state.energy = 1;
  state.storedConstants = [{ id: 'persistent-constant', value: 9, source: 'k+10｜k=-1' }];
  state.selectedStoredConstantId = 'persistent-constant';
  const persistentTower = configuredTower('secondDerivative', undefined, {
    id: 'persistent-tower', row: 3, column: 3, hp: 77, maxHp: 150,
  });
  state.towers.push(persistentTower);
  state.operatorQueue.push({ id: 'persistent-card', operatorId: 'derivative', source: 'random' });
  state.scrollLibrary.push({
    id: 'persistent-scroll', operatorId: 'eulerTower', parameter: 2, source: 'random',
  });
  state.baseHp = 350;

  state.phase = 'running';
  state.currentWave = { ...state.currentWave, entries: [] };
  state.nextSpawnIndex = 0;
  tick(state, 0.01);

  assert.equal(state.chapterIndex, 1);
  assert.equal(state.phase, 'preparing');
  assert.equal(state.currentWave.segmentIndex, 2);
  assert.equal(state.baseHp, 350);
  assert.equal(state.energy, 1);
  assert.deepEqual(state.board, CHAPTERS[1].board);
  assert.deepEqual(state.storedConstants, [{ id: 'persistent-constant', value: 9, source: 'k+10｜k=-1' }]);
  assert.equal(state.selectedStoredConstantId, 'persistent-constant');
  assert.ok(state.operatorQueue.some((item) => item.id === 'persistent-card'));
  assert.equal(state.scrollLibrary.find((item) => item.id === 'persistent-scroll').parameter, 2);
  const continuedTower = state.towers.find((tower) => tower.id === persistentTower.id);
  assert.equal(continuedTower.hp, 77);

  state.phase = 'running';
  state.currentWave = { ...state.currentWave, entries: [] };
  state.nextSpawnIndex = 0;
  tick(state, 0.01);

  assert.equal(state.phase, 'won');
  assert.equal(state.chapterIndex, 1);
  assert.equal(state.currentWave.segmentIndex, 2);
  assert.equal(state.baseHp, 350);
  assert.equal(state.energy, 1);
  assert.ok(state.operatorQueue.some((item) => item.id === 'persistent-card'));
  assert.equal(state.scrollLibrary.find((item) => item.id === 'persistent-scroll').parameter, 2);
  assert.equal(state.towers.find((tower) => tower.id === persistentTower.id).hp, 77);
});

test('endless starts from its fixed loadout and preserves resources between rounds', () => {
  const state = createGame(18, { mode: 'endless' });
  assert.equal(state.mode, 'endless');
  assert.equal(state.chapterIndex, CHAPTERS.length);
  assert.equal(state.levelIndex, null);
  assert.equal(state.endlessRound, 1);
  assert.equal(state.baseHp, state.maxBaseHp);
  assert.equal(state.energy, ENDLESS_CHAPTER.startingEnergy);
  assert.deepEqual(state.board, ENDLESS_CHAPTER.board);
  assert.deepEqual(
    state.operatorQueue.filter((item) => item.source === 'starter').map((item) => item.operatorId),
    towerIds(ENDLESS_CHAPTER.starterOperators),
  );
  assert.deepEqual(
    state.formulaQueue.filter((item) => item.source === 'starter').map((item) => item.cardId),
    ENDLESS_CHAPTER.starterFormulaIds,
  );
  assert.deepEqual(
    state.constantQueue.filter((item) => item.source === 'starter').map((item) => item.value),
    ENDLESS_CHAPTER.starterConstants,
  );
  assert.equal(state.towers.length, 0);
  assert.equal(state.tutorialSnapshot, null);
  assert.equal(state.enemyTutorialQueue.length, 0);
  assert.equal(state.weaponTutorialQueue.length, 0);

  startGame(state);
  state.energy = 777;
  state.storedConstants = [{ id: 'endless-constant', value: Math.PI, source: 'k｜k=π' }];
  state.selectedStoredConstantId = 'endless-constant';
  const persistentTower = configuredTower('derivative', undefined, {
    id: 'endless-persistent-tower', row: 2, column: 3, hp: 88,
  });
  state.towers = [persistentTower];
  state.operatorQueue.push({ id: 'endless-card', operatorId: 'derivative', source: 'random' });

  state.phase = 'running';
  state.currentWave = { ...state.currentWave, entries: [] };
  state.nextSpawnIndex = 0;
  tick(state, 0.01);
  assert.equal(state.endlessRound, 2);
  assert.equal(state.phase, 'preparing');
  assert.equal(state.prepDuration, 28);
  assert.equal(state.energy, 777);
  assert.equal(state.towers[0].id, persistentTower.id);
  assert.equal(state.towers[0].hp, 88);
  assert.equal(state.storedConstants[0].value, Math.PI);
  assert.ok(state.operatorQueue.some((item) => item.id === 'endless-card'));
});

test('configured parameter scrolls apply their mathematical operators without occupying a lane', async (t) => {
  const cases = [
    ['D² + 4I annihilates sin(2x)', 'resonanceTower', 4, trigonometric('sin', 2, 3)],
    ['xD + 2I annihilates x^-2', 'eulerTower', 2, polynomial([term(5, -2)])],
    ['f(1) annihilates x - 1', 'evaluateTower', 1, polynomial([term(1, 1), term(-1)])],
  ];
  for (const [name, typeId, parameter, expression] of cases) {
    await t.test(name, () => {
      const state = createGame(20 + parameter);
      state.chapterIndex = 5;
      freezeSpawns(state);
      state.towers = [];
      state.operatorQueue = [];
      const target = testEnemy(expression, { speed: 0 });
      state.enemies.push(target);
      const cardId = addConfiguredScroll(state, typeId, { parameter });
      assert.equal(selectArsenalItem(state, cardId), true);
      assert.equal(applyTargetOperator(state, target.id), true);
      assert.equal(state.towers.length, 0);
      assert.equal(state.enemies.length, 1);
      assert.equal(formatExpression(target.expression), formatExpression(expression));
      const [projectile] = projectileEffects(state);
      assertProjectile(projectile, typeId, {
        parameter,
        targetId: target.id,
        sourceTowerId: null,
      });
      advanceBy(state, projectile.impactIn + 0.001);
      assert.equal(target.dead, true);
      assert.equal(formatExpression(target.expression), '0');
      assert.equal(state.enemies.includes(target), false);
    });
  }
});

test('f(k) substitutes x without silently setting z to zero', () => {
  const state = createGame(24);
  state.chapterIndex = 5;
  freezeSpawns(state);
  state.towers = [];
  state.operatorQueue = [];
  const target = testEnemy(polynomial([term(1, 1, 2)]));
  state.enemies.push(target);
  const cardId = addConfiguredScroll(state, 'evaluateTower', { parameter: 1 });

  assert.equal(selectArsenalItem(state, cardId), true);
  assert.equal(applyTargetOperator(state, target.id), true);
  advanceBy(state, GAMEPLAY_CONFIG.effects.projectileTravelSeconds.drop);
  assert.equal(formatExpression(target.expression), 'z^2');
});

test('every tower attack emits its own semantic projectile metadata', async (t) => {
  const cases = [
    {
      operatorId: 'derivative',
      expression: polynomial([term(1, 2)]),
      expected: {},
    },
    {
      operatorId: 'secondDerivative',
      expression: polynomial([term(1, 3)]),
      expected: {},
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
      state.enemies = [target];
      state.towers.push(configuredTower(
        fixture.operatorId,
        undefined,
      ));

      tick(state, 0.01);

      const projectiles = projectileEffects(state);
      assert.equal(projectiles.length, 1);
      assertProjectile(projectiles[0], fixture.operatorId, {
        targetId: target.id,
        sourceTowerId: `tower-${fixture.operatorId}`,
        row: 0,
        from: 0.2,
        position: GAMEPLAY_CONFIG.geometry.projectileExitPosition,
        currentPosition: 0.2,
        destinationPosition: GAMEPLAY_CONFIG.geometry.projectileExitPosition,
        initialTargetId: target.id,
        impactTargetId: null,
        ...fixture.expected,
      });
    });
  }
});

test('an idle ready tower does not bank cooldown and burst-fire at the next target', () => {
  const state = createGame(399);
  freezeSpawns(state);
  state.towers = [];
  state.enemies = [];
  state.effects = [];
  const tower = configuredTower('derivative');
  state.towers = [tower];

  advanceBy(state, 5);
  assert.equal(tower.cooldown, 0);

  const target = testEnemy(polynomial([term(1, 5)]), { speed: 0 });
  state.enemies = [target];
  tick(state, 0.01);
  assert.equal(projectileEffects(state).length, 1);

  tick(state, 0.01);
  assert.equal(projectileEffects(state).length, 1);
  assert.ok(tower.cooldown > 1.7);
});

test('every single-target operator emits a falling semantic projectile', async (t) => {
  const cases = [
    {
      operatorId: 'add',
      expression: polynomial(-3),
      details: { parameter: 3 },
    },
    {
      operatorId: 'subtract',
      expression: polynomial(3),
      details: { parameter: 3 },
    },
    {
      operatorId: 'multiply',
      expression: polynomial(3),
      details: { parameter: 2 },
    },
    {
      operatorId: 'divide',
      expression: polynomial(6),
      details: { parameter: 2 },
    },
    {
      operatorId: 'squareRoot',
      expression: polynomial(9),
    },
    {
      operatorId: 'definiteIntegralTower',
      expression: polynomial([term(1, 1)]),
      details: { lowerBound: 0, upperBound: 1 },
    },
    {
      operatorId: 'evaluateTower',
      expression: polynomial([term(1, 1)]),
      details: { parameter: 0 },
    },
    {
      operatorId: 'eulerTower',
      expression: polynomial([term(1, -1)]),
      details: { parameter: 1 },
    },
    {
      operatorId: 'resonanceTower',
      expression: trigonometric('sin', 1),
      details: { parameter: 1 },
    },
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
      const cardId = fixture.details
        ? addConfiguredScroll(state, fixture.operatorId, fixture.details)
        : addArsenalCard(state, fixture.operatorId);
      assert.equal(selectArsenalItem(state, cardId), true);

      assert.equal(applyTargetOperator(state, target.id), true);

      const projectiles = projectileEffects(state);
      assert.equal(projectiles.length, 1);
      assertProjectile(projectiles[0], fixture.operatorId, {
        targetId: target.id,
        sourceTowerId: null,
        row: target.row,
        position: target.position,
        ...fixture.details,
      });
      assert.equal(projectiles[0].from, undefined);
      if (fixture.operatorId === 'integral') {
        assert.ok(INTEGRATION_CONSTANTS.includes(projectiles[0].integrationConstant));
      }
    });
  }
});

test('arithmetic scrolls transform constants on impact and stay in the unlimited library', async (t) => {
  const cases = [
    ['add', polynomial(-6), { parameter: 6 }, '0'],
    ['subtract', polynomial(6), { parameter: 6 }, '0'],
    ['multiply', polynomial(3), { parameter: 4 }, '12'],
    ['divide', polynomial(12), { parameter: 3 }, '4'],
    ['squareRoot', polynomial(16), {}, '4'],
  ];

  for (const [index, [operatorId, expression, details, expected]] of cases.entries()) {
    await t.test(operatorId, () => {
      const state = createGame(480 + index, { levelIndex: 1, skipTutorial: true });
      freezeSpawns(state);
      state.effects = [];
      state.energy = OPERATORS[operatorId].cost;
      const scroll = state.scrollLibrary.find((item) => item.operatorId === operatorId);
      Object.assign(scroll, details);
      const target = testEnemy(expression, { id: `arithmetic-${operatorId}`, speed: 0 });
      state.enemies = [target];

      assert.equal(selectArsenalItem(state, scroll.id), true);
      assert.equal(applyTargetOperator(state, target.id), true);
      assert.equal(state.energy, 0);
      assert.equal(state.scrollLibrary.some((item) => item.id === scroll.id), true);
      for (const key of OPERATORS[operatorId].parameterKeys ?? []) {
        assert.equal(scroll[key], undefined);
      }
      const [projectile] = projectileEffects(state);
      assertProjectile(projectile, operatorId, {
        targetId: target.id,
        ...details,
      });
      advanceBy(state, projectile.impactIn + 0.001);
      assert.equal(formatExpression(target.expression), expected);
    });
  }
});

test('invalid heavy arithmetic preflight preserves energy, parameters, and unlimited scrolls', async (t) => {
  const cases = [
    ['multiply by zero', 'multiply', polynomial(7), { parameter: 0 }],
    ['divide by zero', 'divide', polynomial(7), { parameter: 0 }],
    ['root of a negative', 'squareRoot', polynomial(-4), {}],
    ['root of a non-square coefficient', 'squareRoot', polynomial(2), {}],
    ['root of an odd power', 'squareRoot', polynomial([term(4, 1)]), {}],
    ['root of multiple terms', 'squareRoot', polynomial([term(4, 2), term(9)]), {}],
  ];

  for (const [index, [name, operatorId, expression, details]] of cases.entries()) {
    await t.test(name, () => {
      const state = createGame(490 + index, { levelIndex: 1, skipTutorial: true });
      freezeSpawns(state);
      state.effects = [];
      state.energy = OPERATORS[operatorId].cost;
      const scroll = state.scrollLibrary.find((item) => item.operatorId === operatorId);
      Object.assign(scroll, details);
      const target = testEnemy(expression, { speed: 0 });
      state.enemies = [target];
      const energyBefore = state.energy;

      assert.equal(selectArsenalItem(state, scroll.id), true);
      assert.equal(applyTargetOperator(state, target.id), false);
      assert.equal(state.energy, energyBefore);
      assert.equal(state.scrollLibrary.some((item) => item.id === scroll.id), true);
      for (const [key, value] of Object.entries(details)) assert.equal(scroll[key], value);
      assert.equal(formatExpression(target.expression), formatExpression(expression));
      assert.equal(projectileEffects(state).length, 0);
    });
  }
});

test('an unlocked limit scroll can fire repeatedly and only spends energy', () => {
  const state = createGame(499, { levelIndex: 5, skipTutorial: true });
  freezeSpawns(state);
  state.effects = [];
  state.energy = OPERATORS.limit.cost * 2;
  const scroll = state.scrollLibrary.find((item) => item.operatorId === 'limit');
  const first = testEnemy(polynomial([term(1, -1)]), { id: 'limit-first' });
  const second = testEnemy(polynomial([term(2, -1)]), { id: 'limit-second', row: 1 });
  state.enemies = [first, second];

  assert.equal(selectArsenalItem(state, scroll.id), true);
  assert.equal(applyTargetOperator(state, first.id), true);
  assert.equal(selectArsenalItem(state, scroll.id), true);
  assert.equal(applyTargetOperator(state, second.id), true);

  assert.equal(state.energy, 0);
  assert.equal(state.scrollLibrary.some((item) => item.id === scroll.id), true);
  assert.equal(projectileEffects(state).length, 2);
});

test('a lane projectile changes the enemy only when their paths intersect', () => {
  const state = createGame(450);
  freezeSpawns(state);
  state.towers = [];
  state.effects = [];
  const target = testEnemy(polynomial([term(1, 2)]), { id: 'timed-impact', speed: 0 });
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
  const collisionIn = stationaryLaneCollisionIn(projectile, target);
  assert.equal(formatExpression(target.expression), 'x^2');
  assert.equal(state.effects.some((effect) => effect.type === 'operator'), false);

  advanceBy(state, collisionIn - 0.001);
  assert.equal(formatExpression(target.expression), 'x^2');
  assert.equal(projectile.status, 'flying');
  assert.equal(projectile.impactResolved, false);
  assert.ok(projectile.progress > 0 && projectile.progress < 1);

  advanceBy(state, 0.002);
  assert.equal(formatExpression(target.expression), '2x');
  assert.equal(projectile.status, 'impacted');
  assert.equal(projectile.impactResolved, true);
  assert.equal(projectile.missed, false);
  assert.equal(projectile.progress, 1);
  assert.equal(state.effects.filter((effect) => effect.type === 'operator').length, 1);

  const logsAfterImpact = state.logs.length;
  advanceBy(state, 0.1);
  assert.equal(formatExpression(target.expression), '2x');
  assert.equal(state.logs.length, logsAfterImpact);
  assert.equal(state.effects.filter((effect) => effect.type === 'operator').length, 1);
});

test('a tower only launches a right-moving lane projectile at an enemy ahead', () => {
  const state = createGame(460);
  freezeSpawns(state);
  state.towers = [];
  state.effects = [];
  const target = testEnemy(polynomial(7), {
    id: 'behind-tower-target', position: 0.17, speed: 0,
  });
  const tower = configuredTower('derivative');
  state.enemies = [target];
  state.towers = [tower];
  tick(state, 0.01);
  assert.equal(projectileEffects(state).length, 0);

  target.position = 0.3;
  tick(state, 0.01);
  const [projectile] = projectileEffects(state);
  assertProjectile(projectile, 'derivative', {
    currentPosition: tower.position,
    destinationPosition: GAMEPLAY_CONFIG.geometry.projectileExitPosition,
  });
});

test('a non-lethal impact pulse stays attached after same-frame enemy movement', () => {
  const state = createGame(461);
  freezeSpawns(state);
  state.towers = [];
  state.effects = [];
  const target = testEnemy(polynomial([term(1, 2)]), {
    id: 'moving-impact-target', position: 0.72, speed: 0.1,
  });
  const tower = configuredTower('derivative');
  state.enemies = [target];
  state.towers = [tower];

  tick(state, 0.01);
  const [projectile] = projectileEffects(state);
  tower.cooldown = 999;
  projectile.currentPosition = 0.68;
  projectile.progress = (projectile.currentPosition - projectile.from)
    / (projectile.destinationPosition - projectile.from);
  projectile.impactIn = projectile.travelTime * (1 - projectile.progress);

  tick(state, 0.2);

  assert.equal(projectile.status, 'impacted');
  assert.equal(formatExpression(target.expression), '2x');
  assert.equal(projectile.position, target.position);
});

test('pause freezes projectile flight and impact timing', () => {
  const state = createGame(451);
  freezeSpawns(state);
  state.towers = [];
  state.effects = [];
  const target = testEnemy(polynomial([term(1, 3)]), { id: 'paused-impact', speed: 0 });
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
  const collisionBeforePause = stationaryLaneCollisionIn(projectile, target);

  assert.equal(togglePause(state), true);
  advanceBy(state, 1);
  assert.equal(formatExpression(target.expression), 'x^3');
  assert.equal(projectile.impactIn, impactBeforePause);
  assert.equal(projectile.ttl, ttlBeforePause);
  assert.equal(projectile.progress, progressBeforePause);
  assert.equal(projectile.impactResolved, false);

  assert.equal(togglePause(state), true);
  advanceBy(state, collisionBeforePause - 0.001);
  assert.equal(formatExpression(target.expression), 'x^3');
  assert.equal(projectile.status, 'flying');
  advanceBy(state, 0.002);
  assert.equal(formatExpression(target.expression), '3x^2');
  assert.equal(projectile.status, 'impacted');
});

test('concurrent projectiles recalculate against the expression at each impact', () => {
  const state = createGame(452);
  freezeSpawns(state);
  state.effects = [];
  const target = testEnemy(polynomial([term(1, 2)]), { id: 'concurrent-impact', speed: 0 });
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
  const collisionTimes = projectiles.map((projectile) => (
    stationaryLaneCollisionIn(projectile, target)
  ));

  advanceBy(state, Math.min(...collisionTimes) - 0.001);
  assert.equal(formatExpression(target.expression), 'x^2');
  advanceBy(state, Math.max(...collisionTimes) - Math.min(...collisionTimes) + 0.002);
  assert.equal(formatExpression(target.expression), '2');
  assert.ok(projectiles.every((projectile) => projectile.impactResolved));

  const logsAfterImpacts = state.logs.length;
  advanceBy(state, 0.1);
  assert.equal(formatExpression(target.expression), '2');
  assert.equal(state.logs.length, logsAfterImpacts);
});

test('a later lane projectile continues past a removed target and hits the next enemy', () => {
  const state = createGame(453);
  freezeSpawns(state);
  state.energyClock = -1000;
  state.effects = [];
  const target = testEnemy(polynomial(7), { id: 'first-target', position: 0.62, speed: 0 });
  const nextTarget = testEnemy(polynomial([term(1, 2)]), {
    id: 'next-target', position: 0.84, speed: 0,
  });
  const rearTower = configuredTower('derivative', undefined, {
    id: 'tower-derivative-rear', column: 0, position: 0.2,
  });
  const forwardTower = configuredTower('derivative', undefined, {
    id: 'tower-derivative-forward', column: 2, position: 0.4,
  });
  state.enemies = [target, nextTarget];
  state.selectedEnemyId = target.id;
  state.towers = [rearTower, forwardTower];

  tick(state, 0.01);
  const killingProjectile = projectileEffects(state).find((effect) => (
    effect.sourceTowerId === forwardTower.id
  ));
  const laterProjectile = projectileEffects(state).find((effect) => (
    effect.sourceTowerId === rearTower.id
  ));
  rearTower.cooldown = 999;
  forwardTower.cooldown = 999;
  const energyAfterLaunch = state.energy;
  const firstCollision = stationaryLaneCollisionIn(killingProjectile, target);

  advanceBy(state, firstCollision + 0.001);
  assert.equal(state.kills, 1);
  assert.equal(state.energy, energyAfterLaunch + target.reward);
  assert.equal(killingProjectile.status, 'impacted');
  assert.equal(target.dead, true);
  assert.equal(formatExpression(target.expression), '0');
  assert.equal(state.selectedEnemyId, null);
  assert.equal(state.enemies.includes(target), false);
  assert.equal(state.enemies.includes(nextTarget), true);
  assert.equal(formatExpression(nextTarget.expression), 'x^2');
  assert.equal(state.effects.includes(laterProjectile), true);
  assert.equal(laterProjectile.status, 'flying');
  assert.equal(laterProjectile.impactResolved, false);
  assert.equal(laterProjectile.missed, false);
  assert.equal(laterProjectile.targetId, nextTarget.id);
  assert.ok(laterProjectile.progress > 0 && laterProjectile.progress < 1);

  const secondCollision = stationaryLaneCollisionIn(laterProjectile, nextTarget);
  advanceBy(state, secondCollision - 0.001);
  assert.equal(state.effects.includes(laterProjectile), true);
  assert.equal(laterProjectile.status, 'flying');
  assert.equal(formatExpression(nextTarget.expression), 'x^2');

  advanceBy(state, 0.002);
  assert.equal(laterProjectile.status, 'impacted');
  assert.equal(laterProjectile.impactResolved, true);
  assert.equal(laterProjectile.missed, false);
  assert.equal(laterProjectile.progress, 1);
  assert.equal(laterProjectile.impactTargetId, nextTarget.id);
  assert.equal(laterProjectile.position, nextTarget.position);
  assert.equal(state.effects.includes(laterProjectile), true);
  assert.equal(state.enemies.includes(target), false);
  assert.equal(state.enemies.includes(nextTarget), true);
  assert.equal(formatExpression(nextTarget.expression), '2x');
  assert.equal(state.kills, 1);
  assert.equal(state.energy, energyAfterLaunch + target.reward);
});

test('same-frame lane collisions recompute after the first projectile removes its target', () => {
  const state = createGame(462);
  freezeSpawns(state);
  state.effects = [];
  const firstTarget = testEnemy(polynomial(7), {
    id: 'same-frame-first', position: 0.5, speed: 0,
  });
  const nextTarget = testEnemy(polynomial([term(1, 2)]), {
    id: 'same-frame-next', position: 0.51, speed: 0,
  });
  const rearTower = configuredTower('derivative', undefined, {
    id: 'same-frame-rear', column: 0, position: 0.2,
  });
  const forwardTower = configuredTower('derivative', undefined, {
    id: 'same-frame-forward', column: 2, position: 0.4,
  });
  state.enemies = [firstTarget, nextTarget];
  state.towers = [rearTower, forwardTower];

  tick(state, 0.01);
  const firstProjectile = projectileEffects(state).find((effect) => (
    effect.sourceTowerId === forwardTower.id
  ));
  const followingProjectile = projectileEffects(state).find((effect) => (
    effect.sourceTowerId === rearTower.id
  ));
  rearTower.cooldown = 999;
  forwardTower.cooldown = 999;
  setLaneProjectilePosition(firstProjectile, 0.49);
  setLaneProjectilePosition(followingProjectile, 0.48);

  tick(state, 0.2);

  assert.equal(firstProjectile.status, 'impacted');
  assert.equal(firstProjectile.impactTargetId, firstTarget.id);
  assert.equal(firstTarget.dead, true);
  assert.equal(state.enemies.includes(firstTarget), false);
  assert.equal(followingProjectile.status, 'impacted');
  assert.equal(followingProjectile.impactTargetId, nextTarget.id);
  assert.equal(formatExpression(nextTarget.expression), '2x');
});

test('swept lane collision catches a moving enemy during a fast simulation frame', () => {
  const state = createGame(463);
  freezeSpawns(state);
  state.speed = 2;
  state.effects = [];
  const target = testEnemy(polynomial([term(1, 2)]), {
    id: 'swept-moving-target', position: 0.47, speed: 0.1,
  });
  const tower = configuredTower('derivative');
  state.enemies = [target];
  state.towers = [tower];

  tick(state, 0.01);
  const [projectile] = projectileEffects(state);
  tower.cooldown = 999;
  setLaneProjectilePosition(projectile, 0.38);

  tick(state, 0.2);

  assert.equal(projectile.status, 'impacted');
  assert.equal(projectile.impactTargetId, target.id);
  assert.equal(formatExpression(target.expression), '2x');
});

test('a falling projectile stays locked to its removed target and never hits a replacement', () => {
  const state = createGame(464);
  state.chapterIndex = 5;
  freezeSpawns(state);
  state.towers = [];
  state.effects = [];
  state.operatorQueue = [];
  const removedTarget = testEnemy(exponential(1), {
    id: 'removed-drop-target', row: 1, position: 0.65, speed: 0,
  });
  const replacement = testEnemy(exponential(1), {
    id: 'replacement-drop-target', row: 1, position: 0.65, speed: 0,
  });
  state.enemies = [removedTarget, replacement];
  const cardId = addArsenalCard(state, 'reflect');
  assert.equal(selectArsenalItem(state, cardId), true);
  assert.equal(applyTargetOperator(state, removedTarget.id), true);
  const [projectile] = projectileEffects(state);

  removedTarget.dead = true;
  tick(state, 0.1);
  assert.equal(state.enemies.includes(removedTarget), false);
  assert.equal(projectile.targetId, removedTarget.id);
  assert.equal(projectile.status, 'flying');

  advanceBy(state, projectile.impactIn + 0.001);
  assert.equal(projectile.status, 'missed');
  assert.equal(projectile.missed, true);
  assert.equal(formatExpression(replacement.expression), 'e^x');
});

test('the final enemy disappears while an orphaned lane projectile flies out of the battlefield', () => {
  const state = createGame(459);
  state.chapterIndex = CHAPTERS.length;
  state.endlessRound = 1;
  state.phase = 'running';
  state.currentWave = { ...state.currentWave, kind: 'challenge', entries: [] };
  state.nextSpawnIndex = 0;
  state.effects = [];
  const target = testEnemy(polynomial(7), { id: 'last-orphan-target', speed: 0, reward: 0 });
  const rearTower = configuredTower('derivative', undefined, {
    id: 'last-shot-rear', column: 0, position: 0.2,
  });
  const forwardTower = configuredTower('derivative', undefined, {
    id: 'last-shot-forward', column: 2, position: 0.4,
  });
  state.enemies = [target];
  state.towers = [rearTower, forwardTower];

  tick(state, 0.01);
  const killingProjectile = projectileEffects(state).find((effect) => (
    effect.sourceTowerId === forwardTower.id
  ));
  const laterProjectile = projectileEffects(state).find((effect) => (
    effect.sourceTowerId === rearTower.id
  ));
  rearTower.cooldown = 999;
  forwardTower.cooldown = 999;
  const firstCollision = stationaryLaneCollisionIn(killingProjectile, target);

  advanceBy(state, firstCollision + 0.001);
  assert.equal(state.kills, 1);
  assert.equal(killingProjectile.status, 'impacted');
  assert.equal(laterProjectile.status, 'flying');
  assert.equal(state.enemies.includes(target), false);
  assert.equal(target.dead, true);
  assert.equal(formatExpression(target.expression), '0');
  assert.equal(laterProjectile.targetId, null);
  assert.equal(state.phase, 'running');
  assert.equal(state.endlessRound, 1);

  advanceBy(state, killingProjectile.ttl + 0.001);
  assert.equal(state.effects.includes(killingProjectile), false);
  assert.equal(state.effects.includes(laterProjectile), true);
  assert.equal(laterProjectile.status, 'flying');
  assert.equal(state.enemies.length, 0);
  assert.equal(state.phase, 'running');
  assert.equal(state.endlessRound, 1);

  advanceBy(state, laterProjectile.impactIn - 0.001);
  assert.equal(laterProjectile.status, 'flying');
  assert.equal(state.effects.includes(laterProjectile), true);
  assert.ok(laterProjectile.currentPosition > 1);
  assert.equal(state.phase, 'running');

  advanceBy(state, 0.002);
  assert.equal(laterProjectile.status, 'exited');
  assert.equal(state.effects.includes(laterProjectile), false);
  assert.equal(state.phase, 'preparing');
  assert.equal(state.endlessRound, 2);
  assert.equal(state.enemies.length, 0);
});

test('a due projectile misses an enemy at the base before its body damage leaks', () => {
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
    affixes: ['shield'],
    shieldExpression: polynomial([term(1, 1)]),
    shieldActive: true,
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
  assert.equal(state.effects.includes(projectile), true);
  assert.ok(projectile.ttl > 0);
  assert.equal(formatExpression(target.expression), '12');
  assert.equal(formatExpression(target.shieldExpression), 'x');
  assert.equal(state.baseHp, baseHpBefore - 12);
  assert.equal(state.enemies.length, 0);
  assert.equal(state.kills, 0);
  assert.equal(state.energy, energyAfterLaunch);
  assert.equal(state.effects.filter((effect) => effect.type === 'base-damage').length, 1);
});

test('an enemy reaching the base earlier lets its projectile finish as a miss', () => {
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
  projectile.travelTime = 0.4;
  projectile.impactIn = 0.4;
  projectile.ttl = 0.4 + GAMEPLAY_CONFIG.effects.projectileImpactLingerSeconds;
  const baseHpBefore = state.baseHp;
  const energyAfterLaunch = state.energy;

  tick(state, 0.2);

  assert.equal(projectile.status, 'flying');
  assert.equal(projectile.impactResolved, false);
  assert.equal(projectile.missed, false);
  assert.equal(state.effects.includes(projectile), true);
  assert.equal(formatExpression(target.expression), '12');
  assert.equal(state.baseHp, baseHpBefore - 12);
  assert.equal(state.enemies.length, 0);
  assert.equal(state.kills, 0);
  assert.equal(state.energy, energyAfterLaunch);

  advanceBy(state, projectile.impactIn + 0.001);
  assert.equal(projectile.status, 'missed');
  assert.equal(projectile.impactResolved, true);
  assert.equal(projectile.missed, true);
  assert.equal(state.effects.includes(projectile), true);
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
  assert.equal(projectile.impactResolved, true);
  assert.equal(projectile.missed, false);
  assert.equal(state.baseHp, baseHpBefore);
  assert.equal(target.dead, true);
  assert.equal(formatExpression(target.expression), '0');
  assert.equal(state.enemies.includes(target), false);
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
  assert.equal(state.scrollLibrary.some((item) => item.id === cardId), true);
  assert.equal(state.energy, energyBefore);
  assert.equal(state.partialUsed, false);
  assert.equal(projectileEffects(state).length, 0);

  state.enemies.push(testEnemy(polynomial([term(1, 1)]), { id: 'retryable-partial-target' }));
  assert.equal(confirmPartial(state), true);
  assert.equal(projectileEffects(state).length, 1);
});

test('the final impact pulse finishes before endless advances without stale dead enemies', () => {
  const state = createGame(456);
  state.chapterIndex = CHAPTERS.length;
  state.endlessRound = 1;
  state.phase = 'running';
  state.currentWave = { ...state.currentWave, kind: 'challenge', entries: [] };
  state.nextSpawnIndex = 0;
  state.towers = [];
  state.effects = [];
  const target = testEnemy(polynomial(7), { id: 'last-impact-target', reward: 0, speed: 0 });
  const tower = configuredTower('derivative');
  state.enemies = [target];
  state.towers = [tower];
  const waveBeforeImpact = state.currentWave;

  tick(state, 0.01);
  const [projectile] = projectileEffects(state);
  tower.cooldown = 999;
  const collisionIn = stationaryLaneCollisionIn(projectile, target);
  advanceBy(state, collisionIn - 0.001);
  state.energyClock = 4.999;
  state.operatorCooldown = 0.001;
  state.formulaCooldown = 0.001;
  state.constantCooldown = 0.001;
  state.operatorQueue.pop();
  state.formulaQueue.pop();
  state.constantQueue.pop();
  const resources = () => ({
    energy: state.energy,
    energyClock: state.energyClock,
    operatorCooldown: state.operatorCooldown,
    formulaCooldown: state.formulaCooldown,
    constantCooldown: state.constantCooldown,
    operatorQueue: state.operatorQueue.map((item) => ({ ...item })),
    formulaQueue: state.formulaQueue.map((item) => ({ ...item })),
    constantQueue: state.constantQueue.map((item) => ({ ...item })),
    rngState: state.rngState,
  });
  const resourcesBeforeImpact = resources();

  advanceBy(state, 0.002);

  assert.equal(state.kills, 1);
  assert.equal(state.enemies.some((enemy) => !enemy.dead), false);
  assert.equal(state.enemies.includes(target), false);
  assert.equal(formatExpression(target.expression), '0');
  assert.equal(projectile.status, 'impacted');
  assert.ok(projectile.ttl >= 0.299 && projectile.ttl <= 0.301);
  assert.equal(state.phase, 'running');
  assert.equal(state.chapterIndex, CHAPTERS.length);
  assert.equal(state.endlessRound, 1);
  assert.strictEqual(state.currentWave, waveBeforeImpact);
  assert.deepEqual(resources(), resourcesBeforeImpact);

  const remainingPulse = projectile.ttl;
  advanceBy(state, remainingPulse - 0.001);
  assert.equal(state.phase, 'running');
  assert.equal(state.chapterIndex, CHAPTERS.length);
  assert.equal(state.endlessRound, 1);
  assert.strictEqual(state.currentWave, waveBeforeImpact);
  assert.deepEqual(resources(), resourcesBeforeImpact);

  advanceBy(state, 0.002);
  assert.equal(state.phase, 'preparing');
  assert.equal(state.chapterIndex, CHAPTERS.length);
  assert.equal(state.endlessRound, 2);
  assert.notStrictEqual(state.currentWave, waveBeforeImpact);
  assert.equal(state.enemies.length, 0);
  assert.equal(state.enemies.some((enemy) => enemy.dead), false);
});

test('global z partial differentiation hits each live enemy at its staggered impact', () => {
  const state = createGame(500);
  state.chapterIndex = 3;
  freezeSpawns(state);
  state.towers = [];
  state.effects = [];
  state.operatorQueue = [];
  state.enemies = [
    testEnemy(polynomial([term(1, 2, 1)]), { id: 'partial-a', row: 0, position: 0.62 }),
    testEnemy(polynomial([term(1, 3, 2)]), { id: 'partial-b', row: 2, position: 0.81 }),
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
  for (const effect of projectiles) {
    assertProjectile(effect, 'partial', {
      targetId: effect === projectiles[0] ? 'partial-a' : 'partial-b',
      sourceTowerId: null,
    });
    assert.equal(effect.from, undefined);
  }
  assert.equal(projectiles[0].delay, 0);
  assert.equal(projectiles[0].impactIn, GAMEPLAY_CONFIG.effects.projectileTravelSeconds.drop);
  assert.equal(projectiles[1].delay, 0.035);
  assert.ok(Math.abs(projectiles[1].impactIn - (GAMEPLAY_CONFIG.effects.projectileTravelSeconds.drop + 0.035)) < 1e-12);
  assert.equal(formatExpression(state.enemies[0].expression), 'x^2z');
  assert.equal(formatExpression(state.enemies[1].expression), 'x^3z^2');

  advanceBy(state, GAMEPLAY_CONFIG.effects.projectileTravelSeconds.drop - 0.001);
  assert.equal(formatExpression(state.enemies[0].expression), 'x^2z');
  assert.equal(formatExpression(state.enemies[1].expression), 'x^3z^2');
  assert.equal(projectiles[0].status, 'flying');
  assert.equal(projectiles[1].status, 'flying');

  advanceBy(state, 0.002);
  assert.equal(formatExpression(state.enemies[0].expression), 'x^2');
  assert.equal(formatExpression(state.enemies[1].expression), 'x^3z^2');
  assert.equal(projectiles[0].status, 'impacted');
  assert.equal(projectiles[0].impactResolved, true);
  assert.equal(projectiles[1].status, 'flying');

  advanceBy(state, 0.033);
  assert.equal(formatExpression(state.enemies[1].expression), 'x^3z^2');
  advanceBy(state, 0.002);
  assert.equal(formatExpression(state.enemies[1].expression), '2x^3z');
  assert.equal(projectiles[1].status, 'impacted');
  assert.equal(projectiles[1].impactResolved, true);
});

test('parameter scroll preflight uses the active shield and preserves an invalid scroll', () => {
  const state = createGame(23);
  state.chapterIndex = 5;
  freezeSpawns(state);
  state.towers = [];
  state.operatorQueue = [];
  const target = testEnemy(polynomial([term(1, 1)]), {
    affixes: ['shield'],
    shieldExpression: polynomial([term(1, -1)]),
    shieldActive: true,
  });
  state.enemies.push(target);
  const cardId = addConfiguredScroll(state, 'evaluateTower', { parameter: 0 });
  const energyBefore = state.energy;

  assert.equal(selectArsenalItem(state, cardId), true);
  assert.equal(applyTargetOperator(state, target.id), false);
  assert.equal(state.scrollLibrary.some((item) => item.id === cardId), true);
  assert.equal(state.energy, energyBefore);
  assert.equal(formatExpression(target.expression), 'x');
  assert.equal(formatExpression(target.shieldExpression), 'x^-1');
  assert.equal(projectileEffects(state).length, 0);
});

test('spawned shields default to an independent clone of the body expression', () => {
  const state = createGame(24);
  state.phase = 'running';
  state.towers = [];
  state.enemies = [];
  state.nextSpawnIndex = 0;
  state.currentWave = {
    ...state.currentWave,
    entries: [{
      spawnAt: 0,
      row: 0,
      typeId: 'procedural-test',
      name: '護盾測試函數',
      art: 'enemy-art-polynomial',
      family: 'polynomial',
      expression: polynomial([term(1, 2)]),
      speed: 0.001,
      reward: 40,
      affixes: ['shield'],
      splitExpressions: [],
    }],
  };

  tick(state, 0.01);

  const [target] = state.enemies;
  assert.ok(target);
  assert.equal(target.shieldActive, true);
  assert.notStrictEqual(target.shieldExpression, target.expression);
  assert.deepEqual(target.shieldExpression, target.expression);
  assert.strictEqual(activeEnemyExpression(target), target.shieldExpression);
});

test('tower hits transform a shield to zero before the next hit reaches the body', () => {
  const state = createGame(241);
  freezeSpawns(state);
  state.towers = [];
  const target = testEnemy(polynomial([term(1, 2)]), {
    affixes: ['shield', 'split'],
    shieldExpression: polynomial([term(1, 2)]),
    shieldActive: true,
    splitExpressions: [polynomial([term(1, 1)]), polynomial(2)],
  });
  const tower = configuredTower('derivative');
  state.enemies.push(target);
  state.towers.push(tower);
  const energyBefore = state.energy;
  const fire = (resolve = null) => {
    tower.cooldown = 0;
    tick(state, 0.01);
    const projectile = projectileEffects(state).find((effect) => !effect.impactResolved);
    tower.cooldown = 999;
    target.speed = 0;
    assert.ok(projectile);
    const collisionIn = stationaryLaneCollisionIn(projectile, target);
    if (resolve) resolve(projectile, collisionIn);
    else advanceBy(state, collisionIn + 0.001);
  };

  fire((projectile, collisionIn) => {
    assert.equal(formatExpression(target.shieldExpression), 'x^2');
    assert.equal(formatExpression(target.expression), 'x^2');
    advanceBy(state, collisionIn - 0.001);
    assert.equal(formatExpression(target.shieldExpression), 'x^2');
    assert.equal(formatExpression(target.expression), 'x^2');
    advanceBy(state, 0.002);
  });
  assert.equal(formatExpression(target.shieldExpression), '2x');
  assert.equal(formatExpression(target.expression), 'x^2');
  fire();
  assert.equal(formatExpression(target.shieldExpression), '2');
  assert.equal(formatExpression(target.expression), 'x^2');
  fire();
  assert.equal(target.shieldExpression, null);
  assert.equal(target.shieldActive, false);
  assert.strictEqual(activeEnemyExpression(target), target.expression);
  assert.equal(formatExpression(target.expression), 'x^2');
  assert.equal(state.kills, 0);
  assert.equal(state.energy, energyBefore);
  assert.equal(state.enemies.length, 1);
  assert.equal(state.effects.some((effect) => effect.type === 'split'), false);

  fire();
  assert.equal(formatExpression(target.expression), '2x');
  fire();
  assert.equal(formatExpression(target.expression), '2');
  fire();
  assert.equal(state.kills, 1);
  assert.equal(state.energy, energyBefore + 24);
  assert.equal(state.enemies.length, 2);
  assert.equal(target.dead, true);
  assert.equal(formatExpression(target.expression), '0');
  const splitChildren = state.enemies;
  assert.equal(splitChildren.length, 2);
  assert.ok(splitChildren.every((enemy) => enemy.shieldExpression === null));
  assert.equal(state.effects.filter((effect) => effect.type === 'split').length, 1);
});

test('global z partial preview and resolution operate on one active layer per enemy', () => {
  const state = createGame(242);
  state.chapterIndex = 3;
  freezeSpawns(state);
  state.towers = [];
  state.effects = [];
  state.operatorQueue = [];
  const progressingShield = testEnemy(polynomial([term(1, 3)]), {
    id: 'shield-progress',
    shieldExpression: polynomial([term(1, 2, 2)]),
    shieldActive: true,
    affixes: ['shield'],
  });
  const breakingShield = testEnemy(polynomial([term(1, 2)]), {
    id: 'shield-break',
    shieldExpression: polynomial(7),
    shieldActive: true,
    affixes: ['shield'],
  });
  const exposedBody = testEnemy(polynomial(5), { id: 'body-zero' });
  const deadEnemy = testEnemy(polynomial(9), { id: 'already-dead', dead: true });
  state.enemies = [progressingShield, breakingShield, exposedBody, deadEnemy];
  const cardId = addArsenalCard(state, 'partial');
  const preview = partialPreview(state).map((item) => ({
    id: item.id,
    before: item.before,
    after: item.after,
    dies: item.dies,
    shielded: item.shielded,
    breaksShield: item.breaksShield,
    layer: item.layer,
    damageBefore: item.damageBefore,
    damageAfter: item.damageAfter,
  }));
  assert.deepEqual(preview, [
    {
      id: 'shield-progress', before: 'x^2z^2', after: '2x^2z', dies: false,
      shielded: true, breaksShield: false, layer: 'shield', damageBefore: 1, damageAfter: 2,
    },
    {
      id: 'shield-break', before: '7', after: '0', dies: false,
      shielded: true, breaksShield: true, layer: 'shield', damageBefore: 7, damageAfter: 0,
    },
    {
      id: 'body-zero', before: '5', after: '0', dies: true,
      shielded: false, breaksShield: false, layer: 'body', damageBefore: 5, damageAfter: 0,
    },
  ]);

  const energyBefore = state.energy;
  assert.equal(selectArsenalItem(state, cardId), true);
  assert.equal(confirmPartial(state), true);
  assert.equal(formatExpression(progressingShield.shieldExpression), 'x^2z^2');
  assert.equal(formatExpression(progressingShield.expression), 'x^3');
  assert.equal(formatExpression(breakingShield.shieldExpression), '7');
  assert.equal(formatExpression(breakingShield.expression), 'x^2');
  assert.deepEqual(
    state.enemies.map((enemy) => enemy.id),
    ['shield-progress', 'shield-break', 'body-zero', 'already-dead'],
  );
  assert.equal(state.kills, 0);
  assert.equal(state.energy, energyBefore - OPERATORS.partial.cost);
  assert.equal(projectileEffects(state).length, 3);

  const finalImpact = Math.max(...projectileEffects(state).map((effect) => effect.impactIn));
  advanceBy(state, finalImpact + 0.001);
  assert.equal(formatExpression(progressingShield.shieldExpression), '2x^2z');
  assert.equal(formatExpression(progressingShield.expression), 'x^3');
  assert.equal(breakingShield.shieldExpression, null);
  assert.equal(formatExpression(breakingShield.expression), 'x^2');
  assert.deepEqual(
    state.enemies.map((enemy) => enemy.id),
    ['shield-progress', 'shield-break'],
  );
  assert.equal(exposedBody.dead, true);
  assert.equal(formatExpression(exposedBody.expression), '0');
  assert.equal(state.kills, 1);
  assert.equal(state.energy, energyBefore - OPERATORS.partial.cost + exposedBody.reward);
  assert.equal(projectileEffects(state).length, 3);
});

test('single-target operators transform and clear shields without reaching the body', () => {
  const state = createGame(243);
  state.chapterIndex = 5;
  freezeSpawns(state);
  state.towers = [];
  state.operatorQueue = [];
  const target = testEnemy(polynomial([term(1, 1)]), {
    shieldExpression: exponential(1),
    shieldActive: true,
    affixes: ['shield'],
  });
  state.enemies.push(target);
  const reflectId = addArsenalCard(state, 'reflect');
  const limitId = addArsenalCard(state, 'limit');
  state.energy = OPERATORS.reflect.cost + OPERATORS.limit.cost;
  const energyBefore = state.energy;

  assert.equal(selectArsenalItem(state, reflectId), true);
  assert.equal(applyTargetOperator(state, target.id), true);
  assert.equal(formatExpression(target.shieldExpression), 'e^x');
  const reflectProjectile = projectileEffects(state).find((effect) => effect.operatorId === 'reflect');
  advanceBy(state, reflectProjectile.impactIn + 0.001);
  assert.equal(formatExpression(target.shieldExpression), 'e^-x');
  assert.equal(formatExpression(target.expression), 'x');

  assert.equal(selectArsenalItem(state, limitId), true);
  assert.equal(applyTargetOperator(state, target.id), true);
  assert.equal(formatExpression(target.shieldExpression), 'e^-x');
  const limitProjectile = projectileEffects(state).find((effect) => effect.operatorId === 'limit');
  advanceBy(state, limitProjectile.impactIn + 0.001);
  assert.equal(target.shieldExpression, null);
  assert.equal(formatExpression(target.expression), 'x');
  assert.equal(state.enemies.length, 1);
  assert.equal(state.kills, 0);
  assert.equal(state.energy, energyBefore - OPERATORS.reflect.cost - OPERATORS.limit.cost);
});

test('a divergent limit is evaluated against the shield and does not remove it', () => {
  const state = createGame(244);
  state.chapterIndex = 5;
  freezeSpawns(state);
  state.operatorQueue = [];
  const target = testEnemy(polynomial(12), {
    family: 'trigonometric',
    shieldExpression: trigonometric('sin', 1),
    shieldActive: true,
    affixes: ['shield'],
  });
  state.enemies.push(target);
  const limitId = addArsenalCard(state, 'limit');

  assert.equal(selectArsenalItem(state, limitId), true);
  assert.equal(applyTargetOperator(state, target.id), true);
  assert.equal(formatExpression(target.shieldExpression), 'sin(x)');
  assert.equal(formatExpression(target.expression), '12');
  assert.equal(target.divergentTimer, 0);
  const [projectile] = projectileEffects(state);
  advanceBy(state, projectile.impactIn - 0.001);
  assert.equal(target.divergentTimer, 0);
  assert.equal(state.effects.some((effect) => effect.type === 'divergent'), false);
  advanceBy(state, 0.002);
  assert.ok(target.divergentTimer > 5.99 && target.divergentTimer <= 6);
  assert.equal(projectile.status, 'impacted');
  assert.equal(state.effects.filter((effect) => effect.type === 'divergent').length, 1);
});

test('an Euler scroll clears only the active shield layer and returns blank for reuse', () => {
  const state = createGame(245);
  state.chapterIndex = 4;
  freezeSpawns(state);
  state.towers = [];
  state.effects = [];
  state.operatorQueue = [];
  const target = testEnemy(exponential(1), {
    family: 'exponential',
    shieldExpression: polynomial([term(1, -1)]),
    shieldActive: true,
    affixes: ['shield'],
  });
  state.enemies.push(target);
  const cardId = addConfiguredScroll(state, 'eulerTower', { parameter: 1 });

  assert.equal(selectArsenalItem(state, cardId), true);
  assert.equal(applyTargetOperator(state, target.id), true);
  assert.equal(formatExpression(target.shieldExpression), 'x^-1');
  const [projectile] = projectileEffects(state);
  advanceBy(state, projectile.impactIn + 0.001);
  assert.equal(target.shieldExpression, null);
  assert.equal(formatExpression(target.expression), 'e^x');
  assert.equal(projectile.status, 'impacted');
  assert.equal(state.scrollLibrary.some((item) => item.id === cardId), true);
  assert.equal(state.scrollLibrary.find((item) => item.id === cardId).parameter, undefined);
  assert.equal(state.towers.length, 0);
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
  assert.equal(state.enemies.length, 1);
  const [projectile] = projectileEffects(state);
  advanceBy(state, projectile.impactIn + 0.001);
  assert.equal(state.kills, 1);
  assert.equal(state.enemies.length, 2);
  const children = state.enemies;
  assert.equal(children.length, 2);
  assert.ok(children.every((enemy) => enemy.affixes.length === 0));
  assert.ok(children.every((enemy) => enemy.shieldExpression === null));
  assert.ok(children.every((enemy) => enemy.splitExpressions.length === 0));
});

test('reflect then limit keep their unlimited scrolls and eliminate e^x', () => {
  const state = createGame(26);
  state.chapterIndex = 5;
  freezeSpawns(state);
  state.operatorQueue = [];
  const reflectId = addArsenalCard(state, 'reflect');
  const limitId = addArsenalCard(state, 'limit');
  state.energy = OPERATORS.reflect.cost + OPERATORS.limit.cost;
  const target = testEnemy(exponential(1), { id: 'exponential-target', family: 'exponential' });
  state.enemies.push(target);
  selectArsenalItem(state, reflectId);
  assert.equal(applyTargetOperator(state, target.id), true);
  assert.equal(formatExpression(target.expression), 'e^x');
  let projectile = projectileEffects(state).find((effect) => effect.operatorId === 'reflect');
  advanceBy(state, projectile.impactIn + 0.001);
  assert.equal(formatExpression(target.expression), 'e^-x');
  selectArsenalItem(state, limitId);
  assert.equal(applyTargetOperator(state, target.id), true);
  assert.equal(state.enemies.length, 1);
  projectile = projectileEffects(state).find((effect) => effect.operatorId === 'limit');
  advanceBy(state, projectile.impactIn + 0.001);
  assert.equal(state.enemies.length, 0);
  assert.equal(target.dead, true);
  assert.equal(formatExpression(target.expression), '0');
  assert.equal(state.scrollLibrary.some((item) => item.id === reflectId), true);
  assert.equal(state.scrollLibrary.some((item) => item.id === limitId), true);
});

test('an unsupported shield integral keeps its arsenal card, energy, and both layers', () => {
  const state = createGame(261);
  state.chapterIndex = 5;
  freezeSpawns(state);
  state.operatorQueue = [];
  const integralId = addArsenalCard(state, 'integral');
  const target = testEnemy(polynomial([term(1, 1)]), {
    family: 'logarithmic',
    affixes: ['shield'],
    shieldExpression: logarithm(1, -1),
    shieldActive: true,
  });
  state.enemies.push(target);
  const energyBefore = state.energy;
  const rngBefore = state.rngState;

  assert.equal(selectArsenalItem(state, integralId), true);
  assert.equal(applyTargetOperator(state, target.id), false);
  assert.equal(state.energy, energyBefore);
  assert.equal(state.rngState, rngBefore);
  assert.equal(state.scrollLibrary.some((item) => item.id === integralId), true);
  assert.equal(formatExpression(target.expression), 'x');
  assert.equal(formatExpression(target.shieldExpression), 'x^-1ln|x|');
  assert.equal(projectileEffects(state).length, 0);
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
    const [projectile] = projectileEffects(state);
    assert.equal(projectileEffects(state).length, 1);
    assertProjectile(projectile, 'limit', { row: target.row, position: target.position });
    assert.equal(target.divergentTimer, 0);
    advanceBy(state, projectile.impactIn - 0.001);
    assert.equal(target.divergentTimer, 0);
    advanceBy(state, 0.002);
    assert.ok(target.divergentTimer > 5.99 && target.divergentTimer <= 6);
    assert.equal(projectile.status, 'impacted');
  }
});
