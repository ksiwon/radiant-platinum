export interface TrainerPalette {
  cloth: string
  accent: string
  hair: string
}

/** Platinum trainer classes mapped to their BDSP character-bundle tag. */
const CLASS_MODEL: Readonly<Record<number, string>> = {
  2: 'shortpants',
  3: 'miniskirt',
  4: 'camper',
  5: 'picnicker',
  6: 'bugcatcher',
  7: 'aromalady',
  8: 'twins',
  9: 'wondervogel',
  10: 'battlegirl',
  11: 'angler',
  12: 'cyclistM',
  13: 'cyclistF',
  14: 'karate',
  15: 'artist',
  16: 'breederM',
  17: 'breederF',
  18: 'cowgirl',
  19: 'jogger',
  20: 'pokefanM',
  21: 'pokefanF',
  22: 'playpokeF',
  24: 'eliteM',
  25: 'eliteF',
  26: 'waitress',
  23: 'youngcoupleM',
  27: 'veteran',
  28: 'ninjaboy',
  30: 'birdkeeper',
  32: 'preppy',
  33: 'lady',
  34: 'gentleman',
  35: 'madam',
  36: 'women',
  31: 'twins',
  37: 'collector',
  38: 'police',
  39: 'pokerangerM',
  40: 'pokerangerF',
  41: 'researcher',
  47: 'seabread',
  42: 'seabread',
  43: 'bikini',
  44: 'tuber',
  45: 'tuber',
  46: 'sailor',
  48: 'ruinmaniac',
  49: 'psychicM',
  50: 'psychicF',
  51: 'gambler',
  52: 'guitarist',
  53: 'eliteM',
  54: 'eliteF',
  55: 'skierM',
  56: 'skierF',
  57: 'skinhead',
  58: 'clown',
  59: 'worker',
  60: 'studentM',
  61: 'studentF',
  62: 'gym01',
  63: 'friend',
  64: 'gym06',
  65: 'elitefour01',
  66: 'elitefour02',
  67: 'elitefour03',
  68: 'elitefour04',
  69: 'champion',
  70: 'rancher',
  71: 'rancher',
  72: 'galaxy02',
  73: 'galacticM',
  74: 'gym02',
  75: 'gym04',
  76: 'gym03',
  77: 'gym05',
  78: 'gym07',
  79: 'gym08',
  80: 'parasollady',
  81: 'waiter',
  82: 'reporter',
  83: 'cameraman',
  84: 'reporter',
  85: 'idol',
  86: 'galaxy01',
  87: 'galaxy03',
  88: 'galaxy04',
  89: 'galacticF',
  97: 'battle01',
  98: 'maid',
  99: 'lady',
  100: 'worker',
  101: 'idol',
  102: 'waiter',
}

export function trainerModelTag(trainerClass: number | null): string | null {
  if (trainerClass === null) return null
  return CLASS_MODEL[trainerClass] ?? null
}

const CLOTH = ['#3d63a7', '#a44462', '#35725a', '#7b4d9d', '#97602d', '#39434f'] as const
const ACCENT = ['#f3ce56', '#72d3db', '#f07b61', '#b9d96d', '#d9a3dc', '#f0eee6'] as const
const HAIR = ['#2d211f', '#6b4932', '#d7b55d', '#30384c', '#8a4130'] as const

/** Stable colors keep classes visually distinct when an exact GLB is unavailable. */
export function trainerFallbackPalette(trainerClass: number | null): TrainerPalette {
  const seed = Math.max(0, trainerClass ?? 0)
  return {
    cloth: CLOTH[seed % CLOTH.length]!,
    accent: ACCENT[(seed * 3 + 1) % ACCENT.length]!,
    hair: HAIR[(seed * 5 + 2) % HAIR.length]!,
  }
}
