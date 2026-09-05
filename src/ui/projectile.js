import { formatValue } from './format.js';

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
