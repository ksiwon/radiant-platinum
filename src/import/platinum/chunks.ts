// 청크 지오메트리 — 브라우저에서 (DATA.md §2.2)
//
// 두 가지를 풀어야 한다:
//   ① 디스플레이 리스트 — NDS GPU 명령 흐름이라 해석해야 삼각형이 나온다 (`nsbmd.ts`)
//   ② SBC — 어느 재질로 어느 폴리곤을 그리는지 짝지어 주는 짧은 명령 목록
//
// 검증은 헤더가 해 준다. MDL0가 정점·삼각형·사각형 수를 적어 두므로 우리가 센
// 것과 한 개도 안 틀려야 한다 (666/666).
import { narcEntry } from './nds'
import {
  fx32, readDict, runDisplayList, vertexFrom, parseModel, parsePolygons, openModel,
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

export interface Pair { material: number, polygon: number }

/**
 * SBC에서 (재질, 폴리곤) 짝을 뽑는다.
 *
 * ⚠️ **순서대로 1:1이 아니다.** 청크 0을 보면 재질 4가 폴리곤 13을, 재질 0이
 * 폴리곤 9를 그린다. 번호 순서로 짝지으면 땅에 아스팔트가, 길에 잔디가 깔린다
 */
export function readSbc(buf: Uint8Array, at: number, end: number): Pair[] {
  const pairs: Pair[] = []
  let material = 0
  let p = at
  while (p < end) {
    const raw = buf[p++]!
    const op = raw & 0x1f
    const flags = raw >> 5
    const n = sbcOperands(op, flags)
    const args: number[] = []
    for (let i = 0; i < n; i++) args.push(buf[p++]!)
    if (op === 0x04) material = args[0]!
    else if (op === 0x05) pairs.push({ material, polygon: args[0]! })
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
   * 이것이 유일한 색이다** — `packChunk`의 `untexturedDiffuse`를 보라
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

/**
 * **텍스처가 없는 재질에만** 확산색을 실어 준다.
 *
 * ⚠️ 켜는 쪽은 깨어진 세계 소품 하나뿐이다 (`untexturedDiffuse: true`).
 * 텍스처가 없으면 색을 줄 것이 확산색뿐인데, 기라티나 그림자(갈래 20)가
 * 확산 (0,0,0)에 정점색은 흰색 하나라 **새까매야 할 그림자가 하얗게** 떴다.
 *
 * ⚠️ **맵 청크와 건물 소품은 아직 안 켠다.** 켜면 굽는 바이트가 바뀌어
 * (청크 140벌 · 소품 109벌) 설치본이 그 둘을 통째로 다시 받는다.
 * 거기도 텍스처 없는 재질 287개가 흰색으로 뜨고 있다 — 남은 일이다
 */
export interface PackOptions {
  untexturedDiffuse?: boolean
}

export function packChunk(
  verts: Vertex[], indices: number[], materials: Material[], submeshes: [number, number, number][],
  opts: PackOptions = {},
): Uint8Array {
  const meta = {
    verts: verts.length,
    indices: indices.length,
    materials: materials.map((m) => ({
      tex: m.texture, pal: m.palette,
      // 반복·뒤집기는 텍스처를 만들 때 필요하고, 알파·면은 재질을 만들 때 쓴다
      rep: (m.repeatS ? 1 : 0) | (m.repeatT ? 2 : 0) | (m.flipS ? 4 : 0) | (m.flipT ? 8 : 0),
      a: m.alpha, f: m.faces,
      ...(opts.untexturedDiffuse === true && m.texture === null ? { d: m.diffuse } : {}),
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

export interface BuiltChunk {
  bytes: Uint8Array
  verts: number
  headerVerts: number
  materials: Material[]
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

  const verts: Vertex[] = []
  const indices: number[] = []
  const submeshes: [number, number, number][] = []
  for (const pair of pairs) {
    const poly = polygons[pair.polygon]
    if (!poly) throw new Error(`청크 ${String(id)}: 폴리곤 ${String(pair.polygon)}이 없다`)
    const mat = materials[pair.material]
    if (!mat) throw new Error(`청크 ${String(id)}: 재질 ${String(pair.material)}이 없다`)
    const mesh = buildMesh(poly.dl, header.upScale, mat)
    const base = verts.length
    verts.push(...mesh.verts)
    submeshes.push([pair.material, indices.length, mesh.indices.length])
    for (const idx of mesh.indices) indices.push(base + idx)
  }
  return {
    bytes: packChunk(verts, indices, materials, submeshes),
    verts: verts.length,
    headerVerts: header.verts,
    materials,
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

    const verts: Vertex[] = []
    const indices: number[] = []
    const submeshes: [number, number, number][] = []
    for (const pair of pairs) {
      const mesh = buildMesh(polygons[pair.polygon]!.dl, header.upScale, materials[pair.material]!)
      const base = verts.length
      verts.push(...mesh.verts)
      submeshes.push([pair.material, indices.length, mesh.indices.length])
      for (const idx of mesh.indices) indices.push(base + idx)
    }
    out.set(`data/props/${String(i)}.bin`, packChunk(verts, indices, materials, submeshes))

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
  out.set('data/props/index.json', json({ count, sheets }))
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
  let count = 0
  for (let i = 0; ; i++) {
    const entry = narcEntry(narc, i)
    if (!entry) break
    const built = buildChunk(entry, i)
    out.set(`data/chunks/${String(i)}.bin`, built.bytes)
    for (const m of built.materials) if (m.texture) wanted.add(`${m.texture} ${m.palette ?? ''}`)
    count = i + 1
    if (i % 16 === 0) { check(ctx); ctx.onProgress?.(i, TOTAL); await breathe(ctx) }
  }
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

