export const WORLD_RADIUS = 3200;
export const MAX_HUMANS_PER_ROOM = 5;
export const DEFAULT_BOT_COUNT = 24;
export const TICK_RATE = 30;
export const MAX_FOOD_COUNT = 950;

export interface SkinDefinition {
  id: string;
  name: string;
  colors: string[];
  stripeLength: number;
  glowColor: string;
  eyeColor?: string;
}

export const SKINS: SkinDefinition[] = [
  {
    id: 'emerald',
    name: 'Emerald Viper',
    colors: ['#34d399', '#10b981', '#059669', '#10b981'],
    stripeLength: 2,
    glowColor: '#6ee7b7',
  },
  {
    id: 'coral',
    name: 'Coral Flame',
    colors: ['#fb7185', '#f43f5e', '#e11d48', '#f43f5e'],
    stripeLength: 2,
    glowColor: '#fda4af',
  },
  {
    id: 'cobalt',
    name: 'Cobalt Pulse',
    colors: ['#60a5fa', '#3b82f6', '#2563eb', '#3b82f6'],
    stripeLength: 2,
    glowColor: '#93c5fd',
  },
  {
    id: 'amber',
    name: 'Solar Gold',
    colors: ['#fcd34d', '#f59e0b', '#d97706', '#f59e0b'],
    stripeLength: 2,
    glowColor: '#fde68a',
  },
  {
    id: 'violet',
    name: 'Amethyst',
    colors: ['#c084fc', '#a855f7', '#7e22ce', '#a855f7'],
    stripeLength: 2,
    glowColor: '#d8b4fe',
  },
  {
    id: 'cyan',
    name: 'Arctic Teal',
    colors: ['#22d3ee', '#06b6d4', '#0891b2', '#06b6d4'],
    stripeLength: 2,
    glowColor: '#67e8f9',
  },
  {
    id: 'rainbow',
    name: 'Prism Spectrum',
    colors: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7'],
    stripeLength: 3,
    glowColor: '#ffffff',
  },
  {
    id: 'bumblebee',
    name: 'Hornet',
    colors: ['#facc15', '#1e293b'],
    stripeLength: 3,
    glowColor: '#fef08a',
  },
  {
    id: 'candycane',
    name: 'Peppermint',
    colors: ['#f8fafc', '#ef4444'],
    stripeLength: 3,
    glowColor: '#fecaca',
  },
  {
    id: 'sunset',
    name: 'Magma Drift',
    colors: ['#facc15', '#fb923c', '#f43f5e', '#9333ea'],
    stripeLength: 3,
    glowColor: '#fdba74',
  },
  {
    id: 'oceanic',
    name: 'Deep Reef',
    colors: ['#2dd4bf', '#0ea5e9', '#1d4ed8', '#0ea5e9'],
    stripeLength: 3,
    glowColor: '#5eead4',
  },
  {
    id: 'dragon',
    name: 'Jade Dragon',
    colors: ['#a3e635', '#16a34a', '#14532d', '#facc15'],
    stripeLength: 2,
    glowColor: '#bef264',
  },
  {
    id: 'crimson_obsidian',
    name: 'Shadow Fang',
    colors: ['#1e293b', '#334155', '#dc2626', '#334155'],
    stripeLength: 3,
    glowColor: '#f87171',
  },
  {
    id: 'cotton_candy',
    name: 'Cloud Berry',
    colors: ['#f472b6', '#fbcfe8', '#38bdf8', '#bae6fd'],
    stripeLength: 3,
    glowColor: '#f9a8d4',
  },
  {
    id: 'patriot',
    name: 'Striker',
    colors: ['#ef4444', '#f8fafc', '#2563eb'],
    stripeLength: 3,
    glowColor: '#bfdbfe',
  },
  {
    id: 'mint_choco',
    name: 'Frostbite',
    colors: ['#ecfeff', '#67e8f9', '#0284c7', '#1e3a8a'],
    stripeLength: 2,
    glowColor: '#a5f3fc',
  },
];

export const CUSTOM_SWATCHES = [
  '#ef4444',
  '#f97316',
  '#facc15',
  '#4ade80',
  '#10b981',
  '#06b6d4',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
  '#f8fafc',
  '#94a3b8',
  '#1e293b',
];

export function getSkinById(skinId: string, customColors?: string[]): SkinDefinition {
  if (skinId === 'custom' && customColors && customColors.length > 0) {
    return {
      id: 'custom',
      name: 'Custom Skin',
      colors: customColors.slice(0, 8),
      stripeLength: 2,
      glowColor: customColors[0] || '#ffffff',
    };
  }
  return SKINS.find((s) => s.id === skinId) ?? SKINS[0];
}

export interface Point {
  x: number;
  y: number;
}

export interface SerializedSnake {
  id: string;
  name: string;
  isBot: boolean;
  skinId: string;
  customColors?: string[];
  angle: number;
  targetAngle: number;
  radius: number;
  length: number;
  boosting: boolean;
  spawnShield: boolean;
  /** Flattened [x0, y0, x1, y1, ...] from head (0) to tail */
  pts: number[];
}

export interface SerializedFood {
  id: number;
  x: number;
  y: number;
  r: number;
  c: string;
  p: number; // pulse phase
  d?: 1; // 1 if death-drop loot
}

export interface LeaderboardEntry {
  id: string;
  name: string;
  length: number;
  isBot: boolean;
  rank: number;
}

export interface MinimapDot {
  x: number; // normalized -1 to 1
  y: number;
  kind: 'self' | 'human' | 'bot' | 'leader';
}

export interface KillEvent {
  id: string;
  killerName: string;
  victimName: string;
  timestamp: number;
}

export interface DeathStats {
  finalLength: number;
  kills: number;
  bestRank: number;
  timeAliveSec: number;
  killedBy: string;
}

export interface RoomSummary {
  code: string;
  humans: number;
  maxHumans: number;
  bots: number;
  isPrivate: boolean;
}

export type ClientMessage =
  | {
      type: 'join_room';
      mode: 'public' | 'create' | 'join';
      roomCode?: string;
      botCount?: number;
    }
  | {
      type: 'spawn';
      name: string;
      skinId: string;
      customColors?: string[];
    }
  | {
      type: 'input';
      angle: number;
      boosting: boolean;
    }
  | {
      type: 'ping';
      t: number;
    };

export type ServerMessage =
  | {
      type: 'room_joined';
      roomCode: string;
      playerId: string;
      maxHumans: number;
      botCount: number;
      isPrivate: boolean;
      worldRadius: number;
    }
  | {
      type: 'room_error';
      message: string;
    }
  | {
      type: 'spawned';
      snakeId: string;
    }
  | {
      type: 'state';
      tick: number;
      selfId: string | null;
      camX: number;
      camY: number;
      zoom: number;
      snakes: SerializedSnake[];
      foods: SerializedFood[];
      leaderboard: LeaderboardEntry[];
      minimap: MinimapDot[];
      humanCount: number;
      maxHumans: number;
      totalSnakes: number;
      selfRank: number;
      selfLength: number;
      selfKills: number;
      canBoost: boolean;
      killFeed: KillEvent[];
      ateMass: number;
      gotKill: boolean;
    }
  | {
      type: 'died';
      stats: DeathStats;
    }
  | {
      type: 'pong';
      t: number;
    };
