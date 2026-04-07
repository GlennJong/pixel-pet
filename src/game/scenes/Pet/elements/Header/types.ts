import { AssetItem, AnimationItem } from "../../types/common";

export interface MenuItem {
  animation: {
    selected: string;
    unselected: string;
  };
  action: Record<string, string>;
}

export interface StatThreshold {
  min: number;
  animation?: string;
  frame?: string;
}

export interface StatItemConfig {
  stat: string;
  animation?: string;
  thresholds?: StatThreshold[];
  showValue?: boolean;
}

export interface RegionLayout {
  content: 'menu' | 'stats';
  paddingX: number;
  y: number;
  itemGap: number;
  internalGap?: number;
  maxWidth?: number;
}

export interface HeaderLayout {
  left: RegionLayout;
  right: RegionLayout;
}

export interface HeaderConfig {
  id: string;
  atlasId: string;
  texture: string;
  preload: AssetItem;
  animations: AnimationItem[];
  layout?: HeaderLayout;
  frame: {
    textureFrame: string;
    leftWidth?: number;
    rightWidth?: number;
    topHeight?: number;
    bottomHeight?: number;
  };
  arrow: { animation: string };
  menu: MenuItem[];
  stats: StatItemConfig[];
}

export interface HeaderSelectorOption {
  x: number;
  y: number;
  start: number;
  end: number;
  freq: number;
  id: string;
  atlasId: string;
  frame: string;
}
