// 말 안 듣기가 실제 배틀 안에서 도는가 (PARITY §2.18)
//
// ⚠️ **여기서 재는 것은 규칙이 아니라 「배틀이 안 선다」다.** 판정 자체는
// `meta/obedience.test.ts`가 난수를 먹여 못박는다. 불복은 우리가 sim 밖에서
// 턴을 비우고 개체를 직접 깎는 자리라, 명령을 잘못 보내면 sim이 답을 기다리다
// **그 자리에서 굳는다** — 화면에서는 명령 창이 영영 안 뜬다.
import { describe, expect, it } from 'vitest'
import type { TrainerIdentity } from '../../pokemon/origin'
import { BattleController } from './controller'
import { movesById, rng, spawn } from './fixtures.testkit'

/** `spawn`이 박는 원트레이너. 이 사람이면 늘 말을 듣는다 */
const OWNER: TrainerIdentity = {
  id: 1234, secretId: 5678, name: '', gender: 'male',
}
/** 남 */
const STRANGER: TrainerIdentity = { ...OWNER, id: 9 }

/** 안 쓰러진 쪽이 남을 때까지 가장 센 기술로 민다 */
async function playToEnd(c: BattleController, limit = 200): Promise<number> {
  let steps = 0
  while (!c.ended && steps < limit) {
    const actions = c.actions
    if (!actions.length) break
    const best = actions
      .filter((a) => a.type === 'move')
      .sort((a, b) => (movesById.get(b.move ?? 0)?.power ?? 0)
        - (movesById.get(a.move ?? 0)?.power ?? 0))[0]
    await c.choose(best ?? actions[0]!)
    steps++
  }
  return steps
}

async function open(trainer: TrainerIdentity, badges: number, seed: number) {
  return BattleController.start({
    player: { name: '나', team: [spawn(487, 100, seed, 'p1-0'), spawn(445, 100, seed + 1, 'p1-1')] },
    foe: { name: '야생', team: [spawn(396, 5, seed + 2, 'p2-0')] },
    basePp: (id) => movesById.get(id)?.pp ?? 5,
    random: rng(seed),
    obedience: { badges, trainer },
  })
}

describe('말을 안 듣는 판', () => {
  it('내가 잡은 마리는 뱃지가 없어도 판정을 안 탄다', async () => {
    // 100레벨을 뱃지 0으로 데리고 나왔는데도 한 번도 안 불복해야 한다
    const seen: string[] = []
    for (const seed of [11, 12, 13, 14, 15]) {
      const { controller } = await open(OWNER, 0, seed)
      for (let i = 0; i < 20 && !controller.ended; i++) {
        const actions = controller.actions
        if (!actions.length) break
        const got = await controller.choose(actions[0]!)
        for (const e of got.events) if (e.kind === 'disobey') seen.push(e.reason)
      }
      controller.destroy()
    }
    expect(seen).toEqual([])
  }, 60_000)

  it('남에게 받은 100레벨은 뱃지 0에서 불복해도 판이 끝까지 간다', async () => {
    // ⚠️ 씨앗을 여럿 돌린다 — 불복 갈래가 넷이라 한 판으로는 다 못 지나간다.
    // 그중 하나라도 명령을 잘못 보내면 그 판이 굳어서 `limit`에 걸린다
    for (const seed of [1, 2, 3, 5, 8, 13, 21, 34]) {
      const { controller } = await open(STRANGER, 0, seed)
      const steps = await playToEnd(controller)
      expect(steps, `씨앗 ${seed}에서 배틀이 섰다`).toBeLessThan(200)
      expect(controller.ended, `씨앗 ${seed}에서 안 끝났다`).toBe(true)
      controller.destroy()
    }
  }, 60_000)

  it('불복이 실제로 나오고 네 갈래가 다 지나간다', async () => {
    const kinds = new Set<string>()
    for (let seed = 1; seed <= 40 && kinds.size < 4; seed++) {
      const { controller } = await open(STRANGER, 0, seed)
      for (let i = 0; i < 40 && !controller.ended; i++) {
        const actions = controller.actions
        if (!actions.length) break
        const got = await controller.choose(actions[0]!)
        for (const e of got.events) if (e.kind === 'disobey') kinds.add(e.reason)
      }
      controller.destroy()
    }
    // 잠들어 있어야 나오는 `ignoredAsleep`은 여기서 안 만든다 — 나머지 넷이다
    expect([...kinds].sort()).toEqual(['hitSelf', 'nap', 'nothing', 'otherMove'])
  }, 90_000)

  it('뱃지 여덟이면 통째로 사라진다', async () => {
    const kinds: string[] = []
    for (const seed of [1, 2, 3, 5, 8]) {
      const { controller } = await open(STRANGER, 0xff, seed)
      for (let i = 0; i < 20 && !controller.ended; i++) {
        const actions = controller.actions
        if (!actions.length) break
        const got = await controller.choose(actions[0]!)
        for (const e of got.events) if (e.kind === 'disobey') kinds.push(e.reason)
      }
      controller.destroy()
    }
    expect(kinds).toEqual([])
  }, 60_000)
})
