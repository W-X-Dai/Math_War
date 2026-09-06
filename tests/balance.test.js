import test from 'node:test';
import assert from 'node:assert/strict';

import {
  addExpressions,
  differentiate,
  exponential,
  isZero,
  logarithm,
  multiplyByX,
  polynomial,
  scaleExpression,
  substituteX,
  trigonometric,
} from '../src/domain/expression.js';
import { CHAPTERS, FORMULA_CARDS, OPERATORS } from '../src/game/content.js';
import { generateFiniteSegment } from '../src/game/level-generator.js';

function differentiateUntilZero(expression, maximumHits = 16) {
  let current = expression;
  for (let hits = 0; hits <= maximumHits; hits += 1) {
    if (isZero(current)) return hits;
    current = differentiate(current);
  }
  return Infinity;
}

function secondDifferentiateUntilZero(expression, maximumHits = 8) {
  let current = expression;
  for (let hits = 0; hits <= maximumHits; hits += 1) {
    if (isZero(current)) return hits;
    current = differentiate(current, 'x', 2);
  }
  return Infinity;
}

function euler(expression, parameter) {
  return addExpressions(
    multiplyByX(differentiate(expression)),
    scaleExpression(expression, parameter),
  );
}

function resonance(expression, parameter) {
  return addExpressions(
    differentiate(expression, 'x', 2),
    scaleExpression(expression, parameter),
  );
}

function suppliedParameters(wave) {
  return wave.guaranteedSupply.formulaIds.map((formulaId, index) => {
    const formula = FORMULA_CARDS.find((card) => card.id === formulaId);
    assert.ok(formula, `unknown guaranteed formula ${formulaId}`);
    return formula.evaluate({ k: wave.guaranteedSupply.constants[index] });
  });
}

function requiredGuaranteedOperators(wave) {
  const towerRows = new Set();
  return wave.counterRequirements.flatMap((requirement) => requirement.operators.flatMap((operator) => {
    if (OPERATORS[operator.operatorId].kind === 'tower') {
      const key = `${requirement.row}:${operator.operatorId}`;
      if (towerRows.has(key)) return [];
      towerRows.add(key);
      return [operator.operatorId];
    }
    return Array.from({ length: requirement.scrollUses }, () => operator.operatorId);
  }));
}

function requiredGuaranteedParameters(wave) {
  return wave.counterRequirements.flatMap((requirement) => (
    requirement.operators.flatMap((operator) => (
      operator.parameter == null
        ? []
        : Array.from({ length: requirement.scrollUses }, () => operator.parameter)
    ))
  ));
}

test('D is the cheap, fast choice for low order while D² wins high-order reduction efficiency', () => {
  const derivative = OPERATORS.derivative;
  const secondDerivative = OPERATORS.secondDerivative;
  const linear = polynomial([{ coefficient: 3, xPower: 1, yPower: 0 }]);
  const fifthOrder = polynomial([{ coefficient: 1, xPower: 5, yPower: 0 }]);

  assert.ok(derivative.cost < secondDerivative.cost);
  assert.ok(derivative.cooldown < secondDerivative.cooldown);
  assert.equal(differentiateUntilZero(linear), 2);
  assert.equal(secondDifferentiateUntilZero(linear), 1);

  const derivativeHits = differentiateUntilZero(fifthOrder);
  const secondDerivativeHits = secondDifferentiateUntilZero(fifthOrder);
  assert.equal(derivativeHits, 6);
  assert.equal(secondDerivativeHits, 3);
  assert.ok(secondDerivative.cost < derivative.cost * 2);
  assert.ok(
    (secondDerivativeHits - 1) * secondDerivative.cooldown
      < (derivativeHits - 1) * derivative.cooldown,
    'one D² tower must reduce a fifth-order enemy faster than one D tower firing twice per reduction',
  );
});

test('chapter one is a tower-free constant curriculum with basic add and subtract counters', () => {
  assert.deepEqual(
    Object.values(OPERATORS)
      .filter((operator) => operator.kind === 'tower' && operator.unlockChapter === 0),
    [],
  );
  assert.deepEqual(
    Object.values(OPERATORS)
      .filter((operator) => operator.unlockChapter === 0)
      .map((operator) => operator.id)
      .sort(),
    ['add', 'subtract'],
  );

  for (const segmentIndex of [1, 2]) {
    for (let seed = 1; seed <= 100; seed += 1) {
      const wave = generateFiniteSegment(seed, 0, segmentIndex);
      assert.ok(wave.entries.every((entry) => entry.family === 'constant'));
      for (const entry of wave.entries) {
        assert.equal(entry.expression.terms.length, 1);
        assert.equal(entry.expression.terms[0].xPower, 0);
        assert.equal(entry.expression.terms[0].yPower, 0);
      }
      for (const requirement of wave.counterRequirements) {
        assert.ok(requirement.operators.every(({ operatorId }) => (
          operatorId === 'add' || operatorId === 'subtract'
        )));
      }
    }
  }
});

test('heavy arithmetic scrolls unlock after the basics and carry a substantial energy premium', () => {
  assert.equal(OPERATORS.add.category, 'basic');
  assert.equal(OPERATORS.subtract.category, 'basic');
  assert.equal(OPERATORS.add.cost, 25);
  assert.equal(OPERATORS.subtract.cost, 25);

  for (const [operatorId, cost] of [
    ['multiply', 450],
    ['divide', 300],
    ['squareRoot', 400],
  ]) {
    const operator = OPERATORS[operatorId];
    assert.equal(operator.category, 'heavy');
    assert.equal(operator.unlockChapter, 1);
    assert.equal(operator.kind, 'target');
    assert.equal(operator.projectile.trajectory, 'drop');
    assert.equal(operator.cost, cost);
    assert.ok(operator.cost >= OPERATORS.add.cost * 10);
  }
});

test('parameter scrolls preserve specialist math without occupying a lane slot', () => {
  const evaluate = OPERATORS.evaluateTower;
  assert.equal(evaluate.kind, 'target');

  const rational = polynomial([{ coefficient: 3, xPower: -1, yPower: 0 }]);
  assert.ok(isZero(euler(rational, 1)), 'Euler(1) must remove x⁻¹ in one operation');
  assert.throws(() => substituteX(rational, 0));
  assert.ok(!isZero(substituteX(rational, 1)), 'f(1) still needs a following D tower');

  const trig = trigonometric('cos', 2, 3);
  const growing = exponential(2, 3);
  assert.ok(isZero(resonance(trig, 4)), 'D²+4I must remove frequency 2');
  assert.ok(isZero(resonance(growing, -4)), 'D²−4I must remove growth rate 2');

  assert.equal(OPERATORS.eulerTower.kind, 'target');
  assert.equal(OPERATORS.resonanceTower.kind, 'target');
  assert.equal(OPERATORS.eulerTower.projectile.trajectory, 'drop');
  assert.equal(OPERATORS.resonanceTower.projectile.trajectory, 'drop');
  assert.ok(OPERATORS.eulerTower.cost < OPERATORS.derivative.cost);
  assert.ok(OPERATORS.resonanceTower.cost < OPERATORS.derivative.cost);
});

test('chapter 4 logarithms have a timing-independent f(1) scroll counter', () => {
  const expression = logarithm(3);
  assert.ok(isZero(substituteX(expression, 1)));
});

test('from chapter 3 onward every formal segment contains a threat that pure D cannot finish', () => {
  for (let chapterIndex = 2; chapterIndex < CHAPTERS.length; chapterIndex += 1) {
    for (const segmentIndex of [1, 2]) {
      for (let seed = 1; seed <= 100; seed += 1) {
        const wave = generateFiniteSegment(seed, chapterIndex, segmentIndex);
        assert.ok(
          wave.entries.some((entry) => differentiateUntilZero(entry.expression, 16) === Infinity),
          `chapter ${chapterIndex + 1}, segment ${segmentIndex}, seed ${seed} needs a non-D counter`,
        );
      }
    }
  }
});

test('every generated counter is backed by exact guaranteed operators and parameter materials', () => {
  for (let chapterIndex = 0; chapterIndex < CHAPTERS.length; chapterIndex += 1) {
    for (const segmentIndex of [1, 2]) {
      for (let seed = 1; seed <= 100; seed += 1) {
        const wave = generateFiniteSegment(seed, chapterIndex, segmentIndex);
        const requiredOperators = requiredGuaranteedOperators(wave);
        const requiredParameters = requiredGuaranteedParameters(wave);
        assert.deepEqual(wave.guaranteedSupply.operators, requiredOperators);
        assert.deepEqual(suppliedParameters(wave), requiredParameters);
      }
    }
  }
});
