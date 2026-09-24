// 스크립트 `Warp`가 깨어진 세계로 보내는 칸 (REPAIR §83)
//
// ⚠️ **재는 것은 「롬 칸에서 층 오프셋을 빼면 설 수 있는 칸인가」다.** 원작은 깨어진 세계의 층들을 한
// 좌표계에 두어 스크립트가 적은 도착 칸이 그 세계 칸이다. 우리 층 격자는 0에서 시작하므로 빼지 않으면
// 1F 도착 (55,40)이 벽 속이었다 — 판 밖 허공에 서서 한 걸음도 못 걸었다
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { distortionSchema, type DistortionData } from '../../src/data/schema'
import { withDistortionTables } from '../../src/data/distortionFile'
import { gridOf, matrixOf, missingData } from './route.mjs'

const FILE = 'public/data/distortion.json'
const HAVE = existsSync(FILE) && missingData().length === 0
const data: DistortionData | null = HAVE
  ? withDistortionTables(distortionSchema.parse(JSON.parse(readFileSync(FILE, 'utf8'))))
  : null

vi.mock('../../src/data/gameData', () => ({
  loadDistortion: () => Promise.resolve(data),
}))

const core = await import('../../src/scene/distortionCore')

/**
 * 롬 스크립트의 깨어진 세계 `Warp` 넷 — (맵, 롬 칸)
 * `scripts_spear_pillar_distorted.s:72` · `_b7f.s:19` · `_giratina_room.s:56` · `scripts_turnback_cave_giratina_room.s:113`
 */
const ROM_WARPS = [
  { what: '깨진 창기둥 → 1F', map: 573, x: 55, z: 40 },
  { what: 'B7F → 기라티나 방', map: 582, x: 15, z: 25 },
  { what: '기라티나 방 → B7F', map: 581, x: 89, z: 57 },
  { what: '귀혼동굴 → 깨어진 세계 방', map: 583, x: 116, z: 75 },
]

describe.skipIf(!HAVE)('깨어진 세계로 가는 스크립트 워프', () => {
  it('층 자료를 받기 전에는 모른다고 답한다', () => {
    expect(core.romTileToLocal(573, 55, 40)).toBeNull()
  })

  it('1F 도착은 우리 칸 (34,30)이다 — 포털 소품 (55,289,39) 바로 앞', async () => {
    await core.distortionPreload()
    expect(core.romTileToLocal(573, 55, 40)).toEqual({ x: 34, z: 30 })
  })

  for (const w of ROM_WARPS) {
    it(`${w.what}: 오프셋을 뺀 칸은 서고, 롬 칸 그대로는 ${w.map === 582 ? '(오프셋 0이라 같다)' : '못 선다'}`, async () => {
      await core.distortionPreload()
      const local = core.romTileToLocal(w.map, w.x, w.z)!
      const grid = gridOf(matrixOf(w.map))
      expect(grid.blocked(local.x, local.z), `${w.what} (${String(local.x)},${String(local.z)})`).toBe(false)
      if (local.x !== w.x || local.z !== w.z) {
        const raw = w.x >= grid.w || w.z >= grid.h || grid.blocked(w.x, w.z)
        expect(raw, `롬 칸 (${String(w.x)},${String(w.z)})를 그대로 쓰면 막힌다`).toBe(true)
      }
    })
  }
})
