/**
 * The editor's screens. Each one fills the canvas above the shared bottom bar,
 * takes its data in the constructor and reports what the user did as events;
 * what an event means is decided in navigation/registry.ts.
 *
 *   templates/  generic: know nothing about the project, reused with different
 *               data (a carousel, a grid of previews, a list, a text page)
 *   basic/      the basic editor's own screens — what the pet does
 *   sprite/     the sprite editor's own screens — what it looks like
 */
export * from './BaseScreen';
export * from './templates/CarouselScreen';
export * from './templates/PreviewGridScreen';
export * from './templates/ListScreen';
export * from './templates/TextEditScreen';
export * from './basic/ActionFormScreen';
export * from './sprite/LibraryScreen';
export * from './sprite/SpriteEditScreen';
export * from './sprite/FrameSelectorScreen';
