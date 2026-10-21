import Phaser from 'phaser';
import { SelectorBar, SelectorBarItem } from '@/game/components/SelectorBar';
import { Direction } from '@/game/ui/focus';
import { FocusableCursorList } from './FocusableCursorList';
import {
  COLORS,
  FONT_CJK,
  UI_FRAME,
  BUTTON_BAR_HEIGHT,
  BUTTON_HEIGHT,
  BUTTON_PADDING_X,
  BUTTON_GAP,
  BUTTON_BAR_PADDING_RIGHT,
  hex,
} from '../constants';

export interface ButtonConfig {
  key: string;
  label: string;
  /**
   * Unavailable right now: greyed out, skipped by the cursor, and inert to both
   * Space and the pointer. The button keeps its place so the bar does not reflow
   * as availability changes — a moving target is worse than a greyed one.
   */
  disabled?: boolean;
}

interface ButtonCell {
  bg: Phaser.GameObjects.Rectangle;
  border: Phaser.GameObjects.Graphics;
  text: Phaser.GameObjects.Text;
}

// Leading-edge space (px) reserved for the selection arrow on left-aligned bars.
const ARROW_RESERVE = 8;

/**
 * Fixed-height bar anchored at the bottom of the screen.
 * Buttons are right-aligned. Keyboard cursor moves left/right; Space executes.
 *
 * Chrome + behavior come from the shared {@link SelectorBar}: a nineslice window
 * frame background, a selection arrow that points at the focused button, and
 * pagination — when the buttons exceed the bar width they split into pages and
 * moving the cursor past the edge flips to the next page (mirrors the Pet
 * Header). Without the UI frame atlas, SelectorBar degrades to a flat rectangle and
 * this bar falls back to a red focus border (see SelectorBar.hasFrame).
 *
 * Events emitted:
 *   'action' (key: string) – button was activated
 *   'request-focus'        – pointer entered/pressed; owner should focus this bar
 *
 * Buttons can be disabled, either up front via {@link ButtonConfig.disabled} or
 * later via {@link setDisabledKeys} when availability depends on live state.
 */
export class ButtonBar extends FocusableCursorList {
  private bar: SelectorBar;
  private cells: ButtonCell[] = [];
  private buttonConfigs: ButtonConfig[] = [];
  private readonly framed: boolean;
  // Reused off-display-list Text for measuring label widths in setButtons, which
  // some screens call on every selection change — one probe beats one-per-button.
  private readonly probe: Phaser.GameObjects.Text;

  constructor(
    scene: Phaser.Scene,
    y: number,
    barWidth: number,
    buttons: ButtonConfig[],
    align: 'left' | 'right' = 'right',
  ) {
    super(scene, 0, y);

    // Apply the nineslice window-frame style + paginated layout to the abstract
    // frame component. Alignment picks which edge the buttons pack against.
    this.bar = new SelectorBar(
      scene,
      0,
      0,
      barWidth,
      BUTTON_BAR_HEIGHT,
      {
        atlas: UI_FRAME.ATLAS,
        frame: UI_FRAME.FRAME_TEXTURE,
        inset: UI_FRAME.INSET,
        fallbackColor: COLORS.BUTTON_BAR_BG,
        arrowFrame: UI_FRAME.ARROW_TEXTURE,
        arrowAtlas: UI_FRAME.ARROW_ATLAS,
      },
      {
        align,
        // Left-anchored bars need room before the first item so the selection
        // arrow isn't clipped by the frame's left border.
        padLeft: align === 'left' ? UI_FRAME.INSET + ARROW_RESERVE : UI_FRAME.INSET,
        padRight: BUTTON_BAR_PADDING_RIGHT,
        gap: BUTTON_GAP,
      },
    );
    this.framed = this.bar.hasFrame;
    this.add(this.bar);
    // Keep the fallback focus border in sync when the page/selection changes.
    this.bar.on('select', () => this.refreshFallbackBorder());

    // Off the display list — used only to measure label widths.
    this.probe = scene.make.text(
      { style: { fontFamily: FONT_CJK.FAMILY, fontSize: `${FONT_CJK.SIZE}px`, resolution: FONT_CJK.RESOLUTION } },
      false,
    );

    scene.add.existing(this);
    this.setButtons(buttons);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get cursorIndex() { return this.bar.selectedIndex; }

  setButtons(buttons: ButtonConfig[]) {
    this.cells = [];
    // Copy each config: setDisabledKeys mutates these, and callers routinely pass
    // a shared module-level constant.
    this.buttonConfigs = buttons.map((cfg) => ({ ...cfg }));

    // Framed: plain dark text, arrow is the focus affordance.
    // Fallback: classic grey box + red border.
    const textStyle = {
      fontFamily: FONT_CJK.FAMILY,
      fontSize: `${FONT_CJK.SIZE}px`,
      color: hex(this.framed ? COLORS.TEXT : COLORS.TEXT_BUTTON),
      resolution: FONT_CJK.RESOLUTION,
    };
    const midY = Math.floor(BUTTON_BAR_HEIGHT / 2);

    const items: SelectorBarItem[] = this.buttonConfigs.map((cfg, i) => {
      // Measure the label to size the cell (reusing the shared probe).
      this.probe.setText(cfg.label);
      const btnW = this.probe.width + BUTTON_PADDING_X * 2;

      const cell = this.scene.add.container(0, 0);
      const bg = this.scene.add
        .rectangle(0, midY, btnW, BUTTON_HEIGHT, COLORS.BUTTON_BG, this.framed ? 0 : 1)
        .setOrigin(0, 0.5)
        .setInteractive({ cursor: 'pointer' });
      const border = this.scene.add.graphics();
      const text = this.scene.add
        .text(BUTTON_PADDING_X, midY, cfg.label, textStyle)
        .setOrigin(0, 0.5);
      cell.add([bg, border, text]);

      // A disabled button swallows pointer events entirely — no focus steal, no
      // selection. Taking focus would move the highlight to a *different* button
      // than the one under the cursor, which reads as a glitch.
      bg.on('pointerover', () => {
        if (this.bar.isDisabledAt(i)) return;
        // 'request-focus' first: the owner pulls router focus onto this bar
        // (which homes the cursor), then we place the cursor on the hovered one.
        this.emit('request-focus');
        this.bar.setSelectedIndex(i);
      });
      bg.on('pointerdown', () => {
        if (this.bar.isDisabledAt(i)) return;
        this.emit('request-focus');
        this.bar.setSelectedIndex(i);
        this.executeCursor();
      });

      this.cells.push({ bg, border, text });
      return { object: cell, width: btnW, disabled: cfg.disabled === true };
    });

    this.bar.setItems(items);
    this.bar.setFocused(this._hasFocus);
    this.refreshTextColors();
    this.refreshFallbackBorder();
  }

  /**
   * Mark exactly these keys unavailable, leaving the layout alone. Call it
   * whenever the state a button depends on changes; unknown keys are ignored, so
   * a caller can pass one list for several bar configurations.
   */
  setDisabledKeys(keys: readonly string[]) {
    const disabled = new Set(keys);
    const flags = this.buttonConfigs.map((cfg) => disabled.has(cfg.key));
    this.buttonConfigs.forEach((cfg, i) => { cfg.disabled = flags[i]; });
    this.bar.setDisabledFlags(flags);
    this.refreshTextColors();
    this.refreshFallbackBorder();
  }

  /** Whether the button under the cursor can currently be executed. */
  get cursorEnabled(): boolean {
    return !this.bar.isDisabledAt(this.bar.selectedIndex);
  }

  protected onFocusChange() {
    this.bar.setFocused(this._hasFocus);
    this.refreshFallbackBorder();
  }

  // ── Cursor contract (see FocusableCursorList.asFocusable) ──────────────────

  protected moveCursorIn(dir: Direction): boolean {
    if (dir === 'LEFT')  { this.moveCursor(-1); return true; }
    if (dir === 'RIGHT') { this.moveCursor(1);  return true; }
    return false; // vertical → the router moves focus out of the bar
  }

  protected homeCursor(edge: 'first' | 'last') {
    if (edge === 'first') this.setCursorToFirst();
    else this.setCursorToLast();
  }

  protected activateCursor() {
    this.executeCursor();
  }

  moveCursor(delta: number) {
    this.bar.moveSelection(delta);
  }

  /** Change which edge the buttons pack against, at any time. */
  setAlign(align: 'left' | 'right') {
    this.bar.setAlign(align);
    this.refreshFallbackBorder();
  }

  setCursorToFirst() {
    this.bar.selectFirst();
  }

  setCursorToLast() {
    this.bar.selectLast();
  }

  executeCursor() {
    const btn = this.buttonConfigs[this.bar.selectedIndex];
    if (!btn || btn.disabled) return;
    this.emit('action', btn.key);
  }

  destroy(fromScene?: boolean) {
    // The probe isn't a child of this container, so free it explicitly.
    this.probe.destroy();
    super.destroy(fromScene);
  }

  // ── Private ────────────────────────────────────────────────────────────────

  /**
   * Non-framed fallback focus affordance: a red border on the focused button.
   * No-op when the frame (and its arrow) is available. Off-page cells are hidden
   * by SelectorBar, so only the selected (on-page) cell's border is ever visible.
   */
  /** Grey the label of every disabled button, restore the rest. */
  private refreshTextColors() {
    const normal = hex(this.framed ? COLORS.TEXT : COLORS.TEXT_BUTTON);
    const dimmed = hex(COLORS.TEXT_DISABLED);
    this.cells.forEach(({ text }, i) => {
      text.setColor(this.buttonConfigs[i]?.disabled ? dimmed : normal);
    });
  }

  private refreshFallbackBorder() {
    if (this.framed) return;
    this.cells.forEach(({ bg, border }, i) => {
      border.clear();
      if (this._hasFocus && i === this.bar.selectedIndex) {
        border.lineStyle(1, COLORS.BUTTON_FOCUSED_BORDER, 1);
        border.strokeRect(bg.x, bg.y - bg.height / 2, bg.width, bg.height);
      }
    });
  }
}
