import {
  WORLD_RADIUS,
  getSkinById,
  type SerializedFood,
  type SerializedSnake,
} from '../shared/types';

export interface RenderSnapshot {
  receivedAt: number;
  camX: number;
  camY: number;
  zoom: number;
  selfId: string | null;
  leaderId: string | null;
  snakes: Map<string, SerializedSnake>;
  foods: SerializedFood[];
}

interface SparkParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  radius: number;
  life: number;
  maxLife: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  let diff = (b - a) % (Math.PI * 2);
  if (diff > Math.PI) diff -= Math.PI * 2;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}

function shadeHex(hex: string, percent: number): string {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  const r = Math.min(255, Math.max(0, ((num >> 16) & 0xff) + percent));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0xff) + percent));
  const b = Math.min(255, Math.max(0, (num & 0xff) + percent));
  return `rgb(${r}, ${g}, ${b})`;
}

export class SlitherRenderer {
  private hexTileCanvas: HTMLCanvasElement;
  private orbCache = new Map<string, HTMLCanvasElement>();
  private segCache = new Map<string, HTMLCanvasElement>();
  private particles: SparkParticle[] = [];

  private camX = 0;
  private camY = 0;
  private camZoom = 0.9;
  private camInitialized = false;

  constructor() {
    this.hexTileCanvas = this.createHexTile();
  }

  /**
   * Builds an authentic Slither.io dark beveled hexagonal background tile.
   */
  private createHexTile(): HTMLCanvasElement {
    const r = 34; // hex circumradius
    const dx = r * 1.5;
    const dy = r * Math.sqrt(3);
    const tileW = Math.round(dx * 2);
    const tileH = Math.round(dy);

    const canvas = document.createElement('canvas');
    canvas.width = tileW;
    canvas.height = tileH;
    const ctx = canvas.getContext('2d')!;

    ctx.fillStyle = '#0f141a';
    ctx.fillRect(0, 0, tileW, tileH);

    const drawHex = (cx: number, cy: number) => {
      const innerR = r - 3.2;
      ctx.beginPath();
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i;
        const x = cx + Math.cos(angle) * innerR;
        const y = cy + Math.sin(angle) * innerR;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();

      const grad = ctx.createLinearGradient(cx - innerR, cy - innerR, cx + innerR, cy + innerR);
      grad.addColorStop(0, '#1e2731');
      grad.addColorStop(0.55, '#171f27');
      grad.addColorStop(1, '#131a21');
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.035)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    };

    const centers = [
      [0, 0],
      [tileW, 0],
      [0, tileH],
      [tileW, tileH],
      [dx, dy / 2],
      [dx, -dy / 2],
      [dx, dy * 1.5],
      [tileW / 2, tileH / 2],
    ];

    // Exact seamless grid centers
    drawHex(0, 0);
    drawHex(tileW, 0);
    drawHex(0, tileH);
    drawHex(tileW, tileH);
    drawHex(dx, dy * 0.5);
    drawHex(-dx, dy * 0.5);
    drawHex(tileW + dx, dy * 0.5);

    void centers;
    return canvas;
  }

  private getOrbSprite(color: string, isDeathDrop: boolean): HTMLCanvasElement {
    const key = `${color}_${isDeathDrop ? 'd' : 'a'}`;
    const cached = this.orbCache.get(key);
    if (cached) return cached;

    const size = isDeathDrop ? 52 : 34;
    const half = size / 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    const grad = ctx.createRadialGradient(half, half, 1, half, half, half);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(isDeathDrop ? 0.28 : 0.22, color);
    grad.addColorStop(0.58, `${color}66`);
    grad.addColorStop(1, `${color}00`);

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(half, half, half, 0, Math.PI * 2);
    ctx.fill();

    this.orbCache.set(key, canvas);
    return canvas;
  }

  private getSegmentSprite(color: string): HTMLCanvasElement {
    const cached = this.segCache.get(color);
    if (cached) return cached;

    const size = 64;
    const half = size / 2;
    const r = 28;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Subtle dark outer contour + plush 3D radial shading like authentic Slither.io
    const grad = ctx.createRadialGradient(half - r * 0.25, half - r * 0.28, r * 0.08, half, half, r);
    grad.addColorStop(0, shadeHex(color, 44));
    grad.addColorStop(0.55, color);
    grad.addColorStop(0.88, shadeHex(color, -32));
    grad.addColorStop(1, shadeHex(color, -55));

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(half, half, r, 0, Math.PI * 2);
    ctx.fill();

    this.segCache.set(color, canvas);
    return canvas;
  }

  spawnEatSpark(x: number, y: number, color: string, count = 4): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 55 + Math.random() * 115;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        color,
        radius: 2.2 + Math.random() * 2.5,
        life: 0.28 + Math.random() * 0.2,
        maxLife: 0.45,
      });
    }
  }

  render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    prevSnap: RenderSnapshot | null,
    currSnap: RenderSnapshot | null,
    nowMs: number,
    dtSec: number
  ): void {
    const timeSec = nowMs * 0.001;

    if (!currSnap) {
      ctx.fillStyle = '#11161c';
      ctx.fillRect(0, 0, width, height);
      this.drawHexBackground(ctx, width, height, timeSec * 45, timeSec * 25, 0.9);
      return;
    }

    // Interpolation factor between previous 30Hz snapshot and current snapshot
    const snapInterval = prevSnap ? Math.max(16, Math.min(80, currSnap.receivedAt - prevSnap.receivedAt)) : 33;
    const rawAlpha = Math.min(1.15, Math.max(0, (nowMs - currSnap.receivedAt) / snapInterval));
    const alpha = Math.min(1, rawAlpha);

    const targetCamX = prevSnap ? lerp(prevSnap.camX, currSnap.camX, alpha) : currSnap.camX;
    const targetCamY = prevSnap ? lerp(prevSnap.camY, currSnap.camY, alpha) : currSnap.camY;
    const targetZoom = currSnap.zoom;

    if (!this.camInitialized) {
      this.camX = targetCamX;
      this.camY = targetCamY;
      this.camZoom = targetZoom;
      this.camInitialized = true;
    } else {
      const camFollow = Math.min(1, dtSec * 14);
      this.camX = lerp(this.camX, targetCamX, camFollow);
      this.camY = lerp(this.camY, targetCamY, camFollow);
      this.camZoom = lerp(this.camZoom, targetZoom, Math.min(1, dtSec * 3.5));
    }

    // Scale zoom slightly for viewport size so 1440p and 900p feel balanced
    const viewportScale = Math.max(0.72, Math.min(1.18, Math.min(width / 1280, height / 760)));
    const effectiveZoom = this.camZoom * viewportScale;

    // 1. Background tiled hex grid
    this.drawHexBackground(ctx, width, height, this.camX, this.camY, effectiveZoom);

    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.scale(effectiveZoom, effectiveZoom);
    ctx.translate(-this.camX, -this.camY);

    // 2. Arena void outside circular boundary + glowing crimson barrier
    this.drawArenaBoundary(ctx, timeSec);

    // 3. Glowing pellets (food + death loot)
    this.drawFoods(ctx, currSnap.foods, timeSec);

    // 4. Snakes (render others first, then self on top)
    const snakesArr = Array.from(currSnap.snakes.values());
    snakesArr.sort((a, b) => {
      if (a.id === currSnap.selfId) return 1;
      if (b.id === currSnap.selfId) return -1;
      return a.length - b.length;
    });

    for (const snake of snakesArr) {
      const prevSnake = prevSnap?.snakes.get(snake.id) ?? null;
      this.drawSnake(
        ctx,
        snake,
        prevSnake,
        alpha,
        timeSec,
        snake.id === currSnap.selfId,
        snake.id === currSnap.leaderId
      );
    }

    // 5. Micro particles
    this.updateAndDrawParticles(ctx, dtSec);

    // 6. Floating nameplates on top of all snake bodies
    for (const snake of snakesArr) {
      if (snake.id === currSnap.selfId) continue;
      const prevSnake = prevSnap?.snakes.get(snake.id) ?? null;
      this.drawNameplate(ctx, snake, prevSnake, alpha, snake.id === currSnap.leaderId);
    }

    ctx.restore();

    // 7. Subtle red edge danger vignette when near arena wall
    const distFromCenter = Math.hypot(this.camX, this.camY);
    if (distFromCenter > WORLD_RADIUS - 420) {
      const intensity = Math.min(0.45, ((distFromCenter - (WORLD_RADIUS - 420)) / 420) * 0.45);
      const vig = ctx.createRadialGradient(
        width / 2,
        height / 2,
        Math.min(width, height) * 0.3,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.72
      );
      vig.addColorStop(0, 'rgba(220, 38, 38, 0)');
      vig.addColorStop(1, `rgba(220, 38, 38, ${intensity.toFixed(3)})`);
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, width, height);
    }
  }

  private drawHexBackground(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    camX: number,
    camY: number,
    zoom: number
  ): void {
    const pattern = ctx.createPattern(this.hexTileCanvas, 'repeat');
    if (!pattern) return;

    ctx.save();
    ctx.fillStyle = '#0f141a';
    ctx.fillRect(0, 0, width, height);

    ctx.translate(width / 2, height / 2);
    ctx.scale(zoom, zoom);
    ctx.translate(-camX, -camY);

    const viewW = width / zoom + 200;
    const viewH = height / zoom + 200;
    ctx.fillStyle = pattern;
    ctx.fillRect(camX - viewW / 2, camY - viewH / 2, viewW, viewH);
    ctx.restore();
  }

  private drawArenaBoundary(ctx: CanvasRenderingContext2D, timeSec: number): void {
    // Dark crimson out-of-bounds mask around the circular world
    ctx.save();
    ctx.beginPath();
    ctx.rect(-WORLD_RADIUS - 2200, -WORLD_RADIUS - 2200, (WORLD_RADIUS + 2200) * 2, (WORLD_RADIUS + 2200) * 2);
    ctx.arc(0, 0, WORLD_RADIUS, 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(34, 8, 13, 0.78)';
    ctx.fill();

    // Glowing outer hazard ring
    const pulse = 0.75 + Math.sin(timeSec * 3.2) * 0.25;
    ctx.beginPath();
    ctx.arc(0, 0, WORLD_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(239, 68, 68, ${(0.35 + pulse * 0.25).toFixed(2)})`;
    ctx.lineWidth = 24;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(0, 0, WORLD_RADIUS, 0, Math.PI * 2);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 6;
    ctx.stroke();

    // Inner subtle caution dash ring
    ctx.beginPath();
    ctx.setLineDash([22, 18]);
    ctx.arc(0, 0, WORLD_RADIUS - 18, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(248, 113, 113, 0.28)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  private drawFoods(ctx: CanvasRenderingContext2D, foods: SerializedFood[], timeSec: number): void {
    for (let i = 0; i < foods.length; i++) {
      const f = foods[i];
      const isDeath = f.d === 1;
      const pulse = 1 + Math.sin(timeSec * (isDeath ? 6.5 : 3.2) + f.p) * (isDeath ? 0.16 : 0.1);
      const drawSize = f.r * (isDeath ? 4.2 : 3.7) * pulse;
      const sprite = this.getOrbSprite(f.c, isDeath);
      ctx.drawImage(sprite, f.x - drawSize / 2, f.y - drawSize / 2, drawSize, drawSize);
    }
  }

  private drawSnake(
    ctx: CanvasRenderingContext2D,
    snake: SerializedSnake,
    prev: SerializedSnake | null,
    alpha: number,
    timeSec: number,
    isSelf: boolean,
    isLeader: boolean
  ): void {
    const pts = snake.pts;
    const count = pts.length / 2;
    if (count < 2) return;

    const skin = getSkinById(snake.skinId, snake.customColors);
    const radius = prev ? lerp(prev.radius, snake.radius, alpha) : snake.radius;
    const prevPts = prev ? prev.pts : null;
    const prevCount = prevPts ? prevPts.length / 2 : 0;

    // Build interpolated segment coordinates
    const interpX = new Float32Array(count);
    const interpY = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const cx = pts[i * 2];
      const cy = pts[i * 2 + 1];
      if (prevPts && i < prevCount) {
        interpX[i] = lerp(prevPts[i * 2], cx, alpha);
        interpY[i] = lerp(prevPts[i * 2 + 1], cy, alpha);
      } else {
        interpX[i] = cx;
        interpY[i] = cy;
      }
    }

    ctx.save();

    if (snake.spawnShield) {
      ctx.globalAlpha = 0.62 + Math.sin(timeSec * 16) * 0.22;
    }

    // 1. Soft grounding drop shadow underneath spine
    ctx.beginPath();
    ctx.moveTo(interpX[0], interpY[0] + 5);
    for (let i = 1; i < count; i += 2) {
      ctx.lineTo(interpX[i], interpY[i] + 5);
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.32)';
    ctx.lineWidth = radius * 2.1;
    ctx.stroke();

    // 2. Signature Slither.io Boost Aura Wave
    if (snake.boosting) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = count - 1; i >= 0; i -= 2) {
        const wave = 0.5 + 0.5 * Math.sin(i * 0.42 - timeSec * 16);
        const auraR = radius * (1.42 + wave * 0.34);
        ctx.fillStyle = `${skin.glowColor}${Math.round((0.1 + wave * 0.14) * 255)
          .toString(16)
          .padStart(2, '0')}`;
        ctx.beginPath();
        ctx.arc(interpX[i], interpY[i], auraR, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    // 3. Draw overlapping shaded body segments from tail to head
    const stripeLen = Math.max(1, skin.stripeLength);
    const colorsLen = skin.colors.length;
    for (let i = count - 1; i >= 0; i--) {
      const colorIdx = Math.floor(i / stripeLen) % colorsLen;
      const color = skin.colors[colorIdx];
      const sprite = this.getSegmentSprite(color);

      // Gentle tail taper on the final 5 segments
      let segR = radius;
      const fromTail = count - 1 - i;
      if (fromTail < 5) {
        segR = radius * (0.62 + (fromTail / 5) * 0.38);
      }

      const drawDiam = segR * 2.18;
      ctx.drawImage(sprite, interpX[i] - drawDiam / 2, interpY[i] - drawDiam / 2, drawDiam, drawDiam);

      // Travelling bright pulse highlight inside segments while boosting
      if (snake.boosting) {
        const wave = Math.sin(i * 0.45 - timeSec * 18);
        if (wave > 0.35) {
          ctx.fillStyle = `rgba(255, 255, 255, ${((wave - 0.35) * 0.38).toFixed(2)})`;
          ctx.beginPath();
          ctx.arc(interpX[i], interpY[i], segR * 0.92, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }

    // 4. Expressive tracking eyes on the head
    const headX = interpX[0];
    const headY = interpY[0];
    const headAngle = prev ? lerpAngle(prev.angle, snake.angle, alpha) : snake.angle;
    const lookAngle = prev ? lerpAngle(prev.targetAngle, snake.targetAngle, alpha) : snake.targetAngle;

    const eyeForward = radius * 0.42;
    const eyeSpread = radius * 0.46;
    const eyeRadius = radius * 0.34;
    const pupilRadius = eyeRadius * 0.56;
    const pupilOffset = eyeRadius * 0.34;

    const perpX = -Math.sin(headAngle);
    const perpY = Math.cos(headAngle);
    const fwdX = Math.cos(headAngle);
    const fwdY = Math.sin(headAngle);

    const lookDx = Math.cos(lookAngle) * pupilOffset;
    const lookDy = Math.sin(lookAngle) * pupilOffset;

    for (const side of [-1, 1]) {
      const ex = headX + fwdX * eyeForward + perpX * eyeSpread * side;
      const ey = headY + fwdY * eyeForward + perpY * eyeSpread * side;

      // Sclera
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ex, ey, eyeRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(15, 23, 42, 0.25)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Pupil tracking steering angle
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(ex + lookDx, ey + lookDy, pupilRadius, 0, Math.PI * 2);
      ctx.fill();

      // Tiny specular eye glint
      ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.beginPath();
      ctx.arc(ex + lookDx - pupilRadius * 0.28, ey + lookDy - pupilRadius * 0.28, pupilRadius * 0.28, 0, Math.PI * 2);
      ctx.fill();
    }

    // 5. Golden Crown above the #1 leader snake
    if (isLeader) {
      ctx.save();
      ctx.translate(headX, headY - radius - 16);
      ctx.fillStyle = '#facc15';
      ctx.strokeStyle = '#854d0e';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(-10, 5);
      ctx.lineTo(-12, -5);
      ctx.lineTo(-5, -1);
      ctx.lineTo(0, -9);
      ctx.lineTo(5, -1);
      ctx.lineTo(12, -5);
      ctx.lineTo(10, 5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    // Subtle spawn shield ring for player feedback
    if (snake.spawnShield && isSelf) {
      ctx.beginPath();
      ctx.arc(headX, headY, radius * 1.65, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(125, 211, 252, 0.65)';
      ctx.lineWidth = 2.5;
      ctx.stroke();
    }

    ctx.restore();
  }

  private drawNameplate(
    ctx: CanvasRenderingContext2D,
    snake: SerializedSnake,
    prev: SerializedSnake | null,
    alpha: number,
    isLeader: boolean
  ): void {
    const pts = snake.pts;
    if (pts.length < 2) return;
    const x = prev && prev.pts.length >= 2 ? lerp(prev.pts[0], pts[0], alpha) : pts[0];
    const y = prev && prev.pts.length >= 2 ? lerp(prev.pts[1], pts[1], alpha) : pts[1];
    const yOffset = snake.radius + (isLeader ? 32 : 18);

    ctx.save();
    ctx.font = '600 13px "Plus Jakarta Sans", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const label = !snake.isBot ? `★ ${snake.name}` : snake.name;
    ctx.lineWidth = 3.2;
    ctx.strokeStyle = 'rgba(10, 14, 20, 0.85)';
    ctx.strokeText(label, x, y - yOffset);
    ctx.fillStyle = !snake.isBot ? '#7dd3fc' : 'rgba(241, 245, 249, 0.88)';
    ctx.fillText(label, x, y - yOffset);
    ctx.restore();
  }

  private updateAndDrawParticles(ctx: CanvasRenderingContext2D, dtSec: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dtSec;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      p.vx *= 0.92;
      p.vy *= 0.92;
      const a = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * a, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}
