// src/game/scenes/Pet/constants.ts

export const PET_NAMESPACE = "pet" as const;

export const PET_CORE_RUNTIME_KEYS = {
  HP: `${PET_NAMESPACE}.hp`,
  COIN: `${PET_NAMESPACE}.coin`,
  LEVEL: `${PET_NAMESPACE}.level`,
  CONDITION: `${PET_NAMESPACE}.condition`,
  TASK_QUEUE: `${PET_NAMESPACE}.taskQueue`,
} as const;

export const PET_STATIC_KEYS = {
  STATS: `${PET_NAMESPACE}.stats`,
  ROOM: `${PET_NAMESPACE}.room`,
  CONDITIONS: `${PET_NAMESPACE}.conditions`,
  HEADER: `${PET_NAMESPACE}.header`,
  MYCHARACTER: `${PET_NAMESPACE}.mycharacter`,
  EFFECTS: `${PET_NAMESPACE}.effects`,
} as const;

export function getPetRuntimeDataKey(stateKey: string): string {
  return `${PET_NAMESPACE}.${stateKey}`;
}

export function getPetStaticDataKey(configKey: string): string {
  return `${PET_NAMESPACE}.${configKey}`;
}
