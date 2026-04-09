import { StatItem } from "./common";
import { HeaderConfig } from "../elements/Header/types";
import { ConditionMap } from "./conditions";
import { CharacterConfig } from "../elements/PetCharacter/types";
import { RoomConfig } from "../elements/Room/types";

export * from "../elements/PetCharacter/types";
export * from "./common";
export * from "./conditions";
export * from "./runtime";
export * from "./task";

export interface PetConfig {
  pet: {
    stats: StatItem[];
    header: HeaderConfig;
    conditions: ConditionMap;
    character: CharacterConfig;
    room: RoomConfig;
    autoActions: any;
    effects: any;
  };
  global?: {
    ui?: {
      transition?: any;
    };
    dialogue?: any;
  };
}

declare module "@/game/staticData/types" {
  interface StaticDataSchema extends PetConfig {}
}
