import assert from 'node:assert/strict';
import test from 'node:test';

import * as developerConfig from '../src/config/index.js';
import {
  CHAPTERS,
  CONSTANT_QUEUE_CAPACITY,
  FORMULA_QUEUE_CAPACITY,
  OPERATORS,
  OPERATOR_QUEUE_CAPACITY,
} from '../src/config/content.js';
import { GENERATION_CONFIG } from '../src/config/generation.js';
import { GAMEPLAY_CONFIG } from '../src/config/gameplay.js';
import { CHAPTER_TUTORIALS, ENEMY_GUIDES } from '../src/config/tutorial.js';
import * as compatibilityContent from '../src/game/content.js';
import { generateTutorialWave } from '../src/game/tutorial-content.js';

function assertDeepFrozen(value, path = 'config') {
  if (!value || typeof value !== 'object') return;
  assert.equal(Object.isFrozen(value), true, `${path} is mutable`);
  for (const [key, child] of Object.entries(value)) assertDeepFrozen(child, `${path}.${key}`);
}

test('developer config remains immutable and available through compatibility exports', () => {
  assert.equal(developerConfig.CHAPTERS, CHAPTERS);
  assert.equal(developerConfig.GENERATION_CONFIG, GENERATION_CONFIG);
  assert.equal(developerConfig.CHAPTER_TUTORIALS, CHAPTER_TUTORIALS);
  assert.equal(compatibilityContent.CHAPTERS, CHAPTERS);
  assertDeepFrozen(CHAPTERS, 'CHAPTERS');
  assertDeepFrozen(GENERATION_CONFIG, 'GENERATION_CONFIG');
  assertDeepFrozen(CHAPTER_TUTORIALS, 'CHAPTER_TUTORIALS');
});

test('six chapters declare the approved rhythm, order, and guaranteed supply shape', () => {
  assert.deepEqual(CHAPTERS.map((chapter) => chapter.name), [
    '基礎防線', '階乘危機', '漸近突破', '組合推導', '週期防線', '指數交鋒',
  ]);
  const pressureRanges = [[6, 8], [8, 10], [7, 9], [10, 12], [10, 12], [12, 14]];
  const mixedRanges = [[8, 10], [10, 12], [9, 11], [12, 14], [12, 14], [14, 16]];
  CHAPTERS.forEach((chapter, chapterIndex) => {
    assert.equal(chapter.segments.length, 2);
    assert.equal(chapter.segments[0].index, 1);
    assert.equal(chapter.segments[0].kind, 'pressure');
    assert.deepEqual(chapter.segments[0].countRange, pressureRanges[chapterIndex]);
    assert.equal(chapter.segments[1].index, 2);
    assert.equal(chapter.segments[1].kind, 'mixed');
    assert.deepEqual(chapter.segments[1].countRange, mixedRanges[chapterIndex]);
    assert.deepEqual(chapter.countRange, pressureRanges[chapterIndex]);
    for (const segment of chapter.segments) {
      assert.ok(segment.guaranteedSupply.operators.length > 0);
      assert.ok(Array.isArray(segment.guaranteedSupply.formulaIds));
      assert.ok(Array.isArray(segment.guaranteedSupply.constants));
      assert.ok(segment.guaranteedSupply.formulaIds.length <= FORMULA_QUEUE_CAPACITY);
      assert.ok(segment.guaranteedSupply.constants.length <= CONSTANT_QUEUE_CAPACITY);
    }
    assert.ok(chapter.starterOperators.length <= OPERATOR_QUEUE_CAPACITY);
  });
});

test('operator unlock order and tower versus scroll roles match the curriculum', () => {
  assert.equal(OPERATORS.add.unlockChapter, 0);
  assert.equal(OPERATORS.subtract.unlockChapter, 0);
  assert.equal(OPERATORS.derivative.unlockChapter, 1);
  assert.equal(OPERATORS.multiply.unlockChapter, 1);
  assert.equal(OPERATORS.divide.unlockChapter, 1);
  assert.equal(OPERATORS.squareRoot.unlockChapter, 1);
  assert.equal(OPERATORS.secondDerivative.unlockChapter, 1);
  assert.equal(OPERATORS.integral.unlockChapter, 1);
  assert.equal(OPERATORS.eulerTower.unlockChapter, 2);
  assert.equal(OPERATORS.limit.unlockChapter, 2);
  assert.equal(OPERATORS.evaluateTower.unlockChapter, 3);
  assert.equal(OPERATORS.partial.unlockChapter, 3);
  assert.equal(OPERATORS.resonanceTower.unlockChapter, 4);
  assert.equal(OPERATORS.definiteIntegralTower.unlockChapter, 4);
  assert.equal(OPERATORS.reflect.unlockChapter, 5);
  assert.ok(OPERATORS.limit.cost >= OPERATORS.derivative.cost * 5);
  assert.ok(OPERATORS.partial.cost >= OPERATORS.limit.cost * 2);
  assert.equal(OPERATORS.partial.symbol, '∂/∂z');
  assert.equal(OPERATORS.secondDerivative.cost, 150);
  assert.equal(OPERATORS.secondDerivative.cooldown, 2.2);
  assert.ok(2 / OPERATORS.secondDerivative.cooldown > 1 / OPERATORS.derivative.cooldown);
  const parameterScrollIds = [
    'add', 'subtract', 'multiply', 'divide', 'definiteIntegralTower',
    'evaluateTower', 'eulerTower', 'resonanceTower',
  ];
  for (const operatorId of parameterScrollIds) {
    assert.equal(OPERATORS[operatorId].kind, 'target');
    assert.equal(OPERATORS[operatorId].projectile.trajectory, 'drop');
    assert.ok(OPERATORS[operatorId].parameterKeys.length >= 1);
  }
  assert.equal(OPERATORS.squareRoot.kind, 'target');
  assert.equal(OPERATORS.squareRoot.projectile.trajectory, 'drop');
  assert.deepEqual(OPERATORS.squareRoot.parameterKeys ?? [], []);
  assert.equal(OPERATORS.add.cost, 25);
  assert.equal(OPERATORS.subtract.cost, 25);
  assert.equal(OPERATORS.multiply.cost, 450);
  assert.equal(OPERATORS.divide.cost, 300);
  assert.equal(OPERATORS.squareRoot.cost, 400);
  assert.ok(OPERATORS.multiply.cost > OPERATORS.add.cost);
  assert.ok(OPERATORS.divide.cost > OPERATORS.subtract.cost);
  assert.ok(OPERATORS.squareRoot.cost > OPERATORS.subtract.cost);
  assert.deepEqual(OPERATORS.definiteIntegralTower.parameterKeys, ['lowerBound', 'upperBound']);
  assert.deepEqual(OPERATORS.eulerTower.parameterKeys, ['parameter']);
});

test('chapter one is a constant-only arithmetic introduction', () => {
  const chapter = CHAPTERS[0];
  const tutorial = CHAPTER_TUTORIALS[0];
  const wave = generateTutorialWave(0);

  assert.deepEqual(chapter.families, ['constant']);
  assert.ok(chapter.segments.every((segment) => (
    segment.families.length === 1 && segment.families[0] === 'constant'
  )));
  assert.deepEqual(new Set(chapter.starterOperators), new Set(['add', 'subtract']));
  assert.deepEqual(tutorial.enemyGuideIds, ['constant']);
  assert.deepEqual(new Set(tutorial.starterOperators), new Set(['add', 'subtract']));
  assert.deepEqual(tutorial.deploymentGoals, []);
  assert.ok(wave.entries.length >= 2);
  assert.ok(wave.entries.every((entry) => entry.family === 'constant'));
  assert.ok(wave.entries.every((entry) => {
    const expression = entry.expression;
    return expression.terms.length === 1
      && expression.terms[0].xPower === 0
      && expression.terms[0].yPower === 0;
  }));
});

test('projectile timing and exit boundary preserve the deliberate slow-flight contract', () => {
  assert.deepEqual(GAMEPLAY_CONFIG.effects.projectileTravelSeconds, {
    lane: 5,
    drop: 1.5,
  });
  assert.ok(GAMEPLAY_CONFIG.geometry.projectileExitPosition > 1);
});

test('recognition tutorials are fixed hands-on sandboxes without pre-placed towers', () => {
  assert.equal(CHAPTER_TUTORIALS.length, 6);
  CHAPTER_TUTORIALS.forEach((tutorial, chapterIndex) => {
    const wave = generateTutorialWave(chapterIndex);
    assert.ok(wave.entries.length >= 2 && wave.entries.length <= 3);
    assert.ok(wave.entries.every((entry) => entry.affixes.length === 0));
    assert.ok(wave.entries.every((entry) => tutorial.enemyGuideIds.includes(entry.family)));
    assert.ok(tutorial.enemyGuideIds.every((id) => ENEMY_GUIDES[id]));
    assert.ok(tutorial.starterOperators.length <= OPERATOR_QUEUE_CAPACITY);
    assert.deepEqual(wave.deploymentGoals, tutorial.deploymentGoals);
    const availableTowerCounts = tutorial.starterOperators.reduce((counts, operatorId) => {
      if (OPERATORS[operatorId]?.kind === 'tower') {
        counts.set(operatorId, (counts.get(operatorId) ?? 0) + 1);
      }
      return counts;
    }, new Map());
    const requiredTowerCounts = new Map();
    for (const goal of tutorial.deploymentGoals) {
      assert.ok(OPERATORS[goal.typeId]);
      assert.equal(OPERATORS[goal.typeId].kind, 'tower');
      assert.ok(OPERATORS[goal.typeId].unlockChapter <= chapterIndex);
      assert.ok(goal.row >= 0 && goal.row < CHAPTERS[chapterIndex].board.rows);
      requiredTowerCounts.set(goal.typeId, (requiredTowerCounts.get(goal.typeId) ?? 0) + 1);
    }
    for (const [operatorId, count] of requiredTowerCounts) {
      assert.ok(availableTowerCounts.get(operatorId) >= count);
    }
  });
});
