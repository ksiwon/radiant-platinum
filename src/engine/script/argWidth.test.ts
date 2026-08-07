// 명령이 **인자를 정확히 그 폭만큼 읽는가**
//
// ⚠️ 이 시험은 실제로 겪은 버그에서 나왔다. 소리 명령을 이렇게 썼더니
//
//     soundOf(ctx)?.playEffect(ctx.readVar())
//
// 소리가 안 붙어 있을 때 `?.`가 **오른쪽을 아예 계산하지 않아서** 읽기 위치가
// 안 움직였다. 그다음 옵코드 자리에 인자(1500)가 와서 스크립트가 거기서 터졌고,
// 트레이너 대사·간호사·기타리스트가 한꺼번에 죽었다.
//
// 그래서 여기서는 **바깥 세계를 하나도 안 붙이고** 명령을 하나씩 밟아 보고,
// 읽기 위치가 표에 적힌 폭만큼 움직였는지만 본다. 서비스가 없을 때가 제일
// 위험한 경우다 — `?.`가 전부 건너뛰는 상태이기 때문이다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import type { ScriptFile } from '../../data/schema'
import { HANDLERS } from './commands'
import { ScriptContext } from './context'
import { VarStore } from './vars'
import { FieldWorld } from './world'
import { withData } from '../../data/romData.testkit'

const DATA = resolve(__dirname, '../../../public/data')
const maybe = withData('scripts.json')

/**
 * 읽기 위치를 스스로 옮기는 명령. 폭으로 잴 수 없다.
 *
 * 흐름 명령이 전부고, 그 넷이 사실상 VM 본체라 따로 시험이 있다 (`vm.test`)
 */
const JUMPS = new Set(['GoTo', 'Call', 'Return', 'End', 'GoToIf', 'CallIf', 'ReturnCommonScript'])

/** `"1 2 4*"` → 7 */
function width(spec: string): number {
  if (spec === '') return 0
  return spec.split(' ').reduce((n, s) => n + Number(s[0]), 0)
}

maybe('명령 인자 폭', () => {
  const meta = JSON.parse(readFileSync(resolve(DATA, 'scripts.json'), 'utf8')) as ScriptFile

  it('바깥 세계가 하나도 없어도 인자를 그 폭만큼 읽는다', () => {
    const wrong: string[] = []
    let checked = 0
    for (const cmd of meta.commands) {
      const fn = HANDLERS.get(cmd.name)
      if (!fn || JUMPS.has(cmd.name)) continue
      // 인자가 값에 따라 갈리는 명령은 표가 폭 하나로 답하지 못한다
      if ('cases' in cmd && cmd.cases) continue
      checked++

      const vars = new VarStore()
      // 서비스도 이름도 안 붙인다 — `?.`가 전부 건너뛰는 상태가 제일 위험하다
      const world = new FieldWorld({ vars })
      const bytes = new Uint8Array(64)
      const ctx = new ScriptContext({ vars, world, commands: new Map() }, bytes, 0)
      ctx.start(0)
      ctx.readHalfWord() // 옵코드 자리. VM도 이만큼 읽고 핸들러를 부른다
      try {
        fn(ctx)
      } catch {
        // 터지는 것은 이 시험이 볼 일이 아니다. 위치만 본다
      }
      const moved = (ctx.pointer ?? 0) - 2
      if (moved !== width(cmd.args)) {
        wrong.push(`${cmd.name}: ${String(moved)}바이트 읽음, 표는 ${String(width(cmd.args))}`)
      }
    }
    expect(wrong).toEqual([])
    // 실제로 뭔가를 봤는지 확인한다 — 목록이 비면 시험이 헛돈다
    expect(checked).toBeGreaterThan(100)
  })
})
