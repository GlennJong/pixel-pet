/**
 * What the basic editor offers, and nothing else.
 *
 * Not derived from core.json: the basic editor is a fixed menu of things a
 * player understands, mapped onto whatever actions implement them. To change
 * what the user can edit, edit this table — the screens read it.
 *
 * Field order on each item:
 *   label     what the user sees
 *   actions   the action keys it edits; two for a left/right pair
 *   segments  names for the parts of a multi-part performance
 *   fields    what can be changed
 */

export type CatalogField =
  | 'animation'
  | 'hp'
  | 'coin'
  | 'dialogue'
  | 'portrait';

export interface CatalogItem {
  label: string;
  actions: string[];
  /** One name per part of the performance, in order. Absent: a single part. */
  segments?: string[];
  fields: CatalogField[];
  /** How much one ◀/▶ press changes a stat. Absent: 1. */
  steps?: Partial<Record<'hp' | 'coin', number>>;
}

/**
 * The expressions a speaker can wear, in the order ◀/▶ cycles through them.
 * The prefix is the animation the dialogue box shows next to the line.
 */
export const PORTRAITS = [
  { prefix: 'face-normal', label: '喜' },
  { prefix: 'face-angry', label: '怒' },
  { prefix: 'face-sad', label: '哀' },
] as const;

/** Portraits are the atlas's `face-*` animations. */
export const PORTRAIT_PREFIX = 'face-';

/** 喜/怒/哀 for a known face; otherwise the name after `face-`. */
export function portraitLabel(prefix: string | undefined): string {
  if (!prefix) return '—';
  return PORTRAITS.find((p) => p.prefix === prefix)?.label ?? prefix.replace(PORTRAIT_PREFIX, '');
}

export interface CatalogGroup {
  id: string;
  label: string;
  items: CatalogItem[];
}

const LR = ['left', 'right'] as const;
const pair = (key: string) => LR.map((side) => `${key}-${side}`);
const TALK: CatalogField[] = ['dialogue', 'portrait'];

export const CATALOG: CatalogGroup[] = [
  {
    id: 'idle',
    label: '閒晃',
    items: [
      { label: '站立', actions: pair('stand'), fields: ['animation'] },
      { label: '閒置1', actions: pair('idle1'), fields: ['animation'] },
      { label: '閒置2', actions: pair('idle2'), fields: ['animation'] },
      { label: '移動', actions: pair('move'), fields: ['animation'] },
    ],
  },
  {
    id: 'care',
    label: '照顧',
    items: [
      { label: '吃飯', actions: ['eat'], fields: ['animation', 'hp', 'coin', ...TALK] },
      { label: '工作', actions: ['work'], fields: ['animation', 'coin', ...TALK] },
    ],
  },
  {
    id: 'rest',
    label: '作息',
    items: [
      // Their performances are also the bridge every other action uses while
      // asleep — see gameConfig/rules.ts.
      { label: '睡覺', actions: ['sleep'], segments: ['倒地', '睡覺中'], fields: ['animation', ...TALK] },
      { label: '起床', actions: ['wake'], segments: ['起身'], fields: ['animation', ...TALK] },
    ],
  },
  {
    id: 'shop',
    label: '購買',
    items: [1, 2, 3, 4, 5].map((lv) => ({
      label: `升級 Lv${lv}`,
      actions: [`buy-lv${lv}`],
      fields: ['animation', 'coin', ...TALK] as CatalogField[],
      steps: { coin: 10 },
    })),
  },
  {
    id: 'life',
    label: '生死',
    items: [
      { label: '死亡', actions: ['die'], fields: ['animation', ...TALK] },
      // `lock` is what every action becomes while dead (conditions.json
      // redirect). The user only ever sees it as "how the pet looks dead".
      { label: '死亡中', actions: ['lock'], fields: ['animation', ...TALK] },
      { label: '復活', actions: ['revive'], fields: ['animation', ...TALK] },
    ],
  },
];

/**
 * Actions the basic editor deliberately leaves out. Listed, not just absent,
 * so a new action in core.json has to be placed somewhere on purpose.
 */
export const HIDDEN_ACTIONS = ['reward', 'lose'];

export const catalogActions = () => CATALOG.flatMap((g) => g.items.flatMap((i) => i.actions));
