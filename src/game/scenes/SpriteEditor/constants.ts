// Layout
export const BUTTON_BAR_HEIGHT = 22;
export const BUTTON_HEIGHT = 14;
export const BUTTON_PADDING_X = 6;
export const BUTTON_GAP = 4;
export const BUTTON_BAR_PADDING_RIGHT = 6;

export const GRID_COLS = 2;
export const GRID_GAP = 2;
export const GRID_OUTER_PAD = 3;

export const TEXT_INPUT_HEIGHT = 12;

export const NUMBER_INPUT_HEIGHT = 10;
export const NUMBER_INPUT_TRACK_WIDTH = 24;

// SpriteCard layout
export const CARD_HEIGHT = 56;
export const CARD_PAD_X = 3;
export const CARD_PAD_Y = 3;
export const CARD_GAP = 2;
export const CARD_X_BTN_WIDTH = 40;
export const CARD_FIELD_GAP = 1;
export const CARD_AREA_PAD = 2;
// Preview thumbnail size (square), independent of CARD_HEIGHT.
export const PREVIEW_SIZE = 40;

// Color palette
export const COLORS = {
  BG: 0xf0f0f0,
  GRID_AREA_BG: 0xe0e0e0,
  CELL: 0xcccccc,
  CELL_FOCUSED_BORDER: 0xff3333,
  CELL_SELECTED_BG: 0x999999,
  CELL_SELECTED_BORDER: 0x555555,
  BUTTON_BAR_BG: 0xbbbbbb,
  BUTTON_BG: 0x888888,
  BUTTON_FOCUSED_BORDER: 0xff3333,
  INPUT_BG: 0xffffff,
  INPUT_BORDER_DEFAULT: 0x999999,
  INPUT_BORDER_FOCUSED: 0xff3333,
  TEXT: 0x333333,
  TEXT_LIGHT: 0x666666,
  TEXT_PLACEHOLDER: 0xaaaaaa,
  TEXT_BUTTON: 0xffffff,
  BADGE_BG: 0xff3333,
  BADGE_TEXT: 0xffffff,
  SLIDER_TRACK: 0x999999,
  SLIDER_THUMB: 0x555555,
  SLIDER_THUMB_FOCUSED: 0x222222,
  ERROR: 0xff3333,
  CARD_BG: 0xffffff,
  CARD_FOCUSED_BORDER: 0xff3333,
  PREVIEW_BG: 0xd8d8d8,
  PREVIEW_FOCUSED_BORDER: 0xff3333,
  X_BTN_BG: 0xdddddd,
  X_BTN_FOCUSED_BG: 0xff3333,
  X_BTN_TEXT: 0x666666,
  X_BTN_TEXT_FOCUSED: 0xffffff,
} as const;

export const FONT = {
  FAMILY: 'Tiny5',
  SIZE: 8,
} as const;

/** Convert a 0xRRGGBB color number to a '#rrggbb' CSS string. */
export const hex = (color: number): string => '#' + color.toString(16).padStart(6, '0');

// Timeouts (ms)
export const TEXTURE_LOAD_TIMEOUT_MS = 5000;
export const BANNER_AUTOHIDE_MS = 2500;
