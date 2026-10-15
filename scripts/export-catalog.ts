/**
 * 学級ポータル用のカタログを書き出す（npm run catalog）。
 * 出力を learning-app-kit の src/catalog/bunsuu4.ts に置く（kit の CATALOGS への登録も要る）。
 *
 * 項目は練習の5モジュール（MODULE_LEVELS）＋エラーハンター（ERROR_TYPES）。
 * answer_kind は手順の答え方から決める（1つだけ＝その種類、まざる＝steps）。
 * 誤概念は docs/DESIGN.md の「3. 誤概念」の表と同じもの。
 */
import { buildCatalog, renderCatalogModule } from './gen-catalog.lib';
import { MODULE_LEVELS, generate, type Prob } from '../src/lib/problems';
import { ERROR_TYPES } from '../src/lib/errorHunter';
import { MODULES } from '../src/constants';

function kindOf(p: Prob): string {
  const kinds = new Set(p.steps.map((s) => s.ans.kind));
  return kinds.size > 1 ? 'steps' : [...kinds][0]!;
}

const moduleLevels: Record<string, { id: string; label: string; desc: string }[]> = {
  ...Object.fromEntries(Object.entries(MODULE_LEVELS).map(([m, ls]) => [m, ls.map(({ id, label, desc }) => ({ id, label, desc }))])),
  'error-hunter': ERROR_TYPES.map(({ id, label, desc }) => ({ id, label, desc })),
};
const allSkillIds = Object.values(moduleLevels).flat().map((l) => l.id);

const catalog = buildCatalog({
  appId: 'bunsuu4',
  title: '分数（1より大きい分数）',
  subject: '算数',
  grade: 4,
  url: 'https://syo4-bunnsu.vercel.app',
  moduleLevels,
  moduleTitles: Object.fromEntries(MODULES.map((m) => [m.id, m.title.replace(/\s+/g, '')])),
  allSkillIds,
  generate: (id) => ({ answer: { kind: id.startsWith('eh-') ? 'steps' : kindOf(generate(id)) } }),
});

catalog.misconceptions = [
  { code: '誤概念①', label: '分母どうしもたす／ひく（2/5＋4/5＝6/10）', skills: ['add-fig', 'add-basic', 'add-mixed', 'add-carry', 'sub-basic', 'sub-mixed', 'wp-add', 'eh-den'] },
  { code: '誤概念②', label: '分数部分が1をこえてもくり上げない／くり上げた1を落とす', skills: ['add-carry', 'add-one', 'wp-add', 'eh-carry'] },
  { code: '誤概念③', label: 'くり下げずに、大きいほうから小さいほうをひく', skills: ['sub-borrow', 'wp-sub', 'eh-borrow'] },
  { code: '誤概念④', label: '整数－分数で、整数を分数に直さない（3－3/5＝2と3/5）', skills: ['sub-from', 'wp-rem', 'eh-whole'] },
  { code: '誤概念⑤', label: '整数＋帯分数で、整数を分子にたす（3＋1と5/9＝1と8/9）', skills: ['add-whole', 'eh-wadd'] },
  { code: '誤概念⑥', label: '仮分数→帯分数で、商とあまりを入れかえる', skills: ['hen-mixed', 'hen-div', 'eh-tomix'] },
  { code: '誤概念⑦', label: '帯分数→仮分数で、整数と分子をたすだけ（3と2/9＝5/9）', skills: ['hen-imp', 'eh-toimp'] },
  { code: '誤概念⑧', label: '分母が大きいほど大きいと思う（3/6＜3/8）', skills: ['cmp-num', 'wp-prog', 'eh-cmp'] },
  { code: '誤概念⑨', label: '帯分数と仮分数を、見えている数字の大きさだけでくらべる', skills: ['cmp-same', 'cmp-order', 'eh-mixcmp'] },
  { code: '誤概念⑩', label: '等しい分数を「たし算」でつくる（2/3＝5/6）', skills: ['eq-line', 'eq-tap', 'eq-pick', 'eh-eq'] },
  { code: '誤概念⑪', label: '1より大きい分数を表せない（全体の目もりの数を分母にする・真分数でしか考えない）', skills: ['hyo-kind', 'hyo-unit', 'hyo-tape', 'hyo-draw', 'hyo-line'] },
];

process.stdout.write(renderCatalogModule(catalog));
