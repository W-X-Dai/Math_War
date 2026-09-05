import test from 'node:test';
import assert from 'node:assert/strict';

import { createSeededRng } from '../src/game/level-generator.js';
import {
  encounterPackSizes,
  finiteEncounterSchedule,
  finiteLaneRoles,
} from '../src/game/encounters.js';

test('finite counts are partitioned into complete two- or three-enemy packs', () => {
  for (let count = 6; count <= 16; count += 1) {
    const sizes = encounterPackSizes(count);
    assert.equal(sizes.reduce((total, size) => total + size, 0), count);
    assert.ok(sizes.every((size) => size === 2 || size === 3));
  }
  assert.throws(() => encounterPackSizes(1), RangeError);
});

test('pressure scheduling uses same-lane packs with 0.85 second gaps and five second regroups', () => {
  const events = finiteEncounterSchedule(createSeededRng(9, 'pressure'), 11, 5, 'pressure');
  const groups = new Map();
  for (const event of events) {
    if (!groups.has(event.packIndex)) groups.set(event.packIndex, []);
    groups.get(event.packIndex).push(event);
  }
  for (const [group, pack] of groups) {
    assert.ok(pack.length === 2 || pack.length === 3);
    assert.equal(new Set(pack.map((event) => event.row)).size, 1);
    assert.deepEqual(pack.map((event) => event.spawnAt), pack.map((_, index) => group * 5 + index * 0.85));
  }
});

test('mixed scheduling coordinates two lane packs without changing their lane role', () => {
  const rng = createSeededRng(12, 'mixed');
  const events = finiteEncounterSchedule(rng, 14, 6, 'mixed');
  const simultaneous = events.some((event, index) => (
    index > 0
      && event.spawnAt === events[index - 1].spawnAt
      && event.row !== events[index - 1].row
  ));
  assert.equal(simultaneous, true);

  const roles = finiteLaneRoles(
    createSeededRng(12, 'roles'), 5, 'mixed', events.map((event) => event.row),
  );
  assert.equal(new Set(roles.map((role) => role.row)).size, roles.length);
  for (const event of events) assert.ok(roles.some((role) => role.row === event.row));
});

test('lane plans are deterministic and reject invalid segment kinds', () => {
  const make = () => finiteLaneRoles(createSeededRng(44, 'roles'), 4, 'mixed', [0, 1, 2, 3, 4, 5]);
  assert.deepEqual(make(), make());
  assert.throws(
    () => finiteEncounterSchedule(createSeededRng(1), 8, 4, 'recognition'),
    RangeError,
  );
});
