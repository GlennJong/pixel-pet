import { AnimationItem } from "./common";

export interface SentenceItem {
  portrait: string;
  text: string;
}

export interface DialogItem {
  sentences: SentenceItem[];
  priority: number;
}

export interface IdleActionDef {
  animationSet: Record<string, string[]>;
  priority: number;
  direction: string;
  animation?: string;
  isMoving?: Record<string, boolean>;
}

export interface ActionDef {
  action: string;
  animationSet: Record<string, string[]>;
  user?: string;
  effect?: Record<string, any>;
  dialogues?: DialogItem[];
  move?: string;
  auto?: boolean;
  condition?: Record<string, any>;
}

export type IdleActionMap = Record<string, IdleActionDef>;
export type ActionMap = Record<string, ActionDef>;

export interface CharacterStageItem {
  value: number;
  animations: AnimationItem[];
  idleActions: IdleActionMap;
  actions: ActionMap;
}

export interface CharacterConfig {
  watch: string;
  stages: CharacterStageItem[]; // Changed from 'list' since this represents evolution/stages
}
