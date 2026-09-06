<script setup>
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';

import { GAMEPLAY_CONFIG } from './config/gameplay.js';
import { PRESENTATION_CONFIG } from './config/presentation.js';
import {
  advanceEnemyTutorial,
  advanceWeaponTutorial,
  applyTargetOperator,
  cancelSelection,
  confirmPartial,
  createGame,
  discardArsenalItem,
  discardConstantItem,
  discardFormulaItem,
  discardStoredConstant,
  installAssembly,
  placeTower,
  prepareAssembly,
  recycleTower,
  selectArsenalItem,
  selectConstantItem,
  selectEnemy,
  selectFormulaItem,
  selectStoredConstant,
  startWave,
  tick,
  togglePause,
  toggleSpeed,
} from './game/engine.js';
import BattlefieldStage from './components/BattlefieldStage.vue';
import ConfirmationDialog from './components/ConfirmationDialog.vue';
import DerivationLog from './components/DerivationLog.vue';
import EnemyFormulaPanel from './components/EnemyFormulaPanel.vue';
import GameHud from './components/GameHud.vue';
import GameOverlay from './components/GameOverlay.vue';
import GameResultDialog from './components/GameResultDialog.vue';
import GameWorkbench from './components/GameWorkbench.vue';
import LevelSelectScreen from './components/LevelSelectScreen.vue';
import OperatorDock from './components/OperatorDock.vue';
import WavePrepBar from './components/WavePrepBar.vue';
import { useLevelCampaign, randomSeed } from './composables/useLevelCampaign.js';
import { OPERATOR_QUEUE_CAPACITY } from './game/content.js';

const game = reactive(createGame(randomSeed()));
const dragPayload = ref(null);
const dragOverTrash = ref(false);
const dragOverTowerId = ref(null);
const recycleArmed = ref(false);
let audioContext = null;
let animationFrame = 0;
let previousTime = 0;

const { audio } = PRESENTATION_CONFIG;
const configurableTowerIds = [
  ...GAMEPLAY_CONFIG.combat.tower.configurableTypeIds,
  GAMEPLAY_CONFIG.combat.tower.boundedTypeId,
];
const trashDiscardKinds = new Set(['arsenal', 'formula', 'constant', 'stored-constant']);

function tone(kind = 'select') {
  if (!game.sound) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    if (!audioContext && navigator.userActivation && !navigator.userActivation.isActive) return;
    audioContext ??= new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = kind === 'danger' ? 'sawtooth' : 'sine';
    oscillator.frequency.value = audio.frequenciesHz[kind] ?? audio.frequenciesHz.select;
    gain.gain.setValueAtTime(audio.initialGain, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(
      audio.finalGain,
      audioContext.currentTime + audio.fadeSeconds,
    );
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + audio.durationSeconds);
  } catch {
    // Audio is optional; game behavior never depends on browser audio permission.
  }
}

function act(operation, sound = 'select') {
  const changed = operation();
  if (changed !== false) tone(sound);
  return changed;
}

function replaceGame(seed, options = {}) {
  const freshGame = createGame(seed, options);
  for (const key of Object.keys(game)) {
    if (!(key in freshGame)) delete game[key];
  }
  Object.assign(game, freshGame);
  dragPayload.value = null;
  dragOverTrash.value = false;
  dragOverTowerId.value = null;
  recycleArmed.value = false;
  previousTime = 0;
  tone('select');
}

const {
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
  openLevel,
  importProgressFile,
  prepareProgressDownload,
  requestProgressReset,
  requestRunExit,
  retryRun,
  returnToLevelSelect,
  startEndless,
  startNextRun,
  startSelectedLevel,
} = useLevelCampaign({
  game,
  replaceGame,
  resetClock: () => { previousTime = 0; },
});

function downloadProgressFile() {
  const { filename, contents } = prepareProgressDownload();
  const url = URL.createObjectURL(new Blob([contents], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function disarmRecycle() {
  recycleArmed.value = false;
  dragOverTowerId.value = null;
}

const actions = {
  startWave: () => act(() => startWave(game), 'success'),
  selectArsenal: (itemId) => {
    disarmRecycle();
    return act(() => selectArsenalItem(game, itemId));
  },
  placeTower: (row, column) => act(() => placeTower(game, row, column), 'place'),
  enemy: (enemyId) => {
    if (game.targetingOperator) return act(() => applyTargetOperator(game, enemyId), 'place');
    return act(() => selectEnemy(game, enemyId));
  },
  tower: (towerId) => {
    const tower = game.towers.find((candidate) => candidate.id === towerId);
    if (!tower || tower.tutorialPreset) return false;
    if (recycleArmed.value) {
      const changed = act(() => recycleTower(game, towerId), 'success');
      recycleArmed.value = false;
      dragOverTowerId.value = null;
      return changed;
    }
    if (game.selectedStoredConstantId !== null && configurableTowerIds.includes(tower?.typeId)) {
      return act(() => installAssembly(game, towerId), 'success');
    }
    return false;
  },
  pause: () => act(() => togglePause(game)),
  speed: () => act(() => toggleSpeed(game)),
  sound: () => {
    game.sound = !game.sound;
    if (game.sound) tone('select');
  },
  retrySame: () => retryRun(true),
  retryNew: () => retryRun(false),
  next: () => startNextRun(),
  selectLevel: () => requestRunExit(),
  cancel: () => {
    disarmRecycle();
    return act(() => cancelSelection(game));
  },
  dismissTutorial: () => {
    game.tutorialVisible = false;
    tone('select');
  },
  confirmPartial: () => act(() => confirmPartial(game), 'success'),
  advanceWeaponTutorial: () => act(() => advanceWeaponTutorial(game), 'success'),
  advanceEnemyTutorial: () => act(() => advanceEnemyTutorial(game), 'success'),
  discardArsenal: (itemId) => act(() => discardArsenalItem(game, itemId), 'danger'),
  discardFormula: (itemId) => act(() => discardFormulaItem(game, itemId), 'danger'),
  discardConstant: (itemId) => act(() => discardConstantItem(game, itemId), 'danger'),
  discardStoredConstant: (itemId) => act(() => discardStoredConstant(game, itemId), 'danger'),
  recycleTower: (towerId) => {
    const changed = act(() => recycleTower(game, towerId), 'success');
    recycleArmed.value = false;
    dragOverTowerId.value = null;
    return changed;
  },
  toggleRecycle: () => {
    recycleArmed.value = !recycleArmed.value;
    dragOverTowerId.value = null;
    if (recycleArmed.value) cancelSelection(game);
    tone('select');
    return true;
  },
  pickFormula: (itemId) => {
    disarmRecycle();
    return act(() => selectFormulaItem(game, itemId));
  },
  pickConstant: (itemId) => {
    disarmRecycle();
    return act(() => selectConstantItem(game, itemId));
  },
  pickStoredConstant: (itemId) => {
    disarmRecycle();
    return act(() => selectStoredConstant(game, itemId));
  },
  prepareAssembly: () => act(() => prepareAssembly(game), 'success'),
  closeFormula: () => {
    game.selectedEnemyId = null;
  },
};

function closestElement(target, selector) {
  return target instanceof Element ? target.closest(selector) : null;
}

function handleDragStart(event) {
  const item = closestElement(event.target, '[data-drag-kind]');
  if (!item) return;
  recycleArmed.value = false;
  dragOverTowerId.value = null;
  dragOverTrash.value = false;
  dragPayload.value = { kind: item.dataset.dragKind, id: item.dataset.dragId };
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', JSON.stringify(dragPayload.value));
  }
}

function handleDragEnd() {
  dragPayload.value = null;
  dragOverTrash.value = false;
  dragOverTowerId.value = null;
  recycleArmed.value = false;
}

function handleDragOver(event) {
  if (!dragPayload.value) return;
  const tower = closestElement(event.target, '[data-recycle-tower-id]');
  if (dragPayload.value.kind === 'recycle-tool' && tower) {
    event.preventDefault();
    dragOverTowerId.value = tower.dataset.recycleTowerId;
    dragOverTrash.value = false;
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    return;
  }
  if (!trashDiscardKinds.has(dragPayload.value.kind) || !closestElement(event.target, '.trash-dropzone')) return;
  event.preventDefault();
  dragOverTrash.value = true;
  dragOverTowerId.value = null;
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
}

function handleDragLeave(event) {
  const tower = closestElement(event.target, '[data-recycle-tower-id]');
  if (tower && !(event.relatedTarget instanceof Node && tower.contains(event.relatedTarget))) {
    if (dragOverTowerId.value === tower.dataset.recycleTowerId) dragOverTowerId.value = null;
  }
  const bin = closestElement(event.target, '.trash-dropzone');
  if (!bin || (event.relatedTarget instanceof Node && bin.contains(event.relatedTarget))) return;
  dragOverTrash.value = false;
}

function discardPayload({ kind, id }) {
  if (kind === 'arsenal') actions.discardArsenal(id);
  else if (kind === 'formula') actions.discardFormula(id);
  else if (kind === 'constant') actions.discardConstant(id);
  else if (kind === 'stored-constant') actions.discardStoredConstant(id);
}

function handleDrop(event) {
  if (!dragPayload.value) return;
  const tower = closestElement(event.target, '[data-recycle-tower-id]');
  if (dragPayload.value.kind === 'recycle-tool' && tower) {
    event.preventDefault();
    actions.recycleTower(tower.dataset.recycleTowerId);
  } else if (
    trashDiscardKinds.has(dragPayload.value.kind)
    && closestElement(event.target, '.trash-dropzone')
  ) {
    event.preventDefault();
    discardPayload(dragPayload.value);
  }
  handleDragEnd();
}

function handleRootKeydown(event) {
  if (event.key !== 'Delete') return;
  const tower = closestElement(event.target, '[data-recycle-tower-id]');
  if (tower) {
    event.preventDefault();
    actions.recycleTower(tower.dataset.recycleTowerId);
    return;
  }
  const item = closestElement(event.target, '[data-drag-kind]');
  if (!item || !trashDiscardKinds.has(item.dataset.dragKind)) return;
  event.preventDefault();
  discardPayload({ kind: item.dataset.dragKind, id: item.dataset.dragId });
}

function handleWindowKeydown(event) {
  if (screen.value !== 'game' || pendingConfirmation.value || ['won', 'lost'].includes(game.phase)) return;
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (event.key === 'Escape') {
    actions.cancel();
    return;
  }
  if (game.phase === 'preparing' && (game.enemyTutorialQueue.length > 0 || game.weaponTutorialQueue.length > 0)) return;
  const shortcutIndex = Number(event.key);
  if (
    Number.isInteger(shortcutIndex)
    && shortcutIndex >= 1
    && shortcutIndex <= OPERATOR_QUEUE_CAPACITY
  ) {
    const item = game.operatorQueue[shortcutIndex - 1];
    if (item) {
      event.preventDefault();
      actions.selectArsenal(item.id);
    }
  } else if (event.code === 'Space') {
    event.preventDefault();
    actions.pause();
  }
}

function handleVisibilityChange() {
  if (
    screen.value === 'game'
    && document.hidden
    && ['preparing', 'running'].includes(game.phase)
    && !game.paused
  ) togglePause(game);
}

function frame(now) {
  const elapsed = previousTime ? (now - previousTime) / 1000 : 0;
  previousTime = now;
  if (screen.value === 'game') tick(game, elapsed);
  animationFrame = requestAnimationFrame(frame);
}

onMounted(() => {
  window.addEventListener('keydown', handleWindowKeydown);
  document.addEventListener('visibilitychange', handleVisibilityChange);
  animationFrame = requestAnimationFrame(frame);
});

onBeforeUnmount(() => {
  cancelAnimationFrame(animationFrame);
  window.removeEventListener('keydown', handleWindowKeydown);
  document.removeEventListener('visibilitychange', handleVisibilityChange);
  audioContext?.close();
});

defineExpose({ game, actions, progress });
</script>

<template>
  <LevelSelectScreen
    v-if="screen === 'levels'"
    :inert="Boolean(pendingConfirmation)"
    :progress="progress"
    :selected-level-index="selectedLevelIndex"
    :skip-tutorial="skipTutorial"
    :notice="levelSelectNotice"
    @select-level="openLevel"
    @update:skip-tutorial="skipTutorial = $event"
    @start-level="startSelectedLevel"
    @start-endless="startEndless"
    @download-progress="downloadProgressFile"
    @import-progress="importProgressFile"
    @request-reset-progress="requestProgressReset"
  />

  <main
    v-else
    class="game-shell"
    :inert="Boolean(pendingConfirmation) || ['won', 'lost'].includes(game.phase)"
    @dragstart="handleDragStart"
    @dragend="handleDragEnd"
    @dragover="handleDragOver"
    @dragleave="handleDragLeave"
    @drop="handleDrop"
    @keydown="handleRootKeydown"
  >
    <GameHud
      :state="game"
      @speed="actions.speed"
      @sound="actions.sound"
      @pause="actions.pause"
      @select-level="actions.selectLevel"
    />

    <OperatorDock :state="game" :drag-payload="dragPayload" @select="actions.selectArsenal" />

    <div class="battle-layout">
      <div class="battle-main">
        <BattlefieldStage
          :state="game"
          :drag-payload="dragPayload"
          :drag-over-tower-id="dragOverTowerId"
          :recycle-armed="recycleArmed"
          @place-tower="actions.placeTower"
          @enemy="actions.enemy"
          @tower="actions.tower"
          @cancel="actions.cancel"
          @dismiss-tutorial="actions.dismissTutorial"
        />
        <EnemyFormulaPanel :state="game" @close="actions.closeFormula" />
        <DerivationLog :logs="game.logs" />
      </div>

      <GameWorkbench
        :state="game"
        :discard-dragging="Boolean(dragPayload && trashDiscardKinds.has(dragPayload.kind))"
        :drag-over="dragOverTrash"
        :drag-payload="dragPayload"
        :recycle-armed="recycleArmed"
        @pick-formula="actions.pickFormula"
        @pick-constant="actions.pickConstant"
        @pick-stored-constant="actions.pickStoredConstant"
        @prepare-assembly="actions.prepareAssembly"
        @toggle-recycle="actions.toggleRecycle"
      />
    </div>

    <WavePrepBar :state="game" @start-wave="actions.startWave" />

    <div class="toast-stack" data-bind="toasts" aria-live="assertive">
      <div v-if="game.toastTimer > 0" class="toast" :class="`is-${game.toastTone}`">{{ game.toast }}</div>
    </div>

    <div data-bind="overlay">
      <GameOverlay
        :state="game"
        @cancel="actions.cancel"
        @confirm-partial="actions.confirmPartial"
        @advance-enemy-tutorial="actions.advanceEnemyTutorial"
        @advance-weapon-tutorial="actions.advanceWeaponTutorial"
        @pause="actions.pause"
        @select-level="actions.selectLevel"
      />
    </div>
    <p class="sr-only" data-bind="announcer" aria-live="polite">{{ game.toast }}</p>
  </main>

  <GameResultDialog
    v-if="screen === 'game' && ['won', 'lost'].includes(game.phase)"
    :state="game"
    :newly-unlocked-label="newlyUnlockedLabel"
    :progress-save-failed="progressSaveFailed"
    @retry-same="actions.retrySame"
    @retry-new="actions.retryNew"
    @next="actions.next"
    @select-level="returnToLevelSelect"
  />

  <ConfirmationDialog
    :open="Boolean(pendingConfirmation)"
    :title="confirmation.title"
    :description="confirmation.description"
    :confirm-label="confirmation.confirmLabel"
    :danger="confirmation.danger"
    @confirm="confirmPendingAction"
    @cancel="cancelConfirmation"
  />
</template>
