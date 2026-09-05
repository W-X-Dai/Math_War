<script setup>
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';

import {
  applyTargetOperator,
  cancelSelection,
  confirmPartial,
  createGame,
  discardArsenalItem,
  discardConstantItem,
  discardFormulaItem,
  discardTower,
  installAssembly,
  placeTower,
  prepareAssembly,
  selectArsenalItem,
  selectConstantItem,
  selectEnemy,
  selectFormulaItem,
  startGame,
  startWave,
  tick,
  togglePause,
  toggleSpeed,
  toggleTower,
} from './game/engine.js';
import BattlefieldStage from './components/BattlefieldStage.vue';
import DerivationLog from './components/DerivationLog.vue';
import GameHud from './components/GameHud.vue';
import GameOverlay from './components/GameOverlay.vue';
import GameWorkbench from './components/GameWorkbench.vue';
import OperatorDock from './components/OperatorDock.vue';
import WavePrepBar from './components/WavePrepBar.vue';

function randomSeed() {
  const values = new Uint32Array(1);
  globalThis.crypto?.getRandomValues(values);
  return values[0] || ((Date.now() ^ Math.floor(performance.now() * 1000)) >>> 0);
}

const game = reactive(createGame(randomSeed()));
const dragPayload = ref(null);
const dragOverTrash = ref(false);
let audioContext = null;
let animationFrame = 0;
let previousTime = 0;

function tone(kind = 'select') {
  if (!game.sound) return;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    audioContext ??= new AudioContextClass();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const frequencies = { select: 420, place: 560, success: 740, danger: 180 };
    oscillator.type = kind === 'danger' ? 'sawtooth' : 'sine';
    oscillator.frequency.value = frequencies[kind] ?? frequencies.select;
    gain.gain.setValueAtTime(0.045, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.11);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.12);
  } catch {
    // Audio is optional; game behavior never depends on browser audio permission.
  }
}

function act(operation, sound = 'select') {
  const changed = operation();
  if (changed !== false) tone(sound);
  return changed;
}

function replaceGame(seed) {
  const freshGame = createGame(seed);
  for (const key of Object.keys(game)) {
    if (!(key in freshGame)) delete game[key];
  }
  Object.assign(game, freshGame);
  previousTime = 0;
  tone('select');
}

const actions = {
  start: () => act(() => startGame(game), 'success'),
  startWave: () => act(() => startWave(game), 'success'),
  selectArsenal: (itemId) => act(() => selectArsenalItem(game, itemId)),
  placeTower: (row, column) => act(() => placeTower(game, row, column), 'place'),
  enemy: (enemyId) => {
    if (game.targetingOperator) return act(() => applyTargetOperator(game, enemyId), 'place');
    return act(() => selectEnemy(game, enemyId));
  },
  tower: (towerId) => {
    if (game.assemblyValue !== null) return act(() => installAssembly(game, towerId), 'success');
    return act(() => toggleTower(game, towerId));
  },
  pause: () => act(() => togglePause(game)),
  speed: () => act(() => toggleSpeed(game)),
  sound: () => {
    game.sound = !game.sound;
    if (game.sound) tone('select');
  },
  restartSame: () => replaceGame(game.runSeed),
  restartNew: () => replaceGame(randomSeed()),
  cancel: () => act(() => cancelSelection(game)),
  dismissTutorial: () => {
    game.tutorialVisible = false;
    tone('select');
  },
  confirmPartial: () => act(() => confirmPartial(game), 'success'),
  discardArsenal: (itemId) => act(() => discardArsenalItem(game, itemId), 'danger'),
  discardFormula: (itemId) => act(() => discardFormulaItem(game, itemId), 'danger'),
  discardConstant: (itemId) => act(() => discardConstantItem(game, itemId), 'danger'),
  discardTower: (towerId) => act(() => discardTower(game, towerId), 'danger'),
  pickFormula: (itemId) => act(() => selectFormulaItem(game, itemId)),
  pickConstant: (itemId) => act(() => selectConstantItem(game, itemId)),
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
  dragPayload.value = { kind: item.dataset.dragKind, id: item.dataset.dragId };
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', JSON.stringify(dragPayload.value));
  }
}

function handleDragEnd() {
  dragPayload.value = null;
  dragOverTrash.value = false;
}

function handleDragOver(event) {
  if (!dragPayload.value || !closestElement(event.target, '.trash-dropzone')) return;
  event.preventDefault();
  dragOverTrash.value = true;
  if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
}

function handleDragLeave(event) {
  const bin = closestElement(event.target, '.trash-dropzone');
  if (!bin || (event.relatedTarget instanceof Node && bin.contains(event.relatedTarget))) return;
  dragOverTrash.value = false;
}

function discardPayload({ kind, id }) {
  if (kind === 'arsenal') actions.discardArsenal(id);
  else if (kind === 'formula') actions.discardFormula(id);
  else if (kind === 'constant') actions.discardConstant(id);
  else if (kind === 'tower') actions.discardTower(id);
}

function handleDrop(event) {
  if (!dragPayload.value || !closestElement(event.target, '.trash-dropzone')) return;
  event.preventDefault();
  discardPayload(dragPayload.value);
  handleDragEnd();
}

function handleRootKeydown(event) {
  if (event.key !== 'Delete') return;
  const item = closestElement(event.target, '[data-drag-kind]');
  if (!item) return;
  event.preventDefault();
  discardPayload({ kind: item.dataset.dragKind, id: item.dataset.dragId });
}

function handleWindowKeydown(event) {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (/^[1-8]$/.test(event.key)) {
    const item = game.operatorQueue[Number(event.key) - 1];
    if (item) {
      event.preventDefault();
      actions.selectArsenal(item.id);
    }
  } else if (event.key === 'Escape') {
    actions.cancel();
  } else if (event.code === 'Space') {
    event.preventDefault();
    actions.pause();
  }
}

function handleVisibilityChange() {
  if (document.hidden && ['preparing', 'running'].includes(game.phase) && !game.paused) togglePause(game);
}

function frame(now) {
  const elapsed = previousTime ? (now - previousTime) / 1000 : 0;
  previousTime = now;
  tick(game, elapsed);
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

defineExpose({ game, actions });
</script>

<template>
  <main
    class="game-shell"
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
      @restart="actions.restartSame"
    />

    <OperatorDock :state="game" :drag-payload="dragPayload" @select="actions.selectArsenal" />

    <div class="battle-layout">
      <div class="battle-main">
        <BattlefieldStage
          :state="game"
          :drag-payload="dragPayload"
          @place-tower="actions.placeTower"
          @enemy="actions.enemy"
          @tower="actions.tower"
          @cancel="actions.cancel"
          @dismiss-tutorial="actions.dismissTutorial"
          @close-formula="actions.closeFormula"
        />
        <DerivationLog :logs="game.logs" />
      </div>

      <GameWorkbench
        :state="game"
        :dragging="Boolean(dragPayload)"
        :drag-over="dragOverTrash"
        :drag-payload="dragPayload"
        @pick-formula="actions.pickFormula"
        @pick-constant="actions.pickConstant"
        @prepare-assembly="actions.prepareAssembly"
      />
    </div>

    <WavePrepBar :state="game" @start-wave="actions.startWave" />

    <div class="toast-stack" data-bind="toasts" aria-live="assertive">
      <div v-if="game.toastTimer > 0" class="toast" :class="`is-${game.toastTone}`">{{ game.toast }}</div>
    </div>

    <div data-bind="overlay">
      <GameOverlay
        :state="game"
        @start="actions.start"
        @cancel="actions.cancel"
        @confirm-partial="actions.confirmPartial"
        @pause="actions.pause"
        @restart-same="actions.restartSame"
        @restart-new="actions.restartNew"
      />
    </div>
    <p class="sr-only" data-bind="announcer" aria-live="polite">{{ game.toast }}</p>
  </main>
</template>
