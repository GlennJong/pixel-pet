import Phaser from "phaser";
import { store, Store } from "@/game/store";

const DEFAULT_HP = 88;
const FONT_FAMILY = "Tiny5";
const FONT_SIZE = 8;

export class IconHp extends Phaser.GameObjects.Container {
  private hpState?: Store<number>;
  private icon: Phaser.GameObjects.Sprite;
  private text: Phaser.GameObjects.Text;
  private value: number;
  private targetValue: number | undefined;
  private step: "100" | "75" | "50" | "25" | "10" = "100";
  

  constructor(scene: Phaser.Scene, option: { x: number; y: number }) {
    super(scene);
    
    
    this.hpState = store<number>(`pet.hp`);

    this.value =
      typeof this.hpState?.get() === "number"
        ? this.hpState?.get()
        : DEFAULT_HP;
    this.hpState?.watch(this.handleSetValue);

    const { x, y } = option;

    // Icon
    this.icon = scene.make
      .sprite({
        key: "pet_header_icons",
        frame: "hp-empty",
        x: x,
        y: y,
      })
      .setOrigin(0);

    if (!scene.anims.exists("hp-100")) {
      scene.anims.create({
        key: "hp-100",
        frames: scene.anims.generateFrameNames("pet_header_icons", {
          prefix: `hp-100-`,
          start: 1,
          end: 5,
        }),
        repeat: -1,
        frameRate: 6,
      });
    }

    if (!scene.anims.exists("hp-75")) {
      scene.anims.create({
        key: "hp-75",
        frames: scene.anims.generateFrameNames("pet_header_icons", {
          prefix: `hp-75-`,
          start: 1,
          end: 5,
        }),
        repeat: -1,
        frameRate: 6,
      });
    }

    if (!scene.anims.exists("hp-50")) {
      scene.anims.create({
        key: "hp-50",
        frames: scene.anims.generateFrameNames("pet_header_icons", {
          prefix: `hp-50-`,
          start: 1,
          end: 5,
        }),
        repeat: -1,
        frameRate: 6,
      });
    }

    if (!scene.anims.exists("hp-25")) {
      scene.anims.create({
        key: "hp-25",
        frames: scene.anims.generateFrameNames("pet_header_icons", {
          prefix: `hp-25-`,
          start: 1,
          end: 5,
        }),
        repeat: -1,
        frameRate: 6,
      });
    }

    this.icon.play(`hp-100`);
    this.add(this.icon);

    // Text
    this.text = scene.make
      .text({
        x: x + 12,
        y: y + 2,
        style: { fontFamily: FONT_FAMILY, fontSize: FONT_SIZE, color: "#000" },
        text: "",
      })
      .setOrigin(0);
    this.text.setResolution(4);
    this.add(this.text);

    // Apply first
    this.applyIconAndValue();
  }

  private handleSetValue = (value: number) => {
    this.targetValue = value;
  };

  private applyIconAndValue() {
    if (this.value > 75 && this.value <= 100 && this.step != "100") {
      this.icon.play(`hp-100`);
      this.step = "100";
    } else if (this.value > 50 && this.value <= 75 && this.step != "75") {
      this.icon.play(`hp-75`);
      this.step = "75";
    } else if (this.value > 25 && this.value <= 50 && this.step != "50") {
      this.icon.play(`hp-50`);
      this.step = "50";
    } else if (this.value > 10 && this.value <= 25 && this.step != "25") {
      this.icon.play(`hp-25`);
      this.step = "25";
    } else if (this.value <= 10 && this.step != "10") {
      this.icon.anims.complete();
      this.icon.setFrame("hp-empty");
      this.step = "10";
    }
    this.text.setText(this.value.toString());
  }

  public update() {
    if (typeof this.targetValue === "undefined") return; // return when value still running

    if (this.targetValue > this.value) {
      this.value += 1;
    } else if (this.targetValue < this.value) {
      this.value -= 1;
    } else {
      this.targetValue = undefined;
    }
    this.applyIconAndValue();
  }

  public destroy() {
    this.icon.destroy();
    this.text.destroy();
  }
}
