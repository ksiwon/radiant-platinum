// 전수 점검이 잡은 건너뛴 명령 가운데 **이름 붙은 핸들러로 바꾼 것**의 계약
//
// ⚠️ 여기서 잠그는 것은 둘이다. ① 핸들러가 있다(`skipper`가 아니다) ② **읽는 폭이 명령표와 같다** — 인자를 덜 읽으면 다음 바이트가
// 명령으로 읽혀 스크립트가 엉뚱한 데서 선다 (`argWidth.test`와 같은 걱정). 답 변수를 적는 것은 값까지 본다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { buildCommands, HANDLERS } from './commands'
import { ScriptContext, argWidths } from './context'
import { parseScriptMeta } from './data'
import { VarStore } from './vars'
import { FieldWorld } from './world'
import { DATA, withData } from '../../data/romData.testkit'

const maybe = withData('scripts.json')

/** 이름 붙은 핸들러로 바꾼 명령 */
const NAMED = [
  'TrySetUnusedCollectedOrbFlag', 'ScrCmd_27C', 'ScrCmd_2B8', 'SetFavoriteMon', 'Dummy316', 'MoveHearthomeGymDPLift',
  'AddCameraOverrideObject', 'RemoveCameraOverrideObject', 'ScrCmd_2B6', 'ScrCmd_2CD', 'SetPlayerVolume',
  'ScrCmd_0A6', 'DressUpPhotoHasData', 'ShowDressUpPhoto', 'SetDressUpPhotoTitle',
  'CheckHasRoomForGoodsInPC', 'SendGoodToPC', 'GiveTrap', 'GiveSphere', 'DoGroupConnectionAction',
  'SetClearInCatchingShowFlag', 'MoveCatchingShowMonsToPCBoxes', 'PokeMartSeal', 'GiveOrTakeSeal', 'AddContestBackdrop',
  'BufferBallSealName', 'BufferBallSealNamePlural', 'BufferContestBackdropName',
] as const

maybe('전수 점검이 이름을 붙인 명령', () => {
  const meta = parseScriptMeta(JSON.parse(readFileSync(resolve(DATA, 'scripts.json'), 'utf8')))
  const { map } = buildCommands(meta.commands)

  /** 명령 하나를 0으로 채운 인자로 돌리고 읽은 바이트 수를 돌려준다 */
  const run = (name: string, args: number[]): { read: number, vars: VarStore } => {
    const op = meta.commands.findIndex((c) => c.name === name)
    expect(op, `${name}이 명령표에 없다`).toBeGreaterThanOrEqual(0)
    const bytes = new Uint8Array(64)
    new DataView(bytes.buffer).setUint16(0, op, true)
    const view = new DataView(bytes.buffer)
    let at = 2
    for (const v of args) { view.setUint16(at, v, true); at += 2 }
    const vars = new VarStore()
    const ctx = new ScriptContext({ vars, world: new FieldWorld({ vars }), commands: map }, bytes, 0)
    ctx.start(0)
    // 한 명령만 돌린다 — `step`은 다음 명령까지 읽어 폭을 못 잰다
    ctx.readHalfWord()
    map.get(op)!(ctx)
    return { read: (ctx.pointer ?? 0) - 2, vars }
  }

  it.each(NAMED)('%s — 핸들러가 있고 폭이 맞다', (name) => {
    expect(HANDLERS.has(name), `${name}에 핸들러가 없다`).toBe(true)
    const cmd = meta.commands.find((c) => c.name === name)!
    // 첫 인자로 갈라지는 명령(`DoGroupConnectionAction`)은 아래에서 따로 본다
    if (cmd.cases !== undefined) return
    const width = argWidths(cmd.args).reduce((n, a) => n + a.size, 0)
    // 변수 번호 자리에는 0x8000(지역 칸)을 준다 — 상수 구간에 쓰면 조용히 버려져 값 검사가 안 된다
    const args = argWidths(cmd.args).map(() => 0x8001)
    expect(run(name, args).read).toBe(width)
  })

  it('사진 · 굿즈 명령은 답 변수에 닫는 값을 적는다 (묵은 값이 안 남는다)', () => {
    const dest = 0x8001
    // 사진 앱(0A6): 슬롯 · 답 · 처음 입장 — 답은 둘째
    expect(run('DressUpPhotoHasData', [0x8000, dest]).vars.get(dest)).toBe(0)
    expect(run('ShowDressUpPhoto', [0x8000, dest]).vars.get(dest)).toBe(1)
    expect(run('ScrCmd_0A6', [0x8000, dest, 0x8000]).vars.get(dest)).toBe(0)
    // 굿즈: 세 번째가 답이다
    for (const name of ['CheckHasRoomForGoodsInPC', 'SendGoodToPC', 'GiveTrap', 'GiveSphere']) {
      expect(run(name, [0x8000, 0x8000, dest]).vars.get(dest), name).toBe(0)
    }
  })

  it('그룹 접속은 동작마다 폭이 다르고 이름 짓기는 취소(1)로 닫는다', () => {
    const dest = 0x8001
    // 폭은 명령표의 `cases`가 정한다: 0~3은 둘 · 4~5는 하나 · 6은 없다
    expect(run('DoGroupConnectionAction', [0, 0x8000, dest]).read).toBe(6)
    expect(run('DoGroupConnectionAction', [1, 0x8000, dest]).vars.get(dest)).toBe(0)
    expect(run('DoGroupConnectionAction', [2, 0x8000, 0x8000]).read).toBe(6)
    expect(run('DoGroupConnectionAction', [3, 0x8000, 0x8000]).read).toBe(6)
    const naming = run('DoGroupConnectionAction', [4, dest])
    expect(naming.read).toBe(4)
    expect(naming.vars.get(dest)).toBe(1)
    expect(run('DoGroupConnectionAction', [5, 0x8000]).read).toBe(4)
    expect(run('DoGroupConnectionAction', [6]).read).toBe(2)
  })
})
