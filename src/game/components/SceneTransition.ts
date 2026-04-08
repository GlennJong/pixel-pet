import Phaser from "phaser";
import { CANVAS_WIDTH, CANVAS_HEIGHT, SCENE_TRANSITION_DURATION } from "../constants";
import { runTween } from "../utils/runTween";

const defaultWidth = CANVAS_WIDTH;
const defaultHeight = CANVAS_HEIGHT;
const DURATION = SCENE_TRANSITION_DURATION;
const FADE_STEPS = 16;
const maskCoverColor = 0x000000;

export type TransitionType = "fade" | "circle";

// 用來隨機取得 Transition
function getRandomTransitionType(): TransitionType {
  return Math.random() > 0.5 ? "fade" : "circle";
}

// 產生對應的 Transition 實例
function createTransitionContainer(scene: Phaser.Scene, type: TransitionType) {
  if (type === "circle") {
    return new CircleScreenTransition(scene);
  }
  return new ScreenTransition(scene);
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
  const { data, type, delay } = options ?? {};
  
  // 決定轉場方式
  const transitionType = type ?? getRandomTransitionType();
  const cover = createTransitionContainer(scene, transitionType);
  cover.setDepth(999999);
  
  // circle 初始為最大畫面，fade 則初始為透明
  if (transitionType === "circle") {
    (cover as CircleScreenTransition).max();
  } else {
    (cover as ScreenTransition).init();
  }
  
  await cover.runMask();

  if (delay && delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
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
  const { type, delay } = options ?? {};
  const transitionType = type ?? getRandomTransitionType();
  const cover = createTransitionContainer(scene, transitionType);
  cover.setDepth(999999);
  
  // 反方向：circle 初始為半徑 0，fade 則初始為不透明
  if (transitionType === "circle") {
    (cover as CircleScreenTransition).init();
  } else {
    (cover as ScreenTransition).max();
  }
  
  if (delay && delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  await cover.runUnmask();
}

/** 
 * 像素風（不滑順）的淡入淡出 
 */
class ScreenTransition extends Phaser.GameObjects.Container {
  private cover: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene) {
    super(scene);

    const cover = scene.add
      .image(defaultWidth / 2, defaultHeight / 2, "transition-cover")
      .setAlpha(0)
      .setOrigin(0.5)
      .setDepth(9999) 
      .setSize(defaultWidth, defaultHeight)
      .setDisplaySize(defaultWidth, defaultHeight);

    this.cover = cover;
    this.add(this.cover);
    scene.add.existing(this);
  }

  public init() {
    this.cover.setAlpha(0);
  }

  public max() {
    this.cover.setAlpha(1);
  }

  public async runMask() {
    await runTween(this.cover, { alpha: 1 }, DURATION, (v) => Phaser.Math.Easing.Stepped(v, FADE_STEPS));
  }

  public async runUnmask() {
    await runTween(this.cover, { alpha: 0 }, DURATION, (v) => Phaser.Math.Easing.Stepped(v, FADE_STEPS));
  }
}

/** 
 * 中心圓形縮放過場
 */
class CircleScreenTransition extends Phaser.GameObjects.Container {
  private cover: Phaser.GameObjects.Image;
  private visibleArea: Phaser.GameObjects.Arc;
  private circleMaxSize: number;

  constructor(scene: Phaser.Scene) {
    super(scene);

    const { zoom } = scene.scale;
    const { width, height } = scene.sys.game.canvas;

    this.circleMaxSize = Math.max(width * zoom, height * zoom);

    // 用原本的圖片當作底層
    this.cover = scene.add
      .image(defaultWidth / 2, defaultHeight / 2, "transition-cover")
      .setOrigin(0.5)
      .setDepth(9999)
      .setSize(defaultWidth, defaultHeight)
      .setDisplaySize(defaultWidth, defaultHeight)
      .setAlpha(1);

    // 建立一個圓形作為遮罩（hole）
    this.visibleArea = scene.add
      .circle(width / 2, height / 2, 0, maskCoverColor)
      .setVisible(false);

    const mask = this.visibleArea.createGeometryMask();

    // invertAlpha = true 表示：圓形範圍內「不顯示」cover，圓形範圍外「顯示」cover
    mask.invertAlpha = true;
    this.cover.setMask(mask);
    
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
