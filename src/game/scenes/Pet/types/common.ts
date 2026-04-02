export interface AssetItem {
  id: string;
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
  key: string;
  value: number;
  max?: number;
  min?: number;
}
