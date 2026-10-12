// 메뉴 개편이 읽는 새 그림 · 글의 불러오기 (`gameData.ts` — SYSTEM §5 P0a 「불러오기」).
//
// **실패하면 `null`이다.** 굽는 쪽이 그림을 아직 안 구웠거나 설치본에서 빠졌을 때 화면이 그 그림 없이 서야 한다 —
// 던지면 화면이 통째로 안 뜬다. 그림 대체 경로가 그 빈자리를 가리므로 `TypeBadge` · `menuIcon`이 경고를 남긴다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const ITEMS = resolve(__dirname, '../../public/data/items.json')

const state = { atlas: 'fail' as 'fail' | 'ok', json: 'fail' as 'fail' | 'ok' }

vi.mock('./providers/atlas', () => ({
  pinAtlas: () => (state.atlas === 'ok' ? Promise.resolve('blob:x') : Promise.reject(new Error('없다'))),
  atlasUrl: () => '',
}))

vi.mock('./providers/assetProvider', () => ({
  assets: () => ({}),
  onProviderSwap: () => undefined,
  readJson: (_p: unknown, path: string) => {
    if (state.json === 'fail') return Promise.reject(new Error(`없다: ${path}`))
    if (path === 'data/dexHeightWeight.json') return Promise.resolve({ rows: [[1, 2]] })
    if (path === 'data/items.json' && existsSync(ITEMS)) {
      return Promise.resolve(JSON.parse(readFileSync(ITEMS, 'utf8')))
    }
    if (path.startsWith('data/dialogue/')) return Promise.resolve(['가', '나'])
    return Promise.reject(new Error(`모르는 경로: ${path}`))
  },
}))

const data = await import('./gameData')

beforeEach(() => {
  state.atlas = 'fail'
  state.json = 'fail'
  data.resetGameDataCache()
})

const SHEET_LOADERS = [
  ['loadTypeIcons', () => data.loadTypeIcons('ko')],
  ['loadMoveClass', data.loadMoveClass],
  ['loadStartMenuIcons', () => data.loadStartMenuIcons('ko')],
  ['loadDexShapes', data.loadDexShapes],
  ['loadTownMapPlayer', data.loadTownMapPlayer],
  ['loadMailArt', data.loadMailArt],
  ['loadBerryArt', data.loadBerryArt],
  ['loadDiplomaArt', data.loadDiplomaArt],
] as const

describe('그림 시트 — 못 받으면 null', () => {
  for (const [name, load] of SHEET_LOADERS) {
    it(`${name}: 그림이 없으면 던지지 않고 null이다`, async () => {
      state.atlas = 'fail'
      expect(await load()).toBeNull()
    })

    it(`${name}: 그림이 있으면 시트 자료를 준다`, async () => {
      state.atlas = 'ok'
      const sheet = await load()
      expect(sheet).not.toBeNull()
      expect(sheet!.path).toMatch(/^data\/.+\.png$/)
      expect(sheet!.cellW).toBeGreaterThan(0)
      expect(sheet!.cols * sheet!.rows).toBeGreaterThan(0)
    })
  }
})

describe('시트 칸 구성 (굽는 쪽과의 계약)', () => {
  it('칸 수가 쓰는 쪽이 아는 수와 같다', () => {
    expect(data.typeIconSheet('ko').cols * data.typeIconSheet('ko').rows).toBe(18)
    // 언어마다 파일이 다르다
    expect(data.typeIconSheet('en').path).toBe('data/typeIcons.en.png')
    expect(data.startMenuIconSheet('ja').path).toBe('data/startMenuIcons.ja.png')
    expect(data.MOVE_CLASS_SHEET.cols * data.MOVE_CLASS_SHEET.rows).toBe(3)
    expect(data.MOVE_CLASS_ATLAS).toBe('data/moveClass.png')
    expect(data.PARTY_ICON_SHEET.cols * data.PARTY_ICON_SHEET.rows).toBe(3)
    expect(data.PARTY_ICON_ATLAS).toBe('data/partyIcons.png')
    expect(data.PARTY_ICON_CELL.capsule).toBe(2)
    expect(data.SEAL_ICON_SHEET.cols * data.SEAL_ICON_SHEET.rows).toBe(80)
    expect(data.SEAL_ICON_ATLAS).toBe('data/sealIcons.png')
    expect(data.typeIconAtlas('ko')).toBe('data/typeIcons.ko.png')
    expect(data.startMenuIconAtlas('en')).toBe('data/startMenuIcons.en.png')
    for (const path of [data.DEX_SHAPE_ATLAS, data.TOWN_MAP_PLAYER_ATLAS, data.MAIL_ART_ATLAS, data.BERRY_ART_ATLAS, data.DIPLOMA_ART_ATLAS]) {
      expect(path).toMatch(/^data\/\w+\.png$/)
    }
    expect(data.startMenuIconSheet('ko').rows).toBe(10)
    expect(data.DEX_SHAPE_SHEET.cols * data.DEX_SHAPE_SHEET.rows).toBe(14)
    expect(data.TOWN_MAP_PLAYER_SHEET.cols * data.TOWN_MAP_PLAYER_SHEET.rows).toBe(2)
    expect(data.MAIL_ART_SHEET.cols * data.MAIL_ART_SHEET.rows).toBe(12)
    expect(data.BERRY_ART_SHEET.cols * data.BERRY_ART_SHEET.rows).toBe(64)
    expect(data.DIPLOMA_ART_SHEET.cols * data.DIPLOMA_ART_SHEET.rows).toBe(2)
  })

  it('분류 칸 번호는 물리 0 · 특수 1 · 변화 2다', () => {
    expect(data.MOVE_CLASS_CELL).toEqual({ physical: 0, special: 1, status: 2 })
  })
})

describe('표 · 글 — 못 받으면 null', () => {
  it('크기 비교 표', async () => {
    expect(await data.loadDexHeightWeight()).toBeNull()
    state.json = 'ok'
    data.resetGameDataCache()
    expect(await data.loadDexHeightWeight()).toEqual({ rows: [[1, 2]] })
  })

  it('기술머신이 가르치는 기술 (가방 · 상점 공유)', async () => {
    expect(await data.loadTmMoves()).toBeNull()
    state.json = 'ok'
    data.resetGameDataCache()
    // 자료가 없는 기계에서는 성공 길을 못 잰다 (실패 길은 위에서 쟀다)
    if (!existsSync(ITEMS)) return
    const moves = await data.loadTmMoves()
    expect(moves).not.toBeNull()
    expect(moves!.length).toBe(100)
  })

  it('대사 뱅크 (645가 아직 안 구워졌을 때)', async () => {
    expect(await data.loadDialogueBankOrNull('ko', 645)).toBeNull()
    state.json = 'ok'
    data.resetGameDataCache()
    expect(await data.loadDialogueBankOrNull('ko', 645)).toEqual(['가', '나'])
  })
})
