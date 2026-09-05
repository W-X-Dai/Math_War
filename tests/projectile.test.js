import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { OPERATORS } from '../src/game/content.js';
import { projectileLabel } from '../src/ui/projectile.js';

test('every operator declares projectile shape and trajectory metadata', () => {
  const expected = {
    derivative: { shape: 'derivative', trajectory: 'lane' },
    subtract: { shape: 'subtract', trajectory: 'lane' },
    secondDerivative: { shape: 'second-derivative', trajectory: 'lane' },
    definiteIntegralTower: { shape: 'definite-integral', trajectory: 'lane' },
    integral: { shape: 'indefinite-integral', trajectory: 'drop' },
    reflect: { shape: 'reflection', trajectory: 'drop' },
    limit: { shape: 'limit', trajectory: 'drop' },
    partial: { shape: 'partial', trajectory: 'drop' },
    evaluateTower: { shape: 'evaluation', trajectory: 'lane' },
    eulerTower: { shape: 'euler', trajectory: 'lane' },
    resonanceTower: { shape: 'resonance', trajectory: 'lane' },
  };

  assert.deepEqual(Object.keys(OPERATORS).sort(), Object.keys(expected).sort());
  for (const operator of Object.values(OPERATORS)) {
    assert.deepEqual(operator.projectile, expected[operator.id]);
  }
});

test('projectile labels preserve each attack notation and its configured values', async (t) => {
  const cases = [
    ['first derivative', { operatorId: 'derivative' }, 'd/dx'],
    ['second derivative', { operatorId: 'secondDerivative' }, 'd²/dx²'],
    ['subtract positive', { operatorId: 'subtract', parameter: 3 }, '−3'],
    ['subtract negative', { operatorId: 'subtract', parameter: -3 }, '+3'],
    ['subtract negative pi', { operatorId: 'subtract', parameter: -Math.PI }, '+π'],
    ['subtract zero', { operatorId: 'subtract', parameter: 0 }, '−0'],
    [
      'definite integral with pi bounds',
      { operatorId: 'definiteIntegralTower', lowerBound: -Math.PI, upperBound: Math.PI },
      '∫[−π,π]dx',
    ],
    ['evaluation at pi', { operatorId: 'evaluateTower', parameter: Math.PI }, 'f(π)'],
    ['Euler positive parameter', { operatorId: 'eulerTower', parameter: 2 }, 'x·d/dx+2I'],
    ['Euler negative parameter', { operatorId: 'eulerTower', parameter: -2 }, 'x·d/dx−2I'],
    ['Euler zero parameter', { operatorId: 'eulerTower', parameter: 0 }, 'x·d/dx'],
    [
      'resonance positive parameter',
      { operatorId: 'resonanceTower', parameter: 2 },
      'd²/dx²+2I',
    ],
    [
      'resonance negative parameter',
      { operatorId: 'resonanceTower', parameter: -2 },
      'd²/dx²−2I',
    ],
    [
      'resonance zero parameter',
      { operatorId: 'resonanceTower', parameter: 0 },
      'd²/dx²',
    ],
    ['indefinite integral', { operatorId: 'integral', parameter: -5 }, '∫dx+C'],
    ['input reflection', { operatorId: 'reflect' }, 'x↦−x'],
    ['limit at infinity', { operatorId: 'limit' }, 'lim x→∞'],
    ['partial derivative', { operatorId: 'partial' }, '∂/∂x'],
  ];

  for (const [name, effect, expected] of cases) {
    await t.test(name, () => {
      assert.equal(projectileLabel(effect), expected);
    });
  }
});

test('projectile rendering has no ray or trail markup and styles', async () => {
  const [stageSource, battlefieldCss, responsiveCss] = await Promise.all([
    readFile(new URL('../src/components/BattlefieldStage.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/battlefield.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/responsive.css', import.meta.url), 'utf8'),
  ]);

  assert.match(stageSource, /class="projectile__glyph"/);
  assert.doesNotMatch(stageSource, /projectile__trail/);
  assert.doesNotMatch(
    `${battlefieldCss}\n${responsiveCss}`,
    /projectile__trail|projectile-trail-(?:lane|drop)/,
  );
});
