import { setRuntimeData, runtimeData } from "@/game/runtimeData";
import {
  PrimaryDialogue,
} from "@/game/components/PrimaryDialogue";
import { selectFromPriority } from "@/game/utils/selectFromPriority";
import { t } from "@/game/utils/i18n";
import { getStaticData } from "@/game/staticData";
import { PET_STATIC_KEYS, getPetRuntimeDataKey } from "../../constants";
import { CharacterConfig, CharacterStageItem, DialogItem } from "./types";
import { KnownRuntimeDataKey } from "@/game/runtimeData/types";


export class PetDialogue extends Phaser.GameObjects.Container {
  private dialogue: PrimaryDialogue;

  constructor(scene: Phaser.Scene) {
    super(scene);

    // Window
    const dialogueConfig = getStaticData<any>("global.dialogue") || {};
    this.dialogue = new PrimaryDialogue(scene);
    this.dialogue.initDialogue(
      {
        ...dialogueConfig,
        sceneWidth: (runtimeData("system.core") as any)?.get()?.canvas?.width || 160,
        sceneHeight: (runtimeData("system.core") as any)?.get()?.canvas?.height || 144
      },
      {
        onDialogueStart: () => setRuntimeData("global.is_paused", true),
        onDialogueEnd: () => setRuntimeData("global.is_paused", false),
      }
    );
  }

  private getCurrentAtlasId(): string {
    const config = getStaticData<CharacterConfig>(PET_STATIC_KEYS.CHARACTER);
    if (!config || !config.atlasId) {
      console.error("[PetDialogue] Invalid CharacterConfig: Missing atlasId");
      return "";
    }

    let atlasId = config.atlasId;

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
    dialogues: DialogItem[],
    replacement?: { [key: string]: string | number },
  ) {
    if (dialogues && replacement) {
      const atlasId = this.getCurrentAtlasId();
      
      const selectedDialog = selectFromPriority<DialogItem>(dialogues);
      const selectedSentences = selectedDialog.sentences.map((_sentence) => {
        let portrait = `${atlasId}_${_sentence.portrait}`;
        let text = _sentence.scriptId ? t(_sentence.scriptId, replacement, _sentence.text) : (_sentence.text || "");
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
