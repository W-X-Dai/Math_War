<script setup>
import { computed } from 'vue';

import { OPERATORS, OPERATOR_QUEUE_CAPACITY, OPERATOR_QUEUE_INTERVAL } from '../game/content.js';
import { formatValue } from '../ui/format.js';
import { identityTerm, subtractLabel } from '../ui/projectile.js';

const props = defineProps({
  state: { type: Object, required: true },
  dragPayload: { type: Object, default: null },
});

defineEmits(['select']);

const cards = computed(() => props.state.operatorQueue.map((item, index) => ({
  ...item,
  index,
  operator: OPERATORS[item.operatorId],
})).filter((item) => item.operator));
const queueFull = computed(() => cards.value.length >= OPERATOR_QUEUE_CAPACITY);
const refillProgress = computed(() => {
  if (queueFull.value) return 100;
  return Math.max(0, Math.min(100, ((OPERATOR_QUEUE_INTERVAL - props.state.operatorCooldown) / OPERATOR_QUEUE_INTERVAL) * 100));
});
const selectionHint = computed(() => {
  const item = props.state.operatorQueue.find((candidate) => candidate.id === props.state.selectedOperatorItemId);
  const operator = item ? OPERATORS[item.operatorId] : null;
  if (operator?.kind === 'tower') return `${operator.name}：點擊發亮格子部署`;
  if (props.state.targetingOperator) return `${cardSymbol(item)}：點擊一隻敵人`;
  if (props.state.partialConfirmOpen) return '確認全場算式變化後施放';
  if (props.state.selectedStoredConstantId) return '已選常數：點擊一張參數捲軸刻寫';
  return `數字鍵 1–${OPERATOR_QUEUE_CAPACITY} 選牌；通過檢查並發射時才消耗`;
});

function usage(operator) {
  if (operator.kind === 'tower') return '砲台・放置後消耗';
  if (operator.parameterKeys?.length) return operator.parameterKeys.length > 1 ? '單體・雙參數捲軸' : '單體・參數捲軸';
  return operator.kind === 'global' ? '全場・一次性' : '單體・一次性';
}

function parameterScrollReady(item) {
  const keys = item.operator.parameterKeys ?? [];
  return keys.length > 0 && keys.every((key) => item[key] !== null && item[key] !== undefined);
}

function cardSymbol(item) {
  if (!item?.operator) return '單體算子';
  const value = (key) => (
    item[key] === null || item[key] === undefined ? '[ ]' : formatValue(item[key])
  );
  if (item.operatorId === 'subtract') return `P(x)${subtractLabel(item.parameter)}`;
  if (item.operatorId === 'definiteIntegralTower') return `∫ ${value('lowerBound')}→${value('upperBound')}`;
  if (item.operatorId === 'evaluateTower') return `f(${value('parameter')})`;
  if (item.operatorId === 'eulerTower') return `xD${identityTerm(item.parameter)}`;
  if (item.operatorId === 'resonanceTower') return `D²${identityTerm(item.parameter)}`;
  return item.operator.symbol;
}

function isSelected(item) {
  return props.state.selectedOperatorItemId === item.id;
}
</script>

<template>
  <section class="operator-dock" aria-labelledby="operator-heading">
    <div id="operator-heading" class="dock-heading">
      <strong>軍械 Queue</strong>
      <span>{{ selectionHint }}</span>
      <span class="arsenal-meter">{{ cards.length }} / {{ OPERATOR_QUEUE_CAPACITY }}</span>
    </div>
    <div class="operator-scroll" data-bind="operatorQueue">
      <button
        v-for="item in cards"
        :key="item.id"
        class="operator-card"
        data-action="operator"
        :data-operator="item.operatorId"
        :data-item-id="item.id"
        :data-parameter-ready="item.operator.parameterKeys?.length ? String(parameterScrollReady(item)) : undefined"
        data-drag-kind="arsenal"
        :data-drag-id="item.id"
        draggable="true"
        aria-keyshortcuts="Delete"
        :class="{
          'is-consumable': item.operator.kind !== 'tower',
          'is-parameter-scroll': Boolean(item.operator.parameterKeys?.length),
          'is-scroll-ready': parameterScrollReady(item),
          'is-unaffordable': state.energy < item.operator.cost,
          'is-selected': isSelected(item),
          'is-dragging': dragPayload?.kind === 'arsenal' && dragPayload.id === item.id,
        }"
        type="button"
        :aria-pressed="isSelected(item)"
        :title="item.operator.description"
        @click="$emit('select', item.id)"
      >
        <span class="operator-key">{{ item.index < OPERATOR_QUEUE_CAPACITY ? item.index + 1 : '·' }}</span>
        <span v-if="item.source === 'guaranteed'" class="guaranteed-card-badge">保障</span>
        <span class="operator-art" :class="item.operator.art" aria-hidden="true"></span>
        <span class="operator-copy">
          <span class="operator-name"><b>{{ cardSymbol(item) }}</b> {{ item.operator.name }}</span>
          <span class="operator-desc">{{ usage(item.operator) }}</span>
        </span>
        <span class="operator-cost">Σ {{ item.operator.cost }}</span>
      </button>
      <div v-if="!cards.length" class="operator-empty">軍械補給中⋯</div>
    </div>
    <div class="arsenal-cooldown" :class="{ 'is-full': queueFull }">
      <span>{{ queueFull ? 'Queue 已滿，補給暫停' : `下一張 ${Math.max(0, state.operatorCooldown).toFixed(1)}s` }}</span>
      <i><b :style="{ width: `${refillProgress}%` }"></b></i>
    </div>
  </section>
</template>
