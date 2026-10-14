// 자동 저장 칸 (`state/report`의 `AUTO` · `scene/autosave` · REPAIR §153)
//
// 재는 것: 리포트 칸을 안 덮는다 · 같은 검증을 거친다 · 어느 쪽이 더 최근인지 · 새 모험이 지운다 · 자동 저장에서 붓는다
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { clear, createStore, get } from 'idb-keyval'
import { createNewSave, useSaveStore, type SaveData } from './saveStore'
import { readSaveTimes, writeAutosaveVerified, writeReportVerified } from './report'

const DB = createStore('radiant-platinum', 'save')
const where = { map: 415, matrix: 129, x: 4.5, z: 6.5, facing: 0, y: null, avatar: 0 as const }

function saveWith(name: string, money: number): SaveData {
  const save = createNewSave()
  save.trainer.name = name
  save.money = money
  return save
}

beforeEach(async () => {
  await clear(DB)
  useSaveStore.setState({ ...createNewSave(), hydrated: true, loaded: false })
})

describe('자동 저장 칸', () => {
  it('리포트 칸을 안 덮는다', async () => {
    expect((await writeReportVerified(saveWith('리포트', 100))).ok).toBe(true)
    expect((await writeAutosaveVerified(saveWith('자동', 999))).ok).toBe(true)
    expect((await get<SaveData>('report', DB))?.money).toBe(100)
    expect((await get<SaveData>('report.auto', DB))?.money).toBe(999)
    // 검증이 끝나면 임시 칸은 남지 않는다
    expect(await get('report.auto.tmp', DB)).toBeUndefined()
  })

  it('나중에 쓴 쪽이 더 최근이다', async () => {
    expect(await readSaveTimes()).toEqual({ report: null, auto: null })
    await writeReportVerified(saveWith('리포트', 100))
    await new Promise((r) => setTimeout(r, 5))
    await writeAutosaveVerified(saveWith('자동', 999))
    const t = await readSaveTimes()
    expect(t.report).not.toBeNull()
    expect(t.auto).toBeGreaterThan(t.report ?? Infinity)
  })

  it('스토어의 `autosave`는 지금 판을 자동 저장 칸에만 쓰고, `loadReport(auto)`가 그것을 붓는다', async () => {
    await writeReportVerified(saveWith('리포트', 100))
    useSaveStore.setState({ money: 4321 })
    expect((await useSaveStore.getState().autosave(where)).saved).toBe(true)
    expect((await get<SaveData>('report', DB))?.money).toBe(100)

    useSaveStore.setState({ money: 0 })
    expect(await useSaveStore.getState().loadReport('auto')).toBe(true)
    expect(useSaveStore.getState().money).toBe(4321)
    expect(useSaveStore.getState().position).toEqual(where)

    expect(await useSaveStore.getState().loadReport()).toBe(true)
    expect(useSaveStore.getState().money).toBe(100)
  })

  it('새 모험을 열면 옛 자동 저장도 지운다', async () => {
    await writeAutosaveVerified(saveWith('자동', 999))
    await useSaveStore.getState().resetSave({ backup: false })
    expect(await get('report.auto', DB)).toBeUndefined()
    expect((await readSaveTimes()).auto).toBeNull()
  })
})
