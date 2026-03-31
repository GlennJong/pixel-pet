import { AssetItem, AnimationItem } from "./common";

export interface RoomExtraItem {
  animation: string;
  x: number;
  y: number;
}

export interface RoomStageItem {
  value: number;
  background: string;
  back: string;
  front: string;
  extras?: RoomExtraItem[];
}

export interface RoomConfig {
  watch: string;
  key: string;
  preload: AssetItem;
  animations: AnimationItem[];
  stages: RoomStageItem[]; // Changed from 'list'
}
