import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { OPERATORS } from '../src/game/content.js';
import {
  projectileLabel,
  projectileVisualGeometry,
  resolveProjectileTargetLayouts,
} from '../src/ui/projectile.js';

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

test('projectile geometry clamps position and centers invalid or absent values', () => {
  assert.deepEqual(
    projectileVisualGeometry({ type: 'projectile', position: -0.2, progress: 1 }, 50),
    {
      position: 0,
      progress: 1,
      trajectory: 'lane',
      x: 0,
      y: 50,
      offsetX: 0,
      offsetY: 0,
    },
  );
  assert.equal(
    projectileVisualGeometry({ type: 'projectile', position: 1.2, progress: 1 }, 50).x,
    1,
  );
  assert.equal(
    projectileVisualGeometry({ type: 'projectile', position: -0.2, from: 1.4, progress: 0.5 }, 50).x,
    0.5,
  );
  assert.equal(
    projectileVisualGeometry({ type: 'projectile', position: null, progress: 1 }, 50).x,
    0.5,
  );
});

test('projectile geometry progressively inherits positive and negative target offsets', () => {
  const cases = [
    [0, { chipOffset: 4.4, verticalOffset: -30 }, 0, 0],
    [0.5, { chipOffset: -4.4, verticalOffset: 30 }, -2.2, 15],
    [1, { chipOffset: 2.2, verticalOffset: -60 }, 2.2, -60],
  ];

  for (const [progress, layout, offsetX, offsetY] of cases) {
    const geometry = projectileVisualGeometry(
      { type: 'projectile', trajectory: 'lane', position: 0.8, from: 0.2, progress },
      60,
      layout,
    );
    assert.equal(geometry.offsetX, offsetX);
    assert.equal(geometry.offsetY, offsetY);
    assert.ok(Math.abs(geometry.x - (0.2 + (0.6 * progress))) < 1e-12);
  }
});

test('impacted projectiles use full target offset even with stale progress', () => {
  const geometry = projectileVisualGeometry(
    { type: 'projectile', status: 'impacted', position: 0.7, from: 0.2, progress: 0.4 },
    55,
    { chipOffset: -2.2, verticalOffset: 30 },
  );

  assert.equal(geometry.progress, 1);
  assert.equal(geometry.x, 0.7);
  assert.equal(geometry.offsetX, -2.2);
  assert.equal(geometry.offsetY, 30);
});

test('projectile target layout survives target removal and cache drops finished effects', () => {
  const effect = { id: 'fx-1', type: 'projectile', targetId: 'enemy-1' };
  const liveLayouts = new Map([
    ['enemy-1', { chipOffset: -4.4, verticalOffset: 30, unrelated: true }],
  ]);

  const initial = resolveProjectileTargetLayouts([effect], liveLayouts);
  assert.deepEqual(initial.layouts.get(effect.id), { chipOffset: -4.4, verticalOffset: 30 });
  assert.equal(initial.cache.size, 1);

  const afterTargetRemoval = resolveProjectileTargetLayouts([effect], new Map(), initial.cache);
  assert.deepEqual(
    afterTargetRemoval.layouts.get(effect.id),
    { chipOffset: -4.4, verticalOffset: 30 },
  );
  assert.equal(afterTargetRemoval.cache.size, 1);

  const afterEffectRemoval = resolveProjectileTargetLayouts([], new Map(), afterTargetRemoval.cache);
  assert.equal(afterEffectRemoval.layouts.size, 0);
  assert.equal(afterEffectRemoval.cache.size, 0);
});

test('projectile rendering has no ray or trail markup and styles', async () => {
  const [stageSource, battlefieldCss, responsiveCss] = await Promise.all([
    readFile(new URL('../src/components/BattlefieldStage.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/battlefield.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/responsive.css', import.meta.url), 'utf8'),
  ]);

  assert.match(stageSource, /class="projectile__glyph"/);
  assert.match(stageSource, /'is-missed': effect\.status === 'missed'/);
  assert.match(stageSource, /--projectile-offset-x/);
  assert.match(stageSource, /--projectile-offset-y/);
  assert.doesNotMatch(stageSource, /--projectile-anchor-x/);
  assert.doesNotMatch(stageSource, /projectile__trail/);
  assert.match(battlefieldCss, /\.projectile\.is-missed \.projectile__glyph/);
  assert.match(battlefieldCss, /var\(--projectile-offset-x, 0cqw\)/);
  assert.match(battlefieldCss, /var\(--projectile-offset-y, 0px\)/);
  assert.match(battlefieldCss, /transform: translate\(-50%, -50%\) scale\(var\(--projectile-scale, 1\)\)/);
  assert.match(battlefieldCss, /@keyframes projectile-miss/);
  assert.doesNotMatch(
    `${battlefieldCss}\n${responsiveCss}`,
    /projectile__trail|projectile-trail-(?:lane|drop)/,
  );
});
