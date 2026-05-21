import "phaser";
import { AUTO, Game } from "phaser";
import { Preloader } from "@/game/scenes/Preloader";

// General

// Scenes
import { MainScene } from "@/game/scenes/MainScene";
import TestScene from "@/game/scenes/Test";
import Pet from "@/game/scenes/Pet";
import EditorScene from "@/game/scenes/SpriteEditor";

const config: Phaser.Types.Core.GameConfig = {
  type: AUTO,
  width: 160,
  height: 144,
  parent: "game-container",
  pixelArt: true,
  backgroundColor: "#000",
  canvasStyle: `display:block; width: 100%; height: 100%; image-rendering: pixelated;`,
  scene: [Preloader, MainScene, TestScene, Pet, EditorScene],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

const StartGame = (parent: string, width: number = 160, height: number = 144) => {
  return new Game({ ...config, parent, width, height });
};

/**
 * Launch the Sprite Editor as a standalone Phaser game.
 * Designed for 320×240; defaults to that resolution.
 */
export const StartEditorGame = (parent: string, width = 320, height = 240) => {
  return new Game({
    type: AUTO,
    width,
    height,
    parent,
    pixelArt: true,
    backgroundColor: "#f0f0f0",
    canvasStyle: `display:block; width: 100%; height: 100%; image-rendering: pixelated;`,
    scene: [EditorScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  });
};

export default StartGame;
