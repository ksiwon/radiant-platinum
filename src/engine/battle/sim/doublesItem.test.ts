// 더블에서 도구를 쓴 턴에도 배틀이 안 굳는가 (PARITY §2.2)
//
// ⚠️ **사람이 갇히는 자리다.** 실측(2026-09-24 대표 구간 · 209번도로 쌍둥이
// 이향&미향): 상대 한 마리가 쓰러진 뒤 우리 앞 자리가 상처약을 쓰자 배틀이
// 「찌르버드는 체력을 회복했다!」에서 멈췄다 — 가게는 `running`인데 고를 명령이
// 0개였다. 쌍둥이는 둘이 한 마리씩이라 **벤치가 없다.**
//
// 굳는 길이 둘이었고 둘 다 여기서 잡힌다 (고치기 전 씨앗 1·15):
//   ① 앞 자리가 도구를 쓰면 요청이 통째로 지워져 뒤 자리의 명령이 0개가 됐다
//   ② 짝이 쓰러진 상대가 도우미를 상대 자리로 겨눠 sim이 거절했다
import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { withData } from '../../../data/romData.testkit'
import type { Item } from '../../../data/schema'
import { BattleController } from './controller'
import type { BattleAction } from '../choice'
import { rng, spawn, movesById } from './fixtures.testkit'

const maybe = withData('species.json', 'moves.json', 'items.json')

const basePp = (move: number): number => movesById.get(move)?.pp ?? 5
const itemList = (): Item[] => (JSON.parse(readFileSync(
  resolve(import.meta.dirname, '../../../../public/data/items.json'), 'utf8')) as { items: Item[] }).items

/** 찌르버드 · 비버통 / 꼬지지 · 흉내내 — 그 판의 네 마리 */
const STARAVIA = 397
const BIBAREL = 400
const PLUSLE = 311 // 꼬지지 자리 — 레벨만 맞으면 된다
const MINUN = 312

maybe('더블 — 도구를 쓴 턴', () => {
  it('⚠️ 한 자리가 쓰러진 뒤 상처약을 써도 다음 명령이 온다', async () => {
    const items = itemList()
    const POTION = items.findIndex((i) => i.name === 'potion')
    const bag = { id: POTION, data: items[POTION]! }
    for (let seed = 1; seed <= 40; seed++) {
      const random = rng(seed * 31)
      const { controller } = await BattleController.start({
        player: { name: '나', team: [spawn(STARAVIA, 33, seed, 'p1-0'), spawn(BIBAREL, 30, seed + 1, 'p1-1')] },
        foe: { name: '상대', team: [spawn(PLUSLE, 22, seed + 50, 'p2-0'), spawn(MINUN, 22, seed + 51, 'p2-1')] },
        doubles: true,
        basePp,
        random,
        seed: [seed & 0xffff, (seed * 7) & 0xffff, (seed * 13) & 0xffff, (seed * 31) & 0xffff],
      })
      try {
        let turns = 0
        /** sim이 거절한 명령. 거절은 조용히 일어나고 배틀만 선다 — 그래서 센다 */
        const refused: string[] = []
        const session = (controller as unknown as { session: { settle: () => Promise<{ p1: string[]; p2: string[] }> } }).session
        const settle = session.settle.bind(session)
        session.settle = async () => {
          const lines = await settle()
          refused.push(...[...lines.p1, ...lines.p2].filter((x) => x.startsWith('|error|')))
          return lines
        }
        for (; turns < 120 && !controller.state.ended; turns++) {
          const slots = controller.chooseSlots
          expect(slots.length, `씨앗 ${seed}: ${turns}턴에서 고를 자리가 없다`).toBeGreaterThan(0)
          const out: BattleAction[] = []
          for (const at of slots) {
            // 깎인 마리가 있으면 그 자리에서 상처약 (하네스가 하는 그대로)
            const mine = controller.state.active[at === 0 ? 'p1a' : 'p1b']
            const armed = mine && controller.planFor(bag.data, mine.key)
              ? controller.armBagItem(bag, mine.key, at) : null
            if (armed) { out.push(armed.action); continue }
            const left = controller.actionsAt(at)
            expect(left.length, `씨앗 ${seed}: ${turns}턴 ${at}자리에 명령이 없다`).toBeGreaterThan(0)
            out.push(left[Math.floor(random() * left.length)]!)
          }
          await controller.chooseTurn(out)
          expect(refused, `씨앗 ${seed}: ${turns}턴에 sim이 명령을 거절했다`).toEqual([])
        }
        expect(controller.state.ended, `씨앗 ${seed}: ${turns}턴에서 굳었다`).toBe(true)
      } finally { controller.destroy() }
    }
  }, 120_000)
})
