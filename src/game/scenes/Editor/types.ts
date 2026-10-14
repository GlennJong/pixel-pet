import { Focusable } from '@/game/ui/focus';

/**
 * Implemented by the EditorScene so S1/S2 can embed the shared bottom nav bar in
 * their own scope as a trailing focusable. `enterContent` is the screen's hook
 * for the nav to return focus to real content, and `requestFocus` the hook for
 * the nav's own pointer events to pull focus onto it — both bound to that
 * screen's router, so mouse and keyboard never disagree about where focus is.
 */
export interface NavHost {
  buildNavFocusable(
    enterContent: (edge: 'first' | 'last') => void,
    requestFocus: () => void,
  ): Focusable;
}

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
