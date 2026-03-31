
type mapping = {
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

type petAssets = {
  [key: string]: {
    png: string,
    json: string
  }
}

type stat = 'hp' | 'coin' | 'level'

type petConditions = {
  [key: string]: {
    [key in stat]: {
      interval: number,
      method: 'sub' | 'add',
      value: number
    }
  }

}

type header = {
  [key: string]: string
}

type pet = {
  assets: petAssets,
  conditions: petConditions,
}

export type config = {
  mapping: mapping
}