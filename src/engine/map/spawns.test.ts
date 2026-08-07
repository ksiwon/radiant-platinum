// 부활 지점과 공중날기 목적지 (DATA.md §2.3)
//
// 여기서 겁나는 것은 **벽 안에서 깨어나는 것**이다. 전멸은 이야기 어디서나
// 날 수 있고, 그때 못 움직이는 칸에 세워지면 판이 끝난다 — 문 워프에서 이미
// 한 번 그 일이 있었다(`walkOutOfDoor`).
//
// 그래서 20곳을 전부 격자에 대고 재 본다. 좌표를 옮기다 하나만 어긋나도 여기서
// 걸린다 — 눈으로는 못 보는 종류다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { it, expect, beforeAll } from 'vitest'
import { MapGrid, type MatrixMeta } from './grid'
import { spawnAt, spawnTable, spawnWarp, flyUnlockedAt, type SpawnPoint } from './spawns'
import { world, type MapHeader } from './world'
import { withData } from '../../data/romData.testkit'

const DATA = resolve(__dirname, '../../../public/data')
const maybe = withData('spawns.json', 'matrices/0.bin')
const read = (p: string) => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

maybe('스폰 지점', () => {
  let overworld: MapGrid
  let interiors: { matrices: Record<string, MatrixMeta & { byteOffset: number }> }
  let interiorBin: Buffer

  beforeAll(() => {
    world.maps = read('maps.json').maps as MapHeader[]
    spawnTable.list = (read('spawns.json') as { spawns: SpawnPoint[] }).spawns
    const meta = read('matrices/0.json') as MatrixMeta
    const buf = readFileSync(resolve(DATA, 'matrices/0.bin'))
    const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer
    overworld = new MapGrid(meta, new Uint16Array(ab))
    interiors = read('matrices/interiors.json')
    interiorBin = readFileSync(resolve(DATA, 'matrices/interiors.bin'))
  })

  function insideGrid(mapId: number): MapGrid | null {
    const header = world.maps![mapId]!
    const meta = interiors.matrices[String(header.matrix)]
    if (!meta) return null
    const tiles = new Uint16Array(
      interiorBin.buffer, interiorBin.byteOffset + meta.byteOffset,
      meta.tileWidth * meta.tileHeight,
    )
    return new MapGrid(meta, tiles)
  }

  it('스무 곳이고 우리가 이미 아는 두 번호와 맞는다', () => {
    expect(spawnTable.list).toHaveLength(20)
    // 0번은 떡잎마을 주인공 집이다. 411(마을)과 414(집 1층)는 워프 시험이
    // 따로 확인하는 번호라, 추출기가 맞다는 뜻이 된다
    expect(spawnTable.list[0]!.blackOut.map).toBe(414)
    expect(spawnTable.list[0]!.fly.map).toBe(411)
  })

  it('전멸 지점 20곳이 전부 실내이고 설 수 있는 칸이다', () => {
    for (const [i, spot] of spawnTable.list.entries()) {
      const header = world.maps![spot.blackOut.map]
      expect(header, `${String(i)}번 목적지 맵이 없다`).toBeDefined()
      // 포켓몬센터 1층은 저마다 다른 행렬이다 — 오버월드면 좌표계가 틀린 것이다
      expect(header!.matrix, `${spot.blackOutName}`).not.toBe(0)
      const grid = insideGrid(spot.blackOut.map)
      expect(grid, `${spot.blackOutName} 격자가 없다`).not.toBeNull()
      expect(grid!.isBlocked(spot.blackOut.x, spot.blackOut.z), `${spot.blackOutName}에서 벽 안에 선다`)
        .toBe(false)
    }
  })

  it('공중날기 자리 20곳이 전부 오버월드이고 설 수 있는 칸이다', () => {
    for (const spot of spawnTable.list) {
      const header = world.maps![spot.fly.map]!
      expect(header.matrix, `${spot.flyName}`).toBe(0)
      expect(overworld.isBlocked(spot.fly.x, spot.fly.z), `${spot.flyName}에서 벽 안에 선다`)
        .toBe(false)
      // 그 좌표가 정말 그 존 안이어야 한다 — 전역 타일 좌표라 어긋나면 옆 도로에 선다
      expect(overworld.zoneAt(spot.fly.x, spot.fly.z), `${spot.flyName} 좌표가 다른 존이다`)
        .toBe(spot.fly.map)
    }
  })

  it('센터에 들어서면 부활 지점이 그 자리로 옮겨진다', () => {
    // `GetMapBlackOutWarpId` — 맵 번호로 되짚는다
    for (const [i, spot] of spawnTable.list.entries()) {
      // 포켓몬리그 센터가 둘이라 앞엣것이 이긴다 — 원작 조회도 앞에서부터다
      const found = spawnAt(spot.blackOut.map)
      expect(found).not.toBeNull()
      expect(spawnTable.list[found!]!.blackOut.map).toBe(spot.blackOut.map)
      if (found === i) expect(spawnWarp(i, 'blackOut')?.to).toBe(spot.blackOut.map)
    }
    // 아무 데나 들어선다고 옮겨지지는 않는다 — 떡잎마을 바깥은 센터가 아니다
    expect(spawnAt(411)).toBeNull()
  })

  it('마을 열일곱 곳이 발을 들이면 열린다', () => {
    const unlockable = spawnTable.list.filter((s) => s.unlockOnMapEntry)
    // 스무 곳 중 셋은 안 열린다 — 포켓몬리그 둘과 파르파크다. 이야기가 따로 연다
    expect(unlockable).toHaveLength(17)
    for (const spot of unlockable) {
      expect(flyUnlockedAt(spot.fly.map)).not.toBeNull()
    }
    // 도로에 들어섰다고 열리지는 않는다
    expect(flyUnlockedAt(0)).toBeNull()
  })

  it('워프 모양으로 펼 때 칸 한가운데로 온다', () => {
    // 워프가 쓰는 좌표계와 같아야 한다 — 타일 번호 그대로 두면 칸 모서리에 선다
    const at = spawnWarp(0, 'blackOut')!
    expect(at.x).toBe(spawnTable.list[0]!.blackOut.x + 0.5)
    expect(at.z).toBe(spawnTable.list[0]!.blackOut.z + 0.5)
    expect(at.matrix).toBe(world.maps![414]!.matrix)
    expect(at.viaDoor).toBe(false)
    // 없는 번호는 null이다 — 세이브가 깨져도 여기서 멎지 않는다
    expect(spawnWarp(99, 'fly')).toBeNull()
  })
})
