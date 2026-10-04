// 프리팹은 소문자 파일 이름으로 받는다 — 시퀀스가 `ew416_bulletBody`처럼 원래 대소문자로 불러도
import { expect, it, vi } from 'vitest'

const asked: string[] = []
vi.mock('../../../data/providers/assetProvider', () => ({
  assets: () => ({}),
  readJson: async (_: unknown, p: string) => { asked.push(p); return { prefab: 'x', roots: [] } },
  onProviderSwap: () => { /* 시험에서는 안 바뀐다 */ },
  assetUrl: async () => '',
}))

const { loadFxPrefab } = await import('./fxAssets')

it('대소문자 섞인 이름도 소문자 파일을 받고, 같은 것은 한 번만 받는다', async () => {
  await loadFxPrefab('ew416_bulletBody')
  await loadFxPrefab('ew416_bulletbody')
  expect(asked).toEqual(['data/fx/prefab/ew416_bulletbody.json'])
})
