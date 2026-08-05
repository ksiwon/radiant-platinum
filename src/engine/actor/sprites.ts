// NPC 그림표 (DATA.md §2.16)
//
// 원작의 오버월드 사람은 모델이 아니라 **판때기 하나에 텍스처를 갈아 끼운
// 것**이다. 방향도 걸음도 전부 텍스처가 바뀌는 것이지 뼈대가 움직이는 게 아니다.
//
// 어느 장을 언제 쓰는지는 두 자료가 나눠 갖고 있다:
//
//   `anims`  동작마다 틱 구간 — 걷는 사람은 넷(북·남·서·동)이다
//   `seq`    그 틱에 쓸 장 번호
//
// 그래서 "동작 a의 e틱째"를 물으면 구간 안으로 접은 뒤 차례표를 뒤져 장을 준다.
// 이 모듈은 three를 모른다 — 씬은 여기서 받은 장 번호로 UV만 옮긴다.

/** `BILLBOARD_ANIM_TYPE_*` */
const LOOP = 0

/** 동작 하나: [시작 틱, 끝 틱, 종류] */
export type Anim = readonly [number, number, number]

export interface NpcSprite {
  /** `OBJ_EVENT_GFX_` 를 뗀 이름. 사람이 읽으려고 둔다 */
  name: string
  /** 한 장의 크기(텍셀) */
  w: number
  h: number
  /** 아틀라스에 가로로 이어 붙인 장 수 */
  frames: number
  seq: { ticks: number[]; frames: number[] } | null
  anims: Anim[] | null
  /** 동작이 넷이면 그것이 곧 방향이다 */
  directional: boolean
}

let table: Record<string, NpcSprite> = {}

export function loadNpcSprites(data: Record<string, NpcSprite>): void {
  table = data
}

export function npcSprite(gfx: number): NpcSprite | null {
  return table[String(gfx)] ?? null
}

/**
 * 텍셀 몇 개가 한 타일인가.
 *
 * 원작 판때기 모델을 재서 나온 값이다 — `generic_32x32.nsbmd`가 32×32유닛이고
 * 한 타일이 16유닛이니 **정확히 2×2타일**이다. 16×16짜리는 1타일, 64×64짜리는
 * 4타일로 딱 떨어진다. 세 판이 다 맞으므로 눈대중이 아니다.
 *
 * 모델의 y가 0에서 32까지라 **원점이 발밑**이다. 우리 판때기도 그렇게 세운다
 */
export const TEXELS_PER_TILE = 16

// ── 방향 ─────────────────────────────────────────────────────────────────────
//
// `constants/map_object.h`는 북0·남1·서2·동3이다. 나침반 차례(북0·동1·남2·서3)가
// 아니라서 카메라를 돌릴 때 그냥 더하면 엉뚱한 그림이 나온다. 두 번 갈아탄다.

/** DIR_* → 나침반 차례 */
const TO_COMPASS = [0, 2, 3, 1]
/** 나침반 차례 → DIR_* */
const FROM_COMPASS = [0, 3, 1, 2]

/**
 * 카메라가 도는 만큼 그림도 돌려야 한다.
 *
 * 원작은 카메라가 늘 북쪽을 보므로 **동작 번호 = 방향 번호**였다. 우리는 1인칭이
 * 있어서 시선이 돌아간다 — 마주 보고 선 사람은 뒤통수가 아니라 얼굴이어야 한다.
 *
 * @param dir NPC가 보는 쪽 (DIR_*)
 * @param quadrant 카메라가 북쪽에서 몇 사분면 돌았나 (0이면 원작과 같다)
 */
export function artDir(dir: number, quadrant: number): number {
  const c = TO_COMPASS[dir & 3] ?? 0
  return FROM_COMPASS[(c - quadrant + 8) % 4] ?? 0
}

/** 카메라가 보는 쪽을 사분면으로. −Z가 북쪽이다 */
export function cameraQuadrant(dx: number, dz: number): number {
  const q = Math.round(Math.atan2(dx, -dz) / (Math.PI / 2))
  return ((q % 4) + 4) % 4
}

// ── 장 고르기 ────────────────────────────────────────────────────────────────

/**
 * 동작 `anim`의 `elapsed`틱째에 쓸 장.
 *
 * 차례표의 틱은 **전체 타임라인 기준**이라(걷기는 0~63) 동작 구간 안으로 접은 뒤
 * 그 값 이하인 마지막 항목을 고른다. 서 있는 사람은 `elapsed`가 0이라 늘 그
 * 방향의 첫 장이다.
 */
export function frameOf(sprite: NpcSprite, anim: number, elapsed: number): number {
  const { anims, seq } = sprite
  if (anims === null || seq === null) return 0
  const a = anims[Math.min(anim, anims.length - 1)]
  if (a === undefined) return 0
  const [from, to, kind] = a
  const span = to - from + 1
  if (span <= 0) return 0
  const e = Math.max(0, Math.floor(elapsed))
  const tick = from + (kind === LOOP ? e % span : Math.min(e, span - 1))

  let pick = 0
  for (let i = 0; i < seq.ticks.length; i++) {
    const t = seq.ticks[i]
    if (t === undefined || t > tick) break
    pick = seq.frames[i] ?? 0
  }
  return Math.min(pick, sprite.frames - 1)
}
