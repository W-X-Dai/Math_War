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
    add: { shape: 'add', trajectory: 'drop' },
    derivative: { shape: 'derivative', trajectory: 'lane' },
    subtract: { shape: 'subtract', trajectory: 'drop' },
    multiply: { shape: 'multiply', trajectory: 'drop' },
    divide: { shape: 'divide', trajectory: 'drop' },
    squareRoot: { shape: 'square-root', trajectory: 'drop' },
    secondDerivative: { shape: 'second-derivative', trajectory: 'lane' },
    definiteIntegralTower: { shape: 'definite-integral', trajectory: 'drop' },
    integral: { shape: 'indefinite-integral', trajectory: 'drop' },
    reflect: { shape: 'reflection', trajectory: 'drop' },
    limit: { shape: 'limit', trajectory: 'drop' },
    partial: { shape: 'partial', trajectory: 'drop' },
    evaluateTower: { shape: 'evaluation', trajectory: 'drop' },
    eulerTower: { shape: 'euler', trajectory: 'drop' },
    resonanceTower: { shape: 'resonance', trajectory: 'drop' },
  };

  assert.deepEqual(Object.keys(OPERATORS).sort(), Object.keys(expected).sort());
  for (const operator of Object.values(OPERATORS)) {
    assert.deepEqual(operator.projectile, expected[operator.id]);
  }
});

test('projectile labels preserve each attack notation and its configured values', async (t) => {
  const cases = [
    ['add positive', { operatorId: 'add', parameter: 3 }, '+3'],
    ['add negative', { operatorId: 'add', parameter: -3 }, '−3'],
    ['add pi', { operatorId: 'add', parameter: Math.PI }, '+π'],
    ['add e', { operatorId: 'add', parameter: Math.E }, '+e'],
    ['add zero', { operatorId: 'add', parameter: 0 }, '+0'],
    ['first derivative', { operatorId: 'derivative' }, 'd/dx'],
    ['second derivative', { operatorId: 'secondDerivative' }, 'd²/dx²'],
    ['subtract positive', { operatorId: 'subtract', parameter: 3 }, '−3'],
    ['subtract negative', { operatorId: 'subtract', parameter: -3 }, '+3'],
    ['subtract negative pi', { operatorId: 'subtract', parameter: -Math.PI }, '+π'],
    ['subtract negative e', { operatorId: 'subtract', parameter: -Math.E }, '+e'],
    ['subtract zero', { operatorId: 'subtract', parameter: 0 }, '−0'],
    ['multiply positive', { operatorId: 'multiply', parameter: 3 }, '×3'],
    ['multiply negative', { operatorId: 'multiply', parameter: -3 }, '×−3'],
    ['divide positive', { operatorId: 'divide', parameter: 3 }, '÷3'],
    ['divide pi', { operatorId: 'divide', parameter: Math.PI }, '÷π'],
    ['square root', { operatorId: 'squareRoot' }, '√'],
    [
      'definite integral with pi bounds',
      { operatorId: 'definiteIntegralTower', lowerBound: -Math.PI, upperBound: Math.PI },
      '∫[−π,π]dx',
    ],
    ['evaluation at pi', { operatorId: 'evaluateTower', parameter: Math.PI }, 'f(π)'],
    ['evaluation at e', { operatorId: 'evaluateTower', parameter: Math.E }, 'f(e)'],
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
    ['partial derivative', { operatorId: 'partial' }, '∂/∂z'],
  ];

  for (const [name, effect, expected] of cases) {
    await t.test(name, () => {
      assert.equal(projectileLabel(effect), expected);
    });
  }
});

test('lane projectile geometry preserves off-board positions while drops stay on the board', () => {
  assert.deepEqual(
    projectileVisualGeometry({
      type: 'projectile',
      position: 1.06,
      currentPosition: -0.2,
      progress: 0.4,
    }, 50),
    {
      position: 1.06,
      progress: 0.4,
      trajectory: 'lane',
      x: -0.2,
      y: 50,
      offsetX: 0,
      offsetY: 0,
    },
  );
  assert.equal(
    projectileVisualGeometry({
      type: 'projectile',
      position: 1.06,
      currentPosition: 1.04,
      progress: 0.95,
    }, 50).x,
    1.04,
  );
  assert.equal(
    projectileVisualGeometry({
      type: 'drop-projectile',
      trajectory: 'drop',
      position: 1.2,
      progress: 0.5,
    }, 50).x,
    1,
  );
  assert.equal(
    projectileVisualGeometry({ type: 'projectile', position: null, progress: 1 }, 50).x,
    0.5,
  );
});

test('flying lane projectiles progressively meet the displayed target card', () => {
  const cases = [
    [0.2, 0, 0],
    [0.5, -2.2, 15],
    [0.8, -4.4, 30],
  ];

  for (const [currentPosition, offsetX, offsetY] of cases) {
    const geometry = projectileVisualGeometry(
      {
        type: 'projectile',
        trajectory: 'lane',
        position: 1.06,
        from: 0.2,
        currentPosition,
        progress: (currentPosition - 0.2) / (1.06 - 0.2),
      },
      60,
      { chipOffset: -4.4, verticalOffset: 30, targetPosition: 0.8 },
    );
    assert.ok(Math.abs(geometry.offsetX - offsetX) < 1e-12);
    assert.ok(Math.abs(geometry.offsetY - offsetY) < 1e-12);
    assert.equal(geometry.x, currentPosition);
  }
});

test('drop projectiles progressively inherit positive and negative target offsets', () => {
  const geometry = projectileVisualGeometry(
    { type: 'drop-projectile', trajectory: 'drop', position: 0.8, progress: 0.5 },
    60,
    { chipOffset: -4.4, verticalOffset: 30 },
  );

  assert.equal(geometry.offsetX, -2.2);
  assert.equal(geometry.offsetY, 15);
  assert.equal(geometry.x, 0.8);
  assert.equal(geometry.y, 30);
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
    ['enemy-1', {
      chipOffset: -4.4,
      verticalOffset: 30,
      targetPosition: 0.74,
      unrelated: true,
    }],
  ]);

  const initial = resolveProjectileTargetLayouts([effect], liveLayouts);
  assert.deepEqual(initial.layouts.get(effect.id), {
    chipOffset: -4.4,
    verticalOffset: 30,
    targetPosition: 0.74,
  });
  assert.equal(initial.cache.size, 1);

  const afterTargetRemoval = resolveProjectileTargetLayouts([effect], new Map(), initial.cache);
  assert.deepEqual(
    afterTargetRemoval.layouts.get(effect.id),
    { chipOffset: -4.4, verticalOffset: 30, targetPosition: 0.74 },
  );
  assert.equal(afterTargetRemoval.cache.size, 1);

  const afterEffectRemoval = resolveProjectileTargetLayouts([], new Map(), afterTargetRemoval.cache);
  assert.equal(afterEffectRemoval.layouts.size, 0);
  assert.equal(afterEffectRemoval.cache.size, 0);
});

test('an impacted lane projectile follows the enemy it actually collided with', () => {
  const effect = {
    id: 'fx-2',
    type: 'projectile',
    targetId: 'enemy-at-launch',
    impactTargetId: 'enemy-at-impact',
  };
  const liveLayouts = new Map([
    ['enemy-at-launch', { chipOffset: -4.4, verticalOffset: 30 }],
    ['enemy-at-impact', { chipOffset: 2.2, verticalOffset: -60 }],
  ]);

  const result = resolveProjectileTargetLayouts([effect], liveLayouts);
  assert.deepEqual(result.layouts.get(effect.id), { chipOffset: 2.2, verticalOffset: -60 });
});

test('projectile rendering has no ray or trail markup and styles', async () => {
  const [stageSource, battlefieldCss, responsiveCss] = await Promise.all([
    readFile(new URL('../src/components/BattlefieldStage.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/battlefield.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/responsive.css', import.meta.url), 'utf8'),
  ]);

  assert.match(stageSource, /class="projectile__glyph"/);
  assert.match(stageSource, /:data-effect-id="effect\.id"/);
  assert.match(stageSource, /:data-trajectory="effect\.trajectory"/);
  assert.match(stageSource, /:data-impact-target-id="effect\.impactTargetId"/);
  assert.match(stageSource, /:data-projectile-position="effect\.currentPosition"/);
  assert.match(stageSource, /targetPosition: Number\(enemyItem\.position\)/);
  assert.doesNotMatch(stageSource, /String\(a\.id\)\.localeCompare/);
  assert.match(stageSource, /'is-missed': effect\.status === 'missed'/);
  assert.match(stageSource, /<div class="enemy-layer" data-layer="enemies">/);
  assert.doesNotMatch(stageSource, /<TransitionGroup[^>]+enemy-layer/);
  assert.doesNotMatch(stageSource, /'is-defeated': enemyItem\.dead/);
  assert.doesNotMatch(stageSource, /:disabled="enemyItem\.dead"/);
  assert.match(stageSource, /--projectile-offset-x/);
  assert.match(stageSource, /--projectile-offset-y/);
  assert.doesNotMatch(stageSource, /--projectile-anchor-x/);
  assert.doesNotMatch(stageSource, /projectile__trail/);
  assert.match(battlefieldCss, /\.projectile\.is-missed \.projectile__glyph/);
  assert.doesNotMatch(battlefieldCss, /\.enemy\.is-defeated/);
  assert.match(battlefieldCss, /var\(--projectile-offset-x, 0cqw\)/);
  assert.match(battlefieldCss, /var\(--projectile-offset-y, 0px\)/);
  assert.match(battlefieldCss, /transform: translate\(-50%, -50%\) scale\(var\(--projectile-scale, 1\)\)/);
  assert.match(battlefieldCss, /@keyframes projectile-miss/);
  assert.doesNotMatch(responsiveCss, /--projectile-anchor-x/);
  assert.doesNotMatch(responsiveCss, /\.projectile\s*\{[^}]*left:\s*var\(--x\)/s);
  assert.doesNotMatch(
    `${battlefieldCss}\n${responsiveCss}`,
    /projectile__trail|projectile-trail-(?:lane|drop)/,
  );
});
