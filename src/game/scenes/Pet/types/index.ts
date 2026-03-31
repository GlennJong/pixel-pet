import { AssetItem, StatItem } from "./common";
import { HeaderConfig } from "./header";
import { ConditionMap } from "./conditions";
import { CharacterConfig } from "./character";
import { RoomConfig } from "./room";

export * from "./state";
export * from "./common";
export * from "./conditions";
export * from "./header";
export * from "./character";
export * from "./room";

export interface PetConfig {
  pet: {
    assets: {
      petRoom?: AssetItem;
      petHeader?: AssetItem;
      pet_room?: AssetItem;
      pet_header?: AssetItem;
      mycharacter: AssetItem;
    };
    stats: StatItem[];
    header: HeaderConfig;
    conditions: ConditionMap;
    mycharacter: CharacterConfig;
    room: RoomConfig;
  };
}
