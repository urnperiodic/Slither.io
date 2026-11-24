import { useEffect, useRef, useState } from 'react';
import { Check, Copy, LogOut, Volume2, VolumeX, Zap } from 'lucide-react';
import type { KillEvent, LeaderboardEntry, MinimapDot } from '../shared/types';

interface GameHudProps {
  selfId: string | null;
  selfLength: number;
  selfRank: number;
  selfKills: number;
  totalSnakes: number;
  canBoost: boolean;
  isBoosting: boolean;
  leaderboard: LeaderboardEntry[];
  minimap: MinimapDot[];
  killFeed: KillEvent[];
  roomCode: string | null;
  humanCount: number;
  maxHumans: number;
  muted: boolean;
  isTouchDevice: boolean;
  onToggleMute: () => void;
  onReturnToLobby: () => void;
  onTouchBoostStart: () => void;
  onTouchBoostEnd: () => void;
}

export function GameHud({
  selfId,
  selfLength,
  selfRank,
  selfKills,
  totalSnakes,
  canBoost,
  isBoosting,
  leaderboard,
  minimap,
  killFeed,
  roomCode,
  humanCount,
  maxHumans,
  muted,
  isTouchDevice,
  onToggleMute,
  onReturnToLobby,
  onTouchBoostStart,
  onTouchBoostEnd,
}: GameHudProps) {
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);

  // Draw circular Slither.io minimap radar
  useEffect(() => {
    const canvas = minimapRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 128;
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== Math.round(size * dpr)) {
      canvas.width = Math.round(size * dpr);
      canvas.height = Math.round(size * dpr);
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, size, size);

    const cx = size / 2;
    const cy = size / 2;
    const r = size / 2 - 5;

    // Translucent radar disc
    ctx.fillStyle = 'rgba(13, 19, 26, 0.72)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();

    // Subtle crosshair lines
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - r, cy);
    ctx.lineTo(cx + r, cy);
    ctx.moveTo(cx, cy - r);
    ctx.lineTo(cx, cy + r);
    ctx.stroke();

    // Outer arena ring
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.55)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();

    // Draw dots (bots first, then humans, leader, and self on top)
    let selfDot: MinimapDot | null = null;
    for (const dot of minimap) {
      if (dot.kind === 'self') {
        selfDot = dot;
        continue;
      }
      const px = cx + dot.x * (r - 4);
      const py = cy + dot.y * (r - 4);

      if (dot.kind === 'bot') {
        ctx.fillStyle = 'rgba(148, 163, 184, 0.45)';
        ctx.beginPath();
        ctx.arc(px, py, 1.8, 0, Math.PI * 2);
        ctx.fill();
      } else if (dot.kind === 'leader') {
        ctx.fillStyle = '#facc15';
        ctx.beginPath();
        ctx.arc(px, py, 3.1, 0, Math.PI * 2);
        ctx.fill();
      } else if (dot.kind === 'human') {
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(px, py, 3.2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (selfDot) {
      const sx = cx + selfDot.x * (r - 4);
      const sy = cy + selfDot.y * (r - 4);
      ctx.fillStyle = 'rgba(52, 211, 153, 0.35)';
      ctx.beginPath();
      ctx.arc(sx, sy, 6.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(sx, sy, 3.1, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }, [minimap]);

  const handleCopyInvite = () => {
    if (!roomCode) return;
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomCode);
    navigator.clipboard?.writeText(url.toString()).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-10 pointer-events-none select-none">
      {/* Top-Left Compact Room & Utility Controls */}
      <div className="fixed top-3.5 left-3.5 flex items-center gap-2 pointer-events-auto">
        <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-[#0e141b]/75 backdrop-blur-sm border border-slate-700/50 text-xs text-slate-300">
          <span className="font-mono font-semibold text-white tracking-wider">
            {roomCode ?? 'MAIN'}
          </span>
          <span aria-hidden="true" className="text-slate-600">·</span>
          <span className="font-mono tabular-nums text-slate-300">
            {humanCount}/{maxHumans} players
          </span>
          {roomCode && (
            <button
              type="button"
              onClick={handleCopyInvite}
              className="text-emerald-400 hover:text-emerald-300 transition-colors ml-0.5 cursor-pointer"
              title="Copy invite link"
              aria-label="Copy room invite link"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={onToggleMute}
          className="p-2 rounded-xl bg-[#0e141b]/75 backdrop-blur-sm border border-slate-700/50 text-slate-300 hover:text-white transition-colors cursor-pointer"
          aria-label={muted ? 'Unmute audio' : 'Mute audio'}
          title={muted ? 'Unmute audio' : 'Mute audio'}
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>

        <button
          type="button"
          onClick={onReturnToLobby}
          className="p-2 rounded-xl bg-[#0e141b]/75 backdrop-blur-sm border border-slate-700/50 text-slate-300 hover:text-white transition-colors cursor-pointer"
          aria-label="Leave match and return to lobby"
          title="Return to lobby"
        >
          <LogOut className="w-4 h-4" />
        </button>
      </div>

      {/* Top-Center Quiet Elimination Feed */}
      {killFeed.length > 0 && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 max-w-xs sm:max-w-sm">
          {killFeed.slice(-3).map((evt) => (
            <div
              key={evt.id}
              className="px-3 py-1 rounded-lg bg-[#0d131a]/65 text-xs text-slate-200 whitespace-nowrap truncate max-w-full"
            >
              <span className="font-semibold text-emerald-300">{evt.killerName}</span>
              <span className="text-slate-400 mx-1.5">eliminated</span>
              <span className="font-semibold text-rose-300">{evt.victimName}</span>
            </div>
          ))}
        </div>
      )}

      {/* Top-Right Authentic Slither.io Leaderboard */}
      <aside
        className="fixed top-3.5 right-3.5 w-52 sm:w-56 px-3.5 py-3 rounded-xl bg-[#0d131a]/68 backdrop-blur-sm border border-slate-800/60"
        aria-label="Leaderboard"
      >
        <div className="text-xs font-semibold text-slate-300 tracking-wide mb-2 text-center">
          Leaderboard
        </div>
        <ol className="space-y-1">
          {leaderboard.map((entry) => {
            const isSelf = entry.id === selfId;
            return (
              <li
                key={entry.id}
                className={`flex items-center justify-between gap-2 text-xs leading-tight px-1.5 py-0.5 rounded ${
                  isSelf
                    ? 'bg-emerald-500/20 text-emerald-200 font-semibold'
                    : entry.rank === 1
                      ? 'text-amber-300 font-medium'
                      : !entry.isBot
                        ? 'text-sky-300'
                        : 'text-slate-300/90'
                }`}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <span className="font-mono tabular-nums text-slate-400 w-4 text-right shrink-0">
                    {entry.rank}.
                  </span>
                  <span className="truncate">
                    {!entry.isBot && !isSelf ? `★ ${entry.name}` : entry.name}
                  </span>
                </span>
                <span className="font-mono tabular-nums shrink-0">{entry.length}</span>
              </li>
            );
          })}
        </ol>
      </aside>

      {/* Bottom-Left Authentic Slither.io Length & Rank Readout */}
      <div className="fixed bottom-4 left-4 text-left space-y-0.5 drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]">
        <div className="text-sm sm:text-base text-slate-200 font-medium">
          Your length:{' '}
          <span className="font-mono tabular-nums font-bold text-white text-lg">
            {selfLength}
          </span>
        </div>
        <div className="text-xs sm:text-sm text-slate-300">
          Your rank:{' '}
          <span className="font-mono tabular-nums font-semibold text-white">
            {selfRank || '-'}
          </span>{' '}
          of{' '}
          <span className="font-mono tabular-nums">{totalSnakes}</span>
          {selfKills > 0 && (
            <>
              <span aria-hidden="true" className="mx-1.5 text-slate-500">·</span>
              <span className="text-emerald-300 font-medium">
                {selfKills} {selfKills === 1 ? 'kill' : 'kills'}
              </span>
            </>
          )}
        </div>
        <div className="text-xs text-slate-400 pt-0.5">
          {isBoosting ? (
            <span className="text-amber-300 font-medium">Boosting · draining mass</span>
          ) : canBoost ? (
            <span>Hold Click or Space to boost</span>
          ) : (
            <span>Eat orbs to reach length 15 to boost</span>
          )}
        </div>
      </div>

      {/* Bottom-Right Circular Minimap */}
      <div className="fixed bottom-3.5 right-3.5 flex flex-col items-end gap-2">
        {isTouchDevice && (
          <button
            type="button"
            onTouchStart={(e) => {
              e.preventDefault();
              onTouchBoostStart();
            }}
            onTouchEnd={(e) => {
              e.preventDefault();
              onTouchBoostEnd();
            }}
            onTouchCancel={onTouchBoostEnd}
            className={`pointer-events-auto w-16 h-16 rounded-full border-2 flex items-center justify-center transition-transform active:scale-95 ${
              isBoosting
                ? 'bg-amber-400 border-amber-200 text-slate-950'
                : 'bg-[#121922]/85 border-emerald-400/70 text-emerald-300'
            }`}
            aria-label="Hold to boost"
          >
            <Zap className="w-7 h-7 fill-current" />
          </button>
        )}

        <canvas
          ref={minimapRef}
          style={{ width: 128, height: 128 }}
          className="block rounded-full"
          aria-label="Arena minimap"
        />
      </div>
    </div>
  );
}
