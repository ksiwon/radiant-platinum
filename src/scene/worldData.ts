// 월드 데이터 fetch (DATA.md §3.2)
//
// 시작할 때 받는 것: maps.json(헤더 표) · events.json(워프) · 행렬 0(오버월드).
// 실내는 첫 워프 때 한 번만 받는다 — 269개를 이어 붙여 1.33MB이고 압축하면 20KB대라
// 행렬마다 따로 두는 것(파일 500개 + 문 열 때마다 왕복)보다 낫다.
import { MapGrid, type MatrixMeta } from '../engine/map/grid'
import { sealFloor, type FloorCover } from '../engine/map/floorSeal'
import { CANALAVE_GYM_MAP } from '../engine/world/canalaveGym'
import { ETERNA_GYM_MAP } from '../engine/world/eternaGym'
import { HEARTHOME_ENTRANCE_ROOM, HEARTHOME_TRAINER_ROOMS } from '../engine/world/hearthomeGym'
import { PASTORIA_GYM_MAP } from '../engine/world/pastoriaGym'
import { SUNYSHORE_GYM_MAPS } from '../engine/world/sunyshoreGym'
import { VEILSTONE_GYM_MAP } from '../engine/world/veilstoneGym'
import { MAP as DISTORTION_MAP } from '../engine/world/distortion'

/**
 * **여기는 안 막는다** — 통행이나 높이를 장치가 따로 쥐는 방들이다
 * (`engine/world/mapFeatures`의 `MAP_FEATURE`).
 *
 * 운하시티 체육관은 `CheckCollision`이 늘 답을 내고 층마다 딴 32×32 표를 보며
 * **바닥이 아예 없다** — 뜨는 판 스물넷 위로만 다닌다. 깨어진 세계는 발판이 곧
 * 지면이고 그 높이는 지형이 아니라 들고 다니는 상태다. 들판시티 체육관은
 * 물바닥을 판으로 얹는다. 그런 방에서 「그린 것이 없다」는 결함이 아니라
 * 설계라, 격자로 막으면 그 방이 통째로 못 쓰게 된다
 */
const SEAL_SKIP_MAPS: ReadonlySet<number> = new Set<number>([
  CANALAVE_GYM_MAP, ETERNA_GYM_MAP, HEARTHOME_ENTRANCE_ROOM, ...HEARTHOME_TRAINER_ROOMS,
  PASTORIA_GYM_MAP, VEILSTONE_GYM_MAP, ...SUNYSHORE_GYM_MAPS,
  ...Object.values(DISTORTION_MAP),
])
import { spawnTable, type SpawnPoint } from '../engine/map/spawns'
import { heightField, type HeightData } from '../engine/map/height'
import { world, type AreaData, type EventFile, type MapHeader } from '../engine/map/world'
import { encounters } from '../engine/battle/encounterSystem'
import { loadNpcSprites, type NpcSprite } from '../engine/actor/sprites'
import { assets, readJson } from '../data/providers/assetProvider'
import { gameLocale } from '../state/optionsStore'
import type { EncountersEx, EncounterTable } from '../engine/battle/encounter'

// 주소를 만들지 않는다 — 공개판에서 이 자료는 OPFS에서 온다 (IMPORT.md §7)
async function json<T>(path: string): Promise<T> {
  return await readJson(assets(), `data/${path}`) as T
}

function bytes(path: string): Promise<ArrayBuffer> {
  return assets().bytes(`data/${path}`)
}

/** 행렬 격자 캐시. 한 번 만든 것은 버리지 않는다 — 실내는 작고 재방문이 잦다 */
const grids = new Map<number, MapGrid>()

/**
 * 「발밑에 그려진 것이 있는가」 표 (`engine/map/floorSeal`).
 *
 * ⚠️ **격자를 만들기 전에 있어야 한다.** 충돌은 스트리밍을 기다리면 안 된다
 * (`engine/map/grid` 머리말) — 청크 하나가 늦게 오면 그 자리가 잠깐 뚫린다.
 * 그래서 청크 메시가 아니라 **한 파일로 구운 비트**를 처음에 통째로 받는다
 * (85KB · brotli로 훨씬 준다)
 */
let floorCover: FloorCover | null = null

/** 그 행렬 위 워프·사람·간판·트리거 칸. 여기는 바닥이 없어도 안 막는다 */
function eventTilesOf(matrix: number): [number, number][] {
  const out: [number, number][] = []
  for (const h of world.maps ?? []) {
    if (h.matrix !== matrix) continue
    const f = world.events?.[String(h.events)]
    if (!f) continue
    for (const w of f.warps) out.push([w.x, w.z])
    for (const n of f.npcs) out.push([n.x, n.z])
    for (const g of f.signs) out.push([g.x, g.z])
    for (const t of f.triggers) out.push([t.x, t.z])
  }
  return out
}

/** 그린 것이 없는 칸을 막는다. 장치가 쥐는 방은 건드리지 않는다 */
function seal(meta: MatrixMeta, tiles: Uint16Array): void {
  if (!floorCover) return
  const skip = (world.maps ?? []).some((h) => h.matrix === meta.id && SEAL_SKIP_MAPS.has(h.id))
  if (skip) return
  sealFloor(meta, tiles, floorCover, eventTilesOf(meta.id), heightField.data ?? undefined)
}

interface InteriorIndex {
  byteLength: number
  matrices: Record<string, MatrixMeta & { byteOffset: number }>
}
let interiors: InteriorIndex | null = null
let interiorBlob: ArrayBuffer | null = null
let interiorLoad: Promise<void> | null = null

/** `bdhc.json`의 모양. 좌표와 색인은 `bdhc.bin`에 따로 있다 */
interface BdhcFile {
  plateCount: number
  fixedPerTile: number
  planes: [number, number, number, number][]
  chunks: [number, number][]
}

/**
 * 높이 메타와 바이너리를 붙인다.
 *
 * `bdhc.bin`은 좌표(int32 × 4 × 판)를 먼저, 평면 색인(u16 × 판)을 뒤에 담는다.
 * 앞이 4의 배수라 u16 뷰의 정렬이 맞는다 — 크기가 안 맞으면 둘 중 하나가
 * 낡은 것이므로 여기서 죽는 편이 조용히 엉뚱한 높이를 내는 것보다 낫다
 */
function bindHeights(meta: BdhcFile, blob: ArrayBuffer): HeightData {
  const want = meta.plateCount * 16 + meta.plateCount * 2
  if (blob.byteLength !== want) {
    throw new Error(`높이 데이터 크기 불일치: ${blob.byteLength}B ≠ ${want}B`)
  }
  return {
    planes: meta.planes,
    chunks: meta.chunks,
    coords: new Int32Array(blob, 0, meta.plateCount * 4),
    refs: new Uint16Array(blob, meta.plateCount * 16, meta.plateCount),
    fixedPerTile: meta.fixedPerTile,
  }
}

export interface WorldBoot {
  overworld: MapGrid
  spawn: { x: number; z: number; map: number }
  /** 지역명 126개. 맵 헤더의 label로 색인한다 */
  locationNames: string[]
}

/** 시작 데이터. world 싱글톤을 채우고 오버월드 격자를 돌려준다 */
export async function bootWorld(): Promise<WorldBoot> {
  const [
    mapsFile, eventsFile, encFile, exFile, locationNames, meta, bin, bdhcMeta, bdhcBin,
    sprites, spawnFile, coverBin, chunkIndex, propIndex,
  ] =
    await Promise.all([
      json<{ maps: MapHeader[], areas: AreaData[] }>('maps.json'),
      json<{ events: Record<string, EventFile> }>('events.json'),
      json<{ tables: EncounterTable[] }>('encounters.json'),
      // 날마다 바뀌는 것들 (PARITY §6.11). 3.5KB고 빈티나 칸은 첫 낚시부터
      // 필요하다 — 미루면 그 한 번이 조용히 "없는 칸"으로 지나간다
      json<EncountersEx>('encountersEx.json'),
      // ⚠️ **설치된 언어로 읽는다.** 여기가 `ko`로 박혀 있었고, 그래서
      // 영어 롬으로 설치하면 오버월드가 이 파일을 못 찾고 통째로 죽었다 —
      // 화면이 새까매져서 "무엇이 없다"조차 안 보였다 (브라우저 실측 ㉑가 잡았다)
      json<string[]>(`names/locations.${gameLocale()}.json`),
      json<MatrixMeta>('matrices/0.json'),
      bytes('matrices/0.bin'),
      // 높이는 land_data 청크 단위라 실내에도 같은 표를 쓴다. 28.5KB(brotli)라
      // 실내처럼 미루지 않고 처음에 받는다 — 첫 걸음부터 지면을 따라가야 한다
      json<BdhcFile>('bdhc.json'),
      bytes('bdhc.bin'),
      // NPC 그림표. 33KB고 사람이 서 있어야 첫 화면이 완성되므로 미루지 않는다.
      // 그림(PNG)은 서 있는 사람 것만 그때그때 받는다
      json<Record<string, NpcSprite>>('npcSprites.json'),
      // 부활 지점·공중날기 자리 20개. 1KB도 안 되고 전멸은 첫 배틀부터 날 수 있다
      json<{ spawns: SpawnPoint[] }>('spawns.json'),
      // 발밑에 그려진 것이 있는가 — 85KB. 격자를 만들기 **전에** 있어야 한다
      bytes('chunks/cover.bin'),
      json<{ posScale: number }>('chunks/index.json'),
      json<{ boxes: ([number, number, number, number] | null)[] }>('props/index.json'),
    ])
  world.maps = mapsFile.maps
  world.areas = mapsFile.areas
  world.events = eventsFile.events
  encounters.tables = encFile.tables
  encounters.ex = exFile
  heightField.data = bindHeights(bdhcMeta, bdhcBin)
  loadNpcSprites(sprites)
  spawnTable.list = spawnFile.spawns
  floorCover = {
    bits: new Uint8Array(coverBin), boxes: propIndex.boxes, posScale: chunkIndex.posScale,
  }
  const owTiles = new Uint16Array(bin)
  seal(meta, owTiles)
  const grid = new MapGrid(meta, owTiles)
  grids.set(0, grid)
  if (!meta.spawn) throw new Error('오버월드 메타에 스폰이 없다')
  return { overworld: grid, spawn: meta.spawn, locationNames }
}

function loadInteriors(): Promise<void> {
  if (!interiorLoad) {
    interiorLoad = Promise.all([
      json<InteriorIndex>('matrices/interiors.json'),
      bytes('matrices/interiors.bin'),
    ]).then(([idx, blob]) => {
      if (blob.byteLength !== idx.byteLength) {
        throw new Error(`실내 격자 크기 불일치: ${blob.byteLength}B ≠ ${idx.byteLength}B`)
      }
      interiors = idx
      interiorBlob = blob
    })
  }
  return interiorLoad
}

/** 행렬 격자. 실내는 처음 요청될 때 통째로 받아 온다 */
export async function gridFor(matrixId: number): Promise<MapGrid> {
  const hit = grids.get(matrixId)
  if (hit) return hit
  await loadInteriors()
  const meta = interiors!.matrices[String(matrixId)]
  if (!meta) throw new Error(`행렬 ${matrixId}이 실내 색인에 없다`)
  const count = meta.tileWidth * meta.tileHeight
  // byteOffset이 2의 배수라도 Uint16Array는 뷰를 얹을 때 정렬을 요구한다.
  // 추출기가 u16 격자만 이어 붙이므로 항상 짝수지만, 아니면 여기서 죽는 편이 낫다
  //
  // ⚠️ **뷰는 통짜 버퍼를 가리킨다.** 막은 것을 여기에 그대로 쓰면 다음에 같은
  // 행렬을 다시 열 때 두 번 막히는데, 막는 것은 멱등이라(이미 선 비트를 또
  // 세울 뿐) 문제가 없다. 사본을 뜨면 실내 269개가 두 벌이 된다
  const tiles = new Uint16Array(interiorBlob!, meta.byteOffset, count)
  seal(meta, tiles)
  const grid = new MapGrid(meta, tiles)
  grids.set(matrixId, grid)
  return grid
}
