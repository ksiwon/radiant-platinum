// NPC 그림 → BDSP 모델 잇기 (DATA.md §2.16)
//
// 여기서 지키는 것 넷:
//
//   ① **짐작으로 잇지 않는다.** 짝마다 근거가 붙어 있어야 한다 — BDSP가 적어 둔
//      갈래표거나, 플래티넘 배치표가 세어 준 갈래거나, 글자가 같은 이름표다.
//   ② **그럴듯한 짝을 못 만들게 한다.** 느슨하게 맞추면 `PARASOL_LADY → lady`
//      (진짜는 `parasollady`)나 `MIDDLE_AGED_WOMAN → man`이 조용히 섞인다.
//   ③ **이름이 같은 갈래가 배치 통계보다 먼저다.** `RANCHER` 그림으로 선
//      트레이너는 「벨과 아빠」가 더 많은데 그 갈래의 몸은 카우걸이다.
//   ④ **포켓몬은 사람 표에 안 든다.** `PIKACHU` 그림으로 선 트레이너 셋이 전부
//      포켓몬키즈라, 안 막으면 야생 피카츄 자리에 여자아이가 선다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import {
  NPC_BUNDLE, NPC_MODEL_ALIAS, SPRITE_CLASS_ALIAS, bundlesByTag, buildOf, classOfSprite,
  modelFor, modelTagFor, normalize, trainerModelBundle, type NpcModelTable,
} from './npcModels'
import { TRAINER_MODELS } from '../../import/bdsp/trainerModels'
import { SPRITE_TRAINER_CLASS, TRAINER_CLASS_NAMES } from '../../import/platinum/trainerClasses'
import { OVERWORLD_MON_NAMES } from './overworldMon'
import { withData } from '../../data/romData.testkit'

const DATA = resolve(__dirname, '../../../public/data')
const maybe = withData('bdspNpc.json', 'npcSprites.json')

const models = (): NpcModelTable =>
  JSON.parse(readFileSync(resolve(DATA, 'bdspNpc.json'), 'utf8')) as NpcModelTable
const sprites = (): Record<string, { name: string }> =>
  JSON.parse(readFileSync(resolve(DATA, 'npcSprites.json'), 'utf8')) as Record<string, { name: string }>

/** 낱말로만 이어지는 자리를 재려고 쓰는 작은 표 */
const tagTable = (battle: string[], field: string[]): NpcModelTable => ({
  battle: {
    bundles: Object.fromEntries(battle.map((t, i) => [`tr90${String(i).padStart(2, '0')}_00`, [t]])),
    vocabulary: battle,
  },
  field: {
    bundles: Object.fromEntries(field.map((t, i) => [`fc90${String(i).padStart(2, '0')}_00`, [t]])),
    vocabulary: field,
  },
})

describe('이름 다듬기', () => {
  it('대소문자와 밑줄을 지운다', () => {
    expect(normalize('BUG_CATCHER')).toBe('bugcatcher')
    expect(normalize('bugcatcher')).toBe('bugcatcher')
    expect(normalize('cyclistM')).toBe('cyclistm')
  })
})

describe('근거표', () => {
  it('갈래마다 왜 그 몸인지가 적혀 있다', () => {
    expect(TRAINER_MODELS.length).toBeGreaterThan(90)
    for (const [cls, bundle, , via] of TRAINER_MODELS) {
      expect(TRAINER_CLASS_NAMES[cls], `갈래 ${String(cls)}`).toBeTruthy()
      expect(bundle, `갈래 ${String(cls)}`).toMatch(/^(tr|pc|fc)\d{4}_\d{2}$/)
      expect(via.length, `갈래 ${String(cls)}`).toBeGreaterThan(0)
    }
  })

  // ⚠️ BDSP에는 배틀 프론티어가 없다. 없는 것을 억지로 이으면 엉뚱한 사람이
  // 서므로 그 다섯은 비어 있는 것이 맞다
  it('BDSP에 없는 갈래는 비어 있다', () => {
    const have = new Set(TRAINER_MODELS.map((r) => r[0]))
    const missing = TRAINER_CLASS_NAMES
      .map((name, i) => [name, i] as const)
      .filter(([, i]) => !have.has(i))
      .map(([name]) => name)
    expect(missing).toEqual([
      'SIS_AND_BRO', 'MAID', 'HALL_MATRON', 'FACTORY_HEAD', 'ARCADE_STAR', 'CASTLE_VALET',
    ])
  })

  it('배치표가 센 갈래는 과반이다', () => {
    for (const [sprite, , hit, all] of SPRITE_TRAINER_CLASS) {
      expect(hit * 2, `그림 ${String(sprite)}`).toBeGreaterThan(all)
    }
  })
})

describe('짝 짓는 규칙', () => {
  it('그림 이름이 곧 갈래 이름이면 그것으로 잇는다', () => {
    expect(classOfSprite('YOUNGSTER')).toBe(TRAINER_CLASS_NAMES.indexOf('YOUNGSTER'))
    // 성별 꼬리 꼴이 다르다 — `_M` ↔ `_MALE`
    expect(classOfSprite('SWIMMER_M')).toBe(TRAINER_CLASS_NAMES.indexOf('SWIMMER_MALE'))
    // 고유명은 갈래 쪽에 자리 앞머리가 붙어 있다
    expect(classOfSprite('CYNTHIA')).toBe(TRAINER_CLASS_NAMES.indexOf('CHAMPION_CYNTHIA'))
    expect(classOfSprite('ROARK')).toBe(TRAINER_CLASS_NAMES.indexOf('LEADER_ROARK'))
    expect(classOfSprite('MARS')).toBe(TRAINER_CLASS_NAMES.indexOf('COMMANDER_MARS'))
  })

  // ⚠️ 이름만 봐서는 못 잇는 자리다. 배치표에서 `EXPERT_M`으로 선 트레이너
  // 여덟이 전부 베테랑이라 게임 자료가 짝을 알려 준다
  it('이름으로 안 되면 배치표가 세어 준 갈래를 쓴다', () => {
    expect(classOfSprite('EXPERT_M', 17)).toBe(TRAINER_CLASS_NAMES.indexOf('VETERAN'))
    expect(classOfSprite('GRUNT_M', 124)).toBe(TRAINER_CLASS_NAMES.indexOf('GALACTIC_GRUNT_MALE'))
    // 번호를 안 주면 배치표를 못 본다
    expect(classOfSprite('EXPERT_M')).toBeNull()
  })

  // ⚠️ 그림 하나로 갈래 셋이 서는 자리가 있다. 「벨과 아빠」가 2:1로 더 많지만
  // 그 갈래의 몸은 카우걸이라, 목장 아저씨 자리에 여자가 선다
  it('이름이 같은 갈래가 배치 통계보다 먼저다', () => {
    expect(classOfSprite('RANCHER', 41)).toBe(TRAINER_CLASS_NAMES.indexOf('RANCHER'))
  })

  it('포켓몬 그림에는 사람이 안 붙는다', () => {
    // 배치표만 보면 `PIKACHU`에 포켓몬키즈가 붙는다
    expect(SPRITE_TRAINER_CLASS.some((r) => r[0] === 71)).toBe(true)
    expect(classOfSprite('PIKACHU', 71)).toBeNull()
    for (const name of OVERWORLD_MON_NAMES) expect(classOfSprite(name), name).toBeNull()
  })

  it('사람도 포켓몬도 아니면 없는 것이다', () => {
    expect(classOfSprite('ROCK_SMASH', 85)).toBeNull()
    expect(classOfSprite('MIDDLE_AGED_MAN', 82)).toBeNull()
  })

  it('⚠️ 부분 일치로는 안 붙는다 — 그럴듯한 오답이 나오는 자리다', () => {
    const vocab = ['parasollady', 'lady', 'women', 'bugcatcher']
    // `PARASOL_LADY`가 `lady`에 붙으면 양산 든 사람 자리에 다른 사람이 선다
    expect(modelTagFor('PARASOL_LADY', vocab)).toBe('parasollady')
    expect(modelTagFor('MIDDLE_AGED_WOMAN', vocab)).toBeNull()
    // ⚠️ **손으로 적은 짝도 낱말이 실제로 있어야 붙는다.** 없으면 null이고,
    // 있으면 그 낱말 **하나**에만 붙는다 — `women`으로 새어 들지 않는다
    expect(modelTagFor('MIDDLE_AGED_MAN', vocab)).toBeNull()
    expect(modelTagFor('MIDDLE_AGED_MAN', [...vocab, 'man'])).toBe('man')
  })
})

describe('세울 번들 고르기', () => {
  const table = tagTable(['champion'], ['maid', 'nursejoy'])

  it('갈래로 이어지면 BDSP가 적어 둔 번들이다', () => {
    const cynthia = modelFor('CYNTHIA', table)
    expect(cynthia?.bundles[0]).toBe('tr0001_00')
    expect(cynthia?.via).toContain('Cynthia')
  })

  // ⚠️ 어떤 배틀 번들은 같은 폴더에 없는 CAB을 가리켜 열다가 끊긴다.
  // 그때 쓸 다음 후보가 같은 번호의 필드 번들이다
  it('배틀 번들이 끊길 때를 대비해 같은 번호의 치비를 뒤에 둔다', () => {
    const withTwin: NpcModelTable = {
      battle: table.battle,
      field: { bundles: { ...table.field.bundles, fc0001_00: [] }, vocabulary: [] },
    }
    expect(modelFor('CYNTHIA', withTwin)?.bundles).toEqual(['tr0001_00', 'fc0001_00'])
    expect(buildOf('tr0001_00')).toBe('battle')
    expect(buildOf('fc0001_00')).toBe('field')
  })

  it('갈래가 없는 사람은 낱말로 찾고, 등신이 먼저다', () => {
    // 간호사는 트레이너가 아니라 갈래가 없다 — 치비로라도 세운다
    expect(modelFor('POKECENTER_NURSE', table)?.bundles[0]).toBe('fc9001_00')
    expect(modelFor('MAID', table)?.bundles[0]).toBe('fc9000_00')
  })

  it('셋 다 없으면 없는 것이다', () => {
    expect(modelFor('MIDDLE_AGED_MAN', table)).toBeNull()
  })
})

describe('이름 붙인 번들', () => {
  it('주인공 둘과 라이벌이 근거표에서 나온다', () => {
    expect(NPC_BUNDLE.hero).toBe('pc0001_00')
    expect(NPC_BUNDLE.heroine).toBe('pc0002_00')
    expect(NPC_BUNDLE.rival).toBe('tr0002_00')
    expect(trainerModelBundle(TRAINER_CLASS_NAMES.indexOf('RIVAL'))).toBe(NPC_BUNDLE.rival)
    expect(trainerModelBundle(null)).toBeNull()
    // 프론티어 갈래는 몸이 없다 — 절차형으로 대신한다
    expect(trainerModelBundle(TRAINER_CLASS_NAMES.indexOf('FACTORY_HEAD'))).toBeNull()
  })
})

maybe('실제 자료', () => {
  it('손으로 적은 낱말 짝이 전부 실재하는 낱말을 가리킨다', () => {
    // 여기가 깨지면 BDSP 쪽 이름을 잘못 적은 것이다. 두 뭉치를 합쳐서 본다 —
    // `nursejoy`처럼 오버월드에만 있는 사람이 있다
    const table = models()
    const vocab = new Set([...table.battle.vocabulary, ...table.field.vocabulary])
    const dangling = Object.entries(NPC_MODEL_ALIAS).filter(([, tag]) => !vocab.has(tag))
    expect(dangling).toEqual([])
  })

  it('손으로 적은 갈래 짝이 전부 실재하는 갈래를 가리킨다', () => {
    const missing = Object.entries(SPRITE_CLASS_ALIAS)
      .filter(([, cls]) => !TRAINER_CLASS_NAMES.includes(cls))
    expect(missing).toEqual([])
  })

  it('손으로 적은 낱말 짝이 글자 일치와 안 겹친다 — 겹치면 표가 군더더기다', () => {
    const table = models()
    const vocab = [...table.battle.vocabulary, ...table.field.vocabulary]
    const redundant = Object.keys(NPC_MODEL_ALIAS).filter(
      (name) => vocab.some((tag) => normalize(tag) === normalize(name)),
    )
    expect(redundant).toEqual([])
  })

  it('붙는 것과 안 붙는 것을 세어 둔다', () => {
    const table = models()
    const list = Object.entries(sprites())
    const found = list
      .map(([id, s]) => modelFor(s.name, table, Number(id)))
      .filter((m) => m !== null)
    // ⚠️ 이 수가 떨어지면 근거표나 번들 목록이 어긋난 것이다
    expect(found.length).toBeGreaterThanOrEqual(87)
    expect(found.length).toBeLessThan(list.length)
    // 대부분이 등신이다. 치비로 내려가는 것은 트레이너가 아닌 사람들뿐이다
    const chibi = found.filter((m) => buildOf(m.bundles[0]!) === 'field')
    expect(chibi.length).toBeLessThan(found.length / 4)
  })

  it('번들 이름의 뒤 두 자리는 옷이다', () => {
    const byTag = bundlesByTag(models().battle)
    const stem = (b: string): string => b.slice(0, 6)

    // 주인공은 갈아입을 옷이 많다 — `_00`과 `_10`~`_22`로 열넷씩이다
    const hero = byTag.get('hero') ?? []
    const heroine = byTag.get('heroine') ?? []
    expect(hero.filter((b) => stem(b) === 'pc0001')).toHaveLength(14)
    expect(heroine.filter((b) => stem(b) === 'pc0002')).toHaveLength(14)

    // ⚠️ **번들 하나가 갈래 하나를 뜻하지 않는다.** `pc0001_12`에는 두 이름표가
    // 다 들어 있다 — 남주인공 옷 한 벌 안에 `heroine` 텍스처가 섞여 있다.
    // "낱말 하나 = 사람 하나"로 보면 여기서 틀린다
    expect(hero).toContain('pc0001_12')
    expect(heroine).toContain('pc0001_12')
    expect(heroine).toHaveLength(15)
  })

  // ⚠️ 이름표는 번들 하나를 가리키지 않는다. `eliteM`이 `tr1024_00`(에이스
  // 트레이너)과 `tr1053_00`(눈 지방)에 다 붙어 있어서, 이름표로 파일 이름을
  // 지으면 먼저 구운 것이 나중 것을 덮는다 — 눈 지방 사람이 평지 사람이 된다
  it('이름표는 번들 하나를 가리키지 않는다 — 그래서 파일 이름이 번들이다', () => {
    const byTag = bundlesByTag(models().battle)
    const shared = [...byTag].filter(([, list]) => list.length > 1).map(([tag]) => tag)
    expect(shared).toContain('eliteM')
    expect(byTag.get('eliteM')).toEqual(['tr1024_00', 'tr1053_00'])
  })
})

/**
 * 구워 둔 표(`npcModels.json`)가 규칙과 어긋나지 않는가.
 *
 * 표는 `tools/extract/npcModels.mjs`가 **이 모듈을 그대로 불러** 만든다. 그래도
 * 시험이 필요한 이유는 표가 파일로 남기 때문이다 — 규칙을 고치고 표를 다시
 * 안 구우면 화면에 서는 사람과 규칙이 갈린다
 */
maybe('구워 둔 표', () => {
  const TABLE = resolve(DATA, 'npcModels.json')
  const has = existsSync(TABLE)
  const table = (): Record<string, string> =>
    JSON.parse(readFileSync(TABLE, 'utf8')) as Record<string, string>

  it('표의 짝이 규칙이 내는 후보 안에 있다', () => {
    if (!has) return
    const rules = models()
    const names = sprites()
    for (const [sprite, bundle] of Object.entries(table())) {
      const name = names[sprite]?.name
      expect(name, sprite).toBeTruthy()
      expect(modelFor(name!, rules, Number(sprite))?.bundles, name).toContain(bundle)
    }
  })

  it('표에 있는 번들은 glb가 실제로 있다', () => {
    // ⚠️ 없는 glb를 가리키면 그 사람은 **판때기로도 안 선다** — 모델 쪽이
    // 자리를 차지하고 받기에 실패하면 그 자리가 빈다.
    //
    // `public/models/`는 gitignore라 갓 받은 리포에는 없다. 그때는 건너뛴다 —
    // 여기서 재는 것은 "표와 파일이 어긋나지 않는가"지 "파일이 있는가"가 아니다
    const dir = resolve(DATA, '../models/npc')
    if (!has || !existsSync(dir)) return
    const missing = Object.values(table()).filter(
      (bundle) => !existsSync(resolve(dir, `${bundle}.glb`)))
    expect(missing).toEqual([])
  })

  it('붙는 배치가 오버월드의 5분의 2는 된다', () => {
    // 이 수가 확 떨어지면 근거표나 번들 목록이 어긋난 것이다
    if (!has || !existsSync(resolve(DATA, 'events.json'))) return
    const events = (JSON.parse(readFileSync(resolve(DATA, 'events.json'), 'utf8')) as {
      events: Record<string, { npcs: { sprite: number }[] }>
    }).events
    const map = table()
    let hit = 0, all = 0
    for (const e of Object.values(events)) {
      for (const n of e.npcs) {
        all++
        if (map[String(n.sprite)] !== undefined) hit++
      }
    }
    expect(all).toBe(3555)
    // 777 → 1508은 BDSP가 적어 둔 갈래표를 읽기 시작한 것이다. 이름이 같기를
    // 기다리던 자리가 통째로 붙었다 — 에이스 트레이너 135건, 갤럭시단 104건,
    // 등산가 63건, 반바지 51건, 8관장·사천왕·난천이 그렇다.
    //
    // 1508 → 1766은 **갈래가 없는 마을 사람**을 이은 것이다. 트레이너가 아니라
    // 배치표가 갈래를 안 알려 주므로 롬이 그림에 붙여 둔 텍스처 이름표를 쓴다 —
    // 센터 판매대 점원 101건, 접수원 45건, 늙은 여자 32건이 그렇다
    expect(hit).toBe(1761)
    // ⚠️ 여기 안 세어지는 자리가 또 있다. `OBJ_EVENT_GFX_VAR_*`(101~116)는
    // 배치표에 자리표시자로 적혀 있고 실제 그림은 변수로 정해지므로
    // (`actor/npcs`의 `resolveGfx`) `n.sprite`로는 안 걸린다. 그 62건에는
    // 주인공 둘이 서고, 표에도 둘 다 들어 있다
    expect(map[String(0)]).toBe(NPC_BUNDLE.hero)
    expect(map[String(97)]).toBe(NPC_BUNDLE.heroine)
  })
})
