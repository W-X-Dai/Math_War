import { CHAPTERS } from './content.js';

export const PROGRESS_STORAGE_KEY = 'math-zombie.progress.v1';
export const PROGRESS_FILE_TYPE = 'math-zombie-progress';
export const PROGRESS_FILE_VERSION = 1;

const PROGRESS_VERSION = 1;

export function createDefaultProgress() {
  return {
    version: PROGRESS_VERSION,
    completedLevelIds: [],
  };
}

export function normalizeProgress(value) {
  if (
    value === null
    || typeof value !== 'object'
    || value.version !== PROGRESS_VERSION
    || !Array.isArray(value.completedLevelIds)
  ) {
    return createDefaultProgress();
  }

  const completedLevelIds = [];
  for (const chapter of CHAPTERS) {
    if (value.completedLevelIds[completedLevelIds.length] !== chapter.id) break;
    completedLevelIds.push(chapter.id);
  }

  return {
    version: PROGRESS_VERSION,
    completedLevelIds,
  };
}

function isExactProgress(value) {
  if (
    value === null
    || typeof value !== 'object'
    || value.version !== PROGRESS_VERSION
    || !Array.isArray(value.completedLevelIds)
  ) {
    return false;
  }

  const normalized = normalizeProgress(value);
  return normalized.completedLevelIds.length === value.completedLevelIds.length
    && normalized.completedLevelIds.every((levelId, index) => (
      levelId === value.completedLevelIds[index]
    ));
}

export function serializeProgressFile(progress) {
  return JSON.stringify({
    fileType: PROGRESS_FILE_TYPE,
    fileVersion: PROGRESS_FILE_VERSION,
    progress: normalizeProgress(progress),
  }, null, 2);
}

export function parseProgressFile(serialized) {
  let value;
  try {
    value = JSON.parse(serialized);
  } catch {
    return { ok: false, error: 'invalid-json' };
  }

  if (
    value === null
    || typeof value !== 'object'
    || Array.isArray(value)
    || value.fileType !== PROGRESS_FILE_TYPE
    || !Object.hasOwn(value, 'progress')
  ) {
    return { ok: false, error: 'invalid-format' };
  }
  if (value.fileVersion !== PROGRESS_FILE_VERSION) {
    return { ok: false, error: 'unsupported-version' };
  }
  if (!isExactProgress(value.progress)) {
    return { ok: false, error: 'invalid-progress' };
  }

  return { ok: true, progress: normalizeProgress(value.progress) };
}

function defaultStorage() {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

export function loadProgress(storage = defaultStorage()) {
  try {
    const serialized = storage?.getItem(PROGRESS_STORAGE_KEY);
    if (serialized === null || serialized === undefined) return createDefaultProgress();
    return normalizeProgress(JSON.parse(serialized));
  } catch {
    return createDefaultProgress();
  }
}

export function saveProgress(storage = defaultStorage(), progress) {
  try {
    if (!storage || typeof storage.setItem !== 'function') return false;
    storage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(normalizeProgress(progress)));
    return true;
  } catch {
    return false;
  }
}

export function completeLevel(progress, levelId) {
  const normalized = normalizeProgress(progress);
  const completedCount = normalized.completedLevelIds.length;

  if (normalized.completedLevelIds.includes(levelId)) return normalized;
  if (CHAPTERS[completedCount]?.id !== levelId) return normalized;

  return {
    version: PROGRESS_VERSION,
    completedLevelIds: [...normalized.completedLevelIds, levelId],
  };
}

export function resetProgress(storage = defaultStorage()) {
  try {
    if (!storage || typeof storage.removeItem !== 'function') return false;
    storage.removeItem(PROGRESS_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function isLevelUnlocked(progress, levelIndex) {
  if (!Number.isInteger(levelIndex) || levelIndex < 0 || levelIndex >= CHAPTERS.length) {
    return false;
  }
  return levelIndex <= normalizeProgress(progress).completedLevelIds.length;
}

export function isEndlessUnlocked(progress) {
  return normalizeProgress(progress).completedLevelIds.length === CHAPTERS.length;
}
