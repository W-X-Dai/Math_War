import { cloneExpression } from '../domain/expression.js';
import { CHAPTER_TUTORIALS, ENEMY_GUIDES } from '../config/tutorial.js';

export { CHAPTER_TUTORIALS, ENEMY_GUIDES };

export function chapterTutorial(chapterIndex) {
  const config = CHAPTER_TUTORIALS[chapterIndex];
  if (!config) throw new RangeError(`chapterIndex must be between 0 and ${CHAPTER_TUTORIALS.length - 1}`);
  return config;
}

export function generateTutorialWave(chapterIndex) {
  const config = chapterTutorial(chapterIndex);
  const entries = config.entries.map((fixture, index) => {
    const guide = ENEMY_GUIDES[fixture.family];
    const expression = fixture.createExpression();
    return {
      id: `tutorial-${chapterIndex}-${index}`,
      spawnAt: fixture.spawnAt,
      row: fixture.row,
      typeId: `tutorial-${fixture.family}`,
      name: guide?.name ?? '教學函數',
      art: guide?.art ?? 'enemy-art-polynomial',
      family: fixture.family,
      expression: cloneExpression(expression),
      speed: fixture.speed,
      reward: fixture.reward,
      affixes: [...fixture.affixes],
      splitExpressions: (fixture.splitExpressionFactories ?? []).map((factory) => cloneExpression(factory())),
    };
  });
  const families = [...new Set(entries.map((enemy) => enemy.family))];
  const lanes = [...new Set(entries.map((enemy) => enemy.row))].sort((a, b) => a - b).map((row) => {
    const laneEntries = entries.filter((enemy) => enemy.row === row);
    return {
      row,
      families: [...new Set(laneEntries.map((enemy) => enemy.family))],
      possibleAffixes: [...new Set(laneEntries.flatMap((enemy) => enemy.affixes))],
    };
  });
  return {
    id: `tutorial-${config.id}`,
    kind: 'tutorial',
    name: `第 ${chapterIndex + 1} 章・教學波`,
    hint: config.objective,
    objective: config.objective,
    theme: '固定演練',
    chapterIndex,
    segmentIndex: 0,
    segmentKind: 'recognition',
    endlessRound: 0,
    awardsEarlyStart: false,
    deploymentGoals: config.deploymentGoals.map((goal) => ({ ...goal })),
    entries,
    requiredTags: families,
    summary: {
      total: entries.length,
      families: families.map((id) => ({
        id,
        label: ENEMY_GUIDES[id]?.label ?? id,
        count: entries.filter((enemy) => enemy.family === id).length,
      })),
      mutationCount: entries.reduce((total, enemy) => total + enemy.affixes.length, 0),
      danger: '教學',
      lanes,
    },
  };
}
