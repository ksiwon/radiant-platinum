// 구운 프리팹 전부를 실제로 굴려 본다 — 굽는 쪽(`import/bdsp/fx.ts`)과 받는 쪽이
// 같은 모양을 보고 있는지는 여기서만 드러난다.
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { DATA, withData } from '../../../data/romData.testkit'
import { FxEffect } from './effect'
import { makeInstances, writeInstances, type FxCamera } from './instances'
import { readMaterial } from './material'
import type { FxPrefab } from './schema'

const maybe = withData('fx/prefab/eb001_capture.json', 'fx/index.json')

const cam: FxCamera = { pos: [2.7, 1.5, 5], right: [0.88, 0, -0.47], up: [0, 1, 0], forward: [-0.47, -0.1, -0.88], tanHalfFov: Math.tan(Math.PI / 12) }

function load(name: string): FxPrefab {
  return JSON.parse(readFileSync(resolve(DATA, 'fx/prefab', `${name}.json`), 'utf8')) as FxPrefab
}

maybe('구운 BDSP 이펙트', () => {
  it('eb001_capture — 시스템 열셋(루트 빈 것 + 그리는 것 열둘), 부속 이미터가 이어진다', () => {
    const e = new FxEffect(load('eb001_capture'))
    expect(e.slots.length).toBe(13)
    const rendered = e.slots.filter((s) => s.renderer?.enabled)
    expect(rendered.length).toBe(12)
    const flashSub = e.slots.find((s) => s.path === 'flash_sub')!
    expect(flashSub.system.subs.map((s) => s.child)).toContain(e.slots.find((s) => s.path === 'flash_sub/flash_many_Child')!.system)
    e.play()
    let peak = 0
    for (let t = 0; t <= 3; t += 0.05) {
      e.advanceTo(t)
      peak = Math.max(peak, e.alive)
    }
    expect(peak).toBeGreaterThan(20)
    expect(e.done).toBe(true)
  })

  it('볼 포획 · 내보내기 전부와 기술 일부가 NaN 없이 돈다', () => {
    const names = readdirSync(resolve(DATA, 'fx/prefab')).map((f) => f.replace(/\.json$/, ''))
    const pick = names.filter((n, i) => n.startsWith('eb') || i % 25 === 0)
    let checked = 0
    for (const name of pick) {
      const e = new FxEffect(load(name), 3)
      for (const s of e.slots) {
        const m = s.renderer?.materials?.[0]
        if (m) readMaterial(m, s.controller)
      }
      e.play()
      const out = makeInstances(512)
      const order = new Uint16Array(512)
      for (let t = 0.1; t <= 1.5; t += 0.35) {
        e.advanceTo(t)
        for (const s of e.slots) {
          const n = writeInstances(s, cam, out, order)
          for (let i = 0; i < n * 3; i++) {
            if (!Number.isFinite(out.center[i]!) || !Number.isFinite(out.axisX[i]!)) {
              throw new Error(`${name}/${s.path}: 인스턴스 ${Math.floor(i / 3)}이 유한하지 않다`)
            }
          }
        }
      }
      checked++
    }
    expect(checked).toBeGreaterThan(80)
  })
})
