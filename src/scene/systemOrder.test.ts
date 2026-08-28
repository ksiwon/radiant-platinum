// 시스템이 도는 차례 (`EngineDriver`)
//
// ⚠️ **차례가 규칙의 일부인데 그것을 지키는 것이 등록 순서 한 줄뿐이다.**
// 실제로 한 번 어긋났다: 밟은 자리를 보는 스크립트가 이동 **앞**에만 있어서
// 워프가 좌표 트리거를 한 프레임 앞질렀다. 주인공이 트리거 칸에 발을 들이는
// 것은 이동 시스템인데, 워프는 그 뒤에서 보고 스크립트는 그 앞에서 봤기
// 때문이다. 그래서 용식이 집 문 앞의 장면이 **집 안에서** 이어졌고, 그 장면이
// 주인공을 벽 속에 세워 맵뚫이 났다 (REPAIR §25).
//
// 원작 차례는 `Field_ProcessStep`(밟은 자리) → `Field_CheckMapTransition`(워프)다
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const SRC = readFileSync(resolve(__dirname, 'EngineDriver.tsx'), 'utf8')

/** `gameLoop.register(이름)`을 등록된 차례대로 준다 */
const ORDER = [...SRC.matchAll(/gameLoop\.register\((?:\{\s*fixedUpdate:\s*)?(\w+)/g)]
  .map((m) => m[1]!)

const at = (name: string): number => {
  const i = ORDER.indexOf(name)
  expect(i, `${name}이 등록돼 있다`).toBeGreaterThanOrEqual(0)
  return i
}

describe('시스템 등록 차례', () => {
  it('발을 묶는 것들이 이동보다 먼저다', () => {
    // 스크립트·낚시·물뿌리개가 입력을 지워서 발을 묶는다. 뒤에 두면 이미
    // 그 프레임만큼 걸어간 뒤다
    for (const s of ['scriptSystem', 'fishingSystem', 'berryWateringSystem']) {
      expect(at(s), s).toBeLessThan(at('playerSystem'))
    }
    // NPC도 스크립트 뒤다 — `LockAll`이 이번 프레임부터 먹어야 한다
    expect(at('scriptSystem')).toBeLessThan(at('npcSystem'))
  })

  it('밟은 자리를 보는 스크립트가 이동 뒤 · 워프 앞이다', () => {
    expect(at('playerSystem')).toBeLessThan(at('scriptStepSystem'))
    expect(at('scriptStepSystem')).toBeLessThan(at('warpSystem'))
  })

  it('한 칸 밟은 뒤에 도는 것들이 조우보다 먼저다', () => {
    // 독·리펠·친밀도가 먼저고 그 안에서 스크립트가 걸리면 그 프레임은 거기서 끝이다
    expect(at('stepSystem')).toBeLessThan(at('encounterSystem'))
    // 조우 컷인은 카메라 바로 앞이다 — 그 프레임의 팔 배율을 카메라가 읽는다
    expect(at('cutInSystem')).toBe(at('cameraSystem') - 1)
  })
})
