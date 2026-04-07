import Phaser from "phaser";

// elements
import { getStaticData } from "@/game/staticData";
import { HeaderStatIcon } from "./HeaderStatIcon";
import { getValueFromColonRuntimeData } from "@/game/runtimeData/helper";
import { HeaderConfig, RegionLayout } from "./types";
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
  private idleTimer: ReturnType<typeof setTimeout> | undefined;
  private readonly IDLE_TIMEOUT = 5000;

  constructor(scene: Phaser.Scene) {
    super(scene);

    this.config = getStaticData(PET_STATIC_KEYS.HEADER);

    this.initAnimations();

    this.initBackground();
    this.initRegions();

    this.handleUpdateSelector();

    this.setDepth(1000);
    this.scene.add.existing(this);

    this.wakeUp();
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

  private initRegions() {
    const layout = this.config.layout;
    if (!layout || !layout.left || !layout.right) {
      console.warn("Header layout is missing left or right configuration.");
      return;
    }

    this.buildRegion("left", layout.left);
    this.buildRegion("right", layout.right);
  }

  private buildRegion(align: "left" | "right", layout: RegionLayout) {
    if (layout.content === "menu") {
      this.buildMenu(align, layout);
    } else if (layout.content === "stats") {
      this.buildStats(align, layout);
    }
  }

  private buildMenu(align: "left" | "right", layout: RegionLayout) {
    let currentX = 0;
    let currentPage = 0;
    const startX = 0;
    const maxW = layout.maxWidth || 90;
    const paddingX = layout.paddingX || 4;

    const builtObjects: Phaser.GameObjects.Sprite[] = [];

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
      builtObjects.push(arrow);

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
      builtObjects.push(icon);

      const arrowWidth = arrow.width > 0 ? arrow.width : 5;
      const iconWidth = icon.width > 0 ? icon.width : 16;
      const internalGap = layout.internalGap || 1;
      const itemTotalWidth = arrowWidth + internalGap + iconWidth;

      if (currentX !== startX && currentX + itemTotalWidth > startX + maxW) {
        currentPage++;
        currentX = startX;
      }

      arrow.setX(currentX);
      icon.setX(currentX + arrowWidth + internalGap);

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

    const actualWidth = currentPage > 0 ? maxW : currentX - layout.itemGap;
    let offsetX = paddingX;
    if (align === "right") {
      offsetX = CANVAS_WIDTH - paddingX - actualWidth;
    }

    builtObjects.forEach((obj) => {
      obj.setX(obj.x + offsetX);
    });
  }

  private buildStats(align: "left" | "right", layout: RegionLayout) {
    let currentX = 0;
    const paddingX = layout.paddingX || 4;
    const builtObjects: HeaderStatIcon[] = [];

    this.config.stats.forEach((statConfig) => {
      const icon = new HeaderStatIcon(this.scene, {
        x: currentX,
        y: layout.y,
        key: `pet.${statConfig.stat}`,
        config: statConfig,
        atlasId: this.config.atlasId,
      });
      this.add(icon);
      this.statGroup.push(icon);
      builtObjects.push(icon);

      const iconTotalWidth = icon.getWidth();
      currentX += iconTotalWidth + layout.itemGap;
    });

    const actualWidth = builtObjects.length > 0 ? currentX - layout.itemGap : 0;
    let offsetX = paddingX;
    if (align === "right") {
      offsetX = CANVAS_WIDTH - paddingX - actualWidth;
    }

    builtObjects.forEach((obj) => {
      obj.setX(obj.x + offsetX);
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

  public wakeUp() {
    if (!this.visible) {
      this.setVisible(true);
    }
    this.resetIdleTimer();
  }

  private hide() {
    this.setVisible(false);
  }

  private resetIdleTimer() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      this.hide();
    }, this.IDLE_TIMEOUT);
  }

  public moveNext() {
    this.wakeUp();
    this.current =
      this.current === this.selectorGroup.length - 1 ? 0 : this.current + 1;
    this.handleUpdateSelector();
  }

  public movePrev() {
    this.wakeUp();
    this.current =
      this.current === 0 ? this.selectorGroup.length - 1 : this.current - 1;
    this.handleUpdateSelector();
  }

  public select() {
    this.wakeUp();
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
    if (this.idleTimer) clearTimeout(this.idleTimer);
    super.destroy();
  }
}
