import React from 'react';
import { GamePhase, MatchResult } from '../game/types';

interface EndModalProps {
  phase: GamePhase;
  result: MatchResult | null;
  playerColorHex: string;
  onResume: () => void;
  onRestart: () => void;
  onReturnTitle: () => void;
}

export const EndModal: React.FC<EndModalProps> = ({
  phase,
  result,
  playerColorHex,
  onResume,
  onRestart,
  onReturnTitle,
}) => {
  if (phase === 'paused') {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/75 p-4">
        <div className="w-full max-w-sm bg-slate-900 border border-white/15 rounded-2xl p-6 shadow-2xl">
          <h2 className="text-2xl font-extrabold text-white tracking-tight">
            Match Paused
          </h2>
          <p className="mt-1.5 text-sm text-slate-300">
            WASD or Mouse Drag to steer · Space to Sprint
          </p>

          <div className="mt-6 flex flex-col gap-2.5">
            <button
              type="button"
              onClick={onResume}
              className="w-full py-3 px-4 rounded-xl text-sm font-bold text-white transition-transform active:scale-95 hover:brightness-110 cursor-pointer"
              style={{ backgroundColor: playerColorHex }}
            >
              Resume Match
            </button>
            <button
              type="button"
              onClick={onRestart}
              className="w-full py-2.5 px-4 rounded-xl text-sm font-semibold text-slate-100 bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Restart Match
            </button>
            <button
              type="button"
              onClick={onReturnTitle}
              className="w-full py-2.5 px-4 rounded-xl text-sm font-medium text-slate-300 hover:text-white hover:bg-slate-800/70 transition-colors cursor-pointer"
            >
              Back to Title
            </button>
          </div>
        </div>
      </div>
    );
  }

  if ((phase === 'victory' || phase === 'gameover') && result) {
    const headline = result.won
      ? result.reason === 'eliminated_all'
        ? 'Total Takeover'
        : 'City Champion'
      : result.reason === 'eliminated'
        ? 'Swarm Absorbed'
        : 'Time Expired';

    const subtitle = result.won
      ? result.reason === 'eliminated_all'
        ? 'Every rival crowd was absorbed into your swarm.'
        : 'You commanded the largest crowd when the clock hit zero.'
      : result.reason === 'eliminated'
        ? 'A larger rival pack overtook your crowd leader.'
        : `Finished #${result.rank} of ${result.totalFactions} crowds in the city.`;

    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-950/78 p-4">
        <div className="w-full max-w-md bg-slate-900 border border-white/15 rounded-2xl p-6 shadow-2xl">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-3xl font-black text-white tracking-tight">
              {headline}
            </h2>
            <span
              className="font-mono-tabular text-sm font-bold px-2.5 py-1 rounded-lg bg-slate-800"
              style={{ color: result.won ? '#34D399' : '#F87171' }}
            >
              Rank #{result.rank}
            </span>
          </div>
          <p className="mt-1.5 text-sm text-slate-300">{subtitle}</p>

          {/* Match Stats Grid */}
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="bg-slate-950/75 border border-white/10 rounded-xl p-3">
              <div className="text-xs text-slate-400">Peak Crowd</div>
              <div className="mt-0.5 font-mono-tabular text-2xl font-bold text-white">
                {result.peakCount}
              </div>
            </div>
            <div className="bg-slate-950/75 border border-white/10 rounded-xl p-3">
              <div className="text-xs text-slate-400">Citizens Converted</div>
              <div className="mt-0.5 font-mono-tabular text-2xl font-bold text-white">
                {result.convertedTotal}
              </div>
            </div>
            <div className="bg-slate-950/75 border border-white/10 rounded-xl p-3">
              <div className="text-xs text-slate-400">Rivals Eliminated</div>
              <div className="mt-0.5 font-mono-tabular text-2xl font-bold text-white">
                {result.absorbedRivals}
              </div>
            </div>
            <div className="bg-slate-950/75 border border-white/10 rounded-xl p-3">
              <div className="text-xs text-slate-400">Power-Ups Used</div>
              <div className="mt-0.5 font-mono-tabular text-2xl font-bold text-white">
                {result.powerUpsCollected}
              </div>
            </div>
          </div>

          {/* Final Standings */}
          <div className="mt-4 bg-slate-950/60 border border-white/10 rounded-xl p-3">
            <div className="text-xs font-semibold text-slate-400 mb-2">
              Final Standings
            </div>
            <div className="flex flex-col gap-1.5">
              {result.leaderboard.slice(0, 4).map((entry, idx) => (
                <div
                  key={entry.id}
                  className={`flex items-center justify-between text-xs ${
                    entry.isPlayer ? 'text-white font-bold' : 'text-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono-tabular text-slate-400 w-3">
                      {idx + 1}
                    </span>
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span>{entry.isPlayer ? 'You' : entry.name}</span>
                  </div>
                  <span className="font-mono-tabular font-bold">
                    {entry.alive ? entry.count : 'Eliminated'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              onClick={onRestart}
              className="flex-1 py-3 px-4 rounded-xl text-sm font-bold text-white transition-transform active:scale-95 hover:brightness-110 cursor-pointer"
              style={{ backgroundColor: playerColorHex }}
            >
              Play Again
            </button>
            <button
              type="button"
              onClick={onReturnTitle}
              className="py-3 px-4 rounded-xl text-sm font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
            >
              Title
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
