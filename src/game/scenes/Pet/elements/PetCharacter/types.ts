import { AnimationItem } from "../../types/common";

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

export interface ActionEffect {
  method: "add" | "sub" | "set";
  value: number | string;
}

export interface ActionConditionRule {
  op?: "==" | ">=" | "<=" | ">" | "<" | "!=";
  method?: "eq" | "gt" | "lt" | "gte" | "lte" | "neq"; // Keep for backwards compatibility if needed
  value: number | string | any[];
}

export interface ActionDef {
  action?: string;
  animationSet: Record<string, string[]>;
  user?: string;
  effect?: Partial<Record<string, ActionEffect>>;
  dialogues?: DialogItem[];
  move?: string;
  auto?: boolean;
  condition?: Partial<
    Record<string, ActionConditionRule | number | string | any[]>
  >;
}

export type IdleActionMap = Record<string, IdleActionDef>;
export type ActionMap = Record<string, ActionDef>;

export interface CharacterStageItem {
  value: number;
  atlasId?: string;
  animations?: AnimationItem[];
  idleActions?: IdleActionMap;
  actions?: ActionMap;
}

export interface CharacterConfig {
  id?: string;
  atlasId?: string;
  texture?: string;
  watch?: string;
  stages?: CharacterStageItem[];
  animations?: AnimationItem[];
  idleActions?: IdleActionMap;
  actions?: ActionMap;
}

import { CharacterDirection } from "@/game/components/Character";

export type PetCharacterDirection =
  | "none"
  | "left"
  | "right"
  | "top"
  | "down"
  | CharacterDirection;

export enum PetState {
  IDLE = "IDLE",
  MOVING = "MOVING",
  ACTING = "ACTING",
}
