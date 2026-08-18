// 리본은 없다 — 그래서 리본신드롬이 닫힌다 (PARITY §9.2)
//
// **재는 것은 "우리가 문을 막았는가"가 아니다.** 1층 들머리가 파티의 리본 수를
// 10과 견주고 모자라면 제 대사로 돌려보내는데, 그 수를 0으로 답하면 **원작이
// 제 말로 닫는다.** 지어낸 글이 한 줄도 없다는 것이 이 시험의 뜻이다.
//
// 명령을 안 만들면 결과 변수에 앞 갈래의 값이 그대로 남아 우연히 열릴 수 있다.
// 그것이 진짜 위험이라 여기서 못 박는다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { buildCommands } from './commands'
import { ScriptContext } from './context'
import { entryOffset, fileBytes, parseScriptMeta } from './data'
import { VarStore } from './vars'
import { FieldWorld } from './world'
import { DIR } from './movement'
import { DATA, withData } from '../../data/romData.testkit'

const maybe = withData('scripts.json', 'scripts.bin')

/** `T07R0101` — 리조트에리어 리본신드롬 1층 */
const SYNDICATE = 1109
/** 들머리가 답을 적는 칸. 실측한 값이다 (`CountPartyRibbons 32772`) */
const VAR_RESULT = 32_772
/** 들머리 문턱 (`CompareVarToValue 32772, 10`) */
const RIBBONS_NEEDED = 10

maybe('리본신드롬', () => {
  const meta = parseScriptMeta(JSON.parse(readFileSync(resolve(DATA, 'scripts.json'), 'utf8')))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
  const { map, unhandled } = buildCommands(meta.commands)

  const opcodeOf = (name: string): number => {
    const at = meta.commands.findIndex((c) => c?.name === name)
    if (at < 0) throw new Error(`${name} 명령이 표에 없다`)
    return at
  }

  it('그 파일이 리본신드롬 1층이다', () => {
    expect(meta.files[SYNDICATE]?.name).toBe('scripts_resort_area_ribbon_syndicate_1f')
  })

  it('⚠️ 리본 명령 일곱이 전부 만들어져 있다 — 묵은 값으로 갈라지지 않는다', () => {
    const ribbon = meta.commands
      .map((c, op) => ({ name: c?.name ?? '', op }))
      .filter((c) => /Ribbon/.test(c.name))
    expect(ribbon).toHaveLength(7)
    for (const c of ribbon) expect(unhandled.has(c.op), c.name).toBe(false)
  })

  it('⚠️ 들머리가 세어 본 리본이 0이고, 그 값이 문턱에 못 미친다', () => {
    // 미리 10을 넣어 둔다. 명령이 답을 안 적으면 이 값이 그대로 남아 문이 열린다
    const vars = new VarStore()
    vars.set(VAR_RESULT, RIBBONS_NEEDED)

    const world = new FieldWorld({
      vars, input: () => ({ pressed: true, held: true }),
      movements: meta.movements, services: {},
    })
    world.player = { x: 0, z: 0, visible: true, dir: DIR.north }

    // 들머리는 3번 진입점이다 — `CountPartyRibbons`가 나오는 자리를 걸어 본다
    let counted = false
    const info = meta.files[SYNDICATE]!
    for (let entry = 0; entry < info.entries && !counted; entry++) {
      vars.set(VAR_RESULT, RIBBONS_NEEDED)
      const ctx = new ScriptContext(
        { vars, world, commands: map }, fileBytes(data, SYNDICATE), SYNDICATE,
      )
      ctx.start(entryOffset(data, SYNDICATE, entry))
      for (let frame = 0; frame < 600; frame++) {
        if (!ctx.step(100_000)) break
        world.tick()
      }
      if (vars.get(VAR_RESULT) === 0) counted = true
    }
    expect(counted, '리본 수를 세는 진입점').toBe(true)
    expect(vars.get(VAR_RESULT)).toBeLessThan(RIBBONS_NEEDED)
  })

  it('⚠️ 리본을 붙이는 자리는 이 건물 안에만 있는 것이 아니다', () => {
    // 물가시티·물가시장·발자국박사도 리본을 준다. 저장할 곳이 없으니 셋 다
    // 아무 일도 안 하는데, **어디에 있는지는 세어 둔다** — 나중에 리본을
    // 되살릴 때 여기가 목록이다
    const set = opcodeOf('SetPartyMonRibbon')
    const files = new Set<string>()
    for (const [i, f] of meta.files.entries()) {
      if (f.kind !== 'code') continue
      const bytes = fileBytes(data, i)
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      for (let at = 0; at + 2 <= bytes.length; at += 2) {
        if (view.getUint16(at, true) === set) { files.add(f.name); break }
      }
    }
    expect(files.has('scripts_resort_area_ribbon_syndicate_1f')).toBe(true)
    expect(files.size).toBeGreaterThanOrEqual(4)
  })
})
