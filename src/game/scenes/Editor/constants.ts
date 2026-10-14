import Phaser from 'phaser';
// Layout
export const BUTTON_BAR_HEIGHT = 22;
export const BUTTON_HEIGHT = 14;
export const BUTTON_PADDING_X = 0;
export const BUTTON_GAP = 10;
export const BUTTON_BAR_PADDING_RIGHT = 6;

export const GRID_COLS = 3;
export const GRID_GAP = 2;
export const GRID_OUTER_PAD = 3;

export const TEXT_INPUT_HEIGHT = 11;

export const NUMBER_INPUT_HEIGHT = 9;
export const NUMBER_INPUT_TRACK_WIDTH = 24;

// SpriteCard layout
export const CARD_HEIGHT = 72;
export const CARD_PAD_X = 3;
export const CARD_PAD_Y = 3;
export const CARD_GAP = 4;
export const CARD_X_BTN_WIDTH = 40;
export const CARD_FIELD_GAP = 1;
export const CARD_AREA_PAD = 2;
// Preview thumbnail size (square), independent of CARD_HEIGHT.
export const PREVIEW_SIZE = 64;

// Color palette
export const COLORS = {
  BG: 0xf0f0f0,
  GRID_AREA_BG: 0xe0e0e0,
  CELL: 0xcccccc,
  CELL_FOCUSED_BORDER: 0x7e42ee,
  CELL_SELECTED_BG: 0x999999,
  CELL_SELECTED_BORDER: 0x555555,
  BUTTON_BAR_BG: 0xbbbbbb,
  BUTTON_BG: 0x666666,
  BUTTON_FOCUSED_BG: 0x7e42ee,
  BUTTON_FOCUSED_BORDER: 0x7e42ee,
  INPUT_BG: 0xffffff,
  INPUT_BORDER_DEFAULT: 0x999999,
  INPUT_BORDER_FOCUSED: 0x7e42ee,
  TEXT: 0x333333,
  TEXT_LIGHT: 0x666666,
  TEXT_PLACEHOLDER: 0xaaaaaa,
  TEXT_DISABLED: 0xaaaaaa,
  TEXT_BUTTON: 0xffffff,
  BADGE_BG: 0xff3333,
  BADGE_TEXT: 0xffffff,
  SLIDER_TRACK: 0x999999,
  SLIDER_THUMB: 0x555555,
  SLIDER_THUMB_FOCUSED: 0x222222,
  ERROR: 0xff3333,
  CARD_BG: 0xffffff,
  CARD_FOCUSED_BORDER: 0x7e42ee,
  PREVIEW_BG: 0xd8d8d8,
  PREVIEW_FOCUSED_BORDER: 0x7e42ee,
  X_BTN_BG: 0xffffff,
  X_BTN_FOCUSED_BG: 0x7e42ee,
  X_BTN_TEXT: 0x666666,
  X_BTN_TEXT_FOCUSED: 0xffffff,
} as const;

export const FONT = {
  // Tiny5 has Latin glyphs only. BoutiqueBitmap (the game's dialogue font)
  // fills in the CJK labels the basic editor shows, so English text is unchanged.
  FAMILY: 'Tiny5, BoutiqueBitmap',
  SIZE: 8,
} as const;

/**
 * Text that is mostly Chinese — the basic editor's labels and the dialogue.
 * The same font, size and resolution the game's dialogue box uses, so a line
 * reads the same here as in play. BoutiqueBitmap is drawn at 3× and sampled
 * back down; that drops the anti-aliased grey edge that blurs it at 1×.
 */
export const FONT_CJK = {
  FAMILY: 'BoutiqueBitmap',
  SIZE: 10,
  RESOLUTION: 4,
} as const;

export const cjkStyle = (color: number = COLORS.TEXT): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: FONT_CJK.FAMILY,
  fontSize: `${FONT_CJK.SIZE}px`,
  color: hex(color),
  resolution: FONT_CJK.RESOLUTION,
});

/** Convert a 0xRRGGBB color number to a '#rrggbb' CSS string. */
export const hex = (color: number): string => '#' + color.toString(16).padStart(6, '0');

/**
 * Shared pixel-art UI frame atlas (nineslice window frame + selection arrow),
 * sourced from assets/sprites/ui/system. This atlas is preloaded globally by the
 * Preloader (see configs/assets.json), so its textures are available in every
 * scene — including this editor — without a per-scene load. Consumers must still
 * guard on texture availability so the editor keeps working standalone if the
 * atlas is ever absent.
 */
export const UI_FRAME = {
  // The window frame is shared chrome (one atlas, one copy); the arrow is the
  // editor's own art and stays in the editor's atlas.
  ATLAS: 'ui_frame',
  FRAME_TEXTURE: 'frame_1',
  ARROW_ATLAS: 'sprite_editor',
  ARROW_TEXTURE: 'arrow_1',
  // Nineslice corner insets (frame is 21×20 → 5×4 stretchable middle).
  INSET: 8,
} as const;

// Timeouts (ms)
export const TEXTURE_LOAD_TIMEOUT_MS = 5000;
export const BANNER_AUTOHIDE_MS = 2500;
