import React from 'react';
import {
  MinimapBlock,
  MinimapFactionBlip,
  MinimapPowerUpBlip,
} from '../game/types';

interface MinimapProps {
  blocks: MinimapBlock[];
  factions: MinimapFactionBlip[];
  powerUps: MinimapPowerUpBlip[];
}

export const Minimap: React.FC<MinimapProps> = ({
  blocks,
  factions,
  powerUps,
}) => {
  const player = factions.find((f) => f.isPlayer);
  const rivals = factions.filter((f) => !f.isPlayer);
  const nearbyCount = rivals.filter((r) => r.isNearby).length;

  const playerHeadingDeg = player
    ? (-player.yaw * 180) / Math.PI + 180
    : 0;

  return (
    <div className="bg-slate-950/90 border border-white/15 rounded-xl p-2 shadow-lg w-[136px] sm:w-[164px]">
      <div className="flex items-center justify-between gap-2 px-0.5 pb-1.5">
        <span className="text-[11px] font-semibold text-slate-300 leading-none">
          City Map
        </span>
        <span
          className={`font-mono-tabular text-[11px] font-bold leading-none ${
            nearbyCount > 0 ? 'text-amber-400' : 'text-slate-400'
          }`}
        >
          {nearbyCount > 0 ? `${nearbyCount} Nearby` : 'Clear'}
        </span>
      </div>

      <div className="relative w-full aspect-square rounded-lg bg-slate-900 border border-white/10 overflow-hidden">
        <svg
          viewBox="0 0 100 100"
          className="w-full h-full block"
          role="img"
          aria-label="City minimap showing player position and rival crowds"
        >
          {/* Subtle avenue grid */}
          <g stroke="rgba(148, 163, 184, 0.14)" strokeWidth="0.6">
            <line x1="27.7" y1="0" x2="27.7" y2="100" />
            <line x1="50" y1="0" x2="50" y2="100" />
            <line x1="72.3" y1="0" x2="72.3" y2="100" />
            <line x1="0" y1="27.7" x2="100" y2="27.7" />
            <line x1="0" y1="50" x2="100" y2="50" />
            <line x1="0" y1="72.3" x2="100" y2="72.3" />
          </g>

          {/* City Building Footprints & Civic Fountain */}
          {blocks.map((b, idx) =>
            b.isFountain ? (
              <circle
                key={idx}
                cx={(b.x + b.w / 2) * 100}
                cy={(b.y + b.h / 2) * 100}
                r={(b.w * 100) / 2}
                fill="#38BDF8"
                fillOpacity="0.38"
                stroke="#7DD3FC"
                strokeOpacity="0.5"
                strokeWidth="0.6"
              />
            ) : (
              <rect
                key={idx}
                x={b.x * 100}
                y={b.y * 100}
                width={b.w * 100}
                height={b.h * 100}
                rx="0.9"
                fill="#334155"
                stroke="#475569"
                strokeWidth="0.4"
              />
            ),
          )}

          {/* Player Proximity Radar Ring (~42m radius) */}
          {player && (
            <circle
              cx={player.x * 100}
              cy={player.y * 100}
              r={28.4}
              fill={player.color}
              fillOpacity="0.06"
              stroke="rgba(248, 250, 252, 0.24)"
              strokeWidth="0.7"
              strokeDasharray="2.5 2"
            />
          )}

          {/* Active Power-Up Beacons */}
          {powerUps.map((pu) => {
            const cx = pu.x * 100;
            const cy = pu.y * 100;
            return (
              <rect
                key={pu.id}
                x={cx - 1.5}
                y={cy - 1.5}
                width="3"
                height="3"
                transform={`rotate(45 ${cx} ${cy})`}
                fill={pu.color}
                stroke="#0F172A"
                strokeWidth="0.5"
              />
            );
          })}

          {/* Rival Crowd Packs */}
          {rivals.map((r) => {
            const cx = r.x * 100;
            const cy = r.y * 100;
            const radius = Math.min(5.8, 2.7 + Math.sqrt(Math.max(1, r.count)) * 0.35);
            const showThreatRing = r.threatRelation === 'stronger';
            const labelY = cy < 15 ? cy + radius + 5.8 : cy - radius - 2.2;

            return (
              <g key={r.id} opacity={r.isNearby ? 1 : 0.82}>
                {showThreatRing && (
                  <circle
                    cx={cx}
                    cy={cy}
                    r={radius + 1.8}
                    fill="none"
                    stroke="#FB7185"
                    strokeWidth="0.9"
                  />
                )}
                <circle
                  cx={cx}
                  cy={cy}
                  r={radius}
                  fill={r.color}
                  stroke={r.isNearby ? '#FFFFFF' : '#0F172A'}
                  strokeWidth={r.isNearby ? '1.0' : '0.7'}
                />
                {(r.isNearby || showThreatRing) && (
                  <text
                    x={cx}
                    y={labelY}
                    textAnchor="middle"
                    fill="#F8FAFC"
                    fontSize="5.4"
                    fontWeight="700"
                    fontFamily="JetBrains Mono, monospace"
                    stroke="#0F172A"
                    strokeWidth="1.6"
                    paintOrder="stroke"
                  >
                    {r.count}
                  </text>
                )}
              </g>
            );
          })}

          {/* Player Crowd Directional Chevron */}
          {player && (
            <g
              transform={`translate(${player.x * 100}, ${player.y * 100}) rotate(${playerHeadingDeg})`}
            >
              <circle r="5.6" fill={player.color} fillOpacity="0.22" />
              <polygon
                points="0,-5.4 4.1,4.2 0,2.2 -4.1,4.2"
                fill={player.color}
                stroke="#FFFFFF"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </g>
          )}
        </svg>
      </div>
    </div>
  );
};
