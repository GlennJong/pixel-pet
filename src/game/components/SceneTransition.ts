import Phaser from "phaser";
import { getStaticData } from "@/game/staticData";
import { runtimeData } from "@/game/runtimeData";
import { runTween } from "../utils/runTween";
import { KnownRuntimeDataKey } from "@/game/runtimeData/types";
import { getPetRuntimeDataKey } from "@/game/scenes/Pet/constants";
import { createAnimationsFromConfig, resolveAtlasAnimations } from "@/game/utils/animation";

const FADE_STEPS = 16;
const DEFAULT_DURATION = 1000;

/**
 * Read at call time, not import time: modules load before the preloader has
 * filled in the config, so a value read up here was always the fallback.
 */
function canvasSize(): { width: number; height: number } {
  const core = (runtimeData("system.core") as any)?.get();
  return {
    width: core?.canvas?.width ?? 160,
    height: core?.canvas?.height ?? 144,
  };
}

function configuredDuration(): number {
  return getStaticData<TransitionConfig>("global.transition")?.duration || DEFAULT_DURATION;
}

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
  duration?: number;
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
  if (!config || !config.atlasId) return;
  const resolved = resolveAtlasAnimations(config.atlasId, config.animations);
  if (resolved.length > 0) {
    createAnimationsFromConfig(scene, config.atlasId, resolved);
  }
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
  const { width, height } = canvasSize();

  const addAndPlay = (key: string, x: number, y: number, depth: number = 100) => {
    if (!key) return;
    const sprite = scene.make.sprite({ key: "" })
      .setPosition(x, y)
      .setDepth(depth);

    container.add(sprite);

    // Play before setting display size to ensure the stretch correctly ignores ratio based on the newly loaded frame
    sprite.play(`${atlasId}_${key}`);
    sprite.setDisplaySize(width, height); // 強制全畫面尺寸
  };

  if (stage.animation) {
    addAndPlay(stage.animation, width / 2, height / 2);
  }

  if (stage.animations) {
    stage.animations.forEach(anim => addAndPlay(anim.key, anim.x, anim.y, anim.depth));
  }
}

export interface TransitionOptions {
  type?: TransitionType;
  /** Held fully covered before uncovering, ms. Absent: the stage's delay. */
  delay?: number;
  /** Each half — covering, uncovering — ms. Absent: the config's duration. */
  duration?: number;
}

type Cover = ScreenTransition | CircleScreenTransition;

/**
 * Build the cover the config asks for, starting open (`covered: false`, about
 * to cover) or shut (`covered: true`, about to uncover).
 */
function makeCover(scene: Phaser.Scene, covered: boolean, options?: TransitionOptions) {
  // 準備 Data-Driven 設定
  const config = getStaticData<TransitionConfig>("global.transition");
  processAnimationsConfig(scene, config);
  const stageInfo = getCurrentStage(config);

  // Options 優先；否則套用 Stage 設定，最後預設 fade
  const effect = options?.type ?? stageInfo.effect ?? "fade";
  const delay = options?.delay ?? stageInfo.delay ?? 0;
  const duration = options?.duration ?? configuredDuration();

  const color = parseColor(stageInfo.color ?? config?.color);
  const cover: Cover = createTransitionContainer(scene, effect, color);
  cover.setDepth(999999);
  // The two effects start from opposite ends: a fade is covered at full
  // alpha, a circle when its see-through hole has shrunk to nothing.
  const atMax = effect === "circle" ? !covered : covered;
  if (atMax) cover.max();
  else cover.init();

  // 加入自訂 Sprite 動畫 (如果有)
  playStageAnimations(cover, scene, config, stageInfo);
  return { cover, delay, duration };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Cover the screen, run `work` while it is covered, then uncover — for a
 * change inside one scene that should read as a scene change (the editor
 * swapping screens while it loads or saves).
 *
 * `minTotal` keeps the whole transition from being a flash when `work` is
 * quick: the screen stays covered until that long has passed since it began.
 */
export async function transition(
  scene: Phaser.Scene,
  work: () => Promise<void> | void,
  options?: TransitionOptions & { minTotal?: number },
) {
  const started = Date.now();
  const { cover, delay, duration } = makeCover(scene, false, options);
  try {
    await cover.runMask(duration);
    await work();
    if (delay > 0) await wait(delay);
    const left = (options?.minTotal ?? 0) - duration - (Date.now() - started);
    if (left > 0) await wait(left);
    // The scene may have shut down during `work` (it started another).
    if (cover.scene) await cover.runUnmask(duration);
  } finally {
    cover.destroy();
  }
}

export async function sceneConverter(
  scene: Phaser.Scene,
  nextSceneName: string,
  options?: TransitionOptions & { data?: { [key: string]: unknown } },
) {
  const { cover, delay, duration } = makeCover(scene, false, options);
  await cover.runMask(duration);
  if (delay > 0) await wait(delay);

  if (typeof nextSceneName !== "undefined") {
    scene.scene.start(nextSceneName, options?.data);
  }
}

export async function sceneStarter(scene: Phaser.Scene, options?: TransitionOptions) {
  // 反方向：從遮住開始
  const { cover, delay, duration } = makeCover(scene, true, options);
  if (delay > 0) await wait(delay);
  await cover.runUnmask(duration);
  cover.destroy(); // 避免轉場圖層殘留與動畫持續消耗效能
}

/** 
 * 像素風（不滑順）的淡入淡出 
 */
class ScreenTransition extends Phaser.GameObjects.Container {
  private cover: Phaser.GameObjects.Rectangle;

  constructor(scene: Phaser.Scene, color: number) {
    super(scene);
    const { width, height } = canvasSize();

    const cover = scene.add
      .rectangle(width / 2, height / 2, width, height, color)
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

  public async runMask(duration: number) {
    await runTween(this, { alpha: 1 }, duration, (v) => Phaser.Math.Easing.Stepped(v, FADE_STEPS));
  }

  public async runUnmask(duration: number) {
    await runTween(this, { alpha: 0 }, duration, (v) => Phaser.Math.Easing.Stepped(v, FADE_STEPS));
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
    const { width, height } = canvasSize();

    // 半徑最大為畫面對角線長度加一點緩衝
    this.circleMaxSize = Math.sqrt(Math.pow(width / 2, 2) + Math.pow(height / 2, 2)) + 10;

    // 用黑底顏色當作底層
    this.cover = scene.add
      .rectangle(width / 2, height / 2, width, height, color)
      .setOrigin(0.5)
      .setAlpha(1);

    // 建立一個圓形作為遮罩（hole），使用遊戲固定寬高避免多螢幕縮放時計算出界
    this.visibleArea = scene.add
      .circle(width / 2, height / 2, 0, color)
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

  public async runMask(duration: number) {
    // 遮罩圓形縮小到 0：圖片向內覆蓋整個畫面
    await runTween(this.visibleArea, { radius: 0 }, duration);
  }

  public async runUnmask(duration: number) {
    // 遮罩圓形擴大：圖片向外退開，露出畫面
    await runTween(this.visibleArea, { radius: this.circleMaxSize }, duration);
  }
}
