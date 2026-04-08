import { getStaticData } from "@/game/staticData";
import { PET_STATIC_KEYS, getPetRuntimeDataKey } from "../constants";
import { getRuntimeDataGroup } from "@/game/runtimeData";
import { ActionMap, CharacterStageItem } from "../types";

export function getCharacterActionsConfig(): ActionMap {
  const characterConfig = getStaticData(PET_STATIC_KEYS.CHARACTER);
  let actionsConfig: ActionMap = {};

  if (characterConfig.watch && characterConfig.stages) {
    const watchKey = getPetRuntimeDataKey(characterConfig.watch);
    const level = getRuntimeDataGroup(watchKey) || 0;
    const current =
      characterConfig.stages.find(
        (l: CharacterStageItem) => l.value === level,
      ) || characterConfig.stages[0];
    actionsConfig = { ...(characterConfig.actions || {}), ...(current?.actions || {}) };
  } else {
    actionsConfig = characterConfig.actions || {};
  }

  return actionsConfig;
}
