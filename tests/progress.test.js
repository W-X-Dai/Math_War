import test from 'node:test';
import assert from 'node:assert/strict';

import { CHAPTERS } from '../src/game/content.js';
import {
  PROGRESS_FILE_TYPE,
  PROGRESS_FILE_VERSION,
  PROGRESS_STORAGE_KEY,
  completeLevel,
  createDefaultProgress,
  isEndlessUnlocked,
  isLevelUnlocked,
  loadProgress,
  normalizeProgress,
  parseProgressFile,
  resetProgress,
  saveProgress,
  serializeProgressFile,
} from '../src/game/progress.js';

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
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

test('default progress has the versioned persisted shape', () => {
  assert.equal(PROGRESS_STORAGE_KEY, 'math-zombie.progress.v1');
  assert.deepEqual(createDefaultProgress(), { version: 1, completedLevelIds: [] });
  assert.notEqual(createDefaultProgress().completedLevelIds, createDefaultProgress().completedLevelIds);
});

test('normalization retains only a continuous prefix in chapter order', () => {
  const ids = CHAPTERS.map((chapter) => chapter.id);

  assert.deepEqual(
    normalizeProgress({ version: 1, completedLevelIds: ids.slice(0, 3) }),
    { version: 1, completedLevelIds: ids.slice(0, 3) },
  );
  assert.deepEqual(
    normalizeProgress({ version: 1, completedLevelIds: [ids[0], ids[2], ids[1]] }),
    { version: 1, completedLevelIds: [ids[0]] },
  );
  assert.deepEqual(
    normalizeProgress({ version: 1, completedLevelIds: [ids[0], 'unknown-level', ids[1]] }),
    { version: 1, completedLevelIds: [ids[0]] },
  );
  assert.deepEqual(
    normalizeProgress({ version: 1, completedLevelIds: [ids[1]] }),
    createDefaultProgress(),
  );
  assert.deepEqual(
    normalizeProgress({ version: 1, completedLevelIds: [...ids, 'future-level'] }),
    { version: 1, completedLevelIds: ids },
  );
});

test('normalization rejects unknown versions and malformed payloads', () => {
  assert.deepEqual(normalizeProgress({ version: 2, completedLevelIds: [] }), createDefaultProgress());
  assert.deepEqual(normalizeProgress({ version: 1, completedLevelIds: 'foundation' }), createDefaultProgress());
  assert.deepEqual(normalizeProgress(null), createDefaultProgress());
});

test('progress files round-trip through a versioned JSON envelope', () => {
  const ids = CHAPTERS.map((chapter) => chapter.id);
  const progress = { version: 1, completedLevelIds: ids.slice(0, 3) };

  assert.equal(PROGRESS_FILE_TYPE, 'math-zombie-progress');
  assert.equal(PROGRESS_FILE_VERSION, 1);
  assert.deepEqual(parseProgressFile(serializeProgressFile(progress)), {
    ok: true,
    progress,
  });
});

test('progress file export normalizes progress and uses stable pretty JSON', () => {
  const ids = CHAPTERS.map((chapter) => chapter.id);

  assert.equal(
    serializeProgressFile({
      version: 1,
      completedLevelIds: [ids[0], ids[2], ids[1]],
    }),
    [
      '{',
      '  "fileType": "math-zombie-progress",',
      '  "fileVersion": 1,',
      '  "progress": {',
      '    "version": 1,',
      '    "completedLevelIds": [',
      `      "${ids[0]}"`,
      '    ]',
      '  }',
      '}',
    ].join('\n'),
  );
});

test('progress file import identifies invalid JSON and malformed envelopes', () => {
  assert.deepEqual(parseProgressFile('{not-json'), { ok: false, error: 'invalid-json' });
  assert.deepEqual(parseProgressFile(null), { ok: false, error: 'invalid-format' });
  assert.deepEqual(parseProgressFile(JSON.stringify({
    fileType: 'another-game',
    fileVersion: PROGRESS_FILE_VERSION,
    progress: createDefaultProgress(),
  })), { ok: false, error: 'invalid-format' });
  assert.deepEqual(parseProgressFile(JSON.stringify({
    fileType: PROGRESS_FILE_TYPE,
    fileVersion: PROGRESS_FILE_VERSION,
  })), { ok: false, error: 'invalid-format' });
});

test('progress file import rejects unsupported file versions', () => {
  assert.deepEqual(parseProgressFile(JSON.stringify({
    fileType: PROGRESS_FILE_TYPE,
    fileVersion: PROGRESS_FILE_VERSION + 1,
    progress: createDefaultProgress(),
  })), { ok: false, error: 'unsupported-version' });
});

test('progress file import rejects malformed progress without coercion', () => {
  const malformedProgressValues = [
    null,
    [],
    { version: 2, completedLevelIds: [] },
    { version: 1, completedLevelIds: 'not-an-array' },
  ];

  for (const progress of malformedProgressValues) {
    assert.deepEqual(parseProgressFile(JSON.stringify({
      fileType: PROGRESS_FILE_TYPE,
      fileVersion: PROGRESS_FILE_VERSION,
      progress,
    })), { ok: false, error: 'invalid-progress' });
  }
});

test('progress file import requires an exact continuous chapter prefix', () => {
  const ids = CHAPTERS.map((chapter) => chapter.id);
  const invalidSequences = [
    [ids[1]],
    [ids[0], ids[2], ids[1]],
    [ids[0], 'unknown-level'],
    [...ids, 'future-level'],
    [...ids, ids.at(-1)],
  ];

  for (const completedLevelIds of invalidSequences) {
    assert.deepEqual(parseProgressFile(JSON.stringify({
      fileType: PROGRESS_FILE_TYPE,
      fileVersion: PROGRESS_FILE_VERSION,
      progress: { version: 1, completedLevelIds },
    })), { ok: false, error: 'invalid-progress' });
  }
});

test('load returns normalized stored progress and safely falls back on invalid data', () => {
  const ids = CHAPTERS.map((chapter) => chapter.id);
  const valid = memoryStorage({
    [PROGRESS_STORAGE_KEY]: JSON.stringify({ version: 1, completedLevelIds: ids.slice(0, 2) }),
  });
  assert.deepEqual(loadProgress(valid), { version: 1, completedLevelIds: ids.slice(0, 2) });

  assert.deepEqual(loadProgress(memoryStorage()), createDefaultProgress());
  assert.deepEqual(
    loadProgress(memoryStorage({ [PROGRESS_STORAGE_KEY]: '{not-json' })),
    createDefaultProgress(),
  );
  assert.deepEqual(
    loadProgress(memoryStorage({
      [PROGRESS_STORAGE_KEY]: JSON.stringify({ version: 99, completedLevelIds: ids }),
    })),
    createDefaultProgress(),
  );
  assert.deepEqual(loadProgress({ getItem() { throw new Error('blocked'); } }), createDefaultProgress());
  assert.deepEqual(loadProgress(undefined), createDefaultProgress());
});

test('save writes only normalized progress and reports storage failures', () => {
  const ids = CHAPTERS.map((chapter) => chapter.id);
  const storage = memoryStorage();

  assert.equal(saveProgress(storage, {
    version: 1,
    completedLevelIds: [ids[0], ids[2]],
  }), true);
  assert.deepEqual(JSON.parse(storage.getItem(PROGRESS_STORAGE_KEY)), {
    version: 1,
    completedLevelIds: [ids[0]],
  });

  const inMemoryProgress = completeLevel(createDefaultProgress(), ids[0]);
  assert.equal(saveProgress({ setItem() { throw new Error('quota'); } }, inMemoryProgress), false);
  assert.deepEqual(inMemoryProgress.completedLevelIds, [ids[0]]);
  assert.equal(saveProgress(undefined, createDefaultProgress()), false);
});

test('levels can only be completed sequentially and completion is idempotent', () => {
  const ids = CHAPTERS.map((chapter) => chapter.id);
  const initial = createDefaultProgress();
  const skipped = completeLevel(initial, ids[1]);
  assert.deepEqual(skipped, initial);

  const firstComplete = completeLevel(skipped, ids[0]);
  assert.deepEqual(firstComplete, { version: 1, completedLevelIds: [ids[0]] });
  assert.notEqual(firstComplete, skipped);

  const repeated = completeLevel(firstComplete, ids[0]);
  assert.deepEqual(repeated, firstComplete);
  assert.notEqual(repeated, firstComplete);
  assert.deepEqual(completeLevel(firstComplete, 'unknown-level'), firstComplete);

  const secondComplete = completeLevel(firstComplete, ids[1]);
  assert.deepEqual(secondComplete.completedLevelIds, ids.slice(0, 2));
  assert.deepEqual(initial, createDefaultProgress());
});

test('unlock checks follow completion and reserve endless for all six levels', () => {
  const ids = CHAPTERS.map((chapter) => chapter.id);
  let progress = createDefaultProgress();

  assert.equal(isLevelUnlocked(progress, 0), true);
  assert.equal(isLevelUnlocked(progress, 1), false);
  assert.equal(isLevelUnlocked(progress, -1), false);
  assert.equal(isLevelUnlocked(progress, 1.5), false);
  assert.equal(isLevelUnlocked(progress, CHAPTERS.length), false);
  assert.equal(isEndlessUnlocked(progress), false);

  for (let index = 0; index < ids.length; index += 1) {
    progress = completeLevel(progress, ids[index]);
    if (index + 1 < ids.length) assert.equal(isLevelUnlocked(progress, index + 1), true);
  }
  assert.equal(isEndlessUnlocked(progress), true);
});

test('reset removes only the progress key and tolerates unavailable storage', () => {
  const storage = memoryStorage({
    [PROGRESS_STORAGE_KEY]: JSON.stringify({ version: 1, completedLevelIds: [CHAPTERS[0].id] }),
    unrelated: 'keep-me',
  });

  assert.equal(resetProgress(storage), true);
  assert.equal(storage.getItem(PROGRESS_STORAGE_KEY), null);
  assert.equal(storage.getItem('unrelated'), 'keep-me');

  assert.equal(
    resetProgress({ removeItem() { throw new Error('blocked'); } }),
    false,
  );
  assert.equal(resetProgress(undefined), false);
});
