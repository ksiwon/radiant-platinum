// 청크 지오메트리 — 브라우저에서 (DATA.md §2.2)
//
// 두 가지를 풀어야 한다:
//   ① 디스플레이 리스트 — NDS GPU 명령 흐름이라 해석해야 삼각형이 나온다 (`nsbmd.ts`)
//   ② SBC — 어느 재질로 어느 폴리곤을 그리는지 짝지어 주는 짧은 명령 목록
//
// 검증은 헤더가 해 준다. MDL0가 정점·삼각형·사각형 수를 적어 두므로 우리가 센
// 것과 한 개도 안 틀려야 한다 (666/666).
import { narcEntry } from './nds'
import { buildPropAnims } from './propAnims'
import {
  fx32, readDict, runDisplayList, vertexFrom, parseModel, parsePolygons, parseNodes, openModel,
  type NodeXform,
  type ModelHeader, type Vec3,
} from './nsbmd'
import { parseTex0, type Tex0 } from './nitrotex'
import { bakeSheet, SHEET_WIDTH, type Sheet, type SheetItem } from './sheets'
import { encodePng } from './png'
import { breathe, check, json, type ConvertContext, type Produced } from './convertTypes'

/**
 * 좌표 양자화 — 1/256 타일.
 *
 * 모델 좌표의 단위는 **타일이 아니라 유닛**이고 16유닛이 한 타일이다(청크 하나가
 * −256~+256 유닛 = 32타일로 딱 떨어진다)
 */
const POS_SCALE = 256
/** 한 타일이 몇 유닛인가 */
const UNITS_PER_TILE = 16
/** 원본 UV는 1/16 텍셀 고정소수점이다. 재질의 크기로 나눠 0~1로 옮긴다 */
const UV_SCALE = 16
/**
 * 정점 24바이트: pos i16×3 · pad · uv f32×2 · normal i8×3 · pad · color u8×3 · pad.
 *
 * UV를 int16으로 못 담는다 — 반복 텍스처가 65536텍셀을 넘어간다(실측).
 * 정규화한 뒤 float32로 담으면 반복 횟수가 커도 정확도가 안 무너진다
 */
const VERTEX_BYTES = 24

/** SBC 명령별 피연산자 수. `flags`는 상위 3비트다 */
function sbcOperands(op: number, flags: number): number {
  switch (op) {
    case 0x00: return 0 // NOP
    case 0x01: return 0 // RET
    case 0x02: return 2 // NODE
    case 0x03: return 1 // MTX
    case 0x04: return 1 // MAT
    case 0x05: return 1 // SHP
    case 0x06: return flags === 0 ? 2 : 4 // NODEDESC — 깃발이 서면 행렬 자리 둘이 더 붙는다
    case 0x07: return 3 // BB
    case 0x08: return 3 // BBY
    case 0x09: return 3 // NODEMIX (맵에는 안 나온다)
    case 0x0a: return 5 // CALLDL
    case 0x0b: return 0 // POSSCALE
    case 0x0c: return 2 // ENVMAP
    case 0x0d: return 2 // PRJMAP
    default: throw new Error(`모르는 SBC 명령 0x${op.toString(16)}`)
  }
}

interface Pair {
  material: number
  polygon: number
  /** 이 조각이 매달린 노드. `NODE(id, 보임)`이 정한다 (`nsbmd.parseNodes`) */
  node: number
}

/**
 * SBC에서 (재질, 폴리곤) 짝을 뽑는다.
 *
 * ⚠️ **순서대로 1:1이 아니다.** 청크 0을 보면 재질 4가 폴리곤 13을, 재질 0이
 * 폴리곤 9를 그린다. 번호 순서로 짝지으면 땅에 아스팔트가, 길에 잔디가 깔린다
 */
export function readSbc(buf: Uint8Array, at: number, end: number): Pair[] {
  const pairs: Pair[] = []
  let material = 0
  // ⚠️ **어느 노드에 매달렸는지도 같이 적는다.** `NODE(id, 보임)`이 그 뒤 조각의
  // 행렬을 갈아 끼운다 — 백화점 바닥이 노드 하나에 매달려 z로 12칸 옮겨져 있다
  let node = 0
  let p = at
  while (p < end) {
    const raw = buf[p++]!
    const op = raw & 0x1f
    const flags = raw >> 5
    const n = sbcOperands(op, flags)
    const args: number[] = []
    for (let i = 0; i < n; i++) args.push(buf[p++]!)
    if (op === 0x04) material = args[0]!
    else if (op === 0x02) node = args[0]!
    else if (op === 0x05) pairs.push({ material, polygon: args[0]!, node })
    else if (op === 0x01) break
  }
  return pairs
}

export interface Material {
  name: string
  origWidth: number
  origHeight: number
  magW: number
  magH: number
  repeatS: boolean
  repeatT: boolean
  flipS: boolean
  flipT: boolean
  /** 0 투명 · 31 불투명. 반투명 판(물·그림자)이 여기서 갈린다 */
  alpha: number
  /** 6~7비트가 어느 면을 그리는가다: 1 뒷면 · 2 앞면 · 3 양면 */
  faces: number
  /**
   * 확산색 (`diffAmb`의 아래 15비트, RGB5 → 8비트).
   *
   * 텍스처가 있으면 텍스처가 색을 주므로 굽는 쪽이 안 쓴다. **텍스처가 없으면
   * 이것이 유일한 색이다** — `packChunk`가 그때만 `d`로 싣는다
   */
  diffuse: [number, number, number]
  texture: string | null
  palette: string | null
}

/**
 * 재질 목록. 텍스처·팔레트 이름은 **역방향 사전**에 있다.
 *
 * 재질이 자기 텍스처 이름을 들고 있는 게 아니라, 텍스처마다 "나를 쓰는 재질들"
 * 목록이 붙어 있다. 그래서 뒤집어서 읽어야 한다
 */
export function parseMaterials(
  buf: Uint8Array, view: DataView, modelAt: number, header: ModelHeader,
): Material[] {
  const setAt = modelAt + header.materialsOffset
  const texDictOff = view.getUint16(setAt, true)
  const palDictOff = view.getUint16(setAt + 2, true)
  const entries = readDict(buf, view, setAt + 4)

  // 재질 44바이트: u16 태그·크기, u32 diffAmb·specEmi·polyAttr(+마스크)·
  // texImageParam(+마스크), u16 pltBase·flag·origW·origH, fx32 magW·magH.
  // ⚠️ 머리 둘이 **u16**이다. u32로 읽으면 크기가 21억이 나오고 그 뒤가 다 밀린다
  const materials: Material[] = entries.map((e) => {
    const at = setAt + view.getUint32(e.at, true)
    const texImageParam = view.getUint32(at + 20, true)
    const polyAttr = view.getUint32(at + 12, true)
    const diffAmb = view.getUint32(at + 4, true)
    return {
      name: e.name,
      // 형식·크기는 TEX0 쪽이 정본이고, 재질은 UV를 나눌 원본 크기를 갖는다
      origWidth: view.getUint16(at + 32, true),
      origHeight: view.getUint16(at + 34, true),
      magW: fx32(view.getInt32(at + 36, true)),
      magH: fx32(view.getInt32(at + 40, true)),
      repeatS: (texImageParam & 0x10000) !== 0,
      repeatT: (texImageParam & 0x20000) !== 0,
      flipS: (texImageParam & 0x40000) !== 0,
      flipT: (texImageParam & 0x80000) !== 0,
      alpha: (polyAttr >> 16) & 0x1f,
      faces: (polyAttr >> 6) & 3,
      diffuse: rgb5(diffAmb & 0x7fff),
      texture: null,
      palette: null,
    }
  })

  // 텍스처 → 나를 쓰는 재질들
  const bind = (dictOff: number, key: 'texture' | 'palette'): void => {
    for (const e of readDict(buf, view, setAt + dictOff)) {
      const listAt = setAt + view.getUint16(e.at, true)
      const count = buf[e.at + 2]!
      for (let i = 0; i < count; i++) {
        const mat = materials[buf[listAt + i]!]
        if (mat) mat[key] = e.name
      }
    }
  }
  bind(texDictOff, 'texture')
  bind(palDictOff, 'palette')
  return materials
}

export interface Vertex { pos: Vec3, uv: [number, number], normal: Vec3, color: Vec3 }

/** 디스플레이 리스트 → 정점 배열 + 삼각형 색인 */
export function buildMesh(
  dl: Uint8Array, scale: number, material: Material,
): { verts: Vertex[], indices: number[] } {
  // UV를 재질의 원본 크기로 나눠 둔다. 크기가 0이면 텍스처가 없는 재질이다
  const uScale = material.origWidth > 0 ? material.magW / (UV_SCALE * material.origWidth) : 0
  const vScale = material.origHeight > 0 ? material.magH / (UV_SCALE * material.origHeight) : 0
  const verts: Vertex[] = []
  const indices: number[] = []
  let prim: number | null = null
  let strip: number[] = []
  let pos: Vec3 = [0, 0, 0]
  let uv: [number, number] = [0, 0]
  let normal: Vec3 = [0, 0, 127]
  let color: Vec3 = [255, 255, 255]

  const tri = (a: number, b: number, c: number): void => { indices.push(a, b, c) }

  runDisplayList(dl, (op, params) => {
    switch (op) {
      case 0x40: prim = params[0]! & 3; strip = []; return
      case 0x41: prim = null; return
      case 0x20: {
        const v = params[0]!
        // 정점 색은 5비트씩이다. 8비트로 늘릴 때 위 3비트를 되붙인다
        const c = (x: number): number => (x << 3) | (x >> 2)
        color = [c(v & 0x1f), c((v >> 5) & 0x1f), c((v >> 10) & 0x1f)]
        return
      }
      case 0x21: {
        const v = params[0]!
        const s = (x: number): number => { const n = x & 0x3ff; return n & 0x200 ? n - 0x400 : n }
        // 1.0이 512다. int8로 담으므로 127로 맞춘다
        normal = [s(v), s(v >> 10), s(v >> 20)]
          .map((n) => Math.max(-127, Math.min(127, Math.round(n / 512 * 127)))) as Vec3
        return
      }
      case 0x22: {
        const v = params[0]!
        const s = (x: number): number => (x & 0x8000 ? x - 0x10000 : x)
        uv = [s(v & 0xffff), s((v >>> 16) & 0xffff)]
        return
      }
      default: break
    }
    if (op < 0x23 || op > 0x28) return
    // ⚠️ `pos`는 **원시 좌표**로 들고 간다. VTX_DIFF가 직전 정점에서의 차이를
    // 주므로 여기서 단위를 바꾸면 그 뒤 정점이 전부 어긋난다 — 화면에서는
    // 삼각형이 길게 찢어진 가시로 보인다
    pos = vertexFrom(op, params, pos)
    verts.push({
      pos: pos.map((v) => v * scale / UNITS_PER_TILE) as Vec3,
      uv: [uv[0] * uScale, uv[1] * vScale],
      normal,
      color,
    })
    const i = verts.length - 1
    strip.push(i)
    if (prim === 0 && strip.length === 3) { tri(strip[0]!, strip[1]!, strip[2]!); strip = [] }
    else if (prim === 1 && strip.length === 4) {
      tri(strip[0]!, strip[1]!, strip[2]!); tri(strip[0]!, strip[2]!, strip[3]!); strip = []
    } else if (prim === 2 && strip.length >= 3) {
      const n = strip.length
      // 삼각형 띠는 한 칸 걸러 감는 방향이 뒤집힌다
      if (n % 2 === 1) tri(strip[n - 3]!, strip[n - 2]!, strip[n - 1]!)
      else tri(strip[n - 2]!, strip[n - 3]!, strip[n - 1]!)
    } else if (prim === 3 && strip.length >= 4 && strip.length % 2 === 0) {
      const n = strip.length
      tri(strip[n - 4]!, strip[n - 3]!, strip[n - 1]!)
      tri(strip[n - 4]!, strip[n - 1]!, strip[n - 2]!)
    }
  })
  // ⚠️ **원작이 안 보이는 면에 칠해 둔 검정을 그대로 쓰면 안 된다.**
  //
  // 그림 없는 재질은 확산색이 그 면의 유일한 색인데, 원작은 **고정 카메라가
  // 못 보는 면**의 정점색을 (0,0,0)으로 눕혀 둔다 — 그러면 확산색을 곱해도
  // 검정이다. 우리 실내 카메라는 벽 꼭대기보다 위에서 내려다보므로(50.09도)
  // 그 면이 화면에 든다: 연고 콘테스트회장(청크 241 재질 15)은 y 2.875에
  // x −15~−4로 뻗은 **벽 꼭대기 띠**고, 화면 왼쪽 29%를 검은 쐐기로 덮었다.
  // 구저택(510 재질 23)도 같다.
  //
  // 실측으로 청크 전체에 **그림 없고 정점색이 검은 서브메시 128개**가 있는데,
  // 그중 확산색까지 검은 것(59개·1,231삼각형)은 진짜 그림자라 그대로 두고,
  // **확산색이 있는 것(61개·714삼각형)만** 흰 정점색으로 되돌린다
  // (`node .audit/blackWhat.mjs contest`)
  const lit = material.diffuse[0]! + material.diffuse[1]! + material.diffuse[2]! > 0
  if (!material.texture && lit) {
    for (const v of verts) {
      if (v.color[0] === 0 && v.color[1] === 0 && v.color[2] === 0) v.color = [255, 255, 255]
    }
  }
  return { verts, indices }
}

const encoder = new TextEncoder()

/** 청크 하나를 `PT3C` 덩어리로. 파일 하나에 자기 설명까지 담는다 */
/** RGB5 → 8비트. 위 3비트를 되붙인다 (정점색을 늘릴 때와 같은 식이다) */
const rgb5 = (v: number): [number, number, number] => [
  ((v & 31) << 3) | ((v & 31) >> 2),
  (((v >> 5) & 31) << 3) | (((v >> 5) & 31) >> 2),
  (((v >> 10) & 31) << 3) | (((v >> 10) & 31) >> 2),
]

export function packChunk(
  verts: Vertex[], indices: number[], materials: Material[], submeshes: [number, number, number][],
): Uint8Array {
  const meta = {
    verts: verts.length,
    indices: indices.length,
    materials: materials.map((m) => ({
      tex: m.texture, pal: m.palette,
      // 반복·뒤집기는 텍스처를 만들 때 필요하고, 알파·면은 재질을 만들 때 쓴다
      rep: (m.repeatS ? 1 : 0) | (m.repeatT ? 2 : 0) | (m.flipS ? 4 : 0) | (m.flipT ? 8 : 0),
      a: m.alpha, f: m.faces,
      // ⚠️ **텍스처가 없으면 확산색이 유일한 색이다.** 안 실으면 정점색
      // 흰색만 남아 화면에 하얗게 뜬다 — 그림자 재질(`kage`·`shade`·`lm*`)이
      // 흰 안개로 깔렸던 자리다. 텍스처가 있는 재질에는 안 붙인다.
      // 확산색이 텍스처를 한 번 더 곱해 온 신오가 어두워진다
      ...(m.texture === null ? { d: m.diffuse } : {}),
    })),
    submeshes,
  }
  const body = encoder.encode(JSON.stringify(meta))
  const pad = (4 - (body.byteLength % 4)) % 4
  const head = 8 + body.byteLength + pad
  const out = new Uint8Array(head + verts.length * VERTEX_BYTES + indices.length * 2)
  const view = new DataView(out.buffer)
  out.set([0x50, 0x54, 0x33, 0x43], 0) // "PT3C"
  view.setUint32(4, body.byteLength, true)
  out.set(body, 8)
  verts.forEach((v, k) => {
    const o = head + k * VERTEX_BYTES
    for (let a = 0; a < 3; a++) view.setInt16(o + a * 2, Math.round(v.pos[a]! * POS_SCALE), true)
    for (let a = 0; a < 2; a++) view.setFloat32(o + 8 + a * 4, v.uv[a]!, true)
    for (let a = 0; a < 3; a++) view.setInt8(o + 16 + a, v.normal[a]!)
    for (let a = 0; a < 3; a++) view.setUint8(o + 20 + a, v.color[a]!)
  })
  // 색인은 u16이다. 청크 하나가 65536정점을 넘는 일은 없다
  const idxAt = head + verts.length * VERTEX_BYTES
  indices.forEach((v, k) => { view.setUint16(idxAt + k * 2, v, true) })
  return out
}

interface BuiltChunk {
  bytes: Uint8Array
  verts: number
  headerVerts: number
  materials: Material[]
  /** 32×32 비트 — 그 칸 밑에 그려진 삼각형이 있는가 (`coverBits`) */
  cover: Uint8Array
}

/** 칸 하나를 4×4로 찍어 본다. 반 칸짜리 바닥도 바닥이다 */
const COVER_SUB = 4
/** 그중 몇 개가 걸려야 바닥인가 — 반 칸 */
const COVER_MIN = 8

/**
 * **발밑에 그려진 것이 있는가** — 청크 32×32 칸마다 한 비트.
 *
 * 통행표(perm)는 방 밖 빈 자리를 0x0000(걸을 수 있음)으로 두고, 원작은 거기
 * 갈 일이 없어서 그냥 둔다. 우리는 3인칭이라 그 자리에 들어서면 **그린 것이
 * 없는 허공을 걷는다** — 사천왕 방 넷에서 803칸씩, 연고 체육관에서 788칸이
 * 그렇다 (`.audit/reachAudit.mjs`). 그걸 막으려면 「여기 바닥이 그려져
 * 있는가」를 알아야 하고, 그 답이 이 비트다. 막는 것은 `engine/map/floorSeal`.
 *
 * ⚠️ **정수로만 잰다.** 굽는 쪽이 둘이라(`tools/extract/chunks.js`) 부동소수점
 * 끝자리가 갈리면 바이트가 달라진다. 그래서 파일에 실제로 들어가는 값
 * (`Math.round(pos × POS_SCALE)`)을 그대로 쓰고, 안팎 판정도 정수 외적으로 한다 —
 * 좌표가 2^24 안이라 곱이 2^48이고 double이 정확히 담는다.
 *
 * ⚠️ **세로로 선 면은 뺀다.** XZ로 누르면 넓이가 0이라 바닥이 아니다.
 *
 * ⚠️ **한 표본만 걸려도 바닥으로 치면 안 된다.** 사천왕 방(land 260)에서 방
 * 동쪽 벽의 **꼭대기**(y=3, 방 바닥은 y=-0.13)가 x=17에 0.18칸만 걸치는데,
 * 그것 하나로 한 칸이 통째로 「바닥」이 되고 이어 붙이는 규칙이 거기까지 열 칸을
 * 뚫었다. 그래서 **열여섯 표본 중 여덟(반 칸)** 이상일 때만 바닥으로 친다 —
 * 배틀팩토리 아래 줄처럼 판이 반 칸인 자리는 딱 여덟이라 그대로 남는다.
 *
 * ⚠️ **벽을 바닥으로 세지 않는다.** XZ로 눌러 넓이가 0인 면(정확히 수직인 벽)은
 * 빠지지만, 조금이라도 기운 벽은 얇은 띠로 남아 4×4 표본에 걸린다. 실제로
 * 사천왕 방(land 260)에서 방 동쪽 벽의 바깥 면이 x=17에 **한 칸짜리 바닥**으로
 * 찍혔고, 이어 붙이는 규칙이 거기까지 열 칸을 뚫었다. 그래서 면의 법선이
 * **수평에서 60° 안**일 때만 바닥으로 친다 (`3·ny² ≥ nx² + nz²`).
 */
export function coverBits(verts: Vertex[], indices: readonly number[]): Uint8Array {
  const bits = new Uint8Array(32 * 32 / 8)
  const n = verts.length
  const px = new Int32Array(n)
  const py = new Int32Array(n)
  const pz = new Int32Array(n)
  // 정점은 청크 **중심** 기준이다. 16칸을 더하면 청크 안 칸 좌표가 된다
  const mid = 16 * POS_SCALE
  for (let i = 0; i < n; i++) {
    px[i] = Math.round(verts[i]!.pos[0] * POS_SCALE) + mid
    py[i] = Math.round(verts[i]!.pos[1] * POS_SCALE)
    pz[i] = Math.round(verts[i]!.pos[2] * POS_SCALE) + mid
  }
  const step = POS_SCALE / (COVER_SUB * 2)
  // 칸마다 표본을 **몇 개** 덮었는지 센다. 삼각형이 여럿이면 합쳐서 센다
  const hits = new Uint8Array(32 * 32 * COVER_SUB * COVER_SUB / 8)
  const mark = (tile: number, s: number): void => {
    const at = tile * COVER_SUB * COVER_SUB + s
    hits[at >> 3]! |= 1 << (at & 7)
  }
  for (let t = 0; t + 2 < indices.length; t += 3) {
    const a = indices[t]!, b = indices[t + 1]!, c = indices[t + 2]!
    const ax = px[a]!, az = pz[a]!, bx = px[b]!, bz = pz[b]!, cx = px[c]!, cz = pz[c]!
    const area = (bx - ax) * (cz - az) - (bz - az) * (cx - ax)
    if (area === 0) continue
    if (!flatEnough(px, py, pz, a, b, c)) continue
    const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx) / POS_SCALE))
    const x1 = Math.min(31, Math.floor(Math.max(ax, bx, cx) / POS_SCALE))
    const z0 = Math.max(0, Math.floor(Math.min(az, bz, cz) / POS_SCALE))
    const z1 = Math.min(31, Math.floor(Math.max(az, bz, cz) / POS_SCALE))
    for (let tz = z0; tz <= z1; tz++) {
      for (let tx = x0; tx <= x1; tx++) {
        const at = tz * 32 + tx
        for (let sz = 0; sz < COVER_SUB; sz++) {
          for (let sx = 0; sx < COVER_SUB; sx++) {
            const qx = tx * POS_SCALE + step + sx * 2 * step
            const qz = tz * POS_SCALE + step + sz * 2 * step
            const w0 = (bx - ax) * (qz - az) - (bz - az) * (qx - ax)
            const w1 = (cx - bx) * (qz - bz) - (cz - bz) * (qx - bx)
            const w2 = (ax - cx) * (qz - cz) - (az - cz) * (qx - cx)
            if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) {
              mark(at, sz * COVER_SUB + sx)
            }
          }
        }
      }
    }
  }
  for (let tile = 0; tile < 32 * 32; tile++) {
    let n = 0
    for (let s = 0; s < COVER_SUB * COVER_SUB; s++) {
      const at = tile * COVER_SUB * COVER_SUB + s
      if ((hits[at >> 3]! & (1 << (at & 7))) !== 0) n++
    }
    if (n >= COVER_MIN) bits[tile >> 3]! |= 1 << (tile & 7)
  }
  return bits
}

/**
 * 딛을 만큼 누운 면인가 — 법선이 수평에서 60° 안인가 (`3·ny² ≥ nx² + nz²`).
 *
 * 정수 좌표로 외적을 내면 값이 2^53을 넘을 수 있어 나눠서 double로 잰다.
 * 두 굽는 쪽이 같은 정수에 같은 식을 쓰므로 끝자리까지 같다
 */
function flatEnough(
  px: Int32Array, py: Int32Array, pz: Int32Array, a: number, b: number, c: number,
): boolean {
  const ux = (px[b]! - px[a]!) / POS_SCALE, uy = (py[b]! - py[a]!) / POS_SCALE
  const uz = (pz[b]! - pz[a]!) / POS_SCALE
  const vx = (px[c]! - px[a]!) / POS_SCALE, vy = (py[c]! - py[a]!) / POS_SCALE
  const vz = (pz[c]! - pz[a]!) / POS_SCALE
  const nx = uy * vz - uz * vy
  const ny = uz * vx - ux * vz
  const nz = ux * vy - uy * vx
  return 3 * ny * ny >= nx * nx + nz * nz
}

/** 소품 모델의 XZ 상자 — `POS_SCALE` 단위 정수 넷. 그린 것이 없으면 null */
export function coverBox(verts: Vertex[]): [number, number, number, number] | null {
  if (verts.length === 0) return null
  let x0 = Infinity, z0 = Infinity, x1 = -Infinity, z1 = -Infinity
  for (const v of verts) {
    const x = Math.round(v.pos[0] * POS_SCALE), z = Math.round(v.pos[2] * POS_SCALE)
    if (x < x0) x0 = x
    if (x > x1) x1 = x
    if (z < z0) z0 = z
    if (z > z1) z1 = z
  }
  return [x0, z0, x1, z1]
}

/**
 * 조각을 **제 노드 자리로 옮긴다** (`nsbmd.parseNodes`).
 *
 * ⚠️ **이동은 유닛이고 정점은 이미 타일이다.** `buildMesh`가 `pos × upScale ÷ 16`
 * 으로 타일로 옮겨 놓았으므로 노드 이동도 16으로 나눈다. 원작이 조각에
 * `upScale`을 먼저 먹이고(`POSSCALE`) 노드 행렬을 바깥에 두는 차례라 그렇다
 */
export function placeByNode(verts: Vertex[], node: NodeXform | undefined): void {
  if (!node) return
  const still = node.t.every((v) => v === 0) && node.s.every((v) => v === 1)
    && node.m.every((v, i) => v === (i % 4 === 0 ? 1 : 0))
  if (still) return
  const m = node.m
  for (const v of verts) {
    const sx = v.pos[0] * node.s[0], sy = v.pos[1] * node.s[1], sz = v.pos[2] * node.s[2]
    v.pos = [
      m[0]! * sx + m[1]! * sy + m[2]! * sz + node.t[0] / UNITS_PER_TILE,
      m[3]! * sx + m[4]! * sy + m[5]! * sz + node.t[1] / UNITS_PER_TILE,
      m[6]! * sx + m[7]! * sy + m[8]! * sz + node.t[2] / UNITS_PER_TILE,
    ]
    // 법선은 회전만 먹인다 — 이동은 방향을 안 바꾼다
    const n = [
      m[0]! * v.normal[0] + m[1]! * v.normal[1] + m[2]! * v.normal[2],
      m[3]! * v.normal[0] + m[4]! * v.normal[1] + m[5]! * v.normal[2],
      m[6]! * v.normal[0] + m[7]! * v.normal[1] + m[8]! * v.normal[2],
    ]
    v.normal = n.map((c) => Math.max(-127, Math.min(127, Math.round(c)))) as Vec3
  }
}

/**
 * 굴 천장이 바닥에서 이만큼 넘게 떠 있으면 뚜껑으로 본다 (타일)
 */
const CEILING_LIFT = 1.5

/**
 * **원작이 위를 가리려고 깔아 둔 새까만 천장을 안 굽는다.**
 *
 * 굴에는 불투명·그림 없음·확산 (0,0,0)짜리 **납작한 검은 판**이 바닥 위에
 * 떠 있다. 원작 카메라는 그 위에서 내려다보지 않으므로 그것이 「위쪽을 가리는
 * 뚜껑」 노릇만 한다. 우리 3인칭은 주인공보다 네 칸 위에 서므로 **그 뚜껑을
 * 위에서 본다** — 강철섬(맵 293, 청크 504~507)에서 y 10에 깔린 판이 화면의
 * 92%를 검게 덮었다 (`node .audit/blackWhat.mjs ironisle`).
 *
 * **아래에서 보면 없애도 똑같다** — 검은 판이든 허공이든 검정이다.
 *
 * 실측으로 이 잣대에 걸리는 것이 청크 51개에 서브메시 51개·삼각형 527개고,
 * 전부 바닥에서 2칸 넘게 떠 있으며 대개 그 청크의 제일 높은 자리다. 바닥에
 * 깔린 검은 판(그림자)은 하나도 안 걸린다
 */
function dropBlackCeilings(
  verts: readonly Vertex[], indices: number[],
  submeshes: [number, number, number][], materials: readonly Material[],
): { indices: number[], submeshes: [number, number, number][] } {
  let minY = Infinity
  for (const v of verts) if (v.pos[1] < minY) minY = v.pos[1]
  const keep: [number, number, number][] = []
  let dropped = 0
  for (const s of submeshes) {
    const m = materials[s[0]]!
    const black = m.texture === null && m.alpha === 31
      && m.diffuse[0]! + m.diffuse[1]! + m.diffuse[2]! === 0
    let lo = Infinity, hi = -Infinity
    if (black) {
      for (let t = 0; t < s[2]; t++) {
        const y = verts[indices[s[1] + t]!]!.pos[1]
        if (y < lo) lo = y
        if (y > hi) hi = y
      }
    }
    if (black && hi - lo <= 0.05 && lo >= minY + CEILING_LIFT) { dropped += 1; continue }
    keep.push(s)
  }
  if (dropped === 0) return { indices, submeshes }
  const out: number[] = []
  const packed: [number, number, number][] = []
  for (const s of keep) {
    packed.push([s[0], out.length, s[2]])
    for (let t = 0; t < s[2]; t++) out.push(indices[s[1] + t]!)
  }
  return { indices: out, submeshes: packed }
}

export function buildChunk(chunk: Uint8Array, id: number): BuiltChunk {
  const { buf, view, modelAt, header } = openModel(chunk)
  const pairs = readSbc(buf, modelAt + header.sbcOffset, modelAt + header.materialsOffset)
  if (pairs.length !== header.polygons) {
    throw new Error(
      `청크 ${String(id)}: SBC가 짝 ${String(pairs.length)}개인데 폴리곤은 ${String(header.polygons)}개다`,
    )
  }
  const materials = parseMaterials(buf, view, modelAt, header)
  const polygons = parsePolygons(buf, view, modelAt, header)
  const nodes = parseNodes(buf, view, modelAt)

  const verts: Vertex[] = []
  const indices: number[] = []
  const submeshes: [number, number, number][] = []
  for (const pair of pairs) {
    const poly = polygons[pair.polygon]
    if (!poly) throw new Error(`청크 ${String(id)}: 폴리곤 ${String(pair.polygon)}이 없다`)
    const mat = materials[pair.material]
    if (!mat) throw new Error(`청크 ${String(id)}: 재질 ${String(pair.material)}이 없다`)
    const mesh = buildMesh(poly.dl, header.upScale, mat)
    placeByNode(mesh.verts, nodes[pair.node])
    const base = verts.length
    verts.push(...mesh.verts)
    submeshes.push([pair.material, indices.length, mesh.indices.length])
    for (const idx of mesh.indices) indices.push(base + idx)
  }
  const cut = dropBlackCeilings(verts, indices, submeshes, materials)
  return {
    bytes: packChunk(verts, cut.indices, materials, cut.submeshes),
    verts: verts.length,
    headerVerts: header.verts,
    materials,
    // 걷어낸 천장은 바닥이 아니다 — 남은 색인으로만 찍는다
    cover: coverBits(verts, cut.indices),
  }
}

// ── 소품 ─────────────────────────────────────────────────────────────────────
//
// 집·간판·표지판은 청크 모델에 안 들어 있다. `build_model.narc`에 590개가 따로
// 있고, 청크의 48바이트 배치 기록이 그 번호와 자리·회전·크기를 준다.
//
// 청크 모델과 달리 **자기 텍스처를 들고 있다** — 590개 중 568개가 TEX0를 같이
// 갖는다. 파일 형식은 청크와 같다(`PT3C`). 읽는 쪽이 하나면 된다.

/** BMD0 안에서 이름으로 블록을 찾는다. 소품은 MDL0 + TEX0 둘이다 */
export function blocks(buf: Uint8Array, view: DataView): Record<string, number> {
  const out: Record<string, number> = {}
  const count = view.getUint16(14, true)
  for (let i = 0; i < count; i++) {
    const off = view.getUint32(16 + i * 4, true)
    out[String.fromCharCode(buf[off]!, buf[off + 1]!, buf[off + 2]!, buf[off + 3]!)] = off
  }
  return out
}

/** 재질이 쓰는 (그림, 팔레트) 쌍 중 이 TEX0에 실제로 있는 것 */
export function wantedItems(materials: readonly Material[], tex0: Tex0): SheetItem[] {
  const byName = new Map(tex0.textures.map((t) => [t.name, t]))
  const wanted = new Map<string, SheetItem>()
  for (const m of materials) {
    if (!m.texture) continue
    const key = `${m.texture} ${m.palette ?? ''}`
    const tex = byName.get(m.texture)
    if (tex && !wanted.has(key)) {
      wanted.set(key, {
        tex: m.texture, pal: m.palette ?? '',
        width: tex.width, height: tex.height, src: tex, x: 0, y: 0,
      })
    }
  }
  return [...wanted.values()]
}

async function convertProps(ctx: ConvertContext, out: Produced): Promise<void> {
  const narc = await ctx.fs.read('/fielddata/build_model/build_model.narc')
  if (!narc) throw new Error('build_model.narc을 못 읽었다')

  const sheets: (Sheet | null)[] = []
  /** 모델마다 XZ 상자 (`POS_SCALE` 단위). 바닥을 소품이 까는 방이 있다 */
  const boxes: ([number, number, number, number] | null)[] = []
  let count = 0
  for (let i = 0; ; i++) {
    const file = narcEntry(narc, i)
    if (!file) break
    count = i + 1
    const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
    const found = blocks(file, view)
    const mdlAt = found.MDL0
    if (mdlAt === undefined) throw new Error(`소품 ${String(i)}에 MDL0가 없다`)
    const list = readDict(file, view, mdlAt + 8)
    const modelAt = mdlAt + view.getUint32(list[0]!.at, true)
    const header = parseModel(file, view, modelAt)
    const materials = parseMaterials(file, view, modelAt, header)
    const polygons = parsePolygons(file, view, modelAt, header)
    const pairs = readSbc(file, modelAt + header.sbcOffset, modelAt + header.materialsOffset)
    // 소품도 조각을 노드 행렬로 놓는다 — 590개에 노드 650개, 그중 이동 84 ·
    // 회전 10 · 크기 12이고 노드가 여럿인 소품이 25개다 (`nsbmd.parseNodes`)
    const nodes = parseNodes(file, view, modelAt)

    const verts: Vertex[] = []
    const indices: number[] = []
    const submeshes: [number, number, number][] = []
    for (const pair of pairs) {
      const mesh = buildMesh(polygons[pair.polygon]!.dl, header.upScale, materials[pair.material]!)
      placeByNode(mesh.verts, nodes[pair.node])
      const base = verts.length
      verts.push(...mesh.verts)
      submeshes.push([pair.material, indices.length, mesh.indices.length])
      for (const idx of mesh.indices) indices.push(base + idx)
    }
    out.set(`data/props/${String(i)}.bin`, packChunk(verts, indices, materials, submeshes))
    // 소품이 바닥을 대신 까는 방이 있다 — 챔피언 방은 청크 메시가 정점 넷뿐이고
    // 방 바닥이 소품 110이다. 상자만 실어 두면 `floorSeal`이 그 방을 안 막는다
    boxes.push(coverBox(verts))

    // 자기 텍스처를 갖고 있으면 시트로 굽는다
    const texAt = found.TEX0
    let baked: { png: Uint8Array, sheet: Sheet } | null = null
    if (texAt !== undefined) {
      const tex0 = parseTex0(file, texAt)
      const palAt = new Map(tex0.palettes.map((p) => [p.name, p.offset]))
      baked = await bakeSheet(tex0, wantedItems(materials, tex0), palAt)
    }
    if (baked) out.set(`data/props/${String(i)}.png`, baked.png)
    sheets.push(baked?.sheet ?? null)

    if (i % 16 === 0) { check(ctx); await breathe(ctx) }
  }
  out.set('data/props/index.json', json({ count, sheets, boxes }))

  // 소품이 어떤 애니를 갖는가 — 문·자전거 비탈·간판이 이 표를 본다.
  // ⚠️ **작다** — 소품 112개와 멤버 98개뿐이라 자리표 하나로 족하다
  const list = await ctx.fs.read('/arc/bm_anime_list.narc')
  const anime = await ctx.fs.read('/arc/bm_anime.narc')
  if (!list || !anime) throw new Error('bm_anime_list·bm_anime을 못 읽었다')
  const anims = buildPropAnims(list, anime)
  if (anims.props[String(count - 1)] === undefined && Object.keys(anims.props).length === 0) {
    throw new Error('소품 애니 표가 비었다')
  }
  out.set('data/props/anims.json', json(anims))
}

// ── 맵 텍스처 ────────────────────────────────────────────────────────────────
//
// 맵 모델은 텍스처를 자기 안에 안 갖고 있다. 영역(area)마다 한 벌씩 BTX0로 들어
// 있고, 재질이 **이름으로** 그것을 가리킨다 — 그림 이름과 팔레트 이름이 따로다.
// 같은 그림을 팔레트만 바꿔 여러 번 쓰는 일이 있어 (그림, 팔레트) 쌍마다 하나씩 편다.

let blank: Uint8Array | null = null
/** 쓰는 텍스처가 하나도 없는 묶음. 자리를 비우면 번호가 밀린다 */
async function emptySheet(): Promise<Uint8Array> {
  blank ??= await encodePng(new Uint8Array(SHEET_WIDTH * 4), SHEET_WIDTH, 1)
  return blank
}

async function convertTextures(
  ctx: ConvertContext, out: Produced, wanted: ReadonlySet<string>,
): Promise<void> {
  const narc = await ctx.fs.read('/fielddata/areadata/area_map_tex/map_tex_set.narc')
  if (!narc) throw new Error('map_tex_set.narc을 못 읽었다')

  const sets: Sheet[] = []
  for (let s = 0; ; s++) {
    const buf = narcEntry(narc, s)
    if (!buf) break
    const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    const tex0 = parseTex0(buf, view.getUint32(16, true))
    const byName = new Map(tex0.textures.map((t) => [t.name, t]))
    const palAt = new Map(tex0.palettes.map((p) => [p.name, p.offset]))

    const items: SheetItem[] = []
    for (const pair of wanted) {
      const sp = pair.indexOf(' ')
      const texName = pair.slice(0, sp)
      const palName = pair.slice(sp + 1)
      const tex = byName.get(texName)
      if (!tex) continue
      if (palName !== '' && !palAt.has(palName)) continue
      items.push({
        tex: texName, pal: palName, width: tex.width, height: tex.height, src: tex, x: 0, y: 0,
      })
    }
    const baked = await bakeSheet(tex0, items, palAt)
    out.set(`data/tex/${String(s)}.png`, baked ? baked.png : await emptySheet())
    sets.push(baked ? baked.sheet : { w: SHEET_WIDTH, h: 1, items: [] })
    if (s % 4 === 0) { check(ctx); await breathe(ctx) }
  }
  out.set('data/tex/index.json', json({ sheetWidth: SHEET_WIDTH, sets }))
}

/** 청크·텍스처·소품 셋이 한 그룹이다 — 셋이 다 있어야 땅이 그려진다 */
const TOTAL = 666 + 32 + 590

export async function convertChunks(ctx: ConvertContext): Promise<Produced> {
  const narc = await ctx.fs.read('/fielddata/land_data/land_data.narc')
  if (!narc) throw new Error('land_data.narc을 못 읽었다')

  const out: Produced = new Map()
  // 청크 재질이 쓰는 (그림, 팔레트) 쌍. 텍스처 묶음은 이 목록만 굽는다
  const wanted = new Set<string>()
  const covers: Uint8Array[] = []
  let count = 0
  for (let i = 0; ; i++) {
    const entry = narcEntry(narc, i)
    if (!entry) break
    const built = buildChunk(entry, i)
    out.set(`data/chunks/${String(i)}.bin`, built.bytes)
    covers.push(built.cover)
    for (const m of built.materials) if (m.texture) wanted.add(`${m.texture} ${m.palette ?? ''}`)
    count = i + 1
    if (i % 16 === 0) { check(ctx); ctx.onProgress?.(i, TOTAL); await breathe(ctx) }
  }
  // 청크마다 128B — 666개라 85KB다. 한 파일로 두는 이유는 **충돌이 스트리밍을
  // 기다리면 안 되기 때문**이다 (`engine/map/grid` 머리말). 처음에 통째로 받는다
  const coverBin = new Uint8Array(covers.length * 128)
  covers.forEach((c, i) => { coverBin.set(c, i * 128) })
  out.set('data/chunks/cover.bin', coverBin)
  out.set('data/chunks/index.json', json({
    posScale: POS_SCALE, uvScale: UV_SCALE, vertexBytes: VERTEX_BYTES,
    unitsPerTile: UNITS_PER_TILE, count,
  }))

  ctx.onProgress?.(count, TOTAL)
  await convertTextures(ctx, out, wanted)
  await convertProps(ctx, out)
  ctx.onProgress?.(TOTAL, TOTAL)
  return out
}

