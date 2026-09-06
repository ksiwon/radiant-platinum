// NSBTA(SRT0) — **재질의 UV를 시간에 따라 민다** (DATA.md §2.32)
//
// 폭포·용암·물결·자전거 진흙 비탈·승강기 표시등이 다 이것이다. 소품 112개 중
// **53벌**이 이 갈래고, 전부 노드가 하나뿐이라 관절 애니와는 아예 다른 자리다.
//
// ⚠️ **공개 문서가 이 절을 「매우 불완전하다」고 적어 두었다** — 트랙의 채널
// 다섯 중 셋이 「모른다」고 되어 있다. 그래서 롬 값으로 갈랐다
// (`.audit/matAnim.mjs`, 곡선 78개):
//
//     ch0  깃발 48  fx32 1.0 — **U 배율**  (62/62이 상수 1.0)
//     ch1  깃발 48  fx32 1.0 — **V 배율**  (62/62이 상수 1.0)
//     ch2  깃발 32  u16 둘 [0, 0x1000] — **회전 (sin, cos)**, 62/62이 단위
//     ch3  깃발 16 또는 48 — **U 이동**
//     ch4  깃발 16 또는 48 — **V 이동**
//
// ⚠️ **이동값의 자는 「텍셀 × 32」다.** 정규화 UV(fx32)로 읽을 수도 있어서
// 갈림길이었는데, 두 읽기가 그림 크기가 2의 거듭제곱일 때 서로를 함의해서
// 「한 바퀴로 딱 떨어지나」로는 안 갈렸다. 가른 것은 **같은 재질의 두 축**이다 —
// 애니 45 `lambert4`는 U축(그림 16텍셀)에 2,052를, V축(32텍셀)에 3,080을 쓴다.
// 텍셀 자로 읽으면 각각 **4바퀴**(4×16×32=2048)와 **3바퀴**(3×32×32=3072)로
// 맞고, 정규화로 읽으면 0.501·0.752바퀴라 둘 다 이가 안 맞는다. 480프레임짜리가
// 반 바퀴에서 끊길 리가 없다
import { readDict } from './nsbmd'

/** 상수 채널은 fx32(1.19.12)다 — 배율 상수가 정확히 0x1000 = 1.0이다 */
const fx32 = (v: number): number => v / 4096
/** 표본 채널은 1.10.5다 — 32면 한 텍셀 */
const TEXEL = 32

/** 채널 하나 — 상수든 표본이든 프레임을 주면 값이 나온다 */
type Channel = (frame: number) => number

/** 재질 하나에 거는 것. 값은 **텍셀**이다 */
interface SrtTrack {
  /** 이 트랙이 거는 재질 이름 (`Material.name`과 같다) */
  readonly material: string
  /** U 이동 (텍셀) */
  readonly u: Channel
  /** V 이동 (텍셀) */
  readonly v: Channel
}

export interface SrtAnim {
  readonly name: string
  readonly frames: number
  readonly tracks: readonly SrtTrack[]
}

/** 표본 채널의 깃발. 이 값**만** 배열이다 */
const SAMPLED = 0x10

/** 채널 여덟 바이트를 읽는다 */
function channel(view: DataView, animAt: number, at: number): Channel {
  const count = view.getUint16(at, true)
  const flags = view.getUint8(at + 3)
  // ⚠️ **비트로 가르면 안 된다.** 상수 깃발이 48(0x30)이라 0x10이 **서 있다** —
  // 마스크로 보면 상수를 배열로 읽어서 자전거 비탈의 U가 674까지 튀었다.
  // 문서대로 **16과 정확히 같을 때만** 배열이다 (롬 전체에서 16·32·48뿐이다)
  if (flags !== SAMPLED || count === 0) {
    const v = fx32(view.getInt32(at + 4, true))
    return () => v
  }
  const base = animAt + view.getUint32(at + 4, true)
  return (frame) => {
    // ⚠️ **끝 밖은 붙잡는다** — `nsbca`의 표본 곡선과 같은 규칙이다
    const i = Math.min(count - 1, Math.max(0, Math.floor(frame)))
    return view.getInt16(base + i * 2, true) / TEXEL
  }
}

/** `BTA0` 하나를 푼다 */
export function readNsbta(bytes: Uint8Array): SrtAnim[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 16 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'BTA0') {
    throw new Error('BTA0가 아니다')
  }
  const out: SrtAnim[] = []
  const count = view.getUint16(14, true)
  for (let i = 0; i < count; i++) {
    const srt = view.getUint32(16 + i * 4, true)
    if (String.fromCharCode(...bytes.subarray(srt, srt + 4)) !== 'SRT0') continue
    for (const e of readDict(bytes, view, srt + 8)) {
      const at = srt + view.getUint32(e.at, true)
      const tracks: SrtTrack[] = []
      for (const t of readDict(bytes, view, at + 8)) {
        tracks.push({
          material: t.name,
          u: channel(view, at, t.at + 3 * 8),
          v: channel(view, at, t.at + 4 * 8),
        })
      }
      out.push({ name: e.name, frames: view.getUint16(at + 4, true), tracks })
    }
  }
  return out
}
