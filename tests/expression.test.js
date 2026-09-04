import test from "node:test";
import assert from "node:assert/strict";

import {
  cloneExpression,
  damage,
  definiteIntegral,
  differentiate,
  exponential,
  evaluateAt,
  formatExpression,
  integrate,
  isZero,
  limitAtInfinity,
  normalizeExpression,
  polynomial,
  reflectInput,
  subtractConstant,
} from "../src/domain/expression.js";

test("x^5 needs six derivatives and reaches coefficient damage 120", () => {
  let enemy = polynomial([{ coefficient: 1, xPower: 5 }]);
  const states = [];

  for (let hit = 0; hit < 6; hit += 1) {
    states.push({ expression: formatExpression(enemy), damage: damage(enemy) });
    enemy = differentiate(enemy);
  }

  assert.deepEqual(states, [
    { expression: "x^5", damage: 1 },
    { expression: "5x^4", damage: 5 },
    { expression: "20x^3", damage: 20 },
    { expression: "60x^2", damage: 60 },
    { expression: "120x", damage: 120 },
    { expression: "120", damage: 120 },
  ]);
  assert.equal(isZero(enemy), true);
});

test("multiple differentiation supports both a count and options", () => {
  const enemy = polynomial([{ coefficient: 1, xPower: 5 }]);

  assert.equal(formatExpression(differentiate(enemy, "x", 3)), "60x^2");
  assert.equal(
    formatExpression(differentiate(enemy, { variable: "x", times: 6 })),
    "0",
  );
});

test("P - 10 raises x^5 coefficient-sum damage by exactly ten each hit", () => {
  const original = polynomial([{ coefficient: 1, xPower: 5 }]);
  const once = subtractConstant(original);
  const twice = subtractConstant(once);

  assert.equal(formatExpression(original), "x^5");
  assert.equal(formatExpression(once), "x^5 - 10");
  assert.equal(formatExpression(twice), "x^5 - 20");
  assert.deepEqual([damage(original), damage(once), damage(twice)], [1, 11, 21]);

  // Differentiation removes the accumulated constant term.
  assert.equal(formatExpression(differentiate(twice)), "5x^4");
});

test("integration lowers 120x coefficient, raises degree, and preserves C", () => {
  const enemy = polynomial([{ coefficient: 120, xPower: 1 }]);
  const integrated = integrate(enemy, -5);

  assert.equal(formatExpression(integrated), "60x^2 - 5");
  assert.equal(damage(integrated), 65);
  assert.equal(formatExpression(differentiate(integrated)), "120x");
});

test("integration formats common fractional coefficients", () => {
  const integrated = integrate(
    polynomial([{ coefficient: 1, xPower: 5 }]),
    { constant: 5 },
  );

  assert.equal(formatExpression(integrated), "1/6x^6 + 5");
});

test("a constant becomes linear under indefinite integration", () => {
  const integrated = integrate(polynomial(20), 10);

  assert.equal(formatExpression(integrated), "20x + 10");
  assert.equal(damage(integrated), 30);
  assert.equal(isZero(differentiate(integrated, "x", 2)), true);
});

test("reflecting e^x then taking x to infinity kills it", () => {
  const growing = exponential(1);
  const reflected = reflectInput(growing);
  const limit = limitAtInfinity(reflected);

  assert.equal(formatExpression(reflected), "e^-x");
  assert.equal(limit.status, "finite");
  assert.equal(isZero(limit.expression), true);
});

test("using the infinity limit directly on e^x reports divergence", () => {
  const limit = limitAtInfinity(exponential(1));

  assert.deepEqual(limit, { status: "divergent", direction: 1 });
});

test("integrating e^x keeps its exponential coefficient and adds C damage", () => {
  const integrated = integrate(exponential(1), -5);
  const reflectedLimit = limitAtInfinity(reflectInput(integrated));

  assert.equal(formatExpression(integrated), "e^x - 5");
  assert.equal(damage(integrated), 6);
  assert.equal(reflectedLimit.status, "finite");
  assert.equal(formatExpression(reflectedLimit.expression), "-5");
});

test("partial differentiation in x and y handles multivariable terms", () => {
  const enemy = polynomial([
    { coefficient: 3, xPower: 2, yPower: 3 },
    { coefficient: 4, xPower: 0, yPower: 1 },
  ]);

  assert.equal(formatExpression(enemy), "3x^2y^3 + 4y");
  assert.equal(formatExpression(differentiate(enemy, "x")), "6xy^3");
  assert.equal(
    formatExpression(differentiate(enemy, { variable: "y", times: 2 })),
    "18x^2y",
  );
});

test("normalization combines like terms and coefficient damage uses L1", () => {
  const expression = normalizeExpression({
    terms: [
      { coefficient: 2, xPower: 1, yPower: 1 },
      { coefficient: -5, xPower: 1, yPower: 1 },
      { coefficient: -4, xPower: 0, yPower: 0 },
      { coefficient: 4, xPower: 0, yPower: 0 },
    ],
    exponentials: [
      { coefficient: 2, rate: -1 },
      { coefficient: -1, rate: -1 },
    ],
  });

  assert.equal(formatExpression(expression), "e^-x - 3xy");
  assert.equal(damage(expression), 4);
});

test("cloneExpression does not share mutable term objects", () => {
  const original = polynomial([{ coefficient: 2, xPower: 2, yPower: 1 }]);
  const clone = cloneExpression(original);

  clone.terms[0].coefficient = 99;
  assert.equal(formatExpression(original), "2x^2y");
  assert.equal(formatExpression(clone), "99x^2y");
});

test("a finite limit preserves terms independent of x", () => {
  const expression = normalizeExpression({
    terms: [{ coefficient: 3, xPower: 0, yPower: 2 }],
    exponentials: [{ coefficient: 2, rate: -1 }],
  });
  const limit = limitAtInfinity(expression);

  assert.equal(limit.status, "finite");
  assert.equal(formatExpression(limit.expression), "3y^2");
});

test("evaluateAt evaluates multivariable polynomial and exponential terms", () => {
  const expression = normalizeExpression({
    terms: [
      { coefficient: 2, xPower: 2, yPower: 1 },
      { coefficient: 3, xPower: 0, yPower: 0 },
    ],
    exponentials: [{ coefficient: 1, rate: -1 }],
  });

  assert.equal(evaluateAt(expression, 0), 4);
  assert.equal(evaluateAt(expression, 2, 4), 35 + Math.exp(-2));
});

test("definite integral of x from zero to five is 12.5", () => {
  const x = polynomial([{ coefficient: 1, xPower: 1 }]);
  const result = definiteIntegral(x, 0, 5);

  assert.equal(evaluateAt(result, 0), 12.5);
  assert.equal(formatExpression(result), "25/2");
});

test("reversing definite-integral bounds negates the result", () => {
  const x = polynomial([{ coefficient: 1, xPower: 1 }]);

  assert.equal(evaluateAt(definiteIntegral(x, 5, 0), 0), -12.5);
});

test("a constant contributes its value times the interval length", () => {
  const result = definiteIntegral(polynomial(4), -1, 2);

  assert.equal(evaluateAt(result, 99, 99), 12);
  assert.equal(formatExpression(result), "12");
});

test("definite integral supports e^x", () => {
  const result = definiteIntegral(exponential(1), 0, 1);

  assert.ok(Math.abs(evaluateAt(result, 0) - (Math.E - 1)) < 1e-12);
});

test("definite integral rejects a free variable when a constant is required", () => {
  const expression = polynomial([
    { coefficient: 1, xPower: 1, yPower: 1 },
  ]);

  assert.throws(
    () => definiteIntegral(expression, 0, 1, "x"),
    /expression still depends on y/,
  );
  assert.throws(
    () => definiteIntegral(exponential(1), 0, 1, "y"),
    /exponential terms still depend on x/,
  );
});
