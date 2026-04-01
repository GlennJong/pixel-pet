import { getStaticData } from "@/game/staticData";
import { getRuntimeDataGroup, runtimeData, ObservableValue } from "@/game/runtimeData";
import { GAME_CONFIG } from "@/game/constants";
import { ActionEffect } from "../types/character";
import { ConditionDef, ConditionMap } from "../types/conditions";
import { RuntimeDataValue } from "@/game/runtimeData/types";

export class ConditionHandler {
  private config?: ConditionMap;
  private conditionState?: ObservableValue<RuntimeDataValue<"pet.condition">>;

  constructor() {
    const configKey = `pet.${GAME_CONFIG.PET.DEFAULT_CHARACTER_KEY}.conditions` as const;
    this.config = getStaticData(configKey as any) as ConditionMap | undefined;
    this.conditionState = runtimeData(`pet.condition`);
  }

  public getCondition(): string {
    return getRuntimeDataGroup(`pet.condition`) as string;
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
