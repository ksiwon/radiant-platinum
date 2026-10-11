// 기라티나의 등장 몸짓 — 숨었다가 위에서 내려앉는다 (`battle_display.c`의 `Task_SetGiratinaEncounter` 1882~ · 278~303)
//
// 깨어진 세계의 기라티나(`BATTLE_STATUS_GIRATINA` · `encounter.c` 988 — 우리 판정은 `Terrain.GIRATINA`인 야생)만 이 길을 탄다.
// 일반 야생은 필드에 이미 서 있는 것으로 시작한다(`BattleStage`의 `standing`) — 여기서만 그 가정을 끈다.
//
//     상태 0 · 1   28프레임 기다린다 (`delay = 28` · 스프라이트는 화면 위 −136px에 놓인 채다 — `v10 = (24·8 − −80) / 2`)
//     상태 2       프레임마다 Y +4(`MON_SPRITE_Y_CENTER += 8 / 2`) — **이징 없이** 34프레임에 136px. 발판은 같은 동안 x +8로 미끄러진다
//     착지         울음(`Species_PlayDelayedCry`) · 동작 0번 · `StartFade(8, 0, 0, 0)` — 검정 8/16에서 프레임마다 1씩 밝아진다
//
// 낙하 내내 몸은 검정 8/16으로 눌려 있다(`StartFade(8, 8, 0, 0)` · 278 줄 위) · 그림자 크기는 0이다(`MON_SPRITE_SHADOW_SIZE`).
// 틱은 1/60초다 (`COMPLETION_20260928` §0)

/** 숨어 기다리는 프레임 */
export const GIRATINA_WAIT_FRAMES = 28
/** 내려앉는 프레임 — 136px ÷ 4 */
export const GIRATINA_FALL_FRAMES = 34
/** 착지하는 프레임 (기다림 + 낙하) — 울음 · 밝아짐이 여기서 시작한다 */
export const GIRATINA_LAND_FRAMES = GIRATINA_WAIT_FRAMES + GIRATINA_FALL_FRAMES
/** 착지까지의 초 */
export const GIRATINA_LAND_SECONDS = GIRATINA_LAND_FRAMES / 60
/** 눌린 어둠이 걷히는 프레임 — 검정 8/16 → 0이 프레임마다 1씩 */
export const GIRATINA_BRIGHTEN_FRAMES = 8
/** 낙하 내내 몸을 누르는 검정의 몫 (8/16) */
export const GIRATINA_DARK = 8 / 16

/** 원작 낙하 거리 · 화면 높이 (px) — 월드로 옮길 때 화면 비율로 쓴다 (`v10` · DS 아래 화면 높이 `24 * 8`) */
export const GIRATINA_DROP_PX = 136
export const DS_SCREEN_PX = 192

export interface GiratinaDrop {
  /** 몸이 서 있는가 — 기다리는 동안은 화면 밖이라 안 보인다 */
  visible: boolean
  /** 시작 높이에 대한 남은 높이의 몫 — 1 = 화면 밖 시작점, 0 = 착지. 등속이다 */
  lift: number
  /** 그림자를 깔아도 되는가 — 낙하 동안은 0이다 */
  shadow: boolean
  /** 착지했는가 */
  landed: boolean
  /** 몸을 누르는 검정의 몫 (0 ~ 8/16) */
  dark: number
}

/** 시작한 지 `frames`틱이 지난 때의 몸짓 (60Hz 틱) */
export function giratinaDropAt(frames: number): GiratinaDrop {
  const f = Math.max(0, frames)
  const fall = Math.min(1, Math.max(0, (f - GIRATINA_WAIT_FRAMES) / GIRATINA_FALL_FRAMES))
  const landed = f >= GIRATINA_LAND_FRAMES
  const bright = Math.min(1, Math.max(0, (f - GIRATINA_LAND_FRAMES) / GIRATINA_BRIGHTEN_FRAMES))
  return {
    visible: f >= GIRATINA_WAIT_FRAMES,
    lift: 1 - fall,
    shadow: landed,
    landed,
    dark: GIRATINA_DARK * (1 - bright),
  }
}

/**
 * 낙하의 시작 높이(월드 m) — 발끝이 **화면 위 가장자리 밖**에서 시작하게 한다.
 *
 * 원작은 136px(화면 192px의 71%)를 내리는데 스프라이트가 80px라 시작 때 통째로 화면 밖이다(`v10`). 3D는 몸 키가 종마다
 * 달라 비율만으로는 안 맞는다 — 그래서 **발끝이 화면 맨 위 선에 닿는 높이**(카메라 기준으로 잰다)에 10%를 얹고,
 * 원작 비율(화면 높이 × 136/192)보다 작아지지 않게 한다. 둘 다 우리 값이다(원작에 월드 환산이 없다)
 *
 * @param cam 카메라 자리 · @param target 바라보는 자리 · @param fov 세로 전각(도) · @param foot 발끝(월드)
 */
export function giratinaStartHeight(
  cam: readonly [number, number, number], target: readonly [number, number, number], fov: number,
  foot: readonly [number, number, number],
): number {
  const sub = (a: readonly number[], b: readonly number[]): [number, number, number] => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!]
  const dot = (a: readonly number[], b: readonly number[]): number => a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!
  const unit = (a: readonly number[]): [number, number, number] => {
    const l = Math.hypot(a[0]!, a[1]!, a[2]!) || 1
    return [a[0]! / l, a[1]! / l, a[2]! / l]
  }
  const f = unit(sub(target, cam))
  const v = sub(foot, cam)
  const depth = Math.max(0.01, dot(v, f))
  // 카메라 위쪽 — 월드 위(0,1,0)에서 시선을 뺀 것
  const upRaw: [number, number, number] = [-f[1] * f[0], 1 - f[1] * f[1], -f[1] * f[2]]
  const up = unit(upRaw)
  const half = Math.tan((fov * Math.PI) / 360)
  const viewH = 2 * depth * half
  // 발끝이 화면 위 끝(NDC +1)까지 올라야 하는 높이 — 시선 수직 방향의 거리를 월드 위로 옮긴다
  const ndcY = dot(v, up) / (depth * half)
  const toTop = Math.max(0, ((1 - ndcY) / 2) * viewH) / Math.max(0.2, up[1])
  return Math.max(toTop * 1.1, viewH * (GIRATINA_DROP_PX / DS_SCREEN_PX))
}

/**
 * 지금 내려앉는 기라티나가 **착지하는 연출 시각**(`battleClock.now()` 초) — 없으면 `null`.
 * 울음이 착지에 난다(`Species_PlayDelayedCry`)라 소리 쪽(`ui/battle/BattleSound`)이 이 시각을 기다린다. 몸(`BattleStage`)이 적는다
 */
export const giratinaLanding: { at: number | null } = { at: null }
