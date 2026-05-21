// Editor design resolution (used by StartEditorGame)
export const EDITOR_WIDTH = 320;
export const EDITOR_HEIGHT = 240;

// Layout
export const BUTTON_BAR_HEIGHT = 22;
export const BUTTON_HEIGHT = 14;
export const BUTTON_PADDING_X = 6;
export const BUTTON_GAP = 4;
export const BUTTON_BAR_PADDING_RIGHT = 6;

export const GRID_COLS = 4;
export const GRID_GAP = 4;
export const GRID_OUTER_PAD = 6;

export const TEXT_INPUT_HEIGHT = 16;

export const NUMBER_INPUT_HEIGHT = 14;
export const NUMBER_INPUT_TRACK_WIDTH = 80;

// SpriteCard layout
export const CARD_HEIGHT = 80;
export const CARD_PAD_X = 6;
export const CARD_PAD_Y = 6;
export const CARD_GAP = 4;
export const CARD_X_BTN_WIDTH = 20;
export const CARD_FIELD_GAP = 3;
export const CARD_AREA_PAD = 4;

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
  FAMILY: 'monospace',
  SIZE: '10px',
  SIZE_SM: '8px',
} as const;
