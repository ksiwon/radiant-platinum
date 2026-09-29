// NSBVA(VIS0) — **노드를 프레임마다 켜고 끈다** (DATA.md §2.21f)
//
// 머리 `V\0AV` · u16 프레임 수 · u16 노드 수 · u16 크기 뒤로 비트가 **프레임 먼저** 이어진다 — (프레임 f, 노드 k)가 비트
// `f × 노드 수 + k`다(u32 낱말 안에서 아래 비트부터). 실측(창기둥 영상의 `kurotama` · 601프레임 · 노드 42) — 0프레임에는
// 첫 노드와 마지막 노드만 켜져 있다가 300프레임께 거의 다 켜진다(검은 구슬이 퍼진다)
import { readDict } from './nsbmd'

export interface VisAnim {
  readonly name: string
  readonly frames: number
  readonly nodes: number
  visible(frame: number, node: number): boolean
}

/** `BVA0` 하나를 푼다 */
export function readNsbva(bytes: Uint8Array): VisAnim[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 16 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'BVA0') throw new Error('BVA0가 아니다')
  const out: VisAnim[] = []
  const count = view.getUint16(14, true)
  for (let i = 0; i < count; i++) {
    const blk = view.getUint32(16 + i * 4, true)
    if (String.fromCharCode(...bytes.subarray(blk, blk + 4)) !== 'VIS0') continue
    for (const e of readDict(bytes, view, blk + 8)) {
      const at = blk + view.getUint32(e.at, true)
      const frames = view.getUint16(at + 4, true)
      const nodes = view.getUint16(at + 6, true)
      const data = at + 12
      out.push({
        name: e.name, frames, nodes,
        visible: (frame, node) => {
          if (node < 0 || node >= nodes) return true
          const f = Math.min(frames - 1, Math.max(0, Math.floor(frame)))
          const bit = f * nodes + node
          return ((view.getUint32(data + (bit >> 5) * 4, true) >>> (bit & 31)) & 1) === 1
        },
      })
    }
  }
  return out
}
