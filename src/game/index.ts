import "phaser";
import { AUTO, Game } from "phaser";
import { Preloader } from "@/game/scenes/Preloader";

// General

// Scenes
import Pet from "@/game/scenes/Pet";
import TestScene from "@/game/scenes/Test";
import { MainScene } from "@/game/scenes/MainScene";

const config: Phaser.Types.Core.GameConfig = {
  type: AUTO,
  width: 160,
  height: 144,
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

const StartGame = (parent: string, width: number = 160, height: number = 144) => {
  return new Game({ ...config, parent, width, height });
};

export default StartGame;
