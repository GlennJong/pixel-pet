import { AssetItem, AnimationItem } from "./common";

export interface MenuItem {
  animation: {
    selected: string;
    unselected: string;
  };
  action: Record<string, string>;
}

export interface HeaderConfig {
  key: string;
  preload: AssetItem;
  animations: AnimationItem[];
  arrow: { animation: string };
  menu: MenuItem[];
  stats: { stat: string; animation: string }[];
}
