import type { ActionConfig, AtlasLookup, GameConfigFiles } from './types';
import { branchKey, conditionChangers, expectedConditionCells, Section } from './rules';

/**
 * The game config must form a closed loop: every name one file uses is
 * defined in another. Nothing at play time checks this — the Pet falls back to
 * `default`, or plays nothing — so a broken reference fails silently.
 *
 * One function, used by the tests on the shipped files and by the editor on
 * what it is about to write: whatever the editor produces passes the same bar
 * as what we ship.
 */

/** Runtime keys written by something outside these files (a mini-game, for `win`). */
export const EXTERNAL_STATE_KEYS = ['win'];

export type IntegrityRule =
  | 'atlas-registered'
  | 'animation-exists'
  | 'portrait-exists'
  | 'idle-fallback'
  | 'branches-complete'
  | 'condition-presentation'
  | 'redirect-target'
  | 'redirect-exit'
  | 'redirect-header'
  | 'script-exists'
  | 'placeholder'
  | 'effect-refs'
  | 'auto-action-refs'
  | 'command-refs'
  | 'action-triggered'
  | 'header-menu'
  | 'header-stats'
  | 'header-chrome'
  | 'room-stages'
  | 'room-art'
  | 'dialogue-frame';

export interface IntegrityViolation {
  rule: IntegrityRule;
  detail: string;
}

export function lookupPath(obj: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>(
    (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
    obj,
  );
}

export function checkGameConfig(files: GameConfigFiles, atlas: AtlasLookup): IntegrityViolation[] {
  const out: IntegrityViolation[] = [];
  const fail = (rule: IntegrityRule, detail: string) => out.push({ rule, detail });

  const { character, conditions, effects, autoActions, stats, commands, header, room, dialogue, locale } = files;

  const resolve = (atlasId: string) => {
    const found = atlas(atlasId);
    if (!found) fail('atlas-registered', atlasId);
    return found;
  };

  const conditionNames = Object.keys(conditions);
  const statIds = stats.map((s) => s.id);
  const stateKeys = new Set([...statIds, 'condition', ...EXTERNAL_STATE_KEYS]);
  const branches = ['default', ...conditionNames.map(branchKey)];

  const idle = Object.entries(character.idleActions);
  const stageActions = (character.stages ?? []).flatMap((s) => Object.entries(s.actions ?? {}));
  const actions = [...Object.entries(character.actions), ...stageActions];
  const all: [Section, string, ActionConfig][] = [
    ...idle.map(([n, d]) => ['idleActions', n, d] as [Section, string, ActionConfig]),
    ...actions.map(([n, d]) => ['actions', n, d] as [Section, string, ActionConfig]),
  ];
  const actionNames = new Set(actions.map(([n]) => n));

  // ── character ────────────────────────────────────────────────────────────
  const characterAtlases = new Set([
    character.atlasId,
    ...(character.stages ?? []).map((s) => s.atlasId).filter((a): a is string => !!a),
  ]);
  for (const atlasId of characterAtlases) {
    const a = resolve(atlasId);
    if (!a) continue;
    for (const [, name, def] of all) {
      for (const [branch, seq] of Object.entries(def.animationSet)) {
        for (const p of seq) if (!a.prefixes.has(p)) fail('animation-exists', `${atlasId}: ${name}.${branch} → ${p}`);
      }
      for (const s of (def.dialogues ?? []).flatMap((d) => d.sentences)) {
        if (s.portrait && !a.prefixes.has(s.portrait)) fail('portrait-exists', `${atlasId}: ${name} → ${s.portrait}`);
      }
    }
  }

  for (const facing of ['left', 'right']) {
    const key = `${character.settings.idlePrefix}-${facing}`;
    if (!character.idleActions[key]) fail('idle-fallback', key);
  }

  for (const [, name, def] of all) {
    const have = Object.keys(def.animationSet).sort().join(',');
    if (have !== [...branches].sort().join(',')) fail('branches-complete', `${name}: ${have}`);
  }

  const changers = conditionChangers(files);
  for (const [section, name, def] of all) {
    const want = expectedConditionCells(files, section, name, def.animationSet.default ?? [], changers);
    if (!want) continue;
    for (const [branch, seq] of Object.entries(want)) {
      const got = def.animationSet[branch];
      if (got?.join(',') !== seq.join(',')) {
        fail('condition-presentation', `${name}.${branch}: ${got?.join(' ▸ ')} ≠ ${seq.join(' ▸ ')}`);
      }
    }
  }

  // ── condition redirects ──────────────────────────────────────────────────
  for (const [condition, def] of Object.entries(conditions)) {
    const r = def.redirect;
    if (!r) continue;
    if (!actionNames.has(r.to)) fail('redirect-target', `${condition} → ${r.to}`);
    // An exemption that cannot leave the condition is a trap: the pet gets in
    // and every way out is redirected.
    const exits = (r.except ?? []).filter((name) => {
      const set = effects.find((e) => e.action === name)?.effect.condition;
      const leaves = actionNames.has(name) && set?.method === 'set' && set.value !== condition;
      if (!leaves) fail('redirect-exit', `${condition} except ${name}`);
      return leaves;
    });
    if (exits.length === 0) fail('redirect-exit', `${condition} has no way out`);
    header.menu.forEach((m, i) => {
      const a = m.action[branchKey(condition)];
      if (a !== r.to) fail('redirect-header', `menu[${i}] ${branchKey(condition)} = ${a}, rule says ${r.to}`);
    });
  }

  // ── dialogue text ────────────────────────────────────────────────────────
  for (const [name, def] of actions) {
    // A number written into the text drifts the moment someone edits the
    // effect; a placeholder the action cannot fill is printed raw.
    const provided = new Set([
      'user',
      ...Object.keys(effects.find((e) => e.action === name)?.effect ?? {}),
      ...Object.values(commands).filter((c) => c.action === name).flatMap((c) => Object.keys(c.params ?? {})),
    ]);
    for (const s of (def.dialogues ?? []).flatMap((d) => d.sentences)) {
      if (!s.scriptId) continue;
      const text = lookupPath(locale, s.scriptId);
      if (typeof text !== 'string') { fail('script-exists', `${name}: ${s.scriptId}`); continue; }
      for (const [, key] of text.matchAll(/\{\{(\w+)\}\}/g)) {
        if (!provided.has(key)) fail('placeholder', `${name}: {{${key}}} in ${s.scriptId}`);
      }
    }
  }

  // ── mechanics ────────────────────────────────────────────────────────────
  for (const e of effects) {
    if (!actionNames.has(e.action)) fail('effect-refs', `action ${e.action}`);
    for (const k of Object.keys(e.effect)) if (!stateKeys.has(k)) fail('effect-refs', `${e.action}.${k}`);
    const c = e.effect.condition;
    if (c && !conditionNames.includes(String(c.value))) fail('effect-refs', `${e.action}: condition ${c.value}`);
  }
  for (const a of autoActions) {
    if (!actionNames.has(a.action)) fail('auto-action-refs', `action ${a.action}`);
    for (const k of Object.keys(a.when)) if (!stateKeys.has(k)) fail('auto-action-refs', `${a.action}.${k}`);
    const c = a.when.condition;
    if (c && !conditionNames.includes(String(c.value))) fail('auto-action-refs', `${a.action}: condition ${c.value}`);
  }
  for (const c of Object.values(commands)) {
    if (!actionNames.has(c.action)) fail('command-refs', c.action);
  }
  const triggered = new Set([
    ...autoActions.map((a) => a.action),
    ...Object.values(commands).map((c) => c.action),
    ...header.menu.flatMap((m) => Object.values(m.action)),
  ]);
  for (const n of actionNames) if (!triggered.has(n)) fail('action-triggered', n);

  // ── header ───────────────────────────────────────────────────────────────
  const h = resolve(header.atlasId);
  if (h) {
    header.menu.forEach((m, i) => {
      for (const p of Object.values(m.animation)) if (!h.prefixes.has(p)) fail('header-menu', `menu[${i}] icon ${p}`);
      for (const a of Object.values(m.action)) if (!actionNames.has(a)) fail('header-menu', `menu[${i}] action ${a}`);
      for (const b of branches) if (!(b in m.action)) fail('header-menu', `menu[${i}] missing ${b}`);
    });
    for (const s of header.stats) {
      if (!statIds.includes(s.stat)) fail('header-stats', `stat ${s.stat}`);
      if (s.animation && !h.prefixes.has(s.animation)) fail('header-stats', `${s.stat}: ${s.animation}`);
      for (const t of s.thresholds ?? []) {
        if (t.animation && !h.prefixes.has(t.animation)) fail('header-stats', `${s.stat}: ${t.animation}`);
        if (t.frame && !h.frames.has(t.frame)) fail('header-stats', `${s.stat}: frame ${t.frame}`);
      }
    }
    if (!h.prefixes.has(header.arrow.animation)) fail('header-chrome', `arrow ${header.arrow.animation}`);
  }
  const frame = resolve(header.frame.atlasId);
  if (frame && !frame.frames.has(header.frame.textureFrame)) {
    fail('header-chrome', `frame ${header.frame.atlasId}/${header.frame.textureFrame}`);
  }

  // ── room ─────────────────────────────────────────────────────────────────
  // Room looks a stage up by array position, so stage i must sit at index i.
  room.stages.forEach((s, i) => { if (s.value !== i) fail('room-stages', `stages[${i}].value = ${s.value}`); });
  const watched = stats.find((s) => s.id === room.watch);
  const reachable = new Set<number>([watched?.value ?? 0]);
  for (const e of effects) {
    const set = e.effect[room.watch];
    if (set?.method === 'set') reachable.add(Number(set.value));
  }
  for (const lv of reachable) if (!room.stages[lv]) fail('room-stages', `no stage for ${room.watch} ${lv}`);
  const r = resolve(room.atlasId);
  if (r) {
    for (const s of room.stages) {
      for (const p of [s.background, s.back, s.front, ...(s.extras ?? []).map((x) => x.animation)]) {
        if (!r.prefixes.has(p)) fail('room-art', `stage ${s.value}: ${p}`);
      }
    }
  }

  // ── dialogue box ─────────────────────────────────────────────────────────
  const box = resolve(dialogue.frameKey);
  if (box && !box.frames.has(dialogue.frameFrame)) fail('dialogue-frame', `${dialogue.frameKey}/${dialogue.frameFrame}`);

  return out;
}
