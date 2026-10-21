/**
 * The pet's systems: the game's rules, running on runtime data. A system never
 * draws anything — it changes values, and the elements watching those values
 * redraw. When a rule needs something shown (an action played, a line said) it
 * asks the screen through {@link ActionStage}.
 *
 *   StatSystem       stats tick by the condition's rules; effects change them
 *   ConditionSystem  the current condition and its rules
 *   AutoActionSystem fires an action when watched values match a rule
 *   TaskQueue        actions waiting to run, one at a time, with retries
 *   ActionRunner     runs one task: redirect, play, effect, say, move
 */
export * from "./StatSystem";
export * from "./ConditionSystem";
export * from "./AutoActionSystem";
export * from "./TaskQueue";
export * from "./ActionRunner";
