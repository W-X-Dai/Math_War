<script setup>
import { computed } from 'vue';

import GameIcon from './GameIcon.vue';

const props = defineProps({
  state: { type: Object, required: true },
});

defineEmits(['start-wave']);

const isTutorialWave = computed(() => props.state.currentWave?.kind === 'tutorial');
const tutorialsRead = computed(() => (
  !(props.state.enemyTutorialQueue?.length) && !(props.state.weaponTutorialQueue?.length)
));
const canStart = computed(() => (
  props.state.phase === 'preparing' && !props.state.paused && tutorialsRead.value
));
const remainingSeconds = computed(() => Math.max(0, Math.ceil(props.state.prepRemaining)));
const earlyBonus = computed(() => Math.min(150, remainingSeconds.value * 5));
const summary = computed(() => props.state.currentWave?.summary ?? {});
const familyLabels = computed(() => (
  summary.value.families?.map((family) => family.label).join('、') || '分析中'
));
</script>

<template>
  <footer class="bottom-bar" :class="{ 'is-preparing': state.phase === 'preparing', 'is-tutorial-wave': isTutorialWave }">
    <template v-if="state.phase === 'preparing'">
      <section class="prep-status" aria-live="polite">
        <div class="prep-clock">
          <span>{{ isTutorialWave ? '教學整備' : '整備倒數' }}</span>
          <strong data-bind="prepRemaining">{{ remainingSeconds }}<small>s</small></strong>
        </div>
        <div v-if="isTutorialWave" class="wave-intel tutorial-wave-intel" data-bind="waveSummary">
          <span class="tutorial-wave-badge">固定教學波</span>
          <span class="tutorial-objective">目標：{{ state.currentWave?.objective ?? '觀察新敵人，使用預置軍械將公式化為 0。' }}</span>
          <span><b>{{ summary.total ?? state.currentWave?.entries?.length ?? 0 }}</b> 隻固定敵人</span>
        </div>
        <div v-else class="wave-intel" data-bind="waveSummary">
          <span><b>{{ summary.total ?? state.currentWave?.entries?.length ?? 0 }}</b> 隻敵人</span>
          <span>函數族：{{ familyLabels }}</span>
          <span>變異：{{ summary.mutationCount ?? 0 }}</span>
          <span class="danger-level">危險度 {{ summary.danger ?? '—' }}</span>
        </div>
        <div v-if="isTutorialWave" class="early-bonus tutorial-loadout">
          <span>本波配置</span>
          <strong>教學預置</strong>
        </div>
        <div v-else class="early-bonus">
          <span>提早部署獎勵</span>
          <strong>Σ {{ earlyBonus }}</strong>
        </div>
      </section>
    </template>
    <p v-else data-bind="waveHint">{{ isTutorialWave ? `教學目標：${state.currentWave?.objective ?? '觀察新敵人，使用預置軍械將公式化為 0。'}` : (state.currentWave?.hint ?? '觀察函數族與變異，選擇正確的算子。') }}</p>
    <button
      class="primary-button"
      type="button"
      data-action="start-wave"
      data-bind-button="startWave"
      :hidden="!canStart"
      :disabled="!canStart"
      @click="$emit('start-wave')"
    >
      <span data-bind="startWaveLabel">{{ isTutorialWave ? '開始教學波' : '提早開始' }}</span><GameIcon name="arrow" />
    </button>
  </footer>
</template>
