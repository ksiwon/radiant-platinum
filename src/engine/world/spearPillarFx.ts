// 창기둥의 필드 연출 (`ScrCmd_20D` → `ov6_02243004` · `overlay006/ov6_0223E140.c`)
//
// 스크립트가 쓰는 갈래는 넷뿐이다 — 0이 붉은 사슬을 세우고 1이 끝났는가를 묻는다(`scripts_spear_pillar.s` 373·383),
// 4가 호수의 구슬 셋을 띄우고 6이 끝났는가를 묻는다(`scripts_spear_pillar_distorted.s` 36·39). 나머지(2·3·5·7·8·9)는
// 아무 스크립트도 안 부른다.
//
// **붉은 사슬 (0 · 1)** — 온 화면이 빨강(RGB555 27,0,0)인 BG2를 3D 위에 알파 섞기로 얹고(`G2_SetBlendAlpha(BG2, BG0,
// eva, evb)`) 그 둘을 한 틱에 1씩 밀어 **맥동**시킨다. 동시에 사슬 모델(`demo_kusari`)이 아카기 자리에 서서 201프레임을
// 한 번 돈다. 맥동 열둘과 사슬 애니가 다 끝나면 둘을 9틱에 0으로 내려 **검게** 닫는다. 화면 한 점은
// `min(31, (빨강·eva + 장면·evb) / 16)`이고 두 몫은 16에서 멈춘다.
//
//     단계 0      evb 31 → 16 (보이는 것은 그대로다 — 16이 넘는 몫은 안 쓴다)
//     단계 홀수   (8, 8)로
//     단계 짝수   (2,14) 1~4 · (3,13) 5~8 · (4,12) 9~10 · (5,11) 11~12
//     단계마다 7틱을 쉬고(`++wait >= 8`) 한 틱에 1씩 간다 — 둘 다 닿은 **다음** 틱에 끝난다
//
// ⚠️ **원작은 이 동안 십자키로 eva · evb를 1씩 민다**(`ov6_02240364` 머리의 `pressedKeys`) — 만들 때 남은 조정 손잡이다.
// 옮기지 않는다: 보는 사람이 모르는 새 맥동이 틀어진다.
//
// ⚠️ **틱은 1/60초로 센다** (COMPLETION_20260928 §0의 갈림길)

/** 맥동과 사슬 한 벌 (`UnkStruct_ov6_0223E548` · `UnkStruct_ov6_02240260`) */
export interface ChainFx {
  /** 3 맥동 · 4 닫기 · 11 끝 (원작 상태 번호) */
  state: 3 | 4 | 11
  step: number
  wait: number
  eva: number
  evb: number
  /** 사슬 애니 프레임 (0 ~ `frames`) */
  frame: number
  frames: number
  visible: boolean
}

/** 사슬의 BCA0 길이 (`demo_tengan_gra` 4번) */
const CHAIN_FRAMES = 201
/** 맥동 단계 수 — `unk_04 != 12`에서 멈춘다 */
const PULSE_STEPS = 12

/**
 * 첫 틱까지 (`ov6_02240104` · `ov6_0223E574`의 0 → 1 → 2) — 섞기는 (0, 31)에서 시작하고, 사슬이 아카기 자리에 선다.
 * 원작은 세우는 프레임에 0 · 1 · 2를 한 번에 떨어져 지나가 3에서 멈춘다
 */
export function chainStart(frames = CHAIN_FRAMES): ChainFx {
  return { state: 3, step: 0, wait: 0, eva: 0, evb: 31, frame: 0, frames, visible: true }
}

/** 짝수 단계의 목표 eva (`ov6_02240364`의 갈래) — 홀수는 늘 8 */
function lowTarget(step: number): number {
  if (step <= 4) return 2
  if (step <= 8) return 3
  if (step <= 10) return 4
  if (step <= 12) return 5
  return 6
}

/** 한 틱 밀고 둘 다 닿았는가 (`ov6_02240364`) — 닿은 틱이 아니라 **닿아 있음을 본 틱**에 참이다 */
function pulseStep(c: ChainFx, odd: boolean, step: number): boolean {
  let a = false, b = false
  if (step === 0) {
    if (c.evb > 16) c.evb--
    else a = b = true
  } else if (step <= 14) {
    if (odd) {
      if (c.eva < 8) c.eva++
      else a = true
      if (c.evb > 8) c.evb--
      else b = true
    } else {
      const lo = lowTarget(step)
      if (c.eva > lo) c.eva--
      else a = true
      if (c.evb < 16 - lo) c.evb++
      else b = true
    }
  } else {
    if (c.eva > 0) c.eva--
    else a = true
    if (c.evb > 0) c.evb--
    else b = true
  }
  return a && b
}

/** 한 틱 (`ov6_0223E574`의 3 · 4) */
export function chainTick(c: ChainFx): void {
  if (c.state === 3) {
    let stepped = false
    if (c.step !== PULSE_STEPS) {
      if (++c.wait >= 8) {
        stepped = pulseStep(c, c.step % 2 === 1, c.step)
        if (stepped) {
          c.wait = 0
          c.step++
        }
      }
    } else {
      stepped = true
    }
    // ⚠️ **애니는 늘 민다** — 원작 조건이 `ov6_022405D0(…) && v3`라 앞쪽이 먼저 돈다 (`Easy3DAnim_Update` · 끝에서 멈춤)
    let ended = false
    if (c.frame + 1 < c.frames) c.frame++
    else { c.frame = c.frames; ended = true }
    if (ended) c.visible = false
    if (ended && stepped) {
      c.wait = 0
      c.state = 4
    }
  } else if (c.state === 4) {
    // 기본 갈래(`param2` 60) — 둘 다 0으로
    if (pulseStep(c, false, 60)) c.state = 11
  }
}

/**
 * 지금 섞기를 화면 덮개 둘로 옮긴다 — 빨강 한 겹(알파)과 검정 한 겹.
 *
 * `(빨강·eva + 장면·evb)/16`을 「빨강을 a로 얹고 그 위를 검정 b로 덮는다」로 풀면 `a = eva/(eva+evb)`,
 * `1 − b = (eva+evb)/16`이다(몫은 16에서 멈춘다). 맥동 동안은 두 몫의 합이 16이라 검정이 0이고, 닫을 때만 검게 내려간다
 */
export function chainCover(c: ChainFx): { red: number, black: number } {
  const e = Math.min(16, c.eva), s = Math.min(16, c.evb)
  const sum = e + s
  return { red: sum > 0 ? e / sum : 0, black: 1 - Math.min(16, sum) / 16 }
}
