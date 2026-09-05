import test from 'node:test';
import assert from 'node:assert/strict';

import {
  CHAPTERS,
  CONSTANT_QUEUE_CAPACITY,
  FORMULA_QUEUE_CAPACITY,
  OPERATOR_QUEUE_CAPACITY,
} from '../src/game/content.js';
import {
  advanceEnemyTutorial,
  advanceWeaponTutorial,
  createGame,
  startGame,
  tick,
} from '../src/game/engine.js';

function dismissIntroductions(state) {
  while (state.enemyTutorialQueue.length) advanceEnemyTutorial(state);
  while (state.weaponTutorialQueue.length) advanceWeaponTutorial(state);
}

function clearWave(state) {
  state.phase = 'running';
  state.currentWave = { ...state.currentWave, entries: [] };
  state.nextSpawnIndex = 0;
  tick(state, 0.01);
}

function reachFirstFormalSegment(seed = 42) {
  const state = createGame(seed);
  startGame(state);
  dismissIntroductions(state);
  clearWave(state);
  assert.equal(state.currentWave.segmentIndex, 1);
  return state;
}

test('formal segment injects one-time guaranteed cards without consuming random RNG', () => {
  const state = createGame(41);
  startGame(state);
  dismissIntroductions(state);
  const rngBefore = state.tutorialSnapshot.rngState;
  clearWave(state);

  const supply = state.currentWave.guaranteedSupply;
  assert.ok(supply.operators.length > 0);
  assert.equal(state.rngState, rngBefore);
  assert.deepEqual(
    state.operatorQueue.filter((item) => item.source === 'guaranteed').map((item) => item.operatorId),
    supply.operators,
  );
  assert.deepEqual(
    state.formulaQueue.filter((item) => item.source === 'guaranteed').map((item) => item.cardId),
    supply.formulaIds,
  );
  assert.deepEqual(
    state.constantQueue.filter((item) => item.source === 'guaranteed').map((item) => item.value),
    supply.constants,
  );
  assert.equal(state.receivedSupplyGrantIds.length, 1);
});

test('guaranteed cards bypass full capacities and random refill pauses until space returns', () => {
  const state = createGame(42);
  startGame(state);
  dismissIntroductions(state);
  state.tutorialSnapshot.operatorQueue = Array.from(
    { length: OPERATOR_QUEUE_CAPACITY },
    (_, index) => ({ id: `kept-op-${index}`, operatorId: 'derivative', source: 'random' }),
  );
  state.tutorialSnapshot.formulaQueue = Array.from(
    { length: FORMULA_QUEUE_CAPACITY },
    (_, index) => ({ id: `kept-formula-${index}`, cardId: 'identityK', source: 'random' }),
  );
  state.tutorialSnapshot.constantQueue = Array.from(
    { length: CONSTANT_QUEUE_CAPACITY },
    (_, index) => ({ id: `kept-k-${index}`, value: 7, source: 'random' }),
  );
  clearWave(state);

  assert.ok(state.operatorQueue.length > OPERATOR_QUEUE_CAPACITY);
  assert.ok(state.operatorQueue.some((item) => item.id === 'kept-op-0'));
  const lengths = [state.operatorQueue.length, state.formulaQueue.length, state.constantQueue.length];
  const cooldowns = [state.operatorCooldown, state.formulaCooldown, state.constantCooldown];
  const rng = state.rngState;
  tick(state, 1);
  assert.deepEqual(
    [state.operatorQueue.length, state.formulaQueue.length, state.constantQueue.length],
    lengths,
  );
  assert.deepEqual(
    [state.operatorCooldown, state.formulaCooldown, state.constantCooldown],
    cooldowns,
  );
  assert.equal(state.rngState, rng);
});

test('every queue uses seeded random refill in addition to one-time guarantees', () => {
  const first = reachFirstFormalSegment(77);
  const replay = reachFirstFormalSegment(77);
  for (const state of [first, replay]) {
    state.operatorQueue = [];
    state.formulaQueue = [];
    state.constantQueue = [];
    state.operatorCooldown = 0;
    state.formulaCooldown = 0;
    state.constantCooldown = 0;
    tick(state, 0.01);
  }
  assert.deepEqual(first.operatorQueue, replay.operatorQueue);
  assert.deepEqual(first.formulaQueue, replay.formulaQueue);
  assert.deepEqual(first.constantQueue, replay.constantQueue);
  assert.ok(first.operatorQueue.every((item) => item.source === 'random'));
  assert.ok(first.formulaQueue.every((item) => item.source === 'random'));
  assert.ok(first.constantQueue.every((item) => item.source === 'random'));
});

test('queues and energy survive pressure and mixed, then remain at the won result', () => {
  const state = reachFirstFormalSegment(78);
  state.operatorQueue.push({ id: 'persistent-op', operatorId: 'derivative', source: 'random' });
  state.formulaQueue.push({ id: 'persistent-formula', cardId: 'identityK', source: 'random' });
  state.constantQueue.push({ id: 'persistent-k', value: 3, source: 'random' });
  state.energy = 37;

  clearWave(state);
  assert.equal(state.currentWave.segmentIndex, 2);
  assert.ok(state.operatorQueue.some((item) => item.id === 'persistent-op'));
  assert.ok(state.formulaQueue.some((item) => item.id === 'persistent-formula'));
  assert.ok(state.constantQueue.some((item) => item.id === 'persistent-k'));
  assert.equal(state.energy, 37);
  assert.equal(state.receivedSupplyGrantIds.length, 2);

  clearWave(state);
  assert.equal(state.phase, 'won');
  assert.equal(state.chapterIndex, 0);
  assert.equal(state.currentWave.segmentIndex, 2);
  assert.ok(state.operatorQueue.some((item) => item.id === 'persistent-op'));
  assert.ok(state.formulaQueue.some((item) => item.id === 'persistent-formula'));
  assert.ok(state.constantQueue.some((item) => item.id === 'persistent-k'));
  assert.equal(state.energy, 37);
});

test('all six chapters define guarantees for both formal segments', () => {
  for (const [chapterIndex, chapter] of CHAPTERS.entries()) {
    assert.equal(chapter.segments.length, 2);
    for (const segment of chapter.segments) {
      assert.ok(segment.guaranteedSupply.operators.length > 0, `${chapterIndex}/${segment.index}`);
      assert.ok(Array.isArray(segment.guaranteedSupply.formulaIds));
      assert.ok(Array.isArray(segment.guaranteedSupply.constants));
    }
  }
});
