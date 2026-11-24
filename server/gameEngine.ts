import type { WebSocket } from 'ws';
import {
  DEFAULT_BOT_COUNT,
  MAX_FOOD_COUNT,
  MAX_HUMANS_PER_ROOM,
  SKINS,
  TICK_RATE,
  WORLD_RADIUS,
  getSkinById,
  type DeathStats,
  type KillEvent,
  type LeaderboardEntry,
  type MinimapDot,
  type Point,
  type RoomSummary,
  type SerializedFood,
  type SerializedSnake,
  type ServerMessage,
} from '../src/shared/types.ts';

const BOT_NAMES = [
  'NoodleKing',
  'ViperStrike',
  'Slinky',
  'CoilMaster',
  'HyperFang',
  'Mamba',
  'Sidewinder',
  'ZigZag',
  'OrbHunter',
  'CobraKai',
  'Pythonic',
  'LazerTail',
  'ApexWorm',
  'NeonBoa',
  'Rattler',
  'Ouroboros',
  'Slippery',
  'TurboSnek',
  'VenomX',
  'Chomper',
  'Starlight',
  'Wiggler',
  'Dasher',
  'Krait',
  'Hydra',
  'Goliath',
  'Basilisk',
  'Sparky',
  'Quicksilver',
  'Tangle',
  'LoopDeLoop',
  'Jormungandr',
];

const FOOD_PALETTE = [
  '#f87171',
  '#fb923c',
  '#facc15',
  '#4ade80',
  '#34d399',
  '#22d3ee',
  '#60a5fa',
  '#a78bfa',
  '#f472b6',
  '#fde047',
];

type BotPersonality = 'hunter' | 'scavenger' | 'cautious' | 'greedy';

interface FoodItem {
  id: number;
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  value: number;
  radius: number;
  color: string;
  phase: number;
  isDeathDrop: boolean;
  createdAt: number;
  magnetSnakeId: string | null;
}

interface SnakeEntity {
  id: string;
  clientId: string | null;
  name: string;
  isBot: boolean;
  skinId: string;
  customColors?: string[];
  angle: number;
  targetAngle: number;
  mass: number;
  radius: number;
  boosting: boolean;
  boostDropAccum: number;
  segments: Point[];
  prevHeadX: number;
  prevHeadY: number;
  alive: boolean;
  spawnTime: number;
  kills: number;
  bestRank: number;
  ateMassThisTick: number;
  gotKillThisTick: boolean;
  // Bot AI fields
  personality: BotPersonality;
  aiWanderAngle: number;
  aiTimer: number;
  aiBoostTimer: number;
  aiReactTimer: number;
}

export interface ConnectedClient {
  id: string;
  ws: WebSocket;
  roomCode: string | null;
  snakeId: string | null;
  spectateX: number;
  spectateY: number;
  lastDeathCamX: number;
  lastDeathCamY: number;
  spectateAngle: number;
}

const GRID_CELL = 160;

function cellKey(cx: number, cy: number): number {
  // Pack signed cell coords cleanly into a single integer key
  return ((cx + 500) << 12) | (cy + 500);
}

function normalizeAngle(a: number): number {
  let res = a % (Math.PI * 2);
  if (res > Math.PI) res -= Math.PI * 2;
  if (res < -Math.PI) res += Math.PI * 2;
  return res;
}

function lerpAngle(current: number, target: number, maxStep: number): number {
  const diff = normalizeAngle(target - current);
  if (Math.abs(diff) <= maxStep) return target;
  return normalizeAngle(current + Math.sign(diff) * maxStep);
}

function computeRadius(mass: number): number {
  return 12 + Math.min(20, Math.pow(Math.max(0, mass - 10), 0.44) * 1.15);
}

function computeTargetSegments(mass: number): number {
  return Math.min(220, Math.floor(14 + Math.pow(mass, 0.7) * 2.8));
}

function computeSegmentSpacing(radius: number, mass: number): number {
  const base = radius * 0.44;
  // When mass grows past segment cap, gradually increase spacing so body still lengthens visibly
  const extra = mass > 450 ? Math.min(8, Math.pow(mass - 450, 0.35) * 0.45) : 0;
  return base + extra;
}

function computeZoom(radius: number): number {
  return Math.max(0.56, Math.min(1.04, 1.08 - (radius - 12) * 0.022));
}

function randomRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export class GameRoom {
  readonly code: string;
  readonly isPrivate: boolean;
  readonly targetBotCount: number;
  readonly clients = new Map<string, ConnectedClient>();
  readonly snakes = new Map<string, SnakeEntity>();
  readonly foods = new Map<number, FoodItem>();
  readonly killFeed: KillEvent[] = [];

  private nextFoodId = 1;
  private nextEntityId = 1;
  private tick = 0;
  private lastActivity = Date.now();
  private botRespawnCooldowns: number[] = [];

  // Spatial hashes rebuilt each tick for O(1) collision & AI queries
  private foodGrid = new Map<number, FoodItem[]>();
  private segGrid = new Map<number, Array<{ snake: SnakeEntity; segIdx: number; x: number; y: number }>>();

  constructor(code: string, isPrivate: boolean, botCount = DEFAULT_BOT_COUNT) {
    this.code = code;
    this.isPrivate = isPrivate;
    this.targetBotCount = Math.max(0, Math.min(34, Math.floor(botCount)));

    // Populate initial ambient pellets
    for (let i = 0; i < MAX_FOOD_COUNT; i++) {
      this.spawnAmbientFood();
    }

    // Spawn initial bots with varied starting sizes for an immediately lively arena
    for (let i = 0; i < this.targetBotCount; i++) {
      const starterMass =
        i < 3 ? 110 + Math.random() * 240 : i < 8 ? 35 + Math.random() * 80 : 10 + Math.random() * 28;
      this.spawnBot(starterMass);
    }
  }

  get humanCount(): number {
    return this.clients.size;
  }

  get isEmptyAndStale(): boolean {
    return this.clients.size === 0 && Date.now() - this.lastActivity > 60_000;
  }

  touch(): void {
    this.lastActivity = Date.now();
  }

  getSummary(): RoomSummary {
    let bots = 0;
    for (const s of this.snakes.values()) {
      if (s.isBot && s.alive) bots++;
    }
    return {
      code: this.code,
      humans: this.clients.size,
      maxHumans: MAX_HUMANS_PER_ROOM,
      bots,
      isPrivate: this.isPrivate,
    };
  }

  addClient(client: ConnectedClient): boolean {
    if (this.clients.size >= MAX_HUMANS_PER_ROOM) {
      return false;
    }
    client.roomCode = this.code;
    client.snakeId = null;
    client.spectateX = (Math.random() - 0.5) * 800;
    client.spectateY = (Math.random() - 0.5) * 800;
    client.spectateAngle = Math.random() * Math.PI * 2;
    this.clients.set(client.id, client);
    this.touch();
    return true;
  }

  removeClient(clientId: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;
    if (client.snakeId) {
      const snake = this.snakes.get(client.snakeId);
      if (snake && snake.alive) {
        this.killSnake(snake, null, 'Disconnected');
      }
    }
    this.clients.delete(clientId);
    this.touch();
  }

  spawnHuman(clientId: string, rawName: string, skinId: string, customColors?: string[]): SnakeEntity | null {
    const client = this.clients.get(clientId);
    if (!client) return null;

    // Remove previous snake if still registered
    if (client.snakeId) {
      this.snakes.delete(client.snakeId);
      client.snakeId = null;
    }

    const cleanName = (rawName || '').trim().slice(0, 16) || 'Slitherer';
    const validCustom =
      skinId === 'custom' && Array.isArray(customColors)
        ? customColors.filter((c) => typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c)).slice(0, 8)
        : undefined;
    const validSkinId = skinId === 'custom' && validCustom && validCustom.length > 0
      ? 'custom'
      : SKINS.some((s) => s.id === skinId)
        ? skinId
        : SKINS[0].id;

    const pos = this.findSafeSpawnPosition();
    const angle = Math.random() * Math.PI * 2;
    const snake = this.createSnakeEntity({
      clientId,
      name: cleanName,
      isBot: false,
      skinId: validSkinId,
      customColors: validCustom,
      x: pos.x,
      y: pos.y,
      angle,
      initialMass: 10,
    });

    this.snakes.set(snake.id, snake);
    client.snakeId = snake.id;
    this.touch();
    return snake;
  }

  handleInput(clientId: string, angle: number, boosting: boolean): void {
    const client = this.clients.get(clientId);
    if (!client || !client.snakeId) return;
    const snake = this.snakes.get(client.snakeId);
    if (!snake || !snake.alive) return;
    if (Number.isFinite(angle)) {
      snake.targetAngle = normalizeAngle(angle);
    }
    snake.boosting = Boolean(boosting);
  }

  private createSnakeEntity(opts: {
    clientId: string | null;
    name: string;
    isBot: boolean;
    skinId: string;
    customColors?: string[];
    x: number;
    y: number;
    angle: number;
    initialMass: number;
  }): SnakeEntity {
    const id = `s_${this.nextEntityId++}`;
    const radius = computeRadius(opts.initialMass);
    const segCount = computeTargetSegments(opts.initialMass);
    const spacing = computeSegmentSpacing(radius, opts.initialMass);
    const segments: Point[] = [];
    for (let i = 0; i < segCount; i++) {
      segments.push({
        x: opts.x - Math.cos(opts.angle) * spacing * i,
        y: opts.y - Math.sin(opts.angle) * spacing * i,
      });
    }

    const personalities: BotPersonality[] = ['hunter', 'scavenger', 'cautious', 'greedy'];
    return {
      id,
      clientId: opts.clientId,
      name: opts.name,
      isBot: opts.isBot,
      skinId: opts.skinId,
      customColors: opts.customColors,
      angle: opts.angle,
      targetAngle: opts.angle,
      mass: opts.initialMass,
      radius,
      boosting: false,
      boostDropAccum: 0,
      segments,
      prevHeadX: opts.x,
      prevHeadY: opts.y,
      alive: true,
      spawnTime: Date.now(),
      kills: 0,
      bestRank: 99,
      ateMassThisTick: 0,
      gotKillThisTick: false,
      personality: personalities[Math.floor(Math.random() * personalities.length)],
      aiWanderAngle: opts.angle,
      aiTimer: 0.4 + Math.random() * 1.4,
      aiBoostTimer: 0,
      aiReactTimer: Math.random() * 0.2,
    };
  }

  private findSafeSpawnPosition(): Point {
    let best: Point = { x: 0, y: 0 };
    let bestDistSq = -1;

    for (let attempt = 0; attempt < 18; attempt++) {
      const r = Math.sqrt(Math.random()) * (WORLD_RADIUS - 520);
      const theta = Math.random() * Math.PI * 2;
      const x = Math.cos(theta) * r;
      const y = Math.sin(theta) * r;

      let minDistSq = Infinity;
      for (const s of this.snakes.values()) {
        if (!s.alive) continue;
        // Sample every 4th segment for fast distance estimate
        for (let i = 0; i < s.segments.length; i += 4) {
          const dx = s.segments[i].x - x;
          const dy = s.segments[i].y - y;
          const dSq = dx * dx + dy * dy;
          if (dSq < minDistSq) minDistSq = dSq;
        }
      }

      if (minDistSq > bestDistSq) {
        bestDistSq = minDistSq;
        best = { x, y };
      }
      if (minDistSq > 420 * 420) break;
    }

    return best;
  }

  private spawnBot(initialMass?: number): void {
    const pos = this.findSafeSpawnPosition();
    const angle = Math.random() * Math.PI * 2;
    const usedNames = new Set<string>();
    for (const s of this.snakes.values()) usedNames.add(s.name);
    const available = BOT_NAMES.filter((n) => !usedNames.has(n));
    const name =
      available.length > 0
        ? available[Math.floor(Math.random() * available.length)]
        : `Bot_${Math.floor(100 + Math.random() * 899)}`;

    const skin = SKINS[Math.floor(Math.random() * SKINS.length)];
    const mass = initialMass ?? 10 + Math.random() * 24;
    const bot = this.createSnakeEntity({
      clientId: null,
      name,
      isBot: true,
      skinId: skin.id,
      x: pos.x,
      y: pos.y,
      angle,
      initialMass: mass,
    });
    this.snakes.set(bot.id, bot);
  }

  private spawnAmbientFood(): void {
    const r = Math.sqrt(Math.random()) * (WORLD_RADIUS - 90);
    const theta = Math.random() * Math.PI * 2;
    const x = Math.cos(theta) * r;
    const y = Math.sin(theta) * r;
    const isLarge = Math.random() < 0.14;
    const value = isLarge ? 2.2 : 1.0 + Math.random() * 0.6;
    const id = this.nextFoodId++;
    this.foods.set(id, {
      id,
      x,
      y,
      baseX: x,
      baseY: y,
      value,
      radius: isLarge ? 7.8 : 4.6 + Math.random() * 1.9,
      color: FOOD_PALETTE[Math.floor(Math.random() * FOOD_PALETTE.length)],
      phase: Math.random() * Math.PI * 2,
      isDeathDrop: false,
      createdAt: Date.now(),
      magnetSnakeId: null,
    });
  }

  private spawnDropFood(x: number, y: number, value: number, color: string, isDeathDrop: boolean): void {
    // Keep inside arena bounds
    const dist = Math.hypot(x, y);
    let fx = x;
    let fy = y;
    if (dist > WORLD_RADIUS - 50) {
      const scale = (WORLD_RADIUS - 50) / dist;
      fx *= scale;
      fy *= scale;
    }
    const id = this.nextFoodId++;
    const radius = isDeathDrop
      ? Math.min(14, 7.5 + Math.sqrt(value) * 1.7)
      : 5.2;
    this.foods.set(id, {
      id,
      x: fx,
      y: fy,
      baseX: fx,
      baseY: fy,
      value,
      radius,
      color,
      phase: Math.random() * Math.PI * 2,
      isDeathDrop,
      createdAt: Date.now(),
      magnetSnakeId: null,
    });
  }

  private rebuildSpatialGrids(): void {
    this.foodGrid.clear();
    for (const f of this.foods.values()) {
      const cx = Math.floor(f.x / GRID_CELL);
      const cy = Math.floor(f.y / GRID_CELL);
      const key = cellKey(cx, cy);
      let bucket = this.foodGrid.get(key);
      if (!bucket) {
        bucket = [];
        this.foodGrid.set(key, bucket);
      }
      bucket.push(f);
    }

    this.segGrid.clear();
    for (const snake of this.snakes.values()) {
      if (!snake.alive) continue;
      for (let i = 0; i < snake.segments.length; i++) {
        const seg = snake.segments[i];
        const cx = Math.floor(seg.x / GRID_CELL);
        const cy = Math.floor(seg.y / GRID_CELL);
        const key = cellKey(cx, cy);
        let bucket = this.segGrid.get(key);
        if (!bucket) {
          bucket = [];
          this.segGrid.set(key, bucket);
        }
        bucket.push({ snake, segIdx: i, x: seg.x, y: seg.y });
      }
    }
  }

  step(dt: number): void {
    this.tick++;
    const now = Date.now();

    // 1. Rebuild spatial hashes for AI, food, and collision
    this.rebuildSpatialGrids();

    // 2. Update Bot AI steering
    for (const snake of this.snakes.values()) {
      snake.ateMassThisTick = 0;
      snake.gotKillThisTick = false;
      if (snake.alive && snake.isBot) {
        this.updateBotAI(snake, dt);
      }
    }

    // 3. Move snakes, handle boost drain & trail drops
    for (const snake of this.snakes.values()) {
      if (!snake.alive) continue;

      const canBoost = snake.mass > 14;
      const isBoosting = snake.boosting && canBoost;
      snake.boosting = isBoosting;

      const turnRate = Math.max(2.6, 4.9 - (snake.radius - 12) * 0.11);
      snake.angle = lerpAngle(snake.angle, snake.targetAngle, turnRate * dt);

      const speed = isBoosting ? 395 : 215;
      const head = snake.segments[0];
      snake.prevHeadX = head.x;
      snake.prevHeadY = head.y;
      const nextHeadX = head.x + Math.cos(snake.angle) * speed * dt;
      const nextHeadY = head.y + Math.sin(snake.angle) * speed * dt;
      head.x = nextHeadX;
      head.y = nextHeadY;

      if (isBoosting) {
        const drain = 7.4 * dt;
        snake.mass = Math.max(10, snake.mass - drain);
        snake.boostDropAccum += drain;
        if (snake.boostDropAccum >= 1.55) {
          snake.boostDropAccum -= 1.55;
          const tail = snake.segments[snake.segments.length - 1];
          const skin = getSkinById(snake.skinId, snake.customColors);
          const dropColor = skin.colors[Math.floor(Math.random() * skin.colors.length)];
          this.spawnDropFood(
            tail.x + (Math.random() - 0.5) * 10,
            tail.y + (Math.random() - 0.5) * 10,
            1.4,
            dropColor,
            false
          );
        }
      }

      snake.radius = computeRadius(snake.mass);
      const spacing = computeSegmentSpacing(snake.radius, snake.mass);
      const targetSegs = computeTargetSegments(snake.mass);

      // Follow-the-leader constraint along spine
      for (let i = 1; i < snake.segments.length; i++) {
        const prev = snake.segments[i - 1];
        const curr = snake.segments[i];
        const dx = curr.x - prev.x;
        const dy = curr.y - prev.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.0001) {
          curr.x = prev.x + (dx / dist) * spacing;
          curr.y = prev.y + (dy / dist) * spacing;
        }
      }

      // Grow or shrink segment array smoothly
      while (snake.segments.length < targetSegs) {
        const tail = snake.segments[snake.segments.length - 1];
        snake.segments.push({ x: tail.x, y: tail.y });
      }
      if (snake.segments.length > targetSegs) {
        snake.segments.length = targetSegs;
      }
    }

    // 4. Food floating motion, magnet attraction, & eating
    for (const snake of this.snakes.values()) {
      if (!snake.alive) continue;
      const head = snake.segments[0];
      const magnetRange = snake.radius * 2.4 + 28;
      const eatRange = snake.radius + 11;
      const cx0 = Math.floor((head.x - magnetRange) / GRID_CELL);
      const cx1 = Math.floor((head.x + magnetRange) / GRID_CELL);
      const cy0 = Math.floor((head.y - magnetRange) / GRID_CELL);
      const cy1 = Math.floor((head.y + magnetRange) / GRID_CELL);

      for (let cx = cx0; cx <= cx1; cx++) {
        for (let cy = cy0; cy <= cy1; cy++) {
          const bucket = this.foodGrid.get(cellKey(cx, cy));
          if (!bucket) continue;
          for (const f of bucket) {
            if (!this.foods.has(f.id)) continue;
            const dx = head.x - f.x;
            const dy = head.y - f.y;
            const distSq = dx * dx + dy * dy;
            if (distSq <= eatRange * eatRange) {
              snake.mass += f.value;
              snake.ateMassThisTick += f.value;
              this.foods.delete(f.id);
            } else if (distSq <= magnetRange * magnetRange) {
              const dist = Math.sqrt(distSq);
              const pull = (520 * dt) * (1 - dist / magnetRange + 0.35);
              f.x += (dx / dist) * pull;
              f.y += (dy / dist) * pull;
              f.magnetSnakeId = snake.id;
            }
          }
        }
      }
    }

    // Gentle drift for ambient pellets & expire very old death-drops so arena stays clean
    const timeSec = now * 0.001;
    let ambientCount = 0;
    for (const f of this.foods.values()) {
      if (f.isDeathDrop) {
        if (now - f.createdAt > 42_000) {
          this.foods.delete(f.id);
        }
      } else {
        ambientCount++;
        if (!f.magnetSnakeId) {
          f.x = f.baseX + Math.cos(timeSec * 0.9 + f.phase) * 7;
          f.y = f.baseY + Math.sin(timeSec * 1.1 + f.phase * 1.3) * 7;
        } else {
          f.magnetSnakeId = null;
        }
      }
    }

    // Replenish ambient food
    const deficit = MAX_FOOD_COUNT - ambientCount;
    const toSpawn = Math.min(deficit, 12);
    for (let i = 0; i < toSpawn; i++) {
      this.spawnAmbientFood();
    }

    // 5. Collision detection (Arena wall + Snake bodies)
    this.rebuildSpatialGrids();
    const deaths: Array<{ victim: SnakeEntity; killer: SnakeEntity | null; reason: string }> = [];

    for (const snake of this.snakes.values()) {
      if (!snake.alive) continue;
      const head = snake.segments[0];

      // Arena circular boundary
      if (Math.hypot(head.x, head.y) + snake.radius * 0.85 >= WORLD_RADIUS) {
        deaths.push({ victim: snake, killer: null, reason: 'Arena Boundary' });
        continue;
      }

      // Brief spawn protection (1.0s) so newly spawned snakes don't die instantly
      if (now - snake.spawnTime < 1000) continue;

      const midX = (snake.prevHeadX + head.x) * 0.5;
      const midY = (snake.prevHeadY + head.y) * 0.5;
      const searchR = snake.radius + 52;
      const cx0 = Math.floor((head.x - searchR) / GRID_CELL);
      const cx1 = Math.floor((head.x + searchR) / GRID_CELL);
      const cy0 = Math.floor((head.y - searchR) / GRID_CELL);
      const cy1 = Math.floor((head.y + searchR) / GRID_CELL);

      let hitKiller: SnakeEntity | null = null;
      outer: for (let cx = cx0; cx <= cx1; cx++) {
        for (let cy = cy0; cy <= cy1; cy++) {
          const bucket = this.segGrid.get(cellKey(cx, cy));
          if (!bucket) continue;
          for (const entry of bucket) {
            const other = entry.snake;
            if (other.id === snake.id || !other.alive) continue;

            const isHeadHit = entry.segIdx === 0;
            const hitRadius = isHeadHit
              ? snake.radius * 0.78 + other.radius * 0.78
              : snake.radius * 0.85 + other.radius * 0.9;
            const hitRadSq = hitRadius * hitRadius;

            // Swept check against both current head and midpoint to prevent boost tunneling
            const dx1 = head.x - entry.x;
            const dy1 = head.y - entry.y;
            const dx2 = midX - entry.x;
            const dy2 = midY - entry.y;

            if (dx1 * dx1 + dy1 * dy1 < hitRadSq || dx2 * dx2 + dy2 * dy2 < hitRadSq) {
              if (isHeadHit) {
                const toOther = Math.atan2(entry.y - head.y, entry.x - head.x);
                const myAlignment = Math.abs(normalizeAngle(snake.angle - toOther));
                const toMe = Math.atan2(head.y - entry.y, head.x - entry.x);
                const otherAlignment = Math.abs(normalizeAngle(other.angle - toMe));
                // If the other snake is clearly ramming us more directly, they die instead
                if (myAlignment > otherAlignment + 0.25) {
                  continue;
                }
              }
              hitKiller = other;
              break outer;
            }
          }
        }
      }

      if (hitKiller) {
        deaths.push({ victim: snake, killer: hitKiller, reason: hitKiller.name });
      }
    }

    for (const d of deaths) {
      if (d.victim.alive) {
        this.killSnake(d.victim, d.killer, d.reason);
      }
    }

    // 6. Respawn bots smoothly to maintain target population
    let aliveBots = 0;
    for (const s of this.snakes.values()) {
      if (s.isBot && s.alive) aliveBots++;
    }
    while (aliveBots + this.botRespawnCooldowns.length < this.targetBotCount) {
      this.botRespawnCooldowns.push(now + 1200 + Math.random() * 2500);
    }
    this.botRespawnCooldowns = this.botRespawnCooldowns.filter((readyAt) => {
      if (now >= readyAt) {
        this.spawnBot();
        return false;
      }
      return true;
    });

    // Prune stale kill feed items older than 6s
    while (this.killFeed.length > 0 && now - this.killFeed[0].timestamp > 6000) {
      this.killFeed.shift();
    }

    // 7. Broadcast state snapshots to connected human clients
    this.broadcastSnapshots();
  }

  private killSnake(victim: SnakeEntity, killer: SnakeEntity | null, reason: string): void {
    victim.alive = false;
    this.snakes.delete(victim.id);

    // Convert victim's body into rich glowing death-drop orbs
    const skin = getSkinById(victim.skinId, victim.customColors);
    const totalDropMass = Math.max(8, victim.mass * 0.68);
    const orbCount = Math.min(75, Math.max(8, Math.floor(victim.segments.length * 0.55)));
    const valuePerOrb = Math.min(14, Math.max(2.5, totalDropMass / orbCount));

    for (let i = 0; i < orbCount; i++) {
      const segIdx = Math.min(
        victim.segments.length - 1,
        Math.floor((i / orbCount) * victim.segments.length)
      );
      const seg = victim.segments[segIdx];
      const scatter = victim.radius * 0.7;
      const color = skin.colors[i % skin.colors.length];
      this.spawnDropFood(
        seg.x + (Math.random() - 0.5) * scatter * 2,
        seg.y + (Math.random() - 0.5) * scatter * 2,
        valuePerOrb,
        color,
        true
      );
    }

    if (killer && killer.alive) {
      killer.kills++;
      killer.gotKillThisTick = true;
      this.killFeed.push({
        id: `k_${this.tick}_${victim.id}`,
        killerName: killer.name,
        victimName: victim.name,
        timestamp: Date.now(),
      });
      if (this.killFeed.length > 5) {
        this.killFeed.shift();
      }
    }

    if (victim.clientId) {
      const client = this.clients.get(victim.clientId);
      if (client) {
        const head = victim.segments[0];
        client.lastDeathCamX = head.x;
        client.lastDeathCamY = head.y;
        client.spectateX = head.x;
        client.spectateY = head.y;
        client.snakeId = null;

        const stats: DeathStats = {
          finalLength: Math.floor(victim.mass),
          kills: victim.kills,
          bestRank: victim.bestRank === 99 ? 1 : victim.bestRank,
          timeAliveSec: Math.max(1, Math.floor((Date.now() - victim.spawnTime) / 1000)),
          killedBy: reason,
        };
        this.sendToClient(client, { type: 'died', stats });
      }
    }
  }

  private updateBotAI(bot: SnakeEntity, dt: number): void {
    const head = bot.segments[0];
    bot.aiTimer -= dt;
    bot.aiReactTimer -= dt;
    if (bot.aiBoostTimer > 0) bot.aiBoostTimer -= dt;

    // 1. Arena border avoidance (always active near outer wall)
    const distFromCenter = Math.hypot(head.x, head.y);
    if (distFromCenter > WORLD_RADIUS - 280) {
      const toCenter = Math.atan2(-head.y, -head.x);
      bot.targetAngle = toCenter;
      bot.boosting = false;
      return;
    }

    // Human-like reaction delay: bots only re-evaluate steering periodically instead of 0ms instant dodging
    if (bot.aiReactTimer > 0) {
      return;
    }
    const baseReact =
      bot.personality === 'cautious'
        ? 0.16
        : bot.personality === 'hunter'
          ? 0.21
          : bot.personality === 'scavenger'
            ? 0.25
            : 0.29;
    // Slightly slower reaction when boosting (tunnel vision), making player boost-cutoffs very rewarding
    bot.aiReactTimer = baseReact + Math.random() * 0.11 + (bot.boosting ? 0.08 : 0);

    // 2. Forward-cone obstacle awareness (realistic range so players can cut off & coil bots)
    const dangerRadius =
      (bot.personality === 'cautious' ? 110 : 82) + bot.radius * 2.1;
    const visionHalfAngle = bot.personality === 'cautious' ? 1.05 : 0.82;

    const cx0 = Math.floor((head.x - dangerRadius) / GRID_CELL);
    const cx1 = Math.floor((head.x + dangerRadius) / GRID_CELL);
    const cy0 = Math.floor((head.y - dangerRadius) / GRID_CELL);
    const cy1 = Math.floor((head.y + dangerRadius) / GRID_CELL);

    let avoidX = 0;
    let avoidY = 0;
    let maxDanger = 0;
    let nearbyTargetHead: { x: number; y: number; angle: number; dist: number } | null = null;

    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const bucket = this.segGrid.get(cellKey(cx, cy));
        if (!bucket) continue;
        for (const entry of bucket) {
          if (entry.snake.id === bot.id) continue;
          const dx = entry.x - head.x;
          const dy = entry.y - head.y;
          const distSq = dx * dx + dy * dy;
          if (distSq > dangerRadius * dangerRadius || distSq < 1) continue;

          const dist = Math.sqrt(distSq);
          const angleToObstacle = Math.atan2(dy, dx);
          const relAngle = Math.abs(normalizeAngle(angleToObstacle - bot.angle));

          // Track enemy head for hunter cutoff behavior
          if (
            entry.segIdx === 0 &&
            bot.personality === 'hunter' &&
            bot.mass > 28 &&
            dist > 70 &&
            dist < 220 &&
            relAngle < 1.0
          ) {
            nearbyTargetHead = { x: entry.x, y: entry.y, angle: entry.snake.angle, dist };
          }

          if (relAngle < visionHalfAngle) {
            const closeness = 1 - dist / dangerRadius;
            const weight = closeness * closeness * (relAngle < 0.45 ? 2.0 : 0.9);
            avoidX -= (dx / dist) * weight;
            avoidY -= (dy / dist) * weight;
            if (weight > maxDanger) maxDanger = weight;
          }
        }
      }
    }

    // Greedy/scavenger bots occasionally miss a quick side cutoff when chasing food
    const avoidThreshold = bot.personality === 'greedy' ? 0.55 : 0.38;
    if (maxDanger > avoidThreshold) {
      // Turn smoothly away rather than instant perfect boost-escape
      const escapeAngle = Math.atan2(avoidY, avoidX);
      const slightError = (Math.random() - 0.5) * 0.35;
      bot.targetAngle = normalizeAngle(escapeAngle + slightError);
      bot.boosting = false;
      return;
    }

    // 3. Aggressive cutoff maneuver for hunter bots
    if (nearbyTargetHead && bot.mass > 30) {
      const interceptX = nearbyTargetHead.x + Math.cos(nearbyTargetHead.angle) * 125;
      const interceptY = nearbyTargetHead.y + Math.sin(nearbyTargetHead.angle) * 125;
      bot.targetAngle = Math.atan2(interceptY - head.y, interceptX - head.x);
      bot.boosting = Math.random() < 0.7;
      return;
    }

    // 4. Seek nearby death-drop loot or dense food
    const foodScan = bot.personality === 'scavenger' || bot.personality === 'greedy' ? 390 : 280;
    const fcx0 = Math.floor((head.x - foodScan) / GRID_CELL);
    const fcx1 = Math.floor((head.x + foodScan) / GRID_CELL);
    const fcy0 = Math.floor((head.y - foodScan) / GRID_CELL);
    const fcy1 = Math.floor((head.y + foodScan) / GRID_CELL);

    let bestScore = -1;
    let bestFoodX = 0;
    let bestFoodY = 0;
    let foundLoot = false;

    for (let cx = fcx0; cx <= fcx1; cx++) {
      for (let cy = fcy0; cy <= fcy1; cy++) {
        const bucket = this.foodGrid.get(cellKey(cx, cy));
        if (!bucket) continue;
        for (const f of bucket) {
          const dx = f.x - head.x;
          const dy = f.y - head.y;
          const dist = Math.hypot(dx, dy);
          if (dist > foodScan || dist < 10) continue;
          const angleDiff = Math.abs(normalizeAngle(Math.atan2(dy, dx) - bot.angle));
          const score = (f.value * (f.isDeathDrop ? 5.0 : 1.0)) / (dist + 45) / (1 + angleDiff * 0.55);
          if (score > bestScore) {
            bestScore = score;
            bestFoodX = f.x;
            bestFoodY = f.y;
            foundLoot = f.isDeathDrop && f.value >= 2.5;
          }
        }
      }
    }

    if (bestScore > 0.004) {
      bot.targetAngle = Math.atan2(bestFoodY - head.y, bestFoodX - head.x);
      bot.boosting = foundLoot && bot.mass > 20 && Math.random() < 0.65;
      return;
    }

    // 5. Smooth organic wandering
    if (bot.aiTimer <= 0) {
      bot.aiWanderAngle = normalizeAngle(bot.angle + (Math.random() - 0.5) * 1.4);
      bot.aiTimer = 0.7 + Math.random() * 1.8;
    }
    bot.targetAngle = bot.aiWanderAngle;
    bot.boosting = false;
  }

  private broadcastSnapshots(): void {
    if (this.clients.size === 0) return;

    // Sort snakes once for leaderboard & rank lookup
    const sorted = Array.from(this.snakes.values())
      .filter((s) => s.alive)
      .sort((a, b) => b.mass - a.mass);

    const rankById = new Map<string, number>();
    sorted.forEach((s, idx) => {
      const rank = idx + 1;
      rankById.set(s.id, rank);
      if (rank < s.bestRank) s.bestRank = rank;
    });

    const leaderboard: LeaderboardEntry[] = sorted.slice(0, 10).map((s, idx) => ({
      id: s.id,
      name: s.name,
      length: Math.floor(s.mass),
      isBot: s.isBot,
      rank: idx + 1,
    }));

    const leaderId = sorted[0]?.id ?? null;
    const totalSnakes = sorted.length;

    // Precompute basic minimap coords for all snakes
    const baseMinimap = sorted.map((s) => ({
      id: s.id,
      x: Math.round((s.segments[0].x / WORLD_RADIUS) * 1000) / 1000,
      y: Math.round((s.segments[0].y / WORLD_RADIUS) * 1000) / 1000,
      isBot: s.isBot,
    }));

    // Find an active snake to spectate when client is in lobby/menu
    const spectateTarget = sorted[0] ?? null;

    for (const client of this.clients.values()) {
      if (client.ws.readyState !== 1) continue;

      const selfSnake = client.snakeId ? this.snakes.get(client.snakeId) ?? null : null;
      let camX: number;
      let camY: number;
      let zoom: number;

      if (selfSnake && selfSnake.alive) {
        camX = selfSnake.segments[0].x;
        camY = selfSnake.segments[0].y;
        zoom = computeZoom(selfSnake.radius);
      } else if (spectateTarget) {
        // Smooth camera pan toward leader when spectating in Title Screen
        client.spectateX += (spectateTarget.segments[0].x - client.spectateX) * 0.05;
        client.spectateY += (spectateTarget.segments[0].y - client.spectateY) * 0.05;
        camX = client.spectateX;
        camY = client.spectateY;
        zoom = 0.82;
      } else {
        camX = 0;
        camY = 0;
        zoom = 0.85;
      }

      const viewHalfW = 1120 / zoom;
      const viewHalfH = 740 / zoom;

      // Filter snakes intersecting viewport
      const visibleSnakes: SerializedSnake[] = [];
      for (const s of sorted) {
        let inView = s.id === selfSnake?.id;
        if (!inView) {
          for (let i = 0; i < s.segments.length; i += 3) {
            const p = s.segments[i];
            if (Math.abs(p.x - camX) <= viewHalfW + 140 && Math.abs(p.y - camY) <= viewHalfH + 140) {
              inView = true;
              break;
            }
          }
        }
        if (!inView) continue;

        const pts: number[] = new Array(s.segments.length * 2);
        for (let i = 0; i < s.segments.length; i++) {
          pts[i * 2] = Math.round(s.segments[i].x * 10) / 10;
          pts[i * 2 + 1] = Math.round(s.segments[i].y * 10) / 10;
        }

        visibleSnakes.push({
          id: s.id,
          name: s.name,
          isBot: s.isBot,
          skinId: s.skinId,
          customColors: s.customColors,
          angle: Math.round(s.angle * 1000) / 1000,
          targetAngle: Math.round(s.targetAngle * 1000) / 1000,
          radius: Math.round(s.radius * 10) / 10,
          length: Math.floor(s.mass),
          boosting: s.boosting,
          spawnShield: Date.now() - s.spawnTime < 1000,
          pts,
        });
      }

      // Filter foods inside viewport using spatial grid
      const visibleFoods: SerializedFood[] = [];
      const fcx0 = Math.floor((camX - viewHalfW - 80) / GRID_CELL);
      const fcx1 = Math.floor((camX + viewHalfW + 80) / GRID_CELL);
      const fcy0 = Math.floor((camY - viewHalfH - 80) / GRID_CELL);
      const fcy1 = Math.floor((camY + viewHalfH + 80) / GRID_CELL);

      for (let cx = fcx0; cx <= fcx1; cx++) {
        for (let cy = fcy0; cy <= fcy1; cy++) {
          const bucket = this.foodGrid.get(cellKey(cx, cy));
          if (!bucket) continue;
          for (const f of bucket) {
            if (Math.abs(f.x - camX) <= viewHalfW + 60 && Math.abs(f.y - camY) <= viewHalfH + 60) {
              const item: SerializedFood = {
                id: f.id,
                x: Math.round(f.x),
                y: Math.round(f.y),
                r: Math.round(f.radius * 10) / 10,
                c: f.color,
                p: Math.round(f.phase * 100) / 100,
              };
              if (f.isDeathDrop) item.d = 1;
              visibleFoods.push(item);
            }
          }
        }
      }

      const minimap: MinimapDot[] = baseMinimap.map((m) => ({
        x: m.x,
        y: m.y,
        kind:
          m.id === selfSnake?.id
            ? 'self'
            : !m.isBot
              ? 'human'
              : m.id === leaderId
                ? 'leader'
                : 'bot',
      }));

      const msg: ServerMessage = {
        type: 'state',
        tick: this.tick,
        selfId: selfSnake?.id ?? null,
        camX: Math.round(camX * 10) / 10,
        camY: Math.round(camY * 10) / 10,
        zoom: Math.round(zoom * 1000) / 1000,
        snakes: visibleSnakes,
        foods: visibleFoods,
        leaderboard,
        minimap,
        humanCount: this.clients.size,
        maxHumans: MAX_HUMANS_PER_ROOM,
        totalSnakes,
        selfRank: selfSnake ? rankById.get(selfSnake.id) ?? totalSnakes : 0,
        selfLength: selfSnake ? Math.floor(selfSnake.mass) : 0,
        selfKills: selfSnake ? selfSnake.kills : 0,
        canBoost: selfSnake ? selfSnake.mass > 14 : false,
        killFeed: this.killFeed,
        ateMass: selfSnake ? Math.round(selfSnake.ateMassThisTick * 10) / 10 : 0,
        gotKill: selfSnake ? selfSnake.gotKillThisTick : false,
      };

      this.sendToClient(client, msg);
    }
  }

  private sendToClient(client: ConnectedClient, msg: ServerMessage): void {
    if (client.ws.readyState === 1) {
      client.ws.send(JSON.stringify(msg));
    }
  }
}

export class RoomManager {
  private rooms = new Map<string, GameRoom>();
  private interval: ReturnType<typeof setInterval> | null = null;
  private lastTickTime = Date.now();

  constructor() {
    // Always keep one default public arena ready
    this.createRoom(false, DEFAULT_BOT_COUNT, 'MAIN');
    this.startLoop();
  }

  private startLoop(): void {
    const stepMs = Math.floor(1000 / TICK_RATE);
    this.lastTickTime = Date.now();
    this.interval = setInterval(() => {
      const now = Date.now();
      const dt = Math.min(0.08, (now - this.lastTickTime) / 1000);
      this.lastTickTime = now;

      for (const [code, room] of this.rooms.entries()) {
        if (room.clients.size > 0 || code === 'MAIN') {
          room.step(dt);
        }
        if (code !== 'MAIN' && room.isEmptyAndStale) {
          this.rooms.delete(code);
        }
      }
    }, stepMs);
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
  }

  listPublicRooms(): RoomSummary[] {
    const list: RoomSummary[] = [];
    for (const room of this.rooms.values()) {
      if (!room.isPrivate) {
        list.push(room.getSummary());
      }
    }
    return list;
  }

  getRoom(code: string): GameRoom | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  createRoom(isPrivate: boolean, botCount = DEFAULT_BOT_COUNT, forcedCode?: string): GameRoom {
    let code = forcedCode?.toUpperCase() ?? randomRoomCode();
    while (this.rooms.has(code)) {
      code = randomRoomCode();
    }
    const room = new GameRoom(code, isPrivate, botCount);
    this.rooms.set(code, room);
    return room;
  }

  findOrCreatePublicRoom(): GameRoom {
    // Prefer a public room that has humans but is below max capacity (1-5 humans)
    let best: GameRoom | null = null;
    for (const room of this.rooms.values()) {
      if (room.isPrivate) continue;
      if (room.humanCount < MAX_HUMANS_PER_ROOM) {
        if (!best || room.humanCount > best.humanCount) {
          best = room;
        }
      }
    }
    if (best) return best;
    return this.createRoom(false, DEFAULT_BOT_COUNT);
  }
}
