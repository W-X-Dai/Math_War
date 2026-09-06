import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('all operator resources use compact wrapping tokens without horizontal scrolling', async () => {
  const [dockCss, responsiveCss] = await Promise.all([
    readFile(new URL('../src/styles/dock.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/responsive.css', import.meta.url), 'utf8'),
  ]);

  assert.match(
    dockCss,
    /\.operator-scroll\s*{[^}]*grid-template-columns:\s*repeat\(auto-fit, minmax\(var\(--operator-token-size\), 1fr\)\)/s,
  );
  assert.match(dockCss, /\.operator-scroll\s*{[^}]*overflow:\s*visible/s);
  assert.doesNotMatch(dockCss, /\.operator-scroll\s*{[^}]*overflow-x:\s*auto/s);
  assert.match(dockCss, /\.operator-card\s*{[^}]*border-radius:\s*50%/s);
  assert.match(dockCss, /\.resource-glyph\s*{/);
  assert.match(responsiveCss, /--operator-token-size:\s*48px/);
});

test('workbench exposes draggable constant discs and scrolls have a separate unlimited library', async () => {
  const [app, workbench, dock, workbenchCss, tokens] = await Promise.all([
    readFile(new URL('../src/App.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/GameWorkbench.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/components/OperatorDock.vue', import.meta.url), 'utf8'),
    readFile(new URL('../src/styles/workbench.css', import.meta.url), 'utf8'),
    readFile(new URL('../src/ui/constant-tokens.js', import.meta.url), 'utf8'),
  ]);

  assert.match(workbench, /class="numeric-keypad"/);
  assert.match(workbench, /inputmode="text"/);
  assert.match(workbench, /DIRECT_CONSTANT_TOKENS/);
  assert.match(workbench, /class="numeric-disc"/);
  assert.match(workbench, /data-drag-kind="numeric-constant"/);
  assert.match(workbench, /draggable="true"/);
  assert.match(workbench, /\\sqrt\{81\}/);
  assert.match(workbench, /store-numeric-constant/);
  assert.match(tokens, /length: 9/);
  assert.match(tokens, /id: 'digit-0'/);
  assert.match(tokens, /id: 'pi'/);
  assert.match(tokens, /id: 'e'/);
  assert.match(workbenchCss, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\)/);
  assert.match(workbenchCss, /\.numeric-keypad \.numeric-disc\s*{[^}]*border-radius:\s*50%/s);
  assert.match(dock, /title: '一般武器工房'/);
  assert.match(dock, /title: '無限捲軸庫'/);
  assert.match(dock, /binding: 'operatorQueue'/);
  assert.match(dock, /binding: 'scrollLibrary'/);
  assert.match(dock, /v-if="item\.operator\.kind === 'tower'" class="operator-key"/);
  assert.match(dock, /class="resource-glyph"/);
  assert.match(dock, /function canDragToBattlefield\(item\)/);
  assert.match(dock, /:data-drag-kind="canDragToBattlefield\(item\) \? 'arsenal'/);
  assert.match(dock, /:draggable="canDragToBattlefield\(item\)"/);
  assert.match(dock, /is-constant-drop-target/);
  assert.match(workbench, /data-drag-kind="stored-constant"/);
  assert.match(workbench, /拖到參數捲軸刻寫/);
  assert.match(app, /actions\.inscribeScroll\(operatorCard\.dataset\.itemId, payload\.id\)/);
  assert.match(app, /actions\.inscribeValue\(operatorCard\.dataset\.itemId, payload\.id\)/);
  assert.match(app, /operator\.kind === 'target'/);
  assert.match(app, /actions\.dropTower\(payload\.id, Number\(cell\.dataset\.row\), Number\(cell\.dataset\.column\)\)/);
  assert.match(app, /actions\.dropTargetOperator\(payload\.id, enemy\.dataset\.enemyId\)/);
  assert.match(dock, /return 'd\/dx'/);
  assert.match(dock, /return 'd²\/dx²'/);
});
