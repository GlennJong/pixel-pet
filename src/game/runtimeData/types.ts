import { Task, Message } from "../scenes/Pet/services/types";

// 定義整個遊戲全域會用到的 State 及其型別
export interface RuntimeDataSchema {
  "global.is_paused": boolean;
  "global.transmit": any;
  "global.messageQueue": Message[];
  
  "pet.hp": number;
  "pet.coin": number;
  "pet.level": number;
  "pet.condition": string;
  "pet.taskQueue": Task[];

}

export type KnownRuntimeDataKey = keyof RuntimeDataSchema;
