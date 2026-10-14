import Phaser from 'phaser';
import { ScreenKeyboard } from '@/game/ui';
import { FocusRouter, createScope, makeFocusable } from '@/game/ui/focus';
import { Stepper } from '../elements/Stepper';
import { DialoguePart, DialoguePreview, DIALOGUE_HEIGHT } from '../elements/DialoguePreview';
import { CatalogItem } from '../action/catalog';
import type { EditableStat, GameConfigProject } from '../action/GameConfigProject';
import { COLORS, BUTTON_BAR_HEIGHT, cjkStyle } from '../constants';
import { NavHost } from '../types';
import { EditorScreen } from './EditorScreen';

const PAD = 3;
const TITLE_H = 14;
const ROW_H = 14;
const ROW_GAP = 2;

const STAT_LABEL: Record<EditableStat, string> = { hp: '生命', coin: '金錢' };
const SIDE_LABEL: Record<string, string> = { left: '左', right: '右' };
/** Who {{user}} is while previewing a line. */
const SAMPLE_USER = '觀眾';

type Row =
  | { key: string; kind: 'anim'; action: string; view: Stepper; top: number; height: number }
  | { key: string; kind: EditableStat; view: Stepper; top: number; height: number }
  | { key: 'dialogue'; kind: 'dialogue'; view: DialoguePreview; top: number; height: number };

/**
 * One catalog item's settings, as a form — the catalog decides which rows.
 *
 *   演出(左)   walk-left       Enter → its parts
 *   生命       < +10 >         ◀/▶
 *   金錢       < +10 >         ◀/▶
 *   ┌────┐┌─────────────┐
 *   │face││ the line…   │      the game's dialogue box, playing the line
 *   └────┘└─────────────┘      face: Enter → pick;  ▶ → text (replays): Enter → write
 *
 * The form scrolls so the focused row is always fully in view — the dialogue
 * box is the last and tallest row, and the bottom bar would cover it.
 *
 * Shows values; never changes the project. Each edit is reported, applied by
 * the registry, which then calls {@link refresh}.
 *
 * Events emitted:
 *   'open-animation' (action: string)
 *   'open-portrait'  (action: string)
 *   'open-text'      (action: string)
 *   'adjust-stat'    ({ action, stat, delta })
 *   'cancel'
 */
export class ActionFormScreen extends EditorScreen {
  private readonly router = new FocusRouter();
  private readonly rows: Row[] = [];
  private readonly item: CatalogItem;
  private readonly project: GameConfigProject;
  private readonly content: Phaser.GameObjects.Container;
  private readonly viewH: number;
  private cursor = 0;
  private part: DialoguePart = 'face';
  private hasFocus = false;
  private scrollY = 0;

  constructor(
    scene: Phaser.Scene,
    width: number,
    height: number,
    title: string,
    item: CatalogItem,
    project: GameConfigProject,
    navHost: NavHost,
    focusKey?: string,
  ) {
    super(scene);
    this.item = item;
    this.project = project;

    this.add(scene.add.rectangle(0, 0, width, height, COLORS.BG).setOrigin(0, 0));
    this.content = scene.add.container(0, TITLE_H);
    this.add(this.content);
    this.viewH = height - BUTTON_BAR_HEIGHT - TITLE_H;

    const rowW = width - PAD * 2;
    let y = PAD;
    const place = (h: number) => { const top = y; y += h + ROW_GAP; return top; };

    if (item.fields.includes('animation')) {
      for (const action of item.actions) {
        const side = item.actions.length > 1 ? `(${SIDE_LABEL[action.split('-').pop()!] ?? action})` : '';
        const top = place(ROW_H);
        const view = new Stepper(scene, PAD, top, rowW, ROW_H, `演出${side}`, false);
        this.rows.push({ key: `anim:${action}`, kind: 'anim', action, view, top, height: ROW_H });
      }
    }
    for (const stat of ['hp', 'coin'] as const) {
      if (!item.fields.includes(stat)) continue;
      const top = place(ROW_H);
      this.rows.push({ key: stat, kind: stat, view: new Stepper(scene, PAD, top, rowW, ROW_H, STAT_LABEL[stat]), top, height: ROW_H });
    }
    if (item.fields.includes('dialogue') && project.dialogue(this.main)) {
      const top = place(DIALOGUE_HEIGHT);
      const view = new DialoguePreview(scene, PAD, top, rowW, project.characterAtlasId);
      this.rows.push({ key: 'dialogue', kind: 'dialogue', view, top, height: DIALOGUE_HEIGHT });
    }
    this.rows.forEach((r) => this.content.add(r.view));

    // Over the content, so rows scrolled up pass under the title.
    this.add(scene.add.rectangle(0, 0, width, TITLE_H, COLORS.BG).setOrigin(0, 0));
    this.add(scene.add.text(PAD, 2, title, cjkStyle()));

    // `dialogue:text` lands on the dialogue box's text rather than its face —
    // where the user was before writing the line.
    const onText = focusKey?.endsWith(':text') === true;
    const key = onText ? focusKey!.slice(0, -':text'.length) : focusKey;
    this.cursor = Math.max(0, this.rows.findIndex((r) => r.key === key));
    if (onText) this.part = 'text';
    this.refresh();
    this.setupFocus(navHost, width);

    this.keyboard = new ScreenKeyboard({
      scene,
      canAttach: () => this.active,
      deferAttach: true,
      onKeyDown: (code: string) => this.router.handleKey(code),
    });
    scene.add.existing(this);
    this.keyboard.attach();
  }

  /** The action whose stats and dialogue the form edits. */
  get main() { return this.item.actions[0]; }

  /** Re-read every value from the project. */
  refresh() {
    const line = this.project.dialogue(this.main);
    for (const row of this.rows) {
      if (row.kind === 'anim') row.view.setValue(this.project.animation(row.action).join(' ▸ '));
      else if (row.kind === 'dialogue') row.view.setLine(line?.portrait ?? '', line?.text ?? '', this.sample);
      else {
        const v = this.project.effect(this.main, row.kind);
        row.view.setValue(v === undefined ? '—' : v > 0 ? `+${v}` : String(v));
      }
    }
    this.redraw();
  }

  update() { /* event-driven */ }

  /** A line's placeholders filled the way the game fills them. */
  private sample = (text: string) => text.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => {
    if (key === 'user') return SAMPLE_USER;
    const v = this.project.effect(this.main, key as EditableStat);
    // The game prints the stored amount, which is never negative (see effects.json).
    return v === undefined ? whole : String(Math.abs(v));
  });

  private get row(): Row | undefined { return this.rows[this.cursor]; }

  private redraw() {
    this.rows.forEach((r, i) => {
      const on = this.hasFocus && i === this.cursor;
      if (r.kind === 'dialogue') r.view.setFocus(on ? this.part : null);
      else r.view.setFocused(on);
    });
  }

  private horizontal(delta: 1 | -1) {
    const row = this.row;
    if (!row) return;
    if (row.kind === 'hp' || row.kind === 'coin') {
      const step = this.item.steps?.[row.kind] ?? 1;
      this.emit('adjust-stat', { action: this.main, stat: row.kind, delta: delta * step });
    } else if (row.kind === 'dialogue') {
      const part = delta > 0 ? 'text' : 'face';
      if (part === this.part) return;
      this.part = part;
      // Landing on the text plays the line again, so it can be read.
      if (part === 'text') row.view.replay();
      this.redraw();
    }
  }

  private activate() {
    const row = this.row;
    if (row?.kind === 'anim') this.emit('open-animation', row.action);
    else if (row?.kind === 'dialogue') {
      if (this.part === 'face') this.emit('open-portrait', this.main);
      else this.emit('open-text', this.main);
    }
  }

  private focusRow(index: number) {
    // Arriving on the dialogue box from another row starts on its face, as
    // the box reads.
    if (index !== this.cursor && this.rows[index]?.kind === 'dialogue') this.part = 'face';
    this.cursor = index;
    this.scrollIntoView();
    this.redraw();
  }

  private scrollIntoView() {
    const row = this.row;
    if (!row) return;
    if (row.top - PAD < this.scrollY) this.scrollY = row.top - PAD;
    else if (row.top + row.height + PAD > this.scrollY + this.viewH) this.scrollY = row.top + row.height + PAD - this.viewH;
    this.scrollY = Math.max(0, this.scrollY);
    this.content.setY(TITLE_H - this.scrollY);
  }

  private setupFocus(navHost: NavHost, width: number) {
    const area = { getBounds: () => new Phaser.Geom.Rectangle(0, TITLE_H, width, this.viewH) };
    const form = makeFocusable({
      id: 'form',
      object: area,
      onFocus: (from) => {
        this.hasFocus = true;
        if (from === 'UP') this.focusRow(this.rows.length - 1);
        else if (from === 'DOWN') this.focusRow(0);
        else this.focusRow(this.cursor);
      },
      onBlur: () => { this.hasFocus = false; this.redraw(); },
      onSelect: () => this.activate(),
      handleDirection: (dir) => {
        if (dir === 'LEFT' || dir === 'RIGHT') { this.horizontal(dir === 'RIGHT' ? 1 : -1); return true; }
        const next = this.cursor + (dir === 'DOWN' ? 1 : -1);
        if (next < 0 || next >= this.rows.length) return false;
        this.focusRow(next);
        return true;
      },
    });
    const bar = navHost.buildNavFocusable(
      (edge) => this.router.focusEdge(edge, 'form'),
      () => this.router.focusId('nav'),
    );
    this.router.setBaseScope(createScope({
      id: 'action-form',
      members: () => [form, bar],
      onCancel: () => this.emit('cancel'),
      boundaryOverride: {
        UP: () => this.router.focusId('nav', 'UP'),
        DOWN: () => this.router.focusId('form', 'DOWN'),
      },
    }), 'form');
  }
}
