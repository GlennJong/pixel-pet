import { AssetItem, AnimationItem } from "../../types/common";

export interface MenuItem {
  animation: {
    selected: string;
    unselected: string;
  };
  action: Record<string, string>;
}

export interface HeaderConfig {
  key: string;
  texture: string;
  preload: AssetItem;
  animations: AnimationItem[];
  arrow: { animation: string };
  menu: MenuItem[];
  stats: { stat: string; animation: string }[];
}

export interface HeaderSelectorOption {
  x: number;
  y: number;
  start: number;
  end: number;
  freq: number;
  key: string;
  frame: string;
};