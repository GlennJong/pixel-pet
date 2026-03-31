import { AppConfig } from "./configTypes";

export class ConfigManager {
  private static instance: ConfigManager;
  private config: AppConfig = {} as AppConfig;

  private constructor() {}

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }

    return ConfigManager.instance;
  }

  setConfig(config: AppConfig) {
    this.config = config;
  }

  async loadConfig(url: string) {
    const res = await fetch(url);
    this.config = (await res.json()) as AppConfig;
  }

  get<T = any>(path: string): T {
    return path.split(".").reduce((obj: any, key) => obj?.[key], this.config) as T;
  }

  getPetConfig(): NonNullable<AppConfig["pet"]> {
    return this.config.pet;
  }
}
