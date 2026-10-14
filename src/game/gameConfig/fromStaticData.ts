import { getStaticData } from '@/game/staticData';
import type { GameConfigFiles } from './types';

/**
 * The game config as the running game loaded it.
 *
 * The preloader files each manifest entry under its key split on `_`
 * (`pet_character` → `pet.character`), so these paths mirror manifest.json.
 * Returns undefined when any file is missing — the editor launched on its own,
 * without the preloader, has no game config to edit.
 */
export function gameConfigFromStaticData(): GameConfigFiles | undefined {
  const files = {
    character: getStaticData('pet.character'),
    conditions: getStaticData('pet.conditions'),
    effects: getStaticData('pet.effects'),
    autoActions: getStaticData('pet.autoActions'),
    stats: getStaticData('pet.stats'),
    commands: getStaticData('commands'),
    header: getStaticData('pet.header'),
    room: getStaticData('pet.room'),
    dialogue: getStaticData('global.dialogue'),
    locale: getStaticData('locales.zh-tw'),
  };
  return Object.values(files).every((v) => v != null) ? (files as GameConfigFiles) : undefined;
}
