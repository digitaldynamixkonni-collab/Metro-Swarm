import React from 'react';
import { Pause, Volume2, VolumeX } from 'lucide-react';
import { HudSnapshot, MinimapBlock, POWER_UP_CONFIG } from '../game/types';
import { Minimap } from './Minimap';
import { PowerUpIcon } from './PowerUpIcon';

interface GameHudProps {
  hud: HudSnapshot;
  minimapBlocks: MinimapBlock[];
  muted: boolean;
  onToggleMute: () => void;
  onPause: () => void;
}

function formatTime(sec: number): string {
  const s = Math.max(0, Math.ceil(sec));
  const mins = Math.floor(s / 60);
  const rem = s % 60;
  return `${mins}:${rem.toString().padStart(2, '0')}`;
}

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  minimapBlocks,
  muted,
  onToggleMute,
  onPause,
}) => {
  const playerEntry = hud.leaderboard.find((e) => e.isPlayer);
  const playerColor = playerEntry?.color ?? '#2563EB';
  const topFive = hud.leaderboard.slice(0, 5);
  const isLowTime = hud.timeRemaining <= 15;

  return (
    <div className="fixed inset-0 z-10 pointer-events-none overflow-hidden">
      {/* World-projected leader count tags */}
      {hud.badges.map((b) => {
        if (!b.visible) return null;
        const borderClass = b.isPlayer
          ? 'ring-2 ring-white/95'
          : b.threatRelation === 'stronger'
            ? 'ring-1 ring-rose-400/80'
            : 'ring-1 ring-white/50';

        return (
          <div
            key={b.id}
            style={{
              transform: `translate3d(${b.x}px, ${b.y}px, 0) translate(-50%, -100%)`,
            }}
            className="absolute top-0 left-0 will-change-transform"
          >
            <div
              className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-white shadow-md ${borderClass}`}
              style={{
                backgroundColor: b.onScreen ? 'rgba(15, 23, 42, 0.88)' : 'rgba(15, 23, 42, 0.78)',
              }}
            >
              <span
                className="w-2.5 h-2.5 rounded-sm shrink-0"
                style={{ backgroundColor: b.color }}
              />
              <span className="font-mono-tabular text-sm font-bold leading-none">
                {b.count}
              </span>
              {!b.onScreen && (
                <span className="text-[11px] font-semibold text-slate-300 leading-none">
                  {b.name}
                </span>
              )}
              {b.hasShield && (
                <PowerUpIcon type="shield" className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              )}
              {b.hasMagnet && (
                <PowerUpIcon type="magnet" className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              )}
              {b.hasSpeed && (
                <PowerUpIcon type="speed" className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              )}
            </div>
          </div>
        );
      })}

      {/* Top Perimeter HUD Bar */}
      <div className="absolute top-4 left-4 right-4 flex items-start justify-between gap-4">
        {/* Top-Left: Crowd Count, Stamina & Active Power-Ups */}
        <div className="flex flex-col gap-2 min-w-[180px]">
          <div className="bg-slate-950/88 border border-white/12 rounded-xl px-4 py-2.5 shadow-lg">
            <div className="flex items-baseline justify-between gap-4">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-sm shrink-0"
                  style={{ backgroundColor: playerColor }}
                />
                <span className="text-xs font-semibold tracking-wide text-slate-300">
                  Your Crowd
                </span>
              </div>
              <span className="text-xs text-slate-400 font-mono-tabular">
                Peak {hud.peakCount}
              </span>
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono-tabular text-3xl font-bold text-white leading-none">
                {hud.playerCount}
              </span>
              <span className="text-xs text-slate-400">citizens</span>
            </div>

            {/* Sprint Stamina Bar */}
            <div className="mt-2.5 flex items-center gap-2">
              <span className="text-[11px] font-medium text-slate-400 shrink-0">
                Sprint
              </span>
              <div className="h-1.5 flex-1 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width] duration-75"
                  style={{
                    width: `${Math.round(hud.stamina * 100)}%`,
                    backgroundColor: hud.sprinting ? '#38BDF8' : '#E2E8F0',
                  }}
                />
              </div>
            </div>
          </div>

          {/* Active Power-Up Timers */}
          {hud.activePowerUps.length > 0 && (
            <div className="flex flex-col gap-1.5">
              {hud.activePowerUps.map((pu) => {
                const meta = POWER_UP_CONFIG[pu.type];
                const pct = Math.max(0, Math.min(100, (pu.remaining / pu.duration) * 100));
                return (
                  <div
                    key={pu.type}
                    className="bg-slate-950/90 border border-white/12 rounded-lg px-3 py-2 shadow-md"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2" style={{ color: meta.color }}>
                        <PowerUpIcon type={pu.type} className="w-4 h-4 shrink-0" />
                        <span className="text-xs font-semibold text-white whitespace-nowrap">
                          {meta.label}
                        </span>
                      </div>
                      <span className="font-mono-tabular text-xs font-bold text-slate-200">
                        {pu.remaining.toFixed(1)}s
                      </span>
                    </div>
                    <div className="mt-1.5 h-1 w-full rounded-full bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: meta.color,
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Top-Center: Match Clock */}
        <div className="bg-slate-950/88 border border-white/12 rounded-xl px-5 py-2 shadow-lg text-center">
          <div
            className={`font-mono-tabular text-2xl sm:text-3xl font-bold leading-none ${
              isLowTime ? 'text-amber-400' : 'text-white'
            }`}
          >
            {formatTime(hud.timeRemaining)}
          </div>
          <div className="mt-1 text-[11px] font-medium text-slate-300 whitespace-nowrap">
            {hud.isRushHour ? 'Rush Hour · Bonus Spawns' : 'City Showdown'}
          </div>
        </div>

        {/* Top-Right: Live Standings + Audio/Pause Controls */}
        <div className="flex items-start gap-2">
          <div className="hidden sm:block bg-slate-950/88 border border-white/12 rounded-xl px-3.5 py-2.5 shadow-lg min-w-[172px]">
            <div className="text-[11px] font-semibold text-slate-400 mb-1.5">
              Standings
            </div>
            <div className="flex flex-col gap-1">
              {topFive.map((entry, idx) => (
                <div
                  key={entry.id}
                  className={`flex items-center justify-between gap-3 text-xs ${
                    entry.isPlayer ? 'text-white font-bold' : 'text-slate-300 font-medium'
                  } ${!entry.alive ? 'opacity-45 line-through' : ''}`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono-tabular text-[11px] text-slate-400 w-3">
                      {idx + 1}
                    </span>
                    <span
                      className="w-2.5 h-2.5 rounded-sm shrink-0"
                      style={{ backgroundColor: entry.color }}
                    />
                    <span className="truncate max-w-[82px]">
                      {entry.isPlayer ? 'You' : entry.name}
                    </span>
                  </div>
                  <span className="font-mono-tabular text-xs font-bold">
                    {entry.alive ? entry.count : 0}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-1.5 pointer-events-auto">
            <button
              type="button"
              onClick={onToggleMute}
              aria-label={muted ? 'Unmute audio' : 'Mute audio'}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-950/88 border border-white/15 text-slate-200 hover:text-white hover:bg-slate-900 transition-colors cursor-pointer"
            >
              {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onPause}
              aria-label="Pause game"
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-950/88 border border-white/15 text-slate-200 hover:text-white hover:bg-slate-900 transition-colors cursor-pointer"
            >
              <Pause className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Bottom-Center: Transient Event Toasts */}
      {hud.toasts.length > 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5">
          {hud.toasts.map((t) => (
            <div
              key={t.id}
              className="bg-slate-950/92 border border-white/15 rounded-lg px-4 py-1.5 shadow-lg flex items-center gap-2"
            >
              <span
                className="w-2 h-2 rounded-sm shrink-0"
                style={{ backgroundColor: t.color }}
              />
              <span className="text-sm font-semibold text-white whitespace-nowrap">
                {t.text}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Bottom-Right: Real-time City Minimap */}
      <div className="absolute bottom-4 right-4">
        <Minimap
          blocks={minimapBlocks}
          factions={hud.minimapFactions}
          powerUps={hud.minimapPowerUps}
        />
      </div>
    </div>
  );
};
