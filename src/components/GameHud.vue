<script setup>
import { computed } from 'vue';

import GameIcon from './GameIcon.vue';

const CHAPTERS = ['多項式', '常數', '多項高階', '多變數', '對數分式', '三角指數'];

const props = defineProps({
  state: { type: Object, required: true },
});

defineEmits(['speed', 'sound', 'pause', 'restart']);

const chapterLabel = computed(() => (
  props.state.chapterIndex >= CHAPTERS.length
    ? `無限章・第 ${props.state.endlessRound} 輪`
    : `第 ${props.state.chapterIndex + 1} 章・${CHAPTERS[props.state.chapterIndex]}`
));
</script>

<template>
  <header class="top-hud">
    <div class="brand-lockup" aria-label="微分防線">
      <span class="brand-orbit" aria-hidden="true"><i></i></span>
      <span class="brand-title">微分防線</span>
    </div>
    <div class="hud-cluster">
      <div class="hud-stat base-hud"><span>基地</span><strong data-bind="base">{{ state.baseHp }} / {{ state.maxBaseHp }}</strong></div>
      <div class="wave-progress">
        <strong data-bind="wave">{{ chapterLabel }}</strong>
        <span class="wave-dots" data-bind="waveDots">
          <i
            v-for="index in 7"
            :key="index"
            :class="{ 'is-done': index - 1 < state.chapterIndex, 'is-current': index - 1 === state.chapterIndex }"
          >{{ index === 7 ? '∞' : '' }}</i>
        </span>
      </div>
      <div class="hud-stat energy-hud"><span>Σ</span><strong data-bind="energy">{{ state.energy }}</strong></div>
      <div class="hud-seed" data-bind="seed">seed {{ state.runSeed }}</div>
    </div>
    <div class="hud-actions">
      <button class="icon-button speed-button" type="button" data-action="speed" aria-label="切換遊戲速度" @click="$emit('speed')">
        <span data-bind="speed">×{{ state.speed }}</span>
      </button>
      <button class="icon-button" type="button" data-action="sound" data-bind-button="sound" :aria-label="state.sound ? '關閉音效' : '開啟音效'" @click="$emit('sound')">
        <GameIcon :name="state.sound ? 'volume' : 'muted'" />
      </button>
      <button class="icon-button" type="button" data-action="pause" data-bind-button="pause" :aria-label="state.paused ? '繼續' : '暫停'" @click="$emit('pause')">
        <GameIcon :name="state.paused ? 'play' : 'pause'" />
      </button>
      <button class="icon-button restart-button" type="button" data-action="restart" aria-label="重新開始" @click="$emit('restart')">
        <GameIcon name="restart" /><span>重來</span>
      </button>
    </div>
  </header>
</template>
