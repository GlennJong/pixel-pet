import { getStaticData } from "@/game/staticData";
import { getRuntimeDataGroup, runtimeData, ObservableValue } from "@/game/runtimeData";
import { GAME_CONFIG } from "@/game/constants";

export class ConditionHandler {
  private config: any;
  private conditionState?: ObservableValue<string>;
  

  constructor() {
    
    const configKey = `pet.${GAME_CONFIG.PET.DEFAULT_CHARACTER_KEY}.conditions`;
    this.config = getStaticData(configKey) || undefined;
    this.conditionState = runtimeData(`pet.condition`);
  }

  public getCondition(): string {
    return getRuntimeDataGroup(`pet.condition`);
  }

  public getConfig(): any {
    const current = this.getCondition();
    return this.config?.[current];
  }

  public runEffect = (effect: any) => {
    if (!effect) return;
    const { condition } = effect;
    if (condition?.method === "set") {
      this.conditionState?.set(condition.value);
    }
  };

  destroy() {
    this.conditionState?.unwatchAll();
  }
}
