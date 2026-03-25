import { TAnimation } from "@/game/components/Character";
import { ConfigManager } from "@/game/managers/ConfigManagers";
import { store, Store } from "@/game/store";

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

    // init basic sprites early so they exist
    this.initBasicSprites();

    // set watch state
    this.watchState = store<number>(`${this.ipId}.${watch}`);
    this.watchState?.watch((val) => this.handleRenderPropertyByWatchedState(val));

    // render first
    const value = this.watchState?.get() || 0;
    this.handleRenderPropertyByWatchedState(value);
  }

  private initAnimations = (key: string, animations: any[]) => {
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

  private async handleRenderPropertyByWatchedState(value: number) {
    if (!this.config || !this.config.list) return;

    const { list } = this.config;
    const current = list.find((item: any) => item.value === value) || list[list.length - 1];
    if (!current) return;

    const { configFile } = current;

    let roomData = current;

    if (configFile) {
      if (!this.scene.cache.json.exists(configFile)) {
        await new Promise<void>((resolve) => {
          this.scene.load.json(configFile, `assets/${configFile}`);
          this.scene.load.once(`filecomplete-json-${configFile}`, () => {
            resolve();
          });
          this.scene.load.start();
        });
      }
      const loadedData = this.scene.cache.json.get(configFile);
      if (loadedData) {
        roomData = loadedData;
      }
    }

    this.renderRoomData(roomData);
  }

  private renderRoomData(data: any) {
    const { background, back, front, extras, key, animations } = data;
    const assetKey = key || this.config.key;

    if (animations) {
      this.initAnimations(assetKey, animations);
    }

    this.back?.play(`${assetKey}_${back}`);
    this.front?.play(`${assetKey}_${front}`);
    this.background?.play(`${assetKey}_${background}`);

    this.handleRenderExtras(assetKey, extras);
  }

  private handleRenderExtras = (assetKey: string, newextras?: any[]) => {
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
        .play(`${assetKey}_${animation}`);

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
