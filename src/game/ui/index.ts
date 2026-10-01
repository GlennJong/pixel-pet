/**
 * Engine-level canvas UI: a keyboard/pointer focus system that knows nothing
 * about any particular editor or game. Screens compose `Focusable`s into a
 * `FocusScope`, hand the scope to a `FocusRouter`, and feed the router raw key
 * codes from a `ScreenKeyboard`.
 *
 * Deliberately free of app theme and domain types — anything importing from
 * `@/game/scenes/...` does not belong here.
 */
export * from './focus';
export * from './input/ScreenKeyboard';
