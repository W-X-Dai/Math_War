import test from "node:test";
import assert from "node:assert/strict";

import {
  addConstant,
  addExpressions,
  cloneExpression,
  damage,
  definiteIntegral,
  divideExpression,
  differentiate,
  exponential,
  evaluateAt,
  formatExpression,
  integrate,
  isEulerCompatible,
  isZero,
  limitAtInfinity,
  logarithm,
  multiplyExpression,
  multiplyByX,
  normalizeExpression,
  polynomial,
  reflectInput,
  scaleExpression,
  squareRootExpression,
  substituteX,
  subtractConstant,
  trigonometric,
} from "../src/domain/expression.js";

test("constant arithmetic operators preserve exact expression semantics", () => {
  const monomial = polynomial([{ coefficient: 9, xPower: 4, yPower: 2 }]);

  assert.equal(formatExpression(addConstant(polynomial(-5), 5)), "0");
  assert.equal(formatExpression(multiplyExpression(monomial, -2)), "-18x^4z^2");
  assert.equal(formatExpression(divideExpression(monomial, 3)), "3x^4z^2");
  assert.equal(formatExpression(squareRootExpression(monomial)), "3x^2z");
  assert.equal(formatExpression(squareRootExpression(polynomial(0))), "0");
});

test("heavy arithmetic rejects zero operands and non-representable square roots", () => {
  const constant = polynomial(4);

  assert.throws(() => multiplyExpression(constant, 0), /zero|0/i);
  assert.throws(() => divideExpression(constant, 0), /zero|0/i);
  assert.throws(() => squareRootExpression(polynomial(-4)), /negative|non-negative/i);
  assert.throws(() => squareRootExpression(polynomial(2)), /perfect[- ]square|represent/i);
  assert.throws(
    () => squareRootExpression(polynomial([{ coefficient: 4, xPower: 3, yPower: 0 }])),
    /even|represent/i,
  );
  assert.throws(
    () => squareRootExpression(polynomial([
      { coefficient: 4, xPower: 2, yPower: 0 },
      { coefficient: 1, xPower: 0, yPower: 0 },
    ])),
    /single|monomial|represent/i,
  );
});

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

test("partial differentiation in x and z handles multivariable terms", () => {
  const enemy = polynomial([
    { coefficient: 3, xPower: 2, yPower: 3 },
    { coefficient: 4, xPower: 0, yPower: 1 },
  ]);

  assert.equal(formatExpression(enemy), "3x^2z^3 + 4z");
  assert.equal(formatExpression(differentiate(enemy, "x")), "6xz^3");
  assert.equal(
    formatExpression(differentiate(enemy, { variable: "z", times: 2 })),
    "18x^2z",
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

  assert.equal(formatExpression(expression), "e^-x - 3xz");
  assert.equal(damage(expression), 4);
});

test("cloneExpression does not share mutable term objects", () => {
  const original = polynomial([{ coefficient: 2, xPower: 2, yPower: 1 }]);
  const clone = cloneExpression(original);

  clone.terms[0].coefficient = 99;
  assert.equal(formatExpression(original), "2x^2z");
  assert.equal(formatExpression(clone), "99x^2z");
});

test("a finite limit preserves terms independent of x", () => {
  const expression = normalizeExpression({
    terms: [{ coefficient: 3, xPower: 0, yPower: 2 }],
    exponentials: [{ coefficient: 2, rate: -1 }],
  });
  const limit = limitAtInfinity(expression);

  assert.equal(limit.status, "finite");
  assert.equal(formatExpression(limit.expression), "3z^2");
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

test("substituteX preserves z while f(0) can still annihilate an x factor", () => {
  const xySquared = polynomial([{ coefficient: 1, xPower: 1, yPower: 2 }]);

  assert.equal(formatExpression(substituteX(xySquared, 1)), "z^2");
  assert.equal(formatExpression(substituteX(xySquared, 0)), "0");
  assert.equal(formatExpression(differentiate(xySquared)), "z^2");
  assert.equal(isZero(differentiate(xySquared, "x", 2)), true);
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

test("negative x powers normalize, format, differentiate, and integrate", () => {
  const reciprocal = polynomial([
    { coefficient: 2, xPower: -2 },
    { coefficient: 3, xPower: -1 },
  ]);

  assert.equal(formatExpression(reciprocal), "3x^-1 + 2x^-2");
  assert.equal(formatExpression(differentiate(reciprocal)), "-3x^-2 - 4x^-3");
  assert.equal(formatExpression(integrate(reciprocal)), "3ln|x| - 2x^-1");
  assert.equal(evaluateAt(reciprocal, 2), 2);
  assert.throws(() => evaluateAt(reciprocal, 0), /singular at x = 0/);
});

test("trigonometric terms support normalization, calculus, reflection, and format", () => {
  const expression = addExpressions(
    trigonometric("sin", -2, 3),
    trigonometric("cos", 2, 4),
  );

  assert.equal(formatExpression(expression), "4cos(2x) - 3sin(2x)");
  assert.equal(
    formatExpression(differentiate(expression)),
    "-6cos(2x) - 8sin(2x)",
  );
  assert.equal(
    formatExpression(integrate(expression)),
    "3/2cos(2x) + 2sin(2x)",
  );
  assert.equal(formatExpression(reflectInput(expression)), "4cos(2x) + 3sin(2x)");
  assert.ok(Math.abs(evaluateAt(expression, Math.PI / 4) + 3) < 1e-12);
  assert.deepEqual(limitAtInfinity(expression), { status: "oscillating" });
});

test("zero-rate trig and exponential terms collapse into polynomial constants", () => {
  const expression = normalizeExpression({
    exponentials: [{ coefficient: 2, rate: 0 }],
    trigTerms: [
      { kind: "cos", coefficient: 3, rate: 0 },
      { kind: "sin", coefficient: 99, rate: 0 },
    ],
  });

  assert.equal(formatExpression(expression), "5");
  assert.equal(damage(expression), 5);
});

test("logarithmic terms support product-rule differentiation and integration", () => {
  const expression = logarithm(6, 2);
  const derivative = differentiate(expression);
  const primitive = integrate(expression);

  assert.equal(formatExpression(expression), "6x^2ln|x|");
  assert.equal(formatExpression(derivative), "12xln|x| + 6x");
  assert.equal(formatExpression(primitive), "2x^3ln|x| - 2/3x^3");
  assert.equal(formatExpression(differentiate(primitive)), "6x^2ln|x|");
  assert.equal(formatExpression(differentiate(logarithm(1))), "x^-1");
  assert.equal(formatExpression(integrate(polynomial({ xPower: -1 }))), "ln|x|");
});

test("unsupported logarithmic antiderivatives fail explicitly", () => {
  assert.throws(
    () => integrate(logarithm(1, -1)),
    /outside the supported basis/,
  );
  assert.throws(
    () => integrate(polynomial({ coefficient: 1, xPower: -1, yPower: 1 })),
    /outside the supported basis/,
  );
});

test("logarithmic reflection follows x-power parity", () => {
  const expression = addExpressions(logarithm(2, 1), logarithm(3, -2));
  assert.equal(
    formatExpression(reflectInput(expression)),
    "-2xln|x| + 3x^-2ln|x|",
  );
});

test("limits discard reciprocal and decaying-log terms", () => {
  const expression = addExpressions(
    polynomial([
      { coefficient: 8, xPower: -2 },
      { coefficient: 4, xPower: 0 },
    ]),
    logarithm(3, -1),
    exponential(-1, 2),
  );
  const result = limitAtInfinity(expression);

  assert.equal(result.status, "finite");
  assert.equal(formatExpression(result.expression), "4");
});

test("limits classify growing logarithms by their dominant coefficient", () => {
  assert.deepEqual(limitAtInfinity(logarithm(-2, 0)), {
    status: "divergent",
    direction: -1,
  });
  assert.deepEqual(
    limitAtInfinity(addExpressions(polynomial({ xPower: 2 }), logarithm(2, 2))),
    { status: "divergent", direction: 1 },
  );
});

test("definite integration supports trig, reciprocal, and logarithmic terms", () => {
  const sineArea = definiteIntegral(trigonometric("sin", 1), 0, Math.PI);
  const reciprocalArea = definiteIntegral(
    polynomial({ coefficient: 2, xPower: -1 }),
    1,
    Math.E,
  );
  const logarithmicArea = definiteIntegral(logarithm(1), 1, Math.E);

  assert.ok(Math.abs(evaluateAt(sineArea, 0) - 2) < 1e-12);
  assert.ok(Math.abs(evaluateAt(reciprocalArea, 0) - 2) < 1e-12);
  assert.ok(Math.abs(evaluateAt(logarithmicArea, 0) - 1) < 1e-12);
});

test("definite integration rejects singular intervals crossing or touching zero", () => {
  const reciprocal = polynomial({ coefficient: 1, xPower: -1 });
  for (const bounds of [[-1, 1], [0, 1], [-1, 0], [1, -1]]) {
    assert.throws(
      () => definiteIntegral(reciprocal, ...bounds),
      /crosses or touches the singularity at x = 0/,
    );
  }
  assert.throws(
    () => definiteIntegral(logarithm(1), -1, 1),
    /crosses or touches the singularity at x = 0/,
  );
});

test("composition helpers preserve all supported basis terms", () => {
  const expression = addExpressions(
    polynomial({ coefficient: 2, xPower: -1 }),
    exponential(-1, 3),
    trigonometric("cos", 2, 4),
    logarithm(5, 1),
  );
  const scaled = scaleExpression(expression, -2);

  assert.equal(
    formatExpression(scaled),
    "-6e^-x - 8cos(2x) - 10xln|x| - 4x^-1",
  );
  assert.equal(damage(expression), 14);
  assert.equal(damage(scaled), 28);
});

test("multiplyByX and Euler compatibility enforce the closed symbolic basis", () => {
  const compatible = addExpressions(
    polynomial({ coefficient: 2, xPower: -1 }),
    logarithm(3, 0),
  );

  assert.equal(isEulerCompatible(compatible), true);
  assert.equal(formatExpression(multiplyByX(compatible)), "3xln|x| + 2");
  assert.equal(isEulerCompatible(exponential(1)), false);
  assert.equal(isEulerCompatible(trigonometric("sin")), false);
  assert.throws(() => multiplyByX(exponential(1)), /not closed/);
  assert.throws(() => multiplyByX(trigonometric("sin")), /not closed/);
});

test("floating-point equivalent basis terms merge deterministically", () => {
  const expression = normalizeExpression({
    trigTerms: [
      { kind: "sin", rate: 0.1 + 0.2, coefficient: 1 },
      { kind: "sin", rate: 0.3, coefficient: 2 },
    ],
    logTerms: [
      { xPower: -1, coefficient: 0.1 + 0.2 },
      { xPower: -1, coefficient: -0.3 },
    ],
  });

  assert.deepEqual(expression.trigTerms, [
    { kind: "sin", rate: 0.3, coefficient: 3 },
  ]);
  assert.deepEqual(expression.logTerms, []);
});

test("clone and zero detection include trig and logarithmic arrays", () => {
  const original = addExpressions(trigonometric("sin", 2, 3), logarithm(4, -1));
  const clone = cloneExpression(original);

  clone.trigTerms[0].coefficient = 100;
  clone.logTerms[0].coefficient = 200;
  assert.equal(formatExpression(original), "3sin(2x) + 4x^-1ln|x|");
  assert.equal(isZero(scaleExpression(original, 0)), true);
});
