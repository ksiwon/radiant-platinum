// 맵 초기화 표 (`initScripts.ts`)
//
// 조용히 틀릴 자리가 둘이다:
//
//   ① **매 프레임 표의 오프셋 기준.** `.long \name-.-4`라 기준이 그 4바이트
//      **바로 뒤**다. 앞으로 잡으면 4바이트 어긋난 자리를 표로 읽는데, 거기도
//      숫자가 있으므로 예외가 안 나고 **엉뚱한 스크립트가 걸린다**.
//   ② **머리 항목의 폭.** 종류에 따라 1+2+2와 1+4로 담기는 것이 다른데 둘 다
//      5바이트다. 그 사실을 모르고 종류별로 다르게 세면 뒤가 통째로 밀린다.
//
// 두 시험이 서로 다른 것을 본다. 앞은 손으로 푼 20바이트 하나이고, 뒤는
// `scripts.bin`의 초기화 파일 549개 전부다.
import { readFileSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { frameTableScript, INIT_SCRIPT, parseInitScripts } from './initScripts'
import { scriptFileSchema } from '../../data/schema'

describe('초기화 표 읽기', () => {
  /**
   * 떡잎마을 집 2층의 표 20바이트 그대로다
   * (`scripts_init_twinleaf_town_player_house_2f`, 실측).
   *
   * 원본은 이렇게 읽힌다:
   *
   *   InitScriptEntry_OnTransition 5
   *   InitScriptEntry_OnFrameTable  → 표는 이 항목 뒤 1바이트
   *   InitScriptEntryEnd
   *   InitScriptGoToIfEqual VAR_PLAYER_HOUSE_SPECIAL_PROGRAM_STATE(0x40F9), 0, 3
   *   InitScriptFrameTableEnd
   */
  const HOUSE_2F = Uint8Array.from([
    0x02, 0x05, 0x00, 0x00, 0x00,
    0x01, 0x01, 0x00, 0x00, 0x00,
    0x00,
    0xf9, 0x40, 0x00, 0x00, 0x03, 0x00,
    0x00, 0x00,
    0x00,
  ])

  it('종류와 스크립트 번호가 원본과 같다', () => {
    const init = parseInitScripts(HOUSE_2F)
    expect(init.fixed.get(INIT_SCRIPT.onTransition)).toBe(5)
    // 매 프레임 표는 고정 항목이 아니다 — 번호가 아니라 표를 가리킨다
    expect(init.fixed.has(INIT_SCRIPT.frameTable)).toBe(false)
    expect(init.frame).toEqual([{ left: 0x40f9, right: 0, script: 3 }])
  })

  it('오프셋 기준이 4바이트 뒤다', () => {
    // 기준을 앞으로 잡으면 `00 00 00 f9 40 00`을 한 줄로 읽어 left가 0이 되고
    // 표가 통째로 비어 버린다. 비지 않았다는 것이 곧 기준이 맞다는 뜻이다
    expect(parseInitScripts(HOUSE_2F).frame).toHaveLength(1)
  })

  it('값이 맞을 때만 스크립트를 준다', () => {
    const init = parseInitScripts(HOUSE_2F)
    expect(frameTableScript(init, (id) => (id === 0x40f9 ? 0 : id))).toBe(3)
    expect(frameTableScript(init, (id) => (id === 0x40f9 ? 1 : id))).toBeNull()
  })

  it('표가 없어도 안 터진다', () => {
    expect(parseInitScripts(new Uint8Array(0))).toEqual({ fixed: new Map(), frame: [] })
    // 머리가 잘린 파일. 5바이트를 못 채우면 거기서 멈춘다
    expect(parseInitScripts(Uint8Array.from([0x02, 0x05]))).toEqual({ fixed: new Map(), frame: [] })
  })
})

const DATA = resolve(__dirname, '../../../public/data')
const present = existsSync(resolve(DATA, 'scripts.json')) && existsSync(resolve(DATA, 'scripts.bin'))
const maybe = present ? describe : describe.skip

maybe('신오 전체', () => {
  const meta = scriptFileSchema.parse(JSON.parse(readFileSync(resolve(DATA, 'scripts.json'), 'utf8')))
  const bin = new Uint8Array(readFileSync(resolve(DATA, 'scripts.bin')))
  const inits = meta.files
    .map((f, i) => ({ f, i }))
    .filter(({ f }) => f.kind === 'init')
    .map(({ f }) => ({ name: f.name, parsed: parseInitScripts(bin.subarray(f.at, f.at + f.size)) }))

  it('초기화 파일 549개가 다 읽힌다', () => {
    // 이름이 `scripts_init_`인 파일은 550개인데 하나(`scripts_init_new_game`)는
    // 표가 아니라 보통 바이트코드다 — 추출기가 그것만 `code`로 가른다
    expect(meta.files.filter((f) => f.name.startsWith('scripts_init_'))).toHaveLength(550)
    expect(inits).toHaveLength(549)
  })

  it('종류별 개수가 원본 어셈블리와 같다', () => {
    // 왼쪽은 우리가 바이트에서 센 것, 오른쪽은 디컴프의 `scripts_init_*.s`에서
    // `InitScriptEntry_*` 줄을 센 것이다. 서로 모르는 두 길이 같은 수를 낸다
    const count = (type: number): number => inits.filter((r) => r.parsed.fixed.has(type)).length
    expect(count(INIT_SCRIPT.onTransition)).toBe(244)
    expect(count(INIT_SCRIPT.onResume)).toBe(36)
    expect(count(INIT_SCRIPT.onLoad)).toBe(46)
    expect(inits.filter((r) => r.parsed.frame.length > 0)).toHaveLength(105)
    expect(inits.reduce((n, r) => n + r.parsed.frame.length, 0)).toBe(207)
    // 절반 가까이가 빈 표다. 그 맵은 들어설 때 아무것도 안 돈다
    expect(inits.filter((r) => r.parsed.fixed.size === 0 && r.parsed.frame.length === 0)).toHaveLength(251)
  })

  it('매 프레임 표의 왼쪽이 전부 변수다', () => {
    // ⚠️ 이게 이 시험의 핵심이다. 오프셋이 조금이라도 어긋나면 왼쪽에 좌표나
    // 스크립트 번호 같은 작은 수가 들어오는데, 207줄이 **하나도 예외 없이**
    // 0x4000 이상이면 표를 제자리에서 읽고 있다는 뜻이다
    const left = inits.flatMap((r) => r.parsed.frame.map((row) => row.left))
    expect(left).toHaveLength(207)
    expect(left.filter((v) => v < 0x4000)).toEqual([])
  })
})
