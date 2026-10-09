// P4 · P5 끝 점검의 순수 부분 — 줄 만들기 · 판정 접기 · 명단 일치 (`partChecks.mjs` · `partProbe.mjs`)
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  buildCheckRows, canvasRow, CHECK_KEYS, consoleRow, fold, isBenign, reportRow, resumeRow, skyDecision, terrainRow,
} from './partChecks.mjs'
import { probeRoster, PROBE_PARTS } from './partProbe.mjs'

const good = (name) => ({
  name, canvas: { drawn: true, steady: true, filled: 8, roi: 8, voids: 0 }, readiness: { ok: true },
  canvases: { stage: 1, total: 1 },
})
const blank = (name) => ({ ...good(name), canvas: { drawn: false, steady: true, filled: 1, roi: 8, voids: 0, landWhy: '비었다' } })

describe('fold', () => {
  it('FAIL이 BLOCKED보다 세다', () => {
    expect(fold(['PASS', 'BLOCKED', 'FAIL'])).toBe('FAIL')
    expect(fold(['PASS', 'BLOCKED'])).toBe('BLOCKED')
    expect(fold(['PASS', 'PASS'])).toBe('PASS')
  })
  it('빈 목록은 통과가 아니다', () => { expect(fold([])).toBe('BLOCKED') })
})

describe('terrainRow', () => {
  const want = ['start', 'e', 'f']
  it('다 떴고 다 그려졌으면 PASS', () => {
    expect(terrainRow([good('start'), good('e'), good('f')], want).status).toBe('PASS')
  })
  it('컷이 모자라면 BLOCKED — PASS로 접지 않는다', () => {
    const r = terrainRow([good('start'), good('e')], want)
    expect(r.status).toBe('BLOCKED')
    expect(r.detail).toContain('f')
  })
  it('빈 지형이 있으면 모자란 컷이 있어도 FAIL', () => {
    expect(terrainRow([good('start'), blank('e')], want).status).toBe('FAIL')
  })
  it('흔들린 컷은 FAIL', () => {
    const shook = { ...good('e'), canvas: { ...good('e').canvas, steady: false } }
    expect(terrainRow([good('start'), shook, good('f')], want).status).toBe('FAIL')
  })
  it('준비 실패는 FAIL, 재는 자가 못 물은 것은 BLOCKED', () => {
    const slow = { ...good('e'), readiness: { ok: false, why: '안 섰다' } }
    const broke = { ...good('e'), readiness: { ok: false, probeFailed: true, why: '못 물었다' } }
    expect(terrainRow([good('start'), slow, good('f')], want).status).toBe('FAIL')
    expect(terrainRow([good('start'), broke, good('f')], want).status).toBe('BLOCKED')
  })
  it('캔버스를 못 뗀 컷은 BLOCKED', () => {
    expect(terrainRow([good('start'), { name: 'e', error: '캔버스가 0개다' }, good('f')], want).status).toBe('BLOCKED')
  })
  it('하늘 기준을 못 쓴 까닭이 줄에 남는다', () => {
    const dark = { ...good('e'), skyWhy: '하늘 칸이 전부 어둡다' }
    const r = terrainRow([good('start'), dark, good('f')], want)
    expect(r.status).toBe('PASS')
    expect(r.detail).toContain('하늘 기준')
  })
  it('기본 컷이 떨어져도 같은 자리 1인칭 수평 컷이 그려졌으면 PASS — 두 판정이 줄에 남는다', () => {
    const snow = { ...blank('e'), canvas: { ...blank('e').canvas, filled: 5, level: { drawn: true, filled: 7, roi: 8 } } }
    const r = terrainRow([good('start'), snow, good('f')], want)
    expect(r.status).toBe('PASS')
    expect(r.detail).toContain('e 지형칸 5/8 → 1인칭 수평 7/8')
  })
  it('1인칭 수평 컷도 떨어졌거나 못 쟀으면 FAIL', () => {
    const both = { ...blank('e'), canvas: { ...blank('e').canvas, level: { drawn: false, filled: 2, roi: 8 } } }
    const none = { ...blank('e'), canvas: { ...blank('e').canvas, level: { drawn: false, unobservable: '시점을 못 바꿨다' } } }
    expect(terrainRow([good('start'), both, good('f')], want).status).toBe('FAIL')
    expect(terrainRow([good('start'), none, good('f')], want).status).toBe('FAIL')
  })
  it('잰 컷이 하나도 없으면 BLOCKED', () => { expect(terrainRow([], [])).toMatchObject({ status: 'BLOCKED' }) })
})

describe('skyDecision', () => {
  it('못 찍었거나 비었거나 전부 어두우면 계약 2로 잰다', () => {
    expect(skyDecision(null).use).toBe(false)
    expect(skyDecision([]).use).toBe(false)
    expect(skyDecision([[2, 2, 3], [0, 0, 0]]).use).toBe(false)
    expect(skyDecision([[2, 2, 3], [120, 150, 200]]).use).toBe(true)
  })
  it('쓸 수 없는 까닭을 적는다', () => { expect(skyDecision(null).why).toMatch(/계약 2/) })
})

describe('consoleRow', () => {
  it('0건 + 끝까지 갔으면 PASS, 못 갔으면 BLOCKED', () => {
    expect(consoleRow([], { toTheEnd: true }).status).toBe('PASS')
    expect(consoleRow([], { toTheEnd: false }).status).toBe('BLOCKED')
  })
  it('한 건이라도 있으면 끝까지 못 갔어도 FAIL', () => {
    const r = consoleRow([{ kind: 'error', text: '터졌다' }, { kind: 'warning', text: 'w' }], { toTheEnd: false })
    expect(r.status).toBe('FAIL')
    expect(r.detail).toContain('오류 1 · 경고 1')
  })
  it('알려진 잡음은 거르되 gl 폴백 두 줄은 gl에서만 거른다', () => {
    expect(isBenign('Download the React DevTools')).toBe(true)
    expect(isBenign('WebGPU is not available, running under WebGL2 backend', true)).toBe(true)
    expect(isBenign('WebGPU is not available, running under WebGL2 backend', false)).toBe(false)
    expect(isBenign('TypeError: x is undefined')).toBe(false)
  })
})

describe('canvasRow', () => {
  it('게임 캔버스가 하나씩이면 PASS', () => { expect(canvasRow([good('a'), good('b')]).status).toBe('PASS') })
  it('둘이거나 0이면 FAIL', () => {
    expect(canvasRow([good('a'), { ...good('b'), canvases: { stage: 2, total: 2 } }]).status).toBe('FAIL')
    expect(canvasRow([{ name: 'a', canvases: { stage: 0, total: 0 } }]).status).toBe('FAIL')
  })
  it('센 컷이 없으면 BLOCKED', () => { expect(canvasRow([{ name: 'a', error: 'x' }]).status).toBe('BLOCKED') })
})

describe('resumeRow', () => {
  const saved = { map: 80, matrix: 0, x: 10.5, z: 20.5, facing: 1.2 }
  const at = (o = {}) => ({ world: { map: 80, matrix: 0, grid: true }, player: { x: 10.5, z: 20.5, facing: 1.2 }, ...o })
  const run = (got, extra = {}) => resumeRow({ want: saved, got, stood: true, restoredOk: true, ...extra })
  it('같은 자리 · 방향이면 PASS', () => { expect(run(at()).status).toBe('PASS') })
  it('같은 맵의 옆 자리는 FAIL — 칸 내림으로 통과시키지 않는다', () => {
    expect(run(at({ player: { x: 11.0, z: 20.5, facing: 1.2 } })).status).toBe('FAIL')
  })
  it('다른 맵 · 다른 방향 · 못 선 것은 FAIL', () => {
    expect(run(at({ world: { map: 81, matrix: 0, grid: true } })).status).toBe('FAIL')
    expect(run(at({ player: { x: 10.5, z: 20.5, facing: 2.0 } })).status).toBe('FAIL')
    expect(run(at(), { restoredOk: false }).status).toBe('FAIL')
  })
  it('방향은 2π를 돌아 같으면 같다', () => {
    expect(run(at({ player: { x: 10.5, z: 20.5, facing: 1.2 + Math.PI * 2 } })).status).toBe('PASS')
  })
  it('되켜지 못했으면(got 없음) FAIL, 저장한 값을 못 읽었으면 BLOCKED', () => {
    expect(run(null).status).toBe('FAIL')
    expect(resumeRow({ want: null, got: at(), stood: true, restoredOk: true }).status).toBe('BLOCKED')
  })
})

describe('reportRow', () => {
  it('끝이 없으면 BLOCKED · 파일이 없으면 FAIL · 있으면 PASS', () => {
    expect(reportRow({ end: null, digest: null }).status).toBe('BLOCKED')
    expect(reportRow({ end: { file: 'a' }, digest: null }).status).toBe('FAIL')
    expect(reportRow({ end: { file: 'a' }, digest: 'abc' }).status).toBe('PASS')
  })
})

describe('buildCheckRows', () => {
  it('아무것도 못 모았으면 다섯 줄 다 PASS가 아니다', () => {
    const rows = buildCheckRows({ cuts: [], expectCuts: [], noise: [], toTheEnd: false, resume: null, end: null, digest: null })
    expect(Object.keys(rows)).toEqual(CHECK_KEYS)
    for (const k of CHECK_KEYS) expect(rows[k].status).not.toBe('PASS')
  })
})

describe('파트 명단', () => {
  it('P4 · P5는 다리 줄과 끝 점검 줄 다섯을 겹침 없이 낸다', () => {
    const all = []
    for (const n of [4, 5]) {
      const def = PROBE_PARTS[n]
      expect(Object.keys(def.checks)).toEqual(CHECK_KEYS)
      const r = probeRoster(n)
      expect(r).toHaveLength(Object.keys(def.legs).length + CHECK_KEYS.length)
      all.push(...r)
    }
    expect(new Set(all).size).toBe(all.length)
  })
  it('P4 · P5 번호가 journey 번호대(01~56 · 99)와 안 겹친다', () => {
    for (const id of [...probeRoster(4), ...probeRoster(5)]) {
      expect(Number(id)).toBeGreaterThan(56)
      expect(id).not.toBe('99')
    }
  })
  it('도구 지문 목록에 탐침 · 다리 파일이 있고 실제로 있는 파일이다', () => {
    const must = {
      4: ['tools/e2e/_dw.mjs', 'tools/e2e/badgesDW.mjs'],
      5: ['tools/e2e/_league.mjs', 'tools/e2e/badgesLeague.mjs'],
    }
    for (const n of [4, 5]) {
      for (const f of must[n]) expect(PROBE_PARTS[n].harness).toContain(f)
      for (const f of PROBE_PARTS[n].harness) expect(existsSync(resolve(import.meta.dirname, '../..', f))).toBe(true)
    }
  })
})
