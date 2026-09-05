<script setup>
import { computed } from 'vue';

import { GAMEPLAY_CONFIG } from '../config/gameplay.js';
import { PRESENTATION_CONFIG } from '../config/presentation.js';
import { formatExpression } from '../domain/expression.js';
import { CHAPTERS, ENEMY_TYPES, OPERATORS } from '../game/content.js';
import { activeEnemyExpression, enemyThreat } from '../game/engine.js';
import {
  ENEMY_CARD_CSS_VARIABLES,
  enemyCardPlacement,
  enemyFormulaClasses,
} from '../ui/enemy-card.js';
import { prettyFormula } from '../ui/format.js';
import {
  isProjectileEffect,
  projectileLabel,
  projectileVisualGeometry,
  resolveProjectileTargetLayouts,
} from '../ui/projectile.js';
import GameIcon from './GameIcon.vue';

const props = defineProps({
  state: { type: Object, required: true },
  dragPayload: { type: Object, default: null },
  dragOverTowerId: { type: String, default: null },
  recycleArmed: { type: Boolean, default: false },
});

defineEmits(['place-tower', 'enemy', 'tower', 'cancel', 'dismiss-tutorial']);

const { battlefield, enemyCard } = PRESENTATION_CONFIG;
const { tower: towerConfig } = GAMEPLAY_CONFIG.combat;
const board = computed(() => props.state.board ?? battlefield.fallbackBoard);
const boardStyle = computed(() => {
  const gameSpeed = Math.max(battlefield.minimumGameSpeed, Number(props.state.speed) || 1);
  return {
    ...ENEMY_CARD_CSS_VARIABLES,
    '--grid-columns': board.value.columns,
    '--grid-rows': board.value.rows,
    '--projectile-impact-duration': `${battlefield.projectile.impactDurationMs / gameSpeed}ms`,
  };
});
const cells = computed(() => Array.from({ length: board.value.rows * board.value.columns }, (_, index) => ({
  row: Math.floor(index / board.value.columns),
  column: index % board.value.columns,
  placement: index % board.value.columns < board.value.placeableColumns,
})));

const selectedStoredConstant = computed(() => (
  props.state.storedConstants?.find((item) => item.id === props.state.selectedStoredConstantId) ?? null
));
const recycleTargeting = computed(() => (
  props.recycleArmed || props.dragPayload?.kind === 'recycle-tool'
));

const formulaText = (expression) => prettyFormula(formatExpression(expression));
const formulaClass = (expression) => enemyFormulaClasses(formulaText(expression));

// The equation is the enemy, so it stays close to the simulation coordinate.
// Tightly packed enemies receive a small two-dimensional fan-out. Edge lanes
// use the free space below them so enlarged cards avoid the queue and other lanes.
const enemyPresentation = computed(() => {
  const byRow = new Map();
  for (const enemyItem of props.state.enemies ?? []) {
    const row = Number(enemyItem.row) || 0;
    if (!byRow.has(row)) byRow.set(row, []);
    byRow.get(row).push(enemyItem);
  }

  const layouts = new Map();
  for (const [row, enemies] of byRow) {
    const ordered = [...enemies].sort((a, b) => (
      (Number(a.position) || 0) - (Number(b.position) || 0)
      || String(a.id).localeCompare(String(b.id))
    ));
    let group = [];

    const flushGroup = () => {
      if (!group.length) return;
      const middle = (group.length - 1) / 2;
      const offsetStep = group.length > 1
        ? Math.min(
          enemyCard.clustering.maximumStepCqw,
          enemyCard.clustering.totalSpreadCqw / (group.length - 1),
        )
        : 0;
      const verticalStep = group.length > 1 ? enemyCard.clustering.verticalStepPx : 0;
      const verticalSpan = verticalStep * (group.length - 1);
      const verticalStart = row === 0
        ? 0
        : row === board.value.rows - 1
          ? Math.min(0, enemyCard.clustering.lastLaneMaximumDownwardOffsetPx - verticalSpan)
          : -verticalSpan / 2;
      const meanPosition = group.reduce(
        (total, enemyItem) => total + (Number(enemyItem.position) || 0),
        0,
      ) / group.length;
      const horizontalStart = meanPosition < 0.5
        ? 0
        : meanPosition > 0.5
          ? -offsetStep * (group.length - 1)
          : -middle * offsetStep;
      group.forEach((enemyItem, index) => {
        layouts.set(enemyItem.id, {
          slot: index,
          order: index,
          row,
          clusterSize: group.length,
          chipOffset: horizontalStart + index * offsetStep,
          verticalOffset: verticalStart + index * verticalStep,
        });
      });
      group = [];
    };

    ordered.forEach((enemyItem) => {
      const previous = group[group.length - 1];
      if (
        previous
        && Math.abs((Number(enemyItem.position) || 0) - (Number(previous.position) || 0))
          > enemyCard.clustering.maximumDistance
      ) {
        flushGroup();
      }
      group.push(enemyItem);
    });
    flushGroup();
  }
  return layouts;
});

let projectileLayoutCache = new Map();
const projectileTargetPresentation = computed(() => {
  const resolved = resolveProjectileTargetLayouts(
    props.state.effects,
    enemyPresentation.value,
    projectileLayoutCache,
  );
  projectileLayoutCache = resolved.cache;
  return resolved.layouts;
});

function occupied(row, column) {
  return props.state.towers.some((tower) => tower.row === row && tower.column === column);
}

function towerConfigurable(tower) {
  return tower.typeId === towerConfig.boundedTypeId
    || towerConfig.configurableTypeIds.includes(tower.typeId);
}

function towerFilled(tower) {
  if (tower.typeId === towerConfig.boundedTypeId) {
    return tower.lowerBound !== null && tower.upperBound !== null;
  }
  if (towerConfig.configurableTypeIds.includes(tower.typeId)) return tower.parameter !== null;
  return true;
}

function towerSlot(tower) {
  if (tower.typeId === 'subtract') return tower.parameter === null ? 'x−[ ]' : `x−${tower.parameter}`;
  if (tower.typeId === 'definiteIntegralTower') return `∫ ${tower.lowerBound ?? '[ ]'}→${tower.upperBound ?? '[ ]'}`;
  if (tower.typeId === 'evaluateTower') return `f(${tower.parameter ?? '[ ]'})`;
  if (tower.typeId === 'eulerTower') return `xD+${tower.parameter ?? '[ ]'}I`;
  if (tower.typeId === 'resonanceTower') return `D²+${tower.parameter ?? '[ ]'}I`;
  return '';
}

function towerLabel(tower) {
  if (tower.tutorialPreset) {
    return `${OPERATORS[tower.typeId]?.name ?? '數學砲台'}，教學預置且已鎖定，不可回收，耐久 ${Math.max(0, Math.ceil(tower.hp))}`;
  }
  const configurable = towerConfigurable(tower);
  let interaction = '運作中；按 Delete 可回收並取回一半算力';
  if (recycleTargeting.value) {
    interaction = '點擊回收並取回一半算力';
  } else if (selectedStoredConstant.value && configurable) {
    interaction = tower.active
      ? `點擊裝入常數 ${selectedStoredConstant.value.value}`
      : `運算錯誤停火；點擊重新裝填常數 ${selectedStoredConstant.value.value}`;
  } else if (!tower.active) {
    interaction = configurable
      ? '運算錯誤停火；請選擇常數並重新裝填'
      : '運算錯誤停火';
  }
  return `${OPERATORS[tower.typeId]?.name ?? '數學砲台'}，耐久 ${Math.max(0, Math.ceil(tower.hp))}，${interaction}`;
}

function laneStyle(row, position) {
  return {
    '--x': `${position * 100}%`,
    '--row': row,
    '--lane-y': `${battlefield.laneArea.topPercent + ((row + 0.5) / board.value.rows) * battlefield.laneArea.heightPercent}%`,
  };
}

function enemyStyle(enemyItem) {
  const layout = enemyPresentation.value.get(enemyItem.id) ?? {
    slot: 0, order: 0, clusterSize: 1, chipOffset: 0, verticalOffset: 0,
  };
  const placement = enemyCardPlacement(enemyItem.position);
  const style = {
    ...laneStyle(enemyItem.row, placement.normalizedPosition),
    '--stack-slot': layout.slot,
    '--stack-x': `${layout.chipOffset}cqw`,
    '--stack-y': `${layout.verticalOffset}px`,
    '--enemy-anchor-x': placement.anchorPercentage,
    zIndex: 20 + layout.order,
  };
  return style;
}

function enemyType(enemyItem) {
  const fallback = ENEMY_TYPES[enemyItem.typeId] ?? {};
  return {
    name: enemyItem.name ?? fallback.name ?? '函數敵人',
    family: enemyItem.family ?? fallback.family,
  };
}

function familyLabel(enemyItem) {
  const labels = {
    polynomial: '多項式', constant: '常數項', higherOrder: '高階多項式', multivariable: '多變數',
    rational: '分式', logarithmic: '對數', trigonometric: '三角函數', exponential: '指數函數',
  };
  return labels[enemyItem.family ?? enemyType(enemyItem).family] ?? '函數';
}

function hasAffix(enemyItem, affix) {
  return enemyItem.affixes?.includes(affix) ?? false;
}

function enemyTitle(enemyItem) {
  const body = formulaText(enemyItem.expression);
  if (!enemyItem.shieldExpression) return body;
  return `護盾 ${formulaText(enemyItem.shieldExpression)}｜本體 ${body}`;
}

function enemyLabel(enemyItem) {
  const body = formulaText(enemyItem.expression);
  const mutations = [
    hasAffix(enemyItem, 'fast') ? '快進變異' : null,
    hasAffix(enemyItem, 'split') ? '分裂變異' : null,
  ].filter(Boolean);
  const mutationText = mutations.length ? `，${mutations.join('、')}` : '';
  const action = props.state.targetingOperator
    ? `點擊施作 ${OPERATORS[props.state.targetingOperator]?.name ?? '算子'}`
    : '點擊查看公式';
  if (enemyItem.shieldExpression) {
    return `${enemyType(enemyItem).name}，${familyLabel(enemyItem)}${mutationText}，等式護盾 ${formulaText(enemyItem.shieldExpression)}，護盾後方本體 ${body}，本體攻擊 ${enemyThreat(enemyItem)}，${action}`;
  }
  return `${enemyType(enemyItem).name}，${familyLabel(enemyItem)}${mutationText}，本體公式 ${body}，本體攻擊 ${enemyThreat(enemyItem)}，${action}`;
}

function effectClass(effect) {
  if (!isProjectileEffect(effect)) return ['combat-float', effect.type];
  const legacyDrop = effect.type === 'drop-projectile';
  return [
    'projectile',
    `projectile--${effect.shape ?? (effect.type === 'subtract-projectile' ? 'subtract' : 'derivative')}`,
    `is-${effect.trajectory ?? (legacyDrop ? 'drop' : 'lane')}`,
    {
      'is-impacted': effect.status === 'impacted',
      'is-missed': effect.status === 'missed',
    },
  ];
}

function effectStyle(effect) {
  const rawPosition = Number(effect.position);
  const position = effect.position !== null && effect.position !== undefined && Number.isFinite(rawPosition)
    ? rawPosition
    : 0.5;
  const row = Number(effect.row);
  const laneY = Number.isFinite(row) && row >= 0
    ? battlefield.laneArea.topPercent
      + ((row + 0.5) / board.value.rows) * battlefield.laneArea.heightPercent
    : battlefield.laneArea.effectFallbackPercent;
  const style = {
    '--row': effect.row,
    '--x': `${position * 100}%`,
    '--lane-y': `${laneY}%`,
  };

  if (isProjectileEffect(effect)) {
    const geometry = projectileVisualGeometry(
      effect,
      laneY,
      projectileTargetPresentation.value.get(effect.id),
    );

    style['--x'] = `${geometry.position * 100}%`;
    style['--projectile-progress'] = geometry.progress;
    style['--projectile-x'] = `${geometry.x * 100}%`;
    style['--projectile-y'] = `${geometry.y}%`;
    style['--projectile-offset-x'] = `${geometry.offsetX}cqw`;
    style['--projectile-offset-y'] = `${geometry.offsetY}px`;
    style['--projectile-opacity'] = Math.min(
      1,
      geometry.progress * battlefield.projectile.opacityRamp,
    );
    style['--projectile-scale'] = battlefield.projectile.initialScale
      + (geometry.progress * (
        battlefield.projectile.finalScale - battlefield.projectile.initialScale
      ));
  }
  return style;
}
</script>

<template>
  <section class="battle-stage" :aria-label="`${board.rows} 路函數戰場`">
    <div
      class="battlefield"
      data-bind="battlefield"
      :style="boardStyle"
      :class="{
        'has-targeting': Boolean(state.targetingOperator),
        'has-recycle-targeting': recycleTargeting,
        'is-paused': state.paused,
      }"
    >
      <div class="lane-labels" aria-hidden="true">
        <span v-for="lane in board.rows" :key="lane">{{ lane }}</span>
      </div>

      <div class="battle-grid">
        <button
          v-for="cell in cells"
          :key="`${cell.row}-${cell.column}`"
          class="grid-cell"
          data-action="cell"
          :data-row="cell.row"
          :data-column="cell.column"
          :class="{
            'is-placement-zone': cell.placement,
            'is-path-only': !cell.placement,
            'is-placeable': cell.placement && Boolean(state.selectedOperator) && !occupied(cell.row, cell.column),
            'is-invalid': cell.placement && Boolean(state.selectedOperator) && occupied(cell.row, cell.column),
          }"
          type="button"
          :disabled="!cell.placement"
          :aria-label="`第 ${cell.row + 1} 路，第 ${cell.column + 1} 格${cell.placement ? '' : '，不可放置'}`"
          @click="$emit('place-tower', cell.row, cell.column)"
        ><span aria-hidden="true">＋</span></button>
      </div>

      <div class="tower-layer" data-layer="towers">
        <button
          v-for="tower in state.towers"
          :key="tower.id"
          class="tower"
          data-action="tower"
          :data-tower-id="tower.id"
          :class="{
            'is-firing': tower.fireFlash > 0,
            'is-error-stopped': !tower.active,
            'is-configurable': towerConfigurable(tower),
            'is-filled': towerConfigurable(tower) && towerFilled(tower),
            'is-awaiting-assembly': !recycleTargeting && !tower.tutorialPreset && towerConfigurable(tower) && Boolean(selectedStoredConstant),
            'is-recycle-target': recycleTargeting && !tower.tutorialPreset,
            'is-recycle-over': dragOverTowerId === tower.id,
            'is-tutorial-preset': tower.tutorialPreset,
          }"
          type="button"
          :style="laneStyle(tower.row, tower.position)"
          :aria-label="towerLabel(tower)"
          :aria-disabled="tower.tutorialPreset ? 'true' : undefined"
          :aria-keyshortcuts="tower.tutorialPreset ? undefined : 'Delete'"
          :data-recycle-tower-id="tower.tutorialPreset ? undefined : tower.id"
          @click="!tower.tutorialPreset && $emit('tower', tower.id)"
        >
          <span class="tower-sprite" :class="OPERATORS[tower.typeId].art" aria-hidden="true"></span>
          <span class="tower-slot" aria-hidden="true">{{ towerSlot(tower) }}</span>
          <span v-if="tower.tutorialPreset" class="tutorial-preset-badge" aria-hidden="true">教學預置</span>
          <span v-else-if="!tower.active" class="tower-error-badge" aria-hidden="true">
            <b>運算錯誤停火</b><small>重新裝填</small>
          </span>
          <span class="tower-status"><i :style="{ width: `${Math.max(0, tower.hp / tower.maxHp) * 100}%` }"></i></span>
        </button>
      </div>

      <TransitionGroup
        tag="div"
        class="enemy-layer"
        data-layer="enemies"
        leave-active-class="enemy-leave-active"
        leave-to-class="is-vanishing"
      >
        <button
          v-for="enemyItem in state.enemies"
          :key="enemyItem.id"
          class="enemy"
          data-action="enemy"
          :data-enemy-id="enemyItem.id"
          :data-stack-slot="enemyPresentation.get(enemyItem.id)?.slot ?? 0"
          :data-cluster-size="enemyPresentation.get(enemyItem.id)?.clusterSize ?? 1"
          :data-shield-active="enemyItem.shieldExpression ? 'true' : 'false'"
          :data-body-expression="formulaText(enemyItem.expression)"
          :data-active-expression="formulaText(activeEnemyExpression(enemyItem))"
          :class="{
            'is-selected': state.selectedEnemyId === enemyItem.id,
            'is-targetable': Boolean(state.targetingOperator),
            'is-divergent': enemyItem.divergentTimer > 0,
            'is-hit': enemyItem.hitFlash > 0,
            'has-shield': Boolean(enemyItem.shieldExpression),
          }"
          type="button"
          :style="enemyStyle(enemyItem)"
          :title="enemyTitle(enemyItem)"
          :aria-label="enemyLabel(enemyItem)"
          :aria-pressed="state.targetingOperator ? undefined : state.selectedEnemyId === enemyItem.id"
          @click="$emit('enemy', enemyItem.id)"
        >
          <span class="enemy-expression-stack">
            <span class="enemy-body-expression" data-expression-layer="body">
              <strong class="enemy-formula" :class="formulaClass(enemyItem.expression)" data-role="enemy-body-formula">{{ formulaText(enemyItem.expression) }}</strong>
            </span>
            <span
              v-if="enemyItem.shieldExpression"
              class="enemy-shield-expression"
              data-expression-layer="shield"
              :data-shield-expression="formulaText(enemyItem.shieldExpression)"
              aria-hidden="true"
            >
              <strong class="enemy-formula" :class="formulaClass(enemyItem.shieldExpression)" data-role="enemy-shield-formula">{{ formulaText(enemyItem.shieldExpression) }}</strong>
            </span>
            <span v-if="hasAffix(enemyItem, 'fast') || hasAffix(enemyItem, 'split')" class="enemy-mutation-marks" aria-hidden="true">
              <i v-if="hasAffix(enemyItem, 'fast')" class="enemy-mutation-mark is-fast"></i>
              <i v-if="hasAffix(enemyItem, 'split')" class="enemy-mutation-mark is-split"></i>
            </span>
          </span>
        </button>
      </TransitionGroup>

      <div class="effect-layer" data-layer="effects" aria-hidden="true">
        <span
          v-for="effect in state.effects"
          :key="effect.id"
          :class="effectClass(effect)"
          :style="effectStyle(effect)"
          :data-operator="effect.operatorId"
          :data-status="effect.status"
          :data-equation="effect.equation ? prettyFormula(effect.equation) : undefined"
        >
          <template v-if="isProjectileEffect(effect)">
            <span class="projectile__glyph">{{ projectileLabel(effect) }}</span>
          </template>
          <template v-else>{{ effect.label ?? '' }}</template>
        </span>
      </div>

      <div class="wave-banner" data-bind="waveBanner" :class="{ 'is-visible': state.bannerTimer > 0 }" aria-live="polite">
        {{ state.bannerTimer > 0 ? `${state.currentWave?.kind === 'tutorial' ? '教學波｜' : ''}${state.currentWave?.name ?? (state.chapterIndex === CHAPTERS.length ? `無限第 ${state.endlessRound} 輪` : `第 ${state.chapterIndex + 1} 章`)}` : '' }}
      </div>

      <div class="targeting-mode" data-bind="targeting" :hidden="!state.targetingOperator">
        <template v-if="state.targetingOperator">
          <span>{{ OPERATORS[state.targetingOperator]?.name ?? '單體算子' }}：選一隻敵人</span>
          <button type="button" data-action="cancel" @click="$emit('cancel')">取消</button>
        </template>
      </div>

      <div class="tutorial-anchor" data-bind="tutorial">
        <article v-if="state.tutorialVisible && state.phase !== 'intro'" class="tutorial-card">
          <button class="icon-button" type="button" data-action="dismiss-tutorial" aria-label="關閉教學" @click="$emit('dismiss-tutorial')">
            <GameIcon name="close" />
          </button>
          <strong>{{ state.currentWave?.kind === 'tutorial' ? '固定教學波・預置砲塔已鎖定' : '先從軍械 Queue 選一張 D' }}</strong>
          <p>{{ state.currentWave?.kind === 'tutorial' ? (state.currentWave?.objective ?? '觀察新敵人，使用預置軍械將公式化為 0。') : '砲台只攻擊同一路；卡片成功使用才會消耗。注意敵人的函數族與變異徽章。' }}</p>
          <button class="secondary-button" type="button" data-action="dismiss-tutorial" @click="$emit('dismiss-tutorial')">知道了</button>
        </article>
      </div>
    </div>

  </section>
</template>
