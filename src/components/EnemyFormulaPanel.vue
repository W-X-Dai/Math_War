<script setup>
import { computed } from 'vue';

import { GAMEPLAY_CONFIG } from '../config/gameplay.js';
import { PRESENTATION_CONFIG } from '../config/presentation.js';
import { damage, differentiate, formatExpression } from '../domain/expression.js';
import { activeEnemyExpression, selectedEnemy } from '../game/engine.js';
import { formatValue, prettyFormula } from '../ui/format.js';
import GameIcon from './GameIcon.vue';

const props = defineProps({
  state: { type: Object, required: true },
});

defineEmits(['close']);

const trackedEnemy = computed(() => selectedEnemy(props.state));
const trackedActiveExpression = computed(() => (
  trackedEnemy.value ? activeEnemyExpression(trackedEnemy.value) : null
));
const nextDerivative = computed(() => (
  trackedActiveExpression.value ? differentiate(trackedActiveExpression.value, 'x', 1) : null
));

const formulaText = (expression) => prettyFormula(formatExpression(expression));
const enemyDistance = (position) => Math.max(
  0,
  (position - GAMEPLAY_CONFIG.geometry.basePosition) * PRESENTATION_CONFIG.battlefield.distanceScale,
).toFixed(1);
</script>

<template>
  <aside
    class="formula-panel enemy-formula-panel"
    data-bind="formulaPanel"
    :class="{ 'has-selection': trackedEnemy }"
    :hidden="!trackedEnemy"
    :aria-hidden="trackedEnemy ? undefined : 'true'"
    aria-labelledby="enemy-formula-panel-title"
  >
    <template v-if="trackedEnemy">
      <div class="formula-panel-head">
        <h2 id="enemy-formula-panel-title">公式追蹤</h2>
        <button class="icon-button" type="button" data-action="close-formula" aria-label="關閉公式追蹤" @click="$emit('close')">
          <GameIcon name="close" />
        </button>
      </div>
      <div v-if="trackedEnemy.shieldExpression" class="formula-row" data-expression-layer="shield">
        <span>目前護盾</span><strong>{{ formulaText(trackedEnemy.shieldExpression) }}</strong>
      </div>
      <div class="formula-row" data-expression-layer="body">
        <span>{{ trackedEnemy.shieldExpression ? '敵人本體' : '目前本體' }}</span><strong>{{ formulaText(trackedEnemy.expression) }}</strong>
      </div>
      <div class="formula-row">
        <span>下一發 D（{{ trackedEnemy.shieldExpression ? '護盾' : '本體' }}）</span><strong>{{ formulaText(nextDerivative) }}</strong>
      </div>
      <div class="formula-row">
        <span>本體攻擊（係數絕對值總和）</span><strong class="damage-value">{{ formatValue(damage(trackedEnemy.expression)) }}</strong>
      </div>
      <div class="formula-row">
        <span>距離基地</span><strong>{{ enemyDistance(trackedEnemy.position) }} 格</strong>
      </div>
    </template>
  </aside>
</template>
