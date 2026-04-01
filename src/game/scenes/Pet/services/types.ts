import { ActionEffect, DialogItem } from "../types/character";

type UserParams = { user?: string };
type AwardParams = { coin?: number };

// Message queue item
export type Message = {
  user: string;
  content: string;
};

export type Task = {
  user: string;
  action: string;
  params?: UserParams &
    AwardParams & { [key: string]: string | number };
  effect?: Partial<Record<string, ActionEffect>>;
  dialogues?: DialogItem[];
  move?: string;
  callback?: () => void;
};

export type CommandMap = {
  action: string;
  matches: { [key: string]: string[] };
  params: { [key: string]: string | number };
};

declare module "@/game/staticData/types" {
  interface StaticDataSchema {
    commands: Record<string, CommandMap>;
  }
}
