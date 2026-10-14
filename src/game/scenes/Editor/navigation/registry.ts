import { AtlasPickerScreen } from '../screens/AtlasPickerScreen';
import { LibraryScreen } from '../screens/LibraryScreen';
import { SpriteEditScreen } from '../screens/SpriteEditScreen';
import { FrameSelectorScreen } from '../screens/FrameSelectorScreen';
import { ListScreen } from '../screens/ListScreen';
import { PreviewGridScreen } from '../screens/PreviewGridScreen';
import { ActionFormScreen } from '../screens/ActionFormScreen';
import { TextEditScreen } from '../screens/TextEditScreen';
import { findGroup, findItem, groupRows, segmentRows } from '../action/rows';
import { PORTRAIT_PREFIX, portraitLabel } from '../action/catalog';
import type { EditableStat, GameConfigProject } from '../action/GameConfigProject';
import {
  EditorContext,
  ScreenId,
  ScreenParams,
  ScreenSpec,
  NavModeId,
} from './types';
import { ActionSpec } from './types';
import { ButtonConfig } from '../elements';
import { buildPresetSpritesFromImages } from '../utils/smartInput';
import { deleteImages } from '../utils/imageLibrary';
import { LibraryProceedPayload, WorkspaceAtlasEntry } from '../types';

/**
 * The editor's navigation, as data.
 *
 * One entry per screen, each saying four things and nothing else:
 *
 *   nav     – the buttons along the bottom, recomputed from live state
 *   build   – how to construct the screen
 *   actions – what each button does, and what to ask before doing it
 *   events  – what to do when the screen reports something
 *
 * To change which buttons a screen offers, or to add a confirmation to one,
 * edit this file and nothing else. Screens never build a bottom bar of their
 * own, so two can never fight over the same strip.
 */

// ── Shared buttons ───────────────────────────────────────────────────────────

const SAVE: ButtonConfig = { key: 'save', label: 'SAVE' };
const EXIT: ButtonConfig = { key: 'exit', label: 'EXIT' };

/** Adapts the context's nav focusable to the NavHost shape the screens take. */
const navHost = (ctx: EditorContext) => ({
  buildNavFocusable: ctx.navFocusable,
});

/** True for the picker as the editor's entry point, false for "load other data". */
function isRootPicker(ctx: EditorContext): boolean {
  const params = ctx.params();
  return params.screen !== 'picker' || params.root !== false;
}

// ── Nav sub-menus ────────────────────────────────────────────────────────────

/**
 * Shown in place of a screen's own nav after SAVE. APPLY writes the
 * customization into the running game; EXPORT downloads the artifacts.
 */
export const NAV_MODES: Record<NavModeId, {
  buttons: ButtonConfig[];
  actions: Record<string, ActionSpec>;
}> = {
  save: {
    buttons: [
      { key: 'apply', label: 'APPLY' },
      { key: 'export', label: 'EXPORT' },
      { key: 'cancel', label: 'CANCEL' },
    ],
    actions: {
      apply: {
        run: async (ctx) => { ctx.app.commitSprites(); await ctx.app.applyCustomization(); },
      },
      export: {
        run: async (ctx) => { ctx.app.commitSprites(); await ctx.app.exportArtifacts(); },
      },
      cancel: { run: (ctx) => ctx.setNavMode(null) },
    },
  },
};

/**
 * Leave the picker: out of the editor when it is the first screen, otherwise
 * back to whichever screen opened it (the library, or the basic editor).
 */
function leavePicker(ctx: EditorContext) {
  if (isRootPicker(ctx)) { ctx.exitEditor(); return; }
  const p = paramsOf(ctx, 'picker');
  ctx.go(p.returnTo ?? { screen: 'library' });
}

/**
 * Bring the sprite configs in line with the images before showing them: drop
 * frame references whose image is gone (deleting an image must not leave a card
 * pointing at nothing), then, only for a project with no configs at all, guess
 * a starting set from the file names.
 */
function prepareSprites(ctx: EditorContext) {
  const validIds = new Set(ctx.data.images.map((img) => img.id));
  ctx.data.sprites = ctx.data.sprites.map((sp) => ({
    ...sp,
    frames: sp.frames.filter((id) => validIds.has(id)),
  }));

  if (ctx.data.sprites.length > 0) return;

  const preset = buildPresetSpritesFromImages(ctx.data.images);
  if (preset.sprites.length === 0) return;

  ctx.data.sprites = preset.sprites;
  console.log('[Editor] Smart preset applied', {
    spriteCount: preset.sprites.length,
    parsedImageCount: preset.parsedImageCount,
    skippedImageCount: preset.skippedImageCount,
    detectedKeys: preset.detectedKeys,
  });
}

// ── Basic editor helpers ─────────────────────────────────────────────────────

const BACK: ButtonConfig = { key: 'back', label: 'BACK' };

/** The current screen's params, narrowed to the screen the caller is on. */
function paramsOf<S extends ScreenParams['screen']>(ctx: EditorContext, _screen: S) {
  return ctx.params() as Extract<ScreenParams, { screen: S }>;
}

function config(ctx: EditorContext): GameConfigProject {
  if (!ctx.config) throw new Error('No game config loaded');
  return ctx.config;
}

/** Re-read the parts list after an edit, without rebuilding the screen. */
function refreshParts(ctx: EditorContext) {
  const p = paramsOf(ctx, 'sequence');
  const item = findItem(p.group, p.item);
  if (item) ctx.screen<ListScreen>()?.setItems(segmentRows(item, config(ctx).animation(p.action)));
  ctx.refreshNav();
}

/** Back from a performance's parts to the settings it was opened from. */
const backToDetail = (ctx: EditorContext) => {
  const p = paramsOf(ctx, 'sequence');
  ctx.go({ screen: 'detail', group: p.group, item: p.item, focus: `anim:${p.action}` });
};

/** Back from writing a line to the dialogue box it belongs to. */
const leaveText = (ctx: EditorContext) => {
  const p = paramsOf(ctx, 'text');
  ctx.go({ screen: 'detail', group: p.group, item: p.item, focus: 'dialogue:text' });
};

function saveText(ctx: EditorContext, text: string | undefined) {
  const p = paramsOf(ctx, 'text');
  if (text !== undefined) config(ctx).setDialogueText(p.action, text);
  leaveText(ctx);
}

/** Back from the animation grid to whatever it was opened for. */
const leaveChoice = (ctx: EditorContext) => {
  const p = paramsOf(ctx, 'choose');
  if (p.purpose === 'portrait') {
    ctx.go({ screen: 'detail', group: p.group, item: p.item, focus: 'dialogue' });
  } else {
    ctx.go({ screen: 'sequence', group: p.group, item: p.item, action: p.action, focus: String(p.segment ?? 0) });
  }
};

// ── Screens ──────────────────────────────────────────────────────────────────

export const SCREENS: Record<ScreenId, ScreenSpec<any>> = {
  // ── Basic editor: what the pet does ────────────────────────────────────────

  /** B1 — the editor's first screen: the groups in action/catalog.ts. */
  groups: {
    nav: () => [{ key: 'sprites', label: 'SPRITES' }, EXIT],
    navAlign: 'right',
    shortcuts: { Escape: 'cancel' },
    build: (ctx) => new ListScreen(ctx.scene, ctx.width, ctx.height, groupRows(), navHost(ctx), {
      title: '編輯角色',
      focusKey: paramsOf(ctx, 'groups').focus,
    }),
    actions: {
      // The raw sprite editor, for anything the basic editor does not cover.
      sprites: { run: (ctx) => ctx.go({ screen: 'picker', root: false, returnTo: { screen: 'groups' } }) },
      exit: { run: (ctx) => ctx.exitEditor() },
    },
    events: {
      select: (ctx, group: string) => ctx.go({ screen: 'items', group }),
      cancel: (ctx) => ctx.exitEditor(),
    },
  },

  /** B2 — the items of one group, each cell playing its performance. */
  items: {
    nav: () => [BACK],
    navAlign: 'right',
    shortcuts: { Escape: 'cancel' },
    build: (ctx) => {
      const p = paramsOf(ctx, 'items');
      const group = findGroup(p.group);
      const cfg = config(ctx);
      return new PreviewGridScreen(
        ctx.scene, ctx.width, ctx.height, group?.label ?? '', cfg.characterAtlasId,
        // A left/right pair plays left, then right.
        (group?.items ?? []).map((item, i) => ({
          id: String(i),
          label: item.label,
          parts: item.actions.flatMap((a) => cfg.animation(a)),
        })),
        { focusId: p.focus === undefined ? undefined : String(p.focus) },
        navHost(ctx),
      );
    },
    actions: {
      back: { run: (ctx) => ctx.go({ screen: 'groups', focus: paramsOf(ctx, 'items').group }) },
    },
    events: {
      pick: (ctx, index: string) => ctx.go({ screen: 'detail', group: paramsOf(ctx, 'items').group, item: Number(index) }),
      cancel: (ctx) => ctx.go({ screen: 'groups', focus: paramsOf(ctx, 'items').group }),
    },
  },

  /** B3 — one item's settings: its performance, numbers, portrait and line. */
  detail: {
    nav: () => [BACK],
    navAlign: 'right',
    shortcuts: { Escape: 'cancel' },
    build: (ctx) => {
      const p = paramsOf(ctx, 'detail');
      const group = findGroup(p.group);
      const item = findItem(p.group, p.item)!;
      return new ActionFormScreen(
        ctx.scene, ctx.width, ctx.height, `${group?.label} › ${item.label}`,
        item, config(ctx), navHost(ctx), p.focus,
      );
    },
    actions: {
      back: { run: (ctx) => { const p = paramsOf(ctx, 'detail'); ctx.go({ screen: 'items', group: p.group, focus: p.item }); } },
    },
    events: {
      'open-animation': (ctx, action: string) => {
        const p = paramsOf(ctx, 'detail');
        ctx.go({ screen: 'sequence', group: p.group, item: p.item, action });
      },
      'adjust-stat': (ctx, e: { action: string; stat: EditableStat; delta: number }) => {
        const cfg = config(ctx);
        cfg.setEffect(e.action, e.stat, (cfg.effect(e.action, e.stat) ?? 0) + e.delta);
        ctx.screen<ActionFormScreen>()?.refresh();
      },
      'open-portrait': (ctx, action: string) => {
        const p = paramsOf(ctx, 'detail');
        ctx.go({ screen: 'choose', group: p.group, item: p.item, action, purpose: 'portrait' });
      },
      'open-text': (ctx, action: string) => {
        const p = paramsOf(ctx, 'detail');
        ctx.go({ screen: 'text', group: p.group, item: p.item, action });
      },
      cancel: (ctx) => { const p = paramsOf(ctx, 'detail'); ctx.go({ screen: 'items', group: p.group, focus: p.item }); },
    },
  },

  /**
   * B3a — writing the dialogue line, full screen. Enter is a line break; the
   * line is saved or dropped from the bar, as everything else is.
   */
  text: {
    nav: () => [{ key: 'save', label: 'SAVE' }, { key: 'cancel', label: 'CANCEL' }],
    navAlign: 'right',
    shortcuts: { Escape: 'cancel' },
    build: (ctx) => {
      const p = paramsOf(ctx, 'text');
      const item = findItem(p.group, p.item);
      return new TextEditScreen(
        ctx.scene, ctx.width, ctx.height, `${item?.label ?? ''} › 台詞`,
        config(ctx).dialogue(p.action)?.text ?? '', navHost(ctx),
      );
    },
    actions: {
      save: { run: (ctx) => saveText(ctx, ctx.screen<TextEditScreen>()?.draft) },
      cancel: { run: leaveText },
    },
    events: {
      cancel: leaveText,
    },
  },

  /** B4 — the parts of one performance, played in order. */
  sequence: {
    nav: (ctx) => {
      const p = paramsOf(ctx, 'sequence');
      const parts = ctx.config?.animation(p.action).length ?? 0;
      return [
        { key: 'add', label: 'ADD' },
        // A performance needs at least one part to play.
        { key: 'delete', label: 'DEL', disabled: parts <= 1 },
        BACK,
      ];
    },
    navAlign: 'right',
    shortcuts: { Escape: 'cancel' },
    build: (ctx) => {
      const p = paramsOf(ctx, 'sequence');
      const item = findItem(p.group, p.item)!;
      return new ListScreen(
        ctx.scene, ctx.width, ctx.height,
        segmentRows(item, config(ctx).animation(p.action)), navHost(ctx),
        { title: `${item.label} › 演出`, focusKey: p.focus },
      );
    },
    actions: {
      // A new part starts as a copy of the last one, so it plays something
      // sensible until the user picks what it should be.
      add: {
        run: (ctx) => {
          const p = paramsOf(ctx, 'sequence');
          const cfg = config(ctx);
          const seq = cfg.animation(p.action);
          cfg.setAnimation(p.action, [...seq, seq[seq.length - 1]]);
          refreshParts(ctx);
        },
      },
      delete: {
        run: (ctx) => {
          const p = paramsOf(ctx, 'sequence');
          const cfg = config(ctx);
          const seq = cfg.animation(p.action);
          if (seq.length <= 1) return;
          const at = Number(ctx.screen<ListScreen>()?.cursorKey ?? seq.length - 1);
          cfg.setAnimation(p.action, seq.filter((_, i) => i !== at));
          refreshParts(ctx);
        },
      },
      back: { run: backToDetail },
    },
    events: {
      select: (ctx, index: string) => {
        const p = paramsOf(ctx, 'sequence');
        ctx.go({ screen: 'choose', group: p.group, item: p.item, action: p.action, purpose: 'segment', segment: Number(index) });
      },
      cancel: backToDetail,
    },
  },

  /**
   * B5 — pick one animation by watching them all play: for one part of a
   * performance, or for a speaker's face (the atlas's `face-*`, titled 喜/怒/哀).
   */
  choose: {
    nav: () => [BACK],
    navAlign: 'right',
    shortcuts: { Escape: 'cancel' },
    build: (ctx) => {
      const p = paramsOf(ctx, 'choose');
      const cfg = config(ctx);
      const item = findItem(p.group, p.item);
      const all = ctx.characterAnimations();
      const portrait = p.purpose === 'portrait';
      const cells = portrait
        ? all.filter((a) => a.startsWith(PORTRAIT_PREFIX)).map((a) => ({ id: a, label: portraitLabel(a), parts: [a] }))
        : all.map((a) => ({ id: a, parts: [a] }));
      const current = portrait ? cfg.dialogue(p.action)?.portrait : cfg.animation(p.action)[p.segment ?? 0];
      return new PreviewGridScreen(
        ctx.scene, ctx.width, ctx.height,
        `${item?.label ?? ''} › ${portrait ? '選擇頭像' : '選擇動畫'}`, cfg.characterAtlasId,
        cells, { markedId: current }, navHost(ctx),
      );
    },
    actions: {
      back: { run: leaveChoice },
    },
    events: {
      pick: (ctx, prefix: string) => {
        const p = paramsOf(ctx, 'choose');
        const cfg = config(ctx);
        if (p.purpose === 'portrait') {
          cfg.setPortrait(p.action, prefix);
        } else {
          const seq = cfg.animation(p.action);
          seq[p.segment ?? 0] = prefix;
          cfg.setAnimation(p.action, seq);
        }
        leaveChoice(ctx);
      },
      cancel: leaveChoice,
    },
  },

  // ── Sprite editor: what it looks like ──────────────────────────────────────

  /** S0 — which shipped sprite set to edit. The editor's first screen. */
  picker: {
    nav: (ctx) => [{ key: 'cancel', label: isRootPicker(ctx) ? 'EXIT' : 'CANCEL' }],
    navAlign: 'right',
    shortcuts: { Escape: 'cancel' },
    actions: {
      cancel: { run: (ctx) => leavePicker(ctx) },
    },
    build: (ctx) => {
      // The caller's target does not choose for the user — it only puts the
      // cursor on the row they most likely came to edit.
      const initialIndex = Math.max(
        0,
        ctx.atlasList.findIndex((a) => a.atlasId === ctx.selectedAtlas?.atlasId),
      );
      return new AtlasPickerScreen(
        ctx.scene, ctx.width, ctx.height, [...ctx.atlasList], navHost(ctx),
        { root: isRootPicker(ctx), initialIndex },
      );
    },
    events: {
      cancel: (ctx) => leavePicker(ctx),
      confirm: (ctx, p: { atlas: WorkspaceAtlasEntry }) => void ctx.app.openAtlas(p.atlas),
    },
  },

  /** S1 — staging area for a project's raw material. Reached on demand. */
  library: {
    nav: (ctx) => [
      { key: 'library', label: 'LIBRARY' },
      // Opens the sprite editor over the library's images, so it is inert while
      // the library is empty. Disabling beats letting the press through and
      // answering with an error banner.
      { key: 'sprites', label: 'SPRITES', disabled: !ctx.app.canLeaveLibrary() },
      SAVE,
      EXIT,
    ],
    navAlign: 'left',
    build: (ctx) => {
      const params = ctx.params();
      return new LibraryScreen(
        ctx.scene, ctx.width, ctx.height,
        { projectName: ctx.data.projectName, images: ctx.data.images },
        navHost(ctx),
        params.screen === 'library' ? params.startIn ?? 'edit' : 'edit',
      );
    },
    actions: {
      library: { run: (ctx) => ctx.screen<LibraryScreen>()?.showMenu() },
      sprites: { run: (ctx) => ctx.screen<LibraryScreen>()?.requestProceed() },
      save: { run: (ctx) => ctx.setNavMode('save') },
      exit: { run: (ctx) => ctx.exitEditor() },
    },
    events: {
      exit: (ctx) => ctx.exitEditor(),
      // "LOAD DATA" is a trip to the picker, not an overlay the library owns.
      'load-data': (ctx) => ctx.go({ screen: 'picker', root: false }),
      proceed: (ctx, p: LibraryProceedPayload) => {
        ctx.data.projectName = p.projectName;
        ctx.data.images = p.images;
        if (typeof p.sprites !== 'undefined') ctx.data.sprites = p.sprites;
        returnFromLibrary(ctx);
      },
    },
  },

  /**
   * S2 — the main screen. Only the two buttons that leave it: SPRITES would
   * mean "go to the screen you are on", and the library is reached by Escape.
   */
  sprites: {
    nav: () => [SAVE, EXIT],
    navAlign: 'right',
    shortcuts: { Escape: 'back' },
    build: (ctx) => {
      prepareSprites(ctx);
      return new SpriteEditScreen(
        ctx.scene, ctx.width, ctx.height, ctx.data.images, ctx.data.sprites, navHost(ctx),
      );
    },
    actions: {
      save: { run: (ctx) => ctx.setNavMode('save') },
      exit: { run: (ctx) => ctx.exitEditor() },
    },
    events: {
      // Escape — see `shortcuts`. Goes to the material view, not the entry
      // menu: from here "back" means "let me change what I have to work with",
      // which is a question the menu would ask again for no reason.
      back: (ctx) => { ctx.app.commitSprites(); ctx.go({ screen: 'library' }); },
      'go-to-frames': (ctx, p: { spriteId: string; currentFrames: string[] }) => {
        ctx.app.commitSprites();
        ctx.go({ screen: 'frames', spriteId: p.spriteId, currentFrames: p.currentFrames });
      },
    },
  },

  /**
   * S3 — picking frames for one sprite. A detour from S2, not a sibling: the
   * screen underneath is parked rather than destroyed, so coming back does not
   * reset the card list's cursor.
   */
  frames: {
    /**
     * Two button sets for the screen's two modes. The screen says which mode it
     * is in; the buttons follow, so nothing has to remember to swap them.
     *
     *   pick – CANCEL / OK(n) / ADD / EDIT
     *   edit – DELETE(n) / CANCEL
     */
    nav: (ctx) => {
      const screen = ctx.screen<FrameSelectorScreen>();
      const picked = screen?.selectedCount ?? 0;

      if (screen?.currentMode === 'edit') {
        return [
          { key: 'delete', label: picked > 0 ? `DELETE(${picked})` : 'DELETE', disabled: picked === 0 },
          { key: 'edit-cancel', label: 'CANCEL' },
        ];
      }

      return [
        { key: 'add', label: 'ADD', disabled: screen?.busy === true },
        { key: 'edit', label: 'EDIT', disabled: ctx.data.images.length === 0 },
        { key: 'confirm', label: picked > 0 ? `OK(${picked})` : 'OK' },
        { key: 'cancel', label: 'CANCEL' },
      ];
    },
    navAlign: 'right',
    overlaysPrevious: true,
    shortcuts: { Escape: 'cancel', Enter: 'confirm' },
    actions: {
      cancel: { run: (ctx) => leaveFrames(ctx) },
      confirm: {
        run: (ctx) => {
          const frameIds = ctx.screen<FrameSelectorScreen>()?.selectedIds ?? [];
          commitFramesAndLeave(ctx, frameIds);
        },
      },
      // Imports straight into the project's material, so the user never leaves
      // the screen where the gap was noticed.
      add: { run: (ctx) => ctx.screen<FrameSelectorScreen>()?.addImages() },
      edit: { run: (ctx) => ctx.screen<FrameSelectorScreen>()?.enterEditMode() },

      delete: {
        confirm: (ctx) => {
          const n = ctx.screen<FrameSelectorScreen>()?.selectedCount ?? 0;
          if (n === 0) return null;
          // Deleting material is not undoable and reaches past this screen —
          // any animation using one of these images loses that frame.
          return `Delete ${n} image${n === 1 ? '' : 's'}?\nAny animation using them loses those frames.`;
        },
        run: (ctx) => {
          const screen = ctx.screen<FrameSelectorScreen>();
          const doomed = screen?.selectedIds ?? [];
          if (doomed.length === 0) { screen?.leaveEditMode(); return; }
          // Project first, view second: the grid rebuilds itself from
          // `data.images`, so it has to be the shorter list by then.
          deleteImages(ctx.scene, ctx.data, doomed);
          // Before the view catches up: the sprite list parked behind this
          // screen is still animating the textures that just went away.
          ctx.app.syncImages();
          screen?.afterDelete(doomed);
        },
      },
      'edit-cancel': { run: (ctx) => ctx.screen<FrameSelectorScreen>()?.leaveEditMode() },
    },
    build: (ctx) => {
      const params = ctx.params();
      const currentFrames = params.screen === 'frames' ? params.currentFrames : [];
      return new FrameSelectorScreen(
        ctx.scene, ctx.width, ctx.height, ctx.data, currentFrames, navHost(ctx),
      );
    },
    events: {
      // Escape inside the grid, and Enter on it, still come through as events.
      cancel: (ctx) => leaveFrames(ctx),
      confirm: (ctx, p: { frameIds: string[] }) => commitFramesAndLeave(ctx, p.frameIds),
      // Switching modes changes the whole button set.
      mode: (ctx) => ctx.refreshNav(),
      error: (ctx, message: string) => ctx.banner(message),
    },
  },
};

/**
 * Leave the library for wherever it was entered from.
 *
 * Returning to the frame selector takes two steps, and they are spelled out
 * rather than hidden in the host: the selector is a detour *from* the sprite
 * list, so that list has to exist underneath before the detour can park it.
 */
function returnFromLibrary(ctx: EditorContext) {
  const params = ctx.params();
  const back = params.screen === 'library' ? params.returnTo : undefined;

  if (back?.screen === 'frames') {
    ctx.go({ screen: 'sprites' });
    ctx.go(back);
    return;
  }
  ctx.go(back ?? { screen: 'sprites' });
}

/**
 * Hand the picked frames back to the card that opened the selector, then return
 * to it. Order matters: `applyFrames` talks to the sprite-edit screen, which is
 * only the active one again after the detour is left.
 */
function commitFramesAndLeave(ctx: EditorContext, frameIds: string[]) {
  const params = ctx.params();
  const spriteId = params.screen === 'frames' ? params.spriteId : undefined;
  leaveFrames(ctx);
  if (spriteId) ctx.app.applyFrames(spriteId, frameIds);
}

/**
 * Return to the sprite list from the frame selector.
 *
 * The sprite list was parked, not rebuilt, so it still holds the image pool it
 * started with — and the selector can have added or deleted images since. It is
 * re-pointed on every return rather than only after a delete: "only when it
 * changed" is the kind of condition that gets one case wrong and leaves a card
 * animating a texture that is gone.
 */
function leaveFrames(ctx: EditorContext) {
  ctx.leaveDetour({ screen: 'sprites' });
  ctx.app.syncImages();
}

/**
 * Migration note — the library still owns two bars of its own: its multi-select
 * actions (DELETE/CANCEL) and its depose dialog. Both announce themselves with
 * `nav-suppress` so the shared bar steps aside. They become overlays on the
 * stack next, and that signal goes away with them.
 */
