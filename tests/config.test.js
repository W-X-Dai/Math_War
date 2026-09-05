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

test('operator unlock order and efficiency match the six-chapter curriculum', () => {
  assert.equal(OPERATORS.derivative.unlockChapter, 0);
  assert.equal(OPERATORS.subtract.unlockChapter, 0);
  assert.equal(OPERATORS.secondDerivative.unlockChapter, 1);
  assert.equal(OPERATORS.integral.unlockChapter, 1);
  assert.equal(OPERATORS.eulerTower.unlockChapter, 2);
  assert.equal(OPERATORS.limit.unlockChapter, 2);
  assert.equal(OPERATORS.evaluateTower.unlockChapter, 3);
  assert.equal(OPERATORS.partial.unlockChapter, 3);
  assert.equal(OPERATORS.resonanceTower.unlockChapter, 4);
  assert.equal(OPERATORS.definiteIntegralTower.unlockChapter, 4);
  assert.equal(OPERATORS.reflect.unlockChapter, 5);
  assert.equal(OPERATORS.secondDerivative.cost, 150);
  assert.equal(OPERATORS.secondDerivative.cooldown, 2.2);
  assert.ok(2 / OPERATORS.secondDerivative.cooldown > 1 / OPERATORS.derivative.cooldown);
  assert.equal(OPERATORS.evaluateTower.cost, 130);
  assert.equal(OPERATORS.evaluateTower.cooldown, 6);
});

test('recognition tutorials are fixed two-to-three enemy sandboxes without affixes', () => {
  assert.equal(CHAPTER_TUTORIALS.length, 6);
  CHAPTER_TUTORIALS.forEach((tutorial, chapterIndex) => {
    const wave = generateTutorialWave(chapterIndex);
    assert.ok(wave.entries.length >= 2 && wave.entries.length <= 3);
    assert.ok(wave.entries.every((entry) => entry.affixes.length === 0));
    assert.ok(wave.entries.every((entry) => tutorial.enemyGuideIds.includes(entry.family)));
    assert.ok(tutorial.enemyGuideIds.every((id) => ENEMY_GUIDES[id]));
    assert.ok(tutorial.starterOperators.length <= OPERATOR_QUEUE_CAPACITY);
    for (const tower of tutorial.presetTowers) {
      assert.ok(OPERATORS[tower.typeId]);
      assert.ok(tower.row >= 0 && tower.row < CHAPTERS[chapterIndex].board.rows);
      assert.ok(tower.column >= 0 && tower.column < CHAPTERS[chapterIndex].board.placeableColumns);
    }
  });
});
