export type GamePhase = 'title' | 'playing' | 'paused' | 'victory' | 'gameover';

export type MatchDuration = 60 | 120;

export type PowerUpType = 'speed' | 'magnet' | 'shield' | 'surge';

export interface PowerUpMeta {
  type: PowerUpType;
  label: string;
  shortDesc: string;
  color: string;
  hex: number;
  duration: number; // 0 for instant
}

export const POWER_UP_CONFIG: Record<PowerUpType, PowerUpMeta> = {
  speed: {
    type: 'speed',
    label: 'Speed Boost',
    shortDesc: '+55% Speed · Infinite Sprint',
    color: '#06B6D4',
    hex: 0x06b6d4,
    duration: 8,
  },
  magnet: {
    type: 'magnet',
    label: 'Crowd Magnet',
    shortDesc: 'Pulls nearby stragglers',
    color: '#8B5CF6',
    hex: 0x8b5cf6,
    duration: 10,
  },
  shield: {
    type: 'shield',
    label: 'Shield Dome',
    shortDesc: 'Blocks rival absorption',
    color: '#10B981',
    hex: 0x10b981,
    duration: 8,
  },
  surge: {
    type: 'surge',
    label: 'Crowd Surge',
    shortDesc: '+6 Instant Recruits',
    color: '#F59E0B',
    hex: 0xf59e0b,
    duration: 0,
  },
};

export interface FactionColorOption {
  id: string;
  name: string;
  hex: string;
  num: number;
  accentNum: number;
}

export const FACTION_COLORS: FactionColorOption[] = [
  { id: 'cobalt', name: 'Cobalt', hex: '#2563EB', num: 0x2563eb, accentNum: 0x60a5fa },
  { id: 'crimson', name: 'Crimson', hex: '#EF4444', num: 0xef4444, accentNum: 0xfca5a5 },
  { id: 'amber', name: 'Amber', hex: '#F59E0B', num: 0xf59e0b, accentNum: 0xfde68a },
  { id: 'emerald', name: 'Emerald', hex: '#10B981', num: 0x10b981, accentNum: 0x6ee7b7 },
  { id: 'violet', name: 'Violet', hex: '#8B5CF6', num: 0x8b5cf6, accentNum: 0xc4b5fd },
  { id: 'teal', name: 'Cyan', hex: '#06B6D4', num: 0x06b6d4, accentNum: 0x67e8f9 },
];

export const RIVAL_NAMES = [
  'Redline',
  'Apex',
  'MetroV',
  'Vanguard',
  'Skyline',
  'Pulse',
  'Beacon',
];

export interface ActivePowerUp {
  type: PowerUpType;
  remaining: number;
  duration: number;
}

export interface LeaderboardEntry {
  id: number;
  name: string;
  color: string;
  count: number;
  isPlayer: boolean;
  alive: boolean;
}

export interface ScreenBadge {
  id: number;
  name: string;
  color: string;
  count: number;
  isPlayer: boolean;
  x: number;
  y: number;
  visible: boolean;
  onScreen: boolean;
  hasShield: boolean;
  hasMagnet: boolean;
  hasSpeed: boolean;
  threatRelation: 'player' | 'weaker' | 'even' | 'stronger';
}

export interface GameEventToast {
  id: number;
  text: string;
  color: string;
  kind: 'elimination' | 'powerup' | 'rush' | 'streak';
}

export interface MinimapBlock {
  x: number; // normalized 0..1 left
  y: number; // normalized 0..1 top
  w: number; // normalized width
  h: number; // normalized height
  isFountain?: boolean;
}

export interface MinimapFactionBlip {
  id: number;
  name: string;
  color: string;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  yaw: number;
  count: number;
  isPlayer: boolean;
  threatRelation: 'player' | 'weaker' | 'even' | 'stronger';
  isNearby: boolean;
}

export interface MinimapPowerUpBlip {
  id: number;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  color: string;
  type: PowerUpType;
}

export interface HudSnapshot {
  timeRemaining: number;
  isRushHour: boolean;
  playerCount: number;
  peakCount: number;
  stamina: number; // 0..1
  sprinting: boolean;
  activePowerUps: ActivePowerUp[];
  leaderboard: LeaderboardEntry[];
  badges: ScreenBadge[];
  toasts: GameEventToast[];
  powerUpsOnMap: number;
  minimapFactions: MinimapFactionBlip[];
  minimapPowerUps: MinimapPowerUpBlip[];
}

export interface MatchResult {
  won: boolean;
  reason: 'eliminated_all' | 'time_up_winner' | 'time_up_outnumbered' | 'eliminated';
  playerCount: number;
  peakCount: number;
  absorbedRivals: number;
  convertedTotal: number;
  powerUpsCollected: number;
  rank: number;
  totalFactions: number;
  timeSurvived: number;
  leaderboard: LeaderboardEntry[];
}

export interface BestStats {
  bestCrowd: number;
  wins: number;
  matchesPlayed: number;
}
