<script setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';

import { CHAPTERS } from '../game/content.js';

const props = defineProps({
  state: {
    type: Object,
    required: true,
  },
  newlyUnlockedLabel: {
    type: String,
    default: '',
  },
  progressSaveFailed: {
    type: Boolean,
    default: false,
  },
});

defineEmits(['retry-same', 'retry-new', 'next', 'select-level']);

const dialogRoot = ref(null);
let previouslyFocused = null;
let inertTargets = [];

const visible = computed(() => props.state.phase === 'won' || props.state.phase === 'lost');
const won = computed(() => props.state.phase === 'won');
const endless = computed(() => (
  props.state.mode === 'endless' || props.state.chapterIndex >= CHAPTERS.length
));
const levelIndex = computed(() => (
  Number.isInteger(props.state.levelIndex) ? props.state.levelIndex : props.state.chapterIndex
));
const isLastFiniteLevel = computed(() => levelIndex.value === CHAPTERS.length - 1);

function focusableElements() {
  if (!dialogRoot.value) return [];
  return [...dialogRoot.value.querySelectorAll(
    'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])',
  )].filter((element) => !element.hasAttribute('hidden'));
}

function makeBackgroundInert() {
  if (typeof document === 'undefined' || !dialogRoot.value) return;
  const dialogContainer = [...document.body.children]
    .find((element) => element === dialogRoot.value || element.contains(dialogRoot.value));
  inertTargets = [...document.body.children]
    .filter((element) => element !== dialogContainer)
    .map((element) => ({ element, wasInert: element.inert }));
  for (const { element } of inertTargets) element.inert = true;
}

function restoreBackground() {
  for (const { element, wasInert } of inertTargets) element.inert = wasInert;
  inertTargets = [];
}

function handleKeydown(event) {
  if (event.key !== 'Tab') return;
  const elements = focusableElements();
  if (!elements.length) {
    event.preventDefault();
    dialogRoot.value?.focus();
    return;
  }
  const first = elements[0];
  const last = elements.at(-1);
  if (document.activeElement === dialogRoot.value) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

watch(visible, async (isVisible) => {
  if (isVisible) {
    previouslyFocused = document.activeElement;
    await nextTick();
    makeBackgroundInert();
    const initialFocus = dialogRoot.value?.querySelector('[data-initial-focus]')
      ?? focusableElements()[0]
      ?? dialogRoot.value;
    initialFocus?.focus();
    return;
  }
  restoreBackground();
  previouslyFocused?.focus?.();
  previouslyFocused = null;
}, { immediate: true, flush: 'post' });

onBeforeUnmount(() => {
  restoreBackground();
  previouslyFocused?.focus?.();
});
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      ref="dialogRoot"
      class="level-dialog-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-result-title"
      aria-describedby="game-result-description"
      tabindex="-1"
      @keydown="handleKeydown"
    >
      <article class="level-dialog result-dialog" :class="won ? 'is-won' : 'is-lost'">
        <div class="result-dialog-symbol" aria-hidden="true">{{ won ? '✓' : '≠' }}</div>
        <p class="level-select-kicker">{{ endless ? '無限證明' : `第 ${levelIndex + 1} 關` }}</p>
        <h2 id="game-result-title">{{ won ? '證明完成' : '推導中斷' }}</h2>
        <p id="game-result-description">
          {{ won
            ? '這條證明路徑已守住，成果已計入關卡進度。'
            : '有函數突破防線。你可以重現原題，或換一個 seed 重新證明。' }}
        </p>

        <dl class="result-stat-grid">
          <div>
            <dt>剩餘 HP</dt>
            <dd>{{ Math.max(0, state.baseHp) }} / {{ state.maxBaseHp }}</dd>
          </div>
          <div>
            <dt>消去數</dt>
            <dd>{{ state.kills }}</dd>
          </div>
          <div>
            <dt>最高連鎖</dt>
            <dd>×{{ state.maxChain }}</dd>
          </div>
          <div v-if="endless && !won">
            <dt>抵達輪次</dt>
            <dd>第 {{ Math.max(1, state.endlessRound) }} 輪</dd>
          </div>
          <div class="result-seed-stat">
            <dt>seed</dt>
            <dd>{{ state.runSeed }}</dd>
          </div>
        </dl>

        <p v-if="won && newlyUnlockedLabel" class="result-unlock-message">
          <strong>新解鎖</strong>{{ newlyUnlockedLabel }}
        </p>
        <p v-if="won && progressSaveFailed" class="result-save-warning" role="status">
          本次已解鎖，但瀏覽器無法保存，重新整理後可能遺失。
        </p>

        <div v-if="won" class="level-dialog-actions result-dialog-actions">
          <button class="secondary-button" type="button" @click="$emit('select-level')">返回選關</button>
          <button class="secondary-button" type="button" @click="$emit('retry-new')">重玩本關</button>
          <button
            v-if="!endless"
            class="primary-button"
            type="button"
            data-initial-focus
            @click="$emit('next')"
          >{{ isLastFiniteLevel ? '進入無限證明' : '前往下一關' }}</button>
        </div>

        <div v-else class="level-dialog-actions result-dialog-actions">
          <button class="secondary-button" type="button" @click="$emit('select-level')">返回選關</button>
          <button
            class="secondary-button"
            type="button"
            data-initial-focus
            @click="$emit('retry-same')"
          >原題重試</button>
          <button class="primary-button" type="button" @click="$emit('retry-new')">換一題</button>
        </div>
      </article>
    </div>
  </Teleport>
</template>
