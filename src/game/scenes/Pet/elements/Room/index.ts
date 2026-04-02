import { getStaticData } from "@/game/staticData";
import { runtimeData, ObservableValue } from "@/game/runtimeData";
import { getPetRuntimeDataKey, PET_STATIC_KEYS } from "../../constants";
import { KnownRuntimeDataKey } from "@/game/runtimeData/types";
import { RoomExtraItem } from "./types";
import { createAnimationsFromConfig } from "@/game/utils/animation";

const DEFAULT_SPRITE = { key: "", frame: "" };

export class Room {
  private config;
  private scene: Phaser.Scene;
  private background?: Phaser.GameObjects.Sprite;
  private back?: Phaser.GameObjects.Sprite;
  private front?: Phaser.GameObjects.Sprite;
  private extras: Phaser.GameObjects.Sprite[] = [];
  private watchState?: ObservableValue<number>;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // this.watchState = runtimeData(`pet.condition`);
    this.config = getStaticData(PET_STATIC_KEYS.ROOM);
  }

  init() {
    const { watch } = this.config;

    // set watch state
    const watchKey = getPetRuntimeDataKey(watch);
    this.watchState = runtimeData(watchKey as KnownRuntimeDataKey);
    this.watchState?.watch(this.handleRenderRoomByWatchedState);

    // init animations
    this.initAnimations();

    // init basic sprites
    this.initBasicSprites();

    // render first
    const value = this.watchState?.get() || 0;
    this.handleRenderRoomByWatchedState(value);
  }

  private initAnimations = () => {
    const { atlasId, texture, animations } = this.config || {};
    if (animations) {
      createAnimationsFromConfig(this.scene, atlasId, animations, texture);
    }
  };

  private initBasicSprites = () => {
    this.background = this.scene.make.sprite(DEFAULT_SPRITE).setOrigin(0);
    this.background.setPosition(0, 0);
    this.background.setDepth(0);

    this.back = this.scene.make.sprite(DEFAULT_SPRITE).setOrigin(0);
    this.back.setPosition(0, 0);
    this.back.setDepth(1);

    this.front = this.scene.make.sprite(DEFAULT_SPRITE).setOrigin(0);
    this.front.setPosition(0, 80);
    this.front.setDepth(100);
  };

  private handleRenderRoomByWatchedState = (value: number) => {
    if (!this.config || !this.config.stages) return;

    const { stages } = this.config;
    const current = stages[value];
    if (!current) return;

    const { background, back, front, extras } = current;
    this.back?.play(`${this.config.atlasId}_${back}`);
    this.front?.play(`${this.config.atlasId}_${front}`);
    this.background?.play(`${this.config.atlasId}_${background}`);

    this.handleRenderExtras(extras);
  };

  private handleRenderExtras = (newextras?: RoomExtraItem[]) => {
    if (!newextras) return;

    if (this.extras.length !== 0) {
      this.extras.forEach((custom) => {
        custom.destroy();
      });
      this.extras = [];
    }

    newextras.forEach(({ x, y, animation, depth = 1 }) => {
      const current = this.scene.make
        .sprite(DEFAULT_SPRITE)
        .setOrigin(0)
        .setPosition(x, y)
        .setDepth(depth)
        .play(`${this.config.atlasId}_${animation}`);

      this.extras.push(current);
    });
  };

  destroy() {
    this.watchState?.unwatchAll();
    this.background?.destroy();
    this.back?.destroy();
    this.front?.destroy();
    this.extras.forEach((extra) => {
      extra.destroy();
    });
  }
}
