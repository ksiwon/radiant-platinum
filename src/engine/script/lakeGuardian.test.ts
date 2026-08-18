// 갤럭시단아지트의 감금장치를 **실제 스크립트로** 돌린다 (PARITY §1.25)
//
// `lakeGuardianUnits.test.ts`(engine/world)가 규칙을 보고, 여기서는 롬의
// 스크립트가 그 자리까지 실제로 도달하는지를 본다.
//
// ⚠️ **푸는 자리는 스크립트를 세운다.** 원작이 필드 태스크가 끝날 때까지
// 기다린다(`return TRUE`) — 안 세우면 통이 열리기 전에 삼신이 날아간다.
// 그래서 「안 끝났다」로 답하면 스크립트가 그 자리에서 서 있어야 한다
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { buildCommands } from './commands'
import { ScriptContext } from './context'
import { entryOffset, fileBytes, parseScriptMeta } from './data'
import { VarStore } from './vars'
import { FieldWorld, MENU_YES, type FieldServices } from './world'
import { FLAG_FREED_GALACTIC_HQ } from '../world/lakeGuardianUnits'
import { DATA, withData } from '../../data/romData.testkit'

const maybe = withData('scripts.json', 'scripts.bin')

const ALWAYS_PRESSED = () => ({ pressed: true, held: true })

/** 갤럭시단아지트 관제실. 통 셋이 여기 있다 */
const FILE = 347

maybe('감금장치 — 관제실 스크립트', () => {
  const meta = parseScriptMeta(JSON.parse(readFileSync(resolve(DATA, 'scripts.json'), 'utf8')))
  const raw = readFileSync(resolve(DATA, 'scripts.bin'))
  const data = { meta, bytes: new Uint8Array(raw.buffer, raw.byteOffset, raw.byteLength) }
  const { map } = buildCommands(meta.commands)

  interface Log { init: boolean[], opened: number, asked: number }

  /** 파일을 통째로 훑는다. `settled`가 기다림의 답이다 */
  const sweep = (freed: boolean, settled: boolean): Log => {
    const log: Log = { init: [], opened: 0, asked: 0 }
    const vars = new VarStore()
    if (freed) vars.setFlag(FLAG_FREED_GALACTIC_HQ)
    const services: FieldServices = {
      lakeGuardianUnits: {
        init: (isFreed) => { log.init.push(isFreed) },
        open: () => { log.opened++ },
        settled: () => { log.asked++; return settled },
      },
      menuOpen: () => false,
      battleResult: () => 'win',
    }
    const world = new FieldWorld({
      vars, input: ALWAYS_PRESSED, movements: meta.movements, services,
    })
    const info = meta.files[FILE]!
    for (let e = 0; e < info.entries; e++) {
      const ctx = new ScriptContext({ vars, world, commands: map }, fileBytes(data, FILE), FILE)
      try {
        ctx.start(entryOffset(data, FILE, e))
      } catch { continue }
      for (let frame = 0; frame < 3000; frame++) {
        if (!ctx.step(100_000)) break
        if (world.menu?.kind === 'list') world.chooseAtCursor()
        else if (world.menu !== null) world.choose(MENU_YES)
        world.tick()
      }
    }
    return log
  }

  it('통 셋을 세우고 푸는 자리가 둘 다 돈다', () => {
    const log = sweep(false, true)
    expect(log.init).toEqual([false])
    expect(log.opened).toBe(1)
  })

  it('⚠️ 이미 풀어 준 리포트면 열린 채로 세운다', () => {
    // 플래그가 서 있으면 `init`이 참을 받는다 — 그것이 「마지막 프레임」이다
    expect(sweep(true, true).init).toEqual([true])
  })

  it('⚠️ 다 열릴 때까지 스크립트가 선다', () => {
    // 「아직 안 끝났다」로 답하면 그 자리에서 계속 묻고 있어야 한다.
    // 안 서면 통이 닫힌 채로 다음 마디가 지나간다
    const log = sweep(false, false)
    expect(log.opened).toBe(1)
    expect(log.asked).toBeGreaterThan(100)
  })
})
