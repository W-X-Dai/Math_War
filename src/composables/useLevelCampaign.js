import { computed, reactive, ref, watch } from 'vue';

import { startGame, togglePause } from '../game/engine.js';
import { CHAPTERS } from '../game/content.js';
import {
  completeLevel,
  createDefaultProgress,
  loadProgress,
  parseProgressFile,
  resetProgress,
  saveProgress,
  serializeProgressFile,
} from '../game/progress.js';

const MAX_PROGRESS_FILE_BYTES = 64 * 1024;
const progressImportErrors = {
  'invalid-json': '無法載入：檔案不是有效的 JSON。',
  'invalid-format': '無法載入：這不是「微分防線」進度檔。',
  'unsupported-version': '無法載入：此進度檔版本不受目前遊戲支援。',
  'invalid-progress': '無法載入：關卡進度內容不完整或已損壞。',
};

export function randomSeed() {
  const values = new Uint32Array(1);
  globalThis.crypto?.getRandomValues(values);
  return values[0] || ((Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0);
}

function browserStorage() {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function localDateStamp(date) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Owns level selection, attempt identity, unlock persistence, and navigation. */
export function useLevelCampaign({ game, replaceGame, resetClock }) {
  const progressStorage = browserStorage();
  const progress = reactive(loadProgress(progressStorage));
  const screen = ref('levels');
  const selectedLevelIndex = ref(0);
  const skipTutorial = ref(false);
  const activeRun = ref({ mode: 'level', levelIndex: 0, skipTutorial: false });
  const pendingConfirmation = ref(null);
  const pausedBeforeConfirmation = ref(false);
  const newlyUnlockedLabel = ref('');
  const progressSaveFailed = ref(false);
  const levelSelectNotice = ref('');

  const confirmation = computed(() => (
    pendingConfirmation.value === 'reset'
      ? {
        title: '清除所有關卡進度？',
        description: '第 2–6 關與無限模式會重新鎖定。這項操作無法復原。',
        confirmLabel: '清除進度',
        danger: true,
      }
      : {
        title: '放棄本次挑戰？',
        description: '本關戰鬥進度不會保存；已解鎖的關卡不受影響。',
        confirmLabel: '放棄並返回選關',
        danger: false,
      }
  ));

  function launchRun({
    mode = 'level',
    levelIndex = 0,
    seed = randomSeed(),
    skip = false,
  } = {}) {
    const run = {
      mode,
      levelIndex: mode === 'endless' ? CHAPTERS.length : levelIndex,
      skipTutorial: mode === 'level' ? Boolean(skip) : false,
    };
    activeRun.value = run;
    newlyUnlockedLabel.value = '';
    progressSaveFailed.value = false;
    pendingConfirmation.value = null;
    replaceGame(seed, run);
    startGame(game);
    screen.value = 'game';
  }

  function openLevel(levelIndex) {
    selectedLevelIndex.value = levelIndex;
    skipTutorial.value = false;
    levelSelectNotice.value = '';
  }

  function startSelectedLevel() {
    if (!Number.isInteger(selectedLevelIndex.value)) return false;
    launchRun({ levelIndex: selectedLevelIndex.value, skip: skipTutorial.value });
    return true;
  }

  function startEndless() {
    launchRun({ mode: 'endless' });
  }

  function retryRun(useSameSeed) {
    launchRun({
      ...activeRun.value,
      seed: useSameSeed ? game.runSeed : randomSeed(),
      skip: activeRun.value.skipTutorial,
    });
  }

  function startNextRun() {
    if (activeRun.value.mode !== 'level') return false;
    const nextIndex = game.chapterIndex + 1;
    if (nextIndex < CHAPTERS.length) {
      selectedLevelIndex.value = nextIndex;
      skipTutorial.value = false;
      launchRun({ levelIndex: nextIndex });
    } else {
      selectedLevelIndex.value = null;
      launchRun({ mode: 'endless' });
    }
    return true;
  }

  function returnToLevelSelect() {
    screen.value = 'levels';
    selectedLevelIndex.value = activeRun.value.mode === 'level'
      ? activeRun.value.levelIndex
      : null;
    skipTutorial.value = false;
    pendingConfirmation.value = null;
    newlyUnlockedLabel.value = '';
    resetClock();
  }

  function requestRunExit() {
    if (['won', 'lost', 'intro'].includes(game.phase)) {
      returnToLevelSelect();
      return;
    }
    pausedBeforeConfirmation.value = game.paused;
    if (!game.paused) togglePause(game);
    pendingConfirmation.value = 'abandon';
  }

  function requestProgressReset() {
    pendingConfirmation.value = 'reset';
    levelSelectNotice.value = '';
  }

  function prepareProgressDownload(date = new Date()) {
    levelSelectNotice.value = '進度 JSON 已下載。';
    return {
      filename: `math-zombie-progress-${localDateStamp(date)}.json`,
      contents: serializeProgressFile(progress),
    };
  }

  async function importProgressFile(file) {
    levelSelectNotice.value = '';
    if (!file || typeof file.text !== 'function') {
      levelSelectNotice.value = '無法載入：沒有選取進度檔。';
      return false;
    }
    if (file.size > MAX_PROGRESS_FILE_BYTES) {
      levelSelectNotice.value = '無法載入：進度檔超過 64 KB。';
      return false;
    }

    let serialized;
    try {
      serialized = await file.text();
    } catch {
      levelSelectNotice.value = '無法載入：瀏覽器無法讀取這個檔案。';
      return false;
    }

    const parsed = parseProgressFile(serialized);
    if (!parsed.ok) {
      levelSelectNotice.value = progressImportErrors[parsed.error]
        ?? '無法載入：進度檔內容無效。';
      return false;
    }

    Object.assign(progress, parsed.progress);
    const completedCount = parsed.progress.completedLevelIds.length;
    selectedLevelIndex.value = completedCount === CHAPTERS.length ? null : completedCount;
    skipTutorial.value = false;
    const persisted = saveProgress(progressStorage, parsed.progress);
    levelSelectNotice.value = persisted
      ? `已載入 ${completedCount} / ${CHAPTERS.length} 關通關進度。`
      : `已載入 ${completedCount} / ${CHAPTERS.length} 關通關進度，但瀏覽器無法保存。`;
    return true;
  }

  function cancelConfirmation() {
    const kind = pendingConfirmation.value;
    pendingConfirmation.value = null;
    if (kind === 'abandon' && !pausedBeforeConfirmation.value && game.paused) {
      togglePause(game);
    }
  }

  function confirmPendingAction() {
    const kind = pendingConfirmation.value;
    pendingConfirmation.value = null;
    if (kind === 'abandon') {
      returnToLevelSelect();
      return;
    }
    if (kind !== 'reset') return;
    const cleared = resetProgress(progressStorage);
    Object.assign(progress, createDefaultProgress());
    selectedLevelIndex.value = 0;
    skipTutorial.value = false;
    levelSelectNotice.value = cleared
      ? '關卡進度已清除。'
      : '本次進度已重置，但瀏覽器無法清除已儲存的資料。';
  }

  watch(
    () => game.phase,
    (phase, previousPhase) => {
      if (phase !== 'won' || previousPhase === 'won' || activeRun.value.mode !== 'level') return;
      const previousCompletedCount = progress.completedLevelIds.length;
      const updated = completeLevel(progress, CHAPTERS[game.chapterIndex].id);
      Object.assign(progress, updated);
      const completedCount = updated.completedLevelIds.length;
      if (completedCount > previousCompletedCount) {
        newlyUnlockedLabel.value = completedCount < CHAPTERS.length
          ? `第 ${completedCount + 1} 關「${CHAPTERS[completedCount].name}」`
          : '無限證明';
        progressSaveFailed.value = !saveProgress(progressStorage, updated);
      } else {
        progressSaveFailed.value = false;
      }
    },
  );

  return {
    confirmation,
    levelSelectNotice,
    newlyUnlockedLabel,
    pendingConfirmation,
    progress,
    progressSaveFailed,
    screen,
    selectedLevelIndex,
    skipTutorial,
    cancelConfirmation,
    confirmPendingAction,
    importProgressFile,
    openLevel,
    prepareProgressDownload,
    requestProgressReset,
    requestRunExit,
    retryRun,
    returnToLevelSelect,
    startEndless,
    startNextRun,
    startSelectedLevel,
  };
}
