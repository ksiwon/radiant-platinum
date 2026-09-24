// 뒤에 이어 가는 걸음이 부르는 길잡이가 **실제로 넘어가는가** (`drive.mjs`의 `handles`)
//
// ⚠️ **글로 대조한다.** 길잡이는 브라우저를 띄워야 만들어지므로 여기서 부를 수 없다.
// 대신 `handles()`에 적힌 이름과 걸음 코드가 쓰는 `api.이름`을 맞춘다 — 목록이 두
// 벌이던 때 `npcSpots`가 한쪽에서 빠졌고, 새 게임부터 한 판으로 장막 체육관에 처음
// 닿은 13판(2026-09-24)이 문간에서 `api.npcSpots is not a function`으로 터졌다
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const HERE = import.meta.dirname
const read = (name) => readFileSync(resolve(HERE, name), 'utf8')

/** `const handles = () => ({ ... })` 안에 적힌 이름들 */
function handleNames() {
  const src = read('drive.mjs')
  const at = src.indexOf('const handles = () => ({')
  expect(at, '`handles`가 없다').toBeGreaterThan(0)
  const body = src.slice(at + 'const handles = () => ({'.length, src.indexOf('})', at))
  return new Set(body.replace(/\/\/.*$/gm, '').split(/[,\s]+/).filter((w) => /^[A-Za-z_]\w*$/.test(w)))
}

describe('길잡이 한 벌', () => {
  it('걸음 코드가 부르는 api.* 가 전부 handles에 있다', () => {
    const names = handleNames()
    const used = new Set()
    for (const file of ['journey.mjs', 'badges.mjs']) {
      for (const m of read(file).matchAll(/\bapi\.(\w+)/g)) used.add(m[1])
    }
    expect(used.size).toBeGreaterThan(20)
    expect([...used].filter((u) => !names.has(u))).toEqual([])
  })

  it('두 갈래가 같은 한 벌을 넘긴다', () => {
    const src = read('drive.mjs')
    // 목록을 다시 따로 적으면 `after({`가 생긴다
    expect(src.match(/await after\(\{/g) ?? []).toHaveLength(0)
    expect(src.match(/await after\(handles\(\)\)/g) ?? []).toHaveLength(2)
  })
})
