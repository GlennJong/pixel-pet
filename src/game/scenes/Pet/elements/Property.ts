import { ConfigManager } from "@/game/managers/ConfigManagers";
import { store, Store } from "@/game/store";

type TAnimation = {
  prefix: string;
  qty: number;
  freq: number;
  repeat: number;
  duration: number;
  repeatDelay?: number;
  repeat_delay?: number;
};

const DEFAULT_SPRITE = { key: "", frame: "" };

export class Property {
  private config;
  private scene: Phaser.Scene;
  private background?: Phaser.GameObjects.Sprite;
  private back?: Phaser.GameObjects.Sprite;
  private front?: Phaser.GameObjects.Sprite;
  private extras: Phaser.GameObjects.Sprite[] = [];
  private watchState?: Store<number>;
  private ipId: string;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.ipId = ConfigManager.getInstance().getIpId();
    this.watchState = store<number>(`${this.ipId}.status`);
    this.config = ConfigManager.getInstance().get(`${this.ipId}.room`);
  }

  init() {
    const { watch } = this.config;

    // set watch state
    this.watchState = store<number>(`${this.ipId}.${watch}`);
    this.watchState?.watch(this.handleRenderPropertyByWatchedState);

    // init animations
    this.initAnimations();

    // init basic sprites
    this.initBasicSprites();

    // render first
    const value = this.watchState?.get() || 0;
    this.handleRenderPropertyByWatchedState(value);
  }

  private initAnimations = () => {
    const { key, animations } = this.config || {};
    if (animations) {
      animations.forEach((_ani: TAnimation) => {
        if (!_ani) return;
        const animationName = `${key}_${_ani.prefix}`;
        if (this.scene.anims.exists(animationName)) return; // prevent recreate after change scene.

        const data: Phaser.Types.Animations.Animation = {
          key: animationName,
          frames: this.scene.anims.generateFrameNames(key, {
            prefix: `${_ani.prefix}_`,
            start: 1,
            end: _ani.qty,
          }),
          repeat: _ani.repeat,
        };

        if (typeof _ani.freq !== "undefined") data.frameRate = _ani.freq;
        if (typeof _ani.duration !== "undefined") data.duration = _ani.duration;
        const repeatDelay = _ani.repeatDelay ?? _ani.repeat_delay;
        if (typeof repeatDelay !== "undefined") data.repeatDelay = repeatDelay;

        this.scene.anims.create(data);
      });
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

  private handleRenderPropertyByWatchedState = (value: number) => {
    if (!this.config || !this.config.list) return;

    const { list } = this.config;
    const current = list[value];
    if (!current) return;

    const { background, back, front, extras } = current;
    this.back?.play(`${this.config.key}_${back}`);
    this.front?.play(`${this.config.key}_${front}`);
    this.background?.play(`${this.config.key}_${background}`);

    this.handleRenderExtras(extras);
  };

  private handleRenderExtras = (newextras?: any[]) => {
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
        .play(`${this.config.key}_${animation}`);

      this.extras.push(current);
    });
  };

  destroy() {
    this.watchState?.unwatchAll();
    this.background?.destroy();
    this.back?.destroy();
    this.front?.destroy();
  }
}
