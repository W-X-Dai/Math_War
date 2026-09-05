import test from 'node:test';
import assert from 'node:assert/strict';

import { damage, normalizeExpression } from '../src/domain/expression.js';
import {
  CHAPTERS,
  ENDLESS_CHAPTER,
  FORMULA_CARDS,
  GOD_CONSTANT_VALUES,
  OPERATORS,
  OPERATOR_QUEUE_CAPACITY,
  OPERATOR_QUEUE_INTERVAL,
} from '../src/game/content.js';
import {
  endlessDifficulty,
  generateEndlessWave,
  generateFiniteWave,
  summarizeWave,
} from '../src/game/level-generator.js';

const EXPECTED_BOARDS = [
  [4, 7, 4], [4, 8, 5], [5, 9, 5], [5, 10, 6], [6, 11, 7], [6, 12, 7],
];
const EXPECTED_ENERGY = [540, 620, 720, 820, 920, 1050];
const EXPECTED_STARTERS = [
  ['derivative', 'derivative', 'derivative', 'derivative', 'derivative', 'subtract', 'subtract', 'subtract'],
  ['derivative', 'derivative', 'derivative', 'subtract', 'subtract', 'secondDerivative', 'secondDerivative', 'integral'],
  ['derivative', 'derivative', 'secondDerivative', 'secondDerivative', 'secondDerivative', 'subtract', 'definiteIntegralTower', 'integral'],
  ['derivative', 'derivative', 'secondDerivative', 'partial', 'evaluateTower', 'evaluateTower', 'definiteIntegralTower', 'integral'],
  ['derivative', 'derivative', 'limit', 'limit', 'eulerTower', 'eulerTower', 'evaluateTower', 'definiteIntegralTower'],
  ['derivative', 'secondDerivative', 'resonanceTower', 'resonanceTower', 'evaluateTower', 'definiteIntegralTower', 'reflect', 'limit'],
];

function basisCount(expression) {
  const normalized = normalizeExpression(expression);
  return normalized.terms.length
    + normalized.exponentials.length
    + normalized.trigTerms.length
    + normalized.logTerms.length;
}

function signature(wave) {
  return JSON.stringify(wave.entries.map((entry) => ({
    row: entry.row,
    spawnAt: entry.spawnAt,
    family: entry.family,
    expression: entry.expression,
    affixes: entry.affixes,
  })));
}

function assertBalancedLanes(entries, rows) {
  const counts = Array.from({ length: rows }, (_, row) => (
    entries.filter((entry) => entry.row === row).length
  ));
  assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, `unbalanced lanes: ${counts.join(',')}`);
}

function assertSorted(entries) {
  for (let index = 1; index < entries.length; index += 1) {
    assert.ok(entries[index - 1].spawnAt < entries[index].spawnAt);
  }
}

function assertEntryShape(entry) {
  for (const key of ['spawnAt', 'row', 'typeId', 'name', 'art', 'family', 'expression', 'speed', 'reward', 'affixes', 'splitExpressions']) {
    assert.ok(Object.hasOwn(entry, key), `entry is missing ${key}`);
  }
  assert.ok(Number.isFinite(entry.speed) && entry.speed > 0);
  assert.ok(Number.isFinite(entry.reward) && entry.reward > 0);
}

test('chapter content has the approved boards, energy and exact eight-card arsenals', () => {
  assert.equal(CHAPTERS.length, 6);
  assert.equal(OPERATOR_QUEUE_CAPACITY, 8);
  assert.equal(OPERATOR_QUEUE_INTERVAL, 8);
  CHAPTERS.forEach((chapter, index) => {
    assert.deepEqual(
      [chapter.board.rows, chapter.board.columns, chapter.board.placeableColumns],
      EXPECTED_BOARDS[index],
    );
    assert.equal(chapter.startingEnergy, EXPECTED_ENERGY[index]);
    assert.deepEqual(chapter.starterOperators, EXPECTED_STARTERS[index]);
  });
  assert.deepEqual(ENDLESS_CHAPTER.board, { rows: 7, columns: 12, placeableColumns: 7 });
  assert.equal(ENDLESS_CHAPTER.startingEnergy, 1100);
  assert.deepEqual(ENDLESS_CHAPTER.starterOperators, [
    'derivative', 'secondDerivative', 'definiteIntegralTower', 'limit',
    'reflect', 'evaluateTower', 'eulerTower', 'resonanceTower',
  ]);
});

test('new workshop materials and parameter towers are available', () => {
  assert.ok(FORMULA_CARDS.some((card) => card.id === 'identityK' && card.evaluate({ k: 5 }) === 5));
  assert.ok(FORMULA_CARDS.some((card) => card.id === 'negSquareK' && card.evaluate({ k: 3 }) === -9));
  assert.ok(GOD_CONSTANT_VALUES.includes(Math.PI));
  assert.ok(GOD_CONSTANT_VALUES.includes(-Math.PI));
  for (const id of ['evaluateTower', 'eulerTower', 'resonanceTower']) {
    assert.equal(OPERATORS[id].kind, 'tower');
    assert.ok(OPERATORS[id].counterTags.length > 0);
  }
});

test('finite waves are deterministic and satisfy invariants across 500 seeds', () => {
  const uniqueChapterFive = new Set();
  const observedAffixes = new Set();
  for (let seed = 0; seed < 500; seed += 1) {
    for (let chapterIndex = 0; chapterIndex < CHAPTERS.length; chapterIndex += 1) {
      const chapter = CHAPTERS[chapterIndex];
      const wave = generateFiniteWave(seed, chapterIndex);
      const repeated = generateFiniteWave(seed, chapterIndex);
      assert.deepEqual(wave, repeated);
      assert.equal(wave.chapterIndex, chapterIndex);
      assert.equal(wave.endlessRound, 0);
      assert.ok(wave.entries.length >= chapter.countRange[0]);
      assert.ok(wave.entries.length <= chapter.countRange[1]);
      assertSorted(wave.entries);
      assertBalancedLanes(wave.entries, chapter.board.rows);
      assert.deepEqual(wave.summary, summarizeWave(wave));
      assert.deepEqual(Object.keys(wave.summary), ['total', 'families', 'mutationCount', 'danger']);

      for (const tag of wave.requiredTags) {
        assert.ok(chapter.starterOperators.some((id) => OPERATORS[id].counterTags.includes(tag)), `chapter ${chapterIndex} cannot counter ${tag}`);
      }

      for (const entry of wave.entries) {
        assertEntryShape(entry);
        entry.affixes.forEach((affix) => observedAffixes.add(affix));
        assert.ok(entry.row >= 0 && entry.row < chapter.board.rows);
        assert.ok(basisCount(entry.expression) >= 1 && basisCount(entry.expression) <= 4);
        assert.ok(damage(entry.expression) <= 40);
        assert.ok(entry.affixes.length <= 1);
        if (chapterIndex < 3) assert.ok(!entry.affixes.includes('shield'));
        if (chapterIndex < 4) assert.ok(!entry.affixes.includes('split'));
        if (entry.affixes.includes('split')) {
          assert.equal(entry.splitExpressions.length, 2);
          assert.ok(entry.splitExpressions.every((expression) => basisCount(expression) === 1));
        } else {
          assert.deepEqual(entry.splitExpressions, []);
        }

        const normalized = normalizeExpression(entry.expression);
        for (const term of normalized.terms) {
          assert.ok(term.xPower >= -4 && term.xPower <= 6);
        }
        for (const term of normalized.logTerms) {
          assert.ok(term.xPower >= -4 && term.xPower <= 6);
        }
        for (const term of [...normalized.exponentials, ...normalized.trigTerms]) {
          assert.ok(Math.abs(term.rate) >= 1 && Math.abs(term.rate) <= 2);
        }
      }
      if (chapterIndex === 5) uniqueChapterFive.add(signature(wave));
    }
  }
  assert.ok(uniqueChapterFive.size >= 490, `only ${uniqueChapterFive.size} distinct chapter-six waves`);
  assert.deepEqual([...observedAffixes].sort(), ['fast', 'shield', 'split']);
});

test('summaries reveal counts and danger but not formulas, lanes or spawn timing', () => {
  const wave = generateFiniteWave('summary-seed', 4);
  const serialized = JSON.stringify(wave.summary);
  assert.match(serialized, /families/);
  assert.doesNotMatch(serialized, /expression|spawnAt|row|lane|xPower|coefficient/);
  assert.equal(wave.summary.total, wave.entries.length);
  assert.equal(wave.summary.mutationCount, wave.entries.reduce((sum, entry) => sum + entry.affixes.length, 0));
});

test('endless difficulty grows monotonically and respects hard caps', () => {
  let previous = endlessDifficulty(1);
  for (let round = 2; round <= 200; round += 1) {
    const current = endlessDifficulty(round);
    assert.ok(current.count >= previous.count);
    assert.ok(current.speedMultiplier >= previous.speedMultiplier);
    assert.ok(current.maxItems >= previous.maxItems);
    assert.ok(current.maxPower >= previous.maxPower);
    assert.ok(current.maxFrequency >= previous.maxFrequency);
    assert.ok(current.count <= 36);
    assert.ok(current.speedMultiplier <= 1.75);
    assert.ok(current.maxItems <= 5);
    assert.ok(current.maxPower <= 8);
    assert.ok(current.maxFrequency <= 3);
    previous = current;
  }
  assert.equal(endlessDifficulty(1).count, 14);
  assert.equal(endlessDifficulty(12).count, 36);
  assert.equal(endlessDifficulty(200).speedMultiplier, 1.75);
});

test('endless waves obey entity, expression, lane and mutation constraints', () => {
  for (let round = 1; round <= 40; round += 1) {
    const wave = generateEndlessWave(8080, round);
    const difficulty = endlessDifficulty(round);
    assert.equal(wave.entries.length, difficulty.count);
    assert.equal(wave.endlessRound, round);
    assertSorted(wave.entries);
    assertBalancedLanes(wave.entries, ENDLESS_CHAPTER.board.rows);
    assert.deepEqual(wave, generateEndlessWave(8080, round));
    for (const entry of wave.entries) {
      assertEntryShape(entry);
      assert.ok(basisCount(entry.expression) <= difficulty.maxItems);
      assert.ok(damage(entry.expression) <= 50);
      assert.ok(entry.speed <= 0.035);
      assert.ok(entry.affixes.length <= (round >= 8 ? 2 : 1));
      assert.ok(!(entry.affixes.includes('shield') && entry.affixes.includes('split')));
      if (entry.affixes.includes('split')) {
        assert.equal(entry.splitExpressions.length, 2);
        assert.ok(entry.splitExpressions.every((expression) => basisCount(expression) === 1));
      }
      const normalized = normalizeExpression(entry.expression);
      for (const term of normalized.terms) assert.ok(term.xPower >= -4 && term.xPower <= 8);
      for (const term of [...normalized.exponentials, ...normalized.trigTerms]) {
        assert.ok(Math.abs(term.rate) <= 3);
      }
    }
  }
});

test('invalid generator coordinates fail explicitly', () => {
  assert.throws(() => generateFiniteWave(1, -1), RangeError);
  assert.throws(() => generateFiniteWave(1, CHAPTERS.length), RangeError);
  assert.throws(() => generateEndlessWave(1, 0), RangeError);
  assert.throws(() => generateEndlessWave(1, 1.5), RangeError);
});
