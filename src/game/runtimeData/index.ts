import { KnownRuntimeDataKey, RuntimeDataValue } from "./types";

type ChangeHandler<T> = (newValue: T, oldValue: T) => void;

export class ObservableValue<T> {
  private value: T;
  private handlers: ChangeHandler<T>[] = [];
  readonly key?: string;

  constructor(initialValue: T, key?: string) {
    this.value = initialValue;
    this.key = key;
  }

  get() {
    return this.value;
  }

  set(newValue: T) {
    // Forbid setting object type directly, use group key for each value
    if (newValue === this.value) return;
    const oldValue = this.value;
    this.value = newValue;
    this.handlers.forEach((fn) => fn(newValue, oldValue));
  }

  watch(fn: ChangeHandler<T>): void {
    if (!this.handlers.includes(fn)) {
      this.handlers.push(fn);
    }
  }

  unwatch(fn: ChangeHandler<T>): void {
    this.handlers = this.handlers.filter((h) => h !== fn);
  }

  unwatchAll() {
    this.handlers = [];
  }
}

// 全域 runtimeData 管理
const runtimeDataRegistry = new Map<string, ObservableValue<any>>();

export function initRuntimeData<K extends KnownRuntimeDataKey>(key: K, initialValue: RuntimeDataValue<K>): ObservableValue<RuntimeDataValue<K>> {
  if (runtimeDataRegistry.has(key)) {
    return runtimeDataRegistry.get(key) as ObservableValue<RuntimeDataValue<K>>;
  }
  const runtimeData = new ObservableValue<RuntimeDataValue<K>>(initialValue, key);
  runtimeDataRegistry.set(key, runtimeData);
  return runtimeData;
}

export function runtimeData<K extends KnownRuntimeDataKey>(key: K): ObservableValue<RuntimeDataValue<K>> | undefined {
  return runtimeDataRegistry.get(key) as ObservableValue<RuntimeDataValue<K>> | undefined;
}

// Select a group of runtimeData values by key prefix, auto-combine nested objects
export function getRuntimeDataGroup(groupKey: string): any {
  const result: Record<string, any> = {};
  // Collect all keys by prefix
  const keys = Array.from(runtimeDataRegistry.keys()).filter(
    (k) => k === groupKey || k.startsWith(groupKey + "."),
  );
  for (const key of keys) {
    if (key === groupKey) {
      // Direct key, return value
      return runtimeDataRegistry.get(key)?.get();
    }
    const subPath = key.slice(groupKey.length + 1); // e.g. self.hp
    const parts = subPath.split(".");
    let current = result;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        current[part] = runtimeDataRegistry.get(key)?.get();
      } else {
        if (!current[part]) current[part] = {};
        current = current[part];
      }
    }
  }
  return result;
}

// Set runtimeData value by key, forbid parent group key
export function setRuntimeData<K extends KnownRuntimeDataKey>(key: K, value: RuntimeDataValue<K>): void {
  const storeRef = runtimeDataRegistry.get(key) as ObservableValue<RuntimeDataValue<K>> | undefined;
  if (!storeRef) throw new Error(`[ObservableValue] '${key}' 尚未初始化`);
  storeRef.set(value);
}

// 儲存所有 global runtime data 到 localStorage
export function saveAllRuntimeDataToLocalStorage(storageKey: string = "pet_store") {
  const data: Record<string, any> = {};
  for (const [key, runtimeData] of runtimeDataRegistry.entries()) {
    data[key] = runtimeData.get();
  }
  localStorage.setItem(storageKey, JSON.stringify(data));
}

// 從 localStorage 還原所有 global runtime data (async 版本)
export function loadAllRuntimeDataFromLocalStorage(
  storageKey: string = "pet_store",
): Promise<void> {
  return new Promise((resolve) => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return resolve();
    try {
      const data = JSON.parse(raw);
      for (const [key, value] of Object.entries(data)) {
        if (runtimeDataRegistry.has(key)) {
          runtimeDataRegistry.get(key)?.set(value);
        } else {
          initRuntimeData(key as any, value);
        }
      }
    } catch (e) {
      console.error("Failed to parse local storage data", e);
    }
    resolve();
  });
}

// 清除所有 global runtime data 的 localStorage
export function clearAllRuntimeDataFromLocalStorage(storageKey: string = "pet_store") {
  localStorage.removeItem(storageKey);
}

// 取得是否開啟自動存檔
export function getIsAutoSaveEnabled(): boolean {
  return localStorage.getItem("isEnableAutoSave") === "true";
}

// 設定是否開啟自動存檔
export function setIsAutoSaveEnabled(enabled: boolean) {
  localStorage.setItem("isEnableAutoSave", String(enabled));
}

// 檢查是否有存檔
export function hasSaveData(storageKey: string = "pet_store"): boolean {
  return !!localStorage.getItem(storageKey);
}
