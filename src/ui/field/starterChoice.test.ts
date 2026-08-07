// 파트너 고르는 화면의 번호들 (`starterChoice.ts`)
//
// ⚠️ **뒤집혀도 화면은 멀쩡하다.** 커서 자리와 글 뱅크의 순서가 어긋나면
// 모부기를 고르고 "불꽃숭이로 하겠느냐?"가 뜨는데, 그림도 글도 다 나오므로
// 원작을 옆에 놓고 보지 않는 한 안 걸린다. 그래서 **글 안의 이름**과
// 종족 표의 이름을 맞춰 본다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { STARTER_BANK, STARTER_TEXT, STARTERS } from './starterChoice'

const DATA = resolve(__dirname, '../../../public/data')
const BANK = resolve(DATA, `dialogue/ko/${String(STARTER_BANK)}.json`)
const NAMES = resolve(DATA, 'names/species.ko.json')
const maybe = existsSync(BANK) && existsSync(NAMES) ? describe : describe.skip
const read = (p: string): string[] => JSON.parse(readFileSync(p, 'utf8')) as string[]

maybe('파트너 고르는 화면', () => {
  const bank = read(BANK)
  const names = read(NAMES)

  it('글 뱅크가 원작이 읽는 자리를 다 갖고 있다', () => {
    // `choose_starter_app.c`가 읽는 것은 0 · 1~3 · 4~6 · 7이다
    expect(bank).toHaveLength(8)
    expect(bank[STARTER_TEXT.pokeBalls]).toContain('몬스터볼')
    expect(bank[STARTER_TEXT.nowChoose]).not.toBe('')
  })

  it('커서 자리와 글의 순서가 같다', () => {
    expect(STARTERS).toHaveLength(3)
    STARTERS.forEach((species, at) => {
      const line = bank[STARTER_TEXT.firstChoice + at] ?? ''
      const name = names[species] ?? ''
      expect(name).not.toBe('')
      // "{COLOR 3}어린잎포켓몬 모부기{COLOR 0}\n이 포켓몬으로 하겠느냐?"
      expect(line, `${String(at)}번 칸`).toContain(name)
    })
  })

  it('넷째~여섯째 칸은 아래 화면 이름표라 비어 있다', () => {
    // 원작이 `SetSubplaneWindowText`로 읽는 자리다. 롬에 공백만 들어 있어서
    // 우리 화면에서는 쓸 것이 없다 — 안 쓰는 것이 맞다는 근거로 적어 둔다
    for (const at of [4, 5, 6]) expect((bank[at] ?? '').trim()).toBe('')
  })
})
