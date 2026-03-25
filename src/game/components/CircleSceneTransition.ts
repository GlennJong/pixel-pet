import Phaser from "phaser";
import { TransitionScene } from "../scenes/Transition";

export async function sceneConverter(
  scene: Phaser.Scene,
  nextSceneName?: string,
  data?: { [key: string]: unknown },
) {
  const { scene: sceneController } = scene;
  const transitionScene = sceneController.get("TransitionScene") as TransitionScene;

  sceneController.bringToTop("TransitionScene"); // Ensure it's on top
  await transitionScene.runMask();

  // move to next scene
  if (typeof nextSceneName !== "undefined") {
    sceneController.start(nextSceneName, data);
  }
}

export async function sceneStarter(scene: Phaser.Scene) {
  const { scene: sceneController } = scene;
  const transitionScene = sceneController.get("TransitionScene") as TransitionScene;

  sceneController.bringToTop("TransitionScene"); // Ensure it's on top
  transitionScene.initCover();
  await transitionScene.runUnmask();
}
