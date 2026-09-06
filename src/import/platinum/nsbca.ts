// NSBCA(BCA0) — 관절 애니 (DATA.md §2.31)
//
// 문·배·자전거 비탈·간판이 움직이는 자료다. NSBMD의 노드 행렬을 프레임마다
// 갈아 끼우는 것이고, 그 노드를 우리는 이미 읽는다 (`nsbmd.parseNodes`).
//
// ⚠️ **공개 문서가 `PivotMatrix`에서 두 자리 틀렸다.** scurest `nsbmd_docs.txt`는
// `c = ±a · d = ±b`라고 적는데 그러면 2×2가 `[[a,±a],[b,±b]]`가 되어 회전이 될
// 수 없다. 정본은 apicula(`src/nitro/rotation.rs`)다:
//
//     sel = bits(0,4) · neg = bits(4,8)
//     o = neg&1 ? -1 : 1   ·   c = neg&2 ? -b : +b   ·   d = neg&4 ? -a : +a
//
// ⚠️ **`nsbmd.ts`의 노드용 피벗을 그대로 쓰면 안 된다** — 그쪽은 노드 머리가 앞
// 네 비트를 쓰는 바람에 자리가 밀려 있고 기본값도 `c = -b`다.
//
// **가르는 자는 직교성이다.** 회전행렬을 잘못 풀면 열끼리 내적이 0이 아니게
// 된다. 롬 자료에 대고 재면 피벗 43,218벌 · 기저 11,234벌이 **하나도 안
// 어긋나고** 최악 오차가 고정소수 한 칸(1/4096) 수준이다.
//
// ⚠️ **백금에는 보간 문제가 없다.** 문서도 apicula도 「표본 사이를 어떻게
// 채우는지 모른다」고 적어 두었는데, 롬의 표본 곡선 1,287개가 **전부 간격 1**
// 이라 프레임마다 표본이 하나씩이다. 그래서 여기서 지어내는 값이 없다.
import { fx32, readDict, type Vec3 } from './nsbmd'

/** 1.3.12 고정소수 */
const fx16 = (v: number): number => v / 4096
const s16 = (v: number): number => (v << 16) >> 16
/** 13비트 부호 있는 값 */
const s13 = (v: number): number => (v << 19) >> 19

/** 노드 하나가 이 프레임에 갖는 변환. `null`인 채널은 모델 값을 그대로 쓴다 */
interface JntFrame {
  /** 이동 (유닛). 쓰는 쪽이 `nsbmd`의 노드와 같은 자로 읽는다 */
  t: Vec3 | null
  /** 3×3 회전, 행 우선 아홉 값 */
  m: readonly number[] | null
  s: Vec3 | null
}

/** 애니 하나가 노드 하나에 거는 것 */
interface JntTrack {
  /** 이 트랙이 움직이는 노드 번호 (`parseNodes`의 차례) */
  node: number
  /** 프레임마다의 변환. 길이가 `JntAnim.frames`다 */
  frames: readonly JntFrame[]
}

export interface JntAnim {
  name: string
  /** 이 애니가 몇 프레임짜리인가 */
  frames: number
  /** 움직이는 노드들. 빈 트랙(`no_channels`)은 안 담는다 */
  tracks: readonly JntTrack[]
}

/**
 * 피벗 회전 — `sel`이 ±1이 앉는 칸을 **열 우선**으로 센다.
 *
 * 돌려주는 것은 `nsbmd.parseNodes`와 같은 **행 우선** 아홉 값이다
 */
function pivotMatrix(head: number, a: number, b: number): number[] {
  const sel = head & 0xf
  const neg = (head >> 4) & 0xf
  const o = (neg & 1) === 0 ? 1 : -1
  const c = (neg & 2) === 0 ? b : -b
  const d = (neg & 4) === 0 ? a : -a
  // 열 셋을 받아 행 우선으로 눕힌다
  const M = (...col: number[]): number[] => [
    col[0]!, col[3]!, col[6]!,
    col[1]!, col[4]!, col[7]!,
    col[2]!, col[5]!, col[8]!,
  ]
  switch (sel) {
    case 0: return M(o, 0, 0, 0, a, b, 0, c, d)
    case 1: return M(0, o, 0, a, 0, b, c, 0, d)
    case 2: return M(0, 0, o, a, b, 0, c, d, 0)
    case 3: return M(0, a, b, o, 0, 0, 0, c, d)
    case 4: return M(a, 0, b, 0, o, 0, c, 0, d)
    case 5: return M(a, b, 0, 0, 0, o, c, d, 0)
    case 6: return M(0, a, b, 0, c, d, o, 0, 0)
    case 7: return M(a, 0, b, c, 0, d, 0, o, 0)
    case 8: return M(a, b, 0, c, d, 0, 0, 0, o)
    // 롬에는 0~8뿐이다. 그래도 나오면 안 돌린다
    default: return [1, 0, 0, 0, 1, 0, 0, 0, 1]
  }
}

/**
 * 기저 회전 — 열 둘을 13비트씩 다섯 u16에 눌러 담고 셋째는 외적으로 낸다.
 *
 * ⚠️ **다섯째 값이 이상하게 들어 있다.** 앞 다섯의 **낮은 세 비트를 차례로
 * 이어 붙여** 여섯째를 만든다. 그래서 `[xs[4], xs[0], xs[1], xs[2], xs[3]]`이라는
 * 뒤섞인 차례가 나온다 (MKDS Course Modifier가 푼 것을 apicula가 옮겼다)
 */
function basisMatrix(xs: readonly number[]): number[] {
  const ys = [xs[4]!, xs[0]!, xs[1]!, xs[2]!, xs[3]!]
  const zs = [0, 0, 0, 0, 0, 0]
  let acc = 0
  for (let i = 0; i < 5; i++) {
    zs[i] = s13(ys[i]! >> 3)
    acc = ((acc << 3) | (ys[i]! & 7)) & 0x1fff
  }
  zs[5] = s13(acc)
  const f = (v: number): number => v / 4096
  const A = [f(zs[1]!), f(zs[2]!), f(zs[3]!)]
  const B = [f(zs[4]!), f(zs[0]!), f(zs[5]!)]
  const C = [
    A[1]! * B[2]! - A[2]! * B[1]!,
    A[2]! * B[0]! - A[0]! * B[2]!,
    A[0]! * B[1]! - A[1]! * B[0]!,
  ]
  // 열 A B C → 행 우선
  return [A[0]!, B[0]!, C[0]!, A[1]!, B[1]!, C[1]!, A[2]!, B[2]!, C[2]!]
}

/** 곡선 하나 — 상수이거나 프레임마다의 표본이다 */
interface Curve {
  /** 상수면 값 하나, 표본이면 프레임 수만큼 */
  at: (frame: number) => number
}

/** 회전 곡선은 값이 행렬이라 따로 든다 */
interface RotCurve {
  at: (frame: number) => readonly number[]
}

const constant = (v: number): Curve => ({ at: () => v })

/**
 * 표본 곡선을 읽는다.
 *
 * ⚠️ **끝 밖은 붙잡는다.** 곡선이 `start`부터 `end` 앞까지만 값을 갖는데 애니는
 * 그보다 길 수 있다 — 원작 하드웨어가 마지막 값을 물고 있으므로 여기서도
 * 그렇게 한다 (apicula도 같은 자리에서 「hold value」다)
 */
function sampled<T>(
  head: number, count: number, read: (i: number) => T, fallback: T,
): (frame: number) => T {
  const start = head & 0xffff
  const end = (head >>> 16) & 0xfff
  const logRate = (head >>> 30) & 3
  const n = Math.max(0, (end - start) >> logRate)
  if (n === 0 || count === 0) return () => fallback
  return (frame) => {
    const at = Math.min(n - 1, Math.max(0, (frame - start) >> logRate))
    return read(at)
  }
}

/** 트랙 머리의 열여섯 비트 — 어느 채널이 있고 어느 것이 상수인가 */
interface Flags {
  none: boolean
  hasT: boolean
  constT: readonly [boolean, boolean, boolean]
  hasR: boolean
  constR: boolean
  hasS: boolean
  constS: readonly [boolean, boolean, boolean]
}

function flagsOf(w: number): Flags {
  return {
    none: (w & 1) !== 0,
    hasT: ((w >> 1) & 3) === 0,
    constT: [((w >> 3) & 1) !== 0, ((w >> 4) & 1) !== 0, ((w >> 5) & 1) !== 0],
    hasR: ((w >> 6) & 3) === 0,
    constR: ((w >> 8) & 1) !== 0,
    hasS: ((w >> 9) & 3) === 0,
    constS: [((w >> 11) & 1) !== 0, ((w >> 12) & 1) !== 0, ((w >> 13) & 1) !== 0],
  }
}

/** `BCA0` 하나를 푼다. 애니가 여럿일 수 있다 */
export function readNsbca(bytes: Uint8Array): JntAnim[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  if (bytes.length < 16 || String.fromCharCode(...bytes.subarray(0, 4)) !== 'BCA0') {
    throw new Error('BCA0가 아니다')
  }
  const out: JntAnim[] = []
  const blocks = view.getUint16(14, true)
  for (let i = 0; i < blocks; i++) {
    const jnt = view.getUint32(16 + i * 4, true)
    if (String.fromCharCode(...bytes.subarray(jnt, jnt + 4)) !== 'JNT0') continue
    for (const e of readDict(bytes, view, jnt + 8)) {
      out.push(readAnim(bytes, view, jnt + view.getUint32(e.at, true), e.name))
    }
  }
  return out
}

function readAnim(bytes: Uint8Array, view: DataView, at: number, name: string): JntAnim {
  const frames = view.getUint16(at + 4, true)
  const count = view.getUint16(at + 6, true)
  const pivotAt = at + view.getUint32(at + 12, true)
  const basisAt = at + view.getUint32(at + 16, true)

  /** `RotMatrixIdx` — 맨 윗비트가 피벗 배열인가를 가른다 */
  const rotAt = (ref: number): readonly number[] => {
    const idx = ref & 0x7fff
    if ((ref >> 15) & 1) {
      const p = pivotAt + idx * 6
      return pivotMatrix(
        view.getUint16(p, true),
        fx16(s16(view.getUint16(p + 2, true))),
        fx16(s16(view.getUint16(p + 4, true))),
      )
    }
    const p = basisAt + idx * 10
    return basisMatrix([0, 1, 2, 3, 4].map((k) => view.getUint16(p + k * 2, true)))
  }

  const tracks: JntTrack[] = []
  for (let t = 0; t < count; t++) {
    const trackAt = at + view.getUint16(at + 20 + t * 2, true)
    let p = trackAt
    const flags = flagsOf(view.getUint16(p, true))
    const node = bytes[p + 3]!
    p += 4
    if (flags.none) continue

    /** 이동·크기 채널 하나 */
    const scalar = (isConst: boolean, wide: boolean): Curve => {
      if (isConst) {
        const v = fx32(view.getInt32(p, true))
        // 크기 채널은 역수가 뒤에 하나 더 붙는다 — 안 쓴다
        p += wide ? 8 : 4
        return constant(v)
      }
      const head = view.getUint32(p, true)
      const base = at + view.getUint32(p + 4, true)
      p += 8
      const width = (head >>> 28) & 3
      // `width`가 0이면 1.19.12, 아니면 1.3.12다
      const step = width === 0 ? (wide ? 8 : 4) : (wide ? 4 : 2)
      const read = width === 0
        ? (i: number): number => fx32(view.getInt32(base + i * step, true))
        : (i: number): number => fx16(s16(view.getUint16(base + i * step, true)))
      return { at: sampled(head, 1, read, 0) }
    }

    let tx: Curve | null = null, ty: Curve | null = null, tz: Curve | null = null
    if (flags.hasT) {
      tx = scalar(flags.constT[0], false)
      ty = scalar(flags.constT[1], false)
      tz = scalar(flags.constT[2], false)
    }
    let rot: RotCurve | null = null
    if (flags.hasR) {
      if (flags.constR) {
        const m = rotAt(view.getUint16(p, true))
        // 뒤 두 바이트는 자리 맞춤이다
        p += 4
        rot = { at: () => m }
      } else {
        const head = view.getUint32(p, true)
        const base = at + view.getUint32(p + 4, true)
        p += 8
        const pick = sampled(head, 1, (i: number) => view.getUint16(base + i * 2, true), 0)
        rot = { at: (frame) => rotAt(pick(frame)) }
      }
    }
    let sx: Curve | null = null, sy: Curve | null = null, sz: Curve | null = null
    if (flags.hasS) {
      sx = scalar(flags.constS[0], true)
      sy = scalar(flags.constS[1], true)
      sz = scalar(flags.constS[2], true)
    }

    const list: JntFrame[] = []
    for (let f = 0; f < frames; f++) {
      list.push({
        t: tx && ty && tz ? [tx.at(f), ty.at(f), tz.at(f)] : null,
        m: rot ? rot.at(f) : null,
        s: sx && sy && sz ? [sx.at(f), sy.at(f), sz.at(f)] : null,
      })
    }
    tracks.push({ node, frames: list })
  }
  return { name, frames, tracks }
}
