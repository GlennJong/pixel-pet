import { getStaticData } from "@/game/staticData";
import Phaser from "phaser";
import { HeaderConfig, HeaderSelectorOption } from "./types";
import { PET_STATIC_KEYS } from "../../constants";
import { createAnimationsFromConfig } from "@/game/utils/animation";

export class HeaderSelector extends Phaser.GameObjects.Container {
  private config: HeaderConfig;
  private arrow!: Phaser.GameObjects.Sprite;
  private icon!: Phaser.GameObjects.Sprite;
  private frameName: string;

  constructor(scene: Phaser.Scene, option: HeaderSelectorOption) {
    // Inherite from scene
    super(scene);

    this.config = getStaticData(PET_STATIC_KEYS.HEADER);

    this.initAnimations();

    const { frame } = option;

    this.frameName = frame;
  }

  private initAnimations = () => {
    const { atlasId, texture, animations } = this.config;
    if (animations) {
      createAnimationsFromConfig(this.scene, atlasId, animations, texture);
    }
  };

  public select() {
    this.arrow.visible = true;
    this.icon.play(`${this.frameName}_anim`);
  }

  public unselect() {
    this.arrow.visible = false;
    this.icon.anims.complete();
    this.icon.setFrame(`${this.frameName}-default`);
  }

  public destroy() {
    this.icon.destroy();
    this.arrow.destroy();
    super.destroy();
  }
}
