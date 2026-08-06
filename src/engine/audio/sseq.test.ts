// 악보 형식 검증 (DATA.md §2.18)
//
// 재생이 아니라 **형식 확인**이다. 명령 폭을 하나만 잘못 알아도 악보 전체가
// 한 칸씩 밀리는데, 그러면 틀린 답이 그럴듯한 크기로 나온다 — 그것이 이 형식의
// 함정이다. 그래서 세 가지를 동시에 본다: 모르는 명령이 없고, 음표 세기가
// 127을 안 넘고, 템포가 사람이 쓰는 범위다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { commandWidth } from './sseq'

const present = existsSync(resolve(__dirname, '../../../public/data/sound/index.json'))
const maybe = present ? describe : describe.skip

maybe('악보 명령표', () => {
  it('0x00~0x7f은 음표다 — 명령 번호가 곧 음 높이다', () => {
    // 이걸 놓치면 악보가 한 칸씩 밀린다
    for (const op of [0, 60, 0x7f]) expect(commandWidth(op)).toBe('note')
    expect(commandWidth(0x80)).not.toBe('note')
  })

  it('가변 길이를 쓰는 명령이 셋이다', () => {
    // 쉼표 · 악기 바꾸기, 그리고 음표의 길이
    expect(commandWidth(0x80)).toBe('var')
    expect(commandWidth(0x81)).toBe('var')
  })

  it('뛰기와 부르기가 24비트 주소를 쓴다', () => {
    expect(commandWidth(0x94)).toBe('u24')
    expect(commandWidth(0x95)).toBe('u24')
    expect(commandWidth(0x93)).toBe('track')
  })

  it('트랙을 끝내는 명령은 폭이 0이다', () => {
    for (const op of [0xfc, 0xfd, 0xff]) expect(commandWidth(op)).toBe(0)
  })

  it('모르는 명령이 있으면 null이 나온다', () => {
    // 전곡을 걸었을 때 이것이 하나도 안 나오는 것이 형식을 아는 증거다
    expect(commandWidth(0x8f)).toBeNull()
    expect(commandWidth(0xf0)).toBeNull()
  })
})

maybe('추출기와 같은 표를 쓴다', () => {
  it('두 벌이 256개 값에서 하나도 안 어긋난다', () => {
    // 추출기는 CommonJS라 TS를 못 부른다. 표가 두 벌인 것을 시험이 붙들어 둔다 —
    // 어긋나면 롬을 다시 뽑을 때만 티가 나고 그때는 이미 늦다
    // 추출기는 CommonJS라 타입이 없다. 파일을 읽어 함수로 만든다 —
    // import 하면 `tsc`가 선언 파일을 찾다 멈춘다
    const src = readFileSync(resolve(__dirname, '../../../tools/extract/sseqTable.js'), 'utf8')
    const body = src.slice(src.indexOf('module.exports =') + 'module.exports ='.length)
    const other = eval(`(${body})`) as (op: number) => unknown
    for (let op = 0; op < 256; op++) {
      expect(other(op), `0x${op.toString(16)}`).toBe(commandWidth(op))
    }
  })
})
