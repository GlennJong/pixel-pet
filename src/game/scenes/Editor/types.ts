export interface ImageItem {
  id: string;
  fileName: string;
  textureKey: string; // key in Phaser TextureManager
  width: number;
  height: number;
}

export interface SpriteData {
  id: string;
  prefix: string;
  frames: string[];   // ordered array of ImageItem IDs
  freq: number;
  repeat: number;
  repeatDelay: number;
}

export interface EditorState {
  projectName: string;
  images: ImageItem[];
  sprites: SpriteData[];
}

export interface LibraryProceedPayload {
  projectName: string;
  images: ImageItem[];
  sprites?: SpriteData[];
}

// Shared with the Pet via the asset contract — see src/game/assets/contract.ts.
export type { AtlasEntry as WorkspaceAtlasEntry, AnimationItem } from '@/game/assets';
