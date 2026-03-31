
type MappingSchema = typeof import('../../public/assets/mapping.config.json')
type UiSchema = typeof import('../../public/assets/ui.config.json')

export type PetAssetsSchema = typeof import('../../public/assets/config/pet/assets.json')
export type PetCharacterSchema = typeof import('../../public/assets/config/pet/character.json')
export type PetConditionsSchema = typeof import('../../public/assets/config/pet/conditions.json')
export type PetHeaderSchema = typeof import('../../public/assets/config/pet/header.json')
export type PetRoomSchema = typeof import('../../public/assets/config/pet/room.json')
export type PetStatsSchema = typeof import('../../public/assets/config/pet/stats.json')


export type PetSchema = {
  assets: PetAssetsSchema,
  conditions: PetConditionsSchema,
  header: PetHeaderSchema,
  mycharacter: PetCharacterSchema,
  room: PetRoomSchema,
  stats: PetStatsSchema
}

export type Stat = {
  key: 'hp' | 'coin' | 'level',
  value: number
}

export type Config = {
  mapping: MappingSchema,
  ui: UiSchema,
  pet: PetSchema
}
