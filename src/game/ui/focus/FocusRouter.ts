import { Direction, Focusable, FocusScope, ScopeState } from './types';
import { directionFromCode, edgeMember, pickBest } from './geometry';

/**
 * Scene-scoped focus engine. Holds a scope stack: the bottom entry is the
 * active screen's scope (swapped on screen / sibling switch via setBaseScope),
 * modal scopes are pushed on top (pushModal/popModal). Only the top scope
 * receives keys. Focus within a scope is chosen geometrically; scope edges are
 * bridged by `boundaryOverride`.
 */
export class FocusRouter {
  private stack: FocusScope[] = [];
  private focusedId: string | null = null;

  get activeScope(): FocusScope | undefined {
    return this.stack[this.stack.length - 1];
  }

  get focused(): Focusable | undefined {
    const scope = this.activeScope;
    if (!scope || this.focusedId === null) return undefined;
    return scope.members().find(m => m.id === this.focusedId);
  }

  /** Replace the base scope (screen switch, or content↔nav sibling switch). */
  setBaseScope(scope: FocusScope, edge: 'first' | 'last' | string = 'first'): void {
    this.blurCurrent();
    this.stack.forEach(s => { s.state = ScopeState.INACTIVE; });
    this.stack = [scope];
    this.activateTop(edge);
  }

  /** Push a modal scope; the underlying scope is frozen until popModal(). */
  pushModal(scope: FocusScope, edge: 'first' | 'last' | string = 'first'): void {
    this.blurCurrent();
    const under = this.activeScope;
    if (under) under.state = ScopeState.INACTIVE;
    this.stack.push(scope);
    this.activateTop(edge);
  }

  /** Pop the top modal scope and restore focus to the scope beneath. */
  popModal(): void {
    if (this.stack.length <= 1) return;
    this.blurCurrent();
    const top = this.stack.pop();
    if (top) top.state = ScopeState.INACTIVE;
    // Restore the revealed scope at its remembered position.
    this.activateTop(this.activeScope?.lastFocusedId ?? 'first');
  }

  /** Remove all scopes (screen teardown). */
  clear(): void {
    this.blurCurrent();
    this.stack.forEach(s => { s.state = ScopeState.INACTIVE; });
    this.stack = [];
    this.focusedId = null;
  }

  /**
   * Focus a specific member id in the active scope. `from` is the travel
   * direction, forwarded to the member's onFocus so a widget entered by a
   * boundary bridge homes its internal cursor to the entered edge (omit it for
   * a direct focus, e.g. a pointer landing on the widget).
   */
  focusId(id: string, from?: Direction): void {
    const scope = this.activeScope;
    if (!scope) return;
    const target = scope.members().find(m => m.id === id && m.isEnabled());
    if (!target) return;
    this.setFocus(target, from);
  }

  /**
   * Focus the top ('first') or bottom ('last') member of the active scope,
   * optionally excluding one id (e.g. the trailing nav member, so "enter
   * content" lands on real content rather than the nav itself). `from` is the
   * travel direction — pass it when this is a wrap (bottom ↓ → top is entered
   * travelling DOWN), so the landed widget homes its cursor to the right edge.
   */
  focusEdge(edge: 'first' | 'last', excludeId?: string, from?: Direction): void {
    const scope = this.activeScope;
    if (!scope) return;
    const enabled = scope.members().filter(m => m.isEnabled() && m.id !== excludeId);
    const target = edgeMember(enabled, edge);
    if (target) this.setFocus(target, from);
  }

  /** Blur the active scope's focus without unwinding the stack (overlay open). */
  pause(): void {
    this.blurCurrent();
    const scope = this.activeScope;
    if (scope) scope.state = ScopeState.INACTIVE;
  }

  /** Re-activate + re-focus the active scope after a pause(). */
  resume(): void {
    this.activateTop(this.activeScope?.lastFocusedId ?? 'first');
  }

  /**
   * If the focused member became unavailable (selection cleared, page flipped),
   * re-home to the remembered id or the first available member. Call after any
   * state change that can disable the current focus.
   */
  refreshAvailability(): void {
    const scope = this.activeScope;
    if (!scope || scope.state !== ScopeState.ACTIVE) return;
    const current = this.focused;
    if (current && current.isEnabled()) return;
    this.activateTop(scope.lastFocusedId ?? 'first');
  }

  /**
   * Move focus in a direction as if an arrow were pressed, skipping the focused
   * item's own edit-mode capture. For widgets that self-handle their keys (the
   * TextInput) and bridge their nav-up/nav-down events here.
   */
  moveFocus(dir: Direction): void {
    const scope = this.activeScope;
    if (!scope || scope.state !== ScopeState.ACTIVE) return;
    this.move(dir);
  }

  /** Route one key to the active scope. */
  handleKey(code: string): void {
    const scope = this.activeScope;
    if (!scope || scope.state !== ScopeState.ACTIVE) return;

    const focused = this.focused;

    // 1. Edit-mode raw-key capture (typing).
    if (focused?.handleKey?.(code)) return;

    // 2. Select / Confirm / Cancel.
    if (code === 'Space') { focused?.onSelect(); return; }
    if (code === 'Enter') {
      if (scope.onSelectConfirm) scope.onSelectConfirm();
      else focused?.onSelect();
      return;
    }
    if (code === 'Escape') {
      // A scope's own onCancel wins (screen cancel, or a modal's cancel effect
      // which is responsible for calling popModal); otherwise default a stacked
      // modal to popModal.
      if (scope.onCancel) scope.onCancel();
      else if (this.stack.length > 1) this.popModal();
      return;
    }

    // 3. Direction.
    const dir = directionFromCode(code);
    if (!dir) return;

    // 3a. Edit-mode directional capture (slider ± / caret).
    if (focused?.handleDirection?.(dir)) return;

    this.move(dir);
  }

  // ── internals ──────────────────────────────────────────────────────────────

  private move(dir: Direction): void {
    const scope = this.activeScope;
    if (!scope) return;
    const members = scope.members().filter(m => m.isEnabled());
    const focused = this.focused;

    if (focused) {
      const best = pickBest(focused.getBounds().center, members, focused.id, dir);
      if (best) { this.setFocus(best, dir); return; }
    } else if (members.length > 0) {
      this.setFocus(members[0]);
      return;
    }

    // Edge: bridge out (target id or callback), else stay put.
    const target = scope.boundaryOverride?.[dir];
    if (typeof target === 'string') this.focusId(target);
    else if (typeof target === 'function') target();
  }

  private activateTop(edge: 'first' | 'last' | string): void {
    const scope = this.activeScope;
    if (!scope) return;
    scope.state = ScopeState.ACTIVE;

    const enabled = scope.members().filter(m => m.isEnabled());
    if (enabled.length === 0) { this.focusedId = null; return; }

    let target: Focusable | undefined;
    if (edge === 'first' || edge === 'last') {
      target = edgeMember(enabled, edge) ?? undefined;
    } else {
      target = enabled.find(m => m.id === edge);
    }
    this.setFocus(target ?? enabled[0]);
  }

  private setFocus(next: Focusable, from?: Direction): void {
    const scope = this.activeScope;
    if (this.focusedId !== null && this.focusedId !== next.id) {
      scope?.members().find(m => m.id === this.focusedId)?.onBlur();
    }
    this.focusedId = next.id;
    if (scope) scope.lastFocusedId = next.id;
    next.onFocus(from);
  }

  private blurCurrent(): void {
    const current = this.focused;
    if (current) current.onBlur();
    this.focusedId = null;
  }
}
