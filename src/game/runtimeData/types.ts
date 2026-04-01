// src/game/runtimeData/types.ts

// 定義整個遊戲全域會用到的 State 及其型別
// 透過 Module Augmentation（模組擴充），各個 Domain 會把自己的 keys 註冊進這個介面裡面
export interface RuntimeDataSchema {}

export type KnownRuntimeDataKey = keyof RuntimeDataSchema | `pet.${string}` | `global.${string}`;

// 從 Schema 中提取型別，若尚未定義在 Schema 內，則 fallback 回 any
export type RuntimeDataValue<K extends string> = K extends keyof RuntimeDataSchema
  ? RuntimeDataSchema[K]
  : any;
