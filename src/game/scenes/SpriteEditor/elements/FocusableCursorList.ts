import Phaser from 'phaser';

/**
 * Shared focus scaffolding for the keyboard-driven cursor lists (ButtonBar,
 * OptionMenu, GridSelector). Holds the focus flag and the activate/deactivate
 * entry points so they stay identical; each subclass supplies its own
 * re-render via {@link onFocusChange}.
 */
export abstract class FocusableCursorList extends Phaser.GameObjects.Container {
  protected _hasFocus = false;

  get hasFocus() { return this._hasFocus; }

  activate() {
    this._hasFocus = true;
    this.onFocusChange();
  }

  deactivate() {
    this._hasFocus = false;
    this.onFocusChange();
  }

  /** Re-render after the focus flag changes. */
  protected abstract onFocusChange(): void;
}
