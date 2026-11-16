import React from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import {
  BestStats,
  FACTION_COLORS,
  FactionColorOption,
  MatchDuration,
  POWER_UP_CONFIG,
  PowerUpType,
} from '../game/types';
import { PowerUpIcon } from './PowerUpIcon';

interface TitleOverlayProps {
  selectedColor: FactionColorOption;
  onSelectColor: (c: FactionColorOption) => void;
  duration: MatchDuration;
  onSelectDuration: (d: MatchDuration) => void;
  bestStats: BestStats;
  muted: boolean;
  onToggleMute: () => void;
  onStart: () => void;
}

const POWER_UP_ORDER: PowerUpType[] = ['speed', 'magnet', 'shield', 'surge'];

export const TitleOverlay: React.FC<TitleOverlayProps> = ({
  selectedColor,
  onSelectColor,
  duration,
  onSelectDuration,
  bestStats,
  muted,
  onToggleMute,
  onStart,
}) => {
  return (
    <div className="fixed inset-0 z-20 flex items-center justify-between pointer-events-none">
      {/* Contrast scrim on left keeping right 45%+ open for live 3D city camera pan */}
      <div
        className="absolute inset-0 bg-gradient-to-r from-slate-950/92 via-slate-950/68 to-slate-950/15"
        aria-hidden="true"
      />

      {/* Top-right mute toggle */}
      <div className="absolute top-5 right-5 pointer-events-auto">
        <button
          type="button"
          onClick={onToggleMute}
          aria-label={muted ? 'Unmute audio' : 'Mute audio'}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-950/88 border border-white/15 text-slate-200 hover:text-white hover:bg-slate-900 transition-colors cursor-pointer"
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Left-aligned Title Lockup & Match Controls */}
      <div className="relative z-10 w-full max-w-xl px-6 sm:px-12 py-8 pointer-events-auto">
        {/* Bespoke inline SVG Title Lockup */}
        <div className="mb-5">
          <svg
            viewBox="0 0 420 96"
            className="w-full max-w-[380px] h-auto overflow-visible"
            role="img"
            aria-label="Metro Swarm"
          >
            <defs>
              <linearGradient id="metroTitleGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" />
                <stop offset="100%" stopColor="#CBD5E1" />
              </linearGradient>
            </defs>
            {/* Geometric Running Crowd Emblem */}
            <g transform="translate(4, 16)">
              <rect x="0" y="14" width="14" height="28" rx="7" fill={selectedColor.hex} opacity="0.55" />
              <circle cx="7" cy="6" r="5.5" fill="#F8FAFC" opacity="0.65" />

              <rect x="34" y="14" width="14" height="28" rx="7" fill={selectedColor.hex} opacity="0.55" />
              <circle cx="41" cy="6" r="5.5" fill="#F8FAFC" opacity="0.65" />

              <rect x="15" y="10" width="18" height="36" rx="9" fill={selectedColor.hex} />
              <circle cx="24" cy="1" r="7" fill="#FFFFFF" />
              <polygon points="24,-13 18,-6 30,-6" fill="#FBBF24" />
            </g>

            {/* Wordmark */}
            <text
              x="66"
              y="44"
              fill="url(#metroTitleGrad)"
              fontFamily="Outfit, sans-serif"
              fontWeight="900"
              fontSize="40"
              letterSpacing="-1.2"
            >
              METRO
            </text>
            <text
              x="66"
              y="84"
              fill={selectedColor.hex}
              fontFamily="Outfit, sans-serif"
              fontWeight="900"
              fontSize="42"
              letterSpacing="-1"
            >
              SWARM
            </text>
          </svg>
        </div>

        <p className="text-slate-200 text-base sm:text-lg leading-relaxed max-w-md mb-6">
          Rally wandering citizens across sunlit avenues, grab urban power-ups, and engulf rival packs before the clock hits zero.
        </p>

        {/* Unboxed Best Record Metadata */}
        <div className="flex items-center gap-3 text-xs font-medium text-slate-400 mb-6 font-mono-tabular">
          <span>Best Crowd {bestStats.bestCrowd}</span>
          <span aria-hidden="true">·</span>
          <span>Wins {bestStats.wins}</span>
          <span aria-hidden="true">·</span>
          <span>Matches {bestStats.matchesPlayed}</span>
        </div>

        {/* Team Color & Match Mode Selection */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-5 mb-6">
          <div>
            <div className="text-xs font-semibold text-slate-400 mb-2">
              Team Color
            </div>
            <div className="flex items-center gap-2">
              {FACTION_COLORS.map((c) => {
                const selected = c.id === selectedColor.id;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => onSelectColor(c)}
                    title={c.name}
                    aria-label={`Select ${c.name} team color`}
                    className={`w-9 h-9 rounded-lg transition-transform cursor-pointer flex items-center justify-center ${
                      selected
                        ? 'ring-2 ring-white ring-offset-2 ring-offset-slate-950 scale-105'
                        : 'opacity-80 hover:opacity-100 hover:scale-105'
                    }`}
                    style={{ backgroundColor: c.hex }}
                  />
                );
              })}
            </div>
          </div>

          <div>
            <div className="text-xs font-semibold text-slate-400 mb-2">
              Match Length
            </div>
            <div className="inline-flex items-center p-1 rounded-lg bg-slate-900 border border-white/10">
              <button
                type="button"
                onClick={() => onSelectDuration(120)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  duration === 120
                    ? 'bg-white text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                2:00 Standard
              </button>
              <button
                type="button"
                onClick={() => onSelectDuration(60)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  duration === 60
                    ? 'bg-white text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                1:00 Blitz
              </button>
            </div>
          </div>
        </div>

        {/* Power-Ups Field Guide */}
        <div className="grid grid-cols-2 gap-2.5 max-w-md mb-7">
          {POWER_UP_ORDER.map((type) => {
            const meta = POWER_UP_CONFIG[type];
            return (
              <div
                key={type}
                className="flex items-center gap-2.5 bg-slate-900/90 border border-white/10 rounded-lg px-3 py-2"
              >
                <div
                  className="w-7 h-7 rounded-md flex items-center justify-center shrink-0"
                  style={{
                    backgroundColor: `${meta.color}22`,
                    color: meta.color,
                  }}
                >
                  <PowerUpIcon type={type} className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold text-white truncate">
                    {meta.label}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">
                    {meta.shortDesc}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Primary CTA */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onStart}
            className="px-7 py-3.5 rounded-xl text-base font-bold text-white shadow-lg transition-transform active:scale-95 hover:brightness-110 cursor-pointer whitespace-nowrap"
            style={{ backgroundColor: selectedColor.hex }}
          >
            Start Match
          </button>
        </div>

        {/* Single flat control-hint line */}
        <p className="mt-4 text-xs text-slate-400 font-medium tracking-wide">
          WASD / Mouse Drag Move · Space Sprint · Esc Pause
        </p>
      </div>
    </div>
  );
};
