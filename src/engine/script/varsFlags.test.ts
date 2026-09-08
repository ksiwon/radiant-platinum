// 플래그 번호를 디컴프 표와 맞춰 본다.
//
// `FLAG_HAS_POKEDEX` 하나로 시작 메뉴의 도감 줄이 있고 없다. 손으로 적어 둔
// 번호라 디컴프가 한 줄만 바뀌어도 조용히 어긋나는데, 어긋나면 "도감이 안 뜬다"
// 로만 보이고 왜인지는 안 보인다.
//
// ⚠️ `raw/`는 리포에 안 들어간다(§14.1 — 롬 하나가 128MB다). 그래서 표가
// 있을 때만 돌린다. 없다고 통과시키는 게 아니라 **건너뛴다**.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { it, expect } from 'vitest'
import { FLAG_HAS_POKEDEX, VarStore, VARS_START } from './vars'
import { TRAINER_DEFEATED_FLAGS_START } from './commands'
import { withDecomp } from '../../data/romData.testkit'

const TABLE = resolve(__dirname, '../../../raw/decomp/generated/vars_flags.txt')
const maybe = withDecomp('generated/vars_flags.txt')

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

/**
 * **0번은 플래그가 아니다.**
 *
 * ⚠️ **이 한 줄이 없으면 게임의 사람이 통째로 사라진다.** 실측(2026-09-08
 * `_nurse42`): 무쇠시티 포켓몬센터(맵 48)의 배치표 아홉 명이 **전원** 숨어
 * 명부가 비었고, 간호사에게 영영 말을 못 걸어 첫 배지에서 멎었다.
 *
 * 길은 이렇다 — 배치표의 「숨김 조건 없음」이 0으로 적히고(`events.json`의
 * `flag: 0`), `RemoveObject`가 지운 사람의 숨김 플래그를 세우는데
 * (`MapObject_SetFlagAndDeleteObject`) 그 사람의 플래그가 0이면 **0을 세운다.**
 * 그 뒤로는 `spawnNpcs`의 `checkFlag(hide)`가 flag 0인 사람 전부에게 참이다.
 *
 * 원작도 그 줄은 조건 없이 부른다. 막는 자리는 저장소다 (`vars_flags.c`의
 * `VarsFlags_GetFlagChunk` → `flagID == 0`이면 `NULL`)
 */
it('0번 플래그는 세워도 안 서고 물으면 거짓이다', () => {
  const vars = new VarStore()
  expect(vars.checkFlag(0)).toBe(false)
  vars.setFlag(0)
  expect(vars.checkFlag(0)).toBe(false)
  // 이웃한 비트는 멀쩡해야 한다 — 0을 막는다고 1이 같이 죽으면 안 된다
  vars.setFlag(1)
  expect(vars.checkFlag(1)).toBe(true)
  expect(vars.checkFlag(0)).toBe(false)
  // 세이브에서 되살아나도 마찬가지다. 이미 0이 켜진 채 저장된 리포트가 있다
  // (`.audit/journey/seg-09.rpsave`의 플래그 첫 바이트가 0x05다)
  vars.flags[0] |= 1
  expect(vars.checkFlag(0)).toBe(false)
  expect(vars.checkFlag(1)).toBe(true)
})

it('0번을 세우거나 지워도 저장 바이트가 안 바뀐다', () => {
  const vars = new VarStore()
  // 이미 0이 켜진 채로 저장된 리포트를 들여온 자리 (`seg-09.rpsave` 첫 바이트 0x05)
  vars.flags[0] = 0x05
  vars.setFlag(0)
  expect(vars.flags[0]).toBe(0x05)
  vars.clearFlag(0)
  // ⚠️ **0을 「청소」하지 않는다.** 원작의 `VarsFlags_GetFlagChunk`가 0에
  // `NULL`을 돌려주므로 set도 clear도 **아무 바이트도 안 만진다** — 우리가
  // 여기서 비트를 꺼 주면 그것도 원작에 없는 쓰기다
  expect(vars.flags[0]).toBe(0x05)
  // 그 옆의 진짜 플래그는 평소대로 선다
  vars.setFlag(3)
  expect(vars.checkFlag(3)).toBe(true)
  vars.clearFlag(3)
  expect(vars.checkFlag(3)).toBe(false)
})
