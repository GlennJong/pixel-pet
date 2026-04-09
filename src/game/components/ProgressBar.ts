import { Scene } from "phaser";

export interface IProgressBarConfig {
  x: number;
  y: number;
  width: number;
  height: number;
  textOffsetY: number;
  fontSize: string;
  fontFamily: string;
  textColor: string;
  bgColor: number;
  bgAlpha: number;
  fgColor: number;
  fgAlpha: number;
}

export class ProgressBar {
  private background: Phaser.GameObjects.Graphics;
  private foreground: Phaser.GameObjects.Graphics;
  private text: Phaser.GameObjects.Text;
  
  constructor(scene: Scene, config: IProgressBarConfig) {
    this.background = scene.add.graphics();
    this.background.fillStyle(config.bgColor, config.bgAlpha);
    this.background.fillRect(config.x, config.y, config.width, config.height);
    
    this.foreground = scene.add.graphics();
    
    this.text = scene.add.text(
      config.x + config.width / 2, 
      config.y + config.textOffsetY, 
      "Loading... 0%", 
      {
        fontSize: config.fontSize,
        color: config.textColor,
        fontFamily: config.fontFamily,
        resolution: 2
      }
    ).setOrigin(0.5, 0.5);

    scene.load.on("progress", (value: number) => {
      this.foreground.clear();
      this.foreground.fillStyle(config.fgColor, config.fgAlpha);
      this.foreground.fillRect(
        config.x + 2, 
        config.y + 2, 
        (config.width - 4) * value, 
        config.height - 4
      );
      
      this.text.setText(`Loading... ${Math.floor(value * 100)}%`);
    });

    scene.load.on("complete", () => {
      this.destroy();
    });
  }

  destroy() {
    this.background.destroy();
    this.foreground.destroy();
    this.text.destroy();
  }
}
