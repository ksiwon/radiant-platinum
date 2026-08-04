// 보행 사이클 — 각도만 내놓는 순수 함수 (PLAN §4.3)
//
// three도 씬 그래프도 모른다. 위상과 속도를 넣으면 관절 각도가 나온다.
// 리그에 바르는 일은 locomotion.ts가 하고, 여기는 "어떤 모양인가"만 담당한다 —
// 그래야 테스트에서 씬 없이 사이클 자체를 검증할 수 있다.
//
// ⚠️ 이건 BDSP 원본 클립이 아니다. 번들의 walk_b/run_b를 glTF로 옮기는 경로가
// 아직 검증되지 않아서(도구 체인 미비) 그동안 쓸 절차적 대체물이다. 본 이름이
// 같으므로 실제 클립이 들어오면 이 계층만 걷어내면 된다.

/** 걷기의 보폭(m). 위상 속도를 여기서 유도하므로 발이 미끄러지지 않는다 */
export const STRIDE_LENGTH = 0.85

/** 관절 각도(라디안). 부호는 리그 축에 매이지 않는다 — locomotion.ts가 축을 정한다 */
export interface Gait {
  /** 넓적다리 앞뒤 스윙. 양수가 앞 */
  thighL: number
  thighR: number
  /** 무릎 굽힘. 항상 0 이상이고, 이동 중이면 절대 0이 아니다 */
  kneeL: number
  kneeR: number
  /** 발목. 양수가 배측굴곡(발끝 들기) */
  footL: number
  footR: number
  /** 팔 앞뒤 스윙 */
  armL: number
  armR: number
  /** 팔꿈치 굽힘. 항상 0 이상 */
  forearmL: number
  forearmR: number
  /** 상체 좌우 비틀림 */
  torsoYaw: number
  /** 상체 전방 기울기. 양수가 앞. 달릴수록 커진다 */
  lean: number
  /** 골반 상하 진동(m). 발이 땅에 닿을 때 낮아진다 */
  bob: number
  /** T포즈에서 팔을 옆구리로 내리는 양. 이동과 무관한 상수 자세 */
  armDrop: number
  /** 팔을 몸통보다 살짝 앞에 두는 상수 오프셋. 등에 멘 가방을 파고들지 않게 한다 */
  armForward: number
}

const TWO_PI = Math.PI * 2

const AMP = {
  /** 걷기 기준 진폭. 달리기에서 run 만큼 더 커진다 */
  thigh: 0.42, thighRun: 0.30,
  /** 무릎이 절대 도달하지 않는 하한. 완전히 락되면 죽마를 짚은 것처럼 보인다 */
  kneeBase: 0.12,
  /** 유각기 굽힘. 달리면 116°까지 접힌다 — 실제 달리기가 그렇다 */
  kneeSwing: 1.05, kneeSwingRun: 0.85,
  /** 입각 초 충격 흡수. 유각기 굽힘의 1/5쯤이다 */
  kneeStance: 0.22, kneeStanceRun: 0.45,
  foot: 0.25,
  /** 무릎 굽힘을 발목이 되받는 비율. 정강이가 접혀도 발바닥이 덜 들린다 */
  footKneeComp: 0.35,
  arm: 0.32, armRun: 0.35,
  /** 팔꿈치 상시 굽힘. 달리면 70°대에서 유지된다 */
  forearm: 0.30, forearmRun: 0.70,
  /** 팔이 앞으로 나올 때만 더 접힌다 */
  forearmSwing: 0.25, forearmSwingRun: 0.20,
  torsoYaw: 0.07,
  /**
   * 상체 전방 기울기. 걷기 3°, 달리기 13°.
   *
   * 달릴 때 몸을 세우고 있으면 발이 몸을 밀어내는 게 아니라 끌고 가는 것처럼 보인다.
   * 실제로는 발목부터 온몸이 기울지만 여기서는 척추만 기울인다 — 골반을 기울이면
   * 다리가 통째로 따라가 발이 지면을 뚫는다
   */
  lean: 0.05, leanRun: 0.17,
  bob: 0.022,
  /**
   * 바인드 포즈가 T포즈라 팔을 내려야 한다. 1.20rad(69°)면 수직에서 21° 벌어져
   * 팔이 몸통·가방을 스치지 않는다. 90°까지 내리면 팔이 옆구리에 붙어 파고든다
   */
  armDrop: 1.20,
  /** 팔을 살짝 앞으로. 사람이 서 있을 때 팔은 몸통 평면보다 조금 앞에 있다 */
  armForward: 0.14,
  /** 쉬는 자세의 팔꿈치 굽힘. 완전히 펴면 마네킹처럼 뻣뻣해 보인다 */
  forearmRest: 0.24,
  breath: 0.020,
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * 실제 보폭(m). 달릴수록 길어진다.
 *
 * 계수를 따로 두지 않고 **넓적다리 진폭 비율에서 그대로 유도한다** — 다리를 크게
 * 휘두르면 그만큼 멀리 딛는 것이 보폭의 정의이기 때문이다. 상수를 따로 두면 진폭만
 * 만지다가 보폭과 어긋나 발이 미끄러진다.
 *
 * 고정 보폭일 때 달리기(8m/s)는 초당 9.4걸음이었다. 사람은 그렇게 안 뛴다 —
 * 속도가 오르면 회전수보다 보폭이 먼저 늘어난다.
 */
export function strideLength(run: number): number {
  return STRIDE_LENGTH * (1 + (AMP.thighRun / AMP.thigh) * clamp01(run))
}

/**
 * 위상 진행 속도(rad/s).
 *
 * 임의로 정하지 않고 보폭에서 유도한다: 한 사이클이 두 걸음이므로
 * `속도 / (2 × 보폭)`이 초당 사이클 수다. 이렇게 묶어 두면 속도를 바꿔도
 * 발이 땅 위에서 미끄러지지 않는다.
 */
export function phaseRate(speed: number, run = 0): number {
  return (TWO_PI * speed) / (2 * strideLength(run))
}

/** 최대 굽힘 위상. 접지(π/2) 기준 각각 사이클의 15%·72% 지점이다 */
const STANCE_PEAK = Math.PI / 2 + 0.94
const SWING_PEAK = -0.19

/**
 * 무릎 굽힘 곡선.
 *
 * 넓적다리 각이 sin(p)이므로 p=π/2가 최대 전방 = 접지 직전, p=3π/2가 최대 후방 =
 * 이탈이다. 즉 입각기는 (π/2, 3π/2), 유각기는 그 나머지다.
 *
 * 실제 무릎은 **한 사이클에 두 번, 크기가 아주 다르게** 굽는다:
 *  ① 유각기 — 발을 지면에서 떼려고 크게 접는다 (걷기 60°, 달리기 116°)
 *  ② 입각 초 — 체중을 받으며 살짝 꺾여 충격을 먹는다 (걷기 15°, 달리기 32°)
 * 그리고 어느 순간에도 완전히 펴지지 않는다.
 *
 * ⚠️ 이전 모델은 `max(0, cos(p+0.5))` 하나뿐이라 **반주기 내내 무릎이 정확히 0**이었다.
 * 그래서 달릴 때 다리를 쭉 편 채로 벌리는 가위 모양이 나왔다.
 */
function kneeAngle(phase: number, m: number, r: number): number {
  const swing = Math.max(0, Math.cos(phase - SWING_PEAK))
  const load = Math.max(0, Math.cos(phase - STANCE_PEAK))
  return (
    AMP.kneeBase
    + (AMP.kneeSwing + AMP.kneeSwingRun * r) * swing
    // 제곱해 좁힌다 — 흡수는 접지 직후 짧게 끝난다
    + (AMP.kneeStance + AMP.kneeStanceRun * r) * load * load
  ) * m
}

/**
 * @param phase  보행 위상(rad). 0에서 왼발이 앞
 * @param moving 0=정지 1=완전 이동. 멈출 때 스윙이 잦아든다
 * @param run    0=걷기 1=달리기. 진폭만 키운다
 */
export function sampleGait(phase: number, moving: number, run: number): Gait {
  const m = clamp01(moving)
  const r = clamp01(run)
  const s = Math.sin(phase)
  const sOpp = Math.sin(phase + Math.PI)

  const thighAmp = (AMP.thigh + AMP.thighRun * r) * m
  const armAmp = (AMP.arm + AMP.armRun * r) * m

  const kneeL = kneeAngle(phase, m, r)
  const kneeR = kneeAngle(phase + Math.PI, m, r)

  // 팔꿈치는 상시 굽힘 + 앞으로 나올 때의 추가 굽힘이다. 달릴 때 팔을 쭉 펴고
  // 흔드는 사람은 없다 — 뛸수록 접고 붙인다
  const forearm = (swing: number) =>
    AMP.forearmRest
    + ((AMP.forearm + AMP.forearmRun * r)
      + (AMP.forearmSwing + AMP.forearmSwingRun * r) * Math.max(0, swing)) * m

  // 발목은 넓적다리를 절반쯤 상쇄해 발바닥이 지면과 나란하게 유지된다.
  //
  // 무릎 굽힘도 되받는다. 부호에 주의 — 무릎/팔꿈치는 "양수 = 뒤로 접힘" 규약이고
  // 나머지는 "양수 = 앞" 규약이다. 정강이가 뒤로 k만큼 접혔으면 발등은 앞으로
  // 들어 올려야(배측굴곡) 발바닥이 덜 딸려 간다. 그래서 부호가 **더하기**다
  const foot = (sw: number, knee: number) => -sw * AMP.foot * m + knee * AMP.footKneeComp

  return {
    thighL: s * thighAmp,
    thighR: sOpp * thighAmp,
    kneeL,
    kneeR,
    footL: foot(s, kneeL),
    footR: foot(sOpp, kneeR),
    // 팔은 같은 쪽 다리와 반대 위상이다
    armL: sOpp * armAmp,
    armR: s * armAmp,
    forearmL: forearm(sOpp),
    forearmR: forearm(s),
    torsoYaw: sOpp * AMP.torsoYaw * m,
    lean: (AMP.lean + AMP.leanRun * r) * m,
    // 한 사이클에 두 번 내려앉는다 — 양발이 각각 착지하므로 주파수가 두 배다
    bob: -Math.abs(Math.sin(phase)) * AMP.bob * m,
    armDrop: AMP.armDrop,
    armForward: AMP.armForward,
  }
}

/** 정지 상태의 호흡. 보행 위상과 무관하게 흐르는 시간으로 돈다 */
export function idleBreath(elapsed: number, moving: number): number {
  return Math.sin(elapsed * 1.6) * AMP.breath * (1 - clamp01(moving))
}
