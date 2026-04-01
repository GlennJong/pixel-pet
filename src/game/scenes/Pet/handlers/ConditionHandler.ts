import { getStaticData } from "@/game/staticData";
import { getRuntimeDataGroup, runtimeData, ObservableValue } from "@/game/runtimeData";
import { GAME_CONFIG } from "@/game/constants";
import { ActionEffect } from "../elements/PetCharacter/types";
import { ConditionDef, ConditionMap } from "../types/conditions";
import { PET_CORE_RUNTIME_KEYS, getPetStaticDataKey } from "../constants";
import { RuntimeDataValue } from "@/game/runtimeData/types";

export class ConditionHandler {
  private config?: ConditionMap;
  private conditionState?: ObservableValue<RuntimeDataValue<"pet.condition">>;

  constructor() {
    const configKey = getPetStaticDataKey(`${GAME_CONFIG.PET.DEFAULT_CHARACTER_KEY}.conditions`);
    this.config = getStaticData<ConditionMap>(configKey);
    this.conditionState = runtimeData(PET_CORE_RUNTIME_KEYS.CONDITION as import("@/game/runtimeData/types").KnownRuntimeDataKey) as ObservableValue<RuntimeDataValue<"pet.condition">>;
  }

  public getCondition(): string {
    return getRuntimeDataGroup(PET_CORE_RUNTIME_KEYS.CONDITION) as string;
  }

  public getConfig(): ConditionDef | undefined {
    const current = this.getCondition();
    return this.config?.[current];
  }

  public runEffect = (effect?: Partial<Record<string, ActionEffect>>) => {
    if (!effect) return;
    const condition = effect["condition"];
    if (condition?.method === "set") {
      this.conditionState?.set(String(condition.value) as RuntimeDataValue<"pet.condition">);
    }
  };

  destroy() {
    this.conditionState?.unwatchAll();
  }
}
