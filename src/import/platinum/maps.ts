// 맵 그룹 — 브라우저에서 (DATA.md §2.7 · §4.1)
//
// 맵 헤더 표가 모든 것의 등뼈다. 맵 하나가 어느 행렬에 있고 어느 이벤트 파일·
// 인카운터 표·스크립트·글 뱅크를 쓰는지가 전부 여기 있다.
//
// ⚠️ **주소를 박지 않는다.** 노드 쪽은 `0xEA01C`를 상수로 들고 있고 그래서
// 일본어 롬은 "자리를 안 찾았다"로 남아 있었다(`dialogue.js`의 `ROMS.ja.headers:
// null`). 여기서는 그 자리를 **찾는다** — 표를 표로 만드는 성질이 롬 안에 있고,
// 그 성질을 만족하는 자리가 하나뿐이라는 것이 애초에 노드 쪽이 주소를 확정한
// 방법이었다. 상수 대신 그 방법 자체를 옮기면 세 판이 다 열린다.
import { narcEntry, type NdsFileSystem } from './nds'
import { breathe, check, json, type ConvertContext, type Produced } from './convertTypes'

export const HEADER_SIZE = 24
export const MAP_COUNT = 593
/** 인카운터 없음 */
const NO_ENCOUNTER = 0xffff
export const CHUNK_TILES = 32
const LAND_HEADER = 16
const OBJECT_SIZE = 48
/** 20.12 고정소수점 × 타일당 16 DS유닛 = 65536. 나누면 타일 단위가 된다 */
const FIXED_PER_TILE = 65536
/** 통행 불가 플래그 */
export const IMPASSABLE = 0x8000
const OVERWORLD = 0
const EMPTY_CHUNK = 0xffff

export interface MapHeader {
  id: number
  area: number
  matrix: number
  scripts: number
  initScripts: number
  msg: number
  bgmDay: number
  bgmNight: number
  encounters: number | null
  events: number
  label: number
  labelWindow: number
  weather: number
  camera: number
  mapType: number
  battleBg: number
  bike: number
  run: number
  escapeRope: number
  fly: number
}

/** `MapHeader` 끝의 u16 비트필드. 순서는 디컴프의 구조체 그대로다 */
function bits(v: number): Pick<MapHeader, 'mapType' | 'battleBg' | 'bike' | 'run' | 'escapeRope' | 'fly'> {
  return {
    /** 실내·동굴·마을 같은 갈래 (`MapHeader.mapType`) */
    mapType: v & 0x7f,
    /**
     * 배틀 배경 번호 (`MapHeader.battleBG`).
     *
     * 원작 DS는 이 번호로 2D 배경을 고른다. 우리는 같은 번호로 BDSP의 3D 무대를
     * 고른다 — BDSP가 같은 게임의 리메이크라 무대가 같은 자리를 그린다
     */
    battleBg: (v >> 7) & 0x1f,
    bike: (v >> 12) & 1,
    run: (v >> 13) & 1,
    escapeRope: (v >> 14) & 1,
    fly: (v >> 15) & 1,
  }
}

export function parseHeader(view: DataView, at: number, id: number): MapHeader {
  const enc = view.getUint16(at + 14, true)
  return {
    id,
    /** 지형 텍스처·모델 아카이브 */
    area: view.getUint8(at),
    matrix: view.getUint16(at + 2, true),
    scripts: view.getUint16(at + 4, true),
    initScripts: view.getUint16(at + 6, true),
    /** pl_msg.narc 뱅크 번호 (US 기준) */
    msg: view.getUint16(at + 8, true),
    bgmDay: view.getUint16(at + 10, true),
    bgmNight: view.getUint16(at + 12, true),
    encounters: enc === NO_ENCOUNTER ? null : enc,
    events: view.getUint16(at + 16, true),
    /** +18의 하위 바이트가 지역명 인덱스. 상위 바이트는 표시 창 종류다 */
    label: view.getUint8(at + 18),
    labelWindow: view.getUint8(at + 19),
    /** 날씨 (`MapHeader.weather`). 0이 없음 */
    weather: view.getUint8(at + 20),
    /** 카메라 종류 (`MapHeader.cameraType`) */
    camera: view.getUint8(at + 21),
    ...bits(view.getUint16(at + 22, true)),
  }
}

export interface TableCounts { events: number, matrices: number, encounters: number }

export class HeaderTableError extends Error {
  constructor(message: string) { super(message); this.name = 'HeaderTableError' }
}

/**
 * 맵 헤더 표가 표라는 증거.
 *
 * 셋 다 롬 안의 **다른 것**을 근거로 삼는다 — 이벤트 파일 수, 행렬 수, 인카운터
 * 표 크기. 스트라이드 24B로 593줄을 읽었을 때 이 셋이 다 맞는 자리는 실측으로
 * 롬 전체에 하나뿐이다
 */
export function tableFits(view: DataView, at: number, n: TableCounts): boolean {
  const seen = new Set<number>()
  for (let id = 0; id < MAP_COUNT; id++) {
    const o = at + id * HEADER_SIZE
    const events = view.getUint16(o + 16, true)
    if (events >= n.events) return false
    seen.add(events)
    if (view.getUint16(o + 2, true) >= n.matrices) return false
    const enc = view.getUint16(o + 14, true)
    if (enc !== NO_ENCOUNTER && enc >= n.encounters) return false
  }
  // 전단사여야 한다. 593줄이 534개 파일을 **빠짐없이** 가리킨다
  return seen.size === n.events
}

/** 후보가 한 줄씩 밀린 같은 표인지 보려고 잇는 최대 칸 수 */
const MAX_SHIFT = 4

/**
 * ARM9에서 맵 헤더 표를 찾는다.
 *
 * ⚠️ **성질만으로는 한 줄까지밖에 못 좁힌다.** 실측하면 세 판 다 후보가 **둘**
 * 나오고 그 둘은 정확히 24바이트 — 한 줄 — 떨어져 있다. 뒤쪽 후보는 0번 줄을
 * 버리고 표 다음 줄을 하나 끌어들여 읽은 것인데, 0번 줄의 이벤트 번호가 다른
 * 줄과 겹치고 끌어들인 줄도 범위 안이라 전단사가 그대로 성립한다.
 *
 * 그래서 후보들을 **한 줄 간격의 잇단 무리**로 묶고 그 무리의 시작을 답으로 삼는다.
 * 시작 바로 앞줄은 성질을 깨뜨렸다는 뜻이고(안 그랬으면 그것도 후보다), 그것이 곧
 * "여기서 표가 시작한다"는 증거다. 무리가 둘 이상이면 근거가 부족한 것이므로 던진다.
 *
 * 실측: 이 규칙이 고른 자리가 노드 쪽이 손으로 박아 둔 값과 en·ko 둘 다 같다
 * (0xEA01C · 0xEAAA4). ja는 노드 쪽이 못 찾은 자리인데 여기서는 나온다 (0xE96F0)
 */
export function findHeaderTable(arm9: Uint8Array, n: TableCounts): number {
  const view = new DataView(arm9.buffer, arm9.byteOffset, arm9.byteLength)
  const last = arm9.byteLength - MAP_COUNT * HEADER_SIZE
  const found: number[] = []
  // ARM 자료표는 4바이트로 정렬돼 있다. 세 판 다 그렇다는 것을 실측으로 확인했다
  for (let at = 0; at <= last; at += 4) {
    // 싼 검사 먼저 — 거의 다 여기서 떨어진다
    if (view.getUint16(at + 16, true) >= n.events) continue
    if (view.getUint16(at + 2, true) >= n.matrices) continue
    if (tableFits(view, at, n)) found.push(at)
  }
  if (found.length === 0) throw new HeaderTableError('맵 헤더 표를 못 찾았다 — 아는 판이 아니다')

  const runs: number[][] = []
  for (const at of found) {
    const last2 = runs[runs.length - 1]
    if (last2 && at - last2[last2.length - 1]! === HEADER_SIZE) last2.push(at)
    else runs.push([at])
  }
  if (runs.length > 1) {
    throw new HeaderTableError(
      `맵 헤더 표 후보가 ${String(runs.length)}무리다 — 한 줄 밀린 같은 표가 아니라 서로 다른 자리다`,
    )
  }
  const run = runs[0]!
  if (run.length > MAX_SHIFT) {
    throw new HeaderTableError(`맵 헤더 표 후보가 ${String(run.length)}줄이나 이어진다 — 성질이 너무 헐겁다`)
  }
  return run[0]!
}

// ── 행렬·청크 ────────────────────────────────────────────────────────────────

export interface Matrix {
  width: number
  height: number
  name: string
  headers: number[] | null
  heights: number[] | null
  maps: number[]
}

const latin1 = (b: Uint8Array): string => String.fromCharCode(...b)

export function parseMatrix(buf: Uint8Array): Matrix {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  let p = 0
  const width = buf[p++]!, height = buf[p++]!
  const hasHeaders = buf[p++] !== 0, hasHeights = buf[p++] !== 0
  const nameLen = buf[p++]!
  const name = latin1(buf.subarray(p, p + nameLen)); p += nameLen
  const n = width * height
  let headers: number[] | null = null, heights: number[] | null = null
  if (hasHeaders) {
    headers = []
    for (let i = 0; i < n; i++) { headers.push(view.getUint16(p, true)); p += 2 }
  }
  if (hasHeights) { heights = []; for (let i = 0; i < n; i++) heights.push(buf[p++]!) }
  const maps: number[] = []
  for (let i = 0; i < n; i++) { maps.push(view.getUint16(p, true)); p += 2 }
  return { width, height, name, headers, heights, maps }
}

export interface Land { perm: Uint8Array, objects: Uint8Array, bdhc: Uint8Array }

export function parseLand(buf: Uint8Array): Land {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const perm = view.getUint32(0, true)
  const obj = view.getUint32(4, true)
  const model = view.getUint32(8, true)
  const bdhc = view.getUint32(12, true)
  if (LAND_HEADER + perm + obj + model + bdhc !== buf.byteLength) {
    throw new Error('land_data 크기 합 불일치 — 포맷 가정이 깨졌다')
  }
  let p = LAND_HEADER
  const permBytes = buf.subarray(p, p + perm); p += perm
  const objects = buf.subarray(p, p + obj); p += obj
  // 모델은 건너뛴다 — DS 지오메트리는 블록아웃 레퍼런스일 뿐이다 (PLAN §4.2)
  p += model
  return { perm: permBytes, objects, bdhc: buf.subarray(p, p + bdhc) }
}

export interface Building {
  model: number, x: number, y: number, z: number
  rot: [number, number, number], scale: [number, number, number]
}

/** 건물 배치: i32 modelId, pos×3, rot×3, scale×3 (전부 20.12 고정소수점) */
export function parseObjects(buf: Uint8Array): Building[] {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const out: Building[] = []
  for (let i = 0; i + OBJECT_SIZE <= buf.byteLength; i += OBJECT_SIZE) {
    const f = (j: number): number => view.getInt32(i + j * 4, true) / FIXED_PER_TILE
    out.push({
      model: view.getInt32(i, true),
      // 청크 중심 기준 좌표를 0..32 타일 좌표로 옮긴다
      x: f(1) + CHUNK_TILES / 2,
      y: f(2),
      z: f(3) + CHUNK_TILES / 2,
      rot: [
        view.getInt32(i + 16, true) / 4096,
        view.getInt32(i + 20, true) / 4096,
        view.getInt32(i + 24, true) / 4096,
      ],
      scale: [
        view.getInt32(i + 28, true) / 4096,
        view.getInt32(i + 32, true) / 4096,
        view.getInt32(i + 36, true) / 4096,
      ],
    })
  }
  return out
}

interface BuiltMatrix {
  meta: {
    id: number, name: string, width: number, height: number
    tileWidth: number, tileHeight: number
    chunks: { i: number, mx: number, my: number, land: number, zone: number }[]
  }
  tiles: Uint16Array
  buildings: Record<number, Building[]>
}

/** 행렬 하나를 평평한 u16 격자 + 메타로 편다 */
function buildMatrix(matrixBuf: Uint8Array, lands: Uint8Array[], id: number): BuiltMatrix {
  const m = parseMatrix(matrixBuf)
  const tileWidth = m.width * CHUNK_TILES
  const tileHeight = m.height * CHUNK_TILES
  // 청크가 없는 칸은 통행 불가. 경계 밖으로 걸어 나가지 않는다
  const tiles = new Uint16Array(tileWidth * tileHeight).fill(IMPASSABLE)
  const chunks: BuiltMatrix['meta']['chunks'] = []
  const buildings: Record<number, Building[]> = {}

  for (let i = 0; i < m.maps.length; i++) {
    const land = m.maps[i]!
    if (land === EMPTY_CHUNK) continue
    const mx = i % m.width
    const my = Math.floor(i / m.width)
    chunks.push({ i, mx, my, land, zone: m.headers ? m.headers[i]! : -1 })

    const L = parseLand(lands[land]!)
    const perm = new DataView(L.perm.buffer, L.perm.byteOffset, L.perm.byteLength)
    const ox = mx * CHUNK_TILES
    const oz = my * CHUNK_TILES
    for (let ty = 0; ty < CHUNK_TILES; ty++) {
      const row = (oz + ty) * tileWidth + ox
      for (let tx = 0; tx < CHUNK_TILES; tx++) {
        tiles[row + tx] = perm.getUint16((ty * CHUNK_TILES + tx) * 2, true)
      }
    }
    const objs = parseObjects(L.objects)
    // 청크 로컬 좌표를 행렬 타일 좌표로 옮겨 둔다 — 런타임에서 다시 더할 일이 없게
    if (objs.length) buildings[i] = objs.map((o) => ({ ...o, x: o.x + ox, z: o.z + oz }))
  }

  return {
    meta: { id, name: m.name, width: m.width, height: m.height, tileWidth, tileHeight, chunks },
    tiles,
    buildings,
  }
}

/** 통행 가능하고 그 존에 속한 지점 — 스폰 후보 */
export function findSpawn(
  meta: BuiltMatrix['meta'], tiles: Uint16Array, zoneId: number,
): { x: number, z: number } {
  const cells = meta.chunks.filter((c) => c.zone === zoneId)
  if (!cells.length) throw new Error(`존 id ${String(zoneId)}이 행렬 ${String(meta.id)}에 없다`)
  const cx = (cells.reduce((s, c) => s + c.mx, 0) / cells.length + 0.5) * CHUNK_TILES
  const cz = (cells.reduce((s, c) => s + c.my, 0) / cells.length + 0.5) * CHUNK_TILES
  let best: { x: number, z: number } | null = null
  let bestD = Infinity
  for (const c of cells) {
    for (let ty = 0; ty < CHUNK_TILES; ty++) {
      for (let tx = 0; tx < CHUNK_TILES; tx++) {
        const gx = c.mx * CHUNK_TILES + tx
        const gz = c.my * CHUNK_TILES + ty
        if (tiles[gz * meta.tileWidth + gx]! & IMPASSABLE) continue
        const d = (gx - cx) ** 2 + (gz - cz) ** 2
        if (d < bestD) { bestD = d; best = { x: gx + 0.5, z: gz + 0.5 } }
      }
    }
  }
  if (!best) throw new Error(`존 id ${String(zoneId)}에 통행 가능한 타일이 없다`)
  return best
}

// ── BDHC ─────────────────────────────────────────────────────────────────────
//
//   char[4] "BDHC"
//   u16     points, normals, constants, plates, strips, accessList
//   BDHCPoint { fx32 x, z }                     × points        8B
//   VecFx32   { fx32 x, y, z }                  × normals      12B
//   fx32      상수 d                             × constants     4B
//   BDHCPlate { u16 p1, p2, normal, constant }  × plates        8B
//   BDHCStrip { fx32 scanline, u16 n, u16 i }   × strips        8B
//   u16       접근 목록                          × accessList    2B
//
// ⚠️ 디컴프의 `BDHCHeader`는 카운트를 `int`로 적어 뒀지만 **파일에는 u16이다.**

/** 20.12 고정소수점 */
const FX = 4096
/** 타일 하나가 DS 유닛 16이다 */
const UNITS_PER_TILE = 16
const BDHC_HEADER = 16
/** 청크 한 변의 타일 수. 좌표가 청크 **중심** 기준이라 절반을 더해 원점 기준으로 옮긴다 */
const CENTER_TILES = 16
const CENTER = CENTER_TILES * FX * UNITS_PER_TILE

export interface Plate {
  x1: number, z1: number, x2: number, z2: number
  normal: [number, number, number]
  d: number
}

/**
 * 스트립은 안 뽑는다.
 *
 * 스트립은 z 스캔라인별 판 목록으로, 매 프레임 판 수백 개를 훑지 않으려는
 * **색인**이다. 우리는 청크 하나 안에서만 질의하고 그 안의 판이 최대 1033개라
 * 선형으로 훑어도 프레임당 무시할 비용이다
 */
export function parseBdhc(buf: Uint8Array, id: number): Plate[] {
  if (buf.byteLength < BDHC_HEADER) {
    throw new Error(`청크 #${String(id)} BDHC가 헤더보다 작다 (${String(buf.byteLength)}B)`)
  }
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  if (latin1(buf.subarray(0, 4)) !== 'BDHC') throw new Error(`청크 #${String(id)} BDHC 매직 없음`)
  const points = view.getUint16(4, true)
  const normals = view.getUint16(6, true)
  const constants = view.getUint16(8, true)
  const plateCount = view.getUint16(10, true)
  const strips = view.getUint16(12, true)
  const accessList = view.getUint16(14, true)

  // 크기 합이 곧 배치의 증명이다. 어긋나면 조용히 넘어가면 안 된다
  const want = BDHC_HEADER + points * 8 + normals * 12 + constants * 4
    + plateCount * 8 + strips * 8 + accessList * 2
  if (want !== buf.byteLength) {
    throw new Error(
      `청크 #${String(id)} BDHC 크기 불일치: 예상 ${String(want)} 실제 ${String(buf.byteLength)}`,
    )
  }

  const pAt = BDHC_HEADER
  const nAt = pAt + points * 8
  const cAt = nAt + normals * 12
  const plAt = cAt + constants * 4

  const plates: Plate[] = []
  for (let i = 0; i < plateCount; i++) {
    const o = plAt + i * 8
    const a = view.getUint16(o, true)
    const b = view.getUint16(o + 2, true)
    const ni = view.getUint16(o + 4, true)
    const ci = view.getUint16(o + 6, true)
    if (a >= points || b >= points || ni >= normals || ci >= constants) {
      throw new Error(`청크 #${String(id)} 판 ${String(i)}의 색인이 범위 밖이다`)
    }
    // 좌표는 **원본 고정소수점 그대로** 담는다. 30928개 중 40개는 DS 유닛 정수도
    // 아니라(−2.3535타일 같은 값) 눈금에 맞춰 줄이면 조용히 어긋난다.
    //
    // ⚠️ 원본은 **청크 중심 기준**이다. 여기서 청크 원점 기준으로 옮겨 둔다 —
    // 안 옮기면 런타임에서 지형이 16타일 밀린다
    const raw = (j: number, off: number): number => view.getInt32(pAt + j * 8 + off, true) + CENTER
    const nv: [number, number, number] = [
      view.getInt32(nAt + ni * 12, true) / FX,
      view.getInt32(nAt + ni * 12 + 4, true) / FX,
      view.getInt32(nAt + ni * 12 + 8, true) / FX,
    ]
    plates.push({
      x1: raw(a, 0), z1: raw(a, 4), x2: raw(b, 0), z2: raw(b, 4),
      normal: nv,
      // d는 두 번 고친다. ① 타일 척도로 ② 원점을 옮긴 만큼 보정:
      // nx(x−16) + ny·y + nz(z−16) + d = 0 → d′ = d − 16(nx + nz).
      // **평평한 판(nx=nz=0)은 안 변한다** — 8974개 중 7969개가 그래서, 이걸
      // 빠뜨려도 대부분 멀쩡해 보이고 계단만 조용히 어긋난다
      d: view.getInt32(cAt + ci * 4, true) / FX / UNITS_PER_TILE - CENTER_TILES * (nv[0] + nv[2]),
    })
  }
  return plates
}

// ── 그룹 ─────────────────────────────────────────────────────────────────────

const readNarcAll = async (fs: NdsFileSystem, path: string): Promise<Uint8Array[]> => {
  const narc = await fs.read(path)
  if (!narc) throw new Error(`${path}을 못 읽었다`)
  const out: Uint8Array[] = []
  for (let i = 0; ; i++) {
    const e = narcEntry(narc, i)
    if (!e) break
    out.push(e)
  }
  return out
}

const bytesOf = (a: Uint16Array | Int32Array): Uint8Array =>
  new Uint8Array(a.buffer, a.byteOffset, a.byteLength)

/** 이름표 16바이트씩 */
function readMapNames(bin: Uint8Array): string[] {
  const out: string[] = []
  for (let i = 0; i * 16 < bin.byteLength; i++) {
    out.push(latin1(bin.subarray(i * 16, (i + 1) * 16)).replace(/\0+$/, ''))
  }
  return out
}

export async function convertMaps(ctx: ConvertContext): Promise<Produced> {
  const STEPS = 6
  ctx.onProgress?.(0, STEPS)
  const events = await readNarcAll(ctx.fs, '/fielddata/eventdata/zone_event.narc')
  const matrixFiles = await readNarcAll(ctx.fs, '/fielddata/mapmatrix/map_matrix.narc')
  const encData = await readNarcAll(ctx.fs, '/fielddata/encountdata/pl_enc_data.narc')
  const areaData = await readNarcAll(ctx.fs, '/fielddata/areadata/area_data.narc')
  const nameBin = await ctx.fs.read('/fielddata/maptable/mapname.bin')
  if (!nameBin) throw new Error('mapname.bin을 못 읽었다')
  await breathe(ctx)
  ctx.onProgress?.(1, STEPS)

  const arm9 = await ctx.fs.arm9(0, ctx.fs.header.arm9Size)
  if (!arm9) throw new Error('ARM9를 못 읽었다')
  const counts: TableCounts = {
    events: events.length, matrices: matrixFiles.length, encounters: encData.length,
  }
  const tableAt = findHeaderTable(arm9, counts)
  const view = new DataView(arm9.buffer, arm9.byteOffset, arm9.byteLength)
  const names = readMapNames(nameBin)
  const maps = Array.from({ length: MAP_COUNT }, (_, id) => ({
    ...parseHeader(view, tableAt + id * HEADER_SIZE, id),
    name: names[id] ?? `#${String(id)}`,
  }))
  await breathe(ctx)
  ctx.onProgress?.(2, STEPS)

  // 영역 자료 — 맵 헤더의 `area`가 이 표를 가리키고, 표가 다시 텍스처 묶음과
  // 건물 모델 묶음을 가리킨다 (`AreaDataFile`: u16 소품·텍스처·미사용·조명)
  const areas = areaData.map((b) => {
    const v = new DataView(b.buffer, b.byteOffset, b.byteLength)
    return { props: v.getUint16(0, true), tex: v.getUint16(2, true), light: v.getUint16(6, true) }
  })

  const lands = await readNarcAll(ctx.fs, '/fielddata/land_data/land_data.narc')
  await breathe(ctx)
  ctx.onProgress?.(3, STEPS)

  const out: Produced = new Map()
  out.set('data/maps.json', json({ count: maps.length, maps, areas }))

  // --- 오버월드 ---
  const ow = buildMatrix(matrixFiles[OVERWORLD]!, lands, OVERWORLD)
  const spawnMap = maps.find((m) => m.name === 'T01')
  if (!spawnMap) throw new Error('시작 존 T01이 이름표에 없다')
  out.set('data/matrices/0.bin', bytesOf(ow.tiles))
  out.set('data/matrices/0.json', json({
    ...ow.meta,
    spawn: { ...findSpawn(ow.meta, ow.tiles, spawnMap.id), map: spawnMap.id },
    buildings: ow.buildings,
  }))
  await breathe(ctx)
  ctx.onProgress?.(4, STEPS)

  // --- 실내: 헤더 표가 실제로 참조하는 행렬만 ---
  // 행렬마다 파일을 두면 문 열 때마다 왕복이 생긴다. 다 합쳐도 1.3MB다
  const used = [...new Set(maps.map((m) => m.matrix))]
    .filter((id) => id !== OVERWORLD).sort((a, b) => a - b)
  const parts: Uint8Array[] = []
  const index: Record<number, unknown> = {}
  let offset = 0
  for (const id of used) {
    const built = buildMatrix(matrixFiles[id]!, lands, id)
    const bytes = bytesOf(built.tiles)
    parts.push(bytes)
    index[id] = { ...built.meta, byteOffset: offset, buildings: built.buildings }
    offset += bytes.byteLength
  }
  const blob = new Uint8Array(offset)
  let at = 0
  for (const p of parts) { blob.set(p, at); at += p.byteLength }
  out.set('data/matrices/interiors.bin', blob)
  out.set('data/matrices/interiors.json', json({ byteLength: blob.byteLength, matrices: index }))
  await breathe(ctx)
  ctx.onProgress?.(5, STEPS)

  // --- BDHC: 평면 표를 공유해 판 하나를 좌표 4B + 색인 2B로 줄인다 ---
  const planeIndex = new Map<string, number>()
  const planes: number[][] = []
  const chunkSpans: [number, number][] = []
  const coords: number[] = []
  const refs: number[] = []
  for (let id = 0; id < lands.length; id++) {
    const plates = parseBdhc(parseLand(lands[id]!).bdhc, id)
    chunkSpans.push([refs.length, plates.length])
    for (const p of plates) {
      const key = `${p.normal.join(',')}|${String(p.d)}`
      let idx = planeIndex.get(key)
      if (idx === undefined) {
        idx = planes.length
        planeIndex.set(key, idx)
        planes.push([...p.normal, p.d])
      }
      coords.push(p.x1, p.z1, p.x2, p.z2)
      refs.push(idx)
    }
    if (id % 64 === 0) await breathe(ctx)
  }
  if (planes.length > 0xffff) throw new Error(`평면 ${String(planes.length)}종이 u16을 넘는다`)

  // coords(int32)를 먼저, refs(u16)를 뒤에. 앞이 4의 배수라 정렬이 맞는다
  const coordBytes = bytesOf(Int32Array.from(coords))
  const refBytes = bytesOf(Uint16Array.from(refs))
  const bdhc = new Uint8Array(coordBytes.byteLength + refBytes.byteLength)
  bdhc.set(coordBytes, 0)
  bdhc.set(refBytes, coordBytes.byteLength)
  out.set('data/bdhc.bin', bdhc)
  out.set('data/bdhc.json', json({
    plateCount: refs.length,
    /** 좌표는 20.12 고정소수점 int32다. 이걸로 나누면 타일이 된다 */
    fixedPerTile: FX * UNITS_PER_TILE,
    planes,
    chunks: chunkSpans,
  }))

  check(ctx)
  ctx.onProgress?.(STEPS, STEPS)
  return out
}
