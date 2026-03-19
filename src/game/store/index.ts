type ChangeHandler<T> = (newValue: T, oldValue: T) => void;

export class Store<T> {
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

// 全域 store 管理
const globalStoreMap = new Map<string, Store<any>>();

export function initStore<T>(key: string, initialValue: T): Store<T> {
  // Forbid parent name already registered as single state
  for (const existKey of globalStoreMap.keys()) {
    if (existKey !== key && existKey.startsWith(key + ".")) {
      throw new Error(`[Store] '${key}' 已被註冊為 parent name，請勿重複使用`);
    }
    if (key !== existKey && key.startsWith(existKey + ".")) {
      throw new Error(
        `[Store] '${existKey}' 已被註冊為單獨 state，不可作為 parent name`,
      );
    }
  }
  if (globalStoreMap.has(key)) {
    return globalStoreMap.get(key) as Store<T>;
  }
  const store = new Store<T>(initialValue, key);
  globalStoreMap.set(key, store);
  return store;
}

export function store<T>(key: string): Store<T> | undefined {
  // Forbid parent name already registered as single state
  for (const existKey of globalStoreMap.keys()) {
    if (key !== existKey && key.startsWith(existKey + ".")) {
      throw new Error(
        `[Store] '${existKey}' 已被註冊為單獨 state，不可作為 parent name`,
      );
    }
  }
  return globalStoreMap.get(key) as Store<T> | undefined;
}

// Select a group of store values by key prefix, auto-combine nested objects
export function getStoreState(groupKey: string): any {
  // Forbid parent name already registered as single state
  if (
    globalStoreMap.has(groupKey) &&
    !Array.from(globalStoreMap.keys()).some((k) => k.startsWith(groupKey + "."))
  ) {
    // Only single state, return value directly
    return globalStoreMap.get(groupKey)?.get();
  }
  const result: Record<string, any> = {};
  // Collect all keys by prefix
  const keys = Array.from(globalStoreMap.keys()).filter(
    (k) => k === groupKey || k.startsWith(groupKey + "."),
  );
  for (const key of keys) {
    if (key === groupKey) {
      // Direct key, return value
      return globalStoreMap.get(key)?.get();
    }
    const subPath = key.slice(groupKey.length + 1); // e.g. self.hp
    const parts = subPath.split(".");
    let current = result;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i === parts.length - 1) {
        current[part] = globalStoreMap.get(key)?.get();
      } else {
        if (!current[part]) current[part] = {};
        current = current[part];
      }
    }
  }
  return result;
}

// Set store value by key, forbid parent group key
export function setStoreState<T>(key: string, value: T): void {
  // Forbid parent name already registered as single state
  for (const existKey of globalStoreMap.keys()) {
    if (key !== existKey && key.startsWith(existKey + ".")) {
      throw new Error(
        `[Store] '${existKey}' 已被註冊為單獨 state，不可作為 parent name`,
      );
    }
    if (existKey !== key && existKey.startsWith(key + ".")) {
      throw new Error(
        `[Store] '${key}' 已被註冊為 parent name，請勿直接 set group`,
      );
    }
  }
  const storeRef = globalStoreMap.get(key) as Store<T> | undefined;
  if (!storeRef) throw new Error(`[Store] '${key}' 尚未初始化`);
  storeRef.set(value);
}

// 儲存所有 global store 到 localStorage
export function saveAllStoresToLocalStorage(storageKey: string = "pet_store") {
  const data: Record<string, any> = {};
  for (const [key, store] of globalStoreMap.entries()) {
    data[key] = store.get();
  }
  localStorage.setItem(storageKey, JSON.stringify(data));
}

// 從 localStorage 還原所有 global store (async 版本)
export function loadAllStoresFromLocalStorage(
  storageKey: string = "pet_store",
): Promise<void> {
  return new Promise((resolve) => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return resolve();
    try {
      const data = JSON.parse(raw);
      for (const key in data) {
        initStore(key, data[key]);
      }
    } catch (e) {
      console.warn("[Store] localStorage 還原失敗", e);
    }
    resolve();
  });
}

// 清除所有 global store 的 localStorage
export function clearAllStoresFromLocalStorage(storageKey: string = "pet_store") {
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
