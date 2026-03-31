import { getStoreState } from "@/game/store";

// How to use:
// {
//   "default": "value1",
//   "storeKey:storeValue1": "value2",
//   "storeKey:storeValue2": "value3",
// }

export function getValueFromColonStoreState(
  data: { [key: string]: any; default?: any } = {},
) {
  if (data.default === undefined) return ErrorEvent;

  let result = data.default;
  

  for (const [key, value] of Object.entries(data)) {
    if (key !== "default") {
      const [stateKey, stateValue] = key.split(":");
      if (getStoreState(`pet.${stateKey}`) === stateValue) {
        result = value;
      }
    }
  }
  return result;
}
