import Phaser from "phaser";

// elements
import { getStaticData } from "@/game/staticData";
import { HeaderStatIcon } from "./HeaderStatIcon";
import { getValueFromColonRuntimeData } from "@/game/runtimeData/helper";
import { HeaderConfig } from "./types";
import { PET_STATIC_KEYS } from "../../constants";
import { AnimationItem } from "../../types";

const DEFAULT_WIDTH = 160;
const DEFAULT_HEIGHT = 25;

// TODO Constant Naming
export class Header extends Phaser.GameObjects.Container {
  private selectorGroup: { arrow: Phaser.GameObjects.Sprite; icon: Phaser.GameObjects.Sprite; onBlur: () => void; onSelect: () => void }[] = [];
  private statGroup: HeaderStatIcon[] = [];
  private current = 0;

  private config: HeaderConfig;

  private background?: Phaser.GameObjects.NineSlice;
  private timer: number | undefined;

  constructor(scene: Phaser.Scene) {
    super(scene);

    this.config = getStaticData(PET_STATIC_KEYS.HEADER);

    this.initAnimations();

    this.initBackground();
    this.initMenu();
    this.initStats();

    this.handleUpdateSelector();

    this.setDepth(1000);
    this.scene.add.existing(this);
  }

  private initAnimations = () => {
    const { key, texture, animations } = this.config;
    if (animations) {
      animations.forEach((_ani: AnimationItem) => {
        const animationName = `${key}_${_ani.prefix}`;
        if (this.scene.anims.exists(animationName)) return; // prevent recreate after change scene.

        const data: Phaser.Types.Animations.Animation = {
          key: animationName,
          frames: this.scene.anims.generateFrameNames(texture, {
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

  private initBackground() {
    this.background = this.scene.make
      .nineslice({
        key: "pet_header_frame",
        frame: "frame",
        x: 0,
        y: 0,
        width: DEFAULT_WIDTH,
        height: DEFAULT_HEIGHT,
        leftWidth: 8,
        rightWidth: 8,
        topHeight: 8,
        bottomHeight: 8,
      })
      .setOrigin(0);
    this.add(this.background);
  }

  private initMenu() {
    const startFrom = 4;
    const arrowSpace = 12;
    const gap = 8;
    const y = 7;
    this.config.menu.forEach(({ animation }, i) => {
      const arrow = this.scene.make
        .sprite({
          x: startFrom + gap * i + i * arrowSpace,
          y,
          key: "",
          frame: "",
        })
        .setOrigin(0);
      arrow.play(`${this.config.key}_${this.config.arrow.animation}`);
      this.add(arrow);

      const icon = this.scene.make
        .sprite({
          x: startFrom + gap * i + (i + 1) * arrowSpace,
          y,
          key: "",
          frame: "",
        })
        .setOrigin(0);
      icon.play(`${this.config.key}_${animation.unselected}`);
      this.add(icon);

      this.selectorGroup.push({
        arrow,
        icon,
        onBlur: () => {
          arrow.setAlpha(0);
          icon.play(`${this.config.key}_${animation.unselected}`);
        },
        onSelect: () => {
          arrow.setAlpha(1);
          icon.play(`${this.config.key}_${animation.selected}`);
        },
      });
    });
  }

  private initStats() {
    const startFrom = 100;
    const gap = 30;
    const y = 7;
    this.config.stats.forEach(({ stat, animation }, i) => {
      const icon = new HeaderStatIcon(this.scene, {
        x: startFrom + gap * i,
        y,
        key: `pet.${stat}`,
        animation: `${this.config.key}_${animation}`,
      });
      this.add(icon);
      this.statGroup.push(icon);
    });
  }

  private handleUpdateSelector() {
    this.selectorGroup.forEach(({ onBlur, onSelect }, i) => {
      if (i === this.current) {
        onSelect();
      } else {
        onBlur();
      }
    });
  }

  public moveNext() {
    this.current =
      this.current === this.selectorGroup.length - 1 ? 0 : this.current + 1;
    this.handleUpdateSelector();
  }

  public movePrev() {
    this.current =
      this.current === 0 ? this.selectorGroup.length - 1 : this.current - 1;
    this.handleUpdateSelector();
  }

  public select() {
    const { action } = this.config.menu[this.current];
    const currentAction = getValueFromColonRuntimeData(action);
    return currentAction;
  }

  update() {
    this.statGroup.forEach((icon) => icon.update());
  }

  public destroy() {
    this.background?.destroy();
    this.selectorGroup.forEach(({ arrow, icon }) => {
      arrow.destroy();
      icon.destroy();
    });
    clearTimeout(this.timer);
    super.destroy(); 
  }
}
