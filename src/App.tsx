import { useCallback, useEffect, useRef, useState } from 'react';
import { gameAudio } from './client/audio';
import { SlitherRenderer, type RenderSnapshot } from './client/renderer';
import { GameHud } from './components/GameHud';
import { GameOverModal } from './components/GameOverModal';
import { TitleScreen } from './components/TitleScreen';
import {
  DEFAULT_BOT_COUNT,
  MAX_HUMANS_PER_ROOM,
  type ClientMessage,
  type DeathStats,
  type KillEvent,
  type LeaderboardEntry,
  type MinimapDot,
  type SerializedSnake,
  type ServerMessage,
} from './shared/types';

type GamePhase = 'TITLE_MENU' | 'PLAYING' | 'GAME_OVER';

const STORAGE_NAME_KEY = 'slither_arena_nickname';
const STORAGE_SKIN_KEY = 'slither_arena_skin';
const STORAGE_CUSTOM_KEY = 'slither_arena_custom_colors';

function loadInitialString(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

function loadInitialColors(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_CUSTOM_KEY);
    if (!raw) return ['#34d399', '#38bdf8', '#a855f7'];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed.slice(0, 8);
  } catch {
    // ignore storage errors
  }
  return ['#34d399', '#38bdf8', '#a855f7'];
}

export default function App() {
  const [phase, setPhase] = useState<GamePhase>('TITLE_MENU');
  const [connected, setConnected] = useState(false);

  const [nickname, setNickname] = useState(() => loadInitialString(STORAGE_NAME_KEY, ''));
  const [skinId, setSkinId] = useState(() => loadInitialString(STORAGE_SKIN_KEY, 'emerald'));
  const [customColors, setCustomColors] = useState<string[]>(loadInitialColors);

  const [roomCode, setRoomCode] = useState<string | null>(null);
  const [isPrivateRoom, setIsPrivateRoom] = useState(false);
  const [humanCount, setHumanCount] = useState(1);
  const [maxHumans, setMaxHumans] = useState(MAX_HUMANS_PER_ROOM);
  const [botCount, setBotCount] = useState(DEFAULT_BOT_COUNT);
  const [roomError, setRoomError] = useState<string | null>(null);

  // Live HUD state updated from server snapshots
  const [selfId, setSelfId] = useState<string | null>(null);
  const [selfLength, setSelfLength] = useState(10);
  const [selfRank, setSelfRank] = useState(0);
  const [selfKills, setSelfKills] = useState(0);
  const [totalSnakes, setTotalSnakes] = useState(0);
  const [canBoost, setCanBoost] = useState(false);
  const [isBoosting, setIsBoosting] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [minimap, setMinimap] = useState<MinimapDot[]>([]);
  const [killFeed, setKillFeed] = useState<KillEvent[]>([]);
  const [deathStats, setDeathStats] = useState<DeathStats | null>(null);

  const [muted, setMuted] = useState(false);
  const [isTouchDevice, setIsTouchDevice] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rendererRef = useRef<SlitherRenderer | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const prevSnapRef = useRef<RenderSnapshot | null>(null);
  const currSnapRef = useRef<RenderSnapshot | null>(null);
  const phaseRef = useRef<GamePhase>('TITLE_MENU');
  const deathModalTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Input refs for zero-latency steering
  const angleRef = useRef<number>(0);
  const boostingInputRef = useRef<boolean>(false);
  const keysHeldRef = useRef<{ left: boolean; right: boolean; boost: boolean }>({
    left: false,
    right: false,
    boost: false,
  });
  const mouseBoostRef = useRef<boolean>(false);
  const touchBoostRef = useRef<boolean>(false);
  const pendingRoomRef = useRef<string | null>(null);
  const currentRoomRef = useRef<string | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    setIsTouchDevice(
      typeof window !== 'undefined' &&
        ('ontouchstart' in window || navigator.maxTouchPoints > 0)
    );
  }, []);

  // Persist user preferences
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_NAME_KEY, nickname);
    } catch {
      // ignore
    }
  }, [nickname]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_SKIN_KEY, skinId);
    } catch {
      // ignore
    }
  }, [skinId]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_CUSTOM_KEY, JSON.stringify(customColors));
    } catch {
      // ignore
    }
  }, [customColors]);

  const sendMessage = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  const syncUrlRoomParam = useCallback((code: string | null, isPrivate: boolean) => {
    try {
      const url = new URL(window.location.href);
      if (code && isPrivate) {
        url.searchParams.set('room', code);
      } else {
        url.searchParams.delete('room');
      }
      window.history.replaceState({}, '', url.toString());
    } catch {
      // ignore in restricted iframe contexts
    }
  }, []);

  // WebSocket lifecycle with automatic reconnection
  useEffect(() => {
    let closedByUnmount = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const urlParams = new URLSearchParams(window.location.search);
    const initialRoomFromUrl = urlParams.get('room')?.trim().toUpperCase() || null;
    if (initialRoomFromUrl) {
      pendingRoomRef.current = initialRoomFromUrl;
    }

    const connect = () => {
      if (closedByUnmount) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${proto}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        setRoomError(null);
        const targetRoom = pendingRoomRef.current;
        if (targetRoom) {
          ws.send(
            JSON.stringify({
              type: 'join_room',
              mode: 'join',
              roomCode: targetRoom,
            } satisfies ClientMessage)
          );
        } else {
          ws.send(JSON.stringify({ type: 'join_room', mode: 'public' } satisfies ClientMessage));
        }
      };

      ws.onmessage = (event) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(String(event.data)) as ServerMessage;
        } catch {
          return;
        }

        if (msg.type === 'room_joined') {
          setRoomCode(msg.roomCode);
          setIsPrivateRoom(msg.isPrivate);
          setMaxHumans(msg.maxHumans);
          setBotCount(msg.botCount);
          setRoomError(null);
          pendingRoomRef.current = msg.roomCode;
          currentRoomRef.current = msg.roomCode;
          syncUrlRoomParam(msg.roomCode, msg.isPrivate);
          return;
        }

        if (msg.type === 'room_error') {
          setRoomError(msg.message);
          // If initial URL room failed before joining any room, fall back to public arena
          if (phaseRef.current === 'TITLE_MENU' && !currentRoomRef.current) {
            pendingRoomRef.current = null;
            ws.send(JSON.stringify({ type: 'join_room', mode: 'public' } satisfies ClientMessage));
          }
          return;
        }

        if (msg.type === 'spawned') {
          if (deathModalTimerRef.current) {
            clearTimeout(deathModalTimerRef.current);
            deathModalTimerRef.current = null;
          }
          setDeathStats(null);
          setSelfId(msg.snakeId);
          setPhase('PLAYING');
          return;
        }

        if (msg.type === 'died') {
          gameAudio.playDeath();
          setIsBoosting(false);
          setSelfId(null);
          setDeathStats(msg.stats);
          // Classic Slither.io brief pause over your burst of orbs before showing summary modal
          if (deathModalTimerRef.current) clearTimeout(deathModalTimerRef.current);
          deathModalTimerRef.current = setTimeout(() => {
            setPhase('GAME_OVER');
          }, 550);
          return;
        }

        if (msg.type === 'state') {
          const snakesMap = new Map<string, SerializedSnake>();
          for (const s of msg.snakes) {
            snakesMap.set(s.id, s);
          }

          prevSnapRef.current = currSnapRef.current;
          currSnapRef.current = {
            receivedAt: performance.now(),
            camX: msg.camX,
            camY: msg.camY,
            zoom: msg.zoom,
            selfId: msg.selfId,
            leaderId: msg.leaderboard[0]?.id ?? null,
            snakes: snakesMap,
            foods: msg.foods,
          };

          // Audio & spark feedback for local player
          if (msg.selfId) {
            const selfSnake = snakesMap.get(msg.selfId);
            const activeBoost = Boolean(selfSnake?.boosting);
            setIsBoosting(activeBoost);
            gameAudio.setBoosting(activeBoost);

            if (msg.ateMass > 0) {
              gameAudio.playEat(msg.ateMass);
              if (selfSnake && selfSnake.pts.length >= 2 && rendererRef.current) {
                rendererRef.current.spawnEatSpark(
                  selfSnake.pts[0],
                  selfSnake.pts[1],
                  msg.ateMass >= 3 ? '#fde047' : '#6ee7b7',
                  msg.ateMass >= 3 ? 6 : 2
                );
              }
            }
            if (msg.gotKill) {
              gameAudio.playKill();
            }
          } else {
            gameAudio.setBoosting(false);
          }

          setSelfId(msg.selfId);
          setSelfLength(msg.selfLength);
          setSelfRank(msg.selfRank);
          setSelfKills(msg.selfKills);
          setTotalSnakes(msg.totalSnakes);
          setCanBoost(msg.canBoost);
          setHumanCount(msg.humanCount);
          setMaxHumans(msg.maxHumans);
          setLeaderboard(msg.leaderboard);
          setMinimap(msg.minimap);
          setKillFeed(msg.killFeed);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        gameAudio.setBoosting(false);
        if (!closedByUnmount) {
          reconnectTimer = setTimeout(connect, 1400);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      closedByUnmount = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (deathModalTimerRef.current) clearTimeout(deathModalTimerRef.current);
      gameAudio.setBoosting(false);
      wsRef.current?.close();
    };
  }, [syncUrlRoomParam]);

  // Canvas 60-144 FPS Render Loop + Continuous Input Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!rendererRef.current) {
      rendererRef.current = new SlitherRenderer();
    }
    const renderer = rendererRef.current;

    let width = window.innerWidth;
    let height = window.innerHeight;
    const handleResize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    handleResize();
    window.addEventListener('resize', handleResize);

    let rafId = 0;
    let lastFrame = performance.now();
    let lastInputSentAt = 0;
    let lastSentBoost = false;

    const loop = (now: number) => {
      const dtSec = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000));
      lastFrame = now;

      // Apply keyboard steering if Left/Right or A/D held
      if (phaseRef.current === 'PLAYING') {
        const keys = keysHeldRef.current;
        if (keys.left) angleRef.current -= 4.4 * dtSec;
        if (keys.right) angleRef.current += 4.4 * dtSec;

        const wantBoost = mouseBoostRef.current || keys.boost || touchBoostRef.current;
        boostingInputRef.current = wantBoost;

        if (now - lastInputSentAt >= 32 || wantBoost !== lastSentBoost) {
          lastInputSentAt = now;
          lastSentBoost = wantBoost;
          sendMessage({
            type: 'input',
            angle: angleRef.current,
            boosting: wantBoost,
          });
        }
      }

      renderer.render(
        ctx,
        width,
        height,
        prevSnapRef.current,
        currSnapRef.current,
        now,
        dtSec
      );

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', handleResize);
    };
  }, [sendMessage]);

  // Mouse, Keyboard, and Touch Input Listeners
  useEffect(() => {
    const updateMouseAngle = (clientX: number, clientY: number) => {
      const dx = clientX - window.innerWidth / 2;
      const dy = clientY - window.innerHeight / 2;
      if (dx * dx + dy * dy > 16) {
        angleRef.current = Math.atan2(dy, dx);
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (phaseRef.current !== 'PLAYING') return;
      updateMouseAngle(e.clientX, e.clientY);
    };

    const onMouseDown = (e: MouseEvent) => {
      if (phaseRef.current !== 'PLAYING') return;
      // Ignore clicks on HUD buttons
      if ((e.target as HTMLElement)?.closest('button')) return;
      if (e.button === 0 || e.button === 2) {
        mouseBoostRef.current = true;
      }
    };

    const onMouseUp = () => {
      mouseBoostRef.current = false;
    };

    const onContextMenu = (e: MouseEvent) => {
      if (phaseRef.current === 'PLAYING') {
        e.preventDefault();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (phaseRef.current !== 'PLAYING') return;
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') keysHeldRef.current.left = true;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') keysHeldRef.current.right = true;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        e.preventDefault();
        keysHeldRef.current.boost = true;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ArrowLeft' || e.code === 'KeyA') keysHeldRef.current.left = false;
      if (e.code === 'ArrowRight' || e.code === 'KeyD') keysHeldRef.current.right = false;
      if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
        keysHeldRef.current.boost = false;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (phaseRef.current !== 'PLAYING') return;
      if ((e.target as HTMLElement)?.closest('button')) return;
      const touch = e.touches[0];
      if (touch) {
        updateMouseAngle(touch.clientX, touch.clientY);
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (phaseRef.current !== 'PLAYING') return;
      if ((e.target as HTMLElement)?.closest('button')) return;
      const touch = e.touches[0];
      if (touch) {
        updateMouseAngle(touch.clientX, touch.clientY);
      }
    };

    const onBlur = () => {
      mouseBoostRef.current = false;
      touchBoostRef.current = false;
      keysHeldRef.current = { left: false, right: false, boost: false };
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('blur', onBlur);

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      gameAudio.setMuted(next);
      return next;
    });
  }, []);

  const handlePlay = useCallback(() => {
    mouseBoostRef.current = false;
    touchBoostRef.current = false;
    keysHeldRef.current = { left: false, right: false, boost: false };
    sendMessage({
      type: 'spawn',
      name: nickname.trim() || 'Slitherer',
      skinId,
      customColors: skinId === 'custom' ? customColors : undefined,
    });
  }, [sendMessage, nickname, skinId, customColors]);

  const handleJoinPublic = useCallback(() => {
    setRoomError(null);
    pendingRoomRef.current = null;
    sendMessage({ type: 'join_room', mode: 'public' });
  }, [sendMessage]);

  const handleCreatePrivate = useCallback(
    (bots: number) => {
      setRoomError(null);
      sendMessage({ type: 'join_room', mode: 'create', botCount: bots });
    },
    [sendMessage]
  );

  const handleJoinCode = useCallback(
    (code: string) => {
      setRoomError(null);
      sendMessage({ type: 'join_room', mode: 'join', roomCode: code });
    },
    [sendMessage]
  );

  const handleReturnToLobby = useCallback(() => {
    gameAudio.setBoosting(false);
    mouseBoostRef.current = false;
    touchBoostRef.current = false;
    keysHeldRef.current = { left: false, right: false, boost: false };
    // Rejoin current room to despawn cleanly without disconnecting
    if (roomCode) {
      sendMessage({ type: 'join_room', mode: 'join', roomCode });
    } else {
      sendMessage({ type: 'join_room', mode: 'public' });
    }
    setDeathStats(null);
    setSelfId(null);
    setPhase('TITLE_MENU');
  }, [roomCode, sendMessage]);

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#11161c]">
      {/* Full-Viewport Live Slither.io Canvas */}
      <canvas
        ref={canvasRef}
        className="block w-full h-full cursor-crosshair"
        aria-label="Slither Arena game board"
      />

      {/* Title Screen floating over live spectated arena */}
      {phase === 'TITLE_MENU' && (
        <TitleScreen
          nickname={nickname}
          onChangeNickname={setNickname}
          skinId={skinId}
          customColors={customColors}
          onSelectSkin={setSkinId}
          onChangeCustomColors={setCustomColors}
          roomCode={roomCode}
          isPrivateRoom={isPrivateRoom}
          humanCount={humanCount}
          maxHumans={maxHumans}
          botCount={botCount}
          connected={connected}
          roomError={roomError}
          muted={muted}
          onToggleMute={handleToggleMute}
          onPlay={handlePlay}
          onJoinPublic={handleJoinPublic}
          onCreatePrivate={handleCreatePrivate}
          onJoinCode={handleJoinCode}
        />
      )}

      {/* Active Gameplay HUD */}
      {phase === 'PLAYING' && (
        <GameHud
          selfId={selfId}
          selfLength={selfLength}
          selfRank={selfRank}
          selfKills={selfKills}
          totalSnakes={totalSnakes}
          canBoost={canBoost}
          isBoosting={isBoosting}
          leaderboard={leaderboard}
          minimap={minimap}
          killFeed={killFeed}
          roomCode={roomCode}
          humanCount={humanCount}
          maxHumans={maxHumans}
          muted={muted}
          isTouchDevice={isTouchDevice}
          onToggleMute={handleToggleMute}
          onReturnToLobby={handleReturnToLobby}
          onTouchBoostStart={() => {
            touchBoostRef.current = true;
          }}
          onTouchBoostEnd={() => {
            touchBoostRef.current = false;
          }}
        />
      )}

      {/* Game Over Summary Overlay */}
      {phase === 'GAME_OVER' && deathStats && (
        <GameOverModal
          stats={deathStats}
          onPlayAgain={handlePlay}
          onBackToLobby={() => {
            setDeathStats(null);
            setPhase('TITLE_MENU');
          }}
        />
      )}
    </main>
  );
}
