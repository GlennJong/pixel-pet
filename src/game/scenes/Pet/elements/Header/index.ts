import Phaser from "phaser";

// elements
import { getStaticData } from "@/game/staticData";
import { HeaderStatIcon } from "./HeaderStatIcon";
import { getValueFromColonRuntimeData } from "@/game/runtimeData/helper";
import { HeaderConfig } from "./types";
import { PET_HEADER_HEIGHT, PET_STATIC_KEYS } from "../../constants";
import { createAnimationsFromConfig } from "@/game/utils/animation";
import { CANVAS_WIDTH } from "@/game/constants";

// TODO Constant Naming
export class Header extends Phaser.GameObjects.Container {
  private selectorGroup: {
    arrow: Phaser.GameObjects.Sprite;
    icon: Phaser.GameObjects.Sprite;
    page: number;
    onBlur: () => void;
    onSelect: () => void;
  }[] = [];
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
    const { atlasId, texture, animations } = this.config;
    if (animations) {
      createAnimationsFromConfig(this.scene, atlasId, animations, texture);
    }
  };

  private initBackground() {
    const frameConfig = this.config.frame;
    if (!frameConfig) {
      console.warn("Header requires a 'frame' configuration");
      return;
    }

    this.background = this.scene.make
      .nineslice({
        key: this.config.atlasId,
        frame: frameConfig.textureFrame,
        x: 0,
        y: 0,
        width: CANVAS_WIDTH,
        height: PET_HEADER_HEIGHT,
        leftWidth: frameConfig.leftWidth || 8,
        rightWidth: frameConfig.rightWidth || 8,
        topHeight: frameConfig.topHeight || 8,
        bottomHeight: frameConfig.bottomHeight || 8,
      })
      .setOrigin(0);
    this.add(this.background);
  }

  private initMenu() {
    const layout = this.config.layout?.menu || {
      startX: 4,
      y: 7,
      itemGap: 2,
      internalGap: 1,
      maxWidth: 90,
    };

    let currentX = layout.startX;
    let currentPage = 0;

    this.config.menu.forEach(({ animation }) => {
      const arrow = this.scene.make
        .sprite({
          x: 0,
          y: layout.y,
          key: "",
          frame: "",
        })
        .setOrigin(0);
      arrow.play(`${this.config.atlasId}_${this.config.arrow.animation}`);
      this.add(arrow);

      const icon = this.scene.make
        .sprite({
          x: 0,
          y: layout.y,
          key: "",
          frame: "",
        })
        .setOrigin(0);
      icon.play(`${this.config.atlasId}_${animation.unselected}`);
      this.add(icon);

      const arrowWidth = arrow.width > 0 ? arrow.width : 5;
      const iconWidth = icon.width > 0 ? icon.width : 16;
      const itemTotalWidth = arrowWidth + layout.internalGap + iconWidth;

      if (currentX !== layout.startX && currentX + itemTotalWidth > layout.maxWidth) {
        currentPage++;
        currentX = layout.startX;
      }

      arrow.setX(currentX);
      icon.setX(currentX + arrowWidth + layout.internalGap);
      
      currentX += itemTotalWidth + layout.itemGap;

      this.selectorGroup.push({
        arrow,
        icon,
        page: currentPage,
        onBlur: () => {
          arrow.setAlpha(0);
          icon.play(`${this.config.atlasId}_${animation.unselected}`);
        },
        onSelect: () => {
          arrow.setAlpha(1);
          icon.play(`${this.config.atlasId}_${animation.selected}`);
        },
      });
    });
  }

  private initStats() {
    const layout = this.config.layout?.stats || {
      startX: 100,
      y: 7,
      itemGap: 30,
    };

    this.config.stats.forEach(({ stat, animation }, i) => {
      const icon = new HeaderStatIcon(this.scene, {
        x: layout.startX + layout.itemGap * i,
        y: layout.y,
        key: `pet.${stat}`,
        animation: `${this.config.atlasId}_${animation}`,
      });
      this.add(icon);
      this.statGroup.push(icon);
    });
  }

  private handleUpdateSelector() {
    const selectedItem = this.selectorGroup[this.current];
    if (!selectedItem) return;

    const targetPage = selectedItem.page;

    this.selectorGroup.forEach(({ arrow, icon, page, onBlur, onSelect }, i) => {
      const isVisible = page === targetPage;

      if (!isVisible) {
        arrow.setVisible(false);
        icon.setVisible(false);
      } else {
        icon.setVisible(true);
        if (i === this.current) {
          onSelect();
          arrow.setVisible(true);
        } else {
          onBlur();
          // arrow handles its own visual state (alpha 0) in onBlur, but we must ensure it's in a visible state in engine
          arrow.setVisible(true);
        }
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
