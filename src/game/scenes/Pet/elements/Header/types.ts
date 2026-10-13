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
    /**
     * Atlas holding the nineslice frame. Defaults to this element's own
     * `atlasId`; name a shared frame atlas here to keep the element's atlas a
     * pure set of animations, which is what makes it editable (see D7/D10 in
     * docs/SpriteEditor Scope.md).
     */
    atlasId?: string;
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