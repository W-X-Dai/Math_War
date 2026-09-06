<script setup>
import { computed } from 'vue';

import { PRESENTATION_CONFIG } from '../config/presentation.js';
import { formatExpression } from '../domain/expression.js';
import { CHAPTERS, ENEMY_TYPES, OPERATORS } from '../game/content.js';
import {
  activeEnemyExpression,
  enemyThreat,
  tutorialDeploymentProgress,
} from '../game/engine.js';
import {
  ENEMY_CARD_CSS_VARIABLES,
  enemyCardPlacement,
  enemyFormulaClasses,
} from '../ui/enemy-card.js';
import { formatValue, prettyFormula } from '../ui/format.js';
import {
  addLabel,
  divideLabel,
  isProjectileEffect,
  identityTerm,
  multiplyLabel,
  projectileLabel,
  projectileVisualGeometry,
  resolveProjectileTargetLayouts,
  subtractLabel,
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

const targetingItem = computed(() => (
  [...(props.state.operatorQueue ?? []), ...(props.state.scrollLibrary ?? [])]
    .find((item) => item.id === props.state.selectedOperatorItemId) ?? null
));
const draggedArsenalItem = computed(() => {
  if (props.dragPayload?.kind !== 'arsenal') return null;
  return [...(props.state.operatorQueue ?? []), ...(props.state.scrollLibrary ?? [])]
    .find((item) => item.id === props.dragPayload.id) ?? null;
});
const draggedOperator = computed(() => (
  draggedArsenalItem.value ? OPERATORS[draggedArsenalItem.value.operatorId] : null
));
const draggingTower = computed(() => draggedOperator.value?.kind === 'tower');
const draggingTargetOperator = computed(() => (
  draggedOperator.value?.kind === 'target'
  && (draggedOperator.value.parameterKeys ?? []).every((key) => (
    draggedArsenalItem.value[key] !== null && draggedArsenalItem.value[key] !== undefined
  ))
));
const recycleTargeting = computed(() => (
  props.recycleArmed || props.dragPayload?.kind === 'recycle-tool'
));
const tutorialDeployment = computed(() => tutorialDeploymentProgress(props.state));
const pendingDeploymentGoal = computed(() => tutorialDeployment.value.next);
const tutorialPromptTitle = computed(() => {
  if (pendingDeploymentGoal.value) return '輪到你親自部署砲台';
  if (tutorialDeployment.value.total > 0 && props.state.phase === 'preparing') return '部署完成，準備迎敵';
  return '用點擊或拖曳完成操作';
});
const tutorialPrompt = computed(() => {
  const goal = pendingDeploymentGoal.value;
  if (goal) {
    const operator = OPERATORS[goal.typeId];
    return `點擊上方「${operator?.name ?? '指定砲台'}」，再點第 ${goal.row + 1} 路的發亮格子；也可以直接把砲台牌拖到該路。`;
  }
  if (tutorialDeployment.value.total > 0 && props.state.phase === 'preparing') {
    return '很好！指定砲台都由你完成部署。確認位置後，按下「開始教學波」。';
  }
  return '你可以點擊軍械再點目標，也可以直接把砲台拖到格子、把捲軸拖到敵人。';
});

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
          targetPosition: Number(enemyItem.position) || 0,
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

function isTutorialTargetCell(cell) {
  return Boolean(
    pendingDeploymentGoal.value
    && cell.placement
    && cell.row === pendingDeploymentGoal.value.row
    && !occupied(cell.row, cell.column),
  );
}

function cellLabel(cell) {
  const base = `第 ${cell.row + 1} 路，第 ${cell.column + 1} 格${cell.placement ? '' : '，不可放置'}`;
  if (!isTutorialTargetCell(cell)) return base;
  return `${base}，教學建議位置，可點擊或拖曳${OPERATORS[pendingDeploymentGoal.value.typeId]?.name ?? '砲台'}到此`;
}

function towerLabel(tower) {
  if (tower.tutorialDeployment && props.state.currentWave?.kind === 'tutorial') {
    return `${OPERATORS[tower.typeId]?.name ?? '數學砲台'}，由你完成的教學部署，耐久 ${Math.max(0, Math.ceil(tower.hp))}；按 Delete 可收回並把牌放回工房`;
  }
  let interaction = '運作中；按 Delete 可回收並取回一半算力';
  if (recycleTargeting.value) {
    interaction = '點擊回收並取回一半算力';
  } else if (!tower.active) {
    interaction = '運算錯誤停火';
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

function targetingLabel() {
  const item = targetingItem.value;
  if (!item) return OPERATORS[props.state.targetingOperator]?.name ?? '單體算子';
  const value = (key) => formatValue(item[key]);
  if (item.operatorId === 'add') return `P(x)${addLabel(item.parameter)}`;
  if (item.operatorId === 'subtract') return `P(x)${subtractLabel(item.parameter)}`;
  if (item.operatorId === 'multiply') return `P(x)${multiplyLabel(item.parameter)}`;
  if (item.operatorId === 'divide') return `P(x)${divideLabel(item.parameter)}`;
  if (item.operatorId === 'definiteIntegralTower') return `∫[${value('lowerBound')}, ${value('upperBound')}]`;
  if (item.operatorId === 'evaluateTower') return `f(${value('parameter')})`;
  if (item.operatorId === 'eulerTower') return `xD${identityTerm(item.parameter)}`;
  if (item.operatorId === 'resonanceTower') return `D²${identityTerm(item.parameter)}`;
  return OPERATORS[item.operatorId]?.name ?? '單體算子';
}

function enemyLabel(enemyItem) {
  const body = formulaText(enemyItem.expression);
  const mutations = [
    hasAffix(enemyItem, 'fast') ? '快進變異' : null,
    hasAffix(enemyItem, 'split') ? '分裂變異' : null,
  ].filter(Boolean);
  const mutationText = mutations.length ? `，${mutations.join('、')}` : '';
  const action = draggingTargetOperator.value
    ? `放開以施作 ${draggedOperator.value.name}`
    : props.state.targetingOperator
      ? `點擊施作 ${targetingLabel()}`
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
        'has-drag-targeting': draggingTargetOperator,
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
            'is-drag-placeable': cell.placement && draggingTower && !occupied(cell.row, cell.column),
            'is-drag-invalid': cell.placement && draggingTower && occupied(cell.row, cell.column),
            'is-tutorial-target': isTutorialTargetCell(cell),
          }"
          type="button"
          :disabled="!cell.placement"
          :aria-label="cellLabel(cell)"
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
            'is-recycle-target': recycleTargeting,
            'is-recycle-over': dragOverTowerId === tower.id,
          }"
          type="button"
          :style="laneStyle(tower.row, tower.position)"
          :aria-label="towerLabel(tower)"
          aria-keyshortcuts="Delete"
          :data-recycle-tower-id="tower.id"
          @click="$emit('tower', tower.id)"
        >
          <span class="tower-sprite" :class="OPERATORS[tower.typeId].art" aria-hidden="true"></span>
          <span v-if="!tower.active" class="tower-error-badge" aria-hidden="true">
            <b>運算錯誤停火</b><small>重新裝填</small>
          </span>
          <span class="tower-status"><i :style="{ width: `${Math.max(0, tower.hp / tower.maxHp) * 100}%` }"></i></span>
        </button>
      </div>

      <div class="enemy-layer" data-layer="enemies">
        <button
          v-for="enemyItem in state.enemies"
          :key="enemyItem.id"
          class="enemy"
          data-action="enemy"
          :data-enemy-id="enemyItem.id"
          :data-stack-slot="enemyPresentation.get(enemyItem.id)?.slot ?? 0"
          :data-cluster-size="enemyPresentation.get(enemyItem.id)?.clusterSize ?? 1"
          :data-shield-active="enemyItem.shieldExpression ? 'true' : 'false'"
          :data-row="enemyItem.row"
          :data-position="enemyItem.position"
          :data-body-expression="formulaText(enemyItem.expression)"
          :data-active-expression="formulaText(activeEnemyExpression(enemyItem))"
          :class="{
            'is-selected': state.selectedEnemyId === enemyItem.id,
            'is-targetable': Boolean(state.targetingOperator),
            'is-drag-targetable': draggingTargetOperator,
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
      </div>

      <div class="effect-layer" data-layer="effects" aria-hidden="true">
        <span
          v-for="effect in state.effects"
          :key="effect.id"
          :class="effectClass(effect)"
          :style="effectStyle(effect)"
          :data-effect-id="effect.id"
          :data-operator="effect.operatorId"
          :data-status="effect.status"
          :data-trajectory="effect.trajectory"
          :data-target-id="effect.targetId"
          :data-impact-target-id="effect.impactTargetId"
          :data-projectile-position="effect.currentPosition"
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
          <span>{{ targetingLabel() }}：選一隻敵人</span>
          <button type="button" data-action="cancel" @click="$emit('cancel')">取消</button>
        </template>
      </div>

      <div class="tutorial-anchor" data-bind="tutorial">
        <article v-if="state.tutorialVisible && state.phase !== 'intro'" class="tutorial-card" aria-live="polite">
          <button class="icon-button" type="button" data-action="dismiss-tutorial" aria-label="關閉教學" @click="$emit('dismiss-tutorial')">
            <GameIcon name="close" />
          </button>
          <strong>{{ state.currentWave?.kind === 'tutorial' ? tutorialPromptTitle : '從軍械庫選擇適合的算子' }}</strong>
          <p>{{ state.currentWave?.kind === 'tutorial' ? tutorialPrompt : '第一關用加減捲軸精準消去常數；後續砲台只攻擊同一路。注意敵人的函數族與變異徽章。' }}</p>
          <button class="secondary-button" type="button" data-action="dismiss-tutorial" @click="$emit('dismiss-tutorial')">知道了</button>
        </article>
      </div>
    </div>

  </section>
</template>
