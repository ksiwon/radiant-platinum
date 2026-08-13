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

/** `chunks/index.json` — 파일 하나에 담긴 규격 */
export interface ChunkFormat {
  posScale: number
  vertexBytes: number
  unitsPerTile: number
  count: number
}

interface ChunkMeta {
  verts: number
  indices: number
  materials: { tex: string | null, pal: string | null, rep: number, a: number, f: number }[]
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

export function loadChunkFormat(): Promise<ChunkFormat> {
  // 주소를 만들지 않는다 — 공개판에서 이 자료는 OPFS에서 온다 (IMPORT.md §7)
  format ??= readJson(assets(), 'data/chunks/index.json') as Promise<ChunkFormat>
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
    .catch((e: unknown) => { chunkCache.delete(index); throw e })
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
    .catch((e: unknown) => { propCache.delete(index); throw e })
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
    .catch((e: unknown) => { propSheetCache.delete(index); throw e })
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
    .catch((e: unknown) => { distPropCache.delete(kind); throw e })
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
    .catch((e: unknown) => { distPropSheetCache.delete(kind); throw e })
  distPropSheetCache.set(kind, promise)
  return promise
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
    .catch((e: unknown) => { starterCache.delete(index); throw e })
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
    .catch((e: unknown) => { starterSheetCache.delete(index); throw e })
  starterSheetCache.set(index, promise)
  return promise
}

async function sheetFrom(
  path: string,
  info: { w: number, h: number, items: [string, string, number, number, number, number][] },
): Promise<TexSheet> {
  // ⚠️ Blob URL을 만들었다 거두는 왕복을 안 한다 — `createImageBitmap`은 Blob을
  // 그대로 받으므로 주소가 낄 자리가 없다 (IMPORT.md §7)
  const blob = await assets().blob(path)
  const bitmap = await createImageBitmap(blob)
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2D 컨텍스트를 못 얻었다')
  ctx.drawImage(bitmap, 0, 0)
  return {
    width: bitmap.width,
    height: bitmap.height,
    items: info.items.map(([tex, pal, x, y, w, h]) => ({ tex, pal, x, y, w, h })),
    pixels: ctx.getImageData(0, 0, bitmap.width, bitmap.height).data,
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
    assets().blob(`data/tex/${String(set)}.png`).then((b) => createImageBitmap(b)),
  ]).then(([index, bitmap]) => {
    const info = index.sets[set]
    if (!info) throw new Error(`텍스처 묶음 ${set}이 없다`)
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('2D 컨텍스트를 못 얻었다')
    ctx.drawImage(bitmap, 0, 0)
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
    return {
      width: bitmap.width,
      height: bitmap.height,
      items: info.items.map(([tex, pal, x, y, w, h]) => ({ tex, pal, x, y, w, h })),
      pixels: data.data,
    }
  }).catch((e: unknown) => { sheetCache.delete(set); throw e })
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
export function makeMaterial(
  spec: ChunkMeta['materials'][number], texture: Texture | null, doubleSided = false,
): Material {
  const data = (texture as DataTexture | null)?.image as { data?: Uint8Array } | undefined
  const translucent = spec.a < 31 || (data?.data !== undefined && softAlpha(data.data))
  return new MeshLambertMaterial({
    // 화면에 뜬 판때기가 무엇인지 **씬에 직접 물어보기 위해서다**(`pnpm shot --hit`).
    // 그림만 보고는 지형인지 소품인지 옆면인지 못 가른다 — 실제로 흰 판때기 하나를
    // 두 맵에서 보고도 무엇인지 몰라 손을 못 댔다. three가 무시하는 표시라 값이 없다
    name: spec.tex ?? '(그림 없음)',
    map: texture,
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
}

/**
 * 시트 한 장을 통째로 텍스처로.
 *
 * 빠진 면을 채운 판(`shell.ts`)이 쓴다. 소품 하나에 재질이 중앙값 2개·최대 13개라
 * 재질마다 판을 따로 그리면 드로우콜이 그만큼 늘어난다. 대신 판의 UV를 **아틀라스
 * 좌표로 고쳐 쓰고** 시트 한 장을 물리면 판 전체가 드로우콜 하나다.
 *
 * `ClampToEdgeWrapping`이어야 한다 — 반복으로 두면 이웃 그림이 새어 들어온다.
 * 필터도 최근접이다. 선형이면 아틀라스 경계에서 옆 그림 색이 번진다
 */
export function sheetTexture(sheet: TexSheet): Texture {
  const texture = new DataTexture(
    new Uint8Array(sheet.pixels.buffer.slice(0)), sheet.width, sheet.height,
  )
  texture.colorSpace = SRGBColorSpace
  texture.wrapS = ClampToEdgeWrapping
  texture.wrapT = ClampToEdgeWrapping
  texture.magFilter = NearestFilter
  texture.minFilter = NearestFilter
  texture.generateMipmaps = false
  texture.needsUpdate = true
  return texture
}
