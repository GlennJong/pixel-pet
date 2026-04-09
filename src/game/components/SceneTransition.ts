import Phaser from "phaser";
import { getStaticData } from "@/game/staticData";
import { runtimeData } from "@/game/runtimeData";
import { runTween } from "../utils/runTween";
import { KnownRuntimeDataKey } from "@/game/runtimeData/types";
import { getPetRuntimeDataKey } from "@/game/scenes/Pet/constants";
import { createAnimationsFromConfig } from "@/game/utils/animation";

const core = (runtimeData("system.core") as any)?.get() || { canvas: { width: 160, height: 144 }, transition: { duration: 1000 } };
const defaultWidth = core.canvas.width;
const defaultHeight = core.canvas.height;
const DURATION = core.transition?.duration || 1000;
const FADE_STEPS = 16;


export type TransitionType = "fade" | "circle";

export interface TransitionStage {
  value: number;
  effect?: TransitionType;
  delay?: number;
  animation?: string;
  animations?: { key: string; x: number; y: number; depth?: number }[];
  color?: string | number;
}

export interface TransitionConfig {
  id?: string;
  atlasId?: string;
  watch?: string;
  animations?: any[];
  stages?: TransitionStage[];
  color?: string | number;
}

const FALLBACK_STAGE: TransitionStage = {
  value: 0,
  effect: "fade",
  delay: 0,
};

// 從 staticData 取得轉場設定，並根據 watch 的等級返回適合的 stage
function getCurrentStage(config?: TransitionConfig): TransitionStage {
  if (!config || !config.stages || config.stages.length === 0) {
    return FALLBACK_STAGE;
  }

  const { watch, stages } = config;
  let currentValue = 0;

  if (watch) {
    const watchKey = getPetRuntimeDataKey(watch);
    const state = runtimeData(watchKey as KnownRuntimeDataKey);
    if (state) {
      currentValue = Number(state.get()) || 0;
    }
  }

  // 尋找最大不超過 currentValue 的 stage 設定
  const match = stages.slice().reverse().find(s => currentValue >= s.value);
  return match || stages[0] || FALLBACK_STAGE;
}

// 根據 config 建立預載動畫
function processAnimationsConfig(scene: Phaser.Scene, config?: TransitionConfig) {
  if (!config || !config.animations || !config.atlasId) return;
  createAnimationsFromConfig(scene, config.atlasId, config.animations);
}


function parseColor(color?: string | number): number {
  if (typeof color === "string") {
    return Phaser.Display.Color.HexStringToColor(color).color;
  }
  if (typeof color === "number") {
    return color;
  }
  return 0x000000;
}

// 產生對應的 Transition 實例
function createTransitionContainer(scene: Phaser.Scene, type: TransitionType, color: number) {
  if (type === "circle") {
    return new CircleScreenTransition(scene, color);
  }
  return new ScreenTransition(scene, color);
}

// 播放 Stage 中夾帶的擴充動畫Sprite
function playStageAnimations(container: Phaser.GameObjects.Container, scene: Phaser.Scene, config?: TransitionConfig, stage?: TransitionStage) {
  if (!config || !stage) return;
  const atlasId = config.atlasId || "";
  
  const addAndPlay = (key: string, x: number, y: number, depth: number = 100) => {
    if (!key) return;
    const sprite = scene.make.sprite({ key: "" })
      .setPosition(x, y)
      .setDepth(depth);
      
    container.add(sprite);
    
    // Play before setting display size to ensure the stretch correctly ignores ratio based on the newly loaded frame
    sprite.play(`${atlasId}_${key}`);
    sprite.setDisplaySize(defaultWidth, defaultHeight); // 強制全畫面尺寸
  };

  if (stage.animation) {
    addAndPlay(stage.animation, defaultWidth / 2, defaultHeight / 2);
  }
  
  if (stage.animations) {
    stage.animations.forEach(anim => addAndPlay(anim.key, anim.x, anim.y, anim.depth));
  }
}

export async function sceneConverter(
  scene: Phaser.Scene,
  nextSceneName: string,
  options?: {
    data?: { [key: string]: unknown };
    type?: TransitionType;
    delay?: number;
  }
) {
  const { scene: sceneController } = scene;
  
  // 準備 Data-Driven 設定
  const config = getStaticData<TransitionConfig>("global.ui.transition");
  processAnimationsConfig(scene, config);
  const stageInfo = getCurrentStage(config);
  
  // 取出套用的參數 (如果使用者有傳 Options，優先用 Options；否則套用 Stage 設定，最後預設 fade)
  const effectParams = options?.type ?? stageInfo.effect ?? "fade";
  const delayParams = options?.delay ?? stageInfo.delay ?? 0;
  const { data } = options ?? {};
  
  const colorRaw = stageInfo.color ?? config?.color;
  const effectColor = parseColor(colorRaw);
  const cover = createTransitionContainer(scene, effectParams, effectColor);
  cover.setDepth(999999);
  
  // 初始化
  if (effectParams === "circle") {
    (cover as CircleScreenTransition).max();
  } else {
    (cover as ScreenTransition).init();
  }
  
  // 加入自訂 Sprite 動畫 (如果有)
  playStageAnimations(cover, scene, config, stageInfo);
  
  await cover.runMask();

  if (delayParams > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayParams));
  }

  if (typeof nextSceneName !== "undefined") {
    sceneController.start(nextSceneName, data);
  }
}

export async function sceneStarter(
  scene: Phaser.Scene, 
  options?: {
    type?: TransitionType;
    delay?: number;
  }
) {
  // 準備 Data-Driven 設定
  const config = getStaticData<TransitionConfig>("global.ui.transition");
  processAnimationsConfig(scene, config);
  const stageInfo = getCurrentStage(config);

  const effectParams = options?.type ?? stageInfo.effect ?? "fade";
  const delayParams = options?.delay ?? stageInfo.delay ?? 0;

  const colorRaw = stageInfo.color ?? config?.color;
  const effectColor = parseColor(colorRaw);
  const cover = createTransitionContainer(scene, effectParams, effectColor);
  cover.setDepth(999999);
  
  // 反方向初始化：circle 半徑 0，fade 不透明
  if (effectParams === "circle") {
    (cover as CircleScreenTransition).init();
  } else {
    (cover as ScreenTransition).max();
  }
  
  // 加入自訂 Sprite 動畫 (如果有)
  playStageAnimations(cover, scene, config, stageInfo);

  if (delayParams > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayParams));
  }

  await cover.runUnmask();
  cover.destroy(); // 避免轉場圖層殘留與動畫持續消耗效能
}

/** 
 * 像素風（不滑順）的淡入淡出 
 */
class ScreenTransition extends Phaser.GameObjects.Container {
  private cover: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, color: number) {
    super(scene);

    const cover = scene.add
      .rectangle(defaultWidth / 2, defaultHeight / 2, defaultWidth, defaultHeight, color)
      .setAlpha(1)
      .setOrigin(0.5);

    this.cover = cover;
    this.add(this.cover);
    scene.add.existing(this);
  }

  public init() {
    this.setAlpha(0);
  }

  public max() {
    this.setAlpha(1);
  }

  public async runMask() {
    await runTween(this, { alpha: 1 }, DURATION, (v) => Phaser.Math.Easing.Stepped(v, FADE_STEPS));
  }

  public async runUnmask() {
    await runTween(this, { alpha: 0 }, DURATION, (v) => Phaser.Math.Easing.Stepped(v, FADE_STEPS));
  }
}

/** 
 * 中心圓形縮放過場
 */
class CircleScreenTransition extends Phaser.GameObjects.Container {
  private cover: Phaser.GameObjects.Rectangle;
  private visibleArea: Phaser.GameObjects.Arc;
  private circleMaxSize: number;

  constructor(scene: Phaser.Scene, color: number) {
    super(scene);

    // 半徑最大為畫面對角線長度加一點緩衝
    this.circleMaxSize = Math.sqrt(Math.pow(defaultWidth / 2, 2) + Math.pow(defaultHeight / 2, 2)) + 10;

    // 用黑底顏色當作底層
    this.cover = scene.add
      .rectangle(defaultWidth / 2, defaultHeight / 2, defaultWidth, defaultHeight, color)
      .setOrigin(0.5)
      .setAlpha(1);

    // 建立一個圓形作為遮罩（hole），使用遊戲固定寬高避免多螢幕縮放時計算出界
    this.visibleArea = scene.add
      .circle(defaultWidth / 2, defaultHeight / 2, 0, color)
      .setVisible(false);

    const mask = this.visibleArea.createGeometryMask();

    // invertAlpha = true 表示：圓形範圍內「不顯示」，圓形範圍外「顯示」
    mask.invertAlpha = true;
    this.setMask(mask); // 將 Mask 綁在 Container 身上，讓自訂動畫也跟著受到控制
    
    this.add(this.cover);
    scene.add.existing(this);
  }

  public init() {
    this.visibleArea.setRadius(0);
  }

  public max() {
    this.visibleArea.setRadius(this.circleMaxSize);
  }

  public async runMask() {
    // 遮罩圓形縮小到 0：圖片向內覆蓋整個畫面
    await runTween(this.visibleArea, { radius: 0 }, DURATION);
  }

  public async runUnmask() {
    // 遮罩圓形擴大：圖片向外退開，露出畫面
    await runTween(this.visibleArea, { radius: this.circleMaxSize }, DURATION);
  }
}
