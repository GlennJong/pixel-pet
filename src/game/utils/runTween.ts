import Phaser from "phaser";

export function runTween<T>(
  obj: { scene: Phaser.Scene } & T,
  options: { [key: string]: number },
  duration: number,
  ease?: (num: number) => number,
): Promise<void> | undefined {
  const { scene } = obj;
  if (scene) {
    const data = {
      targets: obj,
      repeat: 0,
      duration,
      ...options,
    };

    if (ease) {
      data.ease = ease;
    }

    let tween: Phaser.Tweens.BaseTween | undefined = obj.scene.tweens.add(data);

    return new Promise((resolve) => {
      if (!tween) {
        resolve();
        return;
      }
      tween.once("complete", () => {
        if (tween) {
          tween.remove();
          tween = undefined;
        }
        resolve();
      });
    });
  }
}
