// 월드 데이터 fetch (DATA.md §3.2)
//
// 시작할 때 받는 것: maps.json(헤더 표) · events.json(워프) · 행렬 0(오버월드).
// 실내는 첫 워프 때 한 번만 받는다 — 269개를 이어 붙여 1.33MB이고 압축하면 20KB대라
// 행렬마다 따로 두는 것(파일 500개 + 문 열 때마다 왕복)보다 낫다.
import { MapGrid, type MatrixMeta } from '../engine/map/grid'
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
    sprites, spawnFile,
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
    ])
  world.maps = mapsFile.maps
  world.areas = mapsFile.areas
  world.events = eventsFile.events
  encounters.tables = encFile.tables
  encounters.ex = exFile
  heightField.data = bindHeights(bdhcMeta, bdhcBin)
  loadNpcSprites(sprites)
  spawnTable.list = spawnFile.spawns
  const grid = new MapGrid(meta, new Uint16Array(bin))
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
  const grid = new MapGrid(meta, new Uint16Array(interiorBlob!, meta.byteOffset, count))
  grids.set(matrixId, grid)
  return grid
}
