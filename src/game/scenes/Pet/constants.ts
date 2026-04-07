// src/game/scenes/Pet/constants.ts

export const PET_CHARACTER_WIDTH = 32;
export const PET_CHARACTER_HEIGHT = 32;

export const PET_DEFAULT_HP = 100;
export const PET_DEFAULT_COIN = 20;
export const PET_DEFAULT_LEVEL = 0;
export const PET_DEFAULT_POSITION = {
  x: 60,
  y: 68,
  edge: { from: 20, to: 140 },
};
export const PET_AUTO_ACTION_DURATION = 3000;
export const PET_MOVE_DISTANCE = 24;
export const PET_IDLE_PREFIX = "idle";

export const PET_HEADER_TEXT_STYLE = {
  fontFamily: "Tiny5",
  fontSize: 8,
  color: "#000",
};
export const PET_HEADER_HEIGHT = 25;

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
  CHARACTER: `${PET_NAMESPACE}.character`,
  EFFECTS: `${PET_NAMESPACE}.effects`,
} as const;

export function getPetRuntimeDataKey(stateKey: string): string {
  return `${PET_NAMESPACE}.${stateKey}`;
}

export function getPetStaticDataKey(configKey: string): string {
  return `${PET_NAMESPACE}.${configKey}`;
}
