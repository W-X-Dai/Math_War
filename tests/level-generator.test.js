import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addExpressions,
  differentiate,
  isZero,
  multiplyByX,
  normalizeExpression,
  scaleExpression,
} from '../src/domain/expression.js';
import { CHAPTERS, FORMULA_CARDS, OPERATORS } from '../src/game/content.js';
import {
  endlessDifficulty,
  generateEndlessWave,
  generateFiniteSegment,
  generateFiniteWave,
  summarizeWave,
} from '../src/game/level-generator.js';

const RATE_SET = new Set([-2, -1, 1, 2]);

function basisCount(expression) {
  const normalized = normalizeExpression(expression);
  return normalized.terms.length
    + normalized.exponentials.length
    + normalized.trigTerms.length
    + normalized.logTerms.length;
}

function applyOperator(expression, operator) {
  switch (operator.operatorId) {
    case 'derivative': return differentiate(expression);
    case 'secondDerivative': return differentiate(expression, 'x', 2);
    case 'eulerTower': return addExpressions(
      multiplyByX(differentiate(expression)),
      scaleExpression(expression, operator.parameter),
    );
    case 'resonanceTower': return addExpressions(
      differentiate(expression, 'x', 2),
      scaleExpression(expression, operator.parameter),
    );
    default: throw new RangeError(`unsupported test operator ${operator.operatorId}`);
  }
}

function counterEliminates(expression, requirement) {
  let result = expression;
  for (let cycle = 0; cycle < 8 && !isZero(result); cycle += 1) {
    for (const operator of requirement.operators) result = applyOperator(result, operator);
  }
  return isZero(result);
}

function assertSorted(entries) {
  for (let index = 1; index < entries.length; index += 1) {
    assert.ok(entries[index - 1].spawnAt <= entries[index].spawnAt);
  }
}

function assertSupplyCovers(wave, chapter) {
  const expectedOperators = wave.counterRequirements.flatMap((requirement) => (
    requirement.operators.map((operator) => operator.operatorId)
  ));
  assert.deepEqual(wave.guaranteedSupply.operators, expectedOperators);
  const parameterOperators = wave.counterRequirements.flatMap((requirement) => (
    requirement.operators.filter((operator) => operator.parameter != null)
  ));
  assert.equal(wave.guaranteedSupply.formulaIds.length, parameterOperators.length);
  assert.equal(wave.guaranteedSupply.constants.length, parameterOperators.length);
  parameterOperators.forEach((operator, index) => {
    const card = FORMULA_CARDS.find((candidate) => candidate.id === wave.guaranteedSupply.formulaIds[index]);
    assert.ok(card);
    assert.equal(card.evaluate({ k: wave.guaranteedSupply.constants[index] }), operator.parameter);
  });
  const cost = expectedOperators.reduce((total, id) => total + OPERATORS[id].cost, 0);
  assert.ok(cost <= chapter.startingEnergy, `guaranteed defense costs ${cost}/${chapter.startingEnergy}`);
}

function assertFiniteFormula(chapterIndex, segmentIndex, entry) {
  const expression = normalizeExpression(entry.expression);
  if (chapterIndex === 0) {
    assert.equal(expression.terms.length, 1);
    assert.ok(expression.terms[0].xPower >= 0 && expression.terms[0].xPower <= 2);
  } else if (chapterIndex === 1) {
    assert.equal(expression.terms.length, 1);
    if (entry.family === 'higherOrder') assert.ok(expression.terms[0].xPower >= 3 && expression.terms[0].xPower <= 5);
    else assert.ok(expression.terms[0].xPower >= 1 && expression.terms[0].xPower <= 2);
    if (entry.affixes.includes('fast')) assert.equal(entry.family, 'polynomial');
    if (segmentIndex === 1) assert.deepEqual(entry.affixes, []);
  } else if (chapterIndex === 2) {
    if (entry.family === 'rational') {
      assert.equal(expression.terms.length, 1);
      assert.equal(expression.terms[0].xPower, -1);
    } else {
      assert.equal(entry.family, 'polynomial');
      assert.ok(expression.terms[0].xPower >= 1 && expression.terms[0].xPower <= 2);
    }
    assert.ok(!entry.affixes.includes('shield') && !entry.affixes.includes('split'));
  } else if (chapterIndex === 3) {
    if (entry.family === 'logarithmic') {
      assert.equal(expression.logTerms.length, 1);
      assert.equal(expression.logTerms[0].xPower, 0);
      assert.ok(!entry.affixes.includes('shield'));
    } else if (entry.family === 'rational') {
      assert.equal(expression.terms.length, 1);
      assert.ok([-1, -2].includes(expression.terms[0].xPower));
    } else {
      assert.equal(expression.terms.length, 1);
      assert.ok(expression.terms[0].xPower >= 3 && expression.terms[0].xPower <= 5);
      if (entry.family === 'multivariable') assert.ok(expression.terms[0].yPower >= 1 && expression.terms[0].yPower <= 3);
    }
    if (entry.affixes.length) assert.deepEqual(entry.affixes, ['shield']);
  } else if (chapterIndex === 4) {
    if (entry.family === 'trigonometric') {
      const rates = new Set(expression.trigTerms.map((term) => term.rate));
      assert.equal(rates.size, 1);
      assert.ok([1, 2].includes([...rates][0]));
      assert.equal(expression.trigTerms.length, segmentIndex === 1 ? 1 : 2);
    } else {
      assert.equal(entry.family, 'rational');
      assert.equal(expression.terms.length, 1);
      assert.ok([-1, -2].includes(expression.terms[0].xPower));
    }
    if (entry.affixes.includes('split')) {
      assert.equal(entry.family, 'trigonometric');
      assert.equal(entry.splitExpressions.length, 2);
    }
  } else {
    if (entry.family === 'exponential') {
      assert.equal(expression.exponentials.length, 1);
      assert.ok(RATE_SET.has(expression.exponentials[0].rate));
    } else {
      assert.equal(entry.family, 'trigonometric');
      assert.equal(new Set(expression.trigTerms.map((term) => term.rate)).size, 1);
    }
    assert.ok(entry.affixes.length <= 1);
    if (entry.affixes.includes('split')) assert.equal(entry.family, 'trigonometric');
  }
  assert.ok(entry.affixes.length <= 1);
  assert.ok(!(entry.affixes.includes('shield') && entry.affixes.includes('fast')));
  for (const child of entry.splitExpressions) assert.equal(basisCount(child), 1);
}

test('finite segment API is deterministic, compatible, and validates coordinates', () => {
  for (let chapterIndex = 0; chapterIndex < 6; chapterIndex += 1) {
    for (const segmentIndex of [1, 2]) {
      const wave = generateFiniteSegment('contract', chapterIndex, segmentIndex);
      assert.deepEqual(wave, generateFiniteSegment('contract', chapterIndex, segmentIndex));
      assert.deepEqual(wave, generateFiniteWave('contract', chapterIndex, segmentIndex));
      assert.equal(wave.segmentIndex, segmentIndex);
      assert.equal(wave.segmentKind, segmentIndex === 1 ? 'pressure' : 'mixed');
      assert.equal(wave.awardsEarlyStart, segmentIndex === 1);
      assert.equal(wave.kind, 'challenge');
    }
    assert.deepEqual(generateFiniteWave('default', chapterIndex), generateFiniteSegment('default', chapterIndex, 1));
  }
  assert.throws(() => generateFiniteSegment(1, -1, 1), RangeError);
  assert.throws(() => generateFiniteSegment(1, 6, 1), RangeError);
  assert.throws(() => generateFiniteSegment(1, 0, 0), RangeError);
  assert.throws(() => generateFiniteSegment(1, 0, 3), RangeError);
  assert.throws(() => generateFiniteSegment(1, 0, 1.5), RangeError);
});

test('all formal segments satisfy lane, formula, affix, supply, and summary invariants over 500 seeds', () => {
  for (let seed = 0; seed < 500; seed += 1) {
    for (let chapterIndex = 0; chapterIndex < CHAPTERS.length; chapterIndex += 1) {
      const chapter = CHAPTERS[chapterIndex];
      for (const segmentIndex of [1, 2]) {
        const segment = chapter.segments[segmentIndex - 1];
        const wave = generateFiniteSegment(seed, chapterIndex, segmentIndex);
        assert.ok(wave.entries.length >= segment.countRange[0] && wave.entries.length <= segment.countRange[1]);
        assertSorted(wave.entries);
        assert.deepEqual(wave.summary, summarizeWave(wave));
        assert.equal(wave.summary.total, wave.entries.length);
        assert.deepEqual(Object.keys(wave.summary), ['total', 'families', 'mutationCount', 'danger', 'lanes']);
        assert.equal(wave.counterRequirements.length, wave.summary.lanes.length);
        assertSupplyCovers(wave, chapter);

        for (const requirement of wave.counterRequirements) {
          const laneEntries = wave.entries.filter((entry) => entry.row === requirement.row);
          assert.ok(laneEntries.length > 0);
          assert.ok(laneEntries.every((entry) => entry.family === requirement.family));
          assert.ok(laneEntries.every((entry) => counterEliminates(entry.expression, requirement)));
          const rates = laneEntries.flatMap((entry) => {
            const expression = normalizeExpression(entry.expression);
            return [...expression.exponentials, ...expression.trigTerms].map((term) => term.rate);
          });
          if (rates.length) assert.equal(new Set(rates).size, 1, `unstable rate ${seed}/${chapterIndex}/${segmentIndex}/${requirement.row}`);
        }
        for (const entry of wave.entries) assertFiniteFormula(chapterIndex, segmentIndex, entry);

        const serializedSummary = JSON.stringify(wave.summary);
        assert.doesNotMatch(serializedSummary, /expression|coefficient|spawnAt|xPower/);
      }
    }
  }
});

test('chapter three introduces enemies that pure D cannot eliminate', () => {
  for (let seed = 0; seed < 500; seed += 1) {
    const wave = generateFiniteSegment(seed, 2, 1);
    assert.ok(wave.entries.every((entry) => entry.family === 'rational'));
    for (const entry of wave.entries) {
      let expression = entry.expression;
      for (let count = 0; count < 20; count += 1) expression = differentiate(expression);
      assert.equal(isZero(expression), false);
    }
  }
});

test('endless difficulty introduces one axis per stage then rotates one uncapped numeric axis', () => {
  const expected = [
    [1, 'baseline'], [2, 'packs'], [3, 'simultaneousLanes'], [4, 'fast'],
    [5, 'shield'], [6, 'split'], [7, 'speed'], [8, 'items'], [9, 'power'],
    [10, 'mixedFrequencyElite'], [11, 'doubleAffix'],
  ];
  for (const [roundNumber, axis] of expected) assert.equal(endlessDifficulty(roundNumber).stageAxis, axis);
  assert.deepEqual(endlessDifficulty(1).allowedAffixes, []);
  assert.deepEqual(endlessDifficulty(4).allowedAffixes, ['fast']);
  assert.deepEqual(endlessDifficulty(5).allowedAffixes, ['fast', 'shield']);
  assert.deepEqual(endlessDifficulty(6).allowedAffixes, ['fast', 'shield', 'split']);
  assert.equal(endlessDifficulty(10).mixedFrequencyElite, true);
  assert.equal(endlessDifficulty(11).maxAffixes, 2);

  const numericAxes = ['count', 'speedMultiplier', 'maxItems', 'maxPower', 'eliteMaxFrequency', 'affixChance'];
  let previous = endlessDifficulty(11);
  for (let roundNumber = 12; roundNumber <= 100; roundNumber += 1) {
    const current = endlessDifficulty(roundNumber);
    const changed = numericAxes.filter((axis) => current[axis] !== previous[axis]);
    assert.ok(changed.length <= 1, `round ${roundNumber} changed ${changed.join(',')}`);
    previous = current;
  }
});

test('endless ordinary enemies stay finite-legal and mixed frequency is a warned elite', () => {
  for (let roundNumber = 1; roundNumber <= 40; roundNumber += 1) {
    const wave = generateEndlessWave(8080, roundNumber);
    assert.deepEqual(wave, generateEndlessWave(8080, roundNumber));
    assert.equal(wave.entries.length, wave.difficulty.count);
    assertSorted(wave.entries);
    for (const entry of wave.entries) {
      const expression = normalizeExpression(entry.expression);
      assert.ok(entry.affixes.length <= (roundNumber >= 11 ? 2 : 1));
      assert.ok(!(entry.affixes.includes('shield') && entry.affixes.includes('split')));
      if (entry.eliteKind === 'mixed-frequency') {
        assert.equal(roundNumber >= 10, true);
        assert.ok(new Set(expression.trigTerms.map((term) => term.rate)).size > 1);
        assert.deepEqual(entry.affixes, []);
        continue;
      }
      if (entry.family === 'rational') {
        assert.equal(expression.terms.length, 1);
        assert.ok([-1, -2].includes(expression.terms[0].xPower));
      }
      if (entry.family === 'logarithmic') {
        assert.equal(expression.logTerms.length, 1);
        assert.equal(expression.logTerms[0].xPower, 0);
      }
      if (entry.family === 'trigonometric') {
        assert.equal(new Set(expression.trigTerms.map((term) => term.rate)).size, 1);
        assert.ok(expression.trigTerms.every((term) => [1, 2].includes(term.rate)));
      }
      if (entry.family === 'exponential') {
        assert.equal(expression.exponentials.length, 1);
        assert.ok(RATE_SET.has(expression.exponentials[0].rate));
      }
    }
    if (roundNumber >= 10) {
      assert.equal(wave.counterRequirements.length, 1);
      assert.match(wave.counterRequirements[0].warning, /混頻/);
      assert.equal(wave.guaranteedSupply.operators.length, 2);
      assert.ok(wave.summary.lanes.some((lane) => lane.mixedFrequencyElite));
    } else {
      assert.deepEqual(wave.counterRequirements, []);
    }
  }
});
