import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { APP_VERSION } from '../../state/save/contract'
import { KIND_NAME, NOTES, VERSION, markPatchSeen, unreadPatch } from './patchLog'

/** `1.2.3` · `v1.2` → 세 자리 수. 빈 자리는 0이다 */
function semver(v: string): [number, number, number] {
  const [a = 0, b = 0, c = 0] = v.replace(/^v/, '').split('.').map(Number)
  return [a, b, c]
}

function cmp(x: string, y: string): number {
  const a = semver(x)
  const b = semver(y)
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i]
  return 0
}

describe('patchLog', () => {
  afterEach(() => { vi.unstubAllGlobals() })

  it('맨 앞이 최신이다 — 날짜가 앞에서 뒤로 줄어들고 판 이름이 겹치지 않는다', () => {
    for (let i = 1; i < NOTES.length; i++) {
      expect(NOTES[i - 1].date >= NOTES[i].date).toBe(true)
    }
    expect(new Set(NOTES.map((n) => n.v)).size).toBe(NOTES.length)
  })

  it('날짜는 ISO이고 판마다 한 줄 이상 있고 갈래 이름이 있다', () => {
    for (const n of NOTES) {
      expect(n.date).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(n.items.length).toBeGreaterThan(0)
      for (const it of n.items) {
        expect(KIND_NAME[it.kind]).toBeTruthy()
        expect(it.text.length).toBeGreaterThan(0)
      }
    }
  })

  it('지금 판은 NOTES[0]을 따른다 — 그래야 새 판에서 점이 다시 켜진다', () => {
    expect(VERSION).toBe(NOTES[0].v)
    expect(VERSION).toBe('v1.1.0')
  })

  it('타이틀의 판 표시는 package.json에서 오고, 패치노트는 그 판을 앞지르지 않는다', () => {
    const pkg = JSON.parse(readFileSync(resolve(import.meta.dirname, '../../../package.json'), 'utf8')) as
      { version: string }
    expect(APP_VERSION).toBe(pkg.version)
    expect(cmp(NOTES[0].v, APP_VERSION)).toBeLessThanOrEqual(0)
  })

  it('판 이름이 앞에서 뒤로 줄어든다', () => {
    for (let i = 1; i < NOTES.length; i++) {
      expect(cmp(NOTES[i - 1].v, NOTES[i].v)).toBeGreaterThan(0)
    }
  })

  it('지난 판을 본 사람에게는 점이 뜨고, 보고 나면 꺼진다', () => {
    const store = new Map<string, string>([['radiant.patch.seen', 'v0.1']])
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v) },
    })
    expect(unreadPatch()).toBe(true)
    markPatchSeen()
    expect(store.get('radiant.patch.seen')).toBe(VERSION)
    expect(unreadPatch()).toBe(false)
  })

  it('localStorage가 던지면 점을 안 띄우고 넘어간다', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('denied') },
      setItem: () => { throw new Error('denied') },
    })
    expect(unreadPatch()).toBe(false)
    expect(() => markPatchSeen()).not.toThrow()
  })
})
