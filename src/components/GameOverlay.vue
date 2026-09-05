<script setup>
import { computed } from 'vue';

import { partialPreview } from '../game/engine.js';
import { formatValue, prettyFormula } from '../ui/format.js';
import GameIcon from './GameIcon.vue';

const props = defineProps({
  state: { type: Object, required: true },
});

defineEmits(['start', 'cancel', 'confirm-partial', 'pause', 'restart-same', 'restart-new']);

const preview = computed(() => (props.state.partialConfirmOpen ? partialPreview(props.state) : []));
</script>

<template>
  <div
    v-if="state.partialConfirmOpen && state.phase !== 'lost'"
    class="overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="partial-title"
  >
    <article class="modal danger-preview">
      <button class="icon-button modal-close" type="button" data-action="cancel" aria-label="取消" @click="$emit('cancel')">
        <GameIcon name="close" />
      </button>
      <h2 id="partial-title">施放全場 ∂/∂x？</h2>
      <p>每波只能使用一次。偏微分可能消滅敵人，也可能讓係數同時升高。</p>
      <ul>
        <template v-if="preview.length">
          <li
            v-for="item in preview"
            :key="item.id"
            :class="{ 'will-die': item.dies, 'will-rise': item.damageAfter > item.damageBefore }"
          >
            <span>{{ prettyFormula(item.before) }} → {{ prettyFormula(item.after) }}</span>
            <b>{{ item.shielded ? '護盾抵銷' : item.dies ? '歸零' : `${formatValue(item.damageBefore)} → ${formatValue(item.damageAfter)}` }}</b>
          </li>
        </template>
        <li v-else><span>場上沒有敵人</span></li>
      </ul>
      <div class="modal-actions">
        <button class="secondary-button" type="button" data-action="cancel" @click="$emit('cancel')">返回</button>
        <button class="primary-button" type="button" data-action="confirm-partial" @click="$emit('confirm-partial')">花費 Σ400 施放</button>
      </div>
    </article>
  </div>

  <div v-else-if="state.phase === 'intro'" class="overlay intro-overlay" role="dialog" aria-modal="true" aria-labelledby="intro-title">
    <article class="modal intro-modal">
      <div class="intro-mark"><span class="brand-orbit"><i></i></span></div>
      <h1 id="intro-title">微分防線</h1>
      <p class="intro-lead">把進攻的函數化成 0，守住證明核心。</p>
      <div class="intro-equation">
        <span>x⁵</span><i>→</i><span>5x⁴</span><i>→</i><span>20x³</span><i>→</i><span>60x²</span><i>→</i><span>120x</span><i>→</i><span>120</span><i>→</i><span>0</span>
      </div>
      <div class="intro-rules">
        <p><strong>6 發才歸零</strong><span>常數再微分一次才會死亡，最高可造成 120 傷害。</span></p>
        <p><strong>算子會真的改式子</strong><span>x⁵−10 傷害變 11；打錯公式，敵人反而更強。</span></p>
        <p><strong>每局都是新證明</strong><span>六個隨機章節後進入無限輪；seed 可完整重現敵情與補給。</span></p>
      </div>
      <button class="primary-button intro-button" type="button" data-action="start" @click="$emit('start')">
        開始演算 <GameIcon name="arrow" />
      </button>
    </article>
  </div>

  <div
    v-else-if="state.paused && state.phase !== 'lost'"
    class="overlay"
    role="dialog"
    aria-modal="true"
  >
    <article class="modal compact-modal">
      <h2>演算暫停</h2>
      <p>時間、queue 與所有函數都已停止。</p>
      <button class="primary-button" type="button" data-action="pause" @click="$emit('pause')">繼續演算</button>
    </article>
  </div>

  <div v-else-if="state.phase === 'lost'" class="overlay" role="dialog" aria-modal="true" aria-labelledby="result-title">
    <article class="modal result-modal is-loss">
      <div class="result-symbol" aria-hidden="true">≠</div>
      <h2 id="result-title">推導中斷</h2>
      <p>有函數突破防線。你可以重現同一份試題，或換一個 seed 重新證明。</p>
      <dl>
        <div><dt>抵達</dt><dd>{{ state.currentWave?.name ?? (state.chapterIndex >= 6 ? `無限 ${state.endlessRound}` : `第 ${state.chapterIndex + 1} 章`) }}</dd></div>
        <div><dt>無限輪數</dt><dd>{{ state.chapterIndex >= 6 ? Math.max(0, state.endlessRound - 1) : 0 }}</dd></div>
        <div><dt>消去</dt><dd>{{ state.kills }}</dd></div>
        <div><dt>最高連鎖</dt><dd>×{{ state.maxChain }}</dd></div>
      </dl>
      <p class="result-seed">seed <strong>{{ state.runSeed }}</strong></p>
      <div class="modal-actions result-actions">
        <button class="secondary-button" type="button" data-action="restart-same" @click="$emit('restart-same')">同 seed 重玩</button>
        <button class="primary-button" type="button" data-action="restart-new" @click="$emit('restart-new')">新 seed 開局</button>
      </div>
    </article>
  </div>
</template>
