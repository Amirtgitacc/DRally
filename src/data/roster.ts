// The 19 AI rivals on the championship ladder (the player makes 20).
// All original characters. Order = initial ladder seeding, strongest first.

export interface RosterDriver {
  id: string
  name: string
  bodyColor: number
  accentColor: number
}

export const ROSTER: RosterDriver[] = [
  { id: 'sable', name: 'Sable Cruz', bodyColor: 0xc23b4e, accentColor: 0xf0f0e8 },
  { id: 'gunnar', name: 'Gunnar Holt', bodyColor: 0x4a6d8c, accentColor: 0x16161c },
  { id: 'vex', name: 'Vex', bodyColor: 0xd04a35, accentColor: 0x16161c },
  { id: 'lux', name: 'Lux Ferro', bodyColor: 0xc9a227, accentColor: 0x16161c },
  { id: 'nadia', name: 'Nadia Storm', bodyColor: 0x7b4fd0, accentColor: 0xf0f0e8 },
  { id: 'brick', name: 'Brick Harlan', bodyColor: 0x8c5a3a, accentColor: 0xf0f0e8 },
  { id: 'mara', name: 'Mara Kane', bodyColor: 0x4f8fd0, accentColor: 0xf0f0e8 },
  { id: 'piper', name: 'Piper Nyx', bodyColor: 0xd05a9e, accentColor: 0x16161c },
  { id: 'otto', name: 'Otto Grimm', bodyColor: 0x5a5f66, accentColor: 0xd23c2f },
  { id: 'tessa', name: 'Tessa Wire', bodyColor: 0x3aa68c, accentColor: 0x16161c },
  { id: 'rico', name: 'Rico Fentz', bodyColor: 0xd07a35, accentColor: 0x16161c },
  { id: 'diesel', name: 'Diesel Ott', bodyColor: 0xd0b435, accentColor: 0x16161c },
  { id: 'juno', name: 'Juno Vale', bodyColor: 0x6fbf5a, accentColor: 0x16161c },
  { id: 'hana', name: 'Hana Cross', bodyColor: 0xb0c4d8, accentColor: 0x16161c },
  { id: 'slick', name: 'Slick Moreau', bodyColor: 0x2f3f5c, accentColor: 0xc9a227 },
  { id: 'yara', name: 'Yara Volt', bodyColor: 0x40c8d0, accentColor: 0x16161c },
  { id: 'moss', name: 'Moss Kettler', bodyColor: 0x556b2f, accentColor: 0xf0f0e8 },
  { id: 'kid', name: 'Kid Cobalt', bodyColor: 0x3a5fd0, accentColor: 0xf0f0e8 },
  { id: 'crash', name: 'Crash Delaney', bodyColor: 0x9c3ad0, accentColor: 0xf0f0e8 },
]

export function rosterById(id: string): RosterDriver {
  const d = ROSTER.find((r) => r.id === id)
  if (!d) throw new Error(`Unknown roster driver: ${id}`)
  return d
}
