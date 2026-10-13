import Phaser from 'phaser';
import { assetUrl } from '@/utils/assetUrl';
import { WorkspaceAtlasEntry } from '../types';
import { importAtlasTrio, ImportAtlasTrioResult } from './import';

/**
 * Load a shipped ("workspace") atlas as an editable project.
 *
 * This is how the editor gets something to edit. The scene uses it to boot
 * straight into the sprite editor with the default character already loaded,
 * and the library screen uses it for CREATE NEW and for an explicit atlas
 * import — one code path, so those three cannot drift apart.
 *
 * Which atlases are *allowed* here is decided in template.ts
 * (`parseEditableAtlasList`); this function only fetches and slices.
 *
 * The factory files are read directly, not the running game's textures: a saved
 * customization replaces the atlas wholesale, so the live data is the user's
 * last edit rather than the thing being edited against.
 */
export async function loadWorkspaceAtlasProject(
  scene: Phaser.Scene,
  atlas: WorkspaceAtlasEntry,
): Promise<ImportAtlasTrioResult> {
  const [pngResponse, spritesheetResponse, animationsResponse] = await Promise.all([
    fetch(assetUrl(atlas.png)),
    fetch(assetUrl(atlas.json)),
    atlas.animations ? fetch(assetUrl(atlas.animations)) : Promise.resolve(null),
  ]);

  if (!pngResponse.ok) {
    throw new Error(`Failed to load atlas PNG at ${atlas.png}`);
  }
  if (!spritesheetResponse.ok) {
    throw new Error(`Failed to load atlas JSON at ${atlas.json}`);
  }
  if (animationsResponse && !animationsResponse.ok) {
    throw new Error(`Failed to load animations JSON at ${atlas.animations}`);
  }

  return importAtlasTrio({
    scene,
    pngBlob: await pngResponse.blob(),
    spritesheetJsonText: await spritesheetResponse.text(),
    animationsJsonText: animationsResponse ? await animationsResponse.text() : undefined,
    projectNameHint: atlas.atlasId,
  });
}
