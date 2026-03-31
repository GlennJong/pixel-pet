export interface ConditionDef {
  hp: {
    method: string;
    value: number;
    interval: number;
  };
}

export type ConditionMap = Record<string, ConditionDef>;
