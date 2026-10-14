import type { Task } from "../types/task";
import type { ActionMap } from "../elements/PetCharacter/types";
import type { ConditionDef } from "../types/conditions";

/**
 * Apply the current condition's redirect to a task about to run.
 *
 * Resolved at execution, not when the task is queued: a task queued while the
 * pet was fine may only reach the front after it has died.
 *
 * A redirected task takes everything that describes *what happens* from the
 * target action — dialogue, effect, scene move — and keeps only who asked and
 * how to report back. Chat tasks arrive with the original action's dialogue
 * already spread in, so renaming the action alone would play `lock` while
 * saying the drink line.
 */
export function redirectTask(
  task: Task,
  condition: ConditionDef | undefined,
  actions: ActionMap,
): Task {
  const redirect = condition?.redirect;
  if (!redirect) return task;
  if (task.action === redirect.to) return task;
  if (redirect.except?.includes(task.action)) return task;

  const target = actions[redirect.to];
  if (!target) return task;

  return {
    id: task.id,
    user: task.user,
    params: task.params,
    callback: task.callback,
    action: redirect.to,
    effect: target.effect,
    dialogues: target.dialogues,
    move: target.move,
  };
}
