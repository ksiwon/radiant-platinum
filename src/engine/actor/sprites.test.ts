// NPC 그림표 검증.
//
// 여기서 틀리면 사람이 **엉뚱한 쪽을 보고 서 있는다** — 그런데 그림 자체는
// 멀쩡히 나오므로 눈으로는 잘 안 걸린다. 그래서 뽑아 둔 자료와 맞대 본다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  artDir, cameraQuadrant, frameOf, loadNpcSprites, npcSprite, type NpcSprite,
} from './sprites'

/** 닌자꼬마와 같은 모양의 최소 표본 — 16장, 방향마다 4장 */
const WALKER: NpcSprite = {
  name: 'NINJA_BOY', w: 32, h: 32, frames: 16,
  seq: {
    ticks: [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60],
    frames: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  },
  anims: [[0, 15, 0], [16, 31, 0], [32, 47, 0], [48, 63, 0]],
  directional: true,
}

describe('방향 고르기', () => {
  it('카메라가 안 돌면 원작과 같다 — 동작 번호가 곧 방향이다', () => {
    for (const dir of [0, 1, 2, 3]) expect(artDir(dir, 0)).toBe(dir)
  })

  it('마주 보면 얼굴이 보인다', () => {
    // 북(0)을 보는 사람을 남쪽에서 보면 뒤통수(0), 북쪽에서 보면 얼굴(1)이다
    expect(artDir(0, 0)).toBe(0)
    expect(artDir(0, 2)).toBe(1)
    // 남(1)을 보는 사람은 그 반대다
    expect(artDir(1, 0)).toBe(1)
    expect(artDir(1, 2)).toBe(0)
  })

  it('네 사분면을 돌면 제자리로 온다', () => {
    for (const dir of [0, 1, 2, 3]) {
      expect(artDir(dir, 4)).toBe(artDir(dir, 0))
      const seen = new Set([0, 1, 2, 3].map((q) => artDir(dir, q)))
      // 한 바퀴 돌면 네 그림이 한 번씩 나와야 한다. 겹치면 매핑이 접힌 것이다
      expect(seen.size).toBe(4)
    }
  })

  it('카메라 사분면은 −Z가 북쪽이다', () => {
    expect(cameraQuadrant(0, -1)).toBe(0)
    expect(cameraQuadrant(1, 0)).toBe(1)
    expect(cameraQuadrant(0, 1)).toBe(2)
    expect(cameraQuadrant(-1, 0)).toBe(3)
  })
})

describe('장 고르기', () => {
  it('서 있으면 그 방향의 첫 장이다', () => {
    expect(frameOf(WALKER, 0, 0)).toBe(0)
    expect(frameOf(WALKER, 1, 0)).toBe(4)
    expect(frameOf(WALKER, 2, 0)).toBe(8)
    expect(frameOf(WALKER, 3, 0)).toBe(12)
  })

  it('걸으면 네 장을 돌고 제자리로 온다', () => {
    expect([0, 4, 8, 12].map((t) => frameOf(WALKER, 1, t))).toEqual([4, 5, 6, 7])
    // 한 동작이 16틱이라 16틱째는 다시 처음이다
    expect(frameOf(WALKER, 1, 16)).toBe(4)
  })

  it('동작 구간을 넘어가도 옆 방향을 침범하지 않는다', () => {
    for (let t = 0; t < 200; t++) {
      expect(frameOf(WALKER, 0, t)).toBeLessThan(4)
      expect(frameOf(WALKER, 3, t)).toBeGreaterThanOrEqual(12)
    }
  })

  it('한 번만 도는 동작은 끝 장에서 멈춘다', () => {
    const once: NpcSprite = { ...WALKER, anims: [[0, 15, 1]] }
    expect(frameOf(once, 0, 12)).toBe(3)
    expect(frameOf(once, 0, 999)).toBe(3)
  })

  it('차례나 동작이 없는 정물은 늘 첫 장이다', () => {
    const rock: NpcSprite = {
      name: 'MOSS_ROCK', w: 16, h: 16, frames: 1, seq: null, anims: null, directional: false,
    }
    for (const t of [0, 7, 99]) expect(frameOf(rock, 0, t)).toBe(0)
    // 동작이 모자라면 있는 것 중 마지막을 쓴다. 범위 밖을 읽지 않는다
    expect(frameOf(rock, 3, 0)).toBe(0)
  })
})

// ── 뽑아 둔 진짜 자료와 맞댄다 ──────────────────────────────────────────────
const FILE = resolve(__dirname, '../../../public/data/npcSprites.json')
const maybe = existsSync(FILE) ? describe : describe.skip

maybe('뽑아 둔 표', () => {
  const data = JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, NpcSprite>
  loadNpcSprites(data)

  it('주인공과 흔한 NPC가 들어 있다', () => {
    expect(npcSprite(0)?.name).toBe('PLAYER_M')
    expect(npcSprite(1)?.name).toBe('NINJA_BOY')
  })

  it('방향이 있는 것은 네 쪽이 서로 다른 그림으로 선다', () => {
    const walkers = Object.entries(data).filter(([, s]) => s.directional)
    expect(walkers.length).toBeGreaterThan(100)
    for (const [gfx, s] of walkers) {
      expect(s.anims?.length, `${gfx} ${s.name}`).toBeGreaterThanOrEqual(4)
      const standing = [0, 1, 2, 3].map((d) => frameOf(s, d, 0))
      expect(new Set(standing).size, `${gfx} ${s.name}`).toBe(4)
    }
  })

  it('방향이 없다고 적힌 것은 정말로 안 갈린다', () => {
    for (const [gfx, s] of Object.entries(data)) {
      if (s.directional) continue
      const standing = [0, 1, 2, 3].map((d) => frameOf(s, d, 0))
      // 갈리는데 안 갈린다고 적혀 있으면 표가 틀린 것이다
      expect(new Set(standing).size, `${gfx} ${s.name}`).toBeLessThan(4)
    }
  })

  it('차례표가 가리키는 장이 전부 아틀라스 안에 있다', () => {
    for (const [gfx, s] of Object.entries(data)) {
      if (s.seq === null) continue
      expect(s.seq.ticks).toHaveLength(s.seq.frames.length)
      for (const f of s.seq.frames) {
        expect(f, `${gfx} ${s.name}`).toBeGreaterThanOrEqual(0)
        expect(f, `${gfx} ${s.name}`).toBeLessThan(s.frames)
      }
    }
  })

  it('어느 방향 어느 틱을 물어도 아틀라스 밖을 안 가리킨다', () => {
    for (const s of Object.values(data)) {
      for (let a = 0; a < 4; a++) {
        for (const t of [0, 1, 5, 13, 47, 63, 64, 255]) {
          const f = frameOf(s, a, t)
          expect(f, s.name).toBeGreaterThanOrEqual(0)
          expect(f, s.name).toBeLessThan(s.frames)
        }
      }
    }
  })

  it('그림표에 있는 것은 PNG도 있다', () => {
    for (const gfx of Object.keys(data)) {
      expect(existsSync(resolve(__dirname, `../../../public/data/npc/${gfx}.png`)), gfx).toBe(true)
    }
  })

  it('배치된 사람이 전부 그림을 찾는다 — 못 찾는 것은 사람이 아니다', () => {
    const events = JSON.parse(
      readFileSync(resolve(__dirname, '../../../public/data/events.json'), 'utf8'),
    ) as { events: Record<string, { npcs: { sprite: number }[] }> }

    // 사람이 아닌 것들. 간판·우편함·책은 프롭이고, 열매밭은 자란 정도로 그림이
    // 갈리고, VAR_0…F는 실행 중에 변수에서 읽는다 (DATA.md §2.16)
    const NOT_PEOPLE = new Set([
      91, 92, 93, 94, 95, 96, 100, 118, 183, 209, 262,
      101, 102, 103, 104, 105, 111, 112,
    ])

    let drawn = 0
    let props = 0
    const orphans = new Map<number, number>()
    for (const file of Object.values(events.events)) {
      for (const npc of file.npcs) {
        if (data[String(npc.sprite)] !== undefined) drawn++
        else if (NOT_PEOPLE.has(npc.sprite)) props++
        else orphans.set(npc.sprite, (orphans.get(npc.sprite) ?? 0) + 1)
      }
    }
    expect([...orphans], '그림도 없고 프롭도 아닌 배치가 있다').toEqual([])
    expect(drawn).toBe(3128)
    expect(props).toBe(427)
  })

  it('닌자꼬마가 서 있는 네 장이 .1 .5 .9 .13이다', () => {
    // 16장이 방향마다 4장씩이라 첫 장은 0·4·8·12다. 그림을 뽑아 눈으로도 봤다:
    // 0은 뒤통수(북), 4는 얼굴(남), 8과 12는 서로 거울인 옆모습(서·동)이다.
    // 차례표가 밀리면 이 넷이 달라진다
    const s = npcSprite(1)
    expect(s).not.toBeNull()
    expect([0, 1, 2, 3].map((d) => frameOf(s as NpcSprite, d, 0))).toEqual([0, 4, 8, 12])
  })
})
