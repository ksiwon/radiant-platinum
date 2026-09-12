// 청크 모델 로더 (DATA.md §2.2)
//
// 청크 하나가 파일 하나다(`chunks/<i>.bin`). 앞에 자기 설명(재질·서브메시)이
// JSON으로 붙어 있고 그 뒤가 정점·색인이다 — 색인 파일을 따로 두면 666개 몫
// 1.4MB를 첫 프레임에 받아야 하는데 한 화면에 쓰는 것은 스물몇 개다.
//
// 텍스처는 영역마다 한 장(`tex/<set>.png`)이다. 반복(repeat) 때문에 아틀라스를
// 그대로 샘플링할 수 없으므로 **받은 뒤 잘라서** 각각 텍스처로 만든다.
import {
  BufferAttribute, BufferGeometry, ClampToEdgeWrapping, DataTexture, DoubleSide,
  FrontSide, LinearMipmapLinearFilter, MeshLambertMaterial, MirroredRepeatWrapping,
  NearestFilter, RepeatWrapping, SRGBColorSpace, type Material, type Texture,
} from 'three'
import { assets, readJson } from '../data/providers/assetProvider'
import { decodePng } from '../import/platinum/png'
import { markSeeThrough } from './fx/seeThrough'
import { retireTexture } from './retireTexture'

/** `chunks/index.json` — 파일 하나에 담긴 규격 */
interface ChunkFormat {
  posScale: number
  vertexBytes: number
  unitsPerTile: number
  count: number
}

interface ChunkMeta {
  verts: number
  indices: number
  materials: {
    tex: string | null, pal: string | null, rep: number, a: number, f: number,
    /**
     * 텍스처가 없는 재질의 확산색 (`diffAmb`). **텍스처가 있으면 없다** —
     * 그때는 텍스처가 색을 준다 (`import/platinum/chunks.ts`의 `packChunk`)
     */
    d?: [number, number, number],
  }[]
  /** [재질 번호, 색인 시작, 색인 개수] */
  submeshes: [number, number, number][]
}

export interface ChunkMesh {
  geometry: BufferGeometry
  /** 서브메시 순서와 같은 재질 목록 */
  materials: ChunkMeta['materials']
  groups: [number, number, number][]
}

interface SheetItem { tex: string, pal: string, x: number, y: number, w: number, h: number }
export interface TexSheet {
  width: number
  height: number
  items: SheetItem[]
  pixels: Uint8ClampedArray
}

const chunkCache = new Map<number, Promise<ChunkMesh>>()
const propCache = new Map<number, Promise<ChunkMesh>>()
const sheetCache = new Map<number, Promise<TexSheet>>()
const distPropCache = new Map<number, Promise<ChunkMesh>>()
const distPropSheetCache = new Map<number, Promise<TexSheet | null>>()
const propSheetCache = new Map<number, Promise<TexSheet | null>>()
const starterCache = new Map<number, Promise<ChunkMesh>>()
const starterSheetCache = new Map<number, Promise<TexSheet | null>>()
let format: Promise<ChunkFormat> | null = null

function loadChunkFormat(): Promise<ChunkFormat> {
  /**
   * ⚠️ **한 번 깨지면 영영 깨진 채로 남아 있었다.** 이 프로미스는 청크 전부가
   * 나눠 쓴다 — 처음 한 번이 어떤 까닭으로든 거절되면 그 뒤의 모든 청크 요청이
   * **다시 받아 보지도 못하고** 같은 거절을 물려받는다. 지형이 영영 안 서고
   * 새로고침 말고는 길이 없다. 깨진 것은 지워서 **다음 요청이 다시 받게** 한다
   */
  format ??= (readJson(assets(), 'data/chunks/index.json') as Promise<ChunkFormat>)
    .catch((e: unknown) => { format = null; throw e })
  return format
}

/**
 * 청크 하나.
 *
 * 정점 24바이트: pos i16×3 · pad · uv f32×2 · normal i8×3 · pad · color u8×3 · pad.
 * 좌표는 1/256 타일 단위로 담겨 있다 — 원본은 유닛(16유닛 = 한 타일)이지만
 * 추출기가 타일로 옮겨 둔다
 */
export function loadChunkMesh(index: number): Promise<ChunkMesh> {
  const hit = chunkCache.get(index)
  if (hit) return hit
  const promise = Promise.all([
    loadChunkFormat(),
    assets().bytes(`data/chunks/${String(index)}.bin`),
  ]).then(([fmt, buffer]) => build(buffer, fmt))
    .catch((e: unknown) => {
    // 지울 것은 **이 프로미스**다 — 늦게 깨진 앞엣것이 그 사이에 생긴
    // 새 요청을 지워 버리면 그 소비자들이 까닭 없이 다시 받게 된다
    if (chunkCache.get(index) === promise) chunkCache.delete(index)
    throw e
  })
  chunkCache.set(index, promise)
  return promise
}

function build(buffer: ArrayBuffer, fmt: ChunkFormat): ChunkMesh {
  const view = new DataView(buffer)
  const magic = String.fromCharCode(view.getUint8(0), view.getUint8(1), view.getUint8(2), view.getUint8(3))
  if (magic !== 'PT3C') throw new Error(`청크 파일이 아니다 (${magic})`)
  const metaLen = view.getUint32(4, true)
  const meta = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, metaLen))) as ChunkMeta
  const head = 8 + metaLen + ((4 - (metaLen % 4)) % 4)

  const n = meta.verts
  const stride = fmt.vertexBytes
  const position = new Float32Array(n * 3)
  const uv = new Float32Array(n * 2)
  const color = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    const o = head + i * stride
    for (let a = 0; a < 3; a++) position[i * 3 + a] = view.getInt16(o + a * 2, true) / fmt.posScale
    for (let a = 0; a < 2; a++) uv[i * 2 + a] = view.getFloat32(o + 8 + a * 4, true)
    for (let a = 0; a < 3; a++) color[i * 3 + a] = view.getUint8(o + 20 + a) / 255
  }
  const indices = new Uint16Array(buffer, head + n * stride, meta.indices)

  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(position, 3))
  geometry.setAttribute('uv', new BufferAttribute(uv, 2))
  geometry.setAttribute('color', new BufferAttribute(color, 3))
  geometry.setIndex(new BufferAttribute(new Uint16Array(indices), 1))
  // ⚠️ **롬 법선은 안 쓴다.** 파일에는 들어 있지만 라이팅에 못 쓸 값이다 —
  // 청크 0의 나무 600삼각형이 쓰는 법선이 (0,104,73)과 (0,127,0) 둘뿐이고
  // 둘 다 위를 본다. 원작 필드는 조명을 안 걸고 그리니까 그래도 됐지만, 우리는
  // 빛을 걸어서 나무 네 면이 전부 같은 밝기가 되고 결국 납작한 마름모로 보인다.
  //
  // 지오메트리에서 다시 계산하면 면마다 제 방향이 나온다. **평면 법선이 그대로
  // 나온다** — 이 모델은 사각형마다 정점 4개를 따로 갖고 있어서(정점 3226개 ÷
  // 삼각형 1628개 = 1.98) 이웃 면과 공유하는 정점이 없다. 부드럽게 뭉개질 자리가
  // 없으니 비인덱스로 펼 필요도 없다
  geometry.computeVertexNormals()
  // 서브메시마다 재질이 다르다. three는 그룹 순서대로 재질 배열을 쓴다
  meta.submeshes.forEach(([, start, count], i) => { geometry.addGroup(start, count, i) })
  geometry.computeBoundingSphere()

  return {
    geometry,
    materials: meta.submeshes.map(([mat]) => meta.materials[mat]!),
    groups: meta.submeshes,
  }
}

/**
 * 맵 소품(집·간판) 하나. 청크와 파일 형식이 같다.
 *
 * 소품은 청크 모델에 안 들어 있다 — 590개가 따로 있고 48바이트 배치 기록이
 * 번호와 자리를 준다
 */
export function loadPropMesh(index: number): Promise<ChunkMesh> {
  const hit = propCache.get(index)
  if (hit) return hit
  const promise = Promise.all([
    loadChunkFormat(),
    assets().bytes(`data/props/${String(index)}.bin`),
  ]).then(([fmt, buffer]) => build(buffer, fmt))
    .catch((e: unknown) => {
    // 지울 것은 **이 프로미스**다 — 늦게 깨진 앞엣것이 그 사이에 생긴
    // 새 요청을 지워 버리면 그 소비자들이 까닭 없이 다시 받게 된다
    if (propCache.get(index) === promise) propCache.delete(index)
    throw e
  })
  propCache.set(index, promise)
  return promise
}

/** 소품의 텍스처. 590개 중 22개는 자기 텍스처가 없어서 null이 온다 */
export function loadPropSheet(index: number): Promise<TexSheet | null> {
  const hit = propSheetCache.get(index)
  if (hit) return hit
  const promise = (readJson(assets(), 'data/props/index.json') as Promise<{ sheets: ({ w: number, h: number, items: [string, string, number, number, number, number][] } | null)[] }>)
    .then(async (idx) => {
      const info = idx.sheets[index]
      if (!info) return null
      return sheetFrom(`data/props/${String(index)}.png`, info)
    })
    .catch((e: unknown) => {
    // 지울 것은 **이 프로미스**다 — 늦게 깨진 앞엣것이 그 사이에 생긴
    // 새 요청을 지워 버리면 그 소비자들이 까닭 없이 다시 받게 된다
    if (propSheetCache.get(index) === promise) propSheetCache.delete(index)
    throw e
  })
  propSheetCache.set(index, promise)
  return promise
}

/**
 * 깨어진 세계의 소품 하나 (`/data/mmodel/fldeff.narc` 0x7C~0x94).
 *
 * 청크·건물 소품과 같은 `PT3C`다. 번호는 원작 소품 종류 번호 그대로다 —
 * 0 작은 발판 · 1 떠 있는 푸른 바위 · 22 덩굴꽃 · 23 바위 · 24 문
 */
export function loadDistortionPropMesh(kind: number): Promise<ChunkMesh> {
  const hit = distPropCache.get(kind)
  if (hit) return hit
  const promise = Promise.all([
    loadChunkFormat(),
    assets().bytes(`data/distortionProps/${String(kind)}.bin`),
  ]).then(([fmt, buffer]) => build(buffer, fmt))
    .catch((e: unknown) => {
    // 지울 것은 **이 프로미스**다 — 늦게 깨진 앞엣것이 그 사이에 생긴
    // 새 요청을 지워 버리면 그 소비자들이 까닭 없이 다시 받게 된다
    if (distPropCache.get(kind) === promise) distPropCache.delete(kind)
    throw e
  })
  distPropCache.set(kind, promise)
  return promise
}

/** 그 소품의 텍스처. 스물다섯 중 하나만 자기 것이 없다 */
export function loadDistortionPropSheet(kind: number): Promise<TexSheet | null> {
  const hit = distPropSheetCache.get(kind)
  if (hit) return hit
  const promise = (readJson(assets(), 'data/distortionProps/index.json') as Promise<{
    sheets: ({ w: number, h: number, items: [string, string, number, number, number, number][] } | null)[]
  }>)
    .then(async (idx) => {
      const info = idx.sheets[kind]
      if (!info) return null
      return sheetFrom(`data/distortionProps/${String(kind)}.png`, info)
    })
    .catch((e: unknown) => {
    // 지울 것은 **이 프로미스**다 — 늦게 깨진 앞엣것이 그 사이에 생긴
    // 새 요청을 지워 버리면 그 소비자들이 까닭 없이 다시 받게 된다
    if (distPropSheetCache.get(kind) === promise) distPropSheetCache.delete(kind)
    throw e
  })
  distPropSheetCache.set(kind, promise)
  return promise
}

/**
 * 종류마다의 자리 보정 (`sPropInitialPosOffsetByKind`), 타일 단위.
 *
 * 원작이 칸 한가운데(`+0.5`)에 이 값을 더해 소품을 세운다. 빼먹으면 발판이
 * 한 칸 위에 떠서 사람이 그 속을 걷는다 (`tools/extract/distortionProps.js`)
 */
export function loadDistortionPropOffsets(): Promise<readonly (readonly number[])[]> {
  return (readJson(assets(), 'data/distortionProps/index.json') as Promise<{
    offsets: number[][]
  }>).then((idx) => idx.offsets)
}

/**
 * 파트너 고르는 장면의 모델 하나 (`graphic/ev_pokeselect.narc`).
 *
 * 소품·청크와 파일 형식이 같다. 번호는 원작 NARC 칸 번호 그대로다 —
 * 1 덮인 가방 · 8 열린 가방 · 3·5·7 몬스터볼 · 9 바닥
 */
export function loadStarterMesh(index: number): Promise<ChunkMesh> {
  const hit = starterCache.get(index)
  if (hit) return hit
  const promise = Promise.all([
    loadChunkFormat(),
    assets().bytes(`data/starter/${String(index)}.bin`),
  ]).then(([fmt, buffer]) => build(buffer, fmt))
    .catch((e: unknown) => {
    // 지울 것은 **이 프로미스**다 — 늦게 깨진 앞엣것이 그 사이에 생긴
    // 새 요청을 지워 버리면 그 소비자들이 까닭 없이 다시 받게 된다
    if (starterCache.get(index) === promise) starterCache.delete(index)
    throw e
  })
  starterCache.set(index, promise)
  return promise
}

/** 그 모델의 텍스처. 여섯 개가 다 자기 것을 갖고 있다 */
export function loadStarterSheet(index: number): Promise<TexSheet | null> {
  const hit = starterSheetCache.get(index)
  if (hit) return hit
  const promise = (readJson(assets(), 'data/starter/index.json') as Promise<{
    sheets: Record<string, { w: number, h: number, items: [string, string, number, number, number, number][] } | null>
  }>)
    .then(async (idx) => {
      const info = idx.sheets[String(index)]
      if (!info) return null
      return sheetFrom(`data/starter/${String(index)}.png`, info)
    })
    .catch((e: unknown) => {
    // 지울 것은 **이 프로미스**다 — 늦게 깨진 앞엣것이 그 사이에 생긴
    // 새 요청을 지워 버리면 그 소비자들이 까닭 없이 다시 받게 된다
    if (starterSheetCache.get(index) === promise) starterSheetCache.delete(index)
    throw e
  })
  starterSheetCache.set(index, promise)
  return promise
}

/**
 * 그림 한 장을 **픽셀로** 펴 놓는다 — GPU를 안 거친다.
 *
 * ⚠️ **`createImageBitmap` + 캔버스 길로 가면 안 된다.** 그 길은 GPU 프로세스에서
 * 그림을 풀고 결과를 GPU에 얹으므로, 캔버스로 옮겨 `getImageData`로 읽는 순간
 * **그리는 중인 GPU와 동기를 맞추며 기다린다.** 맵을 한 번 넘을 때 시트 스물넷이
 * 그 길로 가고 실측으로 디코딩만 3.29초였다 — 그림은 다 256×480 아래인데도 한
 * 장에 최대 380ms다. 그동안 `renderer.render()` 한 번이 4.9초가 된다
 * (`.audit/probe/warpGpu.mjs`). 우리 PNG는 8비트 RGBA 한 꼴이라 바로 푼다
 */
async function pixelsOf(path: string): Promise<{
  width: number
  height: number
  pixels: Uint8ClampedArray
}> {
  return decodePng(new Uint8Array(await assets().bytes(path)))
}

async function sheetFrom(
  path: string,
  info: { w: number, h: number, items: [string, string, number, number, number, number][] },
): Promise<TexSheet> {
  const got = await pixelsOf(path)
  return {
    width: got.width,
    height: got.height,
    items: info.items.map(([tex, pal, x, y, w, h]) => ({ tex, pal, x, y, w, h })),
    pixels: got.pixels,
  }
}

/** 영역 텍스처 한 장. 받은 뒤 조각내야 하므로 픽셀까지 들고 온다 */
export function loadTexSheet(set: number): Promise<TexSheet> {
  const hit = sheetCache.get(set)
  if (hit) return hit
  const promise = Promise.all([
    readJson(assets(), 'data/tex/index.json') as Promise<{
      sets: { w: number, h: number, items: [string, string, number, number, number, number][] }[]
    }>,
    pixelsOf(`data/tex/${String(set)}.png`),
  ]).then(([index, got]) => {
    const info = index.sets[set]
    if (!info) throw new Error(`텍스처 묶음 ${set}이 없다`)
    return {
      width: got.width,
      height: got.height,
      items: info.items.map(([tex, pal, x, y, w, h]) => ({ tex, pal, x, y, w, h })),
      pixels: got.pixels,
    }
  }).catch((e: unknown) => {
    // 지울 것은 **이 프로미스**다 — 늦게 깨진 앞엣것이 그 사이에 생긴
    // 새 요청을 지워 버리면 그 소비자들이 까닭 없이 다시 받게 된다
    if (sheetCache.get(set) === promise) sheetCache.delete(set)
    throw e
  })
  sheetCache.set(set, promise)
  return promise
}

/** `rep` 비트 → three의 래핑 모드. 뒤집기가 서면 거울 반복이다 */
function wrap(repeat: boolean, flip: boolean) {
  if (!repeat) return ClampToEdgeWrapping
  return flip ? MirroredRepeatWrapping : RepeatWrapping
}

/**
 * 시트에서 텍스처 하나를 잘라 낸다.
 *
 * `NearestFilter`인 이유: 원본이 16×16짜리 도트다. 선형 보간을 걸면 타일 경계가
 * 번지면서 4세대 특유의 또렷함이 사라진다
 */
export function sliceTexture(sheet: TexSheet, item: SheetItem, rep: number): Texture {
  const out = new Uint8Array(item.w * item.h * 4)
  for (let y = 0; y < item.h; y++) {
    const from = ((item.y + y) * sheet.width + item.x) * 4
    out.set(sheet.pixels.subarray(from, from + item.w * 4), y * item.w * 4)
  }
  const texture = new DataTexture(out, item.w, item.h)
  // 이름은 **GPU 라벨로 그대로 간다** — three가 `texture.name`을 쓴다
  // (`WebGPUTextureUtils`). 안 붙이면 드라이버 오류가 `unlabeled`라고만 말해서
  // 임자를 못 짚는다 (REPAIR §48)
  texture.name = `chunk-slice ${String(item.w)}x${String(item.h)}`
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = wrap((rep & 1) !== 0, (rep & 4) !== 0)
  texture.wrapT = wrap((rep & 2) !== 0, (rep & 8) !== 0)
  texture.magFilter = NearestFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.generateMipmaps = true
  texture.anisotropy = 4
  texture.needsUpdate = true
  return texture
}

/**
 * 그림이 **중간 알파**를 쓰는가 — 0도 255도 아닌 값이 하나라도 있는가.
 *
 * ⚠️ **폴리곤 알파만 보면 안 된다.** DS는 텍스처 자체가 알파를 나르는 형식
 * (A3I5·A5I3)을 쓰고, 그때는 폴리곤 알파가 31(불투명)이어도 하드웨어가 텍셀마다
 * 섞는다. 우리는 폴리곤 알파만 보고 `alphaTest: 0.5`로 잘랐다 — 천관산 빛기둥
 * (`dun_light`)은 알파 최댓값이 **123**이라 통째로 잘려 나갔고, 그 뒤의 천장
 * 구멍 판만 흰 판때기로 남았다.
 *
 * 실측으로 청크 그림 2,736개 중 39개, 소품 1,102개 중 40개가 여기 걸린다.
 * 이름을 보면 무엇인지 분명하다: `lake`·`puddle`·`dun_light`·`bf_light`·
 * `c1_lamp01`·`kemuri`(연기)·`mag_smoke01`·`taki_top`(폭포)·`c09_ice`·
 * `warp1b`. 전부 **섞어야 하는 것**이다
 */
export function softAlpha(pixels: ArrayLike<number>): boolean {
  for (let i = 3; i < pixels.length; i += 4) {
    const a = pixels[i]!
    if (a !== 0 && a !== 255) return true
  }
  return false
}

/**
 * 재질 하나.
 *
 * 알파 31이 불투명이다. 그보다 낮으면 반투명 판(물·그림자)이고, 깊이 쓰기를
 * 끄지 않으면 뒤에 있는 것이 통째로 사라진다
 */
/**
 * 이 재질이 **제 그림을 제 것으로 들고 있다**고 표시한다.
 *
 * ⚠️ **`sliceTexture`는 부를 때마다 새 `DataTexture`를 만든다.** 나눠 쓰는 것은
 * 묶음 그림(`TexSheet`)이지 잘라 낸 조각이 아니다. 그런데 `Material.dispose()`는
 * `map`을 안 버리므로, 버리는 쪽이 「이 그림도 내 것인가」를 알아야 한다 —
 * 다른 데서 온 그림을 문 재질도 있어서(소품 띠는 `cachedBack`이 든 것을 나눠
 * 쓴다) **표시가 있는 것만** 버린다
 */
export function ownMap(m: Material): Material {
  if ((m as { map?: Texture | null }).map != null) m.userData.ownsMap = true
  return m
}

/**
 * 재질 하나와 **그 재질이 제 것이라고 표시한 그림**을 버린다.
 *
 * ⚠️ **표시가 없는 그림은 남긴다.** 나눠 쓰는 것을 버리면 다음 배치가 빈
 * 그림을 문다
 */
/**
 * ⚠️ **그림은 미뤄서 버린다** — 그 자리에서 버리면 제출 중인 프레임이 문다
 * (`scene/retireTexture`)
 */
export function dropMaterial(m: Material): void {
  if (m.userData.ownsMap === true) {
    const map = (m as { map?: Texture | null }).map
    if (map) retireTexture(map)
  }
  m.dispose()
}


export function makeMaterial(
  spec: ChunkMeta['materials'][number], texture: Texture | null, doubleSided = false,
): Material {
  const data = (texture as DataTexture | null)?.image as { data?: Uint8Array } | undefined
  const translucent = spec.a < 31 || (data?.data !== undefined && softAlpha(data.data))
  const made = new MeshLambertMaterial({
    // 화면에 뜬 판때기가 무엇인지 **씬에 직접 물어보기 위해서다**(`pnpm shot --hit`).
    // 그림만 보고는 지형인지 소품인지 옆면인지 못 가른다 — 실제로 흰 판때기 하나를
    // 두 맵에서 보고도 무엇인지 몰라 손을 못 댔다. three가 무시하는 표시라 값이 없다
    name: spec.tex ?? '(그림 없음)',
    map: texture,
    // ⚠️ **텍스처가 없는 재질은 확산색이 유일한 색이다.** 정점색이 흰색
    // 하나뿐이라 이걸 안 곱하면 그림자(`kage`·`shade`, 확산 (0,0,0))가
    // 화면에 **흰 안개**로 깔린다. 텍스처가 있으면 `d`가 아예 없다
    ...(spec.d ? { color: (spec.d[0] << 16) | (spec.d[1] << 8) | spec.d[2] } : {}),
    vertexColors: true,
    // 4세대 텍스처는 색 0을 투명으로 쓴다. 알파 테스트로 잘라 내야 나무·풀이
    // 사각형으로 안 보인다 — 다만 그림이 알파를 **번지게** 쓰면 자를 것이 아니라
    // 섞을 것이다(`softAlpha`)
    alphaTest: translucent ? 0 : 0.5,
    transparent: translucent,
    opacity: spec.a / 31,
    depthWrite: !translucent,
    // 원작은 카메라가 한쪽에서만 보므로 **뒷면을 안 만든다.** 집은 앞·좌·우·지붕만
    // 있고 뒷벽이 없고(주인공 집 219삼각형에 `0,0,-1` 법선이 0개), 풀·울타리는
    // 판 한 장이다. 1인칭으로 돌아가면 그게 통째로 사라져 구멍이 뚫린다.
    // 양면으로 그리면 뒤에서 봐도 막힌 것으로 보인다 — three가 뒷면의 법선을
    // 뒤집어 주므로 빛도 제대로 받는다
    side: spec.f === 3 || doubleSided ? DoubleSide : FrontSide,
  })
  // 깊이를 안 쓰는 면은 윤곽 후처리에 알려 준다 — 안 그러면 이 면을 **투과해서**
  // 뒤에 있는 것의 실루엣이 선으로 그려진다 (`fx/seeThrough`)
  markSeeThrough(made, translucent)
  return made
}

/**
 * 이 재질이 **그림자를 던져도 되는가**.
 *
 * ⚠️ **three는 알파를 섞는 면도 통째로 불투명한 그림자를 만든다.** 깊이 재질이
 * 가져가는 것은 `alphaTest`와 `map`뿐이라, `alphaTest: 0`으로 섞는 면은
 * 텍셀 알파와 상관없이 그림자에 꽉 찬 실루엣으로 찍힌다 — 천관산 빛기둥
 * (`dun_light`)이 바닥에 **검은 자국**을 남기고 있었다
 */
export function castsShadow(material: Material): boolean {
  const m = material as Material & { transparent?: boolean, alphaTest?: number }
  return !(m.transparent === true && (m.alphaTest ?? 0) === 0)
}

/**
 * 한 기하를 **그림자를 던지는 쪽과 안 던지는 쪽**으로 가른다.
 *
 * `castShadow`는 오브젝트마다라 재질 무리별로 끌 수가 없다. 그래서 메시를
 * 둘로 나눈다 — 정점과 색인은 **그대로 나눠 쓰고** 무리만 갈라 담으므로
 * GPU 버퍼가 늘지 않고, three가 무리마다 한 콜을 내므로 **드로우콜도 그대로**다.
 *
 * ⚠️ **여기서 나온 기하는 버리지 마라.** 정점 버퍼를 원본과 나눠 쓰기 때문에
 * `dispose()`하면 아직 쓰는 원본의 버퍼까지 없앤다. 버리는 것은 원본 하나다.
 *
 * 섞는 무리가 없으면 `soft`가 `null`이고 `solid`는 원본 그대로다 — 대부분의
 * 청크가 그렇다
 */
/**
 * 갈라 놓은 것을 **원본 옆에 둔다.**
 *
 * ⚠️ **배치마다 다시 갈라내고 있었다.** 부르는 쪽이
 * `useMemo(() => splitShadow(geometry, materials), [geometry, materials])`인데
 * `materials`가 **배치마다 새 배열**이라 기억이 한 번도 안 맞았다. 그런데 여기서
 * 나온 기하는 위 설명대로 **버릴 수가 없다**(정점 버퍼를 원본과 나눠 쓴다) —
 * 그러니 만든 만큼 그대로 쌓인다. 실측(2026-09-09 `_land42`, 맵 3↔6 열여덟 번):
 * 이 자리에서 **1,116개**가 태어나 **한 개도 안 버려졌고**, 그동안 렌더러가 세는
 * 기하가 바퀴마다 51개씩 곧게 올랐다.
 *
 * 원본 기하는 `chunkCache`가 붙잡고 있으므로 그 옆에 매달아 둔다 — 원본이
 * 사라지면 같이 사라지고, 살아 있는 동안은 **한 벌만 있다.** 무리를 가르는 기준은
 * 재질의 **신원이 아니라 내용**(`castsShadow`)이라, 같은 그림을 다시 구워도 같은
 * 자리에서 갈린다. 그 갈래를 열쇠로 삼는다
 */
const splitCache = new WeakMap<BufferGeometry, Map<string, {
  solid: BufferGeometry, soft: BufferGeometry | null
}>>()

export function splitShadow(
  geometry: BufferGeometry, materials: readonly Material[],
): { solid: BufferGeometry, soft: BufferGeometry | null } {
  const groups = geometry.groups
  const mask = groups
    .map((g) => (materials[g.materialIndex ?? 0] !== undefined
      && !castsShadow(materials[g.materialIndex ?? 0]!) ? '1' : '0')).join('')
  let byMask = splitCache.get(geometry)
  if (byMask === undefined) { byMask = new Map(); splitCache.set(geometry, byMask) }
  const hit = byMask.get(mask)
  if (hit !== undefined) return hit
  const made = splitShadowNow(geometry, materials)
  byMask.set(mask, made)
  return made
}

/**
 * 원본과 **그 파생 기하를 함께 놓는다** (후속 §5).
 *
 * ⚠️ **WeakMap이 수거되는 것은 GPU 해제가 아니다.** `splitShadow`가 만든
 * `solid`/`soft`는 원본과 attribute·index를 **나눠 쓰는 별개의
 * `BufferGeometry`**고, three는 렌더러에 등록된 기하마다 자원을 들고 있다가
 * `dispose` 사건에 놓는다. 자바스크립트 쪽 참조가 사라져도 그 사건은 안 난다 —
 * 실측(2026-09-08 `_land42`): 18전환에 `splitShadow` 기하 1,116개가 태어나
 * **0개가 놓였다.** WeakMap 재사용으로 태어나는 수를 1,116→198로 줄였지만
 * 놓는 자는 여전히 없었고, 그것이 남은 전환당 5~6개다.
 *
 * ⚠️ **나눠 쓰는 원본이 살아 있으면 부르면 안 된다.** 파생을 놓으면 원본과
 * 같은 attribute의 GPU 버퍼가 함께 풀린다 — 그래서 **원본을 소유한 쪽만**,
 * 원본을 버리는 바로 그 자리에서 부른다 (`ChunkModels`의 배치 정리).
 * 공유 보관함(`chunkCache`·`mergedPropCache`)의 기하에는 안 부른다.
 *
 * ⚠️ **`soft`가 없으면 `solid`는 원본 그 자체다** — 두 번 놓지 않는다
 */
export function releaseSplit(source: BufferGeometry | null | undefined): void {
  if (source === null || source === undefined) return
  const byMask = splitCache.get(source)
  if (byMask === undefined) return
  splitCache.delete(source)
  for (const made of byMask.values()) {
    if (made.solid !== source) made.solid.dispose()
    made.soft?.dispose()
  }
}

function splitShadowNow(
  geometry: BufferGeometry, materials: readonly Material[],
): { solid: BufferGeometry, soft: BufferGeometry | null } {
  const groups = geometry.groups
  const soft = groups.filter((g) => materials[g.materialIndex ?? 0] !== undefined
    && !castsShadow(materials[g.materialIndex ?? 0]!))
  if (soft.length === 0) return { solid: geometry, soft: null }
  const share = (keep: typeof groups): BufferGeometry => {
    const made = new BufferGeometry()
    for (const [name, attribute] of Object.entries(geometry.attributes)) {
      made.setAttribute(name, attribute)
    }
    if (geometry.index) made.setIndex(geometry.index)
    made.boundingBox = geometry.boundingBox
    made.boundingSphere = geometry.boundingSphere
    for (const g of keep) made.addGroup(g.start, g.count, g.materialIndex)
    return made
  }
  const hard = groups.filter((g) => !soft.includes(g))
  return { solid: share(hard), soft: share(soft) }
}
