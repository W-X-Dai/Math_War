<script setup>
import { computed, nextTick, ref, watch } from 'vue';

import { OPERATORS } from '../game/content.js';
import { partialPreview } from '../game/engine.js';
import { ENEMY_GUIDES } from '../game/tutorial-content.js';
import { formatValue, prettyFormula } from '../ui/format.js';
import GameIcon from './GameIcon.vue';

const props = defineProps({
  state: { type: Object, required: true },
});

const tutorialHeading = ref(null);
defineEmits([
  'cancel', 'confirm-partial', 'advance-enemy-tutorial', 'advance-weapon-tutorial',
  'pause', 'select-level',
]);

const preview = computed(() => (props.state.partialConfirmOpen ? partialPreview(props.state) : []));
const newEnemy = computed(() => {
  const guideId = props.state.enemyTutorialQueue?.[0];
  if (!guideId) return null;
  return Array.isArray(ENEMY_GUIDES)
    ? ENEMY_GUIDES.find((guide) => guide.id === guideId) ?? null
    : ENEMY_GUIDES[guideId] ?? null;
});
const newWeapon = computed(() => OPERATORS[props.state.weaponTutorialQueue?.[0]] ?? null);
const enemyTutorialAction = computed(() => {
  const remaining = props.state.enemyTutorialQueue?.length ?? 0;
  if (remaining > 1) return `下一個敵人（還有 ${remaining - 1}）`;
  if (props.state.weaponTutorialQueue?.length) return '查看新軍械';
  return props.state.currentWave?.kind === 'tutorial' ? '進入教學整備' : '開始整備';
});
const weaponTutorialAction = computed(() => {
  const remaining = props.state.weaponTutorialQueue?.length ?? 0;
  if (remaining > 1) return `下一張（還有 ${remaining - 1}）`;
  return props.state.currentWave?.kind === 'tutorial' ? '進入教學整備' : '開始整備';
});
const weaponUsage = computed(() => {
  if (newWeapon.value?.kind === 'tower') return '持續型砲台';
  if (newWeapon.value?.kind === 'global') return '全場高耗能捲軸';
  if (newWeapon.value?.category === 'heavy') return '大型算術捲軸';
  if (newWeapon.value?.category === 'basic') return '基礎算術捲軸';
  if (newWeapon.value?.parameterKeys?.length) return '單體參數捲軸';
  return '單體無限捲軸';
});
const counterLabels = computed(() => {
  const labels = {
    polynomial: '多項式', constant: '常數項', higherOrder: '高階式', multivariable: '多變數',
    rational: '分式', logarithmic: '對數', trigonometric: '三角式', exponential: '指數式',
  };
  return (newWeapon.value?.counterTags ?? []).map((tag) => labels[tag] ?? tag).join('、');
});
const weaponSteps = computed(() => {
  if (newWeapon.value?.parameterKeys?.length) {
    return [
      '單一 0–9、π 或 e 可直接從工坊圓盤拖曳；其他數值先組合存入常數庫。',
      newWeapon.value.parameterKeys.length > 1
        ? '把圓盤或已存常數依序拖到捲軸，刻寫下界與上界。'
        : '把圓盤或已存常數拖到軍械區的空白捲軸刻寫。',
      '刻寫完成後把捲軸拖到任意一隻敵人；也可沿用點擊施放。',
      newWeapon.value.category === 'heavy'
        ? '大型武器耗費較高：乘數與除數不可為 0，先確認公式仍可繼續化簡。'
        : '發射後捲軸會回到空白狀態；目標無效或算力不足時不扣算力。',
    ];
  }
  if (newWeapon.value?.kind === 'tower') {
    return [
      '點擊砲台牌，再點戰場上的發亮格子；或直接把砲台牌拖曳到格子。',
      '教學會標出指定路線；砲台部署後會持續攻擊同一路最前方的敵人。',
    ];
  }
  if (newWeapon.value?.kind === 'global') {
    return ['從無限捲軸庫選取，先查看全場公式預覽。', '確認施放後扣除超高算力；捲軸不消耗，但每輪限用一次。'];
  }
  if (newWeapon.value?.category === 'heavy') {
    return ['開根只接受可精確表示的非負完全平方單項式。', '成功發射只扣算力；無法開根時不扣除。'];
  }
  return ['從無限捲軸庫選取，再點擊一隻敵人施放。', '成功發射只扣算力；目標無效或算力不足時不扣除。'];
});

watch(
  () => `${props.state.phase}|${props.state.enemyTutorialQueue?.[0] ?? ''}|${props.state.weaponTutorialQueue?.[0] ?? ''}`,
  async () => {
    await nextTick();
    tutorialHeading.value?.focus();
  },
  { flush: 'post' },
);
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
      <h2 id="partial-title">施放全場 ∂/∂z？</h2>
      <p>每波只能使用一次。這個超高耗能捲軸會對每個目標的 z 項做偏微分。</p>
      <ul>
        <template v-if="preview.length">
          <li
            v-for="item in preview"
            :key="item.id"
            :class="{
              'will-die': item.dies || item.breaksShield,
              'will-rise': item.damageAfter > item.damageBefore,
            }"
          >
            <span>{{ prettyFormula(item.before) }} → {{ prettyFormula(item.after) }}</span>
            <b>{{ item.breaksShield ? '護盾破除' : item.layer === 'shield' ? '護盾更新' : item.dies ? '歸零' : `${formatValue(item.damageBefore)} → ${formatValue(item.damageAfter)}` }}</b>
          </li>
        </template>
        <li v-else><span>場上沒有敵人</span></li>
      </ul>
      <div class="modal-actions">
        <button class="secondary-button" type="button" data-action="cancel" @click="$emit('cancel')">返回</button>
        <button class="primary-button" type="button" data-action="confirm-partial" @click="$emit('confirm-partial')">花費 Σ{{ OPERATORS.partial.cost }} 施放</button>
      </div>
    </article>
  </div>

  <div
    v-else-if="newEnemy && state.phase === 'preparing'"
    class="overlay enemy-tutorial-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="enemy-tutorial-title"
    aria-describedby="enemy-tutorial-description enemy-tutorial-clue"
  >
    <article class="modal enemy-tutorial-modal" :data-guide-id="newEnemy.id">
      <p class="tutorial-eyebrow">第 {{ state.chapterIndex + 1 }} 章新敵人</p>
      <div class="enemy-tutorial-main">
        <span
          class="enemy-tutorial-appearance"
          :class="{
            'is-shielded': newEnemy.id === 'affix-shield',
            'is-fast': newEnemy.id === 'affix-fast',
            'is-split': newEnemy.id === 'affix-split',
          }"
          aria-hidden="true"
        >
          <strong>{{ prettyFormula(newEnemy.sample) }}</strong>
          <span v-if="newEnemy.id === 'affix-shield'" class="enemy-tutorial-shield">
            <small>護盾式</small>
            <strong>{{ prettyFormula(newEnemy.sample) }}</strong>
          </span>
        </span>
        <div>
          <span class="enemy-family-label">{{ newEnemy.label }}</span>
          <h2 id="enemy-tutorial-title" ref="tutorialHeading" tabindex="-1">{{ newEnemy.name }}</h2>
          <p id="enemy-tutorial-description">{{ newEnemy.description }}</p>
        </div>
      </div>
      <p id="enemy-tutorial-clue" class="enemy-clue"><strong>判斷提示</strong>{{ newEnemy.clue }}</p>
      <p class="weapon-tutorial-note">介紹期間整備倒數與砲台補給會暫停；敵人身上不會提示需要幾次運算。</p>
      <button
        class="primary-button"
        type="button"
        data-action="advance-enemy-tutorial"
        @click="$emit('advance-enemy-tutorial')"
      >{{ enemyTutorialAction }} <GameIcon name="arrow" /></button>
    </article>
  </div>

  <div
    v-else-if="newWeapon && state.phase === 'preparing'"
    class="overlay weapon-tutorial-overlay"
    role="dialog"
    aria-modal="true"
    aria-labelledby="weapon-tutorial-title"
    aria-describedby="weapon-tutorial-description"
  >
    <article class="modal weapon-tutorial-modal">
      <p class="weapon-eyebrow tutorial-eyebrow">第 {{ state.chapterIndex + 1 }} 章新軍械</p>
      <div class="weapon-tutorial-main">
        <span class="weapon-tutorial-art operator-art" :class="newWeapon.art" aria-hidden="true"></span>
        <div>
          <span class="weapon-symbol">{{ newWeapon.symbol }}</span>
          <h2 id="weapon-tutorial-title" ref="tutorialHeading" tabindex="-1">{{ newWeapon.name }}</h2>
          <p id="weapon-tutorial-description">{{ newWeapon.description }}</p>
        </div>
      </div>
      <dl class="weapon-facts">
        <div><dt>類型</dt><dd>{{ weaponUsage }}</dd></div>
        <div><dt>算力</dt><dd>Σ {{ newWeapon.cost }}</dd></div>
        <div><dt>適合</dt><dd>{{ counterLabels || '依公式判斷' }}</dd></div>
      </dl>
      <ol class="weapon-steps">
        <li v-for="step in weaponSteps" :key="step">{{ step }}</li>
      </ol>
      <p class="weapon-tutorial-note">教學期間整備倒數與砲台補給會暫停。</p>
      <button
        class="primary-button"
        type="button"
        data-action="advance-weapon-tutorial"
        @click="$emit('advance-weapon-tutorial')"
      >{{ weaponTutorialAction }} <GameIcon name="arrow" /></button>
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
      <div class="modal-actions">
        <button class="secondary-button" type="button" data-action="select-level" @click="$emit('select-level')">返回選關</button>
        <button class="primary-button" type="button" data-action="pause" @click="$emit('pause')">繼續演算</button>
      </div>
    </article>
  </div>
</template>
