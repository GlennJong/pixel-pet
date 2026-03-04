import "phaser";
import { AUTO, Game } from "phaser";
import { Preloader } from "@/game/scenes/Preloader";

// General
import { canvas } from "@/game/constants";

// Scenes
import Pet from "@/game/scenes/Pet";
import TestScene from "@/game/scenes/Test";
import { MainScene } from "@/game/scenes/MainScene";

const config: Phaser.Types.Core.GameConfig = {
  type: AUTO,
  width: canvas.width,
  height: canvas.height,
  parent: "game-container",
  zoom: 2,
  backgroundColor: "#000",
  canvasStyle: `display:block; image-rendering: pixelated; transform: scale(0.5); transform-origin: top left;`,
  scene: [Preloader, MainScene, TestScene, Pet],
};

const StartGame = (parent: string) => {
  return new Game({ ...config, parent });
};

export default StartGame;
