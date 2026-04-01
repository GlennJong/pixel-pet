import { CharacterDirection } from "@/game/components/Character";

export type PetCharacterDirection = "none" | "left" | "right" | "top" | "down" | CharacterDirection;

export enum PetState {
  IDLE = "IDLE",
  MOVING = "MOVING",
  ACTING = "ACTING",
}
