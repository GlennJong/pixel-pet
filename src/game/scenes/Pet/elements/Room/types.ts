import { AssetItem, AnimationItem } from "../../types/common";

export interface RoomExtraItem {
  animation: string;
  depth?: number;
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
