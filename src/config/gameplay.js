import { deepFreeze } from './freeze.js';

/**
 * Runtime rules owned by the game engine.
 *
 * Content definitions (chapters, enemies, operators, and queues) live in
 * `content.js`; procedural wave parameters live in `generation.js`.
 */
export const GAMEPLAY_CONFIG = deepFreeze({
  initialState: {
    defaultSeed: 20260905,
    baseHp: 500,
    firstEntityId: 100,
    normalSimulationSpeed: 1,
    fastSimulationSpeed: 2,
  },
  limits: {
    logEntries: 8,
  },
  economy: {
    energyRefillIntervalSeconds: 5,
    energyRefillAmount: 25,
    earlyStartEnergyPerSecond: 5,
    earlyStartEnergyCap: 150,
    fallbackEnemyReward: 20,
    operatorDrawBaseWeight: 1,
    operatorDrawCounterTagBonus: 3,
    operatorDrawMaxCopies: 3,
    towerRecycleRefundFraction: 0.5,
  },
  wave: {
    finitePreparationSeconds: 30,
    endlessPreparationBaseSeconds: 32,
    endlessPreparationDecreasePerRoundSeconds: 2,
    endlessMinimumPreparationSeconds: 10,
  },
  geometry: {
    gridStart: 0.155,
    gridEnd: 0.89,
    cellCenterOffset: 0.5,
    basePosition: 0.125,
    enemySpawnPosition: 0.955,
    projectileExitPosition: 1.06,
    effectRow: -1,
    energyEffectPosition: 0.82,
    formulaAndConstantQueueEffectPosition: 0.94,
    operatorQueueEffectPosition: 0.9,
  },
  combat: {
    minimumDamage: 1,
    enemyAttackIntervalSeconds: 1.15,
    defaultEnemySpeed: 0.015,
    fastAffixSpeedMultiplier: 1.35,
    enemyHitFlashSeconds: 0.32,
    towerFireFlashSeconds: 0.28,
    divergence: {
      durationSeconds: 6,
      speedMultiplier: 1.5,
      damageMultiplier: 2,
      hitFlashSeconds: 0.4,
    },
    split: {
      maxChildren: 2,
      maximumPosition: 0.97,
      positionOffset: 0.014,
      childSpeedMultiplier: 1.05,
      childRewardMultiplier: 0.35,
      parentRewardMultiplier: 0.6,
      minimumReward: 8,
      firstAttackDelaySeconds: 0.35,
      attackDelayStepSeconds: 0.12,
    },
    tower: {
      durableTypeIds: ['secondDerivative'],
      defaultHp: 120,
      durableHp: 150,
      defaultInitialCooldownSeconds: 0.25,
      presetInitialCooldownSeconds: 0.25,
      targetRearTolerance: 0.035,
      blockerForwardTolerance: 0.014,
      blockingDistance: 0.065,
    },
  },
  effects: {
    defaultLifetimeSeconds: 0.9,
    // Lane duration runs from each tower to projectileExitPosition, not to the
    // enemy that happened to be ahead when the shot was launched.
    projectileTravelSeconds: {
      lane: 5,
      drop: 1.5,
    },
    projectileImpactLingerSeconds: 0.3,
    partialProjectileStaggerSeconds: 0.035,
    partialProjectileMaximumDelaySeconds: 0.18,
    waveBannerSeconds: 2.6,
    endlessBannerSeconds: 2.4,
    toastSeconds: 2.4,
  },
  simulation: {
    maximumStepSeconds: 0.2,
  },
});
