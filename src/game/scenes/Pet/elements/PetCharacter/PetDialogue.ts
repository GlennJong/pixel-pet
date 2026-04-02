import { setRuntimeData, runtimeData } from "@/game/runtimeData";
import {
  PrimaryDialogue,
  TDialogData,
} from "@/game/components/PrimaryDialogue";
import { selectFromPriority } from "@/game/utils/selectFromPriority";
import { getStaticData } from "@/game/staticData";
import { PET_STATIC_KEYS, getPetRuntimeDataKey } from "../../constants";
import { CharacterConfig, CharacterStageItem } from "./types";
import { KnownRuntimeDataKey } from "@/game/runtimeData/types";
import { PET_DEFAULT_CHARACTER_ID } from "@/game/constants";

type TDialogItem = {
  sentences: TDialogData[];
  priority: number;
};

export class PetDialogue extends Phaser.GameObjects.Container {
  private dialogue: PrimaryDialogue;

  constructor(scene: Phaser.Scene) {
    super(scene);

    // Window
    this.dialogue = new PrimaryDialogue(scene);
    this.dialogue.initDialogue({
      onDialogueStart: () => setRuntimeData("global.is_paused", true),
      onDialogueEnd: () => setRuntimeData("global.is_paused", false),
    });
  }

  private getCurrentAtlasId(): string {
    const config = getStaticData<CharacterConfig>(PET_STATIC_KEYS.CHARACTER);
    if (!config) return PET_DEFAULT_CHARACTER_ID;

    let atlasId = config.atlasId || PET_DEFAULT_CHARACTER_ID;

    if (config.watch && config.stages) {
      const watchKey = getPetRuntimeDataKey(config.watch);
      const level = runtimeData(watchKey as KnownRuntimeDataKey)?.get() || 0;
      const currentConfig =
        config.stages.find((l: CharacterStageItem) => l.value === level) || config.stages[0];
      
      if (currentConfig && currentConfig.atlasId) {
        atlasId = currentConfig.atlasId;
      }
    }
    
    return atlasId;
  }

  public async runDialogue(
    dialogues: TDialogItem[],
    replacement?: { [key: string]: string | number },
  ) {
    if (dialogues && replacement) {
      const atlasId = this.getCurrentAtlasId();
      
      const selectedDialog = selectFromPriority<TDialogItem>(dialogues);
      const selectedSentences = selectedDialog.sentences.map((_sentence) => {
        let portrait = `${atlasId}_${_sentence.portrait}`;
        let text = _sentence.text;
        if (replacement) {
          Object.entries(replacement).forEach(([key, value]) => {
            let displayValue = value;
            if (typeof value === "number") displayValue = Math.abs(value);
            text = text.replaceAll(`{{${key}}}`, String(displayValue));
          });
        }
        return {
          ..._sentence,
          portrait,
          text,
        };
      });
      await this.dialogue.runDialogue(selectedSentences);
    }
  }

  public destroy() {
    this.dialogue.destroy();
    super.destroy();
  }
}
