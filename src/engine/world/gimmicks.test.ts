// 필드 기믹 — 번들 목록이 두 굽는 쪽에서 같고, 꿀나무 흔들림 단계가 클립에 바로 이어진다
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  GIMMICK_ANIMATED, GIMMICK_MODELS, GIMMICK_STATIC, HONEY_TREE_CLIPS, gimmickNames, honeyTreeClip,
} from './gimmicks'
import { shakeAnimation } from './honeyTree'

describe('기믹 번들 목록', () => {
  it('노드 쪽 `bdspArena.py`의 목록과 같다 — 한쪽에만 더하면 설치본이나 개발판에서만 빠진다', () => {
    const py = readFileSync(resolve(__dirname, '../../../tools/extract/bdspArena.py'), 'utf8')
    const list = (name: string): string[] => {
      const m = new RegExp(`^${name} = \\[([^\\]]*)\\]`, 'm').exec(py)
      return m === null ? [] : [...m[1]!.matchAll(/"([^"]+)"/g)].map((x) => x[1]!)
    }
    expect(list('GIMMICK_STATIC')).toEqual([...GIMMICK_STATIC])
    expect(list('GIMMICK_ANIMATED')).toEqual([...GIMMICK_ANIMATED])
  })

  it('쓰임 다섯이 다 굽는 목록에 있다', () => {
    expect(new Set(Object.values(GIMMICK_MODELS))).toEqual(new Set(gimmickNames()))
    expect(gimmickNames()).toEqual([...gimmickNames()].sort())
  })
})

describe('꿀나무 클립 (`honeyTreeClip`)', () => {
  it('원작 흔들림 세 단계가 차례대로 `Move01~03`이다 — 흔들림 횟수 1 · 2 · 3', () => {
    expect([1, 2, 3].map((n) => honeyTreeClip(shakeAnimation(n)))).toEqual([...HONEY_TREE_CLIPS])
  })

  it('안 흔들리면 쉼 자세다', () => {
    expect(honeyTreeClip(null)).toBe('Wait')
    expect(honeyTreeClip(shakeAnimation(0))).toBe('Wait')
  })
})
