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

export interface AnimationItem {
  prefix: string;
  qty: number;
  freq: number;
  repeat: number;
  repeatDelay?: number;
  duration?: number;
}

export type LibraryFocusSection = 'text-input' | 'grid' | 'button-bar';
