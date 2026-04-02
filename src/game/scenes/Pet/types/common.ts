export interface AssetItem {
  atlasId: string;
  png: string;
  json: string;
}

export interface AnimationItem {
  prefix: string;
  qty: number;
  freq: number;
  duration?: number;
  repeat: number;
  repeatDelay?: number;
  repeat_delay?: number;
}

export interface StatItem {
  id: string;
  value: number;
  max?: number;
  min?: number;
}
