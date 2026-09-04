import './styles.css';

import { ENEMY_TYPES, OPERATOR_ORDER } from './game/content.js';
import {
  applyTargetOperator,
  cancelSelection,
  confirmPartial,
  createGame,
  discardConstantItem,
  discardFormulaItem,
  discardTower,
  installAssembly,
  placeTower,
  prepareAssembly,
  selectConstantItem,
  selectEnemy,
  selectFormulaItem,
  selectOperator,
  startGame,
  startWave,
  tick,
  togglePause,
  toggleSpeed,
  toggleTower,
} from './game/engine.js';
import { GameView } from './ui/game-view.js';

const root = document.querySelector('#app');
let game = createGame();
let audioContext = null;

function tone(kind = 'select') {
  if (!game.sound) return;
  try {
    audioContext ??= new AudioContext();
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

function refresh() {
  view.render(game);
}

function act(operation, sound = 'select') {
  const changed = operation();
  if (changed !== false) tone(sound);
  refresh();
  return changed;
}

const actions = {
  enemyType: (typeId) => ENEMY_TYPES[typeId],
  start: () => act(() => startGame(game), 'success'),
  startWave: () => act(() => startWave(game), 'success'),
  selectOperator: (operatorId) => act(() => selectOperator(game, operatorId)),
  placeTower: (row, column) => act(() => placeTower(game, row, column), 'place'),
  enemy: (enemyId) => {
    if (game.targetingOperator) act(() => applyTargetOperator(game, enemyId), 'place');
    else act(() => selectEnemy(game, enemyId));
  },
  toggleTower: (towerId) => {
    if (game.assemblyValue !== null) act(() => installAssembly(game, towerId), 'success');
    else act(() => toggleTower(game, towerId));
  },
  pause: () => act(() => togglePause(game)),
  speed: () => act(() => toggleSpeed(game)),
  sound: () => {
    game.sound = !game.sound;
    if (game.sound) tone('select');
    refresh();
  },
  restart: () => {
    game = createGame();
    tone('select');
    refresh();
  },
  cancel: () => act(() => cancelSelection(game)),
  dismissTutorial: () => {
    game.tutorialVisible = false;
    tone('select');
    refresh();
  },
  confirmPartial: () => act(() => confirmPartial(game), 'success'),
  discardFormula: (itemId) => act(() => discardFormulaItem(game, itemId), 'danger'),
  discardConstant: (itemId) => act(() => discardConstantItem(game, itemId), 'danger'),
  discardTower: (towerId) => act(() => discardTower(game, towerId), 'danger'),
  pickFormula: (itemId) => act(() => selectFormulaItem(game, itemId)),
  pickConstant: (itemId) => act(() => selectConstantItem(game, itemId)),
  prepareAssembly: () => act(() => prepareAssembly(game), 'success'),
  closeFormula: () => {
    game.selectedEnemyId = null;
    refresh();
  },
};

const view = new GameView(root, actions);
refresh();

let previousTime = performance.now();
let previousRender = previousTime;

function frame(now) {
  const elapsed = (now - previousTime) / 1000;
  previousTime = now;
  tick(game, elapsed);
  if (now - previousRender >= 70) {
    refresh();
    previousRender = now;
  }
  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

window.addEventListener('keydown', (event) => {
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
  if (/^[1-8]$/.test(event.key)) {
    event.preventDefault();
    actions.selectOperator(OPERATOR_ORDER[Number(event.key) - 1]);
  } else if (event.key === 'Escape') {
    actions.cancel();
  } else if (event.code === 'Space') {
    event.preventDefault();
    actions.pause();
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden && game.phase === 'running' && !game.paused) {
    togglePause(game);
    refresh();
  }
});
