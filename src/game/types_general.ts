
// export type TDirection = "none" | "left" | "right" | "top" | "down";

// export enum PetState {
//   IDLE = "IDLE",
//   MOVING = "MOVING",
//   ACTING = "ACTING",
// }



// partials
export interface AnimationSchema {
  prefix: string;
  qty: number;
  freq: number;
  duration?: number;
  repeat: number;
  repeatDelay?: number;
  repeat_delay?: number;
}

export interface Asset {
  [key: string]: {
    png: string;
    json: string;
  };
}

export interface Stat {
  key: string;
  value: number;
  max?: number;
  min?: number;
}



// ====

export interface PetSchema {
  pet: {
    assets: Asset;
    stats: Stat[];
    header: HeaderShema;
    conditions: ConditionSchema;
    mycharacter: MyCharacterSchema;
    room: RoomConfig;
  };
}

export interface ConditionSchema {
  [key: string]: Condition;
}
export interface HeaderShema {
  key: string;
  preload: {
    png: string;
    json: string;
  };
  animations: AnimationSchema[];
  arrow: { animation: string };
  menu: MenuItem[];
  stats: { stat: string; animation: string }[];
}


export interface MenuItem {
  animation: {
    selected: string;
    unselected: string;
  };
  action: Record<string, string>;
}

export interface Condition {
  hp: {
    method: string;
    value: number;
    interval: number;
  };
}

export interface MyCharacterListItem {
  value: number;
  animations: AnimationSchema[];
  idleActions: Record<string, IdleActionConfig>;
  actions: Record<string, ActionConfig>;
}

export interface MyCharacterSchema {
  watch: string;
  list: MyCharacterListItem[];
}

export interface IdleActionConfig {
  animationSet: Record<string, string[]>;
  priority: number;
  direction: string;
  animation?: string;
  isMoving?: Record<string, boolean>;
}

export interface ActionConfig {
  action: string;
  animationSet: Record<string, string[]>;
  user?: string;
  effect?: Record<string, any>;
  dialogues?: DialogItem[];
  move?: string;
  auto?: boolean;
  condition?: Record<string, any>;
}

export interface DialogItem {
  sentences: SentenceItem[];
  priority: number;
}

export interface SentenceItem {
  portrait: string;
  text: string;
}

export interface RoomConfig {
  watch: string;
  key: string;
  preload: {
    png: string;
    json: string;
  };
  animations: AnimationSchema[];
  list: RoomListItem[];
}

export interface RoomListItem {
  value: number;
  background: string;
  back: string;
  front: string;
  extras?: { animation: string; x: number; y: number }[];
}
