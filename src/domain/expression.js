const EPSILON = 1e-12;
const MAX_FRACTION_DENOMINATOR = 1_000;

function isApproximatelyZero(value) {
  return Math.abs(value) <= EPSILON;
}

// Symbolic operations frequently create values such as 0.30000000000000004.
// Canonicalising to fourteen significant digits lets equal basis terms merge.
function canonicalNumber(value) {
  if (isApproximatelyZero(value)) return 0;
  return Number(value.toPrecision(14));
}

function assertFiniteNumber(value, label) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(`${label} must be a finite number`);
  }
}

function assertInteger(value, label) {
  if (!Number.isInteger(value)) throw new TypeError(`${label} must be an integer`);
}

function assertNonNegativePower(value, label) {
  if (!Number.isInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative integer`);
  }
}

function emptyRawExpression() {
  return { terms: [], exponentials: [], trigTerms: [], logTerms: [] };
}

function toRawExpression(expression) {
  if (typeof expression === "number") {
    return {
      ...emptyRawExpression(),
      terms: [{ coefficient: expression, xPower: 0, yPower: 0 }],
    };
  }
  if (Array.isArray(expression)) {
    return { ...emptyRawExpression(), terms: expression };
  }
  if (!expression || typeof expression !== "object") {
    throw new TypeError("expression must be an expression object");
  }
  return {
    terms: expression.terms ?? expression.polynomialTerms ?? [],
    exponentials: expression.exponentials ?? expression.exponentialTerms ?? [],
    trigTerms: expression.trigTerms ?? expression.trigonometricTerms ?? [],
    logTerms: expression.logTerms ?? expression.logarithmicTerms ?? [],
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
  assertInteger(xPower, "x power");
  assertNonNegativePower(yPower, "y power");
  return { coefficient: canonicalNumber(coefficient), xPower, yPower };
}

function normalizeExponential(rawTerm) {
  if (!rawTerm || typeof rawTerm !== "object") {
    throw new TypeError("exponential terms must be term objects");
  }
  const coefficient = rawTerm.coefficient ?? rawTerm.coeff ?? 1;
  const rate = rawTerm.rate ?? rawTerm.xRate ?? rawTerm.exponent ?? 1;
  assertFiniteNumber(coefficient, "exponential coefficient");
  assertFiniteNumber(rate, "exponential rate");
  return {
    coefficient: canonicalNumber(coefficient),
    rate: canonicalNumber(rate),
  };
}

function normalizeTrigonometric(rawTerm) {
  if (!rawTerm || typeof rawTerm !== "object") {
    throw new TypeError("trigonometric terms must be term objects");
  }
  const kind = rawTerm.kind ?? rawTerm.function ?? rawTerm.type;
  let coefficient = rawTerm.coefficient ?? rawTerm.coeff ?? 1;
  let rate = rawTerm.rate ?? rawTerm.xRate ?? rawTerm.frequency ?? 1;
  if (kind !== "sin" && kind !== "cos") {
    throw new TypeError('trigonometric kind must be "sin" or "cos"');
  }
  assertFiniteNumber(coefficient, "trigonometric coefficient");
  assertFiniteNumber(rate, "trigonometric rate");
  coefficient = canonicalNumber(coefficient);
  rate = canonicalNumber(rate);
  if (rate < 0) {
    rate = -rate;
    if (kind === "sin") coefficient = -coefficient;
  }
  return { kind, coefficient: canonicalNumber(coefficient), rate };
}

function normalizeLogarithm(rawTerm) {
  if (!rawTerm || typeof rawTerm !== "object") {
    throw new TypeError("logarithmic terms must be term objects");
  }
  const coefficient = rawTerm.coefficient ?? rawTerm.coeff ?? 1;
  const xPower = rawTerm.xPower ?? rawTerm.x ?? rawTerm.power ?? 0;
  assertFiniteNumber(coefficient, "logarithmic coefficient");
  assertInteger(xPower, "logarithmic x power");
  return { coefficient: canonicalNumber(coefficient), xPower };
}

function comparePolynomialTerms(left, right) {
  const degreeDifference =
    right.xPower + right.yPower - (left.xPower + left.yPower);
  return degreeDifference || right.xPower - left.xPower || right.yPower - left.yPower;
}

function combineTerms(rawTerms, normalize, keyFor) {
  const combined = new Map();
  for (const rawTerm of rawTerms) {
    const term = normalize(rawTerm);
    const key = keyFor(term);
    const previous = combined.get(key);
    combined.set(key, {
      ...term,
      coefficient: canonicalNumber((previous?.coefficient ?? 0) + term.coefficient),
    });
  }
  return [...combined.values()].filter(
    (term) => !isApproximatelyZero(term.coefficient),
  );
}

/** Convert all supported inputs into the canonical expression shape. */
export function normalizeExpression(expression) {
  const rawExpression = toRawExpression(expression);
  let rawTerms = rawExpression.terms;
  if (!Array.isArray(rawTerms)) rawTerms = [rawTerms];
  if (rawTerms.length > 0 && rawTerms.every((term) => typeof term === "number")) {
    rawTerms = rawTerms.map((coefficient, xPower) => ({
      coefficient,
      xPower,
      yPower: 0,
    }));
  }

  const terms = combineTerms(
    rawTerms,
    normalizeTerm,
    (term) => `${term.xPower}:${term.yPower}`,
  );
  const rawExponentials = Array.isArray(rawExpression.exponentials)
    ? rawExpression.exponentials
    : [rawExpression.exponentials];
  const exponentials = [];
  for (const term of combineTerms(
    rawExponentials,
    normalizeExponential,
    (entry) => String(entry.rate),
  )) {
    if (isApproximatelyZero(term.rate)) {
      terms.push({ coefficient: term.coefficient, xPower: 0, yPower: 0 });
    } else {
      exponentials.push(term);
    }
  }

  const rawTrigTerms = Array.isArray(rawExpression.trigTerms)
    ? rawExpression.trigTerms
    : [rawExpression.trigTerms];
  const trigTerms = [];
  for (const term of combineTerms(
    rawTrigTerms,
    normalizeTrigonometric,
    (entry) => `${entry.kind}:${entry.rate}`,
  )) {
    if (isApproximatelyZero(term.rate)) {
      if (term.kind === "cos") {
        terms.push({ coefficient: term.coefficient, xPower: 0, yPower: 0 });
      }
    } else {
      trigTerms.push(term);
    }
  }

  const rawLogTerms = Array.isArray(rawExpression.logTerms)
    ? rawExpression.logTerms
    : [rawExpression.logTerms];
  const logTerms = combineTerms(
    rawLogTerms,
    normalizeLogarithm,
    (term) => String(term.xPower),
  );

  const finalTerms = combineTerms(
    terms,
    normalizeTerm,
    (term) => `${term.xPower}:${term.yPower}`,
  ).sort(comparePolynomialTerms);
  exponentials.sort((left, right) => right.rate - left.rate);
  trigTerms.sort(
    (left, right) => left.kind.localeCompare(right.kind) || right.rate - left.rate,
  );
  logTerms.sort((left, right) => right.xPower - left.xPower);
  return { type: "expression", terms: finalTerms, exponentials, trigTerms, logTerms };
}

export function polynomial(terms = []) {
  if (terms && !Array.isArray(terms) && typeof terms === "object") {
    if ("terms" in terms || "polynomialTerms" in terms) {
      return normalizeExpression({ terms: terms.terms ?? terms.polynomialTerms });
    }
    return normalizeExpression({ terms: [terms] });
  }
  return normalizeExpression({ terms });
}

/** Create coefficient * e^(rate*x). */
export function exponential(rate = 1, coefficient = 1) {
  if (rate && typeof rate === "object") {
    coefficient = rate.coefficient ?? rate.coeff ?? 1;
    rate = rate.rate ?? rate.xRate ?? rate.exponent ?? 1;
  }
  return normalizeExpression({ exponentials: [{ coefficient, rate }] });
}

/** Create coefficient * sin(rate*x) or coefficient * cos(rate*x). */
export function trigonometric(kind, rate = 1, coefficient = 1) {
  return normalizeExpression({ trigTerms: [{ kind, rate, coefficient }] });
}

/** Create coefficient * x^xPower * ln|x|. */
export function logarithm(coefficient = 1, xPower = 0) {
  if (coefficient && typeof coefficient === "object") {
    xPower = coefficient.xPower ?? coefficient.x ?? coefficient.power ?? 0;
    coefficient = coefficient.coefficient ?? coefficient.coeff ?? 1;
  }
  return normalizeExpression({ logTerms: [{ coefficient, xPower }] });
}

export function addExpressions(...expressions) {
  return normalizeExpression(
    expressions.reduce((combined, expression) => {
      const normalized = normalizeExpression(expression);
      combined.terms.push(...normalized.terms);
      combined.exponentials.push(...normalized.exponentials);
      combined.trigTerms.push(...normalized.trigTerms);
      combined.logTerms.push(...normalized.logTerms);
      return combined;
    }, emptyRawExpression()),
  );
}

export function scaleExpression(expression, factor) {
  assertFiniteNumber(factor, "scale factor");
  const normalized = normalizeExpression(expression);
  const scale = (term) => ({
    ...term,
    coefficient: canonicalNumber(term.coefficient * factor),
  });
  return normalizeExpression({
    terms: normalized.terms.map(scale),
    exponentials: normalized.exponentials.map(scale),
    trigTerms: normalized.trigTerms.map(scale),
    logTerms: normalized.logTerms.map(scale),
  });
}

export function multiplyByX(expression) {
  const normalized = normalizeExpression(expression);
  if (normalized.exponentials.length > 0 || normalized.trigTerms.length > 0) {
    throw new RangeError(
      "multiplication by x is not closed for exponential or trigonometric terms",
    );
  }
  return normalizeExpression({
    terms: normalized.terms.map((term) => ({ ...term, xPower: term.xPower + 1 })),
    logTerms: normalized.logTerms.map((term) => ({
      ...term,
      xPower: term.xPower + 1,
    })),
  });
}

export function isEulerCompatible(expression) {
  const normalized = normalizeExpression(expression);
  return normalized.exponentials.length === 0 && normalized.trigTerms.length === 0;
}

export function cloneExpression(expression) {
  const normalized = normalizeExpression(expression);
  return {
    type: "expression",
    terms: normalized.terms.map((term) => ({ ...term })),
    exponentials: normalized.exponentials.map((term) => ({ ...term })),
    trigTerms: normalized.trigTerms.map((term) => ({ ...term })),
    logTerms: normalized.logTerms.map((term) => ({ ...term })),
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

export function differentiate(expression, variableOrOptions = "x", requestedTimes = 1) {
  const { variable, times } = differentiationOptions(variableOrOptions, requestedTimes);
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
      .filter((term) => term[powerKey] !== 0)
      .map((term) => ({
        ...term,
        coefficient: term.coefficient * term[powerKey],
        [powerKey]: term[powerKey] - 1,
      }));
    const exponentials = variable === "x"
      ? result.exponentials.map((term) => ({
          ...term,
          coefficient: term.coefficient * term.rate,
        }))
      : [];
    const trigTerms = variable === "x"
      ? result.trigTerms.map((term) => ({
          kind: term.kind === "sin" ? "cos" : "sin",
          rate: term.rate,
          coefficient:
            term.coefficient * term.rate * (term.kind === "cos" ? -1 : 1),
        }))
      : [];
    const logTerms = variable === "x"
      ? result.logTerms
          .filter((term) => term.xPower !== 0)
          .map((term) => ({
            ...term,
            coefficient: term.coefficient * term.xPower,
            xPower: term.xPower - 1,
          }))
      : [];
    if (variable === "x") {
      terms.push(...result.logTerms.map((term) => ({
        coefficient: term.coefficient,
        xPower: term.xPower - 1,
        yPower: 0,
      })));
    }
    result = normalizeExpression({ terms, exponentials, trigTerms, logTerms });
  }
  return result;
}

export function subtractConstant(expression, amount = 10) {
  assertFiniteNumber(amount, "subtracted constant");
  return addExpressions(expression, polynomial(-amount));
}

function integrationConstant(constantOrOptions) {
  if (constantOrOptions && typeof constantOrOptions === "object") {
    if (constantOrOptions.variable !== undefined && constantOrOptions.variable !== "x") {
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
  const terms = [];
  const logTerms = [];
  for (const term of normalized.terms) {
    if (term.xPower === -1) {
      if (term.yPower !== 0) {
        throw new RangeError(
          "antiderivative of x^-1 with a y factor is outside the supported basis",
        );
      }
      logTerms.push({ coefficient: term.coefficient, xPower: 0 });
    } else {
      terms.push({
        coefficient: term.coefficient / (term.xPower + 1),
        xPower: term.xPower + 1,
        yPower: term.yPower,
      });
    }
  }
  for (const term of normalized.logTerms) {
    if (term.xPower === -1) {
      throw new RangeError(
        "antiderivative of x^-1 ln|x| is outside the supported basis",
      );
    }
    const nextPower = term.xPower + 1;
    logTerms.push({ coefficient: term.coefficient / nextPower, xPower: nextPower });
    terms.push({
      coefficient: -term.coefficient / nextPower ** 2,
      xPower: nextPower,
      yPower: 0,
    });
  }
  if (!isApproximatelyZero(constant)) {
    terms.push({ coefficient: constant, xPower: 0, yPower: 0 });
  }
  const exponentials = normalized.exponentials.map((term) => ({
    coefficient: term.coefficient / term.rate,
    rate: term.rate,
  }));
  const trigTerms = normalized.trigTerms.map((term) => ({
    kind: term.kind === "sin" ? "cos" : "sin",
    rate: term.rate,
    coefficient:
      (term.coefficient / term.rate) * (term.kind === "sin" ? -1 : 1),
  }));
  return normalizeExpression({ terms, exponentials, trigTerms, logTerms });
}

/** Compose the expression with x -> -x. */
export function reflectInput(expression) {
  const normalized = normalizeExpression(expression);
  return normalizeExpression({
    terms: normalized.terms.map((term) => ({
      ...term,
      coefficient: term.xPower % 2 === 0 ? term.coefficient : -term.coefficient,
    })),
    exponentials: normalized.exponentials.map((term) => ({
      coefficient: term.coefficient,
      rate: -term.rate,
    })),
    trigTerms: normalized.trigTerms.map((term) => ({
      ...term,
      coefficient: term.kind === "sin" ? -term.coefficient : term.coefficient,
    })),
    logTerms: normalized.logTerms.map((term) => ({
      ...term,
      coefficient: term.xPower % 2 === 0 ? term.coefficient : -term.coefficient,
    })),
  });
}

/** Compute x -> +Infinity for every supported basis. */
export function limitAtInfinity(expression) {
  const normalized = normalizeExpression(expression);
  const growingExponentials = normalized.exponentials.filter((term) => term.rate > 0);
  if (growingExponentials.length > 0) {
    const dominant = growingExponentials[0];
    return { status: "divergent", direction: dominant.coefficient > 0 ? 1 : -1 };
  }

  const growingTerms = normalized.terms.filter((term) => term.xPower > 0);
  const growingLogs = normalized.logTerms.filter((term) => term.xPower >= 0);
  if (growingTerms.length > 0 || growingLogs.length > 0) {
    const highestPolynomialPower = growingTerms.length
      ? Math.max(...growingTerms.map((term) => term.xPower))
      : -Infinity;
    const highestLogPower = growingLogs.length
      ? Math.max(...growingLogs.map((term) => term.xPower))
      : -Infinity;
    // x^p ln(x) dominates x^p at equal powers.
    if (highestLogPower >= highestPolynomialPower) {
      const leading = growingLogs.filter((term) => term.xPower === highestLogPower);
      const coefficient = leading.reduce((sum, term) => sum + term.coefficient, 0);
      return {
        status: "divergent",
        direction: isApproximatelyZero(coefficient)
          ? null
          : coefficient > 0
            ? 1
            : -1,
      };
    }
    const leading = growingTerms.filter((term) => term.xPower === highestPolynomialPower);
    const scalar = leading.length === 1 && leading[0].yPower === 0 ? leading[0] : null;
    return {
      status: "divergent",
      direction: scalar ? (scalar.coefficient > 0 ? 1 : -1) : null,
    };
  }

  if (normalized.trigTerms.length > 0) return { status: "oscillating" };
  return {
    status: "finite",
    expression: normalizeExpression({
      terms: normalized.terms.filter((term) => term.xPower === 0),
    }),
  };
}

export function damage(expression) {
  const normalized = normalizeExpression(expression);
  return [
    ...normalized.terms,
    ...normalized.exponentials,
    ...normalized.trigTerms,
    ...normalized.logTerms,
  ].reduce((total, term) => total + Math.abs(term.coefficient), 0);
}

function hasXSingularity(expression) {
  return expression.terms.some((term) => term.xPower < 0) ||
    expression.logTerms.length > 0;
}

/** Evaluate every supported term at a numeric point. */
export function evaluateAt(expression, x, y = 0) {
  assertFiniteNumber(x, "x value");
  assertFiniteNumber(y, "y value");
  const normalized = normalizeExpression(expression);
  if (x === 0 && hasXSingularity(normalized)) {
    throw new RangeError("expression is singular at x = 0");
  }
  const polynomialValue = normalized.terms.reduce(
    (total, term) =>
      total + term.coefficient * x ** term.xPower * y ** term.yPower,
    0,
  );
  const exponentialValue = normalized.exponentials.reduce(
    (total, term) => total + term.coefficient * Math.exp(term.rate * x),
    0,
  );
  const trigValue = normalized.trigTerms.reduce(
    (total, term) => total + term.coefficient * Math[term.kind](term.rate * x),
    0,
  );
  const logValue = normalized.logTerms.reduce(
    (total, term) =>
      total + term.coefficient * x ** term.xPower * Math.log(Math.abs(x)),
    0,
  );
  const result = polynomialValue + exponentialValue + trigValue + logValue;
  if (!Number.isFinite(result)) {
    throw new RangeError("expression evaluation produced a non-finite result");
  }
  return result;
}

function intervalTouchesZero(lower, upper) {
  return Math.min(lower, upper) <= 0 && Math.max(lower, upper) >= 0;
}

function logarithmAntiderivativeValue(term, x) {
  if (term.xPower === -1) {
    return (term.coefficient / 2) * Math.log(Math.abs(x)) ** 2;
  }
  const nextPower = term.xPower + 1;
  return term.coefficient * x ** nextPower *
    (Math.log(Math.abs(x)) / nextPower - 1 / nextPower ** 2);
}

/** Integrate over a numeric interval and return a constant expression. */
export function definiteIntegral(expression, lower, upper, variable = "x") {
  assertFiniteNumber(lower, "lower integration bound");
  assertFiniteNumber(upper, "upper integration bound");
  if (variable !== "x" && variable !== "y") {
    throw new RangeError('integration variable must be "x" or "y"');
  }
  const normalized = normalizeExpression(expression);
  if (
    variable === "x" &&
    hasXSingularity(normalized) &&
    intervalTouchesZero(lower, upper)
  ) {
    throw new RangeError(
      "integration interval crosses or touches the singularity at x = 0",
    );
  }
  const otherPowerKey = variable === "x" ? "yPower" : "xPower";
  if (normalized.terms.some((term) => term[otherPowerKey] !== 0)) {
    throw new RangeError(
      `cannot return a constant: expression still depends on ${
        variable === "x" ? "y" : "x"
      } after integrating in ${variable}`,
    );
  }
  if (
    variable === "y" &&
    (normalized.exponentials.length > 0 ||
      normalized.trigTerms.length > 0 ||
      normalized.logTerms.length > 0)
  ) {
    if (
      normalized.exponentials.length > 0 &&
      normalized.trigTerms.length === 0 &&
      normalized.logTerms.length === 0
    ) {
      throw new RangeError(
        "cannot return a constant: exponential terms still depend on x after integrating in y",
      );
    }
    throw new RangeError(
      "cannot return a constant: non-polynomial terms still depend on x after integrating in y",
    );
  }

  const powerKey = variable === "x" ? "xPower" : "yPower";
  let value = normalized.terms.reduce((total, term) => {
    const integratedPower = term[powerKey] + 1;
    if (integratedPower === 0) {
      return total + term.coefficient *
        (Math.log(Math.abs(upper)) - Math.log(Math.abs(lower)));
    }
    return total + (term.coefficient / integratedPower) *
      (upper ** integratedPower - lower ** integratedPower);
  }, 0);
  if (variable === "x") {
    value += normalized.exponentials.reduce(
      (total, term) => total + (term.coefficient / term.rate) *
        (Math.exp(term.rate * upper) - Math.exp(term.rate * lower)),
      0,
    );
    value += normalized.trigTerms.reduce((total, term) => {
      const primitive = term.kind === "sin"
        ? (point) => (-term.coefficient / term.rate) * Math.cos(term.rate * point)
        : (point) => (term.coefficient / term.rate) * Math.sin(term.rate * point);
      return total + primitive(upper) - primitive(lower);
    }, 0);
    value += normalized.logTerms.reduce(
      (total, term) =>
        total + logarithmAntiderivativeValue(term, upper) -
        logarithmAntiderivativeValue(term, lower),
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
  return normalized.terms.length === 0 &&
    normalized.exponentials.length === 0 &&
    normalized.trigTerms.length === 0 &&
    normalized.logTerms.length === 0;
}

function greatestCommonDivisor(left, right) {
  let a = Math.abs(left);
  let b = Math.abs(right);
  while (b !== 0) [a, b] = [b, a % b];
  return a;
}

function simpleFraction(value) {
  const absoluteValue = Math.abs(value);
  const roundedInteger = Math.round(absoluteValue);
  if (Math.abs(absoluteValue - roundedInteger) <= EPSILON) {
    return String(roundedInteger);
  }
  for (
    let denominator = 2;
    denominator <= MAX_FRACTION_DENOMINATOR;
    denominator += 1
  ) {
    const numerator = Math.round(absoluteValue * denominator);
    const tolerance = EPSILON * Math.max(1, absoluteValue);
    if (Math.abs(absoluteValue - numerator / denominator) <= tolerance) {
      const divisor = greatestCommonDivisor(numerator, denominator);
      return `${numerator / divisor}/${denominator / divisor}`;
    }
  }
  return String(Number(absoluteValue.toPrecision(10)));
}

function powerBody(variable, power) {
  if (power === 0) return "";
  return power === 1 ? variable : `${variable}^${power}`;
}

function polynomialBody(term) {
  return `${powerBody("x", term.xPower)}${powerBody("y", term.yPower)}`;
}

function exponentialBody(rate) {
  if (rate === 1) return "e^x";
  if (rate === -1) return "e^-x";
  return `e^(${simpleFraction(rate)}x)`;
}

function trigonometricBody(term) {
  const input = term.rate === 1 ? "x" : `${simpleFraction(term.rate)}x`;
  return `${term.kind}(${input})`;
}

function logarithmBody(term) {
  return `${powerBody("x", term.xPower)}ln|x|`;
}

function formatSignedTerms(displayTerms) {
  if (displayTerms.length === 0) return "0";
  return displayTerms.map(({ coefficient, body }, index) => {
    const negative = coefficient < 0;
    const magnitude = Math.abs(coefficient);
    const coefficientText = body && Math.abs(magnitude - 1) <= EPSILON
      ? ""
      : simpleFraction(magnitude);
    const unsignedTerm = `${coefficientText}${body}`;
    if (index === 0) return negative ? `-${unsignedTerm}` : unsignedTerm;
    return negative ? ` - ${unsignedTerm}` : ` + ${unsignedTerm}`;
  }).join("");
}

export function formatExpression(expression) {
  const normalized = normalizeExpression(expression);
  return formatSignedTerms([
    ...normalized.exponentials.map((term) => ({
      coefficient: term.coefficient,
      body: exponentialBody(term.rate),
    })),
    ...normalized.trigTerms.map((term) => ({
      coefficient: term.coefficient,
      body: trigonometricBody(term),
    })),
    ...normalized.logTerms.map((term) => ({
      coefficient: term.coefficient,
      body: logarithmBody(term),
    })),
    ...normalized.terms.map((term) => ({
      coefficient: term.coefficient,
      body: polynomialBody(term),
    })),
  ]);
}
