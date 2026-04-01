import { getRuntimeDataGroup } from "@/game/runtimeData";
import { getPetRuntimeDataKey } from "@/game/scenes/Pet/constants";

// How to use:
// {
//   "default": "value1",
//   "storeKey:storeValue1": "value2",
//   "storeKey:storeValue2": "value3",
// }

export function getValueFromColonRuntimeData(
  data: { [key: string]: any; default?: any } = {},
) {
  if (data.default === undefined) return ErrorEvent;

  let result = data.default;
  

  for (const [key, value] of Object.entries(data)) {
    if (key !== "default") {
      const [stateKey, stateValue] = key.split(":");
      const runtimeKey = getPetRuntimeDataKey(stateKey);
      if (getRuntimeDataGroup(runtimeKey) === stateValue) {
        result = value;
      }
    }
  }
  return result;
}
