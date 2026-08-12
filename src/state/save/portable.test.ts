// 휴대용 봉투와 스키마·이전 (PLAN §9.3 · IMPORT.md §10~11)
//
// ⚠️ 여기서 재는 것은 "잘 읽힌다"가 아니라 **"못 읽는 것을 못 읽는다고 하는가"**다.
// 손상된 파일이 조용히 통과해서 게임 한복판에서 터지는 것이 제일 나쁘다.
import { describe, it, expect } from 'vitest'
import {
  buildPortable, buildPortableRaw, explainFailure, MAX_PORTABLE_BYTES,
  parsePortable, PORTABLE_MAGIC, serializePortable,
} from './portable'
import { safeParseSave } from './schema'
import { migrateSave, oldestSupported, type Migration } from './migrate'
import { saveFileName } from './download'
import { checksum, encodePayload } from './codec'
import { createNewSave, SAVE_VERSION } from '../saveStore'
import { noOrigin } from '../../engine/pokemon/origin'
import { dexSet } from '../../engine/pokemon/dex'

const AT = new Date('2026-08-10T14:03:07')

function filled() {
  const save = createNewSave()
  save.trainer.name = '나빛'
  save.trainer.playtimeMs = 3_723_000
  save.money = 12345
  save.badges = 0b101
  save.pokedex.seen = dexSet(save.pokedex.seen, 387)
  save.pokedex.caught = dexSet(save.pokedex.caught, 387)
  save.flags[10] = 0x81
  save.vars[7] = 40000
  save.party = [{
    species: 387, pid: 0x1234abcd, nickname: '모부', exp: 135, level: 5,
    ivs: { hp: 31, atk: 4, def: 9, spa: 12, spd: 3, spe: 20 },
    evs: { hp: 0, atk: 4, def: 0, spa: 0, spd: 0, spe: 0 },
    moves: [{ move: 33, pp: 35, ppUps: 0 }, { move: 45, pp: 40, ppUps: 0 }],
    hp: 19, status: 'psn', statusTurns: 0, heldItem: 17,
    friendship: 70, isEgg: false, otId: 40404, otSecretId: 12, ball: 4,
    origin: noOrigin({ name: '', gender: 'male' }),
  }]
  return save
}

describe('왕복', () => {
  it('쓴 그대로 돌아온다 — 파티·도감·플래그·변수까지', () => {
    const save = filled()
    const got = parsePortable(serializePortable(buildPortable(save, AT)))
    expect(got.ok).toBe(true)
    if (!got.ok) return

    const parsed = safeParseSave(got.data)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return

    expect(parsed.save).toEqual(save)
    expect(got.envelope.magic).toBe(PORTABLE_MAGIC)
    expect(got.envelope.saveVersion).toBe(SAVE_VERSION)
    expect(got.envelope.summary.trainer).toBe('나빛')
    expect(got.envelope.createdAt).toBe(AT.toISOString())
  })

  it('봉투에 원본 파일명·경로·ROM 해시가 없다 (COPYRIGHT.md §7)', () => {
    const text = serializePortable(buildPortable(filled(), AT))
    for (const forbidden of ['.nds', 'raw/', 'romfs', 'AssetAssistant', 'prod.keys', 'C:\\']) {
      expect(text, forbidden).not.toContain(forbidden)
    }
  })

  it('가득 찬 세이브도 상한 안이다', () => {
    // 박스 540칸을 다 채운다 — 실측이 상한의 몇 분의 일인지 알아야 상한이 뜻을 갖는다
    const save = filled()
    const one = save.party[0]!
    save.boxes = save.boxes.map((box) => box.map(() => ({ ...one })))
    const bytes = new TextEncoder().encode(serializePortable(buildPortable(save, AT))).byteLength
    expect(bytes).toBeLessThan(MAX_PORTABLE_BYTES)
    // 여유가 열 배는 돼야 상한이 사고를 막는 장치지 발목이 아니다
    expect(bytes * 10).toBeLessThan(MAX_PORTABLE_BYTES)
  })
})

describe('망가진 파일', () => {
  const good = () => serializePortable(buildPortable(filled(), AT))

  it('우리 파일이 아니면 거절한다', () => {
    for (const text of ['', '{}', 'not json', JSON.stringify({ magic: 'OTHER' })]) {
      const got = parsePortable(text)
      expect(got.ok, text).toBe(false)
    }
  })

  it('⚠️ payload 한 글자가 뒤집히면 체크섬이 잡는다', () => {
    const env = JSON.parse(good()) as Record<string, unknown>
    const payload = env.payload as string
    // 값 하나를 바꾼다. 여전히 올바른 JSON이라 파싱만으로는 절대 안 걸린다
    env.payload = payload.replace('"money":12345', '"money":99999')
    const got = parsePortable(JSON.stringify(env))
    expect(got.ok).toBe(false)
    if (got.ok) return
    expect(got.fail.kind).toBe('checksum')
    expect(explainFailure(got.fail)).toContain('손상')
  })

  it('체크섬은 payload를 해석하기 전에 본다', () => {
    // 순서가 뒤집히면 손상된 바이트를 JSON.parse가 먼저 만나서, 왜 실패했는지
    // 알 수 없는 오류가 나온다
    const env = JSON.parse(good()) as Record<string, unknown>
    env.payload = '{{{'
    const got = parsePortable(JSON.stringify(env))
    expect(got.ok).toBe(false)
    if (!got.ok) expect(got.fail.kind).toBe('checksum')
  })

  it('모르는 코덱은 거절한다', () => {
    const env = JSON.parse(good()) as Record<string, unknown>
    env.codec = 'json+something-else'
    const got = parsePortable(JSON.stringify(env))
    expect(got.ok).toBe(false)
    if (!got.ok) expect(got.fail.kind).toBe('unknown-codec')
  })

  it('더 새 형식은 손대지 않고 물러선다', () => {
    const env = JSON.parse(good()) as Record<string, unknown>
    env.formatVersion = 99
    const got = parsePortable(JSON.stringify(env))
    expect(got.ok).toBe(false)
    if (!got.ok) expect(got.fail.kind).toBe('format-too-new')
  })

  it('너무 큰 파일은 읽기 전에 세운다', () => {
    const got = parsePortable('x'.repeat(MAX_PORTABLE_BYTES + 1))
    expect(got.ok).toBe(false)
    if (!got.ok) expect(got.fail.kind).toBe('too-big')
  })

  it('크기는 글자 수가 아니라 바이트로 잰다', () => {
    // 한글은 UTF-8에서 3바이트다. 글자 수로 재면 상한이 세 배로 헐거워진다
    const got = parsePortable('가'.repeat(MAX_PORTABLE_BYTES / 3 + 10))
    expect(got.ok).toBe(false)
    if (!got.ok) expect(got.fail.kind).toBe('too-big')
  })
})

describe('스키마', () => {
  it('멀쩡한 새 세이브는 통과한다', () => {
    expect(safeParseSave(createNewSave()).ok).toBe(true)
  })

  it('범위를 벗어난 값을 잡는다', () => {
    const bad = [
      { ...createNewSave(), money: -1 },
      { ...createNewSave(), money: 1_000_000 },
      { ...createNewSave(), currentBox: 18 },
      { ...createNewSave(), badges: 256 },
      { ...createNewSave(), party: [null] },
    ]
    for (const v of bad) expect(safeParseSave(v).ok, JSON.stringify(Object.keys(v))).toBe(false)
  })

  it('⚠️ 길이가 어긋난 비트필드를 잡는다 — 한 바이트 짧으면 도감 끝이 사라진다', () => {
    const save = createNewSave()
    const got = safeParseSave({ ...save, pokedex: { ...save.pokedex, seen: new Uint8Array(63) } })
    expect(got.ok).toBe(false)
    if (!got.ok) expect(got.why).toContain('pokedex.seen')
  })

  it('⚠️ 평범한 객체가 된 TypedArray를 잡는다 — JSON을 그냥 지난 그 모양', () => {
    const save = createNewSave()
    const wrecked = JSON.parse(JSON.stringify(save)) as unknown
    expect(safeParseSave(wrecked).ok).toBe(false)
  })

  it('주머니 칸 수 상한을 본다 — 볼 주머니는 15칸이다', () => {
    const save = createNewSave()
    const bag = save.bag.map((p) => [...p])
    bag[2] = Array.from({ length: 16 }, (_, i) => ({ item: i + 1, count: 1 }))
    expect(safeParseSave({ ...save, bag }).ok).toBe(false)
  })
})

describe('버전 이전', () => {
  it('같은 판은 그대로 통과한다', () => {
    const got = migrateSave(createNewSave(), SAVE_VERSION)
    expect(got.kind).toBe('ok')
    if (got.kind === 'ok') expect(got.migrated).toBe(false)
  })

  it('더 새 판은 손대지 않는다', () => {
    const got = migrateSave({ ...createNewSave(), version: SAVE_VERSION + 1 }, SAVE_VERSION)
    expect(got.kind).toBe('too-new')
  })

  it('옮길 길이 없는 옛 판은 "없는 리포트"가 아니라 "못 옮긴다"다', () => {
    // ⚠️ 이 구분이 이 파일의 이유다. 예전에는 둘 다 null이었고, 화면에는
    // "리포트가 없다"로만 보여서 진행이 사라진 것처럼 느껴졌다
    const got = migrateSave({ ...createNewSave(), version: 3 }, SAVE_VERSION)
    expect(got.kind).toBe('unsupported-old')
    if (got.kind === 'unsupported-old') expect(got.found).toBe(3)
  })

  it('표가 있으면 한 칸씩 올라간다', () => {
    // ⚠️ `SAVE_VERSION`은 7이고 여태 한 번도 안 올랐다 — 1~6으로 저장된 리포트는
    // 세상에 없어서 진짜 표가 비어 있다. **없는 과거를 지어내는 대신** 가짜 표로
    // 장치가 도는지만 잰다. 8이 되는 날 `MIGRATIONS[7]`을 적으면 이 길로 간다
    const steps: number[] = []
    const table: Record<number, Migration> = {
      5: (d) => { steps.push(5); return { ...d, money: 111 } },
      6: (d) => { steps.push(6); return { ...d, badges: 3 } },
    }
    const got = migrateSave({ ...createNewSave(), version: 5, money: 0 }, 7, table)

    expect(steps).toEqual([5, 6])
    expect(got.kind).toBe('ok')
    if (got.kind !== 'ok') return
    expect(got.migrated).toBe(true)
    expect(got.save.version).toBe(7)
    expect(got.save.money).toBe(111)
    expect(got.save.badges).toBe(3)
  })

  it('⚠️ 이전 함수가 어긋난 값을 만들면 마지막 스키마가 잡는다', () => {
    const table: Record<number, Migration> = { 6: (d) => ({ ...d, money: -5 }) }
    const got = migrateSave({ ...createNewSave(), version: 6 }, 7, table)
    expect(got.kind).toBe('invalid')
  })

  it('닿을 수 있는 가장 낮은 판을 센다', () => {
    expect(oldestSupported(7, {})).toBe(7)
    expect(oldestSupported(7, { 6: (d) => d, 5: (d) => d })).toBe(5)
  })
})

describe('못 읽는 리포트도 파일로 돌려준다', () => {
  it('원본을 그대로 싣고, 다시 열면 같은 것이 나온다', () => {
    // 판 99로 저장된 알 수 없는 것. 우리는 못 읽지만 **버리지는 않는다**
    const alien = { version: 99, 뭔가: [1, 2, 3], bits: new Uint8Array([9, 8]) }
    const env = buildPortableRaw(alien, 99, AT)
    const got = parsePortable(serializePortable(env))

    expect(got.ok).toBe(true)
    if (!got.ok) return
    expect(got.envelope.saveVersion).toBe(99)
    expect(got.data).toEqual(alien)
    // 우리가 읽을 수 있는 세이브는 아니다 — 그게 정상이다
    expect(safeParseSave(got.data).ok).toBe(false)
  })
})

describe('파일 이름', () => {
  it('주인공과 그 기계의 시각이 들어간다', () => {
    expect(saveFileName('나빛', AT)).toBe('radiant-platinum_나빛_2026-08-10_14-03-07.rpsave')
  })

  it('경로 문자를 지운다 — 이름이 곧 파일 이름이 되면 안 된다', () => {
    expect(saveFileName('a/b\\c:d*?', AT)).toContain('radiant-platinum_abcd_')
  })

  it('이름이 비어도 파일이 만들어진다', () => {
    expect(saveFileName('', AT)).toContain('이름없음')
  })
})

describe('체크섬이 봉투 밖 변조를 못 막는다는 사실', () => {
  it('payload만 지킨다 — 요약을 바꿔도 통과한다', () => {
    // ⚠️ 이건 결함이 아니라 **설계**다. 보안 서명이 아니라 손상 탐지 장치이고,
    // 게임을 굴리는 값은 전부 payload 안에 있다. 요약은 열기 전에 보여 주는 글일
    // 뿐이라 틀려도 판이 안 바뀐다 — 그 사실을 여기 적어 둔다
    // ⚠️ 세이브를 두 번 만들면 안 된다 — `createNewSave`가 트레이너 번호를
    // 난수로 굴려서 두 벌의 체크섬이 애초에 다르다
    const save = filled()
    const env = JSON.parse(serializePortable(buildPortable(save, AT))) as Record<string, unknown>
    env.summary = { trainer: '남의이름', playtimeMs: 0, build: '9.9.9' }
    const got = parsePortable(JSON.stringify(env))
    expect(got.ok).toBe(true)
    if (got.ok) expect(got.envelope.checksum).toBe(checksum(encodePayload(save)))
  })
})
