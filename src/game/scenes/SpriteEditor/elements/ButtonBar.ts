import Phaser from 'phaser';
import { SelectorBar, SelectorBarItem } from '@/game/components/SelectorBar';
import { FocusableCursorList } from './FocusableCursorList';
import {
  COLORS,
  FONT,
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
      { style: { fontFamily: FONT.FAMILY, fontSize: FONT.SIZE } },
      false,
    );

    scene.add.existing(this);
    this.setButtons(buttons);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  get cursorIndex() { return this.bar.selectedIndex; }

  setButtons(buttons: ButtonConfig[]) {
    this.cells = [];
    this.buttonConfigs = [...buttons];

    // Framed: plain dark text, arrow is the focus affordance.
    // Fallback: classic grey box + red border.
    const textStyle = {
      fontFamily: FONT.FAMILY,
      fontSize: FONT.SIZE,
      color: hex(this.framed ? COLORS.TEXT : COLORS.TEXT_BUTTON),
      resolution: 1,
    };
    const midY = Math.floor(BUTTON_BAR_HEIGHT / 2);

    const items: SelectorBarItem[] = buttons.map((cfg, i) => {
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

      bg.on('pointerover', () => this.bar.setSelectedIndex(i));
      bg.on('pointerdown', () => {
        this.bar.setSelectedIndex(i);
        this.executeCursor();
      });

      this.cells.push({ bg, border, text });
      return { object: cell, width: btnW };
    });

    this.bar.setItems(items);
    this.bar.setFocused(this._hasFocus);
    this.refreshFallbackBorder();
  }

  protected onFocusChange() {
    this.bar.setFocused(this._hasFocus);
    this.refreshFallbackBorder();
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
    if (btn) this.emit('action', btn.key);
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
