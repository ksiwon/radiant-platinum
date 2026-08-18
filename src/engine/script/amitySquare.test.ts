// 상호교류광장을 **실제 스크립트로** 돌린다 (PARITY §7.8 · §7.16)
//
// `world/amity.test.ts`가 무엇을 주워 오는지의 규칙을 보고, 여기서는 그 값이
// 실제로 **케이스에 들어가기까지** 스크립트가 닿는지를 본다.
//
// ⚠️ **명령 여섯을 만든 것만으로는 안 닫혔었다.** 주워 온 장식을 넣는 자리가
// 콘테스트 계통(`CanFitAccessory`·`AddAccessory`·`BufferAccessoryName`)이라
// 비어 있었고, 그러면 `CanFitAccessory`가 답 변수를 안 건드려서 **앞의 갈래가
// 쓴 묵은 값**으로 갈린다. 이 시험이 그 자리를 붙잡는다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { buildCommands } from './commands'
import { ScriptContext, type CommonScripts } from './context'
import { entryOffset, fileBytes, parseScriptMeta, resolveScript } from './data'
import { VarStore } from './vars'
import { FieldWorld, MENU_NO, MENU_YES, type FieldServices } from './world'
import { DIR } from './movement'
import {
  accessoryCount, addAccessory, canFitAccessory, MAX_NON_UNIQUE, newFashionCase,
  NON_UNIQUE_ACCESSORY_COUNT, removeAccessory, type FashionCase,
} from '../world/fashionCase'
import { AMITY_FIRST_ACCESSORY_GIFT, AMITY_GIFTS } from '../world/amityTables'
import { stubLabels } from './services.testkit'
import { DATA, withData } from '../../data/romData.testkit'

const maybe = withData('scripts.json', 'scripts.bin')

const ALWAYS_PRESSED = () => ({ pressed: true, held: true })

/** `scripts_amity_square` — D11R0101이 쓰는 파일 */
const FILE = 274
/** `ScriptEntry` 차례. 열일곱째가 열매와 장식 아저씨다 */
const ENTRY_GIFT_MAN = 16

/** `VAR_AMITY_SQUARE_GIFT_ID` (`VARS_START` + 171) */
const VAR_GIFT_ID = 16555

maybe('상호교류광장 — 실제 스크립트', () => {
  const meta = parseScriptMeta(JSON.parse(readFileSync(resolve(DATA, 'scripts.json'), 'utf8')))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
  const { map } = buildCommands(meta.commands)

  it('그 파일이 상호교류광장이다', () => {
    expect(meta.files[FILE]?.name).toBe('scripts_amity_square')
  })

  interface Log {
    case: FashionCase
    /** 글 칸에 채워진 이름들 */
    named: string[]
    added: { item: number; count: number }[]
  }

  const play = (opt: { gift: number; answer?: number; start?: FashionCase }): Log => {
    const log: Log = { case: opt.start ?? newFashionCase(), named: [], added: [] }
    const vars = new VarStore()
    vars.set(VAR_GIFT_ID, opt.gift)
    const services: FieldServices = {
      fashionCase: {
        canFit: (accessory, count) => canFitAccessory(log.case, accessory, count),
        add: (accessory, amount) => { log.case = addAccessory(log.case, accessory, amount) },
        remove: (accessory, amount) => { log.case = removeAccessory(log.case, accessory, amount) },
      },
      // 이름표는 롬 뱅크에서 오는데 시험은 뱅크를 안 받는다 — 이름이 오기만
      // 하면 칸에 들어가는지가 여기서 볼 것이다
      labels: { ...stubLabels, accessory: (id) => `장식${String(id)}` },
      bag: {
        pocketOf: () => 0,
        add: (item, count) => { log.added.push({ item, count }); return true },
        remove: () => true,
        canFit: () => true,
        quantity: () => 0,
        pocketHasItems: () => true,
        name: () => '열매',
      },
    }
    const world = new FieldWorld({
      vars, input: ALWAYS_PRESSED, movements: meta.movements, services,
    })
    // 이름이 칸에 들어가는 것을 지켜본다 — 빈 글이면 「받았다」 줄에 구멍이 난다
    const set = world.slots.set.bind(world.slots)
    world.slots.set = (slot: number, text: string) => {
      log.named.push(text)
      set(slot, text)
    }
    world.player = { x: 0, z: 0, visible: true, dir: DIR.north }
    world.target = { x: 0, z: 1, dir: DIR.south, visible: true }

    // ⚠️ **공용 스크립트를 실제로 걸어야 한다.** 장식을 케이스에 넣는 것은
    // 광장 스크립트가 아니라 `CommonScript_ObtainAccessory`고, 그 파일을 안
    // 걸어 주면 「받았다」까지 갔는데 아무것도 안 들어온다
    let inner: ScriptContext | null = null
    const common: CommonScripts = {
      call: (id) => {
        const at = resolveScript(meta, id, FILE)
        if (at === null) return false
        inner = new ScriptContext(
          { vars, world, commands: map, common }, fileBytes(data, at.file), at.file,
        )
        inner.start(entryOffset(data, at.file, at.entry))
        return true
      },
      running: () => inner !== null,
    }

    const ctx = new ScriptContext(
      { vars, world, commands: map, common }, fileBytes(data, FILE), FILE,
    )
    ctx.start(entryOffset(data, FILE, ENTRY_GIFT_MAN))
    for (let frame = 0; frame < 4000; frame++) {
      if (inner !== null) {
        if (!(inner as ScriptContext).step(100_000)) inner = null
      } else if (!ctx.step(100_000)) break
      if (world.menu !== null) world.choose(opt.answer ?? MENU_YES)
      world.tick()
    }
    return log
  }

  /** 선물 번호 아홉부터가 장식이다 */
  const ACCESSORY_GIFT = AMITY_FIRST_ACCESSORY_GIFT
  const GIFT_ACCESSORY_ID = AMITY_GIFTS[ACCESSORY_GIFT]!

  it('아저씨가 주는 장식이 케이스에 들어간다', () => {
    const log = play({ gift: ACCESSORY_GIFT })
    expect(accessoryCount(log.case, GIFT_ACCESSORY_ID)).toBe(1)
  })

  it('⚠️ 이름이 빈 글이 아니다 — 「받았다」 줄이 그 칸을 쓴다', () => {
    const log = play({ gift: ACCESSORY_GIFT })
    expect(log.named.filter((s) => s !== '').length).toBeGreaterThan(0)
  })

  it('「아니오」면 안 받는다', () => {
    const log = play({ gift: ACCESSORY_GIFT, answer: MENU_NO })
    expect(accessoryCount(log.case, GIFT_ACCESSORY_ID)).toBe(0)
  })

  it('⚠️ 앞의 아홉은 장식이 아니라 열매다 — 가방으로 간다', () => {
    const log = play({ gift: 0 })
    expect(log.added).toContainEqual({ item: AMITY_GIFTS[0], count: 5 })
    // 열매 쪽으로 갔으므로 케이스는 그대로다
    expect(log.case).toEqual(newFashionCase())
  })

  it('⚠️ 아저씨의 장식은 겹쳐 가질 수 있는 쪽이다 — 두 번 받으면 둘이다', () => {
    expect(GIFT_ACCESSORY_ID).toBeLessThan(NON_UNIQUE_ACCESSORY_COUNT)
    const one = addAccessory(newFashionCase(), GIFT_ACCESSORY_ID, 1)
    const log = play({ gift: ACCESSORY_GIFT, start: one })
    expect(accessoryCount(log.case, GIFT_ACCESSORY_ID)).toBe(2)
  })

  it('⚠️ 아홉까지 차면 더 안 는다', () => {
    const full = addAccessory(newFashionCase(), GIFT_ACCESSORY_ID, MAX_NON_UNIQUE)
    const log = play({ gift: ACCESSORY_GIFT, start: full })
    expect(accessoryCount(log.case, GIFT_ACCESSORY_ID)).toBe(MAX_NON_UNIQUE)
  })
})
