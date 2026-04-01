export interface ConditionRule {
  method: "add" | "sub";
  value: number;
  interval: number;
}

export type ConditionDef = Partial<Record<string, ConditionRule>>;

export type ConditionMap = Record<string, ConditionDef>;
