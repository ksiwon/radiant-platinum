// 컷신을 재는 자가 스스로 어긋나지 않는가 (REPAIR §9)
//
// ⚠️ **이 자는 「무엇이 잘못됐다」고 말하는 자다.** 그래서 틀리면 멀쩡한 자리를
// 붉게 만들고, 사람은 없는 병을 찾으러 간다 — 실제로 첫 실행에서 현관 앞과
// 갤럭시단 둘을 그렇게 세웠다(간판·우편함·화살표·로토무 방 벽). 여기서 재는
// 것은 **거르는 규칙이 아직 참인가**다.
//
// 화면 안에서 도는 `installSceneWatch`는 여기서 안 부른다 — 그건 `story.mjs`가
// 실제로 돌 때만 잴 수 있다. 순수한 `readSceneWatch`만 본다.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readSceneWatch } from './sceneWatch.mjs'

const ROOT = resolve(import.meta.dirname, '../..')

/** 그림이 1·2번만 있는 세상 */
const only12 = new Set([1, 2])
const box = (over = {}) => ({ script: 7, msg: 0, talker: null, ...over })
const seen = (over = {}) => ({
  pages: { expected: 1, turned: 1 }, boxes: [box()], gfx: [], ...over,
})

describe('컷신을 재는 자', () => {
  it('창이 하나도 안 열렸으면 아무 말도 안 한다', () => {
    expect(readSceneWatch({ pages: { expected: 0, turned: 0 }, boxes: [], gfx: [] }, only12))
      .toEqual({ say: null, trouble: [] })
    expect(readSceneWatch(null, only12)).toEqual({ say: null, trouble: [] })
  })

  it('롬 쪽 수보다 적게 지나가면 세운다', () => {
    const got = readSceneWatch(seen({ pages: { expected: 5, turned: 2 } }), only12)
    expect(got.trouble).toHaveLength(1)
    expect(got.trouble[0]).toContain('3쪽이 안 지나갔다')
    expect(got.say).toContain('2/5쪽')
  })

  it('다 지나갔으면 안 세운다', () => {
    expect(readSceneWatch(seen({ pages: { expected: 5, turned: 5 } }), only12).trouble).toEqual([])
  })

  it('그림이 없는 번호가 서면 세운다', () => {
    const got = readSceneWatch(seen({ gfx: [1, 999] }), only12)
    expect(got.trouble).toEqual(['그림이 없는 사람이 컷신에 섰다 — 번호 999'])
  })

  it('그림 표를 안 주면 그림은 안 본다', () => {
    expect(readSceneWatch(seen({ gfx: [999] }), null).trouble).toEqual([])
  })

  // ⚠️ **여기가 헛돌던 자리다.** 소품은 화면 안에서 걸러서 `gfx`에 안 들어온다
  // (`installSceneWatch`). 말을 거는 쪽은 걸러지지 않고 `prop` 표시를 달고 온다
  it('말을 건 상대가 소품이면 그림이 없어도 안 센다', () => {
    const sign = seen({ boxes: [box({ talker: { localID: 3, gfx: 94, prop: true } })] })
    expect(readSceneWatch(sign, only12).trouble).toEqual([])
  })

  it('말을 건 상대가 사람인데 그림이 없으면 센다', () => {
    const ghost = seen({ boxes: [box({ talker: { localID: 3, gfx: 94, prop: false } })] })
    const got = readSceneWatch(ghost, only12)
    expect(got.trouble).toHaveLength(1)
    expect(got.trouble[0]).toContain('말을 건 상대의 그림이 없다')
    expect(got.say).toContain('상대 있는 창 1')
  })
})

// ⚠️ **거르는 까닭이 사라져도 거르기는 안 없어진다** — 사람이 지워야 하는데
// 지울 계기가 없다. 그래서 **까닭이 아직 참인지**를 산출물에서 직접 잰다:
// 이 번호들이 정말로 그림표에 없고, 정말로 소품표에 있는가
describe('소품을 거르는 까닭', () => {
  const sprites = resolve(ROOT, 'public/data/npcSprites.json')
  const propTable = readFileSync(resolve(ROOT, 'src/import/platinum/fldeffProps.ts'), 'utf8')

  it.skipIf(!existsSync(sprites))('스윕이 세웠던 번호 넷이 그림표에 없다', () => {
    const got = JSON.parse(readFileSync(sprites, 'utf8'))
    const have = new Set(Object.keys(got.sprites ?? got))
    // 91 지도간판 · 92 우편함 · 94 화살표 · 262 로토무 방 벽
    for (const gfx of [91, 92, 94, 262]) {
      expect(have.has(String(gfx)), `${String(gfx)}번이 그림표에 생겼다`).toBe(false)
    }
  })

  it('그 넷이 소품표에 있다', () => {
    const rows = propTable.slice(propTable.indexOf('PROP_KIND_BY_GFX'))
    for (const gfx of [91, 92, 94, 262]) {
      expect(new RegExp('\\[' + String(gfx) + ',').test(rows), String(gfx)).toBe(true)
    }
  })
})
