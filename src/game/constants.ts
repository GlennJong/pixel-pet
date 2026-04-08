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

