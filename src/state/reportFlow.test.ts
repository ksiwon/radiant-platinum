// 리포트 흐름 — 쓰기·백업·가져오기 (IMPORT.md §10~11 · PLAN §9.2)
//
// 재는 것 넷:
//
//   ① 임시 슬롯에 쓰고 **다시 읽어 검증한 뒤에야** 현재 슬롯을 바꾼다
//   ② 내부 저장 성공과 파일 백업 성공이 **따로**다
//   ③ 실패한 가져오기는 기존 리포트를 **한 바이트도** 안 바꾼다
//   ④ 지우기 전에 백업을 먼저 시도한다
//   ⑤ 그 백업을 **사람이 되찾는다** — 없음·정상·손상·예전 판·미래 판·취소·쓰기 실패
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { get, set, del, createStore } from 'idb-keyval'
import { createNewSave, SAVE_VERSION, useSaveStore, type SaveData } from './saveStore'
import { readReportDetailed } from './report'
import { buildPortable, buildPortableRaw, serializePortable } from './save/portable'
import { dexSet } from '../engine/pokemon/dex'

const DB = createStore('radiant-platinum', 'save')
const AT = new Date('2026-08-10T14:03:07')

const where = { map: 415, matrix: 129, x: 4.5, z: 6.5, facing: 0, y: null }

function saveWith(name: string, money = 3000): SaveData {
  const save = createNewSave()
  save.trainer.name = name
  save.money = money
  save.pokedex.seen = dexSet(save.pokedex.seen, 387)
  return save
}

/**
 * 브라우저 다운로드 흉내.
 *
 * ⚠️ vitest는 노드 환경이라 `document`가 없다 — 그대로 두면 `downloadPortable`이
 * 늘 `no-dom`으로 떨어져서 **파일 백업 경로를 한 번도 안 지난다.** 그 길이
 * 실제로 도는지 보려면 세워 줘야 한다
 */
interface Grab { name: string; blob: Blob }
let grabbed: Grab[] = []
let blocked = false

function installFakeDom(): void {
  grabbed = []
  const anchors: { href: string; download: string }[] = []
  const doc = {
    createElement: () => {
      const a = {
        href: '', download: '', rel: '', style: { display: '' },
        click: () => {
          if (blocked) throw new Error('다운로드가 막혔다')
          anchors.push({ href: a.href, download: a.download })
          const blob = blobs.get(a.href)
          if (blob) grabbed.push({ name: a.download, blob })
        },
        remove: () => undefined,
      }
      return a
    },
    body: { appendChild: () => undefined },
  }
  const blobs = new Map<string, Blob>()
  let n = 0
  ;(globalThis as { document?: unknown }).document = doc
  URL.createObjectURL = (blob: Blob) => {
    const url = `blob:fake/${String(n++)}`
    blobs.set(url, blob)
    return url
  }
  URL.revokeObjectURL = () => undefined
}

beforeEach(async () => {
  blocked = false
  installFakeDom()
  await del('report', DB)
  await del('report.tmp', DB)
  await del('report.bak', DB)
  useSaveStore.setState({ ...createNewSave(), hydrated: false, loaded: false, pendingInit: false })
})

afterEach(() => {
  delete (globalThis as { document?: unknown }).document
})

describe('리포트를 쓴다', () => {
  it('내부 저장과 파일 백업을 함께 한다', async () => {
    useSaveStore.setState({ ...saveWith('나빛', 4200) })
    const got = await useSaveStore.getState().report(where)

    expect(got.saved).toBe(true)
    expect(got.backup.started).toBe(true)
    expect(got.fileName).toMatch(/^radiant-platinum_나빛_.*\.rpsave$/)

    const stored = await readReportDetailed(SAVE_VERSION)
    expect(stored.kind).toBe('ok')
    if (stored.kind === 'ok') expect(stored.save.money).toBe(4200)

    expect(grabbed).toHaveLength(1)
    expect(grabbed[0]!.name).toBe(got.fileName)
    const text = await grabbed[0]!.blob.text()
    expect(JSON.parse(text)).toMatchObject({ magic: 'RADIANT_PLATINUM_SAVE' })
  })

  it('⚠️ 다운로드가 막혀도 내부 리포트는 성공이다', async () => {
    // 브라우저가 반복 다운로드를 차단하는 자리다. 둘을 묶어 두면 여기서
    // "리포트를 쓰지 못했다"가 뜨는데, 사실은 써졌다
    blocked = true
    useSaveStore.setState({ ...saveWith('한새') })
    const got = await useSaveStore.getState().report(where)

    expect(got.saved).toBe(true)
    expect(got.backup.started).toBe(false)
    expect((await readReportDetailed(SAVE_VERSION)).kind).toBe('ok')
  })

  it('⚠️ 스키마를 어기는 상태는 디스크에 안 닿는다', async () => {
    await useSaveStore.getState().report(where) // 멀쩡한 것을 먼저 하나 둔다
    const before = await get<SaveData>('report', DB)

    useSaveStore.setState({ money: -1 })
    const got = await useSaveStore.getState().report(where)

    expect(got.saved).toBe(false)
    expect(got.why).toContain('money')
    // 임시 슬롯에도 안 남고, 현재 슬롯도 그대로다
    expect(await get('report.tmp', DB)).toBeUndefined()
    expect((await get<SaveData>('report', DB))?.money).toBe(before?.money)
  })

  it('쓰고 나면 임시 슬롯이 비어 있다', async () => {
    await useSaveStore.getState().report(where)
    expect(await get('report.tmp', DB)).toBeUndefined()
  })
})

describe('백업 받기', () => {
  it('리포트가 없으면 받을 것도 없다', async () => {
    expect(await useSaveStore.getState().exportReport()).toEqual({ kind: 'none' })
  })

  it('있으면 파일이 나온다', async () => {
    useSaveStore.setState({ ...saveWith('나빛') })
    await useSaveStore.getState().report(where)
    grabbed = []

    const got = await useSaveStore.getState().exportReport()
    expect(got.kind).toBe('done')
    if (got.kind !== 'done') return
    expect(got.raw).toBe(false)
    expect(grabbed).toHaveLength(1)
  })

  it('⚠️ 못 읽는 리포트도 원본 그대로 돌려준다', async () => {
    // 더 새 판이 쓴 리포트. 우리는 못 읽지만 **버리면 안 된다**
    await set('report', { ...saveWith('미래'), version: SAVE_VERSION + 5 }, DB)
    grabbed = []

    const got = await useSaveStore.getState().exportReport()
    expect(got.kind).toBe('done')
    if (got.kind !== 'done') return
    expect(got.raw).toBe(true)

    const text = await grabbed[0]!.blob.text()
    expect((JSON.parse(text) as { saveVersion: number }).saveVersion).toBe(SAVE_VERSION + 5)
  })
})

describe('파일에서 불러오기', () => {
  const fileOf = (save: SaveData) => serializePortable(buildPortable(save, AT))

  it('미리 보고 나서 들인다', async () => {
    const incoming = saveWith('바깥에서온', 7777)
    const preview = await useSaveStore.getState().previewImport(fileOf(incoming))

    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(preview.envelope.summary.trainer).toBe('바깥에서온')
    expect(preview.migrated).toBe(false)
    expect(preview.contract).toBe('same')

    const done = await useSaveStore.getState().commitImport(preview)
    expect(done.ok).toBe(true)
    expect(useSaveStore.getState().money).toBe(7777)
    expect((await readReportDetailed(SAVE_VERSION)).kind).toBe('ok')
  })

  it('⚠️ 덮기 전에 지금 리포트를 먼저 받는다', async () => {
    useSaveStore.setState({ ...saveWith('원래것', 1111) })
    await useSaveStore.getState().report(where)
    grabbed = []

    const preview = await useSaveStore.getState().previewImport(fileOf(saveWith('새것', 2222)))
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    await useSaveStore.getState().commitImport(preview)

    // 받아 둔 파일은 **덮이기 전의 것**이다
    expect(grabbed).toHaveLength(1)
    const backup = JSON.parse(await grabbed[0]!.blob.text()) as { summary: { trainer: string } }
    expect(backup.summary.trainer).toBe('원래것')
    // IndexedDB 백업 슬롯에도 한 벌 남는다
    expect((await get<SaveData>('report.bak', DB))?.money).toBe(1111)
  })

  it('⚠️ 실패한 가져오기는 기존 리포트를 안 건드린다', async () => {
    useSaveStore.setState({ ...saveWith('원래것', 1111) })
    await useSaveStore.getState().report(where)

    // ⚠️ 봉투 글자를 `.replace`로 손대면 안 된다 — payload는 봉투 안에서 **문자열로
    // 한 번 더 인코딩**돼 있어서 `"money":3000`이 `\"money\":3000`으로 들어간다.
    // 못 찾고 그냥 지나가면 멀쩡한 파일을 "망가진 것"이라며 시험하게 된다.
    // 체크섬까지 맞는 **진짜 어긋난 세이브**를 만들어서 스키마가 잡는지 본다
    const schemaBreaker = serializePortable(
      buildPortableRaw({ ...saveWith('x'), money: -9 }, SAVE_VERSION, AT))

    for (const bad of ['그냥 글', '{}', schemaBreaker]) {
      const preview = await useSaveStore.getState().previewImport(bad)
      expect(preview.ok, bad.slice(0, 20)).toBe(false)
      if (!preview.ok && bad === schemaBreaker) expect(preview.why).toContain('money')
    }

    const stored = await readReportDetailed(SAVE_VERSION)
    expect(stored.kind).toBe('ok')
    if (stored.kind === 'ok') expect(stored.save.money).toBe(1111)
  })

  it('더 새 판이 만든 파일은 이유를 말하고 물러선다', async () => {
    const next = SAVE_VERSION + 1
    const text = serializePortable(
      buildPortableRaw({ ...saveWith('미래'), version: next }, next, AT))
    const preview = await useSaveStore.getState().previewImport(text)
    expect(preview.ok).toBe(false)
    // 손상이 아니라 **판**이 문제라는 것을 말해야 한다 — "이 파일이 이상하다"와
    // "이 앱이 아직 못 읽는다"는 사용자가 할 일이 다르다
    if (!preview.ok) expect(preview.why).toContain('더 새로운 판')
  })

  it('너무 옛 판은 버리지 말라고 말한다', async () => {
    const text = serializePortable(buildPortableRaw({ ...saveWith('옛것'), version: 2 }, 2, AT))
    const preview = await useSaveStore.getState().previewImport(text)
    expect(preview.ok).toBe(false)
    if (!preview.ok) expect(preview.why).toContain('보관')
  })
})

describe('지우기 전 백업', () => {
  it('처음부터를 눌러도 지금 리포트가 파일로 남는다', async () => {
    useSaveStore.setState({ ...saveWith('지워질것', 5555) })
    await useSaveStore.getState().report(where)
    grabbed = []

    await useSaveStore.getState().resetSave()

    expect(grabbed).toHaveLength(1)
    const backup = JSON.parse(await grabbed[0]!.blob.text()) as { summary: { trainer: string } }
    expect(backup.summary.trainer).toBe('지워질것')
    expect((await get<SaveData>('report.bak', DB))?.money).toBe(5555)
    // 그리고 실제로 지워졌다
    expect(await get('report', DB)).toBeUndefined()
    expect(useSaveStore.getState().loaded).toBe(false)
  })

  it('개발용 reset은 백업을 건너뛴다 — 명시해야만', async () => {
    useSaveStore.setState({ ...saveWith('개발') })
    await useSaveStore.getState().report(where)
    grabbed = []

    await useSaveStore.getState().resetSave({ backup: false })
    expect(grabbed).toEqual([])
    expect(await get('report', DB)).toBeUndefined()
  })

  it('리포트가 없으면 받을 것도 없다', async () => {
    await useSaveStore.getState().resetSave()
    expect(grabbed).toEqual([])
  })
})

/**
 * 남겨 둔 한 벌을 되찾는다 (REPAIR.md §10 · IMPORT.md §11-8).
 *
 * ⚠️ **이 갈래의 유일한 실패 방식은 「되찾다가 잃는 것」이다.** 되찾기는 지금
 * 리포트를 덮는 일이고, 평소의 「덮기 전 백업」은 지금 리포트를 **백업 슬롯에
 * 복사한다** — 그 길로 오면 되찾으려던 바로 그 한 벌이 사라진다. 아래 ⑤가
 * 그 자리를 못 박는다.
 */
describe('백업에서 되찾기', () => {
  /** 「처음부터」를 눌러 백업 슬롯을 만든 상태 */
  const leaveBackup = async (name: string, money: number): Promise<void> => {
    useSaveStore.setState({ ...saveWith(name, money) })
    await useSaveStore.getState().report(where)
    await useSaveStore.getState().resetSave()
    grabbed = []
  }

  it('백업이 없으면 열어 볼 것도 없다', async () => {
    expect(await useSaveStore.getState().previewBackup()).toEqual({ kind: 'none' })
    expect(await useSaveStore.getState().exportBackup()).toEqual({ kind: 'none' })
  })

  it('지우고 나면 그 한 벌이 열린다', async () => {
    await leaveBackup('되찾을것', 4321)

    const got = await useSaveStore.getState().previewBackup()
    expect(got.kind).toBe('ok')
    if (got.kind !== 'ok') return
    expect(got.save.trainer.name).toBe('되찾을것')
    expect(got.save.money).toBe(4321)
    expect(got.migrated).toBe(false)
  })

  // ⚠️ **열어 보는 것만으로는 아무것도 안 바뀐다.** 화면의 「그만두기」가 성립하는
  // 근거가 이것이다 — 되찾기를 안 누르면 저장된 것도 백업도 그대로여야 한다
  it('⚠️ 열어 보기만 해서는 저장된 것이 안 바뀐다', async () => {
    await leaveBackup('되찾을것', 4321)
    useSaveStore.setState({ ...saveWith('지금것', 10) })
    await useSaveStore.getState().report(where)

    await useSaveStore.getState().previewBackup()

    expect((await get<SaveData>('report', DB))?.money).toBe(10)
    expect((await get<SaveData>('report.bak', DB))?.money).toBe(4321)
    expect(useSaveStore.getState().money).toBe(10)
  })

  it('되찾으면 현재 슬롯과 스토어가 그것이 된다 — 그리고 이어할 수 있다', async () => {
    await leaveBackup('되찾을것', 4321)

    const got = await useSaveStore.getState().previewBackup()
    expect(got.kind).toBe('ok')
    if (got.kind !== 'ok') return
    const done = await useSaveStore.getState().restoreBackup(got.save)
    expect(done.ok).toBe(true)

    expect(useSaveStore.getState().trainer.name).toBe('되찾을것')
    expect(useSaveStore.getState().loaded).toBe(true)
    // 디스크에도 실제로 앉았다 — 다시 켠 것처럼 읽어 본다
    useSaveStore.setState({ ...createNewSave(), loaded: false })
    expect(await useSaveStore.getState().loadReport()).toBe(true)
    expect(useSaveStore.getState().money).toBe(4321)
  })

  // ⑤ ⚠️ **되찾는 동안 복구 후보를 덮지 않는다.** `resetSave`·`commitImport`가
  // 쓰는 길은 현재 슬롯을 `report.bak`에 **복사한다** — 그것을 그대로 쓰면
  // 한 번 되찾은 뒤 백업 슬롯에는 방금 덮인 리포트가 들어앉는다
  it('⚠️ 되찾아도 백업 슬롯은 그 한 벌 그대로다', async () => {
    await leaveBackup('되찾을것', 4321)
    useSaveStore.setState({ ...saveWith('덮일것', 999) })
    await useSaveStore.getState().report(where)
    grabbed = []

    const got = await useSaveStore.getState().previewBackup()
    if (got.kind !== 'ok') throw new Error('백업을 못 읽었다')
    const done = await useSaveStore.getState().restoreBackup(got.save)
    expect(done.ok).toBe(true)

    expect((await get<SaveData>('report.bak', DB))?.money).toBe(4321)
    // 덮이는 리포트는 **파일로** 지킨다 — 백업 슬롯이 아니다
    expect(grabbed).toHaveLength(1)
    const kept = JSON.parse(await grabbed[0]!.blob.text()) as { summary: { trainer: string } }
    expect(kept.summary.trainer).toBe('덮일것')
  })

  it('옛 판 백업은 옮겨서 읽는다', async () => {
    await set('report.bak', { ...saveWith('옛것', 77), version: SAVE_VERSION - 1 }, DB)
    const got = await useSaveStore.getState().previewBackup()
    expect(got.kind).toBe('ok')
    if (got.kind !== 'ok') return
    expect(got.migrated).toBe(true)
    expect(got.save.version).toBe(SAVE_VERSION)
    expect(got.save.trainer.name).toBe('옛것')
  })

  // ⚠️ **못 읽는 백업을 현재 슬롯에 밀어 넣지 않는다.** 밀어 넣으면 다음에 켤 때
  // 현재 슬롯까지 못 읽는 것이 되어, 잃은 것이 하나에서 둘이 된다
  it.each([
    ['미래 판', { ...saveWith('미래'), version: SAVE_VERSION + 5 }, '더 새로운 판'],
    ['너무 옛 판', { ...saveWith('옛것'), version: 2 }, '옛 백업'],
    ['어긋난 내용', { ...saveWith('깨진것'), money: -9 }, '어긋납니다'],
  ])('⚠️ %s 백업은 열리되 현재 슬롯에 안 쓴다', async (_what, bad, says) => {
    useSaveStore.setState({ ...saveWith('지금것', 1234) })
    await useSaveStore.getState().report(where)
    await set('report.bak', bad, DB)

    const got = await useSaveStore.getState().previewBackup()
    expect(got.kind).toBe('unreadable')
    if (got.kind !== 'unreadable') return
    expect(got.why).toContain(says)

    // 현재 슬롯은 한 바이트도 안 바뀐다
    expect((await get<SaveData>('report', DB))?.money).toBe(1234)
    // 그래도 원본은 파일로 돌려준다
    grabbed = []
    const out = await useSaveStore.getState().exportBackup()
    expect(out.kind).toBe('done')
    if (out.kind !== 'done') return
    expect(out.raw).toBe(true)
    expect(grabbed).toHaveLength(1)
  })

  // ⚠️ **쓰기가 실패해도 둘 다 남는다.** 되찾기는 검증하는 쓰기 하나만 쓰므로
  // (`writeReportVerified`) 스키마를 어기는 것은 임시 슬롯에도 안 닿는다
  it('⚠️ 쓰기가 실패하면 현재 슬롯도 백업도 안 잃는다', async () => {
    await leaveBackup('되찾을것', 4321)
    useSaveStore.setState({ ...saveWith('지금것', 1234) })
    await useSaveStore.getState().report(where)

    const done = await useSaveStore.getState().restoreBackup({ ...saveWith('깨진것'), money: -9 })
    expect(done.ok).toBe(false)
    if (done.ok) return
    expect(done.why).toContain('money')

    expect((await get<SaveData>('report', DB))?.money).toBe(1234)
    expect((await get<SaveData>('report.bak', DB))?.money).toBe(4321)
    expect(await get('report.tmp', DB)).toBeUndefined()
  })
})
