import test from 'node:test';
import assert from 'node:assert/strict';

import { reactive } from 'vue';

import { useLevelCampaign } from '../src/composables/useLevelCampaign.js';
import { CHAPTERS } from '../src/game/content.js';
import {
  PROGRESS_STORAGE_KEY,
  createDefaultProgress,
  serializeProgressFile,
} from '../src/game/progress.js';

function memoryStorage() {
  const values = new Map();
  return {
    values,
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

function progressFile(contents, size = contents.length) {
  return {
    size,
    async text() {
      return contents;
    },
  };
}

function createCampaign(storage) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });
  return useLevelCampaign({
    game: reactive({ phase: 'intro' }),
    replaceGame() {},
    resetClock() {},
  });
}

test('importing a progress file updates reactive state, selection, and local storage', async (t) => {
  t.after(() => { delete globalThis.localStorage; });
  const storage = memoryStorage();
  const campaign = createCampaign(storage);
  const importedProgress = {
    version: 1,
    completedLevelIds: CHAPTERS.slice(0, 2).map((chapter) => chapter.id),
  };

  assert.equal(
    await campaign.importProgressFile(progressFile(serializeProgressFile(importedProgress))),
    true,
  );
  assert.deepEqual({ ...campaign.progress }, importedProgress);
  assert.equal(campaign.selectedLevelIndex.value, 2);
  assert.deepEqual(JSON.parse(storage.getItem(PROGRESS_STORAGE_KEY)), importedProgress);
  assert.equal(campaign.levelSelectNotice.value, `已載入 2 / ${CHAPTERS.length} 關通關進度。`);
});

test('download metadata uses the player local date and current normalized progress', (t) => {
  t.after(() => { delete globalThis.localStorage; });
  const storage = memoryStorage();
  const campaign = createCampaign(storage);
  const { filename, contents } = campaign.prepareProgressDownload(new Date(2026, 8, 6));

  assert.equal(filename, 'math-zombie-progress-2026-09-06.json');
  assert.deepEqual(JSON.parse(contents).progress, createDefaultProgress());
  assert.equal(campaign.levelSelectNotice.value, '進度 JSON 已下載。');
});

test('a fully completed progress file selects endless mode', async (t) => {
  t.after(() => { delete globalThis.localStorage; });
  const campaign = createCampaign(memoryStorage());
  const importedProgress = {
    version: 1,
    completedLevelIds: CHAPTERS.map((chapter) => chapter.id),
  };

  assert.equal(
    await campaign.importProgressFile(progressFile(serializeProgressFile(importedProgress))),
    true,
  );
  assert.equal(campaign.selectedLevelIndex.value, null);
});

test('invalid and oversized files never replace existing progress', async (t) => {
  t.after(() => { delete globalThis.localStorage; });
  const storage = memoryStorage();
  const campaign = createCampaign(storage);
  const initialProgress = createDefaultProgress();

  assert.equal(await campaign.importProgressFile(progressFile('{broken')), false);
  assert.deepEqual({ ...campaign.progress }, initialProgress);
  assert.equal(storage.getItem(PROGRESS_STORAGE_KEY), null);
  assert.match(campaign.levelSelectNotice.value, /不是有效的 JSON/);

  assert.equal(await campaign.importProgressFile(progressFile('{}', (64 * 1024) + 1)), false);
  assert.deepEqual({ ...campaign.progress }, initialProgress);
  assert.equal(storage.getItem(PROGRESS_STORAGE_KEY), null);
  assert.match(campaign.levelSelectNotice.value, /超過 64 KB/);
});

test('a storage failure keeps imported progress for the current session', async (t) => {
  t.after(() => { delete globalThis.localStorage; });
  const campaign = createCampaign({
    getItem() {
      return null;
    },
    setItem() {
      throw new Error('blocked');
    },
  });
  const importedProgress = {
    version: 1,
    completedLevelIds: [CHAPTERS[0].id],
  };

  assert.equal(
    await campaign.importProgressFile(progressFile(serializeProgressFile(importedProgress))),
    true,
  );
  assert.deepEqual({ ...campaign.progress }, importedProgress);
  assert.match(campaign.levelSelectNotice.value, /瀏覽器無法保存/);
});
