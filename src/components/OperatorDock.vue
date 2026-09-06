<script setup>
import { computed } from 'vue';

import { OPERATORS, OPERATOR_QUEUE_CAPACITY, OPERATOR_QUEUE_INTERVAL } from '../game/content.js';
import { formatValue } from '../ui/format.js';
import {
  addLabel,
  divideLabel,
  identityTerm,
  multiplyLabel,
  subtractLabel,
} from '../ui/projectile.js';

const props = defineProps({
  state: { type: Object, required: true },
  dragPayload: { type: Object, default: null },
  dragOverItemId: { type: String, default: null },
});

defineEmits(['select']);

const towerCards = computed(() => props.state.operatorQueue
  .filter((item) => OPERATORS[item.operatorId]?.kind === 'tower')
  .map((item, index) => ({ ...item, index, operator: OPERATORS[item.operatorId] })));
const scrollCards = computed(() => (props.state.scrollLibrary ?? []).map((item) => ({
  ...item,
  index: null,
  operator: OPERATORS[item.operatorId],
})));
const cards = computed(() => [...towerCards.value, ...scrollCards.value]);
const hasTowerSupply = computed(() => Object.values(OPERATORS).some((operator) => (
  operator.kind === 'tower' && operator.unlockChapter <= props.state.chapterIndex
)));
const libraries = computed(() => [
  {
    id: 'tower-queue',
    title: '一般武器工房',
    meter: `${towerCards.value.length} / ${OPERATOR_QUEUE_CAPACITY}`,
    items: towerCards.value,
    empty: '砲台補給中⋯',
    binding: 'operatorQueue',
  },
  {
    id: 'scroll-library',
    title: '無限捲軸庫',
    meter: '∞ ・施放扣算力',
    items: scrollCards.value,
    empty: '本關尚未解鎖捲軸',
    binding: 'scrollLibrary',
  },
].filter((library) => library.id !== 'tower-queue' || hasTowerSupply.value));
const queueFull = computed(() => towerCards.value.length >= OPERATOR_QUEUE_CAPACITY);
const refillProgress = computed(() => {
  if (queueFull.value) return 100;
  return Math.max(0, Math.min(100, ((OPERATOR_QUEUE_INTERVAL - props.state.operatorCooldown) / OPERATOR_QUEUE_INTERVAL) * 100));
});
const selectionHint = computed(() => {
  const item = cards.value.find((candidate) => candidate.id === props.state.selectedOperatorItemId);
  const operator = item ? OPERATORS[item.operatorId] : null;
  if (operator?.kind === 'tower') return `${operator.name}：點擊發亮格子部署`;
  if (props.state.targetingOperator) return `${cardSymbol(item)}：點擊一隻敵人`;
  if (props.state.partialConfirmOpen) return '確認全場算式變化後施放';
  if (props.state.selectedStoredConstantId) return '已選常數：點擊一張參數捲軸刻寫';
  return hasTowerSupply.value
    ? `拖曳砲台到格子、捲軸到敵人；砲台亦可用數字鍵 1–${OPERATOR_QUEUE_CAPACITY}`
    : '先把圓盤或常數拖到加減捲軸，再把捲軸拖到常數怪物';
});

function parameterScrollReady(item) {
  const keys = item.operator.parameterKeys ?? [];
  return keys.length > 0 && keys.every((key) => item[key] !== null && item[key] !== undefined);
}

function canDragToBattlefield(item) {
  if (['tower', 'global'].includes(item.operator.kind)) return true;
  return !item.operator.parameterKeys?.length || parameterScrollReady(item);
}

function cardSymbol(item) {
  if (!item?.operator) return '單體算子';
  const value = (key) => (
    item[key] === null || item[key] === undefined ? '[ ]' : formatValue(item[key])
  );
  if (item.operatorId === 'add') return `P(x)${addLabel(item.parameter)}`;
  if (item.operatorId === 'subtract') return `P(x)${subtractLabel(item.parameter)}`;
  if (item.operatorId === 'multiply') return `P(x)${multiplyLabel(item.parameter)}`;
  if (item.operatorId === 'divide') return `P(x)${divideLabel(item.parameter)}`;
  if (item.operatorId === 'definiteIntegralTower') return `∫ ${value('lowerBound')}→${value('upperBound')}`;
  if (item.operatorId === 'evaluateTower') return `f(${value('parameter')})`;
  if (item.operatorId === 'eulerTower') return `xD${identityTerm(item.parameter)}`;
  if (item.operatorId === 'resonanceTower') return `D²${identityTerm(item.parameter)}`;
  return item.operator.symbol;
}

function resourceGlyph(item) {
  if (item.operatorId === 'derivative') return 'd/dx';
  if (item.operatorId === 'secondDerivative') return 'd²/dx²';
  return cardSymbol(item);
}

function isSelected(item) {
  return props.state.selectedOperatorItemId === item.id;
}
</script>

<template>
  <section class="operator-dock" aria-label="戰術軍械">
    <div class="operator-libraries">
      <section v-for="library in libraries" :key="library.id" class="operator-library" :class="`operator-library--${library.id}`" :aria-labelledby="`${library.id}-heading`">
        <div :id="`${library.id}-heading`" class="dock-heading">
          <strong>{{ library.title }}</strong>
          <span class="arsenal-meter">{{ library.meter }}</span>
        </div>
        <div class="operator-scroll" :data-bind="library.binding">
          <button
            v-for="item in library.items"
            :key="item.id"
            class="operator-card"
            data-action="operator"
            :data-operator="item.operatorId"
            :data-item-id="item.id"
            :data-parameter-ready="item.operator.parameterKeys?.length ? String(parameterScrollReady(item)) : undefined"
            :data-drag-kind="canDragToBattlefield(item) ? 'arsenal' : undefined"
            :data-drag-id="canDragToBattlefield(item) ? item.id : undefined"
            :draggable="canDragToBattlefield(item)"
            :aria-keyshortcuts="item.operator.kind === 'tower' ? 'Delete' : undefined"
            :class="{
              'is-tower-card': item.operator.kind === 'tower',
              'is-scroll-card': item.operator.kind !== 'tower',
              'is-unlimited': item.operator.kind !== 'tower',
              'is-parameter-scroll': Boolean(item.operator.parameterKeys?.length),
              'is-scroll-ready': parameterScrollReady(item),
              'is-unaffordable': state.energy < item.operator.cost,
              'is-selected': isSelected(item),
              'is-dragging': dragPayload?.kind === 'arsenal' && dragPayload.id === item.id,
              'is-constant-drop-target': ['stored-constant', 'numeric-constant'].includes(dragPayload?.kind) && Boolean(item.operator.parameterKeys?.length) && !parameterScrollReady(item),
              'is-drop-over': dragOverItemId === item.id,
            }"
            type="button"
            :aria-pressed="isSelected(item)"
            :aria-label="`${item.operator.name}，${resourceGlyph(item)}，算力 ${item.operator.cost}`"
            :title="item.operator.description"
            @click="$emit('select', item.id)"
          >
            <span v-if="item.operator.kind === 'tower'" class="operator-key">{{ item.index + 1 }}</span>
            <span v-if="item.source === 'guaranteed'" class="guaranteed-card-badge">保障</span>
            <span class="resource-glyph" aria-hidden="true">{{ resourceGlyph(item) }}</span>
            <span class="operator-cost operator-cost--compact">Σ {{ item.operator.cost }}</span>
          </button>
          <div v-if="!library.items.length" class="operator-empty">{{ library.empty }}</div>
        </div>
      </section>
    </div>
    <div v-if="hasTowerSupply" class="arsenal-cooldown" :class="{ 'is-full': queueFull }">
      <span class="dock-selection-hint">{{ selectionHint }}</span>
      <span>{{ queueFull ? '一般武器已滿，補給暫停' : `下一張砲台 ${Math.max(0, state.operatorCooldown).toFixed(1)}s` }}</span>
      <i><b :style="{ width: `${refillProgress}%` }"></b></i>
    </div>
  </section>
</template>
