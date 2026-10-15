/**
 * 実力の階段（STEP TO 算数MASTER）の段と、本番テストとの対応。
 *
 * 紙のテスト（docs/DESIGN.md §5）に合わせて、段を手で書いた。
 * 段は「前の段ができないと、その段は解けない」順に並べる。止まった段が、その子がいま取り組むべきところ。
 *   1 表し方 → 2 仮分数と帯分数 → 3 等しい分数・大小 → 4 たし算（くり上がりなし） → 5 ひき算（くり下がりなし）
 *   → 6 くり上がり・くり下がり・整数－分数 → 7 文章題・ならべかえ
 * 各設問は「その項目の段まで登れていれば取れる」として予想点を出す（reqs）。
 * 極限は本番テストの範囲（floors）。無限は単元のすべての項目（ENDLESS_FLOORS）。
 */
import { withExtraSkills, type TrialFloorDef, type TestItemReq } from 'learning-app-kit/trial';
import { TEST_STEPS, type TestProblem } from './testConfig';

const FLOORS: TrialFloorDef[] = [
  { label: '1より大きい分数の表し方', skills: ['hyo-tape'] },
  { label: '仮分数と帯分数・整数', skills: ['hen-mixed', 'hen-imp'] },
  { label: '等しい分数・大きさくらべ', skills: ['eq-line', 'cmp-same', 'cmp-num'] },
  { label: 'たし算（くり上がりなし）', skills: ['add-basic', 'add-mixed', 'add-whole'] },
  { label: 'ひき算（くり下がりなし）', skills: ['sub-basic', 'sub-mixed', 'sub-whole'] },
  { label: 'くり上がり・くり下がり', skills: ['add-carry', 'add-one', 'sub-borrow', 'sub-from'] },
  { label: '文章題・大きい順', skills: ['wp-add', 'wp-sub', 'cmp-order'] },
];

const floorOf = (skillId: string): number => {
  const i = FLOORS.findIndex((f) => f.skills.includes(skillId));
  return i < 0 ? FLOORS.length : i + 1;
};

const REQS: TestItemReq[] = TEST_STEPS.filter((s) => s.points > 0).map((s) => ({ points: s.points, floor: floorOf(s.skillId) }));

export const TRIAL = { floors: FLOORS, reqs: REQS, max: REQS.reduce((a, r) => a + r.points, 0) };
export const FLOOR_COUNT = TRIAL.floors.length;

/** その項目の本番テストの設問を1つ選んで作る（同じ項目の設問が複数あれば、ばらばらに出す） */
export function trialProblem(skillId: string): TestProblem {
  const pool = TEST_STEPS.filter((s) => s.skillId === skillId);
  const step = pool[Math.floor(Math.random() * pool.length)] ?? TEST_STEPS[0]!;
  return step.gen();
}

/**
 * 本番テストに出ない項目。極限には出さず（テスト予想を正直に保つ）、無限でだけ出す。
 * scripts/verify-problems.ts が「全項目 − 本番テストの項目」と一致することを確かめる。
 */
export const EXTRA_SKILLS: readonly string[] = [
  'hyo-kind', 'hyo-unit', 'hyo-draw', 'hyo-line',
  'hen-div',
  'eq-tap', 'eq-pick',
  'add-fig',
  'wp-rem', 'wp-prog',
  'eh-judge', 'eh-den', 'eh-carry', 'eh-borrow', 'eh-whole', 'eh-wadd', 'eh-tomix', 'eh-toimp', 'eh-cmp', 'eh-mixcmp', 'eh-eq',
];

/** 無限で出す段（テスト外の項目を、同じモジュールの段に混ぜたもの） */
export const ENDLESS_FLOORS = withExtraSkills(TRIAL.floors, EXTRA_SKILLS);
