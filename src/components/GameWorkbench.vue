<script setup>
import { computed } from 'vue';

import {
  CONSTANT_QUEUE_CAPACITY,
  CONSTANT_QUEUE_INTERVAL,
  FORMULA_QUEUE_CAPACITY,
  FORMULA_QUEUE_INTERVAL,
  STORED_CONSTANT_CAPACITY,
} from '../game/content.js';
import { constantQueueDetails, currentAssembly, formulaQueueDetails } from '../game/engine.js';
import { formatValue } from '../ui/format.js';
import GameIcon from './GameIcon.vue';

const props = defineProps({
  state: { type: Object, required: true },
  dragging: { type: Boolean, default: false },
  dragOver: { type: Boolean, default: false },
  dragPayload: { type: Object, default: null },
});

defineEmits(['pick-formula', 'pick-constant', 'pick-stored-constant', 'prepare-assembly']);

const formulas = computed(() => formulaQueueDetails(props.state));
const constants = computed(() => constantQueueDetails(props.state));
const assembly = computed(() => currentAssembly(props.state));
const storedConstants = computed(() => props.state.storedConstants ?? []);
const selectedStoredConstant = computed(() => storedConstants.value.find(
  (item) => item.id === props.state.selectedStoredConstantId,
) ?? null);
const formulaFull = computed(() => formulas.value.length >= FORMULA_QUEUE_CAPACITY);
const constantFull = computed(() => constants.value.length >= CONSTANT_QUEUE_CAPACITY);
const storedFull = computed(() => storedConstants.value.length >= STORED_CONSTANT_CAPACITY);
const formulaProgress = computed(() => formulaFull.value
  ? 100
  : ((FORMULA_QUEUE_INTERVAL - props.state.formulaCooldown) / FORMULA_QUEUE_INTERVAL) * 100);
const constantProgress = computed(() => constantFull.value
  ? 100
  : ((CONSTANT_QUEUE_INTERVAL - props.state.constantCooldown) / CONSTANT_QUEUE_INTERVAL) * 100);

const clampProgress = (value) => Math.max(0, Math.min(100, value));
</script>

<template>
  <aside class="workbench" data-bind="workbench" aria-labelledby="workbench-heading">
    <div class="workbench-title">
      <h2 id="workbench-heading">公式工坊</h2>
      <span>{{ formulas.length }} × {{ constants.length }} = {{ formulas.length * constants.length }} 種組合</span>
    </div>

    <div class="queue-columns">
      <section class="constant-queue" aria-label="上帝常數 queue">
        <div class="queue-head"><h3>上帝常數 k</h3><strong>{{ constants.length }} / {{ CONSTANT_QUEUE_CAPACITY }}</strong></div>
        <ol class="queue-track">
          <template v-if="constants.length">
            <li v-for="(item, index) in constants" :key="item.id">
              <button
                class="constant-token"
                :class="{
                  'is-top': index === 0,
                  'is-picked': item.selected,
                  'is-dragging': dragPayload?.kind === 'constant' && dragPayload.id === item.id,
                }"
                type="button"
                data-action="pick-constant"
                :data-item-id="item.id"
                data-drag-kind="constant"
                :data-drag-id="item.id"
                draggable="true"
                aria-keyshortcuts="Delete"
                :aria-pressed="item.selected"
                @click="$emit('pick-constant', item.id)"
              >
                <span>{{ index + 1 }}</span><strong><i>k</i> = {{ formatValue(item.value) }}</strong>
              </button>
            </li>
          </template>
          <li v-else class="queue-card is-empty">等待 k⋯</li>
        </ol>
        <div class="queue-cooldown">
          <span>{{ constantFull ? '已滿，暫停' : `${state.constantCooldown.toFixed(1)}s` }}</span>
          <i><b :style="{ width: `${clampProgress(constantProgress)}%` }"></b></i>
        </div>
      </section>

      <section class="formula-queue" aria-label="公式 queue">
        <div class="queue-head"><h3>公式</h3><strong>{{ formulas.length }} / {{ FORMULA_QUEUE_CAPACITY }}</strong></div>
        <ol class="queue-track">
          <template v-if="formulas.length">
            <li v-for="(card, index) in formulas" :key="card.id">
              <button
                class="formula-token"
                :class="{
                  'is-top': index === 0,
                  'is-picked': card.selected,
                  'is-dragging': dragPayload?.kind === 'formula' && dragPayload.id === card.id,
                }"
                type="button"
                data-action="pick-formula"
                :data-item-id="card.id"
                data-drag-kind="formula"
                :data-drag-id="card.id"
                draggable="true"
                aria-keyshortcuts="Delete"
                :aria-pressed="card.selected"
                @click="$emit('pick-formula', card.id)"
              >
                <span>{{ index + 1 }}</span><strong>{{ card.label }}</strong><small>→ {{ card.value === null ? '—' : formatValue(card.value) }}</small>
              </button>
            </li>
          </template>
          <li v-else class="queue-card is-empty">等待公式⋯</li>
        </ol>
        <div class="queue-cooldown">
          <span>{{ formulaFull ? '已滿，暫停' : `${state.formulaCooldown.toFixed(1)}s` }}</span>
          <i><b :style="{ width: `${clampProgress(formulaProgress)}%` }"></b></i>
        </div>
      </section>
    </div>

    <section class="stored-constant-library" aria-label="已組裝常數庫">
      <div class="queue-head">
        <h3>已組裝常數</h3>
        <strong>{{ storedConstants.length }} / {{ STORED_CONSTANT_CAPACITY }}</strong>
      </div>
      <div class="stored-constant-grid">
        <template v-if="storedConstants.length">
          <button
            v-for="(item, index) in storedConstants"
            :key="item.id"
            class="stored-constant-token"
            :class="{
              'is-picked': item.id === state.selectedStoredConstantId,
              'is-dragging': dragPayload?.kind === 'stored-constant' && dragPayload.id === item.id,
            }"
            type="button"
            data-action="pick-stored-constant"
            :data-item-id="item.id"
            data-drag-kind="stored-constant"
            :data-drag-id="item.id"
            draggable="true"
            aria-keyshortcuts="Delete"
            :aria-pressed="item.id === state.selectedStoredConstantId"
            :aria-label="`已組裝常數 ${formatValue(item.value)}，${item.source ?? '無來源'}${item.id === state.selectedStoredConstantId ? '，已選取' : ''}`"
            @click="$emit('pick-stored-constant', item.id)"
          >
            <span class="stored-constant-index">{{ index + 1 }}</span>
            <strong>{{ formatValue(item.value) }}</strong>
            <small>{{ item.source ?? '自訂組合' }}</small>
          </button>
        </template>
        <p v-else class="stored-constant-empty">組合公式與 k，最多保存五個常數。</p>
      </div>
    </section>

    <section
      class="assembly-preview"
      :class="{ 'is-empty': !assembly && !selectedStoredConstant, 'has-cartridge': selectedStoredConstant }"
    >
      <template v-if="assembly">
        <div>
          <span>{{ assembly.formula.label }}</span>
          <b class="assembly-arrow">｜k = {{ formatValue(assembly.constant.value) }} ⇒</b>
          <strong>{{ formatValue(assembly.value) }}</strong>
        </div>
        <button
          class="primary-button"
          type="button"
          data-action="prepare-assembly"
          :disabled="storedFull"
          :title="storedFull ? '常數庫已滿，請先安裝或丟棄一個常數' : '將組合結果保存到常數庫'"
          @click="$emit('prepare-assembly')"
        >{{ storedFull ? '常數庫已滿（5/5）' : '組裝並保存' }}</button>
      </template>
      <p v-else>兩條 queue 都有材料時即可組合；已組裝常數會跨章節保存。</p>
      <div v-if="selectedStoredConstant" class="selected-constant-hint">
        <span>已選常數</span>
        <strong>{{ formatValue(selectedStoredConstant.value) }}</strong>
        <small>點擊戰場上的參數塔安裝</small>
      </div>
    </section>

    <div
      class="trash-dropzone"
      :class="{ 'is-active': dragging, 'is-over': dragOver }"
      role="region"
      aria-label="垃圾桶；把軍械、公式、上帝常數、已組裝常數或砲台拖到這裡丟棄"
    >
      <GameIcon name="trash" /><span>拖到這裡丟棄</span><small>軍械／公式／k／已組裝常數／砲台 · 鍵盤可按 Delete</small>
    </div>
  </aside>
</template>
