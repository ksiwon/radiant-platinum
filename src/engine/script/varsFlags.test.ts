// 플래그 번호를 디컴프 표와 맞춰 본다.
//
// `FLAG_HAS_POKEDEX` 하나로 시작 메뉴의 도감 줄이 있고 없다. 손으로 적어 둔
// 번호라 디컴프가 한 줄만 바뀌어도 조용히 어긋나는데, 어긋나면 "도감이 안 뜬다"
// 로만 보이고 왜인지는 안 보인다.
//
// ⚠️ `raw/`는 리포에 안 들어간다(§14.1 — 롬 하나가 128MB다). 그래서 표가
// 있을 때만 돌린다. 없다고 통과시키는 게 아니라 **건너뛴다**.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { FLAG_HAS_POKEDEX, VARS_START } from './vars'
import { TRAINER_DEFEATED_FLAGS_START } from './commands'

const TABLE = resolve(__dirname, '../../../raw/decomp/generated/vars_flags.txt')
const maybe = existsSync(TABLE) ? describe : describe.skip

/**
 * `vars_flags.txt`를 C enum처럼 센다.
 *
 * 이름만 있는 줄은 앞 값에서 하나 올라가고, `A = B` 줄은 B의 값을 받는다.
 * 줄 번호로 세면 안 된다 — `= ` 줄과 구역 표시 줄이 섞여 있어서 어긋난다
 */
function readFlags(): Map<string, number> {
  const out = new Map<string, number>()
  let value = 0
  for (const raw of readFileSync(TABLE, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (line === '') continue
    const eq = line.indexOf('=')
    if (eq >= 0) {
      const name = line.slice(0, eq).trim()
      const rhs = line.slice(eq + 1).trim()
      const from = out.get(rhs)
      value = from ?? Number(rhs)
      out.set(name, value)
    } else {
      out.set(line, value)
    }
    value += 1
  }
  return out
}

maybe('플래그 표', () => {
  const flags = readFlags()

  /**
   * ⚠️ **먼저 세는 법이 맞는지부터 본다.** 이름에 번호가 박힌 항목들이
   * 그 번호로 떨어져야 한다 — 안 떨어지면 아래 값도 전부 못 믿는다
   */
  it('이름에 적힌 번호와 센 값이 같다', () => {
    const named = [...flags].filter(([name]) => /^FLAG_UNUSED_0x[0-9A-F]{4}$/.test(name))
    expect(named.length).toBeGreaterThan(100)
    const wrong = named.filter(([name, value]) => Number(`0x${name.slice(-4)}`) !== value)
    expect(wrong).toEqual([])
  })

  it('도감 플래그가 144다', () => {
    expect(flags.get('FLAG_HAS_POKEDEX')).toBe(FLAG_HAS_POKEDEX)
  })

  it('다른 데서 쓰는 번호도 같은 표에서 나온다', () => {
    expect(flags.get('TRAINER_DEFEATED_FLAGS_START')).toBe(TRAINER_DEFEATED_FLAGS_START)
    expect(flags.get('VARS_START')).toBe(VARS_START)
  })
})
