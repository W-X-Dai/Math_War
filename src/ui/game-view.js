import {
  damage,
  differentiate,
  formatExpression,
  isZero,
} from '../domain/expression.js';
import {
  BOARD,
  CONSTANT_QUEUE_CAPACITY,
  CONSTANT_QUEUE_INTERVAL,
  FORMULA_QUEUE_CAPACITY,
  FORMULA_QUEUE_INTERVAL,
  OPERATORS,
  OPERATOR_ORDER,
  WAVES,
} from '../game/content.js';
import {
  constantQueueDetails,
  currentAssembly,
  enemyThreat,
  formulaQueueDetails,
  partialPreview,
  selectedEnemy,
} from '../game/engine.js';
import { escapeHtml, formatValue, prettyFormula } from './format.js';
import { icon } from './icons.js';

const formulaText = (expression) => prettyFormula(formatExpression(expression));

function derivativeDepth(expression) {
  if (expression.exponentials.length > 0) return '∞';
  if (isZero(expression)) return '0';
  const highestPower = expression.terms.reduce((maximum, term) => Math.max(maximum, term.xPower), 0);
  return String(highestPower + 1);
}

function operatorCardsMarkup() {
  return OPERATOR_ORDER.map((id) => {
    const operator = OPERATORS[id];
    const usage = operator.kind === 'tower' ? '放置' : operator.kind === 'global' ? '全場・一次性' : '單體・一次性';
    return `
      <button
        class="operator-card ${operator.kind !== 'tower' ? 'is-consumable' : ''}"
        type="button"
        data-action="operator"
        data-operator="${id}"
        aria-pressed="false"
        title="${escapeHtml(operator.description)}"
      >
        <span class="operator-key">${operator.key}</span>
        <span class="operator-art ${operator.art}" aria-hidden="true"></span>
        <span class="operator-copy">
          <span class="operator-name"><b>${escapeHtml(operator.symbol)}</b> ${escapeHtml(operator.name)}</span>
          <span class="operator-desc">${usage}</span>
        </span>
        <span class="operator-cost">Σ ${operator.cost}</span>
      </button>
    `;
  }).join('');
}

function gridMarkup() {
  const cells = [];
  for (let row = 0; row < BOARD.rows; row += 1) {
    for (let column = 0; column < BOARD.columns; column += 1) {
      const placement = column < BOARD.placeableColumns;
      cells.push(`
        <button
          class="grid-cell ${placement ? 'is-placement-zone' : 'is-path-only'}"
          type="button"
          data-action="cell"
          data-row="${row}"
          data-column="${column}"
          aria-label="第 ${row + 1} 路，第 ${column + 1} 格${placement ? '' : '，不可放置'}"
          ${placement ? '' : 'disabled'}
        ><span aria-hidden="true">＋</span></button>
      `);
    }
  }
  return cells.join('');
}

function shellMarkup() {
  return `
    <main class="game-shell">
      <header class="top-hud">
        <div class="brand-lockup" aria-label="微分防線">
          <span class="brand-orbit" aria-hidden="true"><i></i></span>
          <span class="brand-title">微分防線</span>
        </div>
        <div class="hud-cluster">
          <div class="hud-stat base-hud"><span>基地</span><strong data-bind="base">500 / 500</strong></div>
          <div class="wave-progress">
            <strong data-bind="wave">第 1 / 5 波</strong>
            <span class="wave-dots" data-bind="waveDots"></span>
          </div>
          <div class="hud-stat energy-hud"><span>Σ</span><strong data-bind="energy">540</strong></div>
        </div>
        <div class="hud-actions">
          <button class="icon-button speed-button" type="button" data-action="speed" aria-label="切換遊戲速度"><span data-bind="speed">×1</span></button>
          <button class="icon-button" type="button" data-action="sound" data-bind-button="sound" aria-label="關閉音效">${icon('volume')}</button>
          <button class="icon-button" type="button" data-action="pause" data-bind-button="pause" aria-label="暫停">${icon('pause')}</button>
          <button class="icon-button restart-button" type="button" data-action="restart" aria-label="重新開始">${icon('restart')}<span>重來</span></button>
        </div>
      </header>

      <section class="operator-dock" aria-labelledby="operator-heading">
        <div class="dock-heading" id="operator-heading">
          <strong>算子庫</strong>
          <span data-bind="selectionHint">選一個裝置</span>
        </div>
        <div class="operator-scroll">${operatorCardsMarkup()}</div>
      </section>

      <div class="battle-layout">
        <div class="battle-main">
          <section class="battle-stage" aria-label="五路函數戰場">
            <div class="battlefield" data-bind="battlefield">
              <div class="lane-labels" aria-hidden="true">${[1, 2, 3, 4, 5].map((lane) => `<span>${lane}</span>`).join('')}</div>
              <div class="battle-grid">${gridMarkup()}</div>
              <div class="tower-layer" data-layer="towers"></div>
              <div class="enemy-layer" data-layer="enemies"></div>
              <div class="effect-layer" data-layer="effects" aria-hidden="true"></div>
              <div class="wave-banner" data-bind="waveBanner" aria-live="polite"></div>
              <div class="targeting-mode" data-bind="targeting" hidden></div>
              <div class="tutorial-anchor" data-bind="tutorial"></div>
            </div>
            <aside class="formula-panel" data-bind="formulaPanel"></aside>
          </section>

          <section class="derivation-log" aria-labelledby="log-heading">
            <div class="formula-panel-head">
              <span aria-hidden="true">✦</span>
              <h2 id="log-heading">推導紀錄</h2>
            </div>
            <div class="event-list" data-bind="logs" aria-live="polite"></div>
          </section>
        </div>

        <aside class="workbench" aria-labelledby="workbench-heading" data-bind="workbench"></aside>
      </div>

      <footer class="bottom-bar">
        <p data-bind="waveHint"></p>
        <button class="primary-button" type="button" data-action="start-wave" data-bind-button="startWave">
          <span data-bind="startWaveLabel">開始第 1 波</span>${icon('arrow')}
        </button>
      </footer>

      <div class="toast-stack" data-bind="toasts" aria-live="assertive"></div>
      <div data-bind="overlay"></div>
      <p class="sr-only" aria-live="polite" data-bind="announcer"></p>
    </main>
  `;
}

export class GameView {
  constructor(root, actions) {
    this.root = root;
    this.actions = actions;
    this.towerElements = new Map();
    this.enemyElements = new Map();
    this.effectElements = new Map();
    this.lastOverlayKey = '';
    this.lastWorkbenchKey = '';
    this.lastLogKey = '';
    this.lastTutorialKey = '';
    this.dragging = false;
    this.dragPayload = null;
    this.root.innerHTML = shellMarkup();
    this.bindings = new Map(
      [...this.root.querySelectorAll('[data-bind]')].map((element) => [element.dataset.bind, element]),
    );
    this.root.addEventListener('click', (event) => this.handleClick(event));
    this.root.addEventListener('dragstart', (event) => this.handleDragStart(event));
    this.root.addEventListener('dragend', () => this.handleDragEnd());
    this.root.addEventListener('dragover', (event) => this.handleDragOver(event));
    this.root.addEventListener('dragleave', (event) => this.handleDragLeave(event));
    this.root.addEventListener('drop', (event) => this.handleDrop(event));
    this.root.addEventListener('keydown', (event) => this.handleDeleteKey(event));
  }

  handleClick(event) {
    const control = event.target.closest('[data-action]');
    if (!control || !this.root.contains(control)) return;
    const action = control.dataset.action;
    if (action === 'operator') this.actions.selectOperator(control.dataset.operator);
    else if (action === 'cell') this.actions.placeTower(Number(control.dataset.row), Number(control.dataset.column));
    else if (action === 'enemy') this.actions.enemy(control.dataset.enemyId);
    else if (action === 'tower') this.actions.toggleTower(control.dataset.towerId);
    else if (action === 'start') this.actions.start();
    else if (action === 'start-wave') this.actions.startWave();
    else if (action === 'pause') this.actions.pause();
    else if (action === 'speed') this.actions.speed();
    else if (action === 'sound') this.actions.sound();
    else if (action === 'restart') this.actions.restart();
    else if (action === 'cancel') this.actions.cancel();
    else if (action === 'dismiss-tutorial') this.actions.dismissTutorial();
    else if (action === 'confirm-partial') this.actions.confirmPartial();
    else if (action === 'pick-formula') this.actions.pickFormula(control.dataset.itemId);
    else if (action === 'pick-constant') this.actions.pickConstant(control.dataset.itemId);
    else if (action === 'prepare-assembly') this.actions.prepareAssembly();
    else if (action === 'close-formula') this.actions.closeFormula();
  }

  handleDragStart(event) {
    const item = event.target.closest('[data-drag-kind]');
    if (!item) return;
    this.dragging = true;
    this.dragPayload = { kind: item.dataset.dragKind, id: item.dataset.dragId };
    item.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', JSON.stringify(this.dragPayload));
    this.root.querySelector('.trash-dropzone')?.classList.add('is-active');
  }

  handleDragEnd() {
    this.root.querySelectorAll('.is-dragging').forEach((item) => item.classList.remove('is-dragging'));
    this.root.querySelector('.trash-dropzone')?.classList.remove('is-active', 'is-over');
    this.dragging = false;
    this.dragPayload = null;
    this.lastWorkbenchKey = '';
  }

  handleDragOver(event) {
    const bin = event.target.closest('.trash-dropzone');
    if (!bin || !this.dragPayload) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    bin.classList.add('is-over');
  }

  handleDragLeave(event) {
    const bin = event.target.closest('.trash-dropzone');
    if (bin && !bin.contains(event.relatedTarget)) bin.classList.remove('is-over');
  }

  handleDrop(event) {
    const bin = event.target.closest('.trash-dropzone');
    if (!bin || !this.dragPayload) return;
    event.preventDefault();
    const { kind, id } = this.dragPayload;
    if (kind === 'formula') this.actions.discardFormula(id);
    else if (kind === 'constant') this.actions.discardConstant(id);
    else if (kind === 'tower') this.actions.discardTower(id);
    this.handleDragEnd();
  }

  handleDeleteKey(event) {
    if (event.key !== 'Delete') return;
    const item = event.target.closest('[data-drag-kind]');
    if (!item) return;
    event.preventDefault();
    if (item.dataset.dragKind === 'formula') this.actions.discardFormula(item.dataset.dragId);
    else if (item.dataset.dragKind === 'constant') this.actions.discardConstant(item.dataset.dragId);
    else if (item.dataset.dragKind === 'tower') this.actions.discardTower(item.dataset.dragId);
  }

  render(state) {
    this.renderHud(state);
    this.renderDock(state);
    this.renderGrid(state);
    this.renderTowers(state);
    this.renderEnemies(state);
    this.renderEffects(state);
    this.renderFormulaPanel(state);
    this.renderLogs(state);
    this.renderWorkbench(state);
    this.renderBottomBar(state);
    this.renderTutorial(state);
    this.renderToast(state);
    this.renderOverlay(state);
  }

  renderHud(state) {
    this.bindings.get('base').textContent = `${state.baseHp} / ${state.maxBaseHp}`;
    this.bindings.get('energy').textContent = state.energy;
    this.bindings.get('wave').textContent = `第 ${state.waveIndex + 1} / ${WAVES.length} 波`;
    this.bindings.get('waveDots').innerHTML = WAVES.map((_, index) => (
      `<i class="${index < state.waveIndex ? 'is-done' : index === state.waveIndex ? 'is-current' : ''}"></i>`
    )).join('');
    this.bindings.get('speed').textContent = `×${state.speed}`;

    const pauseButton = this.root.querySelector('[data-bind-button="pause"]');
    pauseButton.innerHTML = state.paused ? icon('play') : icon('pause');
    pauseButton.setAttribute('aria-label', state.paused ? '繼續' : '暫停');
    const soundButton = this.root.querySelector('[data-bind-button="sound"]');
    soundButton.innerHTML = icon(state.sound ? 'volume' : 'muted');
    soundButton.setAttribute('aria-label', state.sound ? '關閉音效' : '開啟音效');
  }

  renderDock(state) {
    for (const button of this.root.querySelectorAll('.operator-card')) {
      const id = button.dataset.operator;
      const operator = OPERATORS[id];
      const locked = operator.unlockWave > state.waveIndex;
      const unaffordable = state.energy < operator.cost;
      const used = id === 'partial' && state.partialUsed;
      const selected = state.selectedOperator === id || state.targetingOperator === id || (id === 'partial' && state.partialConfirmOpen);
      button.classList.toggle('is-locked', locked);
      button.classList.toggle('is-unaffordable', unaffordable || used);
      button.classList.toggle('is-selected', selected);
      button.setAttribute('aria-pressed', String(selected));
      button.disabled = locked || used;
      const description = button.querySelector('.operator-desc');
      if (locked) description.textContent = `第 ${operator.unlockWave + 1} 波解鎖`;
      else if (used) description.textContent = '本波已使用';
      else description.textContent = operator.kind === 'tower' ? '放置' : operator.kind === 'global' ? '全場・一次性' : '單體・一次性';
    }

    let hint = '選擇算子，再點擊空格或敵人';
    if (state.selectedOperator) hint = `${OPERATORS[state.selectedOperator].name}：點擊發亮格子`;
    if (state.targetingOperator) hint = '單體算子已就緒：點擊一隻敵人';
    this.bindings.get('selectionHint').textContent = hint;
  }

  renderGrid(state) {
    const placing = Boolean(state.selectedOperator);
    for (const cell of this.root.querySelectorAll('.grid-cell.is-placement-zone')) {
      const row = Number(cell.dataset.row);
      const column = Number(cell.dataset.column);
      const occupied = state.towers.some((tower) => tower.row === row && tower.column === column);
      cell.classList.toggle('is-placeable', placing && !occupied);
      cell.classList.toggle('is-invalid', placing && occupied);
    }
    this.bindings.get('battlefield').classList.toggle('has-targeting', Boolean(state.targetingOperator));
  }

  renderTowers(state) {
    const layer = this.root.querySelector('[data-layer="towers"]');
    const liveIds = new Set(state.towers.map((tower) => tower.id));
    for (const [id, element] of this.towerElements) {
      if (!liveIds.has(id)) {
        element.remove();
        this.towerElements.delete(id);
      }
    }

    for (const tower of state.towers) {
      let element = this.towerElements.get(tower.id);
      if (!element) {
        element = document.createElement('button');
        element.type = 'button';
        element.className = 'tower';
        element.dataset.action = 'tower';
        element.dataset.towerId = tower.id;
        element.dataset.dragKind = 'tower';
        element.dataset.dragId = tower.id;
        element.draggable = true;
        element.setAttribute('aria-keyshortcuts', 'Delete');
        element.innerHTML = `
          <span class="tower-sprite ${OPERATORS[tower.typeId].art}" aria-hidden="true"></span>
          <span class="tower-slot" aria-hidden="true"></span>
          <span class="tower-status"><i></i></span>
        `;
        layer.append(element);
        this.towerElements.set(tower.id, element);
      }
      element.style.setProperty('--x', `${tower.position * 100}%`);
      element.style.setProperty('--row', tower.row);
      element.classList.toggle('is-firing', tower.fireFlash > 0);
      element.classList.toggle('is-paused', !tower.active);
      const configurable = tower.typeId === 'subtract' || tower.typeId === 'definiteIntegralTower';
      const filled = tower.typeId === 'subtract'
        ? tower.parameter !== null
        : tower.typeId === 'definiteIntegralTower'
          ? tower.lowerBound !== null && tower.upperBound !== null
          : true;
      const slot = element.querySelector('.tower-slot');
      if (tower.typeId === 'subtract') slot.textContent = tower.parameter === null ? 'x−[ ]' : `x−${tower.parameter}`;
      else if (tower.typeId === 'definiteIntegralTower') slot.textContent = `∫ ${tower.lowerBound ?? '[ ]'}→${tower.upperBound ?? '[ ]'}`;
      else slot.textContent = '';
      element.classList.toggle('is-configurable', configurable);
      element.classList.toggle('is-filled', configurable && filled);
      element.classList.toggle('is-awaiting-assembly', configurable && state.assemblyValue !== null);
      const interaction = state.assemblyValue !== null && configurable
        ? `點擊裝入常數 ${state.assemblyValue}`
        : tower.active ? '運作中，點擊停火' : '已停火，點擊恢復';
      element.setAttribute('aria-label', `${OPERATORS[tower.typeId].name}，耐久 ${Math.max(0, Math.ceil(tower.hp))}，${interaction}`);
      element.querySelector('.tower-status i').style.width = `${Math.max(0, tower.hp / tower.maxHp) * 100}%`;
    }
  }

  renderEnemies(state) {
    const layer = this.root.querySelector('[data-layer="enemies"]');
    const liveIds = new Set(state.enemies.map((enemy) => enemy.id));
    for (const [id, element] of this.enemyElements) {
      if (!liveIds.has(id)) {
        element.classList.add('is-vanishing');
        window.setTimeout(() => element.remove(), 350);
        this.enemyElements.delete(id);
      }
    }

    for (const enemy of state.enemies) {
      let element = this.enemyElements.get(enemy.id);
      if (!element) {
        element = document.createElement('button');
        element.type = 'button';
        element.className = 'enemy';
        element.dataset.action = 'enemy';
        element.dataset.enemyId = enemy.id;
        element.innerHTML = `
          <span class="enemy-sprite ${escapeHtml(enemy.art ?? '')}" aria-hidden="true"></span>
          <span class="enemy-chip">
            <strong class="enemy-formula"></strong>
            <span class="enemy-meta"><span data-enemy-depth></span><span class="damage-value" data-enemy-damage></span></span>
          </span>
        `;
        layer.append(element);
        this.enemyElements.set(enemy.id, element);
      }

      const type = this.actions.enemyType(enemy.typeId);
      const sprite = element.querySelector('.enemy-sprite');
      sprite.className = `enemy-sprite ${type.art}`;
      const formula = formulaText(enemy.expression);
      element.querySelector('.enemy-formula').textContent = formula;
      element.querySelector('[data-enemy-depth]').textContent = `D × ${derivativeDepth(enemy.expression)}`;
      element.querySelector('[data-enemy-damage]').textContent = `攻擊 ${enemyThreat(enemy)}`;
      element.style.setProperty('--x', `${enemy.position * 100}%`);
      element.style.setProperty('--row', enemy.row);
      element.classList.toggle('is-selected', state.selectedEnemyId === enemy.id);
      element.classList.toggle('is-targetable', Boolean(state.targetingOperator));
      element.classList.toggle('is-divergent', enemy.divergentTimer > 0);
      element.classList.toggle('is-hit', enemy.hitFlash > 0);
      element.setAttribute('aria-label', `${type.name}，${formula}，目前攻擊 ${enemyThreat(enemy)}，點擊查看公式`);
    }
  }

  renderEffects(state) {
    const layer = this.root.querySelector('[data-layer="effects"]');
    const liveIds = new Set(state.effects.map((effect) => effect.id));
    for (const [id, element] of this.effectElements) {
      if (!liveIds.has(id)) {
        element.remove();
        this.effectElements.delete(id);
      }
    }

    for (const effect of state.effects) {
      if (this.effectElements.has(effect.id)) continue;
      const element = document.createElement('span');
      const projectile = effect.type.includes('projectile');
      element.className = projectile ? `projectile ${effect.type}` : `combat-float ${effect.type}`;
      element.style.setProperty('--row', effect.row);
      element.style.setProperty('--x', `${(effect.position ?? 0.5) * 100}%`);
      if (effect.from !== undefined) element.style.setProperty('--from', `${effect.from * 100}%`);
      if (effect.equation) element.dataset.equation = prettyFormula(effect.equation);
      element.textContent = effect.label ?? '';
      layer.append(element);
      this.effectElements.set(effect.id, element);
    }
  }

  renderFormulaPanel(state) {
    const panel = this.bindings.get('formulaPanel');
    const enemy = selectedEnemy(state);
    if (!enemy) {
      panel.hidden = true;
      panel.classList.remove('has-selection');
      panel.innerHTML = '';
      return;
    }

    const next = differentiate(enemy.expression, 'x', 1);
    panel.hidden = false;
    panel.classList.add('has-selection');
    panel.innerHTML = `
      <div class="formula-panel-head">
        <span>公式追蹤</span>
        <button class="icon-button" type="button" data-action="close-formula" aria-label="關閉公式追蹤">${icon('close')}</button>
      </div>
      <div class="formula-row"><span>目前</span><strong>${escapeHtml(formulaText(enemy.expression))}</strong></div>
      <div class="formula-row"><span>下一發 D</span><strong>${escapeHtml(formulaText(next))}</strong></div>
      <div class="formula-row"><span>係數絕對值總和</span><strong class="damage-value">${formatValue(damage(enemy.expression))}</strong></div>
      <div class="formula-row"><span>距離基地</span><strong>${Math.max(0, ((enemy.position - 0.125) * 8.7)).toFixed(1)} 格</strong></div>
    `;
  }

  renderLogs(state) {
    const key = state.logs.map((log) => log.id).join('|');
    if (key === this.lastLogKey) return;
    this.lastLogKey = key;
    this.bindings.get('logs').innerHTML = state.logs.length
      ? state.logs.slice(0, 4).map((log) => `<p class="event-row is-${log.tone}">${escapeHtml(prettyFormula(log.equation))}</p>`).join('')
      : '<p class="event-row">等待第一筆推導⋯</p>';
  }

  renderWorkbench(state) {
    if (this.dragging) return;
    const formulas = formulaQueueDetails(state);
    const constants = constantQueueDetails(state);
    const assembly = currentAssembly(state);
    const formulaTenths = Math.ceil(state.formulaCooldown * 10);
    const constantTenths = Math.ceil(state.constantCooldown * 10);
    const key = [
      formulas.map((card) => `${card.id}:${card.selected}`).join(','),
      constants.map((item) => `${item.id}:${item.selected}`).join(','),
      formulaTenths,
      constantTenths,
      state.assemblyValue,
    ].join('|');
    if (key === this.lastWorkbenchKey) return;
    this.lastWorkbenchKey = key;

    const formulaCards = formulas.map((card, index) => `
      <li>
        <button class="formula-token ${index === 0 ? 'is-top' : ''} ${card.selected ? 'is-picked' : ''}" type="button" data-action="pick-formula" data-item-id="${card.id}" data-drag-kind="formula" data-drag-id="${card.id}" draggable="true" aria-keyshortcuts="Delete" aria-pressed="${card.selected}">
          <span>${index + 1}</span><strong>${escapeHtml(card.label)}</strong><small>→ ${card.value === null ? '—' : formatValue(card.value)}</small>
        </button>
      </li>
    `).join('');
    const constantCards = constants.map((item, index) => `
      <li>
        <button class="constant-token ${index === 0 ? 'is-top' : ''} ${item.selected ? 'is-picked' : ''}" type="button" data-action="pick-constant" data-item-id="${item.id}" data-drag-kind="constant" data-drag-id="${item.id}" draggable="true" aria-keyshortcuts="Delete" aria-pressed="${item.selected}">
          <span>${index + 1}</span><strong><i>k</i> = ${formatValue(item.value)}</strong>
        </button>
      </li>
    `).join('');
    const formulaFull = formulas.length >= FORMULA_QUEUE_CAPACITY;
    const constantFull = constants.length >= CONSTANT_QUEUE_CAPACITY;
    const formulaProgress = formulaFull ? 100 : ((FORMULA_QUEUE_INTERVAL - state.formulaCooldown) / FORMULA_QUEUE_INTERVAL) * 100;
    const constantProgress = constantFull ? 100 : ((CONSTANT_QUEUE_INTERVAL - state.constantCooldown) / CONSTANT_QUEUE_INTERVAL) * 100;
    const combinations = formulas.length * constants.length;

    this.bindings.get('workbench').innerHTML = `
      <div class="workbench-title">
        <h2 id="workbench-heading">公式工坊</h2>
        <span>${formulas.length} × ${constants.length} = ${combinations} 種組合</span>
      </div>
      <div class="queue-columns">
        <section class="constant-queue" aria-label="上帝常數 queue">
          <div class="queue-head"><h3>上帝常數 k</h3><strong>${constants.length} / ${CONSTANT_QUEUE_CAPACITY}</strong></div>
          <ol class="queue-track">${constantCards || '<li class="queue-card is-empty">等待 k⋯</li>'}</ol>
          <div class="queue-cooldown"><span>${constantFull ? '已滿，暫停' : `${state.constantCooldown.toFixed(1)}s`}</span><i><b style="width:${Math.max(0, Math.min(100, constantProgress))}%"></b></i></div>
        </section>
        <section class="formula-queue" aria-label="公式 queue">
          <div class="queue-head"><h3>公式</h3><strong>${formulas.length} / ${FORMULA_QUEUE_CAPACITY}</strong></div>
          <ol class="queue-track">${formulaCards || '<li class="queue-card is-empty">等待公式⋯</li>'}</ol>
          <div class="queue-cooldown"><span>${formulaFull ? '已滿，暫停' : `${state.formulaCooldown.toFixed(1)}s`}</span><i><b style="width:${Math.max(0, Math.min(100, formulaProgress))}%"></b></i></div>
        </section>
      </div>
      <section class="assembly-preview ${assembly ? '' : 'is-empty'} ${state.assemblyValue !== null ? 'has-cartridge' : ''}">
        ${state.assemblyValue !== null ? `
          <span>待安裝常數</span><strong>${formatValue(state.assemblyValue)}</strong><small>點擊 x−[ ] 或定積分塔</small>
        ` : assembly ? `
          <div><span>${escapeHtml(assembly.formula.label)}</span><b class="assembly-arrow">｜k = ${formatValue(assembly.constant.value)} ⇒</b><strong>${formatValue(assembly.value)}</strong></div>
          <button class="primary-button" type="button" data-action="prepare-assembly">組裝此常數</button>
        ` : '<p>兩條 queue 都有材料時即可組合。</p>'}
      </section>
      <div class="trash-dropzone" role="region" aria-label="垃圾桶；把公式、上帝常數或砲台拖到這裡丟棄">
        ${icon('trash')}<span>拖到這裡丟棄</span><small>不退還算力 · 鍵盤可按 Delete</small>
      </div>
    `;
  }

  renderBottomBar(state) {
    this.bindings.get('waveHint').textContent = WAVES[state.waveIndex].hint;
    const button = this.root.querySelector('[data-bind-button="startWave"]');
    const canStart = ['planning', 'intermission'].includes(state.phase) && !state.paused;
    button.hidden = !canStart;
    button.disabled = !canStart;
    this.bindings.get('startWaveLabel').textContent = `開始第 ${state.waveIndex + 1} 波`;
    const banner = this.bindings.get('waveBanner');
    banner.textContent = state.bannerTimer > 0 ? `第 ${state.waveIndex + 1} 波｜${WAVES[state.waveIndex].name}` : '';
    banner.classList.toggle('is-visible', state.bannerTimer > 0);
    const targeting = this.bindings.get('targeting');
    targeting.hidden = !state.targetingOperator;
    if (state.targetingOperator) {
      const label = OPERATORS[state.targetingOperator]?.name ?? '單體算子';
      targeting.innerHTML = `<span>${escapeHtml(label)}：選一隻敵人</span><button type="button" data-action="cancel">取消</button>`;
    }
  }

  renderTutorial(state) {
    const anchor = this.bindings.get('tutorial');
    const key = `${state.tutorialVisible}|${state.phase}`;
    if (key === this.lastTutorialKey) return;
    this.lastTutorialKey = key;
    if (!state.tutorialVisible || state.phase === 'intro') {
      anchor.innerHTML = '';
      return;
    }
    anchor.innerHTML = `
      <article class="tutorial-card">
        <button class="icon-button" type="button" data-action="dismiss-tutorial" aria-label="關閉教學">${icon('close')}</button>
        <strong>先放一座 D 微分砲</strong>
        <p>砲台只攻擊同一路。P−10 對 x⁵ 會讓傷害每發增加 10；點已放砲台可停火。</p>
        <button class="secondary-button" type="button" data-action="dismiss-tutorial">知道了</button>
      </article>
    `;
  }

  renderToast(state) {
    this.bindings.get('toasts').innerHTML = state.toastTimer > 0
      ? `<div class="toast is-${state.toastTone}">${escapeHtml(state.toast)}</div>`
      : '';
  }

  renderOverlay(state) {
    const key = `${state.phase}|${state.paused}|${state.partialConfirmOpen}|${state.baseHp}|${state.kills}|${state.maxChain}`;
    if (key === this.lastOverlayKey) return;
    this.lastOverlayKey = key;
    const host = this.bindings.get('overlay');

    if (state.partialConfirmOpen) {
      const preview = partialPreview(state);
      const rows = preview.length
        ? preview.map((item) => `<li class="${item.dies ? 'will-die' : item.damageAfter > item.damageBefore ? 'will-rise' : ''}"><span>${escapeHtml(prettyFormula(item.before))} → ${escapeHtml(prettyFormula(item.after))}</span><b>${item.dies ? '歸零' : `${formatValue(item.damageBefore)} → ${formatValue(item.damageAfter)}`}</b></li>`).join('')
        : '<li><span>場上沒有敵人</span></li>';
      host.innerHTML = `
        <div class="overlay" role="dialog" aria-modal="true" aria-labelledby="partial-title">
          <article class="modal danger-preview">
            <button class="icon-button modal-close" type="button" data-action="cancel" aria-label="取消">${icon('close')}</button>
            <h2 id="partial-title">施放全場 ∂/∂x？</h2>
            <p>每波只能使用一次。偏微分可能消滅敵人，也可能讓係數同時升高。</p>
            <ul>${rows}</ul>
            <div class="modal-actions"><button class="secondary-button" type="button" data-action="cancel">返回</button><button class="primary-button" type="button" data-action="confirm-partial">花費 Σ400 施放</button></div>
          </article>
        </div>
      `;
      return;
    }

    if (state.phase === 'intro') {
      host.innerHTML = `
        <div class="overlay intro-overlay" role="dialog" aria-modal="true" aria-labelledby="intro-title">
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
              <p><strong>組出你的參數</strong><span>用上帝常數與公式 queue 製作 x−k、積分上下界與連鎖。</span></p>
            </div>
            <button class="primary-button intro-button" type="button" data-action="start">開始演算 ${icon('arrow')}</button>
          </article>
        </div>
      `;
      return;
    }

    if (state.paused) {
      host.innerHTML = `
        <div class="overlay" role="dialog" aria-modal="true"><article class="modal compact-modal"><h2>演算暫停</h2><p>時間、queue 與所有函數都已停止。</p><button class="primary-button" type="button" data-action="pause">繼續演算</button></article></div>
      `;
      return;
    }

    if (state.phase === 'won' || state.phase === 'lost') {
      const won = state.phase === 'won';
      host.innerHTML = `
        <div class="overlay" role="dialog" aria-modal="true"><article class="modal result-modal ${won ? 'is-win' : 'is-loss'}">
          <div class="result-symbol" aria-hidden="true">${won ? '∎' : '≠'}</div>
          <h2>${won ? '證明完成！' : '推導中斷'}</h2>
          <p>${won ? '所有函數都已經化為 0。' : '有函數突破防線，係數耗盡了基地。'}</p>
          <dl><div><dt>基地</dt><dd>${state.baseHp} / ${state.maxBaseHp}</dd></div><div><dt>消去</dt><dd>${state.kills}</dd></div><div><dt>最高連鎖</dt><dd>×${state.maxChain}</dd></div></dl>
          <button class="primary-button" type="button" data-action="restart">${won ? '再證一次' : '重新開始'}</button>
        </article></div>
      `;
      return;
    }

    host.innerHTML = '';
  }
}
