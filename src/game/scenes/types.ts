// src/game/scenes/types.ts

// Global (Cross-Scene) RuntimeData Schema Augmentation
declare module "@/game/runtimeData/types" {
  interface RuntimeDataSchema {
    "global.is_paused": boolean;
    "global.transmit": any;
    "global.messageQueue": import("./Pet/types/task").Message[];
  }
}
