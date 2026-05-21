export interface AssetItem {
  atlasId: string;
  png: string;
  json: string;
  animations?: string;
}

export interface AnimationItem {
  prefix: string;
  qty: number;
  freq: number;
  duration?: number;
  repeat: number;
  repeatDelay?: number;
  repeatDelay?: number;
}

export interface StatItem {
  id: string;
  value: number;
  max?: number;
  min?: number;
}
