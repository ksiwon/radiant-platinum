// 배틀 가방 줄의 **읽기 전용 표시** (지시서 R7).
//
// 화면을 모는 하네스(`tools/e2e/drive.mjs`의 `maybePotion`)는 「좋은상처약이
// 몇째 줄인가」를 알 데가 없었다. 그래서 세이브 가방의 순번을 화면 줄 번호로
// 그대로 쓰다가, 0이 아니면 그 판의 약을 **통째로 포기**했다.
//
// ⚠️ **두 순번은 같지 않다.** 배틀 가방은 `battlePocket` 비트로 다시 거르고
// 여섯 줄씩 쪽을 나눈다 — 세이브에서 셋째인 도구가 화면에서는 첫 줄일 수도,
// 둘째 쪽일 수도 있다. 그 어긋남을 메우는 것이 이 표시다.
//
// 표시는 **읽기만 한다.** 규칙도 화면도 이 값으로 갈리지 않는다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const bag = readFileSync(resolve(__dirname, 'BattleBag.tsx'), 'utf8')
const drive = readFileSync(resolve(__dirname, '../../../tools/e2e/drive.mjs'), 'utf8')

describe('가방 줄이 무엇인지 적어 둔다', () => {
  it('목록과 줄에 표시가 붙는다', () => {
    for (const mark of [
      'data-battle-bag="items"',
      'data-item-id={one.item}',
      'data-item-row={index}',
      'data-item-count={one.count}',
      'aria-selected={index === at}',
      'data-cursor={at}',
      'data-items={list.length}',
    ]) {
      expect(bag, `${mark}이 없다 — 하네스가 줄을 못 짚는다`).toContain(mark)
    }
  })

  it('표시는 화면에서 읽는 값 그대로다', () => {
    // 줄 번호는 거른 목록의 색인이다. 세이브 가방의 순번이 아니다
    expect(bag).toContain('const index = page * PER_PAGE + i')
  })
})

describe('하네스가 첫 줄만 누르지 않는다', () => {
  it('세이브 순번으로 포기하던 분기가 없다', () => {
    expect(drive, '약이 첫 줄이 아니면 포기하는 분기가 남아 있다')
      .not.toContain('회복 주머니 ${String(mine.row)}번째라 첫 줄을 못 누른다')
    expect(drive).not.toMatch(/if \(mine\.row !== 0\)/)
  })

  it('화면 표시를 읽어 커서를 옮긴다', () => {
    expect(drive).toContain('[data-battle-bag="items"]')
    expect(drive).toContain("el.getAttribute('data-item-id')")
    // 옮긴 뒤 **선 줄의 도구 번호**를 다시 확인하고서야 결정한다
    expect(drive).toContain('stood.item !== potion.item')
  })

  it('못 찾으면 결정을 안 누르고 물러난다', () => {
    expect(drive).toContain('const backOff = async () =>')
    expect(drive).toContain('커서가 ${String(potion.name)} 줄에 안 섰다')
  })

  it('화면 줄과 세이브 순번을 따로 적는다', () => {
    expect(drive).toContain('screenRow: seat.row, saveRow: mine.row')
    expect(drive).toContain('rows: potion.rows')
  })

  it('사탕을 지워 약을 첫 줄로 만드는 우회가 없다', () => {
    // 지시서 R7 5번 — 정상 가방 내용과 순서는 존중한다
    expect(drive).not.toMatch(/사탕[^\n]*지운다|removeItem\(\s*RARE_CANDY/)
  })
})
