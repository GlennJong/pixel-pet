import Phaser from "phaser";
import { AnimationItem } from "@/game/scenes/Pet/types/common";

export function createAnimationsFromConfig(
  scene: Phaser.Scene,
  atlasId: string,
  animations: AnimationItem[],
  texture: string = atlasId,
) {
  if (!animations || animations.length === 0) return;

  animations.forEach((_ani: AnimationItem) => {
    if (!_ani) return;

    const animationName = `${atlasId}_${_ani.prefix}`;
    if (scene.anims.exists(animationName)) return;

    const data: Phaser.Types.Animations.Animation = {
      key: animationName,
      frames: scene.anims.generateFrameNames(texture, {
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

    scene.anims.create(data);
  });
}
