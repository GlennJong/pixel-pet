// src/game/runtimeData/types.ts

// 定義整個遊戲全域會用到的 State 及其型別
// 透過 Module Augmentation（模組擴充），各個 Domain 會把自己的 Keys 註冊進這個介面裡面
export interface RuntimeDataSchema {}

export type KnownRuntimeDataKey = keyof RuntimeDataSchema;
