// src/game/scenes/Pet/types/runtime.ts

// Pet Domain RuntimeData Schema Augmentation
declare module "@/game/runtimeData/types" {
  interface RuntimeDataSchema {
    "pet.hp": number;
    "pet.coin": number;
    "pet.level": number;
    "pet.condition": string;
    "pet.taskQueue": import("../services/types").Task[];
  }
}
