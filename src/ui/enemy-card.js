import { PRESENTATION_CONFIG } from '../config/presentation.js';

const { enemyCard } = PRESENTATION_CONFIG;

export function enemyFormulaClasses(formula) {
  const length = [...String(formula)].length;
  return {
    'is-long': length > enemyCard.formulaLength.long,
    'is-very-long': length > enemyCard.formulaLength.veryLong,
    'is-extreme': length > enemyCard.formulaLength.extreme,
  };
}

export function enemyCardPlacement(position) {
  const numericPosition = Number(position);
  const normalizedPosition = Number.isFinite(numericPosition)
    ? Math.min(1, Math.max(0, numericPosition))
    : 0;
  return {
    normalizedPosition,
    anchorPercentage: `${-normalizedPosition * 100}%`,
  };
}

const profileVariable = (profile, property) => enemyCard.profiles[profile][property];

export const ENEMY_CARD_CSS_VARIABLES = Object.freeze({
  '--enemy-card-hit-area': enemyCard.hitArea,
  '--enemy-card-min-width': enemyCard.minimumWidth,
  '--enemy-card-max-width-wide': profileVariable('wide', 'maximumWidth'),
  '--enemy-card-max-width-compact': profileVariable('compact', 'maximumWidth'),
  '--enemy-card-max-width-narrow': profileVariable('narrow', 'maximumWidth'),
  '--enemy-card-min-height-wide': profileVariable('wide', 'minimumHeight'),
  '--enemy-card-min-height-compact': profileVariable('compact', 'minimumHeight'),
  '--enemy-card-min-height-narrow': profileVariable('narrow', 'minimumHeight'),
  '--enemy-card-padding-block-wide': profileVariable('wide', 'paddingBlock'),
  '--enemy-card-padding-block-compact': profileVariable('compact', 'paddingBlock'),
  '--enemy-card-padding-block-narrow': profileVariable('narrow', 'paddingBlock'),
  '--enemy-card-padding-inline-wide': profileVariable('wide', 'paddingInline'),
  '--enemy-card-padding-inline-compact': profileVariable('compact', 'paddingInline'),
  '--enemy-card-padding-inline-narrow': profileVariable('narrow', 'paddingInline'),
  '--enemy-card-font-size-wide': profileVariable('wide', 'formulaFontSize'),
  '--enemy-card-font-size-compact': profileVariable('compact', 'formulaFontSize'),
  '--enemy-card-font-size-narrow': profileVariable('narrow', 'formulaFontSize'),
  '--enemy-card-long-font-size-wide': profileVariable('wide', 'longFontSize'),
  '--enemy-card-long-font-size-compact': profileVariable('compact', 'longFontSize'),
  '--enemy-card-long-font-size-narrow': profileVariable('narrow', 'longFontSize'),
  '--enemy-card-very-long-font-size-wide': profileVariable('wide', 'veryLongFontSize'),
  '--enemy-card-very-long-font-size-compact': profileVariable('compact', 'veryLongFontSize'),
  '--enemy-card-very-long-font-size-narrow': profileVariable('narrow', 'veryLongFontSize'),
  '--enemy-card-extreme-font-size-wide': profileVariable('wide', 'extremeFontSize'),
  '--enemy-card-extreme-font-size-compact': profileVariable('compact', 'extremeFontSize'),
  '--enemy-card-extreme-font-size-narrow': profileVariable('narrow', 'extremeFontSize'),
  '--enemy-card-shield-offset-wide': profileVariable('wide', 'shieldOffset'),
  '--enemy-card-shield-offset-compact': profileVariable('compact', 'shieldOffset'),
  '--enemy-card-shield-offset-narrow': profileVariable('narrow', 'shieldOffset'),
});
