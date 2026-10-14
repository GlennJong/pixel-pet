export interface ConditionRule {
  method: "add" | "sub";
  value: number;
  interval: number;
}

/**
 * While the pet is in this condition, every action becomes `to` — except the
 * ones listed, which are how the pet leaves the condition.
 */
export interface ConditionRedirect {
  to: string;
  except?: string[];
}

/** Per-stat drift rules, keyed by stat id, plus an optional action redirect. */
export type ConditionDef = {
  redirect?: ConditionRedirect;
  [stat: string]: ConditionRule | ConditionRedirect | undefined;
};

export type ConditionMap = Record<string, ConditionDef>;
