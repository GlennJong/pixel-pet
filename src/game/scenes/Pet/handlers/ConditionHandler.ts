import { getStaticData } from "@/game/staticData";
import { getRuntimeDataGroup, runtimeData, ObservableValue } from "@/game/runtimeData";
import { ActionEffect } from "../elements/PetCharacter/types";
import { ConditionDef, ConditionMap } from "../types/conditions";
import { PET_CORE_RUNTIME_KEYS, PET_STATIC_KEYS } from "../constants";
import { KnownRuntimeDataKey, RuntimeDataValue } from "@/game/runtimeData/types";

export class ConditionHandler {
  private config?: ConditionMap;
  private conditionState?: ObservableValue<RuntimeDataValue<"pet.condition">>;

  constructor() {
    this.config = getStaticData<ConditionMap>(PET_STATIC_KEYS.CONDITIONS);
    this.conditionState = runtimeData(PET_CORE_RUNTIME_KEYS.CONDITION as KnownRuntimeDataKey) as ObservableValue<RuntimeDataValue<"pet.condition">>;
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
