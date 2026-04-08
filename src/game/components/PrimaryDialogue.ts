import Phaser from "phaser";
import { GLOBAL_DIALOGUE_AUTO_NEXT_DELAY } from "../constants";

export type TDialogData = {
  portrait: string;
  text: string;
};

export interface IPrimaryDialogueConfig {
  sceneWidth: number;
  sceneHeight: number;
  portraitSize?: number;
  portraitFrameSize?: number;
  dialogueWidth?: number;
  dialogueHeight?: number;
  dialoguePaddingX?: number;
  dialoguePaddingY?: number;
  fontFamily?: string;
  fontSize?: number;
  fontColor?: string;
  lineSpacing?: number;
  letterDisplaySpeed?: number;
  autoPageSwitchDelay?: number;
  frameKey: string;
  frameFrame: string;
}

const DEFAULT_CONFIG = {
  portraitSize: 32,
  portraitFrameSize: 40,
  dialogueWidth: 120,
  dialogueHeight: 40,
  dialoguePaddingX: 8,
  dialoguePaddingY: 8,
  fontFamily: "monospace",
  fontSize: 10,
  fontColor: "#000000",
  lineSpacing: 4,
  letterDisplaySpeed: 50,
  autoPageSwitchDelay: GLOBAL_DIALOGUE_AUTO_NEXT_DELAY,
};

export class PrimaryDialogue extends Phaser.GameObjects.Container {
  private config!: Required<IPrimaryDialogueConfig>;

  private onDialogueStart?: () => void;
  private onDialogueEnd?: () => void;

  // Elements
  private portraitBackground?: Phaser.GameObjects.NineSlice;
  private portrait?: Phaser.GameObjects.Sprite;
  private textboxBackground?: Phaser.GameObjects.NineSlice;
  private textbox?: Phaser.GameObjects.Text;

  // Timers
  private dialogueTimer: Phaser.Time.TimerEvent | null = null;
  private autoPageSwitchTimer: Phaser.Time.TimerEvent | null = null;

  // Data
  private dialogueData: TDialogData[] = [];
  private currentDialogueEntryIndex = 0;

  private currentDialogueSegment: string = "";
  private currentLetterIndex: number = 0;

  private resolvePromise: ((value?: unknown) => void) | null = null;

  private setPortrait = (portrait: string) => {
    // TODO: get portrait with key
    if (this.portrait && portrait) {
      this.portrait.play(portrait);
    }
  };

  private setShowDialogueBox() {
    this.portraitBackground!.setVisible(true);
    this.portrait!.setVisible(true);
    this.textboxBackground!.setVisible(true);
    this.textbox!.setVisible(true);
  }

  private setHideDialogueBox() {
    this.portraitBackground!.setVisible(false);
    this.portrait!.setVisible(false);
    this.textboxBackground!.setVisible(false);
    this.textbox!.setVisible(false);
    if (this.dialogueTimer) {
      this.dialogueTimer.remove();
      this.dialogueTimer = null;
    }
    if (this.autoPageSwitchTimer) {
      this.autoPageSwitchTimer.remove();
      this.autoPageSwitchTimer = null;
    }
  }

  private handleStartDialogueEntry() {
    if (this.autoPageSwitchTimer) {
      this.autoPageSwitchTimer.remove();
      this.autoPageSwitchTimer = null;
    }

    const currentEntry = this.dialogueData[this.currentDialogueEntryIndex];
    this.setPortrait(currentEntry.portrait);
    this.handleShowDialogue(currentEntry.text);
  }

  private paginateDialogue = (fullText: string) => {
    const pages = [];
    
    // Calculate layout based on config
    const textboxWidth = this.config.dialogueWidth - this.config.dialoguePaddingX * 2;

    const mockText = this.scene.make
      .text({
        style: {
          fontFamily: this.config.fontFamily,
          fontSize: `${this.config.fontSize}px`,
          wordWrap: {
            width: textboxWidth,
            useAdvancedWrap: true,
          },
          lineSpacing: this.config.lineSpacing,
        },
        x: 0,
        y: 0,
        text: "",
      })
      .setVisible(false);
      
    let currentWorkingSegment = "";
    let tempPageCandidate = "";

    for (let i = 0; i < fullText.length; i++) {
      const char = fullText[i];

      if (char === "\n") {
        if (currentWorkingSegment !== "") {
          mockText.setText(currentWorkingSegment);
          pages.push(mockText.getWrappedText().join("\n"));
        }
        currentWorkingSegment = "";
        tempPageCandidate = "";
        continue;
      }

      const testSegment = currentWorkingSegment + char;
      mockText.setText(testSegment);
      const wrappedLines = mockText.getWrappedText();

      if (wrappedLines.length <= 2) {
        currentWorkingSegment = testSegment;
        tempPageCandidate = wrappedLines.join("\n");
      } else {
        pages.push(tempPageCandidate);
        currentWorkingSegment = char;
        mockText.setText(currentWorkingSegment);
        tempPageCandidate = mockText.getWrappedText().join("\n");
      }
    }

    if (currentWorkingSegment !== "") {
      mockText.setText(currentWorkingSegment);
      pages.push(mockText.getWrappedText().join("\n"));
    }

    mockText.destroy();
    return pages;
  };

  private fullDialogueContent: string = "";
  private dialoguePages: string[] = [];
  private currentPageIndex: number = 0;

  private handleShowDialogue(text: string) {
    this.fullDialogueContent = text;
    this.dialoguePages = this.paginateDialogue(this.fullDialogueContent);
    this.currentPageIndex = 0;
    this.handleDisplayCurrentPage();
  }

  private handleDisplayCurrentPage() {
    if (this.dialogueTimer) {
      this.dialogueTimer.remove();
    }
    if (this.autoPageSwitchTimer) {
      this.autoPageSwitchTimer.remove();
      this.autoPageSwitchTimer = null;
    }

    this.currentDialogueSegment = this.dialoguePages[this.currentPageIndex];
    this.currentLetterIndex = 0;
    this.textbox!.setText("");

    this.dialogueTimer = this.scene.time.addEvent({
      delay: this.config.letterDisplaySpeed,
      callback: this.handleTypeLetter,
      callbackScope: this,
      loop: true,
    });
  }

  private handleTypeLetter() {
    if (this.currentLetterIndex < this.currentDialogueSegment.length) {
      this.textbox!.setText(
        this.currentDialogueSegment.substring(0, this.currentLetterIndex + 1),
      );
      this.currentLetterIndex++;
    } else {
      this.dialogueTimer!.remove();

      if (this.config.autoPageSwitchDelay === 0) return;

      if (this.currentPageIndex < this.dialoguePages.length - 1) {
        this.autoPageSwitchTimer = this.scene.time.addEvent({
          delay: this.config.autoPageSwitchDelay,
          callback: this.handleAdvancePage,
          callbackScope: this,
          loop: false,
        });
      }
      else if (this.currentDialogueEntryIndex < this.dialogueData.length - 1) {
        this.autoPageSwitchTimer = this.scene.time.addEvent({
          delay: this.config.autoPageSwitchDelay,
          callback: this.handleAdvancePage,
          callbackScope: this,
          loop: false,
        });
      }
      else if (
        this.currentPageIndex === this.dialoguePages.length - 1 &&
        this.currentDialogueEntryIndex === this.dialogueData.length - 1
      ) {
        this.autoPageSwitchTimer = this.scene.time.addEvent({
          delay: this.config.autoPageSwitchDelay,
          callback: this.handleAdvancePage,
          callbackScope: this,
          loop: false,
        });
      }
    }
  }

  private handleAdvancePage() {
    if (this.autoPageSwitchTimer) {
      this.autoPageSwitchTimer.remove();
      this.autoPageSwitchTimer = null;
    }

    this.currentPageIndex++;

    if (this.currentPageIndex <= this.dialoguePages.length - 1) {
      this.handleDisplayCurrentPage();
    } else {
      this.currentDialogueEntryIndex++;
      if (this.currentDialogueEntryIndex < this.dialogueData.length) {
        this.handleStartDialogueEntry();
      } else {
        this.setHideDialogueBox();
        if (this.resolvePromise) {
          this.resolvePromise(undefined);
          this.resolvePromise = null;
        }
      }
    }
  }

  // Public
  public runDialogue(dialogues: TDialogData[]) {
    if (this.onDialogueStart) this.onDialogueStart();
    this.dialogueData = dialogues;
    this.currentDialogueEntryIndex = 0;
    this.setShowDialogueBox();

    return new Promise((resolve) => {
      this.resolvePromise = resolve;
      this.handleStartDialogueEntry();
    }).finally(() => {
      if (this.onDialogueEnd) this.onDialogueEnd();
    });
  }

  public initDialogue(
    config: IPrimaryDialogueConfig,
    params?: {
      onDialogueStart?: () => void;
      onDialogueEnd?: () => void;
    }
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config } as Required<IPrimaryDialogueConfig>;

    const { onDialogueStart, onDialogueEnd } = params || {};
    this.onDialogueStart = onDialogueStart;
    this.onDialogueEnd = onDialogueEnd;

    const portraitX = 0;
    const portraitY = this.config.sceneHeight - this.config.portraitFrameSize;
    const dialogueX = this.config.sceneWidth - this.config.dialogueWidth;
    const dialogueY = this.config.sceneHeight - this.config.dialogueHeight;
    const textboxX = dialogueX + this.config.dialoguePaddingX;
    const textboxY = dialogueY + this.config.dialoguePaddingY;
    const textboxWidth = this.config.dialogueWidth - this.config.dialoguePaddingX * 2;

    this.textboxBackground = this.scene.make
      .nineslice({
        key: this.config.frameKey,
        frame: this.config.frameFrame,
        leftWidth: 8,
        rightWidth: 8,
        topHeight: 8,
        bottomHeight: 8,
        x: dialogueX,
        y: dialogueY,
        width: this.config.dialogueWidth,
        height: this.config.dialogueHeight,
      })
      .setOrigin(0)
      .setVisible(false)
      .setDepth(998);

    this.portraitBackground = this.scene.make
      .nineslice({
        key: this.config.frameKey,
        frame: this.config.frameFrame,
        leftWidth: 8,
        rightWidth: 8,
        topHeight: 8,
        bottomHeight: 8,
        x: portraitX,
        y: portraitY,
        width: this.config.portraitFrameSize,
        height: this.config.portraitFrameSize,
      })
      .setOrigin(0)
      .setVisible(false)
      .setDepth(998);

    this.portrait = this.scene.make
      .sprite({
        x: portraitX + 4,
        y: portraitY + 4,
      })
      .setDisplaySize(this.config.portraitSize, this.config.portraitSize)
      .setOrigin(0)
      .setDepth(999)
      .setVisible(false);

    this.textbox = this.scene.add
      .text(textboxX, textboxY, "", {
        fontFamily: this.config.fontFamily,
        fontSize: `${this.config.fontSize}px`,
        color: this.config.fontColor,
        wordWrap: {
          width: textboxWidth,
          useAdvancedWrap: true,
        },
        lineSpacing: this.config.lineSpacing,
        resolution: 3,
      })
      .setDepth(2)
      .setOrigin(0)
      .setDepth(999)
      .setVisible(false);
  }

  // Destory
  destroy() {
    // Release UI elements
    if (this.textboxBackground) {
      this.textboxBackground.destroy();
      this.textboxBackground = undefined;
    }
    if (this.textbox) {
      this.textbox.destroy();
      this.textbox = undefined;
    }
    if (this.portraitBackground) {
      this.portraitBackground.destroy();
      this.portraitBackground = undefined;
    }
    if (this.portrait) {
      this.portrait.destroy();
      this.portrait = undefined;
    }
    // Release timers
    if (this.dialogueTimer) {
      this.dialogueTimer.remove();
      this.dialogueTimer = null;
    }
    if (this.autoPageSwitchTimer) {
      this.autoPageSwitchTimer.remove();
      this.autoPageSwitchTimer = null;
    }
    // Release promise reference
    this.resolvePromise = null;
    // Release callback references to avoid closure leaks
    this.onDialogueStart = undefined;
    this.onDialogueEnd = undefined;
  }
}
