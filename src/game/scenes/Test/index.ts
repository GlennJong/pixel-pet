import { PrimaryDialogue } from "../../components/PrimaryDialogue";
import { Scene } from "phaser";
import { runtimeData } from "@/game/runtimeData";

export default class TestScene extends Scene {
  constructor() {
    super("Test");
  }

  preload() {
    this.load.setPath("assets");
  }

  private dialogue?: PrimaryDialogue;

  create() {
    this.add.rectangle(400, 300, 800, 600, 0x444444).setOrigin(0.5);

    this.dialogue = new PrimaryDialogue(this);
    const core = (runtimeData("system.core") as any)?.get();
    const dialogueConfig = core?.dialogue || { frameKey: "ui_dialogue_frame", frameFrame: "frame" };
    this.dialogue.initDialogue({
      ...dialogueConfig,
      sceneWidth: core?.canvas?.width || 160,
      sceneHeight: core?.canvas?.height || 144
    });
  }

  update() {}
}
