import Phaser from 'phaser';
import { ScreenKeyboard } from '@/game/ui';

/**
 * Shared base for the editor screens (S1 Library, S2 SpriteEdit, S3 Frame
 * Selector, plus the Atlas import overlay). Owns the {@link ScreenKeyboard}
 * reference and guarantees it's torn down on destroy, so no screen can leak its
 * global keydown handler. Subclasses that need extra cleanup override destroy()
 * and call super.destroy().
 */
export abstract class EditorScreen extends Phaser.GameObjects.Container {
  protected keyboard!: ScreenKeyboard;

  constructor(scene: Phaser.Scene) {
    super(scene, 0, 0);
  }

  destroy(fromScene?: boolean) {
    this.keyboard?.destroy();
    super.destroy(fromScene);
  }
}
