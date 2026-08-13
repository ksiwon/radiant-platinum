export type ElementFamily =
  'neutral' | 'flame' | 'water' | 'spark' | 'frost' | 'leaf' | 'stone' | 'spirit' | 'wind' | 'venom'

export interface MoveVisualSignature {
  phase: number
  scale: number
  lift: number
  spin: number
  particles: number
}

/** 4세대 타입 번호를 서로 다른 3D 물질·궤적 계열로 나눈다. */
export function elementFamilyForType(type: number): ElementFamily {
  switch (type) {
    case 10:
      return 'flame'
    case 11:
      return 'water'
    case 13:
    case 8:
      return 'spark'
    case 15:
      return 'frost'
    case 12:
    case 6:
      return 'leaf'
    case 4:
    case 5:
      return 'stone'
    case 7:
    case 14:
    case 16:
    case 17:
      return 'spirit'
    case 2:
      return 'wind'
    case 3:
      return 'venom'
    default:
      return 'neutral'
  }
}

/** 같은 타입·분류 안에서도 471개 기술이 서로 다른 결정적 3D 서명을 갖는다. */
export function moveVisualSignature(move: number): MoveVisualSignature {
  const id = Math.max(0, Math.trunc(move))
  return {
    phase: (id * 2.399963229728653) % (Math.PI * 2),
    scale: 0.84 + (id % 7) * 0.045,
    lift: 0.78 + ((id * 5) % 9) * 0.08,
    spin: 4.1 + ((id * 7) % 11) * 0.23,
    particles: 7 + ((id * 3) % 6),
  }
}
