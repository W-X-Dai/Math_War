import { GENERATION_CONFIG } from '../config/generation.js';

const SPAWN = GENERATION_CONFIG.spawn;

const integer = (rng, minimum, maximum) => minimum + Math.floor(rng() * (maximum - minimum + 1));

function shuffle(rng, values) {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swapIndex = integer(rng, 0, index);
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }
  return result;
}

/** Split a wave into complete two- or three-enemy tactical packs. */
export function encounterPackSizes(count) {
  if (!Number.isInteger(count) || count < SPAWN.packSize.minimum) {
    throw new RangeError(`count must be an integer of at least ${SPAWN.packSize.minimum}`);
  }
  const sizes = Array.from({ length: Math.floor(count / 2) }, () => 2);
  if (count % 2 === 1) sizes[0] = 3;
  return sizes;
}

/**
 * Schedule finite enemies as readable packs. Pressure segments regroup after
 * every pack; mixed segments launch two lane-packs at the same time.
 */
export function finiteEncounterSchedule(rng, count, rowCount, segmentKind) {
  if (!['pressure', 'mixed'].includes(segmentKind)) {
    throw new RangeError('segmentKind must be pressure or mixed');
  }
  const sizes = encounterPackSizes(count);
  const laneOrder = shuffle(rng, Array.from({ length: rowCount }, (_, row) => row));
  const packs = sizes.map((size, index) => ({
    size,
    row: laneOrder[index % laneOrder.length],
    group: segmentKind === 'mixed' ? Math.floor(index / 2) : index,
  }));
  const events = [];
  for (const pack of packs) {
    const base = pack.group * SPAWN.regroupSeconds;
    for (let member = 0; member < pack.size; member += 1) {
      events.push({
        row: pack.row,
        spawnAt: base + member * SPAWN.packGapSeconds,
        packIndex: pack.group,
        packMember: member,
      });
    }
  }
  return events.sort((left, right) => (
    left.spawnAt - right.spawnAt || left.packIndex - right.packIndex || left.row - right.row
  ));
}

/** Assign one immutable counter role to every active lane in a segment. */
export function finiteLaneRoles(rng, chapterIndex, segmentKind, activeRows) {
  const chapterRoles = GENERATION_CONFIG.finite.roles[chapterIndex];
  const templates = chapterRoles?.[segmentKind];
  if (!templates) throw new RangeError(`missing ${segmentKind} roles for chapter ${chapterIndex}`);
  const offset = integer(rng, 0, templates.length - 1);
  const direction = rng() < 0.5 ? 1 : -1;
  return [...new Set(activeRows)].sort((left, right) => left - right).map((row) => {
    const templateIndex = (offset + direction * row + templates.length * 2) % templates.length;
    return { row, ...templates[templateIndex] };
  });
}

// Compatibility helpers for tests and callers that previously inspected the
// hard-coded late-game specialist mapping.
export function specialistRole(row, chapterIndex, segmentIndex = 2) {
  const kind = segmentIndex === 1 ? 'pressure' : 'mixed';
  const templates = GENERATION_CONFIG.finite.roles[chapterIndex]?.[kind];
  return templates ? templates[row % templates.length] : null;
}

export function encounterRows(rows) {
  return [...rows];
}

export function encounterGap(_chapterIndex, rows, index, fallback) {
  return rows[index] === rows[index + 1] ? SPAWN.packGapSeconds : fallback;
}
