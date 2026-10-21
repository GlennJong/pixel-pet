import Phaser from "phaser";
import { EventBus } from "@/game/EventBus";
import { Header, PetCharacter, PetDialogue, Room } from "../elements";
import { KeyboardHandler } from "../input/KeyboardHandler";
import { ActionStage } from "../systems/ActionRunner";
import { DialogItem } from "../types";

/**
 * The pet's one screen: the room, the pet in it, the menu along the top, and
 * the dialogue box.
 *
 * Lays the elements out and turns input into events — the scene decides what
 * a pick means, as the editor's registry does for its screens. It is also the
 * stage the {@link ActionRunner} performs on: play an animation, say a line.
 *
 * Input comes from the keyboard and from the hardware buttons (EventBus):
 * Left/Right move along the menu, Space picks, E opens the editor.
 *
 * Events emitted:
 *   'select' (action: string) – a menu entry was picked
 *   'open-editor'             – E
 */
export class HomeScreen extends Phaser.Events.EventEmitter implements ActionStage {
  private readonly scene: Phaser.Scene;
  private readonly character: PetCharacter;
  private readonly room: Room;
  private readonly header: Header;
  private readonly dialogue: PetDialogue;
  private readonly keyboard: KeyboardHandler;

  constructor(scene: Phaser.Scene) {
    super();
    this.scene = scene;

    // Creation order is draw order.
    this.character = new PetCharacter(scene);
    this.room = new Room(scene);
    this.room.init();
    this.header = new Header(scene);
    this.dialogue = new PetDialogue(scene);

    this.keyboard = new KeyboardHandler(scene, {
      onLeft: this.handleLeft,
      onRight: this.handleRight,
      onSpace: this.handleSelect,
    });
    EventBus.on("game-left-keydown", this.handleLeft);
    EventBus.on("game-right-keydown", this.handleRight);
    EventBus.on("game-select-keydown", this.handleSelect);
    scene.input.keyboard?.on("keydown-E", this.handleOpenEditor);
  }

  /** The atlas the pet is drawn from — what the editor should open on. */
  get atlasId(): string | undefined {
    return this.character.atlasId;
  }

  /** Let the pet start moving about on its own. */
  start() {
    this.character.startPet();
  }

  /** Stop what the pet is doing, for an action that cannot wait. */
  interrupt() {
    this.character.interrupt();
  }

  // ── ActionStage ────────────────────────────────────────────────────────────

  play(action: string) {
    return this.character.runFunctionalActionAsync(action);
  }

  say(dialogues: DialogItem[], replacement: Record<string, string | number>) {
    return this.dialogue.runDialogue(dialogues, replacement);
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  update() {
    this.character.update();
    this.header.update();
    this.keyboard.update();
  }

  destroy() {
    this.character.destroy();
    this.header.destroy();
    this.room.destroy();
    this.dialogue.destroy();
    this.keyboard.destroy();

    EventBus.off("game-left-keydown", this.handleLeft);
    EventBus.off("game-right-keydown", this.handleRight);
    EventBus.off("game-select-keydown", this.handleSelect);
    this.scene.input.keyboard?.off("keydown-E", this.handleOpenEditor);

    super.destroy();
  }

  // ── Input ──────────────────────────────────────────────────────────────────

  private handleLeft = () => this.header.movePrev();
  private handleRight = () => this.header.moveNext();
  private handleSelect = () => this.emit("select", this.header.select());
  private handleOpenEditor = () => this.emit("open-editor");
}
