<script setup>
import { computed } from 'vue';

import { CHAPTERS } from '../game/content.js';
import GameIcon from './GameIcon.vue';

const props = defineProps({
  state: { type: Object, required: true },
});

defineEmits(['speed', 'sound', 'pause', 'select-level']);

const segmentNames = ['辨識', '壓力', '混合'];
const segmentIndex = computed(() => props.state.currentWave?.segmentIndex ?? 0);
const chapterLabel = computed(() => (
  props.state.chapterIndex >= CHAPTERS.length
    ? `無限章・第 ${props.state.endlessRound} 輪`
    : `第 ${props.state.chapterIndex + 1} 關・${CHAPTERS[props.state.chapterIndex].theme}・${segmentIndex.value + 1}/3 ${segmentNames[segmentIndex.value]}`
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
        <span class="wave-dots" data-bind="waveDots" :aria-label="state.chapterIndex >= CHAPTERS.length ? `無限第 ${state.endlessRound} 輪` : `本關第 ${segmentIndex + 1} 段，共 3 段`">
          <i
            v-for="index in (state.chapterIndex >= CHAPTERS.length ? 1 : 3)"
            :key="index"
            aria-hidden="true"
            :class="{
              'is-done': state.chapterIndex < CHAPTERS.length && index - 1 < segmentIndex,
              'is-current': state.chapterIndex >= CHAPTERS.length || index - 1 === segmentIndex,
            }"
          >{{ state.chapterIndex >= CHAPTERS.length ? '∞' : '' }}</i>
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
      <button class="icon-button restart-button" type="button" data-action="select-level" aria-label="返回選關" @click="$emit('select-level')">
        <GameIcon name="arrow" /><span>選關</span>
      </button>
    </div>
  </header>
</template>
