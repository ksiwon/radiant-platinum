// 리포트 이사 (PLAN §16.3)
//
// 게임 이름이 `pt-3d`에서 `radiant-platinum`으로 바뀌면서 IndexedDB 데이터베이스
// 이름도 갈렸다. ⚠️ **이름만 갈면 새 이름으로 빈 창고가 하나 더 생길 뿐이고 옛
// 리포트는 그대로 남아 영영 안 읽힌다** — 화면에는 "리포트가 없다"로만 보여서
// 사라진 것처럼 느껴진다. 그래서 처음 읽을 때 한 번 옮긴다.
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { get, set, del, createStore } from 'idb-keyval'
import { createNewSave, SAVE_VERSION } from './saveStore'
import { readReport, writeReport } from './report'

const OLD = createStore('pt-3d', 'save')
const NEW = createStore('radiant-platinum', 'save')

/** `report.ts`는 이사를 모듈 안에서 한 번만 한다. 시험마다 새로 불러온다 */
async function freshRead(): Promise<Awaited<ReturnType<typeof readReport>>> {
  vi.resetModules()
  const mod = await import('./report')
  return mod.readReport(SAVE_VERSION)
}

function saveWith(name: string) {
  const save = createNewSave()
  save.trainer.name = name
  return save
}

beforeEach(async () => {
  await del('report', OLD)
  await del('report', NEW)
})

describe('옛 창고에서 옮겨 오기', () => {
  it('옛 자리에만 있던 리포트를 읽어 온다', async () => {
    await set('report', saveWith('나빛'), OLD)

    const report = await freshRead()

    expect(report?.trainer.name).toBe('나빛')
    // 새 자리에 실제로 옮겨졌다. 다음부터는 옛 창고를 안 봐도 된다
    expect((await get<{ trainer: { name: string } }>('report', NEW))?.trainer.name).toBe('나빛')
  })

  it('옮긴 뒤 옛 자리는 비운다 — 두 벌이 남으면 어느 쪽이 진짜인지 모른다', async () => {
    await set('report', saveWith('나빛'), OLD)
    await freshRead()
    expect(await get('report', OLD)).toBeUndefined()
  })

  it('새 자리에 이미 있으면 덮지 않는다', async () => {
    // 이걸 덮으면 **최신 리포트를 옛것으로 되돌린다.** 가장 아픈 실패다
    await set('report', saveWith('옛것'), OLD)
    await set('report', saveWith('지금것'), NEW)

    expect((await freshRead())?.trainer.name).toBe('지금것')
    expect((await get<{ trainer: { name: string } }>('report', OLD))?.trainer.name).toBe('옛것')
  })

  it('옛 자리가 비어 있어도 그냥 지나간다', async () => {
    expect(await freshRead()).toBeNull()
  })
})

describe('새 창고', () => {
  it('쓰고 읽으면 그대로다', async () => {
    await writeReport(saveWith('한새'))
    expect((await readReport(SAVE_VERSION))?.trainer.name).toBe('한새')
  })

  it('판이 안 맞는 리포트는 없는 것으로 친다', async () => {
    await set('report', { ...saveWith('옛판'), version: SAVE_VERSION - 1 }, NEW)
    expect(await readReport(SAVE_VERSION)).toBeNull()
  })
})
