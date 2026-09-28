// 명예의 전당 등록 장면의 움직임 — 원작 값 그대로 (PARITY §8.11 · `cutscenes/hall_of_fame.c`)
//
// 원작은 256×192 한 화면에 **픽셀 좌표로** 짠 장면이다. 창(`G2_SetWnd0Position`)이 밝은 판이고, 창 밖은 BG2(검정 한 장)가
// 덮는다. 층의 차례(위에서부터)가 BG1 글(0) · BG2 검정(1) · BG0 3D 조명과 색종이(2) · OBJ 포켓몬과 주인공(3) · BG3 배경(3)이라,
// **창 밖에서는 3D도 OBJ도 안 보인다** — 포켓몬이 창과 함께 들어오고, 창이 위로 빠지면 포켓몬도 그 아래로 가려진다.
//
// 여기 값은 DOM(창 · 글)과 3D(포켓몬 · 주인공 · 조명 · 색종이)가 같이 읽는다 — 둘이 한 프레임도 안 어긋나야 창 안에 몸이 선다.
// 움직임은 전부 `HallOfFameMovement`다: fx32 걸음을 `(끝 - 시작) / 걸음 수`로 자르고(C의 나눗셈이라 0 쪽으로 버린다)
// 마지막 걸음에 끝값을 준다.

/** 장면의 걸음 (`HallOfFameScreen`이 밟는다) */
export type HofBeat =
  | 'fadeIn'
  | 'monIn'
  | 'monSettle'
  | 'monText1'
  | 'monText2'
  | 'monText3'
  | 'monHold'
  | 'monOut'
  | 'monGap'
  | 'playerIn'
  | 'playerHold'
  | 'expand'
  | 'playerText'
  | 'partyIn'
  | 'partyHold'
  | 'confetti'
  | 'wipe'
  | 'fadeOut'
  | 'saving'
  | 'saved'

/** 원작 한 프레임 (ms) */
export const HOF_FRAME_MS = 1000 / 60

const FX = 4096

/**
 * `HallOfFameMovement_Init` + `_Run`을 `runs`번 부른 뒤의 값 (픽셀, fx32 소수 그대로).
 * `runs = 0`은 시작값이다 — 원작은 움직임을 건 그 프레임에 시작 자리를 먼저 놓는다
 */
export function hofMove(start: number, end: number, steps: number, runs: number): number {
  const s = start * FX, e = end * FX
  const step = Math.trunc((e - s) / steps)
  if (runs >= steps) return end
  return (s + Math.max(0, runs) * step) / FX
}

/** 창 좌표로 쓰는 값 — `>> FX32_SHIFT` (음수도 바닥 쪽이다) */
const px = (v: number): number => Math.floor(v)

/** 창 [왼 · 위 · 오른 · 아래]. 오른·아래는 **안 들어간다** (DS 창 레지스터) */
type HofRect = readonly [number, number, number, number]

const X_MAX = 255
const Y_MAX = 191
/** 닫힌 창 (`G2_SetWnd0Position(0, 0, 0, 0)`) */
const CLOSED: HofRect = [0, 0, 0, 0]

/** 한 축의 자르기 — 네 슬라이더가 다 같은 네 줄이다 (`HallOfFame_SlideFrame*`) */
function clampAxis(a: number, b: number, max: number): [number, number] {
  if (a < 0) a = 0
  if (b < 0) b = 0
  if (a > max) a = b = 0
  if (b > max) b = max
  return [a, b]
}

/** 한 마리의 창 (`POKEMON_FRAME_*` · `frameMovements` · `frameCoordsLeft`) */
const MON_FRAME = { w: 96, h: 128, top: 32 } as const
const MON_FRAME_X: readonly (readonly [number, number])[] = [[-96, 24], [352, 136]]
/** 주인공 창 (`HallOfFame_ShowPlayerFrame` · `PLAYER_FRAME_HEIGHT`) */
const PLAYER_FRAME = { left: 88, right: 168, h: 144, from: -144, top: 24 } as const

/**
 * 그 걸음 · 그 걸음에 들어선 뒤 `frame`프레임의 창.
 * @param side 몇 번째 마리의 짝홀 (`monIndex & 1`)
 */
export function hofWindow(beat: HofBeat, frame: number, side: number): HofRect {
  const f = Math.max(0, Math.floor(frame))
  switch (beat) {
    case 'monIn':
    case 'monSettle':
    case 'monText1':
    case 'monText2':
    case 'monText3':
    case 'monHold': {
      const [from, to] = MON_FRAME_X[side & 1]!
      const left = px(beat === 'monIn' ? hofMove(from, to, 28, f) : to)
      const [l, r] = clampAxis(left, left + MON_FRAME.w, X_MAX)
      return [l, MON_FRAME.top, r, MON_FRAME.top + MON_FRAME.h]
    }
    case 'monOut': {
      const left = MON_FRAME_X[side & 1]![1]
      const top = px(hofMove(MON_FRAME.top, -160, 28, f))
      const [t, b] = clampAxis(top, top + MON_FRAME.h, Y_MAX)
      return [left, t, left + MON_FRAME.w, b]
    }
    case 'playerIn':
    case 'playerHold': {
      const top = px(beat === 'playerIn' ? hofMove(PLAYER_FRAME.from, PLAYER_FRAME.top, 28, f) : PLAYER_FRAME.top)
      const [t, b] = clampAxis(top, top + PLAYER_FRAME.h, Y_MAX)
      return [PLAYER_FRAME.left, t, PLAYER_FRAME.right, b]
    }
    case 'expand': {
      const [l, r] = clampAxis(px(hofMove(88, 0, 12, f)), px(hofMove(168, 255, 12, f)), X_MAX)
      return [l, PLAYER_FRAME.top, r, PLAYER_FRAME.top + PLAYER_FRAME.h]
    }
    case 'playerText':
    case 'partyIn':
    case 'partyHold':
    case 'confetti':
      return [0, PLAYER_FRAME.top, X_MAX, PLAYER_FRAME.top + PLAYER_FRAME.h]
    case 'wipe': {
      // `HallOfFame_WipeToBlack` — 위아래가 가운데(96)로 24프레임에 닫힌다
      const [t, b] = clampAxis(px(hofMove(24, 96, 24, f)), px(hofMove(168, 96, 24, f)), Y_MAX)
      return [0, t, X_MAX, b]
    }
    default:
      return CLOSED
  }
}

/** 한 마리 그림의 가운데 x (`pokemonMovements` ÷ 4096 — 창과 **반대로** 미끄러진다). y는 96 */
const MON_X: readonly (readonly [number, number])[] = [[192, 72], [64, 184]]
export const HOF_MON_Y = 96

export function hofMonX(side: number, beat: HofBeat, frame: number): number {
  const [from, to] = MON_X[side & 1]!
  return beat === 'monIn' ? hofMove(from, to, 28, Math.floor(frame)) : to
}

/** 한 마리 그림이 보이는 걸음 — 창을 걷는 동안에도 남아 있다가 다 걷히면 끈다 (`Sprite_SetDrawFlag(…, FALSE)`) */
export function hofMonShown(beat: HofBeat): boolean {
  return beat === 'monIn' || beat === 'monSettle' || beat === 'monText1' || beat === 'monText2' ||
    beat === 'monText3' || beat === 'monHold' || beat === 'monOut'
}

/** 주인공 그림 — x 128, y 232 → 104 (28프레임) */
export const HOF_PLAYER_X = 128
export function hofPlayerY(beat: HofBeat, frame: number): number {
  return beat === 'playerIn' ? hofMove(232, 104, 28, Math.floor(frame)) : 104
}

/** 파티 여섯의 줄 (`initialPositions` · `endPositionsX`) */
const PARTY_FROM = [-40, 296, -40, 296, -40, 296] as const
const PARTY_TO = [160, 96, 192, 64, 224, 32] as const
export const HOF_PARTY_Y = [96, 96, 88, 88, 80, 80] as const

/**
 * 파티 `i`번째의 x. `HallOfFame_SlideInPartySprites`는 한 마리를 풀고 네 프레임 쉰다 — 첫 프레임에 0번을 풀고,
 * 그다음 프레임부터 푼 것들이 한 걸음씩 간다. 그래서 `i`번은 `5i + 1`번째 프레임에 첫걸음을 뗀다 (8걸음)
 */
export function hofPartyX(i: number, beat: HofBeat, frame: number): number {
  if (beat !== 'partyIn') return PARTY_TO[i]!
  return hofMove(PARTY_FROM[i]!, PARTY_TO[i]!, 8, Math.floor(frame) - 5 * i)
}

/** 글 판(BG1)이 위로 걷히는 양 — `Bg_SetOffset(Y, 0 → 256)` 28프레임 (`HallOfFame_SlideOutPokemonText`) */
export function hofTextLift(beat: HofBeat, frame: number): number {
  return beat === 'monOut' ? px(hofMove(0, 256, 28, Math.floor(frame))) : 0
}

// ─── 3D (BG0) — 카메라와 조명 여섯 · 색종이 마흔여덟 ─────────────────────────────

/**
 * 원작 카메라 (`HallOfFame_InitCamera`): 원점을 거리 20480(= 5)에서 정면으로 본다. 화각 4004는 **반각**이다
 * (`FX_SinIdx(fovY)`를 `NNS_G3dGlbPerspective`에 넘긴다 — `starterScene.ts`와 같다)
 */
export const HOF_CAMERA_DIST = 20480 / FX
export const HOF_HALF_FOV = (4004 * 360) / 65536

/** 조명 하나 (`ov86_0223CAA0` 여섯 번 · `ov86_0223CAE4`) */
interface Spotlight {
  /** 바닥 x (fx16) */
  base: number
  /** 각도 (fx32 · 도) */
  angle: number
  /** 한 프레임에 도는 양 (fx32 · 도). 끝에 닿으면 부호가 바뀐다 */
  speed: number
  /** GX_RGB */
  color: readonly [number, number, number]
}

const SPOT_BASE = [-0.714, -0.429, -0.143, 0.143, 0.429, 0.714] as const
const SPOT_ANGLE = [20, 60, 40, 140, 120, 160] as const
const SPOT_SPEED = [0xc00, 0xb00, 0xa00, 0xc00, 0xb00, 0xa00] as const
const SPOT_COLOR: readonly (readonly [number, number, number])[] = [
  [31, 31, 12], [31, 31, 16], [31, 28, 8], [31, 31, 12], [31, 31, 16], [31, 28, 8],
]
/** 조명의 불투명도 (`G3B_PolygonAttr(…, 16, 0)`) */
export const HOF_SPOT_ALPHA = 16 / 31

/** `FX16_CONST` — 반올림한다 */
const fx16 = (v: number): number => Math.round(v * FX)

export function hofSpotlights(): Spotlight[] {
  return SPOT_BASE.map((b, i) => ({
    base: fx16(b), angle: SPOT_ANGLE[i]! * FX, speed: SPOT_SPEED[i]!, color: SPOT_COLOR[i]!,
  }))
}

/** 한 프레임 (`ov86_0223CB74`) — 10°와 170°에서 되돌아선다 */
export function hofSpotStep(s: Spotlight): void {
  s.angle += s.speed
  if (s.speed > 0) {
    if (s.angle >= 696320) s.speed = -s.speed
  } else if (s.angle <= 40960) s.speed = -s.speed
}

/** 조명 판 네 꼭짓점 (월드 단위 · z 0) — 바닥 왼 · 바닥 오른 · 끝 오른 · 끝 왼 */
export function hofSpotQuad(s: Spotlight): [number, number][] {
  const deg = s.angle >> 12
  const rad = (deg * Math.PI) / 180
  // `FX_Mul(CalcCosineDegrees(v0), 10240)` — 길이 2.5. `FX_Mul`은 반올림한다(`+ 0x800 >> 12`)
  const mul = (a: number): number => Math.floor((a * 10240 + 0x800) / FX)
  const tipX = s.base + mul(Math.round(Math.cos(rad) * FX))
  const tipY = mul(Math.round(Math.sin(rad) * FX)) - FX
  return [
    [(s.base - 80) / FX, -1],
    [(s.base + 80) / FX, -1],
    [(tipX + 576) / FX, tipY / FX],
    [(tipX - 576) / FX, tipY / FX],
  ]
}

/** 색종이 하나 (`HallOfFameConfettiAnimation`) */
interface Confetti {
  x: number
  /** 아래 모서리 y (fx16 — `unk_08[3].y`) */
  y: number
  z: number
  /** 회전 (u16 각 단위) · 한 프레임의 증분 */
  rot: [number, number, number]
  spin: readonly [number, number, number]
  color: readonly [number, number, number]
}

const CONFETTI_COLORS: readonly (readonly [number, number, number])[] = [
  [16, 28, 21], [31, 16, 29], [8, 8, 31], [6, 31, 31], [31, 31, 0], [9, 31, 0], [31, 18, 0], [22, 0, 31],
]
export const HOF_CONFETTI = 48
/** 판 반폭 · 반높이 (fx16) */
export const HOF_CONFETTI_HALF = [156 / FX, 205 / FX] as const

/** `HallOfFame_InitConfettiTask` — 씨앗 13716으로 마흔여덟 장을 한 번에 깐다 */
export function hofConfetti(): Confetti[] {
  let seed = 13716
  const next = (): number => {
    seed = (Math.imul(seed, 1103515245) + 24691) >>> 0
    return seed >>> 16
  }
  const out: Confetti[] = []
  for (let i = 0; i < HOF_CONFETTI; i++) {
    const x = -4096 + (next() % 8192)
    const y = 4096 + (next() % 8192)
    const z = -328 + (next() % 656)
    // 네 꼭짓점마다 증분을 새로 뽑아 덮는다 — 남는 것은 마지막 셋이다
    let spin: [number, number, number] = [0, 0, 0]
    for (let v = 0; v < 4; v++) spin = [512 + (next() % 512), 512 + (next() % 512), 512 + (next() % 512)]
    const rot: [number, number, number] = [0, 0, 0]
    for (let k = next() & 7; k > 0; k--) {
      rot[0] = (rot[0] + spin[0]) & 0xffff
      rot[1] = (rot[1] + spin[1]) & 0xffff
      rot[2] = (rot[2] + spin[2]) & 0xffff
    }
    out.push({ x: x - 156, y: y + 205, z, rot, spin, color: CONFETTI_COLORS[i % CONFETTI_COLORS.length]! })
  }
  return out
}

/** 한 프레임 (`HallOfFame_DoConfettiAnimation`) — 85씩 떨어지고 −1 밑으로 가면 +1 위로 돈다 */
export function hofConfettiStep(c: Confetti): void {
  c.y -= 85
  if (c.y <= -4096) c.y = 4096 - (-4096 - c.y)
  c.rot[0] = (c.rot[0] + c.spin[0]) & 0xffff
  c.rot[1] = (c.rot[1] + c.spin[1]) & 0xffff
  c.rot[2] = (c.rot[2] + c.spin[2]) & 0xffff
}

/**
 * 판을 옮기는 자리 (월드 단위). 원작은 `unk_08[0]`(첫 꼭짓점 자리)로 옮긴 뒤 **가운데가 원점인** 판(±156 · ±205)을
 * 그린다 — 그래서 이 점이 그대로 판의 가운데가 된다
 */
export function hofConfettiAt(c: Confetti): [number, number, number] {
  return [c.x / FX, (c.y - 410) / FX, c.z / FX]
}

/**
 * 색종이 한 장의 색 (5비트 셋) — DS 정점 조명 그대로다 (GBATEK "Polygon Light Parameters").
 * 빛 0은 회색(11)으로 위에서, 빛 1은 제 색으로 아래에서 비춘다. 재질은 난반사 20 · 환경 0 · 반사 31 · 발광 = 제 색.
 *
 *   색 = 발광 + Σ 난반사 · 빛 · max(0, −L·N) + 반사 · 빛 · max(0, −H·N)²      H = (L + (0, 0, −1)) / 2
 *
 * @param normal 돌린 뒤의 법선 (원래 (0, 0, −1))
 */
export function hofConfettiColor(
  normal: readonly [number, number, number], color: readonly [number, number, number],
): [number, number, number] {
  const r = Math.SQRT1_2
  const lights: readonly (readonly [readonly [number, number, number], readonly [number, number, number]])[] = [
    [[0, r, -r], [11, 11, 11]],
    [[0, -r, r], color],
  ]
  const out: [number, number, number] = [color[0], color[1], color[2]]
  for (const [l, c] of lights) {
    const diffuse = Math.max(0, -(l[0] * normal[0] + l[1] * normal[1] + l[2] * normal[2]))
    const h = [l[0] / 2, l[1] / 2, (l[2] - 1) / 2] as const
    const shine = Math.max(0, -(h[0] * normal[0] + h[1] * normal[1] + h[2] * normal[2])) ** 2
    for (let k = 0; k < 3; k++) out[k] = out[k]! + (20 * c[k]! * diffuse) / 31 + (31 * c[k]! * shine) / 31
  }
  return [Math.min(31, out[0]), Math.min(31, out[1]), Math.min(31, out[2])]
}

/**
 * 화면 픽셀 (원작 256×192) → 카메라 앞 `depth`만큼 떨어진 판 위의 월드 좌표 (카메라 기준 · x 오른 · y 위).
 * 한 픽셀이 몇 월드 단위인가도 같이 준다 — 3D 몸을 원작 그림 크기에 맞출 때 쓴다
 */
export function hofScreenToWorld(x: number, y: number, depth: number): { x: number, y: number, unit: number } {
  const unit = (depth * Math.tan((HOF_HALF_FOV * Math.PI) / 180)) / 96
  return { x: (x - 128) * unit, y: (96 - y) * unit, unit }
}
