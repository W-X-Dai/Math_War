import test from 'node:test';
import assert from 'node:assert/strict';

import { damage, formatExpression } from '../src/domain/expression.js';
import {
  applyTargetOperator,
  createGame,
  currentAssembly,
  discardConstantItem,
  discardFormulaItem,
  installAssembly,
  placeTower,
  prepareAssembly,
  selectConstantItem,
  selectFormulaItem,
  selectOperator,
  tick,
} from '../src/game/engine.js';
import {
  CONSTANT_QUEUE_CAPACITY,
  ENEMY_TYPES,
  FORMULA_QUEUE_CAPACITY,
  WAVES,
} from '../src/game/content.js';

function enemy(typeId, { id = `test-${typeId}`, row = 0, position = 0.8 } = {}) {
  return {
    id,
    typeId,
    row,
    position,
    expression: ENEMY_TYPES[typeId].create(),
    attackTimer: 99,
    divergentTimer: 0,
    hitFlash: 0,
  };
}

function runWithoutScheduledSpawns(state) {
  state.phase = 'running';
  state.nextSpawnIndex = WAVES[state.waveIndex].entries.length;
}

test('any selected formula and k pair can be assembled without consuming queue tops', () => {
  const state = createGame(1);
  const chosenFormulaId = 'formula-seed-2'; // 2k
  const chosenConstantId = 'constant-seed-3'; // 7
  const originalFormulaIds = state.formulaQueue.map((item) => item.id);
  const originalConstantIds = state.constantQueue.map((item) => item.id);

  assert.equal(selectFormulaItem(state, chosenFormulaId), true);
  assert.equal(selectConstantItem(state, chosenConstantId), true);
  assert.equal(currentAssembly(state).value, 14);
  assert.equal(prepareAssembly(state), true);

  assert.equal(state.assemblyValue, 14);
  assert.deepEqual(
    state.formulaQueue.map((item) => item.id),
    originalFormulaIds.filter((id) => id !== chosenFormulaId),
  );
  assert.deepEqual(
    state.constantQueue.map((item) => item.id),
    originalConstantIds.filter((id) => id !== chosenConstantId),
  );
});

test('arbitrary non-top formula and constant items can be discarded', () => {
  const state = createGame(2);
  const formulaId = 'formula-seed-2';
  const constantId = 'constant-seed-1';

  assert.equal(discardFormulaItem(state, formulaId), true);
  assert.equal(discardConstantItem(state, constantId), true);
  assert.equal(state.formulaQueue.some((item) => item.id === formulaId), false);
  assert.equal(state.constantQueue.some((item) => item.id === constantId), false);
  assert.equal(state.formulaQueue.length, 3);
  assert.equal(state.constantQueue.length, 3);
});

test('installing an assembled 15 configures the shift tower for repeated attacks', () => {
  const state = createGame(3);

  assert.equal(selectOperator(state, 'subtract'), true);
  assert.equal(placeTower(state, 0, 0), true);
  const tower = state.towers[0];

  // The initial selected pair is k + 10 with k = 5.
  assert.equal(currentAssembly(state).value, 15);
  assert.equal(prepareAssembly(state), true);
  assert.equal(state.assemblyValue, 15);
  assert.equal(tower.parameter, null);
  assert.equal(installAssembly(state, tower.id), true);
  assert.equal(state.assemblyValue, null);
  assert.equal(tower.parameter, 15);

  const target = enemy('factorial');
  state.enemies.push(target);
  runWithoutScheduledSpawns(state);
  tower.cooldown = 0;
  tick(state, 0.01);

  assert.equal(formatExpression(target.expression), 'x^5 - 15');
  assert.equal(damage(target.expression), 16);

  // It is a configured tower, not a one-shot action: it fires again after CD.
  for (let step = 0; step < 12; step += 1) tick(state, 0.2);
  assert.equal(formatExpression(target.expression), 'x^5 - 30');
  assert.equal(damage(target.expression), 31);
});

test('the definite-integral tower cannot fire until both bounds are installed', () => {
  const state = createGame(4);
  state.waveIndex = 2;

  assert.equal(selectOperator(state, 'definiteIntegralTower'), true);
  assert.equal(placeTower(state, 0, 0), true);
  const tower = state.towers[0];
  const target = enemy('linear');
  state.enemies.push(target);
  runWithoutScheduledSpawns(state);

  // k - 5 with k = 5 produces the lower bound 0.
  assert.equal(selectFormulaItem(state, 'formula-seed-1'), true);
  assert.equal(selectConstantItem(state, 'constant-seed-0'), true);
  assert.equal(prepareAssembly(state), true);
  assert.equal(installAssembly(state, tower.id), true);
  assert.equal(tower.lowerBound, 0);
  assert.equal(tower.upperBound, null);

  tower.cooldown = 0;
  tick(state, 0.01);
  assert.equal(formatExpression(target.expression), 'x');

  // 2k with k = 2 produces the upper bound 4.
  assert.equal(selectFormulaItem(state, 'formula-seed-2'), true);
  assert.equal(selectConstantItem(state, 'constant-seed-1'), true);
  assert.equal(prepareAssembly(state), true);
  assert.equal(installAssembly(state, tower.id), true);
  assert.equal(tower.lowerBound, 0);
  assert.equal(tower.upperBound, 4);

  tower.cooldown = 0;
  tick(state, 0.01);
  assert.equal(formatExpression(target.expression), '8');
});

test('formula and k queues stay within capacity and refill on cooldown', () => {
  const state = createGame(5);
  state.enemies.push(enemy('exponential', { position: 0.955 }));
  runWithoutScheduledSpawns(state);

  for (let step = 0; step < 300; step += 1) {
    tick(state, 0.2);
    assert.ok(state.formulaQueue.length <= FORMULA_QUEUE_CAPACITY);
    assert.ok(state.constantQueue.length <= CONSTANT_QUEUE_CAPACITY);
    assert.ok(state.formulaCooldown <= 10);
    assert.ok(state.constantCooldown <= 10);
  }

  assert.equal(state.formulaQueue.length, 10);
  assert.equal(state.constantQueue.length, 10);
  assert.equal(state.formulaCooldown, 0);
  assert.equal(state.constantCooldown, 0);

  assert.equal(discardFormulaItem(state, state.formulaQueue[4].id), true);
  assert.equal(discardConstantItem(state, state.constantQueue[6].id), true);
  tick(state, 0.01);

  assert.equal(state.formulaQueue.length, 10);
  assert.equal(state.constantQueue.length, 10);
  assert.ok(state.formulaCooldown > 0 && state.formulaCooldown <= 10);
  assert.ok(state.constantCooldown > 0 && state.constantCooldown <= 10);
});

test('reflect then limit removes an e^x target', () => {
  const state = createGame(6);
  state.waveIndex = 4;
  const target = enemy('exponential');
  state.enemies.push(target);

  assert.equal(selectOperator(state, 'reflect'), true);
  assert.equal(applyTargetOperator(state, target.id), true);
  assert.equal(formatExpression(target.expression), 'e^-x');
  assert.equal(state.enemies.some((candidate) => candidate.id === target.id), true);

  assert.equal(selectOperator(state, 'limit'), true);
  assert.equal(applyTargetOperator(state, target.id), true);
  assert.equal(state.enemies.some((candidate) => candidate.id === target.id), false);
  assert.equal(state.kills, 1);
});
