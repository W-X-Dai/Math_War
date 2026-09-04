const EPSILON = 1e-12;
const MAX_FRACTION_DENOMINATOR = 1_000;

function isApproximatelyZero(value) {
  return Math.abs(value) <= EPSILON;
}

function assertFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
}

function assertPower(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative integer`);
  }
}

function toRawExpression(expression) {
  if (typeof expression === "number") {
    return {
      terms: [{ coefficient: expression, xPower: 0, yPower: 0 }],
      exponentials: [],
    };
  }

  if (Array.isArray(expression)) {
    return { terms: expression, exponentials: [] };
  }

  if (!expression || typeof expression !== "object") {
    throw new TypeError("expression must be an expression object");
  }

  return {
    terms: expression.terms ?? expression.polynomialTerms ?? [],
    exponentials:
      expression.exponentials ?? expression.exponentialTerms ?? [],
  };
}

function normalizeTerm(rawTerm) {
  if (typeof rawTerm === "number") {
    return { coefficient: rawTerm, xPower: 0, yPower: 0 };
  }

  if (!rawTerm || typeof rawTerm !== "object") {
    throw new TypeError("polynomial terms must be numbers or term objects");
  }

  const coefficient = rawTerm.coefficient ?? rawTerm.coeff ?? 1;
  const xPower = rawTerm.xPower ?? rawTerm.x ?? rawTerm.powers?.x ?? 0;
  const yPower = rawTerm.yPower ?? rawTerm.y ?? rawTerm.powers?.y ?? 0;

  assertFiniteNumber(coefficient, "term coefficient");
  assertPower(xPower, "x power");
  assertPower(yPower, "y power");

  return { coefficient, xPower, yPower };
}

function normalizeExponential(rawExponential) {
  if (!rawExponential || typeof rawExponential !== "object") {
    throw new TypeError("exponential terms must be term objects");
  }

  const coefficient = rawExponential.coefficient ?? rawExponential.coeff ?? 1;
  const rate =
    rawExponential.rate ??
    rawExponential.xRate ??
    rawExponential.exponent ??
    1;

  assertFiniteNumber(coefficient, "exponential coefficient");
  assertFiniteNumber(rate, "exponential rate");

  return { coefficient, rate };
}

function comparePolynomialTerms(left, right) {
  const totalDegreeDifference =
    right.xPower + right.yPower - (left.xPower + left.yPower);

  if (totalDegreeDifference !== 0) {
    return totalDegreeDifference;
  }

  if (left.xPower !== right.xPower) {
    return right.xPower - left.xPower;
  }

  return right.yPower - left.yPower;
}

/**
 * Convert supported input shapes into the canonical immutable-by-convention shape:
 * { type: "expression", terms, exponentials }.
 */
export function normalizeExpression(expression) {
  const rawExpression = toRawExpression(expression);
  let rawTerms = rawExpression.terms;

  if (!Array.isArray(rawTerms)) {
    rawTerms = [rawTerms];
  }

  // A numeric array is a coefficient vector ordered from x^0 upwards.
  if (rawTerms.length > 0 && rawTerms.every((term) => typeof term === "number")) {
    rawTerms = rawTerms.map((coefficient, xPower) => ({
      coefficient,
      xPower,
      yPower: 0,
    }));
  }

  const polynomialMap = new Map();
  for (const rawTerm of rawTerms) {
    const term = normalizeTerm(rawTerm);
    const key = `${term.xPower}:${term.yPower}`;
    polynomialMap.set(key, (polynomialMap.get(key) ?? 0) + term.coefficient);
  }

  let rawExponentials = rawExpression.exponentials;
  if (!Array.isArray(rawExponentials)) {
    rawExponentials = [rawExponentials];
  }

  const exponentialMap = new Map();
  for (const rawExponential of rawExponentials) {
    const term = normalizeExponential(rawExponential);

    // e^(0x) is a polynomial constant and should combine with a constant term.
    if (isApproximatelyZero(term.rate)) {
      const constantKey = "0:0";
      polynomialMap.set(
        constantKey,
        (polynomialMap.get(constantKey) ?? 0) + term.coefficient,
      );
      continue;
    }

    const key = String(term.rate);
    exponentialMap.set(
      key,
      (exponentialMap.get(key) ?? 0) + term.coefficient,
    );
  }

  const terms = [];
  for (const [key, coefficient] of polynomialMap) {
    if (isApproximatelyZero(coefficient)) {
      continue;
    }

    const [xPower, yPower] = key.split(":").map(Number);
    terms.push({ coefficient, xPower, yPower });
  }
  terms.sort(comparePolynomialTerms);

  const exponentials = [];
  for (const [key, coefficient] of exponentialMap) {
    if (!isApproximatelyZero(coefficient)) {
      exponentials.push({ coefficient, rate: Number(key) });
    }
  }
  exponentials.sort((left, right) => right.rate - left.rate);

  return { type: "expression", terms, exponentials };
}

export function polynomial(terms = []) {
  if (terms && !Array.isArray(terms) && typeof terms === "object") {
    if ("terms" in terms || "polynomialTerms" in terms) {
      return normalizeExpression({
        terms: terms.terms ?? terms.polynomialTerms,
        exponentials: [],
      });
    }

    return normalizeExpression({ terms: [terms], exponentials: [] });
  }

  return normalizeExpression({ terms, exponentials: [] });
}

/** Create coefficient * e^(rate*x). */
export function exponential(rate = 1, coefficient = 1) {
  if (rate && typeof rate === "object") {
    coefficient = rate.coefficient ?? rate.coeff ?? 1;
    rate = rate.rate ?? rate.xRate ?? rate.exponent ?? 1;
  }

  return normalizeExpression({
    terms: [],
    exponentials: [{ coefficient, rate }],
  });
}

export function cloneExpression(expression) {
  const normalized = normalizeExpression(expression);
  return {
    type: "expression",
    terms: normalized.terms.map((term) => ({ ...term })),
    exponentials: normalized.exponentials.map((term) => ({ ...term })),
  };
}

function differentiationOptions(variableOrOptions, times) {
  if (variableOrOptions && typeof variableOrOptions === "object") {
    return {
      variable: variableOrOptions.variable ?? "x",
      times: variableOrOptions.times ?? 1,
    };
  }

  return { variable: variableOrOptions ?? "x", times: times ?? 1 };
}

export function differentiate(
  expression,
  variableOrOptions = "x",
  requestedTimes = 1,
) {
  const { variable, times } = differentiationOptions(
    variableOrOptions,
    requestedTimes,
  );

  if (variable !== "x" && variable !== "y") {
    throw new RangeError('differentiate variable must be "x" or "y"');
  }
  if (!Number.isInteger(times) || times < 0) {
    throw new RangeError("differentiate times must be a non-negative integer");
  }

  let result = normalizeExpression(expression);
  for (let index = 0; index < times && !isZero(result); index += 1) {
    const powerKey = variable === "x" ? "xPower" : "yPower";
    const terms = result.terms
      .filter((term) => term[powerKey] > 0)
      .map((term) => ({
        ...term,
        coefficient: term.coefficient * term[powerKey],
        [powerKey]: term[powerKey] - 1,
      }));

    const exponentials =
      variable === "x"
        ? result.exponentials.map((term) => ({
            ...term,
            coefficient: term.coefficient * term.rate,
          }))
        : [];

    result = normalizeExpression({ terms, exponentials });
  }

  return result;
}

export function subtractConstant(expression, amount = 10) {
  assertFiniteNumber(amount, "subtracted constant");
  const normalized = normalizeExpression(expression);

  return normalizeExpression({
    terms: [
      ...normalized.terms,
      { coefficient: -amount, xPower: 0, yPower: 0 },
    ],
    exponentials: normalized.exponentials,
  });
}

function integrationConstant(constantOrOptions) {
  if (constantOrOptions && typeof constantOrOptions === "object") {
    if (
      constantOrOptions.variable !== undefined &&
      constantOrOptions.variable !== "x"
    ) {
      throw new RangeError("integrate currently supports integration in x only");
    }
    return constantOrOptions.constant ?? constantOrOptions.C ?? 0;
  }

  return constantOrOptions ?? 0;
}

export function integrate(expression, constantOrOptions = 0) {
  const constant = integrationConstant(constantOrOptions);
  assertFiniteNumber(constant, "integration constant");

  const normalized = normalizeExpression(expression);
  const terms = normalized.terms.map((term) => ({
    coefficient: term.coefficient / (term.xPower + 1),
    xPower: term.xPower + 1,
    yPower: term.yPower,
  }));

  if (!isApproximatelyZero(constant)) {
    terms.push({ coefficient: constant, xPower: 0, yPower: 0 });
  }

  const exponentials = normalized.exponentials.map((term) => ({
    coefficient: term.coefficient / term.rate,
    rate: term.rate,
  }));

  return normalizeExpression({ terms, exponentials });
}

/** Compose the expression with x -> -x. */
export function reflectInput(expression) {
  const normalized = normalizeExpression(expression);

  return normalizeExpression({
    terms: normalized.terms.map((term) => ({
      ...term,
      coefficient:
        term.xPower % 2 === 0 ? term.coefficient : -term.coefficient,
    })),
    exponentials: normalized.exponentials.map((term) => ({
      coefficient: term.coefficient,
      rate: -term.rate,
    })),
  });
}

/**
 * Compute x -> +Infinity for the supported basis. A finite result is another
 * expression (possibly still containing y); divergence reports its direction.
 */
export function limitAtInfinity(expression) {
  const normalized = normalizeExpression(expression);
  const growingExponentials = normalized.exponentials.filter(
    (term) => term.rate > 0,
  );

  if (growingExponentials.length > 0) {
    const dominant = growingExponentials[0];
    return {
      status: "divergent",
      direction: dominant.coefficient > 0 ? 1 : -1,
    };
  }

  const xDependentTerms = normalized.terms.filter((term) => term.xPower > 0);
  if (xDependentTerms.length > 0) {
    const highestXPower = Math.max(...xDependentTerms.map((term) => term.xPower));
    const leadingTerms = xDependentTerms.filter(
      (term) => term.xPower === highestXPower,
    );
    const scalarLeadingTerm =
      leadingTerms.length === 1 && leadingTerms[0].yPower === 0
        ? leadingTerms[0]
        : null;

    return {
      status: "divergent",
      direction: scalarLeadingTerm
        ? scalarLeadingTerm.coefficient > 0
          ? 1
          : -1
        : null,
    };
  }

  // Decaying exponentials vanish. Terms independent of x survive intact.
  return {
    status: "finite",
    expression: normalizeExpression({
      terms: normalized.terms,
      exponentials: [],
    }),
  };
}

export function damage(expression) {
  const normalized = normalizeExpression(expression);
  const polynomialDamage = normalized.terms.reduce(
    (total, term) => total + Math.abs(term.coefficient),
    0,
  );
  const exponentialDamage = normalized.exponentials.reduce(
    (total, term) => total + Math.abs(term.coefficient),
    0,
  );

  return polynomialDamage + exponentialDamage;
}

/** Evaluate every supported term at a numeric point. */
export function evaluateAt(expression, x, y = 0) {
  assertFiniteNumber(x, "x value");
  assertFiniteNumber(y, "y value");

  const normalized = normalizeExpression(expression);
  const polynomialValue = normalized.terms.reduce(
    (total, term) =>
      total +
      term.coefficient *
        x ** term.xPower *
        y ** term.yPower,
    0,
  );
  const exponentialValue = normalized.exponentials.reduce(
    (total, term) =>
      total + term.coefficient * Math.exp(term.rate * x),
    0,
  );
  const result = polynomialValue + exponentialValue;

  if (!Number.isFinite(result)) {
    throw new RangeError("expression evaluation produced a non-finite result");
  }

  return result;
}

/**
 * Integrate over a numeric interval and return the result as a constant
 * expression. Expressions that would leave the other variable free are
 * rejected instead of silently substituting a value for it.
 */
export function definiteIntegral(
  expression,
  lower,
  upper,
  variable = "x",
) {
  assertFiniteNumber(lower, "lower integration bound");
  assertFiniteNumber(upper, "upper integration bound");
  if (variable !== "x" && variable !== "y") {
    throw new RangeError('integration variable must be "x" or "y"');
  }

  const normalized = normalizeExpression(expression);
  const otherPowerKey = variable === "x" ? "yPower" : "xPower";
  if (normalized.terms.some((term) => term[otherPowerKey] > 0)) {
    throw new RangeError(
      `cannot return a constant: expression still depends on ${
        variable === "x" ? "y" : "x"
      } after integrating in ${variable}`,
    );
  }
  if (variable === "y" && normalized.exponentials.length > 0) {
    throw new RangeError(
      "cannot return a constant: exponential terms still depend on x after integrating in y",
    );
  }

  const powerKey = variable === "x" ? "xPower" : "yPower";
  let value = normalized.terms.reduce((total, term) => {
    const integratedPower = term[powerKey] + 1;
    return (
      total +
      (term.coefficient / integratedPower) *
        (upper ** integratedPower - lower ** integratedPower)
    );
  }, 0);

  if (variable === "x") {
    value += normalized.exponentials.reduce(
      (total, term) =>
        total +
        (term.coefficient / term.rate) *
          (Math.exp(term.rate * upper) - Math.exp(term.rate * lower)),
      0,
    );
  }

  if (!Number.isFinite(value)) {
    throw new RangeError("definite integral produced a non-finite result");
  }

  return polynomial(value);
}

export function isZero(expression) {
  const normalized = normalizeExpression(expression);
  return normalized.terms.length === 0 && normalized.exponentials.length === 0;
}

function greatestCommonDivisor(left, right) {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) {
    [a, b] = [b, a % b];
  }
  return a;
}

function simpleFraction(value) {
  const absoluteValue = Math.abs(value);
  const roundedInteger = Math.round(absoluteValue);
  if (Math.abs(absoluteValue - roundedInteger) <= EPSILON) {
    return String(roundedInteger);
  }

  for (let denominator = 2; denominator <= MAX_FRACTION_DENOMINATOR; denominator += 1) {
    const numerator = Math.round(absoluteValue * denominator);
    const tolerance = EPSILON * Math.max(1, absoluteValue);
    if (Math.abs(absoluteValue - numerator / denominator) <= tolerance) {
      const divisor = greatestCommonDivisor(numerator, denominator);
      return `${numerator / divisor}/${denominator / divisor}`;
    }
  }

  return String(Number(absoluteValue.toPrecision(10)));
}

function polynomialBody(term) {
  let body = "";
  if (term.xPower > 0) {
    body += term.xPower === 1 ? "x" : `x^${term.xPower}`;
  }
  if (term.yPower > 0) {
    body += term.yPower === 1 ? "y" : `y^${term.yPower}`;
  }
  return body;
}

function exponentialBody(rate) {
  if (rate === 1) {
    return "e^x";
  }
  if (rate === -1) {
    return "e^-x";
  }
  return `e^(${simpleFraction(rate)}x)`;
}

function formatSignedTerms(displayTerms) {
  if (displayTerms.length === 0) {
    return "0";
  }

  return displayTerms
    .map(({ coefficient, body }, index) => {
      const negative = coefficient < 0;
      const magnitude = Math.abs(coefficient);
      const coefficientText =
        body && Math.abs(magnitude - 1) <= EPSILON
          ? ""
          : simpleFraction(magnitude);
      const unsignedTerm = `${coefficientText}${body}`;

      if (index === 0) {
        return negative ? `-${unsignedTerm}` : unsignedTerm;
      }
      return negative ? ` - ${unsignedTerm}` : ` + ${unsignedTerm}`;
    })
    .join("");
}

export function formatExpression(expression) {
  const normalized = normalizeExpression(expression);
  const displayTerms = [
    ...normalized.exponentials.map((term) => ({
      coefficient: term.coefficient,
      body: exponentialBody(term.rate),
    })),
    ...normalized.terms.map((term) => ({
      coefficient: term.coefficient,
      body: polynomialBody(term),
    })),
  ];

  return formatSignedTerms(displayTerms);
}
