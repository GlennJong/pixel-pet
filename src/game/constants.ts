import { IPrimaryDialogueConfig } from "@/game/components/PrimaryDialogue";

export const CANVAS_WIDTH = 160;
export const CANVAS_HEIGHT = 144;

export const GLOBAL_DEFAULT_TRANSMIT = {};

export const GLOBAL_DIALOGUE_CONFIG: IPrimaryDialogueConfig = {
  sceneWidth: CANVAS_WIDTH,
  sceneHeight: CANVAS_HEIGHT,
  frameKey: "ui_dialogue_frame",
  frameFrame: "frame",
  fontFamily: "BoutiqueBitmap",
};

export const GLOBAL_DIALOGUE_AUTO_NEXT_DELAY = 1000;
export const SCENE_TRANSITION_DURATION = 1000;
export const DEBUG_STORE_POLLING_INTERVAL = 100;


export const PROGRESS_BAR_CONFIG = {
  width: 100,
  height: 10,
  textOffsetY: -10,
  fontSize: "8px",
  fontFamily: "Arial",
  textColor: "#ffffff",
  bgColor: 0x222222,
  bgAlpha: 0.8,
  fgColor: 0xffffff,
  fgAlpha: 1,
};
