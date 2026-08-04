// 보행 사이클 — 각도만 내놓는 순수 함수 (PLAN §4.3)
//
// three도 씬 그래프도 모른다. 위상과 속도를 넣으면 관절 각도가 나온다.
// 리그에 바르는 일은 locomotion.ts가 하고, 여기는 "어떤 모양인가"만 담당한다 —
// 그래야 테스트에서 씬 없이 사이클 자체를 검증할 수 있다.
//
// ⚠️ 이건 BDSP 원본 클립이 아니다. 번들의 walk_b/run_b를 glTF로 옮기는 경로가
// 아직 검증되지 않아서(도구 체인 미비) 그동안 쓸 절차적 대체물이다. 본 이름이
// 같으므로 실제 클립이 들어오면 이 계층만 걷어내면 된다.

/** 한 걸음의 보폭(m). 위상 속도를 여기서 유도하므로 발이 미끄러지지 않는다 */
export const STRIDE_LENGTH = 0.85

/** 관절 각도(라디안). 부호는 리그 축에 매이지 않는다 — locomotion.ts가 축을 정한다 */
export interface Gait {
  /** 넓적다리 앞뒤 스윙. 양수가 앞 */
  thighL: number
  thighR: number
  /** 무릎 굽힘. 항상 0 이상 (무릎은 한쪽으로만 접힌다) */
  kneeL: number
  kneeR: number
  /** 발목 */
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
  /** 골반 상하 진동(m). 발이 땅에 닿을 때 낮아진다 */
  bob: number
  /** T포즈에서 팔을 옆구리로 내리는 양. 이동과 무관한 상수 자세 */
  armDrop: number
}

const TWO_PI = Math.PI * 2

const AMP = {
  /** 걷기 기준 진폭. 달리기에서 run 만큼 더 커진다 */
  thigh: 0.42, thighRun: 0.30,
  knee: 0.85, kneeRun: 0.45,
  foot: 0.25,
  arm: 0.32, armRun: 0.35,
  forearm: 0.20, forearmRun: 0.35,
  torsoYaw: 0.07,
  bob: 0.022,
  /** 바인드 포즈가 T포즈라 팔을 약 72° 내려야 자연스럽다 */
  armDrop: 1.26,
  breath: 0.020,
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/**
 * 위상 진행 속도(rad/s).
 *
 * 임의로 정하지 않고 보폭에서 유도한다: 한 사이클이 두 걸음이므로
 * `속도 / (2 × 보폭)`이 초당 사이클 수다. 이렇게 묶어 두면 속도를 바꿔도
 * 발이 땅 위에서 미끄러지지 않는다.
 */
export function phaseRate(speed: number): number {
  return (TWO_PI * speed) / (2 * STRIDE_LENGTH)
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
  const kneeAmp = (AMP.knee + AMP.kneeRun * r) * m
  const armAmp = (AMP.arm + AMP.armRun * r) * m

  // 무릎은 **유각기**(다리가 뒤에서 앞으로 나오며 발이 땅에서 떨어진 구간)에만 접힌다.
  // 여기 규약에서 넓적다리 각이 sin(p)이므로 다리는 p=-π/2에서 최대 후방,
  // p=+π/2에서 최대 전방이다. 즉 유각기는 p ∈ (-π/2, π/2)이고 cos(p)가 양수인 구간과
  // 정확히 같다. +0.5만큼 앞당겨 유각 초반에 가장 많이 접히게 한다.
  //
  // 입각기(체중을 싣고 앞→뒤로 미는 구간)에 접히면 무릎이 꺾이는 것처럼 보인다.
  // max(0, ...)는 무릎이 한쪽으로만 굽게 만든다.
  const knee = (p: number) => Math.max(0, Math.cos(p + 0.5)) * kneeAmp

  return {
    thighL: s * thighAmp,
    thighR: sOpp * thighAmp,
    kneeL: knee(phase),
    kneeR: knee(phase + Math.PI),
    // 발목은 넓적다리를 절반쯤 상쇄해 발바닥이 지면과 나란하게 유지된다
    footL: -s * AMP.foot * m,
    footR: -sOpp * AMP.foot * m,
    // 팔은 같은 쪽 다리와 반대 위상이다
    armL: sOpp * armAmp,
    armR: s * armAmp,
    forearmL: (AMP.forearm + AMP.forearmRun * r) * m + 0.12,
    forearmR: (AMP.forearm + AMP.forearmRun * r) * m + 0.12,
    torsoYaw: sOpp * AMP.torsoYaw * m,
    // 한 사이클에 두 번 내려앉는다 — 양발이 각각 착지하므로 주파수가 두 배다
    bob: -Math.abs(Math.sin(phase)) * AMP.bob * m,
    armDrop: AMP.armDrop,
  }
}

/** 정지 상태의 호흡. 보행 위상과 무관하게 흐르는 시간으로 돈다 */
export function idleBreath(elapsed: number, moving: number): number {
  return Math.sin(elapsed * 1.6) * AMP.breath * (1 - clamp01(moving))
}
