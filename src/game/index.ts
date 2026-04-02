import "phaser";
import { AUTO, Game } from "phaser";
import { Preloader } from "@/game/scenes/Preloader";

// General
import { CANVAS_WIDTH, CANVAS_HEIGHT } from "@/game/constants";

// Scenes
import Pet from "@/game/scenes/Pet";
import TestScene from "@/game/scenes/Test";
import { MainScene } from "@/game/scenes/MainScene";

const config: Phaser.Types.Core.GameConfig = {
  type: AUTO,
  width: CANVAS_WIDTH,
  height: CANVAS_HEIGHT,
  parent: "game-container",
  pixelArt: true,
  backgroundColor: "#000",
  canvasStyle: `display:block; width: 100%; height: 100%; image-rendering: pixelated;`,
  scene: [Preloader, MainScene, TestScene, Pet],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
};

const StartGame = (parent: string) => {
  return new Game({ ...config, parent });
};

export default StartGame;
