export interface PetConfig {
  pet: {
    assets: {
      pet_room: AssetItem;
      pet_header: AssetItem;
      mycharacter: AssetItem;
    };
    resources: ResourceItem[];
    header: HeaderConfig;
    statuses: Record<string, StatusConfig>;
    mycharacter: MyCharacterConfig;
    room: RoomConfig;
  };
}

export interface AssetItem {
  png: string;
  json: string;
}

export interface ResourceItem {
  key: string;
  value: number;
  max?: number;
  min?: number;
}

export interface HeaderConfig {
  key: string;
  preload: {
    png: string;
    json: string;
  };
  animations: AnimationItem[];
  arrow: { animation: string };
  menu: MenuItem[];
  resources: { resource: string; animation: string }[];
}

export interface AnimationItem {
  prefix: string;
  qty: number;
  freq: number;
  repeat: number;
  repeat_delay: number;
}

export interface MenuItem {
  animation: {
    selected: string;
    unselected: string;
  };
  action: Record<string, string>;
}

export interface StatusConfig {
  hp: {
    method: string;
    value: number;
    interval: number;
  };
}

export interface MyCharacterConfig {
  animations: AnimationItem[];
  idleActions: Record<string, IdleActionConfig>;
  actions: Record<string, ActionConfig>;
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
  animations: AnimationItem[];
  list: RoomListItem[];
}

export interface RoomListItem {
  value: number;
  background: string;
  back: string;
  front: string;
  extras?: { animation: string; x: number; y: number }[];
}
