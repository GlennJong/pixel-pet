// Both shapes now live in the shared asset contract so the Pet and the
// SpriteEditor cannot drift apart. Re-exported under the Pet's historical names
// so existing call sites keep working.
export type { AtlasEntry as AssetItem, AnimationItem } from "@/game/assets";

export interface StatItem {
  id: string;
  value: number;
  max?: number;
  min?: number;
}
