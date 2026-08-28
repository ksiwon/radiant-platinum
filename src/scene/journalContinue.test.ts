// 이어하기에서 모험노트가 저절로 펼쳐진다 (`FieldTask_LoadSavedGameMap` 0번)
import { beforeEach, describe, expect, it } from 'vitest'
import { fieldScripts } from '../engine/script/field'
import { SYSTEM_FLAG } from '../engine/script/commands'
import { VarStore } from '../engine/script/vars'
import { emptyEntry, newJournal, saveTitle } from '../engine/world/journal'
import { useMenuStore } from '../state/menuStore'
import { useSaveStore } from '../state/saveStore'
import { journalEnterMap } from './journal'

/** 그 날짜 하루만 적힌 노트 */
function noteFrom(year: number, month: number, day: number) {
  const journal = newJournal()
  journal[0] = saveTitle(emptyEntry(), { year, month, day, week: 4, mapId: 3 })
  return journal
}

const 오늘 = new Date(2026, 7, 28)

beforeEach(() => {
  fieldScripts.vars = new VarStore()
  fieldScripts.vars.setFlag(SYSTEM_FLAG.journalAcquired)
  useMenuStore.getState().closeAll()
})

describe('이어하기 모험노트', () => {
  it('이틀 넘게 안 켰으면 펼쳐지고 지난번 쪽을 가리킨다', () => {
    useSaveStore.setState({ journal: noteFrom(26, 8, 20) })
    journalEnterMap(3, 오늘)
    expect(useMenuStore.getState().top).toBe('journal')
    // 쪽이 넘어갔으므로 지난번 종이는 한 칸 뒤다
    expect(useMenuStore.getState().journalAt).toBe(1)
    expect(useSaveStore.getState().journal[1]?.title.day).toBe(20)
  })

  it('어제 켰으면 안 펼쳐진다', () => {
    useSaveStore.setState({ journal: noteFrom(26, 8, 27) })
    journalEnterMap(3, 오늘)
    expect(useMenuStore.getState().top).toBe(null)
  })

  it('노트를 아직 안 받았으면 안 펼쳐진다', () => {
    fieldScripts.vars = new VarStore()
    useSaveStore.setState({ journal: noteFrom(26, 8, 20) })
    journalEnterMap(3, 오늘)
    expect(useMenuStore.getState().top).toBe(null)
  })

  it('가방에서 열면 언제나 오늘 쪽이다', () => {
    useSaveStore.setState({ journal: noteFrom(26, 8, 20) })
    journalEnterMap(3, 오늘)
    useMenuStore.getState().closeAll()
    useMenuStore.getState().push('journal')
    expect(useMenuStore.getState().journalAt).toBe(0)
  })
})
