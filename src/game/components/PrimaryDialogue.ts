import Phaser from "phaser";

export type TDialogData = {
  portrait: string;
  text: string;
};

const SCENE_WIDTH = 160;
const SCENE_HEIGHT = 144;

const PORTRAIT_SIZE = 32;
const PORTRAIT_FRAME_SIZE = 40;
const PORTRAIT_X = 0;
const PORTRAIT_Y = SCENE_HEIGHT - PORTRAIT_FRAME_SIZE;

const DIALOGUE_WIDTH = 120;
const DIALOGUE_HEIGHT = 40;
const DIALOGUE_X = SCENE_WIDTH - DIALOGUE_WIDTH;
const DIALOGUE_Y = SCENE_HEIGHT - DIALOGUE_HEIGHT;
const DIALOGUE_PADDING_X = 8;
const DIALOGUE_PADDING_Y = 8;

const TEXTBOX_X = DIALOGUE_X + DIALOGUE_PADDING_X;
const TEXTBOX_Y = DIALOGUE_Y + DIALOGUE_PADDING_Y;
const TEXTBOX_WIDTH = DIALOGUE_WIDTH - DIALOGUE_PADDING_X * 2;
// const TEXTBOX_HEIGHT = DIALOGUE_HEIGHT - DIALOGUE_PADDING_Y * 2; // unused
const TEXTBOX_FONT_FAMILY = "BoutiqueBitmap";
const TEXTBOX_FONT_SIZE = 10;
const TEXTBOX_FONT_COLOR = "#000000";
const TEXTBOX_LINE_SPACING = 4;

const DEFAULT_LETTER_DISPLAY_SPEED = 50;
const DEFAULT_AUTO_PAGE_SWITCH_DELAY = 1000;

const DIALOGUE_FRAME_CONFIG = {
  key: "dialogue_frame",
  frame: "frame",
  leftWidth: 8,
  rightWidth: 8,
  topHeight: 8,
  bottomHeight: 8,
  x: DIALOGUE_X,
  y: DIALOGUE_Y,
  width: DIALOGUE_WIDTH,
  height: DIALOGUE_HEIGHT,
};

const PORTRAIT_FRAME_CONFIG = {
  key: "dialogue_frame",
  frame: "frame",
  leftWidth: 8,
  rightWidth: 8,
  topHeight: 8,
  bottomHeight: 8,
  x: PORTRAIT_X,
  y: PORTRAIT_Y,
  width: PORTRAIT_FRAME_SIZE,
  height: PORTRAIT_FRAME_SIZE,
};

const PORTRAIT_CONFIG = {
  x: PORTRAIT_X + 4,
  y: PORTRAIT_Y + 4,
  width: PORTRAIT_SIZE,
  height: PORTRAIT_SIZE,
};

const TEXTBOX_CONFIT = {
  fontFamily: TEXTBOX_FONT_FAMILY,
  fontSize: `${TEXTBOX_FONT_SIZE}px`,
  color: TEXTBOX_FONT_COLOR,
  wordWrap: {
    width: TEXTBOX_WIDTH,
    useAdvancedWrap: true,
  },
  lineSpacing: TEXTBOX_LINE_SPACING,
  resolution: 3,
};

const MOCK_TEXTBOX_CONFIT = {
  style: {
    fontFamily: TEXTBOX_FONT_FAMILY,
    fontSize: `${TEXTBOX_FONT_SIZE}px`,
    wordWrap: {
      width: TEXTBOX_WIDTH,
      useAdvancedWrap: true,
    },
    lineSpacing: TEXTBOX_LINE_SPACING,
  },
  x: 0,
  y: 0,
  text: "",
};

export class PrimaryDialogue extends Phaser.GameObjects.Container {
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
  private letterDisplaySpeed = DEFAULT_LETTER_DISPLAY_SPEED;
  private autoPageSwitchDelay = DEFAULT_AUTO_PAGE_SWITCH_DELAY;

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
    const mockText = this.scene.make
      .text({
        ...MOCK_TEXTBOX_CONFIT,
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
      delay: this.letterDisplaySpeed,
      callback: this.handleTypeLetter,
      callbackScope: this,
      loop: true,
    });
  }

  private handleTypeLetter() {
    if (this.currentLetterIndex < this.currentDialogueSegment.length) {
      this.textbox!.setText(
        this.currentDialogueSegment.substring(0, this.currentLetterIndex + 1),
      ); // 變更為 this.textbox
      this.currentLetterIndex++;
    } else {
      this.dialogueTimer!.remove();

      if (this.autoPageSwitchDelay === 0) return; // 新增的判斷，如果延遲為0則不自動換頁

      // 條件 1: 當前頁面已完成，且當前對話條目中還有更多頁面
      if (this.currentPageIndex < this.dialoguePages.length - 1) {
        this.autoPageSwitchTimer = this.scene.time.addEvent({
          delay: this.autoPageSwitchDelay,
          callback: this.handleAdvancePage, // 變更為 handleAdvancePage
          callbackScope: this, // 確保回呼函式中的 'this' 指向 PrimaryDialogue 實例
          loop: false, // 只執行一次
        });
      }
      // 條件 2: 當前頁面是當前對話條目的最後一頁，且還有更多對話條目要來。
      else if (this.currentDialogueEntryIndex < this.dialogueData.length - 1) {
        this.autoPageSwitchTimer = this.scene.time.addEvent({
          delay: this.autoPageSwitchDelay,
          callback: this.handleAdvancePage, // 變更為 handleAdvancePage
          callbackScope: this, // 確保回呼函式中的 'this' 指向 PrimaryDialogue 實例
          loop: false, // 只執行一次
        });
      }
      // 條件 3: 當前頁面是當前對話條目的最後一頁，
      else if (
        this.currentPageIndex === this.dialoguePages.length - 1 &&
        this.currentDialogueEntryIndex === this.dialogueData.length - 1
      ) {
        this.autoPageSwitchTimer = this.scene.time.addEvent({
          delay: this.autoPageSwitchDelay,
          callback: this.handleAdvancePage, // 這將導致呼叫 setHideDialogueBox()
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

  public initDialogue(params?: {
    onDialogueStart?: () => void;
    onDialogueEnd?: () => void;
  }) {
    const { onDialogueStart, onDialogueEnd } = params || {};
    this.onDialogueStart = onDialogueStart;
    this.onDialogueEnd = onDialogueEnd;

    this.textboxBackground = this.scene.make
      .nineslice({
        ...DIALOGUE_FRAME_CONFIG,
      })
      .setOrigin(0)
      .setVisible(false)
      .setDepth(998);

    this.portraitBackground = this.scene.make
      .nineslice({
        ...PORTRAIT_FRAME_CONFIG,
      })
      .setOrigin(0)
      .setVisible(false)
      .setDepth(998);

    this.portrait = this.scene.make
      .sprite({
        ...PORTRAIT_CONFIG,
        // key: 'pet_room',
        // frame: 'room',
      })
      .setDisplaySize(PORTRAIT_SIZE, PORTRAIT_SIZE)
      .setOrigin(0)
      .setDepth(999)
      .setVisible(false);

    this.textbox = this.scene.add
      .text(TEXTBOX_X, TEXTBOX_Y, "", {
        ...TEXTBOX_CONFIT,
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
    // Release event listeners (if any)
    // this.scene.input.off('pointerdown', this.boundAdvancePage);
  }
}
