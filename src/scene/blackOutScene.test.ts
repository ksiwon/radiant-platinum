// 전멸 과제의 차례 (`FieldTask_BlackOutFromBattle` · `unk_020528D0.c`)
//
// 가짜 바깥을 끼워 원작 상태 번호대로 일이 오는가를 본다 — 워프 → 곡 줄이기 → (맵이 다 갈리고
// 스크립트가 끝나기를 기다림) → 곡 끊기 → 검은 화면의 글 → 덮고 → 공용 스크립트.
//
// ⚠️ **롬 글은 안 적는다.** 여기서 다루는 것은 번호뿐이다 (COPYRIGHT.md §6).
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bankIndex } from '../import/platinum/textBanks'
import {
  BLACK_OUT_BANK, BLACK_OUT_BGM_FADE, BLACK_OUT_SCRIPT, BLACK_OUT_TEXT, blackOutRunning, blackOutScene,
  resetBlackOut, runBlackOut, type BlackOutHost,
} from './pokecenter'

/** 떡잎마을 주인공 집 1층 — `spawnTable`의 첫 줄 */
const PLAYER_HOUSE_1F = 414
/** 잔디마을 포켓몬센터 1층 — 표의 둘째 줄 */
const SANDGEM_CENTER_1F = 420

describe('전멸 — 줄과 스크립트를 고른다', () => {
  it('집으로 가면 4번 줄과 2020, 센터로 가면 3번 줄과 2021', () => {
    expect(blackOutScene(0, PLAYER_HOUSE_1F)).toEqual({ line: BLACK_OUT_TEXT.home, script: BLACK_OUT_SCRIPT.home })
    expect(blackOutScene(1, SANDGEM_CENTER_1F))
      .toEqual({ line: BLACK_OUT_TEXT.pokecenter, script: BLACK_OUT_SCRIPT.pokecenter })
    expect(BLACK_OUT_TEXT).toEqual({ pokecenter: 3, home: 4 })
    expect(BLACK_OUT_SCRIPT).toEqual({ home: 2020, pokecenter: 2021 })
  })

  it('글은 도착한 맵을, 스크립트는 부활 자리를 본다 — 잣대가 따로다', () => {
    // 원작이 두 갈래를 다른 값으로 가른다 (`mapHeaderID` · `GetBlackOutWarpId`)
    expect(blackOutScene(3, PLAYER_HOUSE_1F)).toEqual({ line: BLACK_OUT_TEXT.home, script: BLACK_OUT_SCRIPT.pokecenter })
    expect(blackOutScene(0, SANDGEM_CENTER_1F)).toEqual({ line: BLACK_OUT_TEXT.pokecenter, script: BLACK_OUT_SCRIPT.home })
  })

  it('뱅크 번호가 미국 롬 이름 순서의 자리와 같다', () => {
    expect(BLACK_OUT_BANK).toBe(bankIndex('black_out_scene', 'us'))
  })

  it('곡을 줄이는 프레임은 원작 인자다 (`Sound_FadeOutBGM(0, 20)`)', () => {
    expect(BLACK_OUT_BGM_FADE).toBe(20)
  })

  // 노드 굽는 쪽(`tools/extract/dialogue.js`)이 이 뱅크를 실어야 개발 서버에서도 글이 뜬다
  it.skipIf(!existsSync(resolve(__dirname, '../../public/data/dialogue/index.json')))(
    '구운 대사 목록에 그 뱅크가 다섯 줄로 있다', () => {
      const index = JSON.parse(readFileSync(resolve(__dirname, '../../public/data/dialogue/index.json'), 'utf8')) as {
        banks: { index: number, name: string, entries: number }[]
      }
      const bank = index.banks.find((b) => b.index === BLACK_OUT_BANK)
      expect(bank?.name).toBe('TEXT_BANK_BLACK_OUT_SCENE')
      expect(bank?.entries).toBe(5)
    },
  )
})

/** 부른 차례를 적는 가짜 바깥 */
function fakeHost(over: Partial<BlackOutHost> & { to?: number | null, text?: string } = {}) {
  const log: string[] = []
  let settled = false
  const host: BlackOutHost = {
    giratinaAltered: () => { log.push('giratina') },
    clearPartner: () => { log.push('partner') },
    blacken: (on) => { log.push(`blacken:${String(on)}`) },
    warp: () => { log.push('warp'); return over.to === undefined ? PLAYER_HOUSE_1F : over.to },
    fadeOutBgm: (frames) => { log.push(`fade:${String(frames)}`) },
    silence: (on) => { log.push(`silence:${String(on)}`) },
    settled: () => settled,
    line: (index) => { log.push(`line:${String(index)}`); return Promise.resolve(over.text ?? 'page') },
    say: (text) => { log.push(`say:${text}`); return Promise.resolve() },
    cover: (on) => { log.push(`cover:${String(on)}`) },
    startScript: (id) => { log.push(`script:${String(id)}`); return true },
    healParty: () => { log.push('heal') },
    until: async (cond) => {
      log.push('wait')
      // 맵이 다 갈리는 것은 기다리는 동안의 일이다
      settled = true
      await Promise.resolve()
      return cond()
    },
    frames: (count) => { log.push(`frames:${String(count)}`); return Promise.resolve(true) },
    ...over,
  }
  return { host, log }
}

describe('전멸 — 과제의 차례', () => {
  it('원작 상태 번호 차례대로 온다', async () => {
    const { host, log } = fakeHost()
    expect(await runBlackOut(host, 0)).toBe(true)
    expect(log).toEqual([
      // 0 — 기라티나 · 검은 판 · 워프 · 동행
      'giratina', 'blacken:true', 'warp', 'partner',
      // 글은 미리 받아 둔다
      'line:4',
      // 1·2 — 곡을 줄이고 다 줄 때까지
      'fade:20', 'frames:20',
      // 맵이 다 갈리고 돌던 스크립트가 끝나기를
      'wait',
      // 맵을 간 **뒤에** 곡을 끊는다 — 맵 갈이가 가로채기를 비우므로
      'silence:true',
      // 3 — 검은 화면의 글
      'say:page',
      // 4·5 — 덮고, 검은 판을 걷고, 곡을 놓고, 공용 스크립트
      'cover:true', 'blacken:false', 'silence:false', 'script:2020',
    ])
  })

  it('회복은 과제가 아니라 깨어난 자리의 스크립트가 한다', async () => {
    const { host, log } = fakeHost({ to: SANDGEM_CENTER_1F })
    await runBlackOut(host, 1)
    expect(log).not.toContain('heal')
    expect(log).toContain('line:3')
    expect(log.at(-1)).toBe('script:2021')
  })

  it('스크립트를 못 걸면 그 자리에서 낫게 하고 덮개를 걷는다', async () => {
    const { host, log } = fakeHost({ startScript: () => false })
    await runBlackOut(host, 0)
    expect(log.slice(-2)).toEqual(['heal', 'cover:false'])
  })

  it('갈 자리를 못 찾으면 검은 판을 걷고 낫게 한 뒤 끝낸다', async () => {
    const { host, log } = fakeHost({ to: null })
    expect(await runBlackOut(host, 0)).toBe(true)
    expect(log).toEqual(['giratina', 'blacken:true', 'warp', 'partner', 'blacken:false', 'heal'])
  })

  it('뱅크가 없으면 글 없이 지나간다 — 빈 창을 띄우지 않는다', async () => {
    const { host, log } = fakeHost({ text: '' })
    await runBlackOut(host, 0)
    expect(log.some((l) => l.startsWith('say:'))).toBe(false)
    expect(log.at(-1)).toBe('script:2020')
  })

  it('도중에 걷히면 거기서 멈춘다 — 글도 스크립트도 없다', async () => {
    const { host, log } = fakeHost({ until: () => Promise.resolve(false) })
    expect(await runBlackOut(host, 0)).toBe(false)
    expect(log.some((l) => l.startsWith('say:') || l.startsWith('script:'))).toBe(false)
  })

  it('걷으면 도는 판이 없다', () => {
    resetBlackOut()
    expect(blackOutRunning()).toBe(false)
  })
})
