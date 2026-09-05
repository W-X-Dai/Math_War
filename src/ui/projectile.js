import { formatValue } from './format.js';

const EMPTY_TARGET_LAYOUT = Object.freeze({ chipOffset: 0, verticalOffset: 0 });

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampUnit(value) {
  return Math.min(1, Math.max(0, value));
}

function normalizedTargetLayout(layout) {
  if (!layout) return EMPTY_TARGET_LAYOUT;
  return Object.freeze({
    chipOffset: finiteNumber(layout.chipOffset),
    verticalOffset: finiteNumber(layout.verticalOffset),
  });
}

function scalarLabel(value) {
  return value === null || value === undefined ? '[ ]' : formatValue(value);
}

function subtractLabel(value) {
  if (Number(value) < 0) return `+${formatValue(Math.abs(value))}`;
  return `−${scalarLabel(value)}`;
}

function identityTerm(value) {
  if (value === null || value === undefined) return '+[ ]I';
  if (value === 0) return '';
  return value < 0 ? `−${formatValue(Math.abs(value))}I` : `+${formatValue(value)}I`;
}

export function isProjectileEffect(effect) {
  return effect?.type?.includes('projectile') ?? false;
}

export function projectileProgress(effect) {
  if (effect?.status === 'impacted') return 1;
  return clampUnit(finiteNumber(effect?.progress));
}

/**
 * Calculate the projectile point and the portion of the target card fan-out
 * that it should inherit. Both axes ease from the unshifted launch point to
 * the displayed card, so the final visual point matches the target precisely.
 */
export function projectileVisualGeometry(effect, laneY, targetLayout = EMPTY_TARGET_LAYOUT) {
  const rawPosition = Number(effect?.position);
  const position = effect?.position !== null
    && effect?.position !== undefined
    && Number.isFinite(rawPosition)
    ? clampUnit(rawPosition)
    : 0.5;
  const rawFrom = Number(effect?.from);
  const from = effect?.from !== null
    && effect?.from !== undefined
    && Number.isFinite(rawFrom)
    ? clampUnit(rawFrom)
    : position;
  const progress = projectileProgress(effect);
  const trajectory = effect?.trajectory ?? (effect?.type === 'drop-projectile' ? 'drop' : 'lane');
  const targetY = finiteNumber(laneY);
  const layout = normalizedTargetLayout(targetLayout);

  return {
    position,
    progress,
    trajectory,
    x: trajectory === 'lane' ? from + ((position - from) * progress) : position,
    y: trajectory === 'drop' ? targetY * progress : targetY,
    offsetX: progress === 0 ? 0 : layout.chipOffset * progress,
    offsetY: progress === 0 ? 0 : layout.verticalOffset * progress,
  };
}

/**
 * Resolve an immutable layout snapshot for every active projectile. A snapshot
 * is retained by projectile id when its target leaves the enemy collection, and
 * the returned cache contains no entries for effects that have finished.
 */
export function resolveProjectileTargetLayouts(
  effects,
  liveEnemyLayouts,
  previousCache = new Map(),
) {
  const layouts = new Map();
  const cache = new Map();

  for (const effect of effects ?? []) {
    if (!isProjectileEffect(effect) || effect.id === null || effect.id === undefined) continue;
    const liveLayout = liveEnemyLayouts?.get?.(effect.targetId);
    const targetLayout = normalizedTargetLayout(
      liveLayout ?? previousCache?.get?.(effect.id),
    );
    layouts.set(effect.id, targetLayout);
    cache.set(effect.id, targetLayout);
  }

  return { layouts, cache };
}

/**
 * Format the semantic projectile payload as the operation actually being fired.
 * Keeping this out of the engine prevents UI notation (including π) from leaking
 * into combat state and gives every weapon one explicit visual contract.
 */
export function projectileLabel(effect) {
  switch (effect?.operatorId) {
    case 'derivative':
      return 'd/dx';
    case 'secondDerivative':
      return 'd²/dx²';
    case 'subtract':
      return subtractLabel(effect.parameter);
    case 'definiteIntegralTower':
      return `∫[${scalarLabel(effect.lowerBound)},${scalarLabel(effect.upperBound)}]dx`;
    case 'evaluateTower':
      return `f(${scalarLabel(effect.parameter)})`;
    case 'eulerTower':
      return `x·d/dx${identityTerm(effect.parameter)}`;
    case 'resonanceTower':
      return `d²/dx²${identityTerm(effect.parameter)}`;
    case 'integral':
      return '∫dx+C';
    case 'reflect':
      return 'x↦−x';
    case 'limit':
      return 'lim x→∞';
    case 'partial':
      return '∂/∂x';
    default:
      return effect?.label ?? effect?.operatorId ?? '';
  }
}
