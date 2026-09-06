<script setup>
import { computed, ref } from 'vue';

import { evaluateConstantExpression } from '../domain/constant-expression.js';
import { STORED_CONSTANT_CAPACITY } from '../game/content.js';
import { DIRECT_CONSTANT_TOKENS } from '../ui/constant-tokens.js';
import { formatValue } from '../ui/format.js';
import GameIcon from './GameIcon.vue';

const props = defineProps({
  state: { type: Object, required: true },
  discardDragging: { type: Boolean, default: false },
  dragOver: { type: Boolean, default: false },
  dragPayload: { type: Object, default: null },
  recycleArmed: { type: Boolean, default: false },
});

const emit = defineEmits(['store-constant', 'pick-stored-constant', 'toggle-recycle']);
const draft = ref('0');
const MAX_CONSTANT_ABS = 1_000_000;
const storedConstants = computed(() => props.state.storedConstants ?? []);
const selectedStoredConstant = computed(() => storedConstants.value.find(
  (item) => item.id === props.state.selectedStoredConstantId,
) ?? null);
const storedFull = computed(() => storedConstants.value.length >= STORED_CONSTANT_CAPACITY);
const isTutorialWave = computed(() => props.state.currentWave?.kind === 'tutorial');
const evaluation = computed(() => {
  try {
    const value = evaluateConstantExpression(draft.value);
    if (Math.abs(value) > MAX_CONSTANT_ABS) {
      return { value: null, error: '結果絕對值不得超過 1,000,000' };
    }
    return { value, error: '' };
  } catch (error) {
    return { value: null, error: error instanceof Error ? error.message : '算式無效' };
  }
});
const numericValue = computed(() => evaluation.value.value);

function appendToken(token) {
  if (draft.value.length >= 80) return;
  const replaceZero = draft.value === '0' && !['.', '+', '−', '×', '÷', ')'].includes(token);
  draft.value = replaceZero ? token : `${draft.value}${token}`;
}

function backspace() {
  if (draft.value.length <= 1) {
    draft.value = '0';
    return;
  }
  draft.value = draft.value.slice(0, -1);
}

function saveConstant() {
  if (numericValue.value === null || storedFull.value) return;
  emit('store-constant', numericValue.value, `算式 ${draft.value}`);
}
</script>

<template>
  <aside class="workbench" data-bind="workbench" aria-labelledby="workbench-heading" :style="{ '--stored-constant-capacity': STORED_CONSTANT_CAPACITY }">
    <div class="workbench-title">
      <h2 id="workbench-heading">公式工房</h2>
      <span>數字・π・e</span>
    </div>

    <section class="numeric-constant-builder" aria-labelledby="numeric-builder-heading">
      <div class="queue-head">
        <h3 id="numeric-builder-heading">常數圓盤</h3>
        <strong>點擊組合・拖曳刻寫</strong>
      </div>
      <label class="numeric-display">
        <span class="sr-only">常數算式</span>
        <input v-model="draft" type="text" inputmode="text" autocomplete="off" spellcheck="false" maxlength="80" placeholder="例：-4、2π、\sqrt{81} ÷ 3" aria-describedby="numeric-builder-status" @keydown.enter="saveConstant">
        <strong>{{ numericValue === null ? '無效' : formatValue(numericValue) }}</strong>
      </label>
      <div class="numeric-keypad" aria-label="0 到 9、π 與 e 常數圓盤">
        <button
          v-for="token in DIRECT_CONSTANT_TOKENS"
          :key="token.id"
          class="numeric-disc"
          :class="{ 'is-dragging': dragPayload?.kind === 'numeric-constant' && dragPayload.id === token.id }"
          type="button"
          :data-key="token.input"
          data-drag-kind="numeric-constant"
          :data-drag-id="token.id"
          draggable="true"
          :aria-label="`${token.label}；可拖到空白參數捲軸`"
          :title="`拖到空白參數捲軸刻寫 ${token.label}`"
          @click="appendToken(token.input)"
        >{{ token.label }}</button>
      </div>
      <div class="numeric-edit-actions" aria-label="算式編輯">
        <button type="button" data-key="backspace" aria-label="退格" @click="backspace">⌫ 退格</button>
        <button type="button" data-key="clear" aria-label="清除" @click="draft = '0'">C 清除</button>
      </div>
      <p id="numeric-builder-status" class="numeric-builder-status">
        {{ numericValue === null ? evaluation.error : `點擊可組合 ${formatValue(numericValue)}；圓盤可直接拖到捲軸` }}
      </p>
      <button class="primary-button numeric-save" type="button" data-action="store-numeric-constant" :disabled="numericValue === null || storedFull" @click="saveConstant">
        {{ storedFull ? `常數庫已滿（${STORED_CONSTANT_CAPACITY}/${STORED_CONSTANT_CAPACITY}）` : '組合並存入常數' }}
      </button>
    </section>

    <section class="stored-constant-library" aria-label="已組合常數庫">
      <div class="queue-head">
        <h3>已組合常數</h3>
        <strong>{{ storedConstants.length }} / {{ STORED_CONSTANT_CAPACITY }}</strong>
      </div>
      <div class="stored-constant-grid">
        <template v-if="storedConstants.length">
          <button
            v-for="(item, index) in storedConstants"
            :key="item.id"
            class="stored-constant-token"
            :class="{ 'is-picked': item.id === state.selectedStoredConstantId, 'is-dragging': dragPayload?.kind === 'stored-constant' && dragPayload.id === item.id }"
            type="button"
            data-action="pick-stored-constant"
            :data-item-id="item.id"
            data-drag-kind="stored-constant"
            :data-drag-id="item.id"
            draggable="true"
            aria-keyshortcuts="Delete"
            :aria-pressed="item.id === state.selectedStoredConstantId"
            :title="`拖到需要參數的捲軸刻寫 ${formatValue(item.value)}`"
            @click="$emit('pick-stored-constant', item.id)"
          >
            <span class="stored-constant-index">{{ index + 1 }}</span>
            <strong>{{ formatValue(item.value) }}</strong>
            <small>{{ item.source ?? '數字鍵盤' }}</small>
          </button>
        </template>
        <p v-else class="stored-constant-empty">用上方數字鍵盤組合參數，最多保存 {{ STORED_CONSTANT_CAPACITY }} 個。</p>
      </div>
      <div v-if="selectedStoredConstant" class="selected-constant-hint">
        <span>已選常數</span><strong>{{ formatValue(selectedStoredConstant.value) }}</strong><small>拖到參數捲軸刻寫；鍵盤可直接點擊捲軸</small>
      </div>
    </section>

    <section class="recycle-toolbox" aria-labelledby="recycle-tool-heading">
      <div><h3 id="recycle-tool-heading">砲塔回收</h3><p>{{ isTutorialWave ? '拖曳鏟子到砲塔，或先啟用再點選；免費教學塔會把牌放回工房。' : '拖曳鏟子到砲塔，或先啟用再點選；返還原價一半算力。' }}</p></div>
      <button class="recycle-tool" :class="{ 'is-armed': recycleArmed, 'is-dragging': dragPayload?.kind === 'recycle-tool' }" type="button" data-action="toggle-recycle" data-drag-kind="recycle-tool" data-drag-id="shovel" draggable="true" :aria-pressed="recycleArmed" @click="$emit('toggle-recycle')">
        <GameIcon name="shovel" /><span>{{ recycleArmed ? '選擇砲塔' : '回收鏟' }}</span><small>{{ recycleArmed ? 'Esc 取消' : (isTutorialWave ? '免費塔退牌' : '返還 50%') }}</small>
      </button>
    </section>

    <div class="trash-dropzone" :class="{ 'is-active': discardDragging, 'is-over': dragOver }" role="region" aria-label="垃圾桶；把砲台牌或已組合常數拖到這裡丟棄">
      <GameIcon name="trash" /><span>拖到這裡丟棄</span><small>砲台牌／已組合常數 · 鍵盤可按 Delete</small>
    </div>
  </aside>
</template>
