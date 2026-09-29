// 정사영 입자 카메라의 입자를 DS 화면 사각형으로 (`ParticleSystem_SetCameraProjection(…, CAMERA_PROJECTION_ORTHOGRAPHIC)`)
//
// 사천왕전 컷인(`cutInElite`)과 배틀팩토리의 연기(`scene/factoryStage`)가 같은 카메라를 쓴다 — 자리 (0, 0, 4)에서 원점을 보고
// (`sParticleSystemDefaultCameraPos`) 반화각 45°라 정사영의 위끝이 tan 45° × 4 = 4다(`Camera_ComputeProjectionMatrix`). 곧 위아래
// ±4가 192줄 · 한 칸이 24픽셀이다.
//
// ⚠️ **빌보드만 옮겼다.** 이 카메라를 쓰는 자료 열 벌(사천왕전 일곱 · 팩토리 셋)이 다 빌보드다 — 다른 갈래가 오면 던진다
import type { CutInParticle } from './encounterCutIn'
import type { SplEmitter } from './spl/emitter'
import { cosIdx, FX32_ONE, sinIdx } from './spl/fx'
import { DRAW, FX16_ONE, type SplFile } from './spl/resource'

/** 입자 카메라 — 정사영 위아래 ±4가 192줄 */
const PX_PER_UNIT = 192 / 8

/** 이미터 하나와 그 리소스 */
export interface OrthoEmitter { file: SplFile, index: number, emitter: SplEmitter }

/** 입자를 DS 픽셀 사각형으로 (`SPLDraw_Billboard` — 사천왕전 107 · 108 · 팩토리 연기가 다 빌보드다) */
export function orthoQuads(live: readonly OrthoEmitter[]): CutInParticle[] {
  const out: CutInParticle[] = []
  const span = (tiles: number, flip: boolean): number => (flip ? -1 : 1) * (1 << tiles)
  // 늦게 선 이미터가 먼저 그려진다 (`SPL_DRAW_ORDER_REVERSE`)
  for (let e = live.length - 1; e >= 0; e--) {
    const { file, index, emitter } = live[e]!
    const res = file.resources[index]!
    const h = res.header
    const put = (p: SplEmitter['particles'][number], child: boolean): void => {
      const drawType = child ? res.child!.drawType : h.flags.drawType
      if (drawType !== DRAW.billboard) throw new Error(`정사영 입자: 빌보드가 아닌 갈래(${String(drawType)})`)
      const alpha = (p.baseAlpha * (p.animAlpha + 1)) >> 5
      if (alpha === 0) return
      let sy = p.baseScale / FX32_ONE
      let sx = sy * (h.aspectRatio / FX16_ONE)
      const anim = p.animScale / FX16_ONE
      if (h.scaleAnimDir === 0) { sx *= anim; sy *= anim } else if (h.scaleAnimDir === 1) sx *= anim
      else sy *= anim
      const tex = file.textures[child ? res.child!.texture : p.texture]
      if (tex === undefined) return
      const s = sinIdx(p.rotation) / FX32_ONE, c = cosIdx(p.rotation) / FX32_ONE
      const k = PX_PER_UNIT
      out.push({
        tex,
        x: 128 + ((p.position.x + p.emitterPos.x) / FX32_ONE) * k,
        y: 96 - ((p.position.y + p.emitterPos.y) / FX32_ONE) * k,
        // 월드 y가 위라 화면으로 뒤집는다
        ax: c * sx * k, ay: -s * sx * k, bx: -s * sy * k, by: -c * sy * k,
        qx: child ? 0 : h.polygonX / FX16_ONE, qy: child ? 0 : h.polygonY / FX16_ONE,
        us: child ? span(res.child!.textureTileCountS, res.child!.flipTextureS) : span(h.textureTileCountS, h.flipTextureS),
        vs: child ? span(res.child!.textureTileCountT, res.child!.flipTextureT) : span(h.textureTileCountT, h.flipTextureT),
        r: (p.color & 31) / 31, g: ((p.color >>> 5) & 31) / 31, b: ((p.color >>> 10) & 31) / 31,
        a: alpha / 31,
      })
    }
    const kids = (): void => { for (const p of emitter.children) put(p, true) }
    if (h.flags.drawChildrenFirst) kids()
    if (!h.flags.hideParent) for (const p of emitter.particles) put(p, false)
    if (!h.flags.drawChildrenFirst) kids()
  }
  return out
}

