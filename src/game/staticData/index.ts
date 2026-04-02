import { StaticDataSchema } from "./types";

let globalStaticData: StaticDataSchema = {} as StaticDataSchema;

export function setStaticData(data: StaticDataSchema) {
  globalStaticData = data;
}

export function getStaticData<T = any>(path: string): T {
  return path
    .split(".")
    .reduce((obj: any, key) => obj?.[key], globalStaticData) as T;
}
