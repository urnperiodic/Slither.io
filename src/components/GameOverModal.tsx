import { useEffect, useState } from 'react';
import { RotateCcw, SlidersHorizontal } from 'lucide-react';
import type { DeathStats } from '../shared/types';

interface GameOverModalProps {
  stats: DeathStats;
  onPlayAgain: () => void;
  onBackToLobby: () => void;
}

function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

export function GameOverModal({ stats, onPlayAgain, onBackToLobby }: GameOverModalProps) {
  const [canQuickRestart, setCanQuickRestart] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setCanQuickRestart(true), 550);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!canQuickRestart) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onPlayAgain();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canQuickRestart, onPlayAgain]);

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Game over summary"
    >
      <div className="w-full max-w-sm bg-[#131a22]/95 border border-slate-700/70 rounded-2xl shadow-2xl p-6 text-center text-slate-100">
        <p className="text-xs font-medium text-rose-400 mb-1">
          Defeated by {stats.killedBy}
        </p>
        <h2 className="font-display text-3xl font-bold text-white mb-5">
          Run Finished
        </h2>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="bg-[#0d1218] border border-slate-800/90 rounded-xl p-3">
            <div className="text-xs text-slate-400 mb-0.5">Final Length</div>
            <div className="font-mono tabular-nums text-2xl font-bold text-emerald-400">
              {stats.finalLength}
            </div>
          </div>

          <div className="bg-[#0d1218] border border-slate-800/90 rounded-xl p-3">
            <div className="text-xs text-slate-400 mb-0.5">Peak Rank</div>
            <div className="font-mono tabular-nums text-2xl font-bold text-amber-300">
              #{stats.bestRank}
            </div>
          </div>

          <div className="bg-[#0d1218] border border-slate-800/90 rounded-xl p-3">
            <div className="text-xs text-slate-400 mb-0.5">Eliminations</div>
            <div className="font-mono tabular-nums text-xl font-semibold text-white">
              {stats.kills}
            </div>
          </div>

          <div className="bg-[#0d1218] border border-slate-800/90 rounded-xl p-3">
            <div className="text-xs text-slate-400 mb-0.5">Survived</div>
            <div className="font-mono tabular-nums text-xl font-semibold text-white">
              {formatDuration(stats.timeAliveSec)}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          <button
            type="button"
            onClick={onPlayAgain}
            className="w-full py-3 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-display text-lg font-bold transition-colors flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <RotateCcw className="w-5 h-5" />
            Play Again
          </button>

          <button
            type="button"
            onClick={onBackToLobby}
            className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold transition-colors flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Change Skin or Room
          </button>
        </div>
      </div>
    </div>
  );
}
