import { describe, it, expect } from 'vitest';
import { FocusRouter } from './FocusRouter';
import { Direction, Focusable, FocusScope, ScopeState } from './types';

/**
 * These tests rebuild each editor screen's scope topology out of stand-in
 * focusables that mirror what the real widgets do, and drive the router with raw
 * key codes. No Phaser — the router, the geometry and the scope stack are all
 * plain objects.
 *
 * What they pin down is the one contract every screen depends on and none of
 * them can see: that a widget entered by a *boundary wrap* is told which edge it
 * was entered from, exactly as a widget entered by a geometric move is. That
 * asymmetry is what made the Library's bottom nav wrap onto the last menu row
 * instead of the first, and it was invisible on the other screens only because
 * they each hand-rolled a workaround.
 */

/** A vertical cursor list: OptionMenu, GridSelector, the S2 card column. */
function list(id: string, y: number, h: number, count: number, opts: { homes?: boolean } = {}) {
  const o = {
    id,
    cursor: 0,
    isEnabled: () => true,
    getBounds: () => ({ x: 0, y, width: 100, height: h, center: { x: 50, y: y + h / 2 } }),
    onFocus: (from?: Direction) => {
      if (opts.homes === false) return;
      if (from === 'DOWN') o.cursor = 0;
      else if (from === 'UP') o.cursor = count - 1;
    },
    onBlur: () => undefined,
    onSelect: () => undefined,
    handleDirection: (dir: Direction) => {
      if (dir === 'UP')   { if (o.cursor <= 0) return false; o.cursor--; return true; }
      if (dir === 'DOWN') { if (o.cursor >= count - 1) return false; o.cursor++; return true; }
      return false;
    },
  };
  return o;
}

/** A horizontal ButtonBar: homes to its first button however it is entered. */
function bar(id: string, y: number, h: number, isEnabled = () => true) {
  const o = {
    id,
    cursor: 0,
    isEnabled,
    getBounds: () => ({ x: 0, y, width: 100, height: h, center: { x: 50, y: y + h / 2 } }),
    onFocus: () => { o.cursor = 0; },
    onBlur: () => undefined,
    onSelect: () => undefined,
    handleDirection: (dir: Direction) => dir === 'LEFT' || dir === 'RIGHT',
  };
  return o;
}

const scope = (id: string, members: Focusable[], bo?: FocusScope['boundaryOverride']): FocusScope =>
  ({ id, state: ScopeState.INACTIVE, members: () => members, boundaryOverride: bo });

const keys = (r: FocusRouter, ...codes: string[]) => codes.forEach(c => r.handleKey(c));

describe('S1 LibraryScreen — menu mode [OptionMenu, nav]', () => {
  const build = () => {
    const r = new FocusRouter();
    const menu = list('menu', 8, 100, 3);
    const nav = bar('nav', 110, 16);
    r.setBaseScope(scope('library-menu', [menu, nav] as Focusable[], {
      UP: () => r.focusEdge('last', undefined, 'UP'),
      DOWN: () => r.focusEdge('first', undefined, 'DOWN'),
    }), 'menu');
    return { r, menu, nav };
  };

  it('starts on the first menu row', () => {
    const { r, menu } = build();
    expect(r.focused?.id).toBe('menu');
    expect(menu.cursor).toBe(0);
  });

  it('walks down the menu, then bridges to the nav', () => {
    const { r, menu } = build();
    keys(r, 'ArrowDown', 'ArrowDown');
    expect(menu.cursor).toBe(2);
    keys(r, 'ArrowDown');
    expect(r.focused?.id).toBe('nav');
  });

  it('wraps from the nav back onto the FIRST menu row, not the last', () => {
    // The reported bug: focusEdge() dropped the travel direction, so the menu's
    // onFocus(from) never fired and it kept the cursor you had walked down to.
    const { r, menu } = build();
    keys(r, 'ArrowDown', 'ArrowDown', 'ArrowDown'); // → nav, menu.cursor === 2
    keys(r, 'ArrowDown');
    expect(r.focused?.id).toBe('menu');
    expect(menu.cursor).toBe(0);
  });

  it('wraps up from the first menu row to the nav, then back to the last row', () => {
    const { r, menu } = build();
    keys(r, 'ArrowUp');
    expect(r.focused?.id).toBe('nav');
    keys(r, 'ArrowUp');
    expect(r.focused?.id).toBe('menu');
    expect(menu.cursor).toBe(2);
  });
});

describe('S1 LibraryScreen — edit mode [name, grid, selection-bar, nav]', () => {
  const build = () => {
    const r = new FocusRouter();
    const name = list('name', 8, 16, 1, { homes: false });
    const grid = list('grid', 30, 80, 8);
    const state = { selecting: false };
    const selBar = bar('selection-bar', 110, 16, () => state.selecting);
    const nav = bar('nav', 110, 16, () => !state.selecting);
    r.setBaseScope(scope('library-edit', [name, grid, selBar, nav] as Focusable[], {
      UP: () => r.focusEdge('last', undefined, 'UP'),
      DOWN: () => r.focusEdge('first', undefined, 'DOWN'),
    }), 'name');
    return { r, name, grid, selBar, nav, state };
  };

  it('runs name → grid → nav → wrap back to name', () => {
    const { r, grid } = build();
    expect(r.focused?.id).toBe('name');
    keys(r, 'ArrowDown');
    expect([r.focused?.id, grid.cursor]).toEqual(['grid', 0]);
    keys(r, ...Array(8).fill('ArrowDown'));
    expect(r.focused?.id).toBe('nav');
    keys(r, 'ArrowDown');
    expect(r.focused?.id).toBe('name');
  });

  it('enters the grid at its last cell when travelling up from the nav', () => {
    const { r, grid } = build();
    keys(r, 'ArrowUp');            // name ↑ → wrap to nav
    expect(r.focused?.id).toBe('nav');
    keys(r, 'ArrowUp');            // nav ↑ → grid, entered travelling UP
    expect([r.focused?.id, grid.cursor]).toEqual(['grid', 7]);
  });

  it('routes past the grid to the selection bar while the nav is suppressed', () => {
    const { r, grid, state } = build();
    state.selecting = true;
    r.refreshAvailability();
    r.focusId('grid');
    grid.cursor = 7;
    keys(r, 'ArrowDown');
    expect(r.focused?.id).toBe('selection-bar');
    keys(r, 'ArrowDown');
    expect(r.focused?.id).toBe('name');
  });
});

describe('S2 SpriteEditScreen [card column, nav]', () => {
  const build = () => {
    const r = new FocusRouter();
    // The column is one focusable that walks its own fields by index and hands
    // focus to the nav at either end.
    const N = 6;
    const cards = {
      id: 'cards',
      cursor: 0,
      isEnabled: () => true,
      getBounds: () => ({ x: 0, y: 4, width: 100, height: 100, center: { x: 50, y: 54 } }),
      onFocus: (from?: Direction) => {
        if (from === 'UP') cards.cursor = N - 1;
        else if (from === 'DOWN') cards.cursor = 0;
      },
      onBlur: () => undefined,
      onSelect: () => undefined,
      handleDirection: (dir: Direction) => {
        if (dir === 'UP')   { if (cards.cursor <= 0) { r.focusId('nav'); return true; } cards.cursor--; return true; }
        if (dir === 'DOWN') { if (cards.cursor >= N - 1) { r.focusId('nav'); return true; } cards.cursor++; return true; }
        return true;
      },
    };
    const nav = bar('nav', 110, 16);
    r.setBaseScope(scope('sprite-edit', [cards, nav] as Focusable[], {
      DOWN: () => r.focusId('cards', 'DOWN'),
    }), 'first');
    return { r, cards, nav };
  };

  it('wraps from the nav onto the top of the column', () => {
    const { r, cards } = build();
    cards.cursor = 5;
    keys(r, 'ArrowDown');
    expect(r.focused?.id).toBe('nav');
    keys(r, 'ArrowDown');
    expect([r.focused?.id, cards.cursor]).toEqual(['cards', 0]);
  });

  it('enters the bottom of the column when travelling up from the nav', () => {
    const { r, cards } = build();
    keys(r, 'ArrowUp');
    expect(r.focused?.id).toBe('nav');
    keys(r, 'ArrowUp');
    expect([r.focused?.id, cards.cursor]).toEqual(['cards', 5]);
  });
});

describe('S3 FrameSelectorScreen / AtlasImportScreen [list, bar]', () => {
  const build = () => {
    const r = new FocusRouter();
    const grid = list('grid', 0, 100, 8);
    const b = bar('bar', 110, 16);
    r.setBaseScope(scope('frame-selector', [grid, b] as Focusable[], {
      UP: () => r.focusId('bar', 'UP'),
      DOWN: () => r.focusId('grid', 'DOWN'),
    }), 'grid');
    return { r, grid, b };
  };

  it('wraps top ↑ → bar, and bar ↓ → the first cell', () => {
    const { r, grid } = build();
    keys(r, 'ArrowUp');
    expect(r.focused?.id).toBe('bar');
    keys(r, 'ArrowDown');
    expect([r.focused?.id, grid.cursor]).toEqual(['grid', 0]);
  });

  it('enters the last cell when travelling up out of the bar', () => {
    const { r, grid } = build();
    keys(r, ...Array(8).fill('ArrowDown'));
    expect(r.focused?.id).toBe('bar');
    keys(r, 'ArrowUp');
    expect([r.focused?.id, grid.cursor]).toEqual(['grid', 7]);
  });
});

describe('regression guard: boundary bridges must carry the travel direction', () => {
  it('reproduces the original bug when the direction is dropped', () => {
    const r = new FocusRouter();
    const menu = list('menu', 8, 100, 3);
    const nav = bar('nav', 110, 16);
    r.setBaseScope(scope('no-direction', [menu, nav] as Focusable[], {
      DOWN: () => r.focusEdge('first'), // ← the pre-fix call
    }), 'menu');

    keys(r, 'ArrowDown', 'ArrowDown', 'ArrowDown', 'ArrowDown');
    expect(r.focused?.id).toBe('menu');
    expect(menu.cursor).toBe(2); // lands on the LAST row — the reported symptom
  });
});
