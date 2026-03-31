type triggers = {
  [key: string]: {
    action: string,
    matches: {
      [key: string]: string[]
    },
    params?: {
      [key: string]: string | number
    }
  }
}

export type config = {
  triggers: triggers
}
