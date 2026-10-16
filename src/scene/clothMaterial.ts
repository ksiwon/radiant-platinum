// 천의 펄럭임 — 셰이더의 `time` 하나로 돈다 (`cloth.ts` 머리말)
//
// 천 정점마다 실린 「매인 변까지 거리 d · 변 따라 자리 a · 길이 L · 위상 φ」(`CLOTH_WAVE`)로 판 법선 n 쪽 변위를 낸다:
//
//   w   = (d / L)^1.3                                   매인 변 0 · 끝 1 — 매인 변은 안 움직인다
//   θ   = K·d − Ω·t + 0.9·a + φ                           매인 변에서 끝으로 흘러가는 물결
//   D   = A·w·(0.72·sin θ + 0.28·sin(1.9θ + 1.3)) + B·w·(0.6 + 0.4·sin(0.37·Ω·t + φ))
//   위치 = p + n·D − e·(C·w·(1 + sin 2θ))                 e는 매인 변에서 멀어지는 쪽 — 끝이 살짝 끌려 올라간다
//
// B 항은 **한쪽으로 부푼 정도**다 — 바람을 받은 천은 평면을 중심으로 대칭으로 흔들리지 않는다. 숨 쉬듯 세기만 바뀐다.
//
// ⚠️ **값은 우리 값이다.** 원작 깃발은 움직이지 않았다(판 한 장). BDSP 바람 흔들림(`bdspMotion`)은 재질마다 실린 값이라
// 롬 판에는 없다 — 시간은 같은 `time`을 쓰고, 빠르기는 BDSP 풀 흔들림과 같은 결(초당 0.6가락 안팎)로 잡았다.
// 진폭은 1.08타일 폭 · 2.0타일 길이(`bf_hata02.1`의 불투명 상자 26×29텍셀 실측)의 천이 끝에서 한 뼘(0.12타일) 나부끼도록.
//
// 법선은 변위를 d · a로 미분해 기운다 — 평면 법선 그대로 두면 접힌 데가 빛으로 안 읽힌다:
//
//   n' = normalize(n − ∂D/∂d · e − ∂D/∂a · (n × e))
import { DoubleSide, type Color, type Texture } from 'three'
import { MeshLambertNodeMaterial, type Node } from 'three/webgpu'
import {
  attribute, cos, cross, faceDirection, normalLocal, normalize, positionLocal, pow, sin, time, transformNormalToView,
  vec3,
} from 'three/tsl'
import { CLOTH_AWAY_ATTR, CLOTH_WAVE } from './cloth'
import { motionDisabled } from './bdspMotion'
import { ALWAYS_ASYNC } from './asyncPipelines'

/** 물결 수 (라디안/타일). 2.0타일 천에 물결이 한 가락 남짓(8.4라디안) 걸린다 */
const WAVE_K = 4.2
/** 빠르기 (라디안/초) — 초당 0.64가락 */
const WAVE_OMEGA = 4.0
/** 나부낌 진폭 (타일, 끝자락) */
const SWAY = 0.12
/** 한쪽으로 부푼 정도 (타일, 끝자락) */
const BILLOW = 0.06
/** 끝이 매인 변 쪽으로 끌리는 정도 (타일) — 「살짝 들썩임」 */
const LIFT = 0.025
/** 매인 변에서 멀어질수록 커지는 굽이 */
const GROW = 1.3

/**
 * 천 재질 — 원작 판 재질의 그림을 **나눠 쓴다**(그림 임자는 청크 재질이다 — 이 재질을 버려도 그림은 안 버린다).
 * `ownMap` 표시를 안 다는 까닭이다
 */
export function clothMaterial(map: Texture | null, tint: Color, name: string): MeshLambertNodeMaterial {
  const m = new MeshLambertNodeMaterial({ map, color: tint, alphaTest: 0.5, side: DoubleSide })
  m.name = `${name} (천)`
  if (!motionDisabled()) {
    const wave = attribute(CLOTH_WAVE, 'vec4') as unknown as Node<'vec4'>
    const away = attribute(CLOTH_AWAY_ATTR, 'vec3') as unknown as Node<'vec3'>
    const n = normalLocal
    const d = wave.x, a = wave.y, L = wave.z, phi = wave.w
    const r = d.div(L)
    const w = pow(r, GROW)
    const theta = d.mul(WAVE_K).sub(time.mul(WAVE_OMEGA)).add(a.mul(0.9)).add(phi)
    const theta2 = theta.mul(1.9).add(1.3)
    const breathe = sin(time.mul(WAVE_OMEGA * 0.37).add(phi)).mul(0.4).add(0.6)
    const shape = sin(theta).mul(0.72).add(sin(theta2).mul(0.28))
    const D = w.mul(SWAY).mul(shape).add(w.mul(BILLOW).mul(breathe))
    const lift = w.mul(LIFT).mul(sin(theta.mul(2)).add(1))
    m.positionNode = positionLocal.add(n.mul(D)).sub(away.mul(lift))
    // ∂D/∂d — w의 미분(GROW·r^(GROW−1)/L)과 θ의 미분(K)
    const dShape = cos(theta).mul(0.72).add(cos(theta2).mul(0.28 * 1.9))
    const dw = pow(r.max(1e-3), GROW - 1).mul(GROW).div(L)
    const dDd = dw.mul(shape.mul(SWAY).add(breathe.mul(BILLOW))).add(w.mul(SWAY).mul(dShape).mul(WAVE_K))
    // ∂D/∂a — θ가 a에 0.9로 걸린다
    const dDa = w.mul(SWAY).mul(dShape).mul(0.9)
    const side = cross(n, away)
    const bent = normalize(n.sub(away.mul(dDd)).sub(side.mul(dDa)))
    // ⚠️ `normalNode`는 뒷면 뒤집기를 안 탄다(`BdspField.FOLIAGE_NORMAL`과 같은 길) — 천은 양면이라 직접 뒤집는다
    m.normalNode = transformNormalToView(vec3(bent)).toVarying('v_clothNormal').normalize().mul(faceDirection)
  }
  m.userData[ALWAYS_ASYNC] = true
  return m
}
