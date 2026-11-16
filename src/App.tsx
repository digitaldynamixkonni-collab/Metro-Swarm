import { useCallback, useEffect, useRef, useState } from 'react';
import { EndModal } from './components/EndModal';
import { GameHud } from './components/GameHud';
import { TitleOverlay } from './components/TitleOverlay';
import { gameAudio } from './game/audio';
import { CrowdCityEngine } from './game/engine';
import {
  BestStats,
  FACTION_COLORS,
  FactionColorOption,
  GamePhase,
  HudSnapshot,
  MatchDuration,
  MatchResult,
  MinimapBlock,
} from './game/types';

const STATS_KEY = 'metro_swarm_best_stats_v1';

function loadBestStats(): BestStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<BestStats>;
      return {
        bestCrowd: Number(parsed.bestCrowd) || 0,
        wins: Number(parsed.wins) || 0,
        matchesPlayed: Number(parsed.matchesPlayed) || 0,
      };
    }
  } catch {
    // Ignore storage errors
  }
  return { bestCrowd: 0, wins: 0, matchesPlayed: 0 };
}

function saveBestStats(stats: BestStats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // Ignore storage errors
  }
}

const INITIAL_HUD: HudSnapshot = {
  timeRemaining: 120,
  isRushHour: false,
  playerCount: 4,
  peakCount: 4,
  stamina: 1,
  sprinting: false,
  activePowerUps: [],
  leaderboard: [],
  badges: [],
  toasts: [],
  powerUpsOnMap: 0,
  minimapFactions: [],
  minimapPowerUps: [],
};

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<CrowdCityEngine | null>(null);

  const [phase, setPhase] = useState<GamePhase>('title');
  const [selectedColor, setSelectedColor] = useState<FactionColorOption>(FACTION_COLORS[0]);
  const [duration, setDuration] = useState<MatchDuration>(120);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [minimapBlocks, setMinimapBlocks] = useState<MinimapBlock[]>([]);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [bestStats, setBestStats] = useState<BestStats>(() => loadBestStats());
  const [muted, setMuted] = useState<boolean>(() => gameAudio.isMuted());

  const phaseRef = useRef<GamePhase>(phase);
  phaseRef.current = phase;
  const colorRef = useRef<FactionColorOption>(selectedColor);
  colorRef.current = selectedColor;
  const durationRef = useRef<MatchDuration>(duration);
  durationRef.current = duration;

  useEffect(() => {
    const container = canvasMountRef.current;
    if (!container) return;

    const engine = new CrowdCityEngine(container, {
      onHudUpdate: (snapshot) => {
        setHud(snapshot);
      },
      onMatchEnd: (result) => {
        setMatchResult(result);
        setPhase(result.won ? 'victory' : 'gameover');
        setBestStats((prev) => {
          const next: BestStats = {
            bestCrowd: Math.max(prev.bestCrowd, result.peakCount),
            wins: prev.wins + (result.won ? 1 : 0),
            matchesPlayed: prev.matchesPlayed + 1,
          };
          saveBestStats(next);
          return next;
        });
      },
    });

    engineRef.current = engine;
    setMinimapBlocks(engine.getMinimapBlocks());
    return () => {
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const handleStartMatch = useCallback(() => {
    setMatchResult(null);
    setPhase('playing');
    engineRef.current?.startMatch(colorRef.current, durationRef.current);
  }, []);

  const handlePause = useCallback(() => {
    if (phaseRef.current === 'playing') {
      engineRef.current?.pauseMatch();
      setPhase('paused');
    }
  }, []);

  const handleResume = useCallback(() => {
    if (phaseRef.current === 'paused') {
      engineRef.current?.resumeMatch();
      setPhase('playing');
    }
  }, []);

  const handleReturnTitle = useCallback(() => {
    setMatchResult(null);
    setPhase('title');
    engineRef.current?.returnToTitle();
  }, []);

  const handleSelectColor = useCallback((c: FactionColorOption) => {
    setSelectedColor(c);
    engineRef.current?.setSelectedColor(c);
  }, []);

  const handleToggleMute = useCallback(() => {
    const next = gameAudio.toggleMute();
    setMuted(next);
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const current = phaseRef.current;
      if (current === 'title') {
        if (e.code === 'Enter' || e.code === 'Space') {
          e.preventDefault();
          handleStartMatch();
        }
      } else if (current === 'playing') {
        if (e.code === 'Escape' || e.code === 'KeyP') {
          e.preventDefault();
          handlePause();
        }
      } else if (current === 'paused') {
        if (e.code === 'Escape' || e.code === 'KeyP') {
          e.preventDefault();
          handleResume();
        }
      } else if (current === 'victory' || current === 'gameover') {
        if (e.code === 'Enter') {
          e.preventDefault();
          handleStartMatch();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleStartMatch, handlePause, handleResume]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-slate-950">
      {/* Isolated WebGL Viewport Container */}
      <div
        ref={canvasMountRef}
        className="absolute inset-0 w-full h-full"
        aria-label="Metro Swarm 3D city arena"
      />

      {phase === 'title' && (
        <TitleOverlay
          selectedColor={selectedColor}
          onSelectColor={handleSelectColor}
          duration={duration}
          onSelectDuration={setDuration}
          bestStats={bestStats}
          muted={muted}
          onToggleMute={handleToggleMute}
          onStart={handleStartMatch}
        />
      )}

      {(phase === 'playing' || phase === 'paused') && (
        <GameHud
          hud={hud}
          minimapBlocks={minimapBlocks}
          muted={muted}
          onToggleMute={handleToggleMute}
          onPause={handlePause}
        />
      )}

      {(phase === 'paused' || phase === 'victory' || phase === 'gameover') && (
        <EndModal
          phase={phase}
          result={matchResult}
          playerColorHex={selectedColor.hex}
          onResume={handleResume}
          onRestart={handleStartMatch}
          onReturnTitle={handleReturnTitle}
        />
      )}
    </main>
  );
}
