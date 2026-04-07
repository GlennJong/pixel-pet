import { IPrimaryDialogueConfig } from "@/game/components/PrimaryDialogue";

export const CANVAS_WIDTH = 160;
export const CANVAS_HEIGHT = 144;

export const GLOBAL_DEFAULT_TRANSMIT = {};

export const GLOBAL_DIALOGUE_CONFIG: IPrimaryDialogueConfig = {
  sceneWidth: CANVAS_WIDTH,
  sceneHeight: CANVAS_HEIGHT,
  frameKey: "dialogue_frame",
  frameFrame: "frame",
  fontFamily: "BoutiqueBitmap",
};
