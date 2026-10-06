// 기술 계획은 쪽마다 따로 선다 — 짝 · 홀 묶음이 고른 프리팹이 한쪽에만 없으면 그 쪽만 DS로 간다
import { beforeEach, describe, expect, it, vi } from 'vitest'

const files: Record<string, unknown> = {}

vi.mock('../../../data/providers/assetProvider', () => ({
  assets: () => ({ exists: async (p: string) => p in files }),
  readJson: async (_: unknown, p: string) => {
    if (!(p in files)) throw new Error(`없음 ${p}`)
    return files[p]
  },
  onProviderSwap: () => { /* 시험에서는 안 바뀐다 */ },
}))
vi.mock('./fxAssets', () => ({ loadFxPrefab: async () => null }))

// 표를 모듈이 붙잡아 두므로 시험마다 새로 연다
const fresh = async () => { vi.resetModules(); return import('./moveSeq') }

const particle = (file: string) => ({
  start: 10, end: 20, name: 'ParticleCreate',
  values: { drawType: ['0'], file: [file], index: ['0'], isMulti: ['0'], rotOrder: ['6'] },
})

beforeEach(() => {
  for (const k of Object.keys(files)) delete files[k]
})

describe('`preloadMoveSeqs` — 쪽마다', () => {
  it('화면에 아무것도 안 세우는 빈 시퀀스(`DummyLabel`뿐)는 계획을 안 세워 DS로 간다', async () => {
    files['data/fx/index.json'] = { balls: {}, moves: { 185: { seq: 'ew185' }, 150: { seq: 'ew150' } }, missingPrefabs: [] }
    // 속여때리기 — 라벨 한 줄과 소리 · 게이지뿐
    files['data/fx/seq/ew185.json'] = { name: 'ew185', groups: [{ name: 'x', no: 0, options: [], commands: [
      { start: 0, end: 12, name: 'DummyLabel', values: {} },
      { start: 0, end: 0, name: 'CameraReset', values: {} },
    ] }] }
    // 튀어오르기 — 입자는 없어도 몸이 움직인다
    files['data/fx/seq/ew150.json'] = { name: 'ew150', groups: [{ name: 'x', no: 0, options: [], commands: [
      { start: 2, end: 20, name: 'PokemonMoveRelativePoke', values: { moveTrg: ['0'], posTrg: ['0'], node: ['0'], ofs: ['0', '60', '0'], move: ['1'] } },
    ] }] }
    const { moveSeqPlan, preloadMoveSeqs } = await fresh()
    await preloadMoveSeqs([185, 150])
    expect(moveSeqPlan(185, true)).toBeNull()
    expect(moveSeqPlan(185, false)).toBeNull()
    expect(moveSeqPlan(150, true)).not.toBeNull()
  })

  it('상대 쪽(짝수 묶음) 프리팹만 빠지면 내 쪽 계획은 서고 상대 쪽은 DS다', async () => {
    files['data/fx/index.json'] = {
      balls: {},
      moves: { 33: { seq: 'ew900' } },
      missingPrefabs: ['ew900_foe'],
    }
    files['data/fx/seq/ew900.json'] = {
      name: 'ew900',
      groups: [
        // (1, 홀수) = 내 쪽이 쓸 때 · (1, 짝수) = 상대가 쓸 때 (`sequence.ts` 머리말)
        { name: 'mine', no: 0, options: [[1, 1]], commands: [particle('ew900/ew900_mine.ptcl')] },
        { name: 'foe', no: 0, options: [[1, 2]], commands: [particle('ew900/ew900_foe.ptcl')] },
      ],
    }
    const { moveSeqPlan, preloadMoveSeqs } = await fresh()
    await preloadMoveSeqs([33])
    expect(moveSeqPlan(33, true)?.particles.map((p) => p.prefab)).toEqual(['ew900_mine'])
    expect(moveSeqPlan(33, false)).toBeNull()
  })

  it('내 쪽 프리팹만 빠져도 상대 쪽 계획은 선다', async () => {
    files['data/fx/index.json'] = {
      balls: {},
      moves: { 34: { seq: 'ew901' } },
      missingPrefabs: ['ew901_mine'],
    }
    files['data/fx/seq/ew901.json'] = {
      name: 'ew901',
      groups: [
        { name: 'mine', no: 0, options: [[1, 1]], commands: [particle('ew901/ew901_mine.ptcl')] },
        { name: 'foe', no: 0, options: [[1, 2]], commands: [particle('ew901/ew901_foe.ptcl')] },
      ],
    }
    const { moveSeqPlan, preloadMoveSeqs } = await fresh()
    await preloadMoveSeqs([34])
    expect(moveSeqPlan(34, true)).toBeNull()
    expect(moveSeqPlan(34, false)?.particles.map((p) => p.prefab)).toEqual(['ew901_foe'])
  })
})
