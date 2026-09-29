// 화면 잔상 — DS의 화면 붙잡기 섞기 (`GX_SetCapture(…, GX_CAPTURE_MODE_AB, …, eva 4, evb 12)` · `ov100_021D4EBC`)
//
// 창기둥 영상의 부르기 장면은 검은 구슬이 터지는 동안부터 끝까지 **화면을 붙잡아 앞 화면에 섞은 것을 띄운다** — 원작은 VRAM C를
// 보여 주면서 그 VRAM C에 (새 화면 × 4 + 앞 화면 × 12) ÷ 16을 다시 적는다. 흔들리는 카메라와 번쩍임이 길게 번진다.
//
// 여기는 같은 셈을 후처리로 한다 — 합친 그림을 제 타깃 둘에 번갈아 적는다. 꺼져 있으면 **그리지 않고** 새 화면을 그대로 낸다
// (섞는 몫 0 · 타깃은 안 건드린다). 켜는 첫 틱은 앞 화면이 없으니 새 화면으로 채운다(원작도 붙잡기 전에 VRAM을 비우고
// 첫 붙잡기는 섞지 않는다 — `ov100_021D503C`의 `16, 0`).
//
// ⚠️ **3D 무대만이 아니라 화면 전체다.** 원작 원천 A가 `GX_CAPTURE_SRCA_2D3D`라 글창까지 붙잡힌다 — 우리 글창은 DOM이라
// 안 섞이지만, 멈춰 있는 글창은 섞여도 그대로라 보이는 차이가 없다
import { RenderTarget, Vector2, QuadMesh, NodeMaterial, RendererUtils, TempNode, NodeUpdateType } from 'three/webgpu'
import { mix, texture, uniform, uv } from 'three/tsl'
import { cutInFrame } from '../../engine/battle/encounterCutIn'
import type { Node, NodeFrame, TextureNode } from 'three/webgpu'

type Mixed = ReturnType<typeof mix>

/** 켜는 쪽 (`scene/SpearPillarMovieStage`) — 창기둥 영상은 새 화면 4 · 앞 화면 12다 */
export const afterimageState = { on: false }
const MOVIE = { eva: 4, evb: 12 }

/**
 * 지금 섞는 몫. 조우 컷인이 제 것을 들면 그것이 먼저다 — 환상 3 · 15, 전설 5 · 13 (`FieldMotionBlur_Start`).
 *
 * ⚠️ **합이 16을 넘으면 밝아진다.** 원작 붙잡기가 (A × eva + B × evb) ÷ 16을 31에서 자른다 — 환상 컷인은 멈춘 그림이 세 배까지
 * 밝아져 희게 바랜다. 그래서 여기서도 1에서 자른다
 */
function blend(): { eva: number, evb: number } | null {
  return cutInFrame.now?.blur ?? (afterimageState.on ? MOVIE : null)
}

const size = new Vector2()
const quad = new QuadMesh()
let saved: ReturnType<typeof RendererUtils.resetRendererState> | undefined

class TrailNode extends TempNode {
  private readonly source: TextureNode
  private readonly at: Node
  private comp = new RenderTarget(1, 1, { depthBuffer: false })
  private old = new RenderTarget(1, 1, { depthBuffer: false })
  private readonly compTex: TextureNode
  private readonly oldTex: TextureNode
  private readonly keep = uniform(0)
  private readonly gain = uniform(1)
  private readonly on = uniform(0)
  private material: NodeMaterial | null = null
  private fresh = true

  constructor(source: TextureNode, at: Node) {
    super('vec4')
    this.source = source
    this.at = at
    this.compTex = texture(this.comp.texture)
    this.oldTex = texture(this.old.texture)
    this.updateBeforeType = NodeUpdateType.FRAME
  }

  override updateBefore(frame: NodeFrame): boolean | undefined {
    const renderer = frame.renderer
    const mixing = blend()
    if (mixing === null || renderer === null || this.material === null) {
      this.fresh = true
      this.on.value = 0
      return undefined
    }
    // `AfterImageNode`와 같다 — 처음에는 비어 있고 한 번 받은 것을 다시 쓴다
    saved = RendererUtils.resetRendererState(renderer, saved as never)
    renderer.getDrawingBufferSize(size)
    const type = (this.source.value as { type: number }).type
    this.comp.texture.type = type as never
    this.old.texture.type = type as never
    this.comp.setSize(size.x, size.y)
    this.old.setSize(size.x, size.y)
    this.keep.value = this.fresh ? 0 : mixing.evb / 16
    this.gain.value = this.fresh ? 1 : mixing.eva / 16
    this.fresh = false
    this.oldTex.value = this.old.texture
    quad.material = this.material
    quad.name = '잔상'
    renderer.setRenderTarget(this.comp)
    quad.render(renderer)
    // 방금 쓴 것이 다음 틱의 앞 화면이다. 이번 틱에 보여 줄 것도 그것이다
    const t = this.old
    this.old = this.comp
    this.comp = t
    this.compTex.value = this.old.texture
    this.on.value = 1
    RendererUtils.restoreRendererState(renderer, saved)
    return undefined
  }

  override setup(): Node {
    const fresh = this.source.sample(uv())
    const composite = fresh.mul(this.gain).add(this.oldTex.sample(uv()).mul(this.keep)).min(1)
    this.material ??= new NodeMaterial()
    this.material.name = '잔상'
    this.material.fragmentNode = composite
    // 꺼져 있으면 섞는 몫이 0이다 — 타깃은 읽어도 안 보인다
    return mix(this.source.sample(this.at), this.compTex.sample(this.at), this.on) as unknown as Node
  }

  override dispose(): void {
    this.comp.dispose()
    this.old.dispose()
    this.material?.dispose()
    super.dispose()
  }
}

/** 그 그림을 `at`에서 읽되, 잔상이 켜져 있으면 섞은 화면을 읽는다 */
export function trail(source: TextureNode, at: Node): Mixed {
  return new TrailNode(source, at) as unknown as Mixed
}
