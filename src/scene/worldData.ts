// 월드 데이터 fetch (DATA.md §3.2)
//
// 시작할 때 받는 것: maps.json(헤더 표) · events.json(워프) · 행렬 0(오버월드).
// 실내는 첫 워프 때 한 번만 받는다 — 269개를 이어 붙여 1.33MB이고 압축하면 20KB대라
// 행렬마다 따로 두는 것(파일 500개 + 문 열 때마다 왕복)보다 낫다.
import { MapGrid, type MatrixMeta } from '../engine/map/grid'
import { world, type EventFile, type MapHeader } from '../engine/map/world'
import { encounters } from '../engine/battle/encounterSystem'
import type { EncounterTable } from '../engine/battle/encounter'

const base = () => `${import.meta.env.BASE_URL}data/`

async function json<T>(path: string): Promise<T> {
  const r = await fetch(base() + path)
  if (!r.ok) throw new Error(`${path} 로드 실패: HTTP ${r.status}`)
  return r.json() as Promise<T>
}

async function bytes(path: string): Promise<ArrayBuffer> {
  const r = await fetch(base() + path)
  if (!r.ok) throw new Error(`${path} 로드 실패: HTTP ${r.status}`)
  return r.arrayBuffer()
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

export interface WorldBoot {
  overworld: MapGrid
  spawn: { x: number; z: number; map: number }
  /** 지역명 126개. 맵 헤더의 label로 색인한다 */
  locationNames: string[]
}

/** 시작 데이터. world 싱글톤을 채우고 오버월드 격자를 돌려준다 */
export async function bootWorld(): Promise<WorldBoot> {
  const [mapsFile, eventsFile, encFile, locationNames, meta, bin] = await Promise.all([
    json<{ maps: MapHeader[] }>('maps.json'),
    json<{ events: Record<string, EventFile> }>('events.json'),
    json<{ tables: EncounterTable[] }>('encounters.json'),
    json<string[]>('names/locations.ko.json'),
    json<MatrixMeta>('matrices/0.json'),
    bytes('matrices/0.bin'),
  ])
  world.maps = mapsFile.maps
  world.events = eventsFile.events
  encounters.tables = encFile.tables
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
