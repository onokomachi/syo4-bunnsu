/**
 * 単元モジュールの共通画面（1より大きい分数／仮分数と帯分数／等しい分数／大きさくらべ／たし算／ひき算／ことばの もんだい）。
 * レベルを選ぶか「おまかせモード」（正答率で自動レベルアップ）で、1問ずつ FractionRound を出す。
 */
import React, { useState } from 'react';
import { Wand2 } from 'lucide-react';
import { AppShell } from '../shared/AppShell';
import { AdaptiveBar } from '../shared/AdaptiveBar';
import { LevelCard, SetupScreen } from '../ui/primitives';
import { FractionRound } from './FractionRound';
import { MODULE_LEVELS, type UnitModuleId } from '../../lib/problems';
import { MODULES } from '../../constants';
import { useProgressStore } from '../../store/progressStore';
import { useAdaptive } from '../../lib/useAdaptive';

interface Props { moduleId: UnitModuleId; onExit: () => void; }

const BORDER: Record<string, string> = {
  blue: 'hover:border-blue-400', violet: 'hover:border-violet-400', emerald: 'hover:border-emerald-400', sky: 'hover:border-sky-400', indigo: 'hover:border-indigo-400',
  amber: 'hover:border-amber-400', teal: 'hover:border-teal-400', rose: 'hover:border-rose-400',
};

export const UnitModule: React.FC<Props> = ({ moduleId, onExit }) => {
  const meta = MODULES.find((m) => m.id === moduleId)!;
  const levels = MODULE_LEVELS[moduleId];
  const ids = levels.map((l) => l.id);
  const [mode, setMode] = useState<'setup' | 'level' | 'auto'>('setup');
  const [level, setLevel] = useState(ids[0]!);
  const [round, setRound] = useState(0);
  const getMasteryStreak = useProgressStore((s) => s.getMasteryStreak);
  const getTodaySkillCount = useProgressStore((s) => s.getTodaySkillCount);
  const adaptive = useAdaptive<string>(ids);

  if (mode === 'setup') {
    return (
      <SetupScreen title={meta.title} subtitle={meta.description} onBack={onExit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {levels.map((l) => (
            <LevelCard
              key={l.id}
              label={l.label}
              desc={l.desc}
              mastery={getMasteryStreak(l.id)}
              todayCount={getTodaySkillCount(l.id)}
              accentBorder={BORDER[meta.accent] ?? BORDER.blue}
              onClick={() => { setLevel(l.id); setRound((r) => r + 1); setMode('level'); }}
            />
          ))}
        </div>
        <button
          onClick={() => { setRound((r) => r + 1); setMode('auto'); }}
          className="w-full p-5 rounded-3xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-black text-lg shadow-lg hover:shadow-xl transition-all active:scale-[0.99] flex items-center justify-center gap-2"
        >
          <Wand2 size={22} /> おまかせモード（じどうで レベルアップ）
        </button>
      </SetupScreen>
    );
  }

  const activeLevel = mode === 'auto' ? adaptive.level : level;

  return (
    <AppShell title={meta.title} subtitle={levels.find((l) => l.id === activeLevel)?.label} onBack={() => setMode('setup')}>
      <div className="flex flex-col h-full">
        {mode === 'auto' && (
          <AdaptiveBar index={adaptive.index} total={adaptive.total} leveledUp={adaptive.leveledUp} onClearLevelUp={adaptive.clearLevelUp} />
        )}
        <div className="flex-1 min-h-0">
          <FractionRound
            key={`${activeLevel}-${round}`}
            skillId={activeLevel}
            onNext={() => setRound((r) => r + 1)}
            onResult={mode === 'auto' ? adaptive.onResult : undefined}
          />
        </div>
      </div>
    </AppShell>
  );
};
