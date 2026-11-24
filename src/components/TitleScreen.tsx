import { useState, type FormEvent } from 'react';
import { Check, ChevronLeft, ChevronRight, Copy, Palette, Play, Users, Volume2, VolumeX } from 'lucide-react';
import { MAX_HUMANS_PER_ROOM, SKINS, getSkinById } from '../shared/types';
import { SkinPreviewCanvas, SkinSelectorModal } from './SkinPreview';

interface TitleScreenProps {
  nickname: string;
  onChangeNickname: (val: string) => void;
  skinId: string;
  customColors: string[];
  onSelectSkin: (id: string) => void;
  onChangeCustomColors: (colors: string[]) => void;
  roomCode: string | null;
  isPrivateRoom: boolean;
  humanCount: number;
  maxHumans: number;
  botCount: number;
  connected: boolean;
  roomError: string | null;
  muted: boolean;
  onToggleMute: () => void;
  onPlay: () => void;
  onJoinPublic: () => void;
  onCreatePrivate: (botCount: number) => void;
  onJoinCode: (code: string) => void;
}

export function TitleScreen({
  nickname,
  onChangeNickname,
  skinId,
  customColors,
  onSelectSkin,
  onChangeCustomColors,
  roomCode,
  isPrivateRoom,
  humanCount,
  maxHumans,
  botCount,
  connected,
  roomError,
  muted,
  onToggleMute,
  onPlay,
  onJoinPublic,
  onCreatePrivate,
  onJoinCode,
}: TitleScreenProps) {
  const [skinModalOpen, setSkinModalOpen] = useState(false);
  const [roomTab, setRoomTab] = useState<'public' | 'private' | 'join'>(isPrivateRoom ? 'private' : 'public');
  const [joinInput, setJoinInput] = useState('');
  const [privateBots, setPrivateBots] = useState<number>(botCount || 24);
  const [copied, setCopied] = useState(false);

  const activeSkin = getSkinById(skinId, customColors);

  const cycleSkin = (dir: -1 | 1) => {
    const allIds = [...SKINS.map((s) => s.id), 'custom'];
    const idx = allIds.indexOf(skinId);
    const next = allIds[(idx + dir + allIds.length) % allIds.length];
    onSelectSkin(next);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    onPlay();
  };

  const handleCopyInvite = () => {
    if (!roomCode) return;
    const url = new URL(window.location.href);
    url.searchParams.set('room', roomCode);
    navigator.clipboard?.writeText(url.toString()).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-20 flex flex-col items-center justify-center p-4 bg-gradient-to-b from-[#0d1218]/65 via-[#0d1218]/50 to-[#0d1218]/75">
      {/* Top-right quiet mute toggle */}
      <div className="fixed top-4 right-4 z-30">
        <button
          type="button"
          onClick={onToggleMute}
          className="p-2.5 rounded-xl bg-[#141b23]/85 border border-slate-700/60 text-slate-300 hover:text-white hover:bg-slate-800 transition-colors focus-visible:outline-2 focus-visible:outline-emerald-400"
          aria-label={muted ? 'Unmute audio' : 'Mute audio'}
          title={muted ? 'Unmute audio' : 'Mute audio'}
        >
          {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>

      <div className="w-full max-w-[440px] flex flex-col items-center">
        {/* Authentic Slither Wordmark */}
        <h1 className="font-display text-6xl sm:text-7xl font-bold tracking-tight mb-1 select-none drop-shadow-[0_6px_24px_rgba(16,185,129,0.28)]">
          <span className="bg-gradient-to-b from-emerald-300 via-emerald-400 to-teal-500 bg-clip-text text-transparent">
            slither
          </span>
          <span className="text-slate-100 font-semibold text-4xl sm:text-5xl">.arena</span>
        </h1>

        <p className="text-sm text-slate-300/90 mb-5 text-center">
          Eat glowing orbs to grow longer · Cut off rivals for 1–{MAX_HUMANS_PER_ROOM} players &amp; bots
        </p>

        {/* Main Play Panel */}
        <div className="w-full bg-[#131a22]/92 backdrop-blur-md border border-slate-700/65 rounded-2xl shadow-2xl p-6">
          {/* Animated Skin Preview Strip */}
          <div className="flex items-center justify-between gap-1 bg-[#0e141a]/90 border border-slate-800 rounded-xl px-2 py-2 mb-4">
            <button
              type="button"
              onClick={() => cycleSkin(-1)}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
              aria-label="Previous snake skin"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>

            <div className="flex-1 min-w-0 flex flex-col items-center">
              <SkinPreviewCanvas skinId={skinId} customColors={customColors} width={220} height={58} />
              <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400">
                <span className="font-medium text-slate-200">{activeSkin.name}</span>
                <span aria-hidden="true">·</span>
                <button
                  type="button"
                  onClick={() => setSkinModalOpen(true)}
                  className="inline-flex items-center gap-1 text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
                >
                  <Palette className="w-3.5 h-3.5" />
                  Customize
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={() => cycleSkin(1)}
              className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
              aria-label="Next snake skin"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>

          {/* Nickname & Play Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label htmlFor="nickname-input" className="sr-only">
                Nickname
              </label>
              <input
                id="nickname-input"
                type="text"
                maxLength={16}
                value={nickname}
                onChange={(e) => onChangeNickname(e.target.value)}
                placeholder="Enter nickname"
                autoComplete="off"
                className="w-full px-4 py-3 rounded-xl bg-[#0c1117] border border-slate-700/80 text-white placeholder-slate-500 text-base font-medium focus:outline-none focus:border-emerald-400 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={!connected}
              className="w-full py-3.5 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 font-display text-xl font-bold tracking-wide transition-all flex items-center justify-center gap-2 shadow-lg shadow-emerald-950/50 cursor-pointer"
            >
              <Play className="w-5 h-5 fill-current" />
              {connected ? 'Play' : 'Connecting...'}
            </button>
          </form>

          {/* Divider */}
          <div className="my-5 border-t border-slate-800/90" />

          {/* 1–5 Player Multiplayer Room Section */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <Users className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="font-semibold text-slate-200">
                  Room {roomCode ?? '---'}
                </span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="font-mono tabular-nums text-slate-300">
                  {humanCount}/{maxHumans} players
                </span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="font-mono tabular-nums text-slate-400">
                  {botCount} bots
                </span>
              </div>

              {roomCode && (
                <button
                  type="button"
                  onClick={handleCopyInvite}
                  className="inline-flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copied ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      Invite
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Segmented Mode Control */}
            <div className="grid grid-cols-3 gap-1 p-1 bg-[#0c1117] rounded-xl border border-slate-800/80 mb-3">
              <button
                type="button"
                onClick={() => {
                  setRoomTab('public');
                  if (isPrivateRoom) onJoinPublic();
                }}
                className={`py-1.5 px-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  roomTab === 'public'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Public
              </button>
              <button
                type="button"
                onClick={() => setRoomTab('private')}
                className={`py-1.5 px-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  roomTab === 'private'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Create Room
              </button>
              <button
                type="button"
                onClick={() => setRoomTab('join')}
                className={`py-1.5 px-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  roomTab === 'join'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Join Code
              </button>
            </div>

            {roomTab === 'public' && (
              <div className="flex items-center justify-between text-xs text-slate-400 px-1">
                <span>Auto-matched public arena (up to {MAX_HUMANS_PER_ROOM} players + bots).</span>
                {isPrivateRoom && (
                  <button
                    type="button"
                    onClick={onJoinPublic}
                    className="text-emerald-400 hover:text-emerald-300 font-semibold ml-2 whitespace-nowrap cursor-pointer"
                  >
                    Switch
                  </button>
                )}
              </div>
            )}

            {roomTab === 'private' && (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-slate-300">
                  <span className="whitespace-nowrap">Bots:</span>
                  <div className="flex items-center gap-1">
                    {[0, 12, 24, 32].map((count) => (
                      <button
                        key={count}
                        type="button"
                        onClick={() => setPrivateBots(count)}
                        className={`px-2 py-1 rounded-md font-mono tabular-nums text-xs font-medium transition-colors cursor-pointer ${
                          privateBots === count
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/50'
                            : 'bg-[#0c1117] text-slate-400 border border-slate-800 hover:text-white'
                        }`}
                      >
                        {count}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onCreatePrivate(privateBots)}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  New Code
                </button>
              </div>
            )}

            {roomTab === 'join' && (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  maxLength={6}
                  value={joinInput}
                  onChange={(e) => setJoinInput(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                  placeholder="Enter 4-letter code"
                  className="flex-1 px-3 py-1.5 rounded-lg bg-[#0c1117] border border-slate-700/80 text-white font-mono uppercase tracking-widest text-xs placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (joinInput.trim().length >= 3) {
                      onJoinCode(joinInput.trim());
                    }
                  }}
                  disabled={joinInput.trim().length < 3}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 text-xs font-bold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Join
                </button>
              </div>
            )}

            {roomError && (
              <p className="mt-2.5 text-xs text-rose-400 font-medium" role="alert">
                {roomError}
              </p>
            )}
          </div>
        </div>

        {/* Quiet Control Summary */}
        <p className="mt-4 text-xs text-slate-400 text-center">
          Mouse or Arrow keys to steer · Hold Left Click or Space to boost
        </p>
      </div>

      {skinModalOpen && (
        <SkinSelectorModal
          skinId={skinId}
          customColors={customColors}
          onSelectSkin={onSelectSkin}
          onChangeCustomColors={onChangeCustomColors}
          onClose={() => setSkinModalOpen(false)}
        />
      )}
    </div>
  );
}
