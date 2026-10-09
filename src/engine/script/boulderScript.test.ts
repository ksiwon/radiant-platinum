// 괴력 바위에 A — 원작 `FieldMoves_Boulder` (10002번)
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { buildCommands } from './commands'
import { ScriptContext } from './context'
import { entryOffset, fileBytes, parseScriptMeta, resolveScript } from './data'
import { VarStore } from './vars'
import { FieldWorld } from './world'
import { DATA, withData } from '../../data/romData.testkit'
import { stubFieldMoves, stubLabels, stubParty, stubTrainerInfo } from './services.testkit'

const maybe = withData('scripts.json', 'scripts.bin', 'dialogue/ko/381.json')

maybe('괴력 바위 스크립트', () => {
  const meta = parseScriptMeta(JSON.parse(readFileSync(resolve(DATA, 'scripts.json'), 'utf8')))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
  const { map } = buildCommands(meta.commands)

  /** 돌려서 「쓰겠습니까」(예·아니오 메뉴)가 떴는가 · 바로 닫혔는가를 본다 */
  function press(o: { active: boolean; slot: number; badge: boolean }) {
    const vars = new VarStore()
    const log: string[] = []
    let activeNow = o.active
    const world = new FieldWorld({
      vars, input: () => ({ pressed: true, held: true }), movements: meta.movements,
      services: {
        party: { ...stubParty, findWithMove: () => o.slot },
        labels: stubLabels,
        trainerInfo: { ...stubTrainerInfo, hasBadge: (b: number) => { log.push(`badge${String(b)}`); return o.badge } },
        fieldMoves: {
          ...stubFieldMoves,
          strength: (m) => { if (m === 'set') activeNow = true; return activeNow },
        },
      },
    })
    if (o.active) vars.setFlag(2402)
    const target = resolveScript(meta, 10002, -1)
    if (!target) throw new Error('10002 없음')
    const ctx = new ScriptContext({ vars, world, commands: map }, fileBytes(data, target.file), target.file)
    ctx.start(entryOffset(data, target.file, target.entry))
    let asked = false
    for (let f = 0; f < 600; f++) {
      if (!ctx.step(200_000)) break
      world.tick()
      if (world.menu !== null) { asked = true; world.choose(world.menu.entries[0]?.value ?? 0) }
    }
    return { asked, log, set: vars.checkFlag(2402) }
  }

  it('기술도 뱃지도 있으면 쓰겠느냐고 묻는다', () => {
    const r = press({ active: false, slot: 0, badge: true })
    expect(r.log).toEqual(['badge5'])
    expect(r.asked).toBe(true)
  })

  /**
   * ⚠️ **「쓰겠습니까?」의 첫 쪽이 거절 문구와 글자까지 같다** (`field_moves` 6번 · 8번).
   * 6번은 \r로 쪽이 갈려 둘째 쪽에서 「괴력을 쓰겠습니까?」를 묻는다 — 화면에서 첫 쪽만 보고
   * 「못 쓴다」로 읽은 적이 있다 (264번 A 확인). 원작도 같은 글이다
   */
  it('쓰겠습니까의 첫 쪽은 거절 문구와 같다', () => {
    const bank = JSON.parse(readFileSync(resolve(DATA, 'dialogue/ko/381.json'), 'utf8')) as string[]
    const pages = bank[6]!.split(String.fromCharCode(13))
    expect(pages[0]).toBe(bank[8])
    expect(pages[1]).toBe('괴력을 쓰겠습니까?')
  })

  it('파티가 없으면 안 묻는다', () => {
    expect(press({ active: false, slot: 6, badge: true }).asked).toBe(false)
  })
})
