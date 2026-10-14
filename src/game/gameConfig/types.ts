/**
 * The game's config files, as one value.
 *
 * Deliberately loose: these mirror the JSON on disk, field for field, so the
 * editor can read a file, change one value and write it back without losing
 * anything it does not understand. The Pet keeps its own, stricter runtime
 * types; this is the shape of the *files*.
 */

export type AnimationSet = Record<string, string[]>;

export interface Sentence {
  portrait?: string;
  scriptId?: string;
  text?: string;
}

export interface ActionConfig {
  animationSet: AnimationSet;
  dialogues?: { sentences: Sentence[]; priority?: number }[];
  [key: string]: unknown;
}

export interface CharacterConfig {
  atlasId: string;
  watch?: string;
  settings: { idlePrefix: string; [key: string]: unknown };
  stages?: { value: number; atlasId?: string; actions?: Record<string, ActionConfig> }[];
  idleActions: Record<string, ActionConfig>;
  actions: Record<string, ActionConfig>;
  [key: string]: unknown;
}

export interface StatChange {
  method: 'add' | 'sub' | 'set';
  value: number | string;
}

export interface EffectEntry {
  action: string;
  effect: Record<string, StatChange>;
}

export interface Redirect {
  to: string;
  except?: string[];
}

export type ConditionsConfig = Record<string, { redirect?: Redirect; [stat: string]: unknown }>;

export interface AutoActionEntry {
  action: string;
  when: Record<string, { op: string; value: unknown }>;
}

export interface CommandEntry {
  action: string;
  params?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface HeaderConfig {
  atlasId: string;
  arrow: { animation: string };
  frame: { atlasId: string; textureFrame: string; [key: string]: unknown };
  menu: { animation: Record<string, string>; action: Record<string, string> }[];
  stats: {
    stat: string;
    animation?: string;
    thresholds?: { min: number; animation?: string; frame?: string }[];
    [key: string]: unknown;
  }[];
  [key: string]: unknown;
}

export interface RoomConfig {
  atlasId: string;
  watch: string;
  stages: {
    value: number;
    background: string;
    back: string;
    front: string;
    extras?: { animation: string; x: number; y: number }[];
  }[];
  [key: string]: unknown;
}

export interface GameConfigFiles {
  character: CharacterConfig;
  conditions: ConditionsConfig;
  effects: EffectEntry[];
  autoActions: AutoActionEntry[];
  stats: { id: string; value: number; min?: number; max?: number }[];
  commands: Record<string, CommandEntry>;
  header: HeaderConfig;
  room: RoomConfig;
  dialogue: { frameKey: string; frameFrame: string; [key: string]: unknown };
  locale: Record<string, unknown>;
}

/** What the checks need to know about one atlas. */
export interface AtlasIndex {
  prefixes: ReadonlySet<string>;
  frames: ReadonlySet<string>;
}

/** Resolve an atlasId; undefined means "not registered". */
export type AtlasLookup = (atlasId: string) => AtlasIndex | undefined;
