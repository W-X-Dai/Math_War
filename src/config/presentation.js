import { deepFreeze } from './freeze.js';

/**
 * Developer-owned visual tuning values.
 *
 * CSS keeps layout rules and colors; dimensions and behavior that need to stay
 * in sync with Vue live here. Each enemy-card viewport profile is exposed as
 * custom properties by `ui/enemy-card.js`.
 */
export const PRESENTATION_CONFIG = deepFreeze({
  audio: {
    frequenciesHz: {
      select: 420,
      place: 560,
      success: 740,
      danger: 180,
    },
    initialGain: 0.045,
    finalGain: 0.001,
    fadeSeconds: 0.11,
    durationSeconds: 0.12,
  },
  battlefield: {
    fallbackBoard: { rows: 5, columns: 8, placeableColumns: 5 },
    minimumGameSpeed: 0.1,
    laneArea: {
      topPercent: 38,
      heightPercent: 47,
      effectFallbackPercent: 14,
    },
    distanceScale: 8.7,
    projectile: {
      impactDurationMs: 280,
      opacityRamp: 8,
      initialScale: 0.72,
      finalScale: 1,
    },
  },
  enemyCard: {
    formulaLength: {
      long: 18,
      veryLong: 34,
      extreme: 48,
    },
    clustering: {
      maximumDistance: 0.14,
      totalSpreadCqw: 7,
      maximumStepCqw: 2.2,
      verticalStepPx: 30,
      lastLaneMaximumDownwardOffsetPx: 67,
    },
    hitArea: '44px',
    minimumWidth: '64px',
    profiles: {
      wide: {
        maximumWidth: 'clamp(168px, 18cqw, 280px)',
        minimumHeight: '40px',
        paddingBlock: '6px',
        paddingInline: '12px',
        formulaFontSize: 'clamp(17px, 1.45cqw, 24px)',
        longFontSize: 'clamp(12px, 0.95cqw, 15px)',
        veryLongFontSize: 'clamp(10px, 0.78cqw, 12.5px)',
        extremeFontSize: 'clamp(10px, 0.72cqw, 11.5px)',
        shieldOffset: '3px',
      },
      compact: {
        maximumWidth: 'clamp(160px, 28vw, 224px)',
        minimumHeight: '38px',
        paddingBlock: '5px',
        paddingInline: '10px',
        formulaFontSize: 'clamp(16px, 2.5vw, 20px)',
        longFontSize: 'clamp(11px, 1.9vw, 14px)',
        veryLongFontSize: 'clamp(9.5px, 1.55vw, 12px)',
        extremeFontSize: 'clamp(9.5px, 1.45vw, 11px)',
        shieldOffset: '2px',
      },
      narrow: {
        maximumWidth: 'min(224px, calc(100vw - 24px))',
        minimumHeight: '36px',
        paddingBlock: '4px',
        paddingInline: '8px',
        formulaFontSize: 'clamp(14px, 4.2vw, 17px)',
        longFontSize: 'clamp(10.5px, 3.2vw, 13px)',
        veryLongFontSize: 'clamp(9px, 2.7vw, 11px)',
        extremeFontSize: 'clamp(9.5px, 2.6vw, 10.5px)',
        shieldOffset: '1px',
      },
    },
  },
});
