import { useEffect, useRef } from 'react';
import { CUSTOM_SWATCHES, SKINS, getSkinById } from '../shared/types';
import { ChevronLeft, ChevronRight, Plus, Trash2, X } from 'lucide-react';

interface SkinPreviewCanvasProps {
  skinId: string;
  customColors: string[];
  width?: number;
  height?: number;
}

function shadeHex(hex: string, percent: number): string {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + percent));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + percent));
  const b = Math.min(255, Math.max(0, (num & 0xff) + percent));
  return `rgb(${r}, ${g}, ${b})`;
}

export function SkinPreviewCanvas({
  skinId,
  customColors,
  width = 280,
  height = 76,
}: SkinPreviewCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let rafId = 0;
    const skin = getSkinById(skinId, customColors);

    const draw = (now: number) => {
      const t = now * 0.003;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      const segCount = 24;
      const radius = 14;
      const startX = 36;
      const endX = width - 42;
      const midY = height / 2;

      const pts: Array<{ x: number; y: number }> = [];
      for (let i = 0; i < segCount; i++) {
        const frac = i / (segCount - 1);
        const x = endX - frac * (endX - startX);
        const y = midY + Math.sin(frac * 5.2 - t) * 14;
        pts.push({ x, y });
      }

      // Draw from tail to head
      const stripeLen = Math.max(1, skin.stripeLength);
      for (let i = segCount - 1; i >= 0; i--) {
        const color = skin.colors[Math.floor(i / stripeLen) % skin.colors.length];
        const fromTail = segCount - 1 - i;
        const r = fromTail < 4 ? radius * (0.62 + (fromTail / 4) * 0.38) : radius;
        const p = pts[i];

        const grad = ctx.createRadialGradient(p.x - r * 0.25, p.y - r * 0.28, r * 0.08, p.x, p.y, r);
        grad.addColorStop(0, shadeHex(color, 44));
        grad.addColorStop(0.55, color);
        grad.addColorStop(0.9, shadeHex(color, -36));
        grad.addColorStop(1, shadeHex(color, -55));

        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      // Eyes on head
      const head = pts[0];
      const neck = pts[1];
      const angle = Math.atan2(head.y - neck.y, head.x - neck.x);
      const fwdX = Math.cos(angle);
      const fwdY = Math.sin(angle);
      const perpX = -Math.sin(angle);
      const perpY = Math.cos(angle);

      for (const side of [-1, 1]) {
        const ex = head.x + fwdX * 5.5 + perpX * 6.2 * side;
        const ey = head.y + fwdY * 5.5 + perpY * 6.2 * side;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(ex, ey, 4.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#0f172a';
        ctx.beginPath();
        ctx.arc(ex + fwdX * 1.4, ey + fwdY * 1.4, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.restore();
      rafId = requestAnimationFrame(draw);
    };

    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [skinId, customColors, width, height]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width, height }}
      className="block mx-auto"
      aria-label="Live preview of selected snake skin"
    />
  );
}

interface SkinSelectorModalProps {
  skinId: string;
  customColors: string[];
  onSelectSkin: (skinId: string) => void;
  onChangeCustomColors: (colors: string[]) => void;
  onClose: () => void;
}

export function SkinSelectorModal({
  skinId,
  customColors,
  onSelectSkin,
  onChangeCustomColors,
  onClose,
}: SkinSelectorModalProps) {
  const activeSkin = getSkinById(skinId, customColors);

  const cycleSkin = (dir: -1 | 1) => {
    const allIds = [...SKINS.map((s) => s.id), 'custom'];
    const idx = allIds.indexOf(skinId);
    const next = allIds[(idx + dir + allIds.length) % allIds.length];
    onSelectSkin(next);
  };

  const addCustomColor = (hex: string) => {
    if (customColors.length >= 8) return;
    const next = [...customColors, hex];
    onChangeCustomColors(next);
    onSelectSkin('custom');
  };

  const removeCustomColor = (index: number) => {
    if (customColors.length <= 1) return;
    const next = customColors.filter((_, i) => i !== index);
    onChangeCustomColors(next);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Choose snake skin"
    >
      <div className="w-full max-w-xl bg-[#151c24] border border-slate-700/70 rounded-2xl shadow-2xl p-6 text-slate-100">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-white">
              Snake Skins
            </h2>
            <p className="text-sm text-slate-400">
              Pick a classic arena pattern or build your own stripe sequence
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors focus-visible:outline-2 focus-visible:outline-emerald-400"
            aria-label="Close skin selector"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Animated Preview Strip */}
        <div className="flex items-center justify-between gap-2 bg-[#0f141a] border border-slate-800 rounded-xl px-3 py-3 mb-5">
          <button
            type="button"
            onClick={() => cycleSkin(-1)}
            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
            aria-label="Previous skin"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="flex flex-col items-center flex-1 min-w-0">
            <SkinPreviewCanvas skinId={skinId} customColors={customColors} width={310} height={68} />
            <span className="text-sm font-semibold text-slate-200 mt-1">{activeSkin.name}</span>
          </div>
          <button
            type="button"
            onClick={() => cycleSkin(1)}
            className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors shrink-0"
            aria-label="Next skin"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Preset Grid */}
        <div className="grid grid-cols-4 gap-2 mb-5 max-h-52 overflow-y-auto pr-1">
          {SKINS.map((s) => {
            const selected = skinId === s.id;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => onSelectSkin(s.id)}
                className={`flex flex-col items-center gap-1.5 p-2.5 rounded-xl border transition-all text-left focus-visible:outline-2 focus-visible:outline-emerald-400 ${
                  selected
                    ? 'bg-emerald-500/15 border-emerald-400 text-white'
                    : 'bg-[#10161d] border-slate-800 hover:border-slate-600 text-slate-300'
                }`}
              >
                <div className="flex items-center -space-x-1.5">
                  {s.colors.slice(0, 4).map((c, idx) => (
                    <span
                      key={idx}
                      className="w-4 h-4 rounded-full border border-slate-950/60"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <span className="text-xs font-medium truncate w-full text-center">{s.name}</span>
              </button>
            );
          })}
        </div>

        {/* Custom Skin Builder */}
        <div className="border-t border-slate-800 pt-4">
          <div className="flex items-center justify-between mb-2.5">
            <span className="text-sm font-semibold text-slate-200">
              Custom Stripe Builder
            </span>
            <button
              type="button"
              onClick={() => onSelectSkin('custom')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                skinId === 'custom'
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
              }`}
            >
              {skinId === 'custom' ? 'Using Custom' : 'Use Custom'}
            </button>
          </div>

          <div className="flex items-center gap-2 mb-3 min-h-[36px] flex-wrap">
            {customColors.map((hex, i) => (
              <button
                key={`${hex}_${i}`}
                type="button"
                onClick={() => removeCustomColor(i)}
                title="Click to remove segment color"
                className="group relative w-8 h-8 rounded-full border-2 border-slate-700 hover:border-rose-400 transition-transform hover:scale-105 flex items-center justify-center"
                style={{ backgroundColor: hex }}
              >
                {customColors.length > 1 && (
                  <Trash2 className="w-3.5 h-3.5 text-slate-950/80 opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
              </button>
            ))}
            {customColors.length < 8 && (
              <span className="text-xs text-slate-400 flex items-center gap-1 ml-1">
                <Plus className="w-3.5 h-3.5" /> Add up to {8 - customColors.length} more
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {CUSTOM_SWATCHES.map((swatch) => (
              <button
                key={swatch}
                type="button"
                onClick={() => addCustomColor(swatch)}
                disabled={customColors.length >= 8}
                className="w-7 h-7 rounded-full border border-slate-700 hover:scale-110 transition-transform disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-emerald-400"
                style={{ backgroundColor: swatch }}
                aria-label={`Add color ${swatch}`}
              />
            ))}
          </div>
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm transition-colors whitespace-nowrap shrink-0"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
