import { getStaticData } from "@/game/staticData";
import { ActionEffect, DialogItem, Task } from "../types";
import { PET_STATIC_KEYS } from "../constants";
import { getCharacterActionsConfig } from "../utils/resolveActions";
import { redirectTask } from "../utils/redirectTask";
import type { ConditionSystem } from "./ConditionSystem";
import type { StatSystem } from "./StatSystem";

type Effect = Partial<Record<string, ActionEffect>>;

/**
 * What the runner needs from the screen: the performance itself. The runner
 * decides what happens; the stage only shows it.
 */
export interface ActionStage {
  /** Play the action's animation, once the pet is free to. */
  play(action: string): Promise<void>;
  /** Say one of the lines, placeholders filled from `replacement`. */
  say(
    dialogues: DialogItem[],
    replacement: Record<string, string | number>,
  ): Promise<void>;
}

export interface ActionRunnerDeps {
  stage: ActionStage;
  condition: ConditionSystem;
  stats: StatSystem;
  /** The action leads to another scene; `params` travel with it. */
  onMove: (target: string, params: Task["params"]) => void;
}

/**
 * Runs one task from the queue, start to finish:
 *
 *   redirect  – the current condition may swap the action (dead → lock)
 *   play      – the animation
 *   effect    – condition, then stats
 *   say       – the dialogue, with {{user}} and the effect's amounts filled in
 *   move      – to another scene, when the action says so
 *
 * Resolves true when the task ran, false when it threw (the queue retries).
 */
export class ActionRunner {
  private readonly deps: ActionRunnerDeps;

  constructor(deps: ActionRunnerDeps) {
    this.deps = deps;
  }

  async run(queued: Task): Promise<boolean> {
    const { stage, condition, stats, onMove } = this.deps;
    const task = redirectTask(
      queued,
      condition.getConfig(),
      getCharacterActionsConfig(),
    );
    const { action, user, params, dialogues, move } = task;
    const effect = task.effect || configuredEffect(action);

    try {
      await stage.play(action);
      condition.runEffect(effect || {});
      stats.runEffect(effect || {});

      if (dialogues) {
        await stage.say(dialogues, dialogueReplacement(user, effect, params));
      }

      if (move) onMove(move, params);
      return true;
    } catch (err) {
      console.error("ActionRunner error:", err);
      return false;
    }
  }
}

/** The effect pet.effects lists for an action that carries none of its own. */
function configuredEffect(action: string): Effect | undefined {
  const effectsConfig = getStaticData(PET_STATIC_KEYS.EFFECTS) || [];
  return effectsConfig.find((e: any) => e.action === action)?.effect;
}

/**
 * What a line's placeholders are filled with: who asked, each effect's amount
 * by its key ({{hp}}, {{coin}}), and the task's own params, which win.
 */
export function dialogueReplacement(
  user: string,
  effect: Effect | undefined,
  params: Task["params"],
): Record<string, string | number> {
  const amounts = Object.fromEntries(
    Object.entries(effect ?? {}).map(([key, e]) => [key, (e as ActionEffect).value]),
  );
  return { user, ...amounts, ...params };
}
