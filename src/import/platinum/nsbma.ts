// NSBMA(MAT0) — **재질 색을 시간에 따라 바꾼다** (DATA.md §2.21f)
//
// 재질 하나에 트랙 다섯 — 확산 · 주변 · 반사 · 방사 · 폴리곤 알파 — 이 붙는다. 한 트랙은 u32 하나다:
//
//     비트 29      상수 — 아래 16비트가 곧 값이다(색이면 RGB555, 알파면 0~31)
//     비트 30 · 31  표본 간격 2 · 4 (둘 다 없으면 한 프레임에 하나)
//     아래 16비트   상수가 아니면 표본 배열 자리 — 애니 머리부터 센다. 색은 u16, 알파는 u8
//
// 실측(창기둥 영상의 `kurotama`, 601프레임) — 재질 셋(`line` · `point` · `thunder`)이 확산 0x7fff 상수 · 알파 표본(16 ↔ 31을
// 번갈아 깜빡인다)이다. 배열 길이가 601이라 간격 1이 맞다
import { readDict } from './nsbmd'

type Channel = (frame: number) => number

interface MatTrack {
  readonly material: string
  readonly diffuse: Channel
  readonly ambient: Channel
  readonly specular: Channel
  readonly emission: Channel
  /** 0~31 */
  readonly alpha: Channel
}

export interface MatAnim {
  readonly name: string
  readonly frames: number
  readonly tracks: readonly MatTrack[]
}

const CONST = 1 << 29

function channel(view: DataView, animAt: number, info: number, frames: number, bytes: 1 | 2): Channel {
  if ((info & CONST) !== 0) {
    const v = info & 0xffff
    return () => v
  }
  const step = (info & 0x80000000) !== 0 ? 4 : (info & 0x40000000) !== 0 ? 2 : 1
  const at = animAt + (info & 0xffff)
  const count = Math.max(1, Math.ceil(frames / step))
  return (frame) => {
    const i = Math.min(count - 1, Math.max(0, Math.floor(frame / step)))
    return bytes === 1 ? view.getUint8(at + i) : view.getUint16(at + i * 2, true)
  }
}

/** `BMA0` 하나를 푼다 */
export function readNsbma(bytes: Uint8Array): MatAnim[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 16 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'BMA0') throw new Error('BMA0가 아니다')
  const out: MatAnim[] = []
  const count = view.getUint16(14, true)
  for (let i = 0; i < count; i++) {
    const blk = view.getUint32(16 + i * 4, true)
    if (String.fromCharCode(...bytes.subarray(blk, blk + 4)) !== 'MAT0') continue
    for (const e of readDict(bytes, view, blk + 8)) {
      const at = blk + view.getUint32(e.at, true)
      const frames = view.getUint16(at + 4, true)
      const tracks: MatTrack[] = []
      for (const t of readDict(bytes, view, at + 8)) {
        const word = (k: number): number => view.getUint32(t.at + k * 4, true)
        tracks.push({
          material: t.name,
          diffuse: channel(view, at, word(0), frames, 2),
          ambient: channel(view, at, word(1), frames, 2),
          specular: channel(view, at, word(2), frames, 2),
          emission: channel(view, at, word(3), frames, 2),
          alpha: channel(view, at, word(4), frames, 1),
        })
      }
      out.push({ name: e.name, frames, tracks })
    }
  }
  return out
}
