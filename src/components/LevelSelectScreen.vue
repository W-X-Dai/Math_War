<script setup>
import { computed } from 'vue';

import {
  CHAPTERS,
  ENDLESS_CHAPTER,
  OPERATORS,
  OPERATOR_ORDER,
} from '../game/content.js';
import { isEndlessUnlocked, isLevelUnlocked } from '../game/progress.js';
import { chapterTutorial, ENEMY_GUIDES } from '../game/tutorial-content.js';

const props = defineProps({
  progress: {
    type: Object,
    default: () => ({ completedLevelIds: [] }),
  },
  selectedLevelIndex: {
    default: 0,
    validator: (value) => value === null || Number.isInteger(value),
  },
  skipTutorial: {
    type: Boolean,
    default: false,
  },
  notice: {
    type: String,
    default: '',
  },
});

const emit = defineEmits([
  'select-level',
  'update:skip-tutorial',
  'start-level',
  'start-endless',
  'download-progress',
  'import-progress',
  'request-reset-progress',
]);

const completedIds = computed(() => new Set(
  Array.isArray(props.progress?.completedLevelIds) ? props.progress.completedLevelIds : [],
));

const completedCount = computed(() => (
  CHAPTERS.filter((chapter) => completedIds.value.has(chapter.id)).length
));

function levelIsUnlocked(index) {
  return isLevelUnlocked(props.progress, index);
}

const endlessUnlocked = computed(() => (
  isEndlessUnlocked(props.progress)
));

const levelDetails = computed(() => {
  const introducedEnemyIds = new Set();
  return CHAPTERS.map((chapter, index) => {
    const tutorial = chapterTutorial(index);
    const enemies = tutorial.enemyGuideIds
      .filter((guideId) => !introducedEnemyIds.has(guideId))
      .map((guideId) => ENEMY_GUIDES[guideId])
      .filter(Boolean);
    tutorial.enemyGuideIds.forEach((guideId) => introducedEnemyIds.add(guideId));
    const weapons = OPERATOR_ORDER
      .map((operatorId) => OPERATORS[operatorId])
      .filter((operator) => operator?.unlockChapter === index);
    const segmentFamilies = chapter.segments.map((segmentConfig) => (
      segmentConfig.families.map((family) => ENEMY_GUIDES[family]?.label ?? family).join('、')
    ));

    return {
      ...chapter,
      index,
      recognition: tutorial.objective,
      pressureFamilies: segmentFamilies[0],
      mixedFamilies: segmentFamilies[1],
      enemies,
      weapons,
    };
  });
});

const selectedLevel = computed(() => {
  if (props.selectedLevelIndex === null) return null;
  return levelDetails.value[props.selectedLevelIndex] ?? levelDetails.value[0];
});

const selectedIsUnlocked = computed(() => (
  props.selectedLevelIndex === null
    ? endlessUnlocked.value
    : levelIsUnlocked(selectedLevel.value?.index ?? 0)
));

function unlockCondition(index) {
  if (index === 0) return '預設解鎖';
  return `完成第 ${index} 關「${CHAPTERS[index - 1].name}」後解鎖`;
}

function updateSkipTutorial(event) {
  emit('update:skip-tutorial', event.currentTarget.checked);
}

function selectLevel(index) {
  if (!levelIsUnlocked(index)) return;
  emit('select-level', index);
}

function selectEndless() {
  if (!endlessUnlocked.value) return;
  emit('select-level', null);
}

function startSelectedLevel() {
  if (!selectedLevel.value || !selectedIsUnlocked.value) return;
  emit('start-level', selectedLevel.value.index);
}

function importProgress(event) {
  const input = event.currentTarget;
  const file = input.files?.[0];
  if (file) emit('import-progress', file);
  input.value = '';
}
</script>

<template>
  <main class="level-select-screen">
    <header class="level-select-header">
      <div class="level-select-brand">
        <span class="brand-orbit level-select-orbit" aria-hidden="true">∂</span>
        <div>
          <p class="level-select-kicker">數學塔防演算</p>
          <h1>微分防線</h1>
          <p>把進攻的數字與函數化成 0，逐關守住證明核心。</p>
        </div>
      </div>
      <div class="level-select-progress" aria-label="關卡完成進度">
        <span>主關卡進度</span>
        <strong>{{ completedCount }} / {{ CHAPTERS.length }}</strong>
        <progress :value="completedCount" :max="CHAPTERS.length">
          {{ completedCount }} / {{ CHAPTERS.length }}
        </progress>
      </div>
    </header>

    <div class="level-select-layout">
      <section class="level-map" aria-labelledby="level-map-title">
        <div class="level-map-heading">
          <div>
            <p class="level-select-kicker">證明路徑</p>
            <h2 id="level-map-title">選擇關卡</h2>
          </div>
          <div class="level-progress-actions" aria-label="進度檔案操作">
            <button
              class="level-progress-file-button"
              type="button"
              @click="$emit('download-progress')"
            >下載進度 JSON</button>
            <label class="level-progress-file-button level-progress-upload-button">
              <input
                class="sr-only"
                type="file"
                accept=".json,application/json"
                @change="importProgress"
              >
              <span>載入進度 JSON</span>
            </label>
            <button
              class="level-reset-button"
              type="button"
              @click="$emit('request-reset-progress')"
            >清除進度</button>
          </div>
        </div>
        <p
          class="level-select-notice"
          :class="{ 'is-error': notice.startsWith('無法載入') }"
          aria-live="polite"
          aria-atomic="true"
        >{{ notice }}</p>

        <ol class="level-card-grid">
          <li v-for="(level, index) in levelDetails" :key="level.id">
            <button
              class="level-card"
              :class="{
                'is-selected': selectedLevelIndex === index,
                'is-complete': completedIds.has(level.id),
                'is-locked': !levelIsUnlocked(index),
              }"
              type="button"
              :aria-disabled="!levelIsUnlocked(index)"
              :aria-pressed="selectedLevelIndex === index"
              @click="selectLevel(index)"
            >
              <span class="level-card-number">第 {{ index + 1 }} 關</span>
              <strong>{{ level.name }}</strong>
              <span class="level-card-theme">{{ level.theme }}</span>
              <span v-if="!levelIsUnlocked(index)" class="level-card-status">
                尚未解鎖・{{ unlockCondition(index) }}
              </span>
              <span v-else-if="completedIds.has(level.id)" class="level-card-status">
                已通關・可重新挑戰
              </span>
              <span v-else class="level-card-status">已解鎖・等待挑戰</span>
            </button>
          </li>

          <li class="endless-card-item">
            <button
              class="level-card endless-level-card"
              :class="{
                'is-selected': selectedLevelIndex === null,
                'is-locked': !endlessUnlocked,
              }"
              type="button"
              :aria-disabled="!endlessUnlocked"
              :aria-pressed="selectedLevelIndex === null"
              @click="selectEndless"
            >
              <span class="level-card-number">最終模式</span>
              <strong>∞ {{ ENDLESS_CHAPTER.name }}</strong>
              <span class="level-card-theme">{{ ENDLESS_CHAPTER.theme }}</span>
              <span v-if="endlessUnlocked" class="level-card-status">已解鎖・挑戰無盡輪次</span>
              <span v-else class="level-card-status">
                尚未解鎖・完成第 6 關「{{ CHAPTERS.at(-1).name }}」後解鎖
              </span>
            </button>
          </li>
        </ol>

      </section>

      <aside class="level-detail-panel" aria-live="polite">
        <template v-if="selectedIsUnlocked && selectedLevel">
          <p class="level-select-kicker">第 {{ selectedLevel.index + 1 }} 關詳情</p>
          <h2>{{ selectedLevel.name }}</h2>
          <p class="level-detail-theme">{{ selectedLevel.theme }}</p>
          <p class="level-detail-hint">{{ selectedLevel.hint }}</p>

          <dl class="level-detail-facts">
            <div>
              <dt>棋盤</dt>
              <dd>{{ selectedLevel.board.rows }} × {{ selectedLevel.board.columns }}</dd>
            </div>
            <div>
              <dt>可部署欄</dt>
              <dd>{{ selectedLevel.board.placeableColumns }}</dd>
            </div>
            <div>
              <dt>起始算力</dt>
              <dd>Σ {{ selectedLevel.startingEnergy }}</dd>
            </div>
          </dl>

          <section class="level-detail-section" aria-labelledby="level-flow-heading">
            <h3 id="level-flow-heading">三段流程</h3>
            <ol class="level-flow-list">
              <li><strong>辨識</strong><span>{{ selectedLevel.recognition }}</span></li>
              <li><strong>壓力</strong><span>集中處理：{{ selectedLevel.pressureFamilies }}。</span></li>
              <li><strong>混合</strong><span>組合運用：{{ selectedLevel.mixedFamilies }}。</span></li>
            </ol>
          </section>

          <section class="level-detail-section">
            <h3>本關新敵人</h3>
            <ul class="level-tag-list">
              <li v-for="enemy in selectedLevel.enemies" :key="enemy.id">
                {{ enemy.label }}・{{ enemy.name }}
              </li>
            </ul>
          </section>

          <section class="level-detail-section">
            <h3>本關新軍械</h3>
            <ul class="level-unlock-list">
              <li v-for="weapon in selectedLevel.weapons" :key="weapon.id">
                <strong>{{ weapon.symbol }} {{ weapon.name }}</strong>
                <span>{{ weapon.description }}</span>
              </li>
            </ul>
          </section>

          <label class="skip-tutorial-control">
            <input
              type="checkbox"
              :checked="skipTutorial"
              @change="updateSkipTutorial"
            >
            <span><strong>跳過本關教學</strong>直接從壓力段開始；本次選擇不會保存。</span>
          </label>

          <button class="primary-button level-start-button" type="button" @click="startSelectedLevel">
            {{ completedIds.has(selectedLevel.id) ? '重新挑戰' : '開始本關' }}
          </button>
        </template>

        <template v-else-if="selectedIsUnlocked">
          <p class="level-select-kicker">無限模式</p>
          <h2>∞ {{ ENDLESS_CHAPTER.name }}</h2>
          <p class="level-detail-theme">{{ ENDLESS_CHAPTER.theme }}</p>
          <p class="level-detail-hint">{{ ENDLESS_CHAPTER.hint }}</p>

          <dl class="level-detail-facts">
            <div>
              <dt>棋盤</dt>
              <dd>{{ ENDLESS_CHAPTER.board.rows }} × {{ ENDLESS_CHAPTER.board.columns }}</dd>
            </div>
            <div>
              <dt>可部署欄</dt>
              <dd>{{ ENDLESS_CHAPTER.board.placeableColumns }}</dd>
            </div>
            <div>
              <dt>起始算力</dt>
              <dd>Σ {{ ENDLESS_CHAPTER.startingEnergy }}</dd>
            </div>
          </dl>

          <section class="level-detail-section">
            <h3>無限規則</h3>
            <p>不含辨識教學；完成每輪後保留防線與資源，面對逐步增強的全函數族敵情。</p>
          </section>

          <button class="primary-button level-start-button" type="button" @click="$emit('start-endless')">
            進入無限證明
          </button>
        </template>

        <template v-else>
          <p class="level-select-kicker">尚未解鎖</p>
          <h2>{{ selectedLevel ? selectedLevel.name : ENDLESS_CHAPTER.name }}</h2>
          <p>完成前一關後，這裡會公開完整提示、棋盤與新出現的敵人及軍械。</p>
        </template>
      </aside>
    </div>
  </main>
</template>
