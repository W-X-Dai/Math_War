<script setup>
import { computed } from 'vue';

import { GAMEPLAY_CONFIG } from '../config/gameplay.js';
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
const awardsEarlyStart = computed(() => (
  !isTutorialWave.value && props.state.currentWave?.awardsEarlyStart !== false
));
const earlyBonus = computed(() => Math.min(
  GAMEPLAY_CONFIG.economy.earlyStartEnergyCap,
  remainingSeconds.value * GAMEPLAY_CONFIG.economy.earlyStartEnergyPerSecond,
));
const summary = computed(() => props.state.currentWave?.summary ?? {});

const FAMILY_LABELS = {
  polynomial: '多項式',
  constant: '常數',
  higherOrder: '高階多項式',
  multivariable: '多變數',
  rational: '分式',
  logarithmic: '對數',
  trigonometric: '三角式',
  exponential: '指數式',
  mixed: '混合',
};

const familyLabels = computed(() => (
  summary.value.families?.map((family) => (
    family?.label ?? FAMILY_LABELS[family?.id ?? family] ?? family?.id ?? family
  )).filter(Boolean).join('、') || '分析中'
));

const AFFIX_LABELS = {
  fast: '快進',
  shield: '護盾',
  split: '分裂',
};

function itemLabel(item, labels = {}) {
  if (item && typeof item === 'object') return item.label ?? labels[item.id] ?? item.id ?? '';
  return labels[item] ?? String(item ?? '');
}

function rangeLabel(value) {
  if (value === null || value === undefined || value === '') return '';
  if (Array.isArray(value)) {
    if (value.length === 1) return rangeLabel(value[0]);
    const first = rangeLabel(value[0]);
    const last = rangeLabel(value[value.length - 1]);
    return first === last ? first : `${first}–${last}`;
  }
  if (typeof value === 'object') {
    if (value.label) return value.label;
    if (value.values) return rangeLabel(value.values);
    const minimum = value.min ?? value.minimum ?? value.from;
    const maximum = value.max ?? value.maximum ?? value.to;
    if (minimum !== undefined || maximum !== undefined) {
      return rangeLabel([minimum ?? maximum, maximum ?? minimum]);
    }
  }
  const signs = { positive: '成長', negative: '衰減', mixed: '正負皆有', '+': '成長', '-': '衰減' };
  return signs[value] ?? String(value);
}

function laneNumber(lane, index) {
  const row = Number(lane.row ?? lane.laneIndex);
  if (Number.isFinite(row)) return row + 1;
  const explicitLane = Number(lane.lane);
  return Number.isFinite(explicitLane) ? explicitLane : index + 1;
}

function inferredGrowthDirection(value) {
  const rawValues = Array.isArray(value)
    ? value
    : [value?.min ?? value?.minimum ?? value?.from, value?.max ?? value?.maximum ?? value?.to];
  const values = rawValues.map(Number).filter(Number.isFinite);
  if (!values.length) return '';
  if (values.every((number) => number < 0)) return '衰減';
  if (values.every((number) => number > 0)) return '成長';
  return '正負皆有';
}

const laneSummaries = computed(() => (summary.value.lanes ?? []).map((lane, index) => {
  const family = lane.mainFamily ?? lane.family ?? lane.families?.[0];
  const familyIds = (lane.families ?? [lane.family ?? lane.mainFamily])
    .map((item) => item?.id ?? item)
    .filter(Boolean);
  const hasExponential = familyIds.includes('exponential');
  const hasTrigonometric = familyIds.includes('trigonometric');
  const powerRange = lane.powerRange ?? lane.powers;
  const frequencyRange = lane.frequencyRange ?? lane.frequencies;
  const signRange = lane.signRange
    ?? lane.rateSignRange
    ?? lane.growthSigns
    ?? lane.signs
    ?? (hasExponential ? inferredGrowthDirection(frequencyRange) : undefined);
  const rateLabel = hasExponential
    ? (hasTrigonometric ? '頻率／成長率' : '成長率')
    : '頻率';
  const details = [
    powerRange !== undefined ? `次方 ${rangeLabel(powerRange)}` : '',
    frequencyRange !== undefined ? `${rateLabel} ${rangeLabel(frequencyRange)}` : '',
    signRange !== undefined ? `方向 ${rangeLabel(signRange)}` : '',
  ].filter(Boolean);
  const rawAffixes = lane.possibleAffixes ?? lane.affixes ?? [];
  const affixes = Array.isArray(rawAffixes) ? rawAffixes : [rawAffixes];
  return {
    id: lane.id ?? lane.row ?? lane.lane ?? index,
    lane: laneNumber(lane, index),
    family: itemLabel(family, FAMILY_LABELS) || '函數',
    details,
    affixes: affixes.map((affix) => itemLabel(affix, AFFIX_LABELS)).filter(Boolean),
  };
}));

const segmentLabel = computed(() => {
  const wave = props.state.currentWave ?? {};
  const index = Number(wave.segmentIndex);
  if (!Number.isInteger(index) || index < 0 || index > 2) return '';
  const kindLabels = {
    recognition: '辨識', recognize: '辨識', intro: '辨識', '辨識': '辨識',
    pressure: '壓力', swarm: '壓力', '壓力': '壓力',
    mixed: '混合', mix: '混合', '混合': '混合',
  };
  const fallback = ['辨識', '壓力', '混合'][index];
  return `${index + 1}/3 ${kindLabels[wave.segmentKind] ?? fallback}`;
});

function supplyCount(value) {
  if (Array.isArray(value)) return value.length;
  if (typeof value === 'number') return value;
  if (value && typeof value === 'object') return Number(value.count) || 0;
  return 0;
}

const guaranteedSupply = computed(() => {
  const supply = props.state.currentWave?.guaranteedSupply;
  if (!supply) return null;
  const counts = {
    operators: supplyCount(supply.operators ?? supply.arsenal),
    formulas: supplyCount(supply.formulaIds ?? supply.formulas),
    constants: supplyCount(supply.constants ?? supply.kValues),
  };
  return Object.values(counts).some(Boolean) ? counts : null;
});
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
          <span v-if="segmentLabel" class="segment-badge">{{ segmentLabel }}</span>
          <span class="tutorial-wave-badge">固定教學波</span>
          <span class="tutorial-objective">目標：{{ state.currentWave?.objective ?? '觀察新敵人，使用預置軍械將公式化為 0。' }}</span>
          <span><b>{{ summary.total ?? state.currentWave?.entries?.length ?? 0 }}</b> 隻固定敵人</span>
        </div>
        <div v-else class="wave-intel wave-intel--detailed" data-bind="waveSummary">
          <div class="wave-intel-meta">
            <span v-if="segmentLabel" class="segment-badge">{{ segmentLabel }}</span>
            <span><b>{{ summary.total ?? state.currentWave?.entries?.length ?? 0 }}</b> 隻敵人</span>
            <span v-if="!laneSummaries.length">函數族：{{ familyLabels }}</span>
            <span v-if="!laneSummaries.length">變異：{{ summary.mutationCount ?? 0 }}</span>
            <span v-if="!laneSummaries.length" class="danger-level">危險度 {{ summary.danger ?? '—' }}</span>
            <span v-if="guaranteedSupply" class="guaranteed-supply-badge">
              <b>保障補給</b>
              軍械 {{ guaranteedSupply.operators }}・公式 {{ guaranteedSupply.formulas }}・k {{ guaranteedSupply.constants }}
            </span>
          </div>
          <ol v-if="laneSummaries.length" class="lane-intel-list" aria-label="各路主要反制情報">
            <li v-for="lane in laneSummaries" :key="lane.id">
              <b>第 {{ lane.lane }} 路</b>
              <strong>{{ lane.family }}</strong>
              <span v-if="lane.details.length">{{ lane.details.join('・') }}</span>
              <small v-if="lane.affixes.length">可能：{{ lane.affixes.join('／') }}</small>
            </li>
          </ol>
        </div>
        <div v-if="isTutorialWave" class="early-bonus tutorial-loadout">
          <span>本波配置</span>
          <strong>教學預置</strong>
        </div>
        <div v-else-if="awardsEarlyStart" class="early-bonus">
          <span>提早部署獎勵</span>
          <strong>Σ {{ earlyBonus }}</strong>
        </div>
        <div v-else class="early-bonus">
          <span>本章提早獎勵</span>
          <strong>已於壓力段結算</strong>
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
      <span data-bind="startWaveLabel">{{ isTutorialWave ? '開始教學波' : (awardsEarlyStart ? '提早開始' : '開始混合段') }}</span><GameIcon name="arrow" />
    </button>
  </footer>
</template>
