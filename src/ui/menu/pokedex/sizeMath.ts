// 도감 크기 비교의 셈 (`pokedex_height_check.c` · `ov21_021E737C.c`).
//
// 원작 위 화면은 256×192 DS 좌표다. 우리는 **그 좌표를 정수 2배**(`K`)로 옮긴다 — 그림이 80×80 도트라 배율이 정수여야
// 도트가 안 번진다. 값은 전부 굽는 쪽이 낸 표(`dexHeightWeight.json`)에서 온다:
//
//   · 배율 — **배율값 256이 1배**다. 그림 배율 = 256 / 값 (`SetTrainerScale` · `SetSpeciesScale`). 값이 클수록 작다
//   · 포켓몬 그림은 80×80 칸의 가운데를 (88, 88 + 자리)에 놓고 가운데 기준으로 줄이고 늘린다 (`DisplayPokemonSprite`)
//   · 주인공은 x 168에 선다. 자리는 `88 + 자리`다
//   · 성별은 주인공 성별이다 (`PokedexSort_TrainerGender`)
//
// ⚠️ **주인공 그림은 원작의 `size_check_icons`가 아니라 우리 `trainers/{0,1}.png`(80×80)다.** 원작 자리 값은 그 아이콘의
// 발 위치에 맞춰진 것이라 그대로 못 쓴다 — 주인공은 **발이 땅선에 닿게** 세로를 우리 그림의 발 줄(`TRAINER_FEET`)로 계산하고,
// 배율만 표를 따른다. 포켓몬은 표의 자리를 그대로 쓴다 (실측: 발이 땅선 123~130에 몰린다. 떠 있는 종은 원작이 일부러 띄운 것)
import type { DexHeightWeight } from '../../../data/schema'

/** DS → 화면 정수 배율 */
export const K = 2
/** 원작 그림 칸 (80×80) */
export const BOX = 80
/** 포켓몬 · 주인공 가로 가운데 (DS) */
export const MON_X = 88
const TRAINER_X = 168
/** 세로 기준 (DS) — 그림 가운데는 `ANCHOR + 자리` */
export const ANCHOR = 88
/**
 * 무대 위쪽을 자르는 줄 (DS). 그림 칸이 가장 높이 올라가는 곳이 33(실측: 모든 종 · 두 성별)이라 그 위 24줄은 늘 빈다 —
 * 비워 두면 세로가 모자라 몸무게 줄이 밀린다. 좌표는 이 줄이 0이다
 */
export const TOP = 24
/**
 * 땅선 (DS). 포켓몬 493종의 발 줄(자리 · 배율 · 그림 아래 줄로 계산)이 123~130에 몰리고 최빈이 126~127이다
 * (실측 `public/data/pokemon/*_front.png` 알파 · 2026-10-10)
 */
export const GROUND = 127
/**
 * 주인공 그림(`trainers/0.png` · `1.png`)의 **발 아래 줄**(80×80 안, 0부터 세어 발 다음 줄). 두 그림 다 알파가 있는 마지막 줄이 78이다
 * (실측 2026-10-10)
 */
export const TRAINER_FEET = 79

export type Gender = 'male' | 'female'

/** 한 종의 비교 값 */
interface Comparison {
  /** 데시미터 · 헥토그램 (표의 값 — 화면 글은 롬 글 뱅크를 쓴다) */
  height: number
  weight: number
  trainerScale: number
  pokemonScale: number
  pokemonPos: number
}

interface Side {
  trainerScale: number[]
  pokemonScale: number[]
  trainerPos: number[]
  pokemonPos: number[]
}

const GIRATINA = 487

/** 표를 읽는다. 모양이 틀렸거나 그 종 칸이 없으면 null (`dexHeightWeightSchema`는 모양을 안 좁힌다) */
export function comparisonFor(
  table: DexHeightWeight | null, species: number, gender: Gender,
): Comparison | null {
  if (table === null) return null
  const t = table as Record<string, unknown>
  // 기라티나는 어나더폼 표가 따로다 — 도감의 기본 모습이 어나더라 그쪽을 쓴다 (`Pokedex_SetupGiratina(0)`)
  if (species === GIRATINA && isObj(t.giratinaAltered)) {
    const g = t.giratinaAltered as Record<string, unknown>
    const side = g[gender]
    if (isObj(side) && num(g.height) && num(g.weight)) {
      const s = side as Record<string, unknown>
      if (num(s.trainerScale) && num(s.pokemonScale) && num(s.pokemonPos)) {
        return {
          height: g.height as number, weight: g.weight as number,
          trainerScale: s.trainerScale as number, pokemonScale: s.pokemonScale as number,
          pokemonPos: s.pokemonPos as number,
        }
      }
    }
  }
  const height = (t.height as number[] | undefined)?.[species]
  const weight = (t.weight as number[] | undefined)?.[species]
  const side = t[gender] as Side | undefined
  const trainerScale = side?.trainerScale?.[species]
  const pokemonScale = side?.pokemonScale?.[species]
  const pokemonPos = side?.pokemonPos?.[species]
  if (
    height === undefined || weight === undefined || trainerScale === undefined
    || pokemonScale === undefined || pokemonPos === undefined
  ) return null
  if (trainerScale <= 0 || pokemonScale <= 0) return null
  return { height, weight, trainerScale, pokemonScale, pokemonPos }
}

function isObj(v: unknown): v is object {
  return typeof v === 'object' && v !== null
}
function num(v: unknown): boolean {
  return typeof v === 'number' && Number.isFinite(v)
}

/** 화면에 놓인 그림 한 장 — 정수가 아닌 값이 나오지 않게 반올림한다 */
export interface Placed {
  /** 그림 칸의 왼쪽 위 (px) */
  left: number
  top: number
  /** 한 변 (px) = 80 × 배율 × K */
  size: number
  /** 배율 (1이 원본) */
  scale: number
  /** 그림 칸 가운데 (px) */
  cx: number
  cy: number
}

function place(cxDs: number, cyDs: number, scale: number): Placed {
  const size = BOX * scale * K
  const cx = cxDs * K, cy = (cyDs - TOP) * K
  return { left: cx - size / 2, top: cy - size / 2, size, scale, cx, cy }
}

/** 키 비교의 두 그림. 좌표 원점은 무대의 왼쪽 위(세로는 `TOP`줄)다 */
export function heightLayout(c: Comparison): { trainer: Placed, mon: Placed, ground: number } {
  const trainerScale = 256 / c.trainerScale
  const monScale = 256 / c.pokemonScale
  return {
    // 주인공은 발이 땅선에 닿는다: 가운데 y = 땅선 − (발 줄 − 40) × 배율
    trainer: place(TRAINER_X, GROUND - (TRAINER_FEET - BOX / 2) * trainerScale, trainerScale),
    mon: place(MON_X, ANCHOR + c.pokemonPos, monScale),
    ground: (GROUND - TOP) * K,
  }
}

/** 알파가 있는 칸의 둘레 (원본 80×80 안, 가장자리 포함). 하나도 없으면 null */
export interface ContentBox { l: number, t: number, r: number, b: number }

/** RGBA 바이트에서 알파가 0이 아닌 칸의 둘레를 잰다 */
export function alphaBox(rgba: ArrayLike<number>, w: number, h: number): ContentBox | null {
  let l = w, t = h, r = -1, b = -1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if ((rgba[(y * w + x) * 4 + 3] ?? 0) === 0) continue
      if (x < l) l = x
      if (x > r) r = x
      if (y < t) t = y
      if (y > b) b = y
    }
  }
  return r < 0 ? null : { l, t, r, b }
}

/**
 * 실루엣의 **가로 가운데**(px) — 그림 칸 가운데가 아니라 알파가 있는 칸의 가운데다. 이름표가 이것 아래에 선다.
 * 둘레를 못 쟀으면 그림 칸 가운데
 */
export function silhouetteCenterX(p: Placed, box: ContentBox | null): number {
  if (box === null) return p.cx
  // 그림 칸 안의 가운데(원본 도트) → 화면: 왼쪽 + 도트 × 배율 × K
  return p.left + ((box.l + box.r + 1) / 2) * p.scale * K
}

// ── 몸무게 ────────────────────────────────────────────────────────────────────

/** 주인공 몸무게 (헥토그램) — 롬 97 · 98의 38.0kg · 34.0kg (`ov21_021E74A0`의 380 · 340) */
export const TRAINER_WEIGHT: Record<Gender, number> = { male: 380, female: 340 }

/**
 * 시소의 기울기 표 (`Unk_ov21_021E9DB0`) — 몸무게 차이(헥토그램)가 이 문턱 **이하**인 첫 칸이다.
 * 둘째 값은 기울기 각 (원작 단위 65536분의 1바퀴). 첫 칸(차이 0)은 움직이지 않는다
 */
const TILT_STEPS: readonly (readonly [number, number])[] = [
  [0x0, 0x80], [0xA, 0x80], [0x14, 0x80], [0x1E, 0x80], [0x28, 0x80], [0x32, 0x80], [0x3C, 0x80], [0x46, 0x80],
  [0x96, 0x80], [0x12C, 0x100], [0x1F4, 0x180], [0x2EE, 0x200], [0x41A, 0x280], [0x60E, 0x300],
  [0x92E, 0x380], [0xDAC, 0x400], [0xFFFF, 0x480],
]

/** 차이 → 표의 칸 번호 (0~16) */
export function tiltStep(diff: number): number {
  const at = TILT_STEPS.findIndex(([limit]) => limit >= diff)
  return at < 0 ? TILT_STEPS.length - 1 : at
}

/**
 * 시소 기울기(도). **양수면 포켓몬 쪽이 내려간다.** 같거나 포켓몬이 더 무거우면 포켓몬 쪽이 내려가고(`unk_04 = 1`),
 * 가벼우면 주인공 쪽이다
 */
export function seesawDegrees(monWeight: number, trainerWeight: number): number {
  const diff = Math.abs(monWeight - trainerWeight)
  const step = tiltStep(diff)
  if (step === 0) return 0
  const turn = (TILT_STEPS[step]![1] / 65536) * 360
  return monWeight >= trainerWeight ? turn : -turn
}
