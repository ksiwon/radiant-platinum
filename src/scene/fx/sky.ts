// 하늘과 대기 (PLAN §6.2)
//
// **배경을 단색으로 두면 깊이가 사라진다.** 지평선이 안 보이니 지면이 종이처럼
// 보이고, 멀리 있는 것과 가까이 있는 것이 같은 밝기로 온다. 4세대 본가도 3D로
// 옮겨진 사례(Legends 계열)도 전부 하늘 그라디언트 + 거리 안개로 공간을 만든다.
//
// 셰이더를 쓸 일이 아니다 — 2×N 캔버스 하나면 충분하고, 배틀 무대와 오버월드가
// 같은 함수를 쓰므로 하늘색이 두 화면에서 어긋나지 않는다.
import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three'

/** 하늘 한 벌. `stops`는 위(0)에서 아래(1)로 간다 */
export interface SkyPreset {
  stops: readonly (readonly [number, string])[]
  /** 안개 색. 지평선 색과 같아야 먼 지형이 하늘로 녹아든다 */
  fog: string
  /** 안개가 시작하고 끝나는 거리(타일) */
  fogNear: number
  fogFar: number
}

/**
 * 낮.
 *
 * 아래로 갈수록 옅어지다 지평선에서 지면 색으로 넘어간다. 마지막 정지점을
 * 지면 계열로 두는 것이 요령이다 — 하늘색으로 끝내면 지평선에 띠가 생긴다.
 */
export const DAY: SkyPreset = {
  stops: [
    [0, '#3f6ea8'],
    [0.42, '#79aad6'],
    [0.68, '#bcd9ea'],
    [0.86, '#dcebe8'],
    [1, '#a8bf94'],
  ],
  fog: '#c3dbe6',
  fogNear: 38,
  fogFar: 130,
}

/**
 * 그라디언트 텍스처. 구(sphere) 안쪽에 입힌다.
 *
 * ⚠️ 구를 `scale={[-1,1,1]}`로 뒤집으면 안 된다 — 감기 방향만 바뀌고 컬링은
 * 그대로라 통째로 안 보인다(배틀 무대에서 그렇게 만들었다가 배경이 검게 나왔다).
 * `side={BackSide}`가 맞다.
 */
export function makeSkyTexture(preset: SkyPreset): CanvasTexture | null {
  const canvas = document.createElement('canvas')
  canvas.width = 2
  canvas.height = 256
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const grad = ctx.createLinearGradient(0, 0, 0, 256)
  for (const [at, color] of preset.stops) grad.addColorStop(at, color)
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 2, 256)
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  tex.minFilter = LinearFilter
  tex.magFilter = LinearFilter
  return tex
}

/**
 * 발밑 그림자용 원형 감쇠 텍스처.
 *
 * 방향광 그림자 맵을 켜는 것보다 훨씬 싸고, 타일이 인스턴스 메시라 그림자
 * 캐스터가 수만 개가 되는 상황에서는 이쪽이 더 안정적이다.
 */
export function makeBlobShadow(): CanvasTexture | null {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
  grad.addColorStop(0, 'rgba(0,0,0,0.5)')
  grad.addColorStop(0.55, 'rgba(0,0,0,0.26)')
  grad.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, 64, 64)
  const tex = new CanvasTexture(canvas)
  tex.colorSpace = SRGBColorSpace
  return tex
}
