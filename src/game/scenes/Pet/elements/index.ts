/**
 * The pet's elements: the parts the home screen is made of.
 *
 * Unlike the editor's elements, these are bound to the game's runtime data:
 * each one reads its config and watches the values it shows (the header's
 * stats, the room's level, the pet's stage) and redraws itself when they
 * change. They are composites, in the editor's terms — like its SpriteCard.
 * What they never do is decide anything: changing a value is a system's job.
 */
export { Header } from "./Header";
export { PetCharacter } from "./PetCharacter";
export { PetDialogue } from "./PetCharacter/PetDialogue";
export { Room } from "./Room";
