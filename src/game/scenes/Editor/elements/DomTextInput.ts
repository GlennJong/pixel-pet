import Phaser from 'phaser';

export interface DomTextInputOptions {
  /** The area of the canvas to type over, in game pixels. */
  area: Phaser.Geom.Rectangle;
  value: string;
  /** Every change, with the caret position, so the canvas can draw both. */
  onChange: (value: string, caret: number) => void;
  /**
   * Arrow past the edge of the text — ↓ with the caret already at the end, ↑
   * with it at the start. The caller moves focus on, as a list does at its edge.
   */
  onExit: (dir: 'UP' | 'DOWN') => void;
  /** Escape: back out, as everywhere else. */
  onCancel: () => void;
  /** Typing took / gave back the keyboard (focus moved in or out). */
  onFocusChange?: (typing: boolean) => void;
}

/**
 * Typing into the canvas, through a real `<textarea>` laid over an area of it.
 *
 * The textarea is the only way to get IME (Chinese) input, and placing it over
 * the area being edited puts the IME's candidate window next to it. It is
 * transparent: the canvas draws what is typed, caret included (`onChange`).
 *
 * Enter is a line break, as in any text box; nothing here saves. Arrows past
 * the text's edge leave it (`onExit`), so the caller's bottom bar is reachable
 * from the keyboard, and Escape backs out.
 *
 * Keys typed here never reach the game — the textarea stops them. The caller
 * pauses its own keyboard while typing (`onFocusChange`) and resumes it a tick
 * after, so the key that ended typing is not read again by the screen.
 */
export class DomTextInput {
  private readonly el: HTMLTextAreaElement;
  private readonly opts: DomTextInputOptions;
  private closed = false;

  constructor(scene: Phaser.Scene, opts: DomTextInputOptions) {
    this.opts = opts;
    const el = document.createElement('textarea');
    el.value = opts.value;
    Object.assign(el.style, overlayStyle(scene, opts.area));
    document.body.appendChild(el);
    this.el = el;

    el.addEventListener('input', this.report);
    el.addEventListener('keyup', this.onKeyUp);
    el.addEventListener('click', this.report);
    el.addEventListener('keydown', this.onKeyDown);
    el.addEventListener('focus', this.onFocus);
    el.addEventListener('blur', this.onBlur);
  }

  get value() { return this.el.value; }

  /** Start (or resume) typing, with the caret at the end. */
  focus() {
    if (this.closed) return;
    this.el.focus();
    const end = this.el.value.length;
    this.el.setSelectionRange(end, end);
    this.report();
  }

  /** Stop typing; the textarea stays, ready for {@link focus}. */
  blur() {
    this.el.blur();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.el.removeEventListener('input', this.report);
    this.el.removeEventListener('keyup', this.onKeyUp);
    this.el.removeEventListener('click', this.report);
    this.el.removeEventListener('keydown', this.onKeyDown);
    this.el.removeEventListener('focus', this.onFocus);
    this.el.removeEventListener('blur', this.onBlur);
    this.el.remove();
  }

  private report = () => {
    if (!this.closed) this.opts.onChange(this.el.value, this.el.selectionStart ?? this.el.value.length);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    e.stopPropagation();
    this.report(); // arrow keys move the caret without an input event
  };

  private onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation();
    // Enter while the IME is composing picks a candidate; it is not "done".
    if (e.isComposing) return;
    const { selectionStart: from, selectionEnd: to, value } = this.el;
    // Only a fresh press leaves: holding an arrow to run the caret to the end
    // must not carry on out of the text the moment it gets there.
    const caretOnly = from === to && !e.repeat;
    if (e.key === 'ArrowDown' && caretOnly && to === value.length) {
      e.preventDefault();
      this.opts.onExit('DOWN');
    } else if (e.key === 'ArrowUp' && caretOnly && from === 0) {
      e.preventDefault();
      this.opts.onExit('UP');
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.opts.onCancel();
    }
  };

  private onFocus = () => this.opts.onFocusChange?.(true);
  private onBlur = () => this.opts.onFocusChange?.(false);
}

/** Lay the textarea exactly over `area`, in page pixels. */
function overlayStyle(scene: Phaser.Scene, area: Phaser.Geom.Rectangle): Partial<CSSStyleDeclaration> {
  const canvas = scene.game.canvas.getBoundingClientRect();
  const sx = canvas.width / scene.scale.width;
  const sy = canvas.height / scene.scale.height;
  return {
    position: 'fixed',
    left: `${canvas.left + area.x * sx}px`,
    top: `${canvas.top + area.y * sy}px`,
    width: `${area.width * sx}px`,
    height: `${area.height * sy}px`,
    fontSize: `${Math.max(10, 10 * sy)}px`,
    padding: '0',
    margin: '0',
    border: 'none',
    outline: 'none',
    resize: 'none',
    overflow: 'hidden',
    background: 'transparent',
    // The canvas draws the text and caret; the textarea only receives them.
    color: 'transparent',
    caretColor: 'transparent',
    zIndex: '1000',
  };
}
