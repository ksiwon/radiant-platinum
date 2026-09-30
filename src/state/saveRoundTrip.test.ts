// 리포트 왕복 — **꽉 찬 판**을 쓰고 다시 읽어 칸 하나까지 같은지 잰다
//
// 흐름 시험(`reportFlow.test.ts`)은 거의 새 게임으로 잰다. 그러면 파티·박스·육성가·
// 배회·전당·팩토리 쉬는 도전처럼 **새 게임에서 비어 있는 칸**은 한 번도 디스크를
// 안 지난다. 여기서는 그 칸들을 엔진의 실제 함수로 채운 뒤 길 넷을 다 지난다:
//
//   ① 리포트 → 이어하기 (IndexedDB)
//   ② 리포트 → `.rpsave` 받기 → 새 프로필에서 불러오기
//   ③ 처음부터(지우기 전 백업) → 백업에서 되찾기
//   ④ 옛 판(7)의 **진짜 모양** — 그 뒤에 생긴 칸이 아예 없는 것 — 을 지금 판으로
//
// ⚠️ **키 차례가 달라도 리포트가 써져야 한다.** 검사합이 `JSON.stringify`라서
// 예전에는 스토어 안 객체 하나의 칸 차례가 스키마와 다르기만 해도 「다시 읽은
// 리포트가 다르다」로 저장이 통째로 실패했다 (`state/report.ts`의 `writeReportVerified`)
import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createStore, del, get, set } from 'idb-keyval'
import {
  createNewSave, SAVE_VERSION, useSaveStore, type PokemonInstance, type SaveData,
} from './saveStore'
import { parseSave } from './save/schema'
import { encodePayload } from './save/codec'
import { MIGRATIONS, migrateSave } from './save/migrate'
import { buildPortable, parsePortable, serializePortable } from './save/portable'
import { createWild, fillPp, statsOf } from '../engine/pokemon/instance'
import { caughtAt, metToday } from '../engine/pokemon/origin'
import { hatch } from '../engine/pokemon/breeding'
import { toMailbox, writeMail } from '../engine/world/mail'
import { activate, trackRoute } from '../engine/world/roamer'
import { addHallOfFameEntry } from '../engine/world/hallOfFame'
import { saveLocationEvent, saveMon, saveTitle, saveTrainer } from '../engine/world/journal'
import {
  dotArtSet, historyEnqueue, modifyDotArt, registerApp, setAlarm, setCalendarMark, setMarker,
  setScreenColor, setStepCount,
} from '../engine/world/poketch'
import { finishChallenge, suspendChallenge } from '../engine/frontier/records'
import { slatherTree } from '../engine/world/honeyTree'
import { berryGrowth, plantBerry, waterPatch } from '../engine/world/berryPatches'
import { startSafari } from '../engine/world/safari'
import { addAccessory } from '../engine/world/fashionCase'
import { unlockGreeting } from '../engine/world/easyChat'
import { addRecord } from '../engine/world/gameRecords'
import { updateRadarRecords } from '../engine/world/pokeRadar'
import { encodeChatotCry, storeChatotCry } from '../engine/pokemon/chatotCry'
import { speciesById } from '../engine/battle/sim/fixtures.testkit'

const DB = createStore('radiant-platinum', 'save')
const TODAY = metToday(new Date('2026-08-10T14:03:07'))

/** 리포트를 쓰는 자리 — 깨어진 세계처럼 높이까지 든 것으로 잰다 */
const HERE = { map: 412, matrix: 0, x: 173.5, z: 752.5, facing: Math.PI / 2, y: 2, avatar: 2 }

/** 재현 가능한 난수 (mulberry32) */
function rng(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── 브라우저 다운로드 흉내 (`reportFlow.test.ts`와 같다) ──────────────────────
let grabbed: Blob[] = []
function installFakeDom(): void {
  grabbed = []
  const blobs = new Map<string, Blob>()
  let n = 0
  ;(globalThis as { document?: unknown }).document = {
    createElement: () => {
      const a = {
        href: '', download: '', rel: '', style: { display: '' },
        click: () => { const b = blobs.get(a.href); if (b) grabbed.push(b) },
        remove: () => undefined,
      }
      return a
    },
    body: { appendChild: () => undefined },
  }
  URL.createObjectURL = (blob: Blob) => {
    const url = `blob:fake/${String(n++)}`
    blobs.set(url, blob)
    return url
  }
  URL.revokeObjectURL = () => undefined
}

async function wipeDisk(): Promise<void> {
  await del('report', DB)
  await del('report.tmp', DB)
  await del('report.bak', DB)
}

/** 새 판으로 되돌린다 — 새 탭을 여는 것과 같은 자리 */
function freshStore(): void {
  useSaveStore.setState({ ...createNewSave(), hydrated: false, loaded: false, pendingInit: false })
}

/** 스토어에서 **세이브 칸만** 꺼낸다. 액션과 `hydrated` 같은 세션 칸은 뺀다 */
function saveFields(): SaveData {
  const st = useSaveStore.getState() as unknown as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(createNewSave())) out[key] = st[key]
  return out as unknown as SaveData
}

// ── 꽉 찬 판 ─────────────────────────────────────────────────────────────────

function mon(species: number, level: number, seed: number): PokemonInstance {
  const info = speciesById.get(species)
  if (!info) throw new Error(`종 ${String(species)}이 없다`)
  const save = useSaveStore.getState()
  const wild = fillPp(createWild({
    species: info, level, rng: rng(seed), otId: save.trainer.id, otSecretId: save.trainer.secretId,
  }), () => 20)
  return {
    ...wild,
    hp: statsOf(wild, info).hp,
    origin: caughtAt({ name: save.trainer.name, gender: 'female' }, 17, level, TODAY),
    ball: 4,
  }
}

/**
 * 새 게임에서 비어 있는 칸을 **엔진이 실제로 쓰는 함수로** 채운다.
 *
 * ⚠️ 값을 손으로 적으면 그 모양이 엔진이 만드는 모양과 어긋나도 모른다 —
 * 검사합이 칸 차례까지 보므로 그 어긋남이 곧 저장 실패였다
 */
function fillRichState(): void {
  const st = useSaveStore.getState()
  useSaveStore.setState({
    trainer: {
      ...st.trainer, name: '나빛', gender: 'girl', id: 12345, secretId: 54321,
      playtimeMs: 123_456_789, firstClearedAt: 1_786_000_000_000, tabletName: '석판', appearance: 3,
    },
    rivalName: '용식',
  })

  // 파티 — 편지를 든 마리 · 부화한 마리 · 알 · 독
  const letter = writeMail(2, {
    trainerId: 12345, trainerName: '나빛', trainerGender: 1,
    party: [{ species: 393, form: 0, isEgg: false }, { species: 175, form: 0, isEgg: true }],
  }, [[1, 2], [3, 0xffff], [0xffff, 0xffff]])
  const piplup = { ...mon(393, 36, 1), nickname: '팽도리', heldItem: 137, mail: letter, pokerus: 0x13 }
  const hatched = hatch({ ...mon(175, 1, 2), isEgg: true }, 2000, TODAY)
  const egg = { ...mon(172, 1, 3), isEgg: true, friendship: 10 }
  const poisoned = { ...mon(41, 22, 4), status: 'psn' as const }
  const unown = { ...mon(201, 25, 5), form: 7 }
  useSaveStore.setState({ party: [piplup, hatched, egg, poisoned, unown] })
  for (const m of [393, 175, 41, 201]) useSaveStore.getState().markCaught(m)
  useSaveStore.getState().markSeen(487)
  useSaveStore.getState().markBattled(150)
  useSaveStore.getState().markUnownForm(7)
  useSaveStore.getState().markUnownForm(0)
  useSaveStore.getState().obtainNationalDex()

  // 박스 — 지금 박스를 옮겨 두고 맡긴다. 마지막 박스 마지막 칸도 채운다
  useSaveStore.getState().setCurrentBox(4)
  expect(useSaveStore.getState().depositMon(3)).not.toBeNull()
  useSaveStore.getState().setBoxSlot({ box: 17, slot: 29 }, mon(448, 50, 6))
  useSaveStore.setState((s) => ({
    wallpapers: s.wallpapers.map((w, i) => (i === 2 ? 17 : w)),
    unlockedWallpapers: 0b1010_0101,
    boxNames: s.boxNames.map((n, i) => (i === 1 ? '전설' : n)),
  }))

  // 가방 · 돈 · 배지 · 공중날기
  const s1 = useSaveStore.getState()
  s1.addItem(0, 17, 5)
  s1.addItem(1, 1, 3)
  s1.addItem(3, 328, 1)
  s1.addItem(4, 149, 12)
  s1.addMoney(987_654)
  for (let b = 0; b < 8; b++) s1.giveBadge(b)
  s1.unlockFly(3)
  s1.unlockFly(11)
  s1.setHealSpot(7)
  s1.giveSiwonGift()
  s1.meetSiwon()
  s1.setMapFeatures({ map: 67, data: [1, 0xdeadbeef, 3] })

  // 스크립트 플래그 · 변수
  const flags = new Uint8Array(useSaveStore.getState().flags)
  flags[0] = 0xff; flags[flags.length - 1] = 0x01; flags[300] = 0x5a
  const vars = new Uint16Array(useSaveStore.getState().vars)
  vars[0] = 1; vars[vars.length - 1] = 0xffff; vars[80] = 4
  useSaveStore.getState().commitScriptState(vars, flags)

  // 육성가 · 배회 · 떠나온 맵
  const save = useSaveStore.getState()
  const roamers = activate(save.roamers, 0, 350, {
    pid: 0xcafebabe, ivs: { hp: 31, atk: 0, def: 15, spa: 7, spd: 30, spe: 1 }, maxHp: 140,
  })
  useSaveStore.setState({
    daycare: {
      slots: [{ mon: mon(132, 40, 7), steps: 5000, levelIn: 38 }, { mon: mon(25, 30, 8), steps: 12, levelIn: 30 }],
      eggPid: 0x1234abcd, cycle: 200,
    },
    roamers: roamers.map((r, i) => (i === 0 ? { ...r, hp: 77, status: 'par' as const, at: 12 } : r)),
    recentRoutes: trackRoute(trackRoute(save.recentRoutes, 350), 351),
    runningShoes: true,
    steps: { poison: 2, repel: 99 },
    exit: { map: 356, matrix: 0, x: 22.5, z: 18.5, facing: 0 },
    flute: 2,
    coins: 49_999,
    registeredItem: 450,
    battlePoints: 321,
    hourPin: 21.5,
    chatotCry: encodeChatotCry(storeChatotCry(Array.from({ length: 2000 }, (_, i) => (i % 15) - 7))),
  })

  // 모험노트 · 포켓치 · 깨어진 세계 · 전당 · 기록
  const s2 = useSaveStore.getState()
  const page = saveTrainer(saveMon(saveLocationEvent(
    saveTitle(s2.journal[0]!, { year: 26, month: 8, day: 10, week: 1, mapId: 412 }),
    { type: 1, locationId: 412 },
  ), { result: 1, variant: 2, timeOfDay: 3, gender: 1, species: 393 }), { standard: 1, trainerId: 250, mapId: 412 })
  let poketch = registerApp(registerApp(s2.poketch, 3), 17)
  poketch = setScreenColor(poketch, 5)
  poketch = setStepCount(poketch, 424_242)
  poketch = setAlarm(poketch, true, 7, 30)
  poketch = setCalendarMark(poketch, s2.poketch.calendar.month, 12)
  poketch = setMarker(poketch, 2, 120, 64)
  poketch = historyEnqueue(poketch, { species: 393, form: 0 })
  poketch = modifyDotArt(poketch, dotArtSet(poketch.dotArt, 3, 4, 2))
  useSaveStore.setState({
    journal: [page, ...s2.journal.slice(1)],
    poketch,
    distortion: {
      ...s2.distortion, valid: true, hiddenGroups: 0b101, platformIndex: 3,
      cameraAngleX: 0x1000, cameraAngleY: 0xfff0, cameraAngleZ: 7, platformFlags: 0x55, puzzleFlags: 0x8001,
      boulders: [{ map: 582, localID: 2, x: 110, z: 64 }],
    },
    hallOfFame: addHallOfFameEntry(s2.hallOfFame, useSaveStore.getState().party, TODAY),
    records: addRecord(addRecord(s2.records, 1, 12_345), 70, 3),
  })

  // 팩토리 — 끝낸 도전 하나와 「쉰다」로 접은 도전 하나
  const rental = [mon(6, 50, 9), mon(9, 50, 10), mon(3, 50, 11)]
  const factory = suspendChallenge(finishChallenge(s2.factory, 1, 14, 3, true), 0, 6, 2, {
    challenge: 0, openLevel: false, battle: 4, trainers: [1, 2, 3, 4, 5, 6, 7],
    party: rental, partySets: [{ set: 10, ivs: 4 }, { set: 11, ivs: 4 }, { set: 12, ivs: 4 }],
    defeated: rental.slice(0, 2), defeatedSets: [{ set: 20, ivs: 8 }, { set: 21, ivs: 8 }],
  })

  // 꿀 나무 · 레이더 · 나무열매 · 사파리 · 장식 · 낱말 · 날마다
  const s3 = useSaveStore.getState()
  const growth = berryGrowth(5)
  if (!growth) throw new Error('나무열매 5번 자람표가 없다')
  const patches = [...s3.berryPatches]
  patches[0] = waterPatch(plantBerry(patches[0]!, growth, 5))
  patches[127] = { ...plantBerry(patches[127]!, growth, 5), isGrowing: true }
  useSaveStore.setState({
    factory,
    honeyTrees: slatherTree(s3.honeyTrees, 4, false, { keep: 0.5, group: 0.3, slot: 0.7, shakes: 0.2 }),
    radar: { charge: 17, records: updateRadarRecords(s3.radar.records, 399, 40) },
    berryPatches: patches,
    safari: { ...s3.safari, ...startSafari(), caught: 3, tram: s3.safari.tram },
    fashionCase: addAccessory(addAccessory(s3.fashionCase, 0, 3), 90, 1),
    easyChatUnlocks: unlockGreeting(s3.easyChatUnlocks, 5),
    // 파티에서 떼어 우편함으로 옮긴 편지 한 장
    mailbox: toMailbox(s3.mailbox, writeMail(7, {
      trainerId: 12345, trainerName: '나빛', trainerGender: 1, party: [{ species: 393, form: 0, isEgg: false }],
    }, [[4, 5], [6, 7], [8, 9]]))?.box ?? s3.mailbox,
    daily: { ...s3.daily, swarms: true, trophy: [3, 9] },
  })
}

beforeEach(async () => {
  installFakeDom()
  await wipeDisk()
  freshStore()
})

afterEach(() => {
  delete (globalThis as { document?: unknown }).document
})

describe('꽉 찬 판', () => {
  it('스키마가 모든 칸을 든다 — 빠진 칸 · 덧붙은 칸 · 다른 값이 없다', () => {
    fillRichState()
    const rich = { ...saveFields(), position: HERE }
    // 새 게임과 달라야 잰 의미가 있다 — 칸마다 확인한다
    const blank = createNewSave() as unknown as Record<string, unknown>
    const same = Object.keys(blank).filter((k) => k !== 'version'
      && encodePayload(blank[k]) === encodePayload((rich as unknown as Record<string, unknown>)[k]))
    expect(same).toEqual([])

    // 빠진 칸도 덧붙은 칸도 없다 — 스키마에 없는 칸은 쓸 때 조용히 떨어진다
    expect(parseSave(rich)).toStrictEqual(rich)
  })
})

describe('① 리포트 → 이어하기', () => {
  it('쓴 그대로 돌아온다', async () => {
    fillRichState()
    const got = await useSaveStore.getState().report(HERE)
    expect(got.why).toBeUndefined()
    expect(got.saved).toBe(true)
    const want = { ...saveFields(), position: HERE }

    freshStore()
    expect(await useSaveStore.getState().loadReport()).toBe(true)
    expect(saveFields()).toStrictEqual(want)
    const st = useSaveStore.getState()
    expect(st.loaded).toBe(true)
    expect(st.hydrated).toBe(true)
    expect(st.pendingInit).toBe(false)
  })

  it('디스크에 남은 칸이 새 게임의 칸과 같은 이름 · 같은 차례다', async () => {
    fillRichState()
    await useSaveStore.getState().report(HERE)
    const raw = await get<Record<string, unknown>>('report', DB)
    expect(Object.keys(raw ?? {})).toEqual(Object.keys(createNewSave()))
  })

  it('⚠️ 이어하기가 새 판 초기화 표식을 내린다 — 남아 있으면 불러온 판 위에 새 게임 스크립트가 돈다', async () => {
    fillRichState()
    await useSaveStore.getState().report(HERE)
    useSaveStore.setState({ pendingInit: true })
    expect(await useSaveStore.getState().loadReport()).toBe(true)
    expect(useSaveStore.getState().pendingInit).toBe(false)
  })

  it('⚠️ 칸 차례가 스키마와 달라도 저장된다 — 차례는 뜻이 없다', async () => {
    fillRichState()
    const st = useSaveStore.getState()
    // 자리를 다른 차례로 넘기고, 파티 한 마리와 육성가도 칸 차례를 뒤집는다
    const flipped = (o: object): object => Object.fromEntries(Object.entries(o).reverse())
    useSaveStore.setState({
      party: [flipped(st.party[0]!) as PokemonInstance, ...st.party.slice(1)],
      daycare: flipped(st.daycare) as SaveData['daycare'],
    })
    const where = flipped(HERE) as SaveData['position']
    const got = await useSaveStore.getState().report(where)
    expect(got.why).toBeUndefined()
    expect(got.saved).toBe(true)

    const want = { ...saveFields(), position: where }
    freshStore()
    expect(await useSaveStore.getState().loadReport()).toBe(true)
    // 값은 같다 — 차례만 스키마 차례로 돌아온다
    expect(saveFields()).toEqual(want)
  })
})

describe('② 리포트 → .rpsave → 새 프로필', () => {
  it('받은 파일 하나로 같은 판이 선다', async () => {
    fillRichState()
    const got = await useSaveStore.getState().report(HERE)
    expect(got.saved).toBe(true)
    const want = { ...saveFields(), position: HERE }
    expect(grabbed).toHaveLength(1)
    const text = await grabbed[0]!.text()

    // 새 프로필 — 디스크도 스토어도 빈다
    await wipeDisk()
    freshStore()
    const preview = await useSaveStore.getState().previewImport(text)
    expect(preview.ok).toBe(true)
    if (!preview.ok) return
    expect(preview.migrated).toBe(false)
    const done = await useSaveStore.getState().commitImport(preview)
    expect(done.ok).toBe(true)
    expect(saveFields()).toStrictEqual(want)

    // 들인 것이 디스크에도 남았다 — 다시 켜도 같다
    freshStore()
    expect(await useSaveStore.getState().loadReport()).toBe(true)
    expect(saveFields()).toStrictEqual(want)
  })

  it('「세이브 파일 내보내기」도 같은 판을 낸다', async () => {
    fillRichState()
    await useSaveStore.getState().report(HERE)
    const want = { ...saveFields(), position: HERE }
    grabbed = []
    const out = await useSaveStore.getState().exportReport()
    expect(out.kind).toBe('done')
    expect(grabbed).toHaveLength(1)
    const parsed = parsePortable(await grabbed[0]!.text())
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parseSave(parsed.data)).toStrictEqual(want)
  })
})

describe('③ 처음부터 → 백업에서 되찾기', () => {
  it('지우기 전 한 벌이 칸 하나 안 잃고 돌아온다', async () => {
    fillRichState()
    await useSaveStore.getState().report(HERE)
    const want = { ...saveFields(), position: HERE }

    await useSaveStore.getState().resetSave()
    expect(saveFields().party).toEqual([])
    const kept = await useSaveStore.getState().previewBackup()
    expect(kept.kind).toBe('ok')
    if (kept.kind !== 'ok') return
    const done = await useSaveStore.getState().restoreBackup(kept.save)
    expect(done.ok).toBe(true)
    expect(saveFields()).toStrictEqual(want)

    freshStore()
    expect(await useSaveStore.getState().loadReport()).toBe(true)
    expect(saveFields()).toStrictEqual(want)
  })
})

describe('④ 옛 판의 진짜 모양', () => {
  /**
   * 판 7의 리포트 — **그 뒤에 생긴 칸이 아예 없다.**
   *
   * ⚠️ 새 게임에 `version`만 7로 적은 것으로 재면 이주 함수가 빠뜨린 칸을 못
   * 잡는다 — 지금 칸이 이미 다 들어 있어서 마지막 스키마가 그냥 통과한다
   */
  function version7(withDaycare: boolean): Record<string, unknown> {
    fillRichState()
    const now = { ...saveFields(), position: HERE } as unknown as Record<string, unknown>
    /** 그 뒤에 생긴 칸을 뺀 사본 */
    const without = (o: unknown, ...keys: string[]): Record<string, unknown> =>
      Object.fromEntries(Object.entries(o as object).filter(([k]) => !keys.includes(k)))
    const strip = (m: unknown): unknown => without(m, 'origin', 'form', 'pokerus', 'mail', 'isEgg')
    const party = (now.party as unknown[]).map(strip)
    const boxes = (now.boxes as unknown[][]).map((box) => box.map((m) => (m === null ? null : strip(m))))
    const dex = without(now.pokedex, 'battled', 'unownForms')
    const trainer = without(now.trainer, 'firstClearedAt', 'tabletName', 'appearance')
    const position = without(now.position, 'y', 'avatar')
    const old: Record<string, unknown> = {
      version: 7, trainer, rivalName: now.rivalName, party, boxes, currentBox: now.currentBox,
      wallpapers: now.wallpapers, bag: now.bag, badges: now.badges, pokedex: dex,
      nationalDex: now.nationalDex, flags: now.flags, vars: now.vars, position,
      money: now.money, healSpot: now.healSpot, flySpots: now.flySpots, runningShoes: now.runningShoes,
    }
    if (!withDaycare) return old
    // 판 10에서 육성가가 생겼다 — 거기 맡겨 둔 마리는 판 11의 출신 칸이 없다
    const v10 = stepUp(old, 10)
    return {
      ...v10,
      daycare: { ...(now.daycare as object), slots: (now.daycare as { slots: { mon: unknown }[] }).slots
        .map((slot) => ({ ...slot, mon: { ...(strip(slot.mon) as object), isEgg: false } })) },
    }
  }

  /** 이주 표를 `target`까지만 돌린다 — `migrateSave`의 고리를 그 자리에서 멈춘 것이다 */
  function stepUp(data: Record<string, unknown>, target: number): Record<string, unknown> {
    let d = data
    while ((d.version as number) < target) {
      const at = d.version as number
      d = { ...MIGRATIONS[at]!(d), version: at + 1 }
    }
    return d
  }

  it('판 7이 지금 판까지 오른다 — 가진 것은 그대로, 없던 칸은 비어서', () => {
    const old = version7(false)
    const got = migrateSave(old, SAVE_VERSION)
    expect(got.kind === 'ok' ? 'ok' : got).toBe('ok')
    if (got.kind !== 'ok') return
    expect(got.save.trainer.name).toBe('나빛')
    expect(got.save.party.map((m) => m.species)).toEqual([393, 175, 172, 201])
    expect(got.save.boxes[4]?.[0]?.species).toBe(41)
    expect(got.save.money).toBe((old.money as number))
    expect(got.save.flags).toStrictEqual(old.flags)
    expect(got.save.vars[0]).toBe(1)
    expect(got.save.position).toMatchObject({ ...(old.position as object), y: null, avatar: 0 })
  })

  it('⚠️ 판 10의 육성가 마리도 판 11의 출신 칸을 받는다 — 안 받으면 리포트 전체를 못 읽는다', () => {
    const got = migrateSave(version7(true), SAVE_VERSION)
    expect(got.kind === 'ok' ? 'ok' : got).toBe('ok')
    if (got.kind !== 'ok') return
    const kept = got.save.daycare.slots[0]
    expect(kept?.mon.species).toBe(132)
    expect(kept?.mon.origin.otName).toBe('나빛')
    expect(kept?.mon.form).toBe(0)
  })

  it('옛 판 파일도 새 프로필에서 들어온다', async () => {
    const old = version7(false)
    const text = serializePortable(buildPortable(old as unknown as SaveData, new Date()))
    await wipeDisk()
    freshStore()
    const preview = await useSaveStore.getState().previewImport(text)
    expect(preview.ok ? 'ok' : preview.why).toBe('ok')
    if (!preview.ok) return
    expect(preview.migrated).toBe(true)
    expect((await useSaveStore.getState().commitImport(preview)).ok).toBe(true)
    expect(useSaveStore.getState().trainer.name).toBe('나빛')
    expect(await get('report', DB)).toBeDefined()
  })

  it('옛 판 리포트가 디스크에 있으면 이어하기가 옮겨서 연다', async () => {
    await set('report', version7(false), DB)
    freshStore()
    expect(await useSaveStore.getState().loadReport()).toBe(true)
    expect(useSaveStore.getState().version).toBe(SAVE_VERSION)
    expect(useSaveStore.getState().party).toHaveLength(4)
  })
})

