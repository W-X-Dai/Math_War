<script setup>
import { computed } from 'vue';

import { damage, differentiate, formatExpression } from '../domain/expression.js';
import { ENEMY_TYPES, OPERATORS } from '../game/content.js';
import { enemyThreat, selectedEnemy } from '../game/engine.js';
import { formatValue, prettyFormula } from '../ui/format.js';
import GameIcon from './GameIcon.vue';

const props = defineProps({
  state: { type: Object, required: true },
  dragPayload: { type: Object, default: null },
});

defineEmits(['place-tower', 'enemy', 'tower', 'cancel', 'dismiss-tutorial', 'close-formula']);

const board = computed(() => props.state.board ?? { rows: 5, columns: 8, placeableColumns: 5 });
const boardStyle = computed(() => ({
  '--grid-columns': board.value.columns,
  '--grid-rows': board.value.rows,
}));
const cells = computed(() => Array.from({ length: board.value.rows * board.value.columns }, (_, index) => ({
  row: Math.floor(index / board.value.columns),
  column: index % board.value.columns,
  placement: index % board.value.columns < board.value.placeableColumns,
})));

const trackedEnemy = computed(() => selectedEnemy(props.state));
const selectedStoredConstant = computed(() => (
  props.state.storedConstants?.find((item) => item.id === props.state.selectedStoredConstantId) ?? null
));
const nextDerivative = computed(() => (
  trackedEnemy.value ? differentiate(trackedEnemy.value.expression, 'x', 1) : null
));

const formulaText = (expression) => prettyFormula(formatExpression(expression));

// Keep the enemy's actual position untouched. Formula chips are laid out on a
// separate horizontal track so a fast cluster cannot cover the equations.
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
      const safeLeft = 8;
      const safeEnd = 75;
      const cardGap = 0.75;
      const chipWidth = Math.min(
        10.5,
        (safeEnd - safeLeft - (cardGap * (group.length - 1))) / group.length,
      );
      const safeRight = safeEnd - chipWidth;
      const spacing = group.length > 1
        ? chipWidth + cardGap
        : 0;
      const positions = group.map((enemyItem) => Number(enemyItem.position) || 0);
      const averagePosition = positions.reduce((sum, position) => sum + position, 0) / group.length;
      // These values mirror the battlefield path (16.5% + p × 78.5%) after
      // accounting for the workbench rail and the chip's 82% anchor.
      const naturalChipLeft = (position) => 17.25 + (position * 63.6);
      const groupWidth = spacing * (group.length - 1);
      const openTrack = safeRight - safeLeft - groupWidth;
      const laneStep = Math.min(11.25, openTrack / 2);
      const naturalStart = naturalChipLeft(averagePosition) - (groupWidth / 2);
      let laneOffset = ((row % 3) - 1) * laneStep;
      if (naturalStart < safeLeft + (laneStep * 2)) laneOffset = (row % 3) * laneStep;
      if (naturalStart > safeRight - groupWidth - (laneStep * 2)) laneOffset = -(row % 3) * laneStep;
      const desiredStart = Math.max(
        safeLeft,
        Math.min(safeRight - groupWidth, naturalStart + laneOffset),
      );
      group.forEach((enemyItem, index) => {
        layouts.set(enemyItem.id, {
          slot: index,
          order: index,
          row,
          chipOffset: desiredStart + (index * spacing) - naturalChipLeft(positions[index]),
          chipWidth: chipWidth < 10.5 ? chipWidth : null,
        });
      });
      group = [];
    };

    ordered.forEach((enemyItem) => {
      const previous = group[group.length - 1];
      if (previous && Math.abs((Number(enemyItem.position) || 0) - (Number(previous.position) || 0)) > 0.14) {
        flushGroup();
      }
      group.push(enemyItem);
    });
    flushGroup();
  }
  return layouts;
});

function occupied(row, column) {
  return props.state.towers.some((tower) => tower.row === row && tower.column === column);
}

function towerConfigurable(tower) {
  return ['subtract', 'definiteIntegralTower', 'evaluateTower', 'eulerTower', 'resonanceTower'].includes(tower.typeId);
}

function towerFilled(tower) {
  if (tower.typeId === 'subtract') return tower.parameter !== null;
  if (tower.typeId === 'definiteIntegralTower') return tower.lowerBound !== null && tower.upperBound !== null;
  if (['evaluateTower', 'eulerTower', 'resonanceTower'].includes(tower.typeId)) return tower.parameter !== null;
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
  const configurable = towerConfigurable(tower);
  const interaction = selectedStoredConstant.value && configurable
    ? `點擊裝入常數 ${selectedStoredConstant.value.value}`
    : tower.active ? '運作中，點擊停火' : '已停火，點擊恢復';
  return `${OPERATORS[tower.typeId]?.name ?? '數學砲台'}，耐久 ${Math.max(0, Math.ceil(tower.hp))}，${interaction}`;
}

function laneStyle(row, position) {
  return {
    '--x': `${position * 100}%`,
    '--row': row,
    '--lane-y': `${35 + ((row + 0.5) / board.value.rows) * 50}%`,
  };
}

function enemyStyle(enemyItem) {
  const layout = enemyPresentation.value.get(enemyItem.id) ?? {
    slot: 0, order: 0, chipOffset: 0, chipWidth: null,
  };
  const style = {
    ...laneStyle(enemyItem.row, enemyItem.position),
    '--stack-slot': layout.slot,
    '--stack-x': `${layout.chipOffset}cqw`,
    zIndex: 20 + layout.order,
  };
  if (layout.chipWidth !== null) style['--chip-width'] = `${layout.chipWidth}cqw`;
  return style;
}

function enemyType(enemyItem) {
  const fallback = ENEMY_TYPES[enemyItem.typeId] ?? {};
  return {
    name: enemyItem.name ?? fallback.name ?? '函數敵人',
    art: enemyItem.art ?? fallback.art ?? 'enemy-art-polynomial',
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

function mutationBadges(enemyItem) {
  const labels = { fast: '快進', shield: '等式護盾', split: '分裂' };
  return (enemyItem.affixes ?? []).map((id) => ({
    id,
    label: id === 'shield' && !enemyItem.shieldActive ? '護盾破除' : (labels[id] ?? id),
    spent: id === 'shield' && !enemyItem.shieldActive,
  }));
}

function effectClass(effect) {
  return effect.type.includes('projectile')
    ? ['projectile', effect.type]
    : ['combat-float', effect.type];
}

function effectStyle(effect) {
  const style = {
    '--row': effect.row,
    '--x': `${(effect.position ?? 0.5) * 100}%`,
    '--lane-y': effect.row >= 0
      ? `${35 + ((effect.row + 0.5) / board.value.rows) * 50}%`
      : '14%',
  };
  if (effect.from !== undefined) style['--from'] = `${effect.from * 100}%`;
  return style;
}
</script>

<template>
  <section class="battle-stage" :aria-label="`${board.rows} 路函數戰場`">
    <div class="battlefield" data-bind="battlefield" :style="boardStyle" :class="{ 'has-targeting': Boolean(state.targetingOperator) }">
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
            'is-paused': !tower.active,
            'is-configurable': towerConfigurable(tower),
            'is-filled': towerConfigurable(tower) && towerFilled(tower),
            'is-awaiting-assembly': towerConfigurable(tower) && Boolean(selectedStoredConstant),
            'is-dragging': dragPayload?.kind === 'tower' && dragPayload.id === tower.id,
          }"
          type="button"
          :style="laneStyle(tower.row, tower.position)"
          :aria-label="towerLabel(tower)"
          aria-keyshortcuts="Delete"
          draggable="true"
          data-drag-kind="tower"
          :data-drag-id="tower.id"
          @click="$emit('tower', tower.id)"
        >
          <span class="tower-sprite" :class="OPERATORS[tower.typeId].art" aria-hidden="true"></span>
          <span class="tower-slot" aria-hidden="true">{{ towerSlot(tower) }}</span>
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
          :class="{
            'is-selected': state.selectedEnemyId === enemyItem.id,
            'is-targetable': Boolean(state.targetingOperator),
            'is-divergent': enemyItem.divergentTimer > 0,
            'is-hit': enemyItem.hitFlash > 0,
          }"
          type="button"
          :style="enemyStyle(enemyItem)"
          :aria-label="`${enemyType(enemyItem).name}，${familyLabel(enemyItem)}，${formulaText(enemyItem.expression)}，目前攻擊 ${enemyThreat(enemyItem)}，點擊查看公式`"
          @click="$emit('enemy', enemyItem.id)"
        >
          <span class="enemy-sprite" :class="enemyType(enemyItem).art" aria-hidden="true"></span>
          <span class="enemy-chip" :title="formulaText(enemyItem.expression)">
            <span class="enemy-badges">
              <small class="family-badge">{{ familyLabel(enemyItem) }}</small>
              <small
                v-for="mutation in mutationBadges(enemyItem)"
                :key="mutation.id"
                class="mutation-badge"
                :class="[`is-${mutation.id}`, { 'is-spent': mutation.spent }]"
              >{{ mutation.label }}</small>
            </span>
            <strong class="enemy-formula">{{ formulaText(enemyItem.expression) }}</strong>
            <span class="enemy-meta">
              <span class="damage-value" data-enemy-damage>攻擊 {{ enemyThreat(enemyItem) }}</span>
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
          :data-equation="effect.equation ? prettyFormula(effect.equation) : undefined"
        >{{ effect.label ?? '' }}</span>
      </div>

      <div class="wave-banner" data-bind="waveBanner" :class="{ 'is-visible': state.bannerTimer > 0 }" aria-live="polite">
        {{ state.bannerTimer > 0 ? (state.currentWave?.name ?? (state.chapterIndex === 6 ? `無限第 ${state.endlessRound} 輪` : `第 ${state.chapterIndex + 1} 章`)) : '' }}
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
          <strong>先從軍械 Queue 選一張 D</strong>
          <p>砲台只攻擊同一路；卡片成功使用才會消耗。注意敵人的函數族與變異徽章。</p>
          <button class="secondary-button" type="button" data-action="dismiss-tutorial" @click="$emit('dismiss-tutorial')">知道了</button>
        </article>
      </div>
    </div>

    <aside class="formula-panel" data-bind="formulaPanel" :class="{ 'has-selection': trackedEnemy }" :hidden="!trackedEnemy">
      <template v-if="trackedEnemy">
        <div class="formula-panel-head">
          <span>公式追蹤</span>
          <button class="icon-button" type="button" data-action="close-formula" aria-label="關閉公式追蹤" @click="$emit('close-formula')">
            <GameIcon name="close" />
          </button>
        </div>
        <div class="formula-row"><span>目前</span><strong>{{ formulaText(trackedEnemy.expression) }}</strong></div>
        <div class="formula-row"><span>下一發 D</span><strong>{{ formulaText(nextDerivative) }}</strong></div>
        <div class="formula-row"><span>係數絕對值總和</span><strong class="damage-value">{{ formatValue(damage(trackedEnemy.expression)) }}</strong></div>
        <div class="formula-row"><span>距離基地</span><strong>{{ Math.max(0, ((trackedEnemy.position - 0.125) * 8.7)).toFixed(1) }} 格</strong></div>
      </template>
    </aside>
  </section>
</template>
