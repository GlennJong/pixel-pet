// src/game/scenes/types.ts

import { Message } from "./Pet/types";

// Global (Cross-Scene) RuntimeData Schema Augmentation
declare module "@/game/runtimeData/types" {
  interface RuntimeDataSchema {
    "global.is_paused": boolean;
    "global.transmit": any;
    "global.messageQueue": Message[];
  }
}
