// src/game/scenes/Pet/types/runtime.ts

export interface PetStats {
  hp: number;
  coin: number;
  level: number;
  condition: string;
  taskQueue: import("../services/types").Task[];
  [key: string]: any; // Allow JSON-driven properties like 'dirty'
}

// Pet Domain RuntimeData Schema Augmentation
declare module "@/game/runtimeData/types" {
  interface RuntimeDataSchema {
    "pet.hp": number;
    "pet.coin": number;
    "pet.level": number;
    "pet.condition": string;
    "pet.taskQueue": import("../services/types").Task[];
    // To support strictly-typed unknown dynamic keys via index signature in global schema isn't fully possible via literal strings,
    // so we will allow index signature on PetStats and bypass initRuntimeData restriction manually or add specific custom properties later.
  }
}
