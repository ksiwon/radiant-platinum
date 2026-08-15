// 리포트 흐름 — 쓰기·백업·가져오기 (IMPORT.md §10~11 · PLAN §9.2)
//
// 재는 것 넷:
//
//   ① 임시 슬롯에 쓰고 **다시 읽어 검증한 뒤에야** 현재 슬롯을 바꾼다
//   ② 내부 저장 성공과 파일 백업 성공이 **따로**다
//   ③ 실패한 가져오기는 기존 리포트를 **한 바이트도** 안 바꾼다
//   ④ 지우기 전에 백업을 먼저 시도한다
import 'fake-indexeddb/auto'
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { get, set, del, createStore } from 'idb-keyval'
import { createNewSave, SAVE_VERSION, useSaveStore, type SaveData } from './saveStore'
import { readReportDetailed } from './report'
import { buildPortable, buildPortableRaw, serializePortable } from './save/portable'
import { dexSet } from '../engine/pokemon/dex'

const DB = createStore('radiant-platinum', 'save')
const AT = new Date('2026-08-10T14:03:07')

const where = { map: 415, matrix: 129, x: 4.5, z: 6.5, facing: 0 }

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
