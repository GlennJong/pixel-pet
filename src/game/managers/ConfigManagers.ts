// src/game/managers/ConfigManagers.ts
import { PetConfig } from "../scenes/Pet/types";

export class ConfigManager {
  private static instance: ConfigManager;
  private config: any = {};
  private ipId: string = "pet";

  private constructor() {}

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  setIpId(ip: string) {
    this.ipId = ip;
  }

  getIpId(): string {
    return this.ipId;
  }

  setConfig(config: any) {
    this.config = config;
  }

  async loadConfig(url: string) {
    const res = await fetch(url);
    this.config = await res.json();
  }

  get<T = any>(path: string): T {
    return path.split(".").reduce((obj, key) => obj?.[key], this.config) as T;
  }

  getPetConfig(): PetConfig["pet"] {
    return this.get(this.ipId);
  }
}
