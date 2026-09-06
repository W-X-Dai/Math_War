import assert from 'node:assert/strict';
import test from 'node:test';

import { evaluateConstantExpression } from '../src/domain/constant-expression.js';

test('constant expressions respect precedence, grouping, and unary signs', () => {
  assert.equal(evaluateConstantExpression('2 + 3 × 4'), 14);
  assert.equal(evaluateConstantExpression('(2 + 3) × 4'), 20);
  assert.equal(evaluateConstantExpression('18 ÷ 3 × 2'), 12);
  assert.equal(evaluateConstantExpression('-(2.5 + .5)'), -3);
});

test('constant expressions support pi, e, square roots, and limited LaTeX notation', () => {
  assert.equal(evaluateConstantExpression('√9 + √(16)'), 7);
  assert.equal(evaluateConstantExpression(String.raw`\sqrt{81} \div 3`), 3);
  assert.equal(evaluateConstantExpression(String.raw`2\pi`), 2 * Math.PI);
  assert.equal(evaluateConstantExpression('e'), Math.E);
  assert.equal(evaluateConstantExpression('2e + πe'), (2 * Math.E) + (Math.PI * Math.E));
  assert.equal(evaluateConstantExpression(String.raw`\mathrm{e}`), Math.E);
  assert.equal(evaluateConstantExpression(String.raw`\sqrt{\sqrt{16}}`), 2);
  assert.equal(evaluateConstantExpression('2(3 + 4)'), 14);
});

test('constant expressions reject unsafe, undefined, or malformed input', () => {
  assert.throws(() => evaluateConstantExpression('1 ÷ 0'), /0/);
  assert.throws(() => evaluateConstantExpression('√(-1)'), /負數/);
  assert.throws(() => evaluateConstantExpression('()'), /空/);
  assert.throws(() => evaluateConstantExpression('2 ×'), /不完整/);
  assert.throws(() => evaluateConstantExpression('2 ** 3'), /不完整/);
  assert.throws(() => evaluateConstantExpression('1e3'), /算式/);
  assert.throws(() => evaluateConstantExpression('E'), /不支援/);
  assert.throws(() => evaluateConstantExpression('globalThis.alert(1)'), /不支援/);
  assert.throws(() => evaluateConstantExpression(String.raw`\frac{1}{2}`), /不支援/);
});
