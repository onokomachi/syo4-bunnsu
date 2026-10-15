import { ModuleId } from './store/progressStore';

/**
 * 「分数ランド4」のモジュール一覧。
 * 小4「分数」（1より大きい分数の表し方・仮分数と帯分数・大きさの等しい分数・大小・分母が同じ分数のたし算とひき算）で
 * 身につける知識・技能を段階的に網羅する。
 * レベル（項目）の一覧は src/lib/problems.ts の MODULE_LEVELS と src/lib/errorHunter.ts の ERROR_TYPES。
 */
export interface ModuleMeta {
  id: ModuleId;
  title: string;
  description: string;
  /** lucide-react のアイコン名（Hub.tsx・LogView.tsx のアイコン表に載せること） */
  icon: string;
  /** Tailwind の色トークン（カードのアクセント） */
  accent: string;
  status: 'ready' | 'soon';
}

export const MODULES: ModuleMeta[] = [
  {
    id: 'hyo',
    title: '1より 大きい 分数',
    description: '真分数・仮分数・帯分数。テープや 水の かさで あらわそう',
    icon: 'Ruler',
    accent: 'sky',
    status: 'ready',
  },
  {
    id: 'hen',
    title: '仮分数と 帯分数',
    description: '3分の5 ＝ 1と3分の2。わり算で なおそう',
    icon: 'Repeat',
    accent: 'indigo',
    status: 'ready',
  },
  {
    id: 'eq',
    title: '大きさの 等しい 分数',
    description: '数直線を ならべて、同じ 大きさを 見つけよう',
    icon: 'Equal',
    accent: 'blue',
    status: 'ready',
  },
  {
    id: 'cmp',
    title: '分数の 大きさくらべ',
    description: '＞ ＜ で くらべよう。大きい じゅんに ならべよう',
    icon: 'Scale',
    accent: 'violet',
    status: 'ready',
  },
  {
    id: 'add',
    title: '分数の たし算',
    description: '分母が 同じなら 分子を たすだけ！ くり上がりも',
    icon: 'Plus',
    accent: 'emerald',
    status: 'ready',
  },
  {
    id: 'sub',
    title: '分数の ひき算',
    description: 'くり下がりも 整数 － 分数 も おまかせ',
    icon: 'Minus',
    accent: 'amber',
    status: 'ready',
  },
  {
    id: 'word-problem',
    title: 'ことばの もんだい',
    description: 'しきを 立てて、分数で 答えよう',
    icon: 'BookOpen',
    accent: 'teal',
    status: 'ready',
  },
  {
    id: 'error-hunter',
    title: 'エラーハンター',
    description: 'まちがいを 見つけて なおそう',
    icon: 'Search',
    accent: 'rose',
    status: 'ready',
  },
];
