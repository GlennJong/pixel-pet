
type MappingSchema = typeof import('../../public/configs/global/mapping.json')
type UiSchema = typeof import('../../public/configs/global/ui.json')

export type PetAssetsSchema = typeof import('../../public/configs/pet/assets.json')
export type PetCharacterSchema = typeof import('../../public/configs/pet/character.json')
export type PetConditionsSchema = typeof import('../../public/configs/pet/conditions.json')
export type PetHeaderSchema = typeof import('../../public/configs/pet/header.json')
export type PetRoomSchema = typeof import('../../public/configs/pet/room.json')
export type PetStatsSchema = typeof import('../../public/configs/pet/stats.json')


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
