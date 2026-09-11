// 롬의 글 한 줄을 채워서 화면에 놓는다 (PARITY §2.24 · §2.26).
//
// 배틀 위 화면(`messages.ts`)과 배틀 안의 가방·파티 화면(`BattleBag` ·
// `SwitchScreen`)이 **같은 규칙**으로 채워야 한다. 한쪽만 조사를 롬에 맡기거나
// 한쪽만 창을 다르게 가르면 같은 배틀 안에서 말투가 갈린다.
import { formatMessage, MESSAGE_SLOTS, MessageSlots } from '../../engine/script/text'

/**
 * 뱅크의 `at`번째 줄에 값을 차례로 넣는다. 못 채우면 **null**이다.
 *
 * ⚠️ **빈칸을 못 채우면 문장을 통째로 비운다.** 조사가 뒤에 붙는 자리라
 * 영어로 떨어뜨리면 화면에 「Tackle을(를) 스케치했다!」가 뜬다 — 실제로 그랬다.
 * 뱅크가 안 왔을 때(`lines`가 빈 배열) 조용해지는 것도 같은 규칙이다: 글 한 줄
 * 때문에 배틀이 서면 그것이 더 나쁘다.
 *
 * 조사는 **롬이 든다.** `{STRVAR_1 1, 0, 2}`의 셋째 값이 은/는·을/를 가리는
 * 번호이고, 그 셈은 `engine/script/text`의 `particleFor`가 한다
 */
export function romLine(
  lines: readonly string[], at: number, ...values: readonly (string | null)[]
): string | null {
  const raw = lines[at]
  if (raw === undefined || raw === '') return null
  const filled: string[] = []
  for (const value of values) {
    if (value === null || value === '') return null
    filled.push(value)
  }
  const slots = new MessageSlots(Math.max(filled.length, MESSAGE_SLOTS))
  filled.forEach((value, i) => { slots.set(i, value) })
  return pages(formatMessage(raw, slots))
}

/**
 * 창 단위로 편다.
 *
 * 롬은 창을 **비우고 새로 찍는** 자리를 `\r`로, 한 줄 올리고 **잇는** 자리를
 * `\f`로 적어 둔다. 우리 규칙은 그 둘을 그대로 옮긴 것이다:
 *
 *   `\n`     한 창 안에서 줄만 바꾼다 (롬의 `\n`·`\f`)
 *   `\n\n`   **창을 새로 연다** (롬의 `\r`)
 *
 * ⚠️ **이 규칙이 없는 동안 화면이 반 문장씩 떴다.** 박자 만드는 쪽이 `\n`마다
 * 창을 새로 열고 있어서, 롬의 두 줄짜리(「모부기의 / 공격이 떨어졌다!」)가
 * 두 창으로 갈렸다 — 시험은 전부 초록이었고 **화면에서만 보였다**
 */
function pages(text: string): string {
  return text
    .replace(/\f/g, '\n')
    .replace(/\r/g, '\n\n')
    .replace(/[\s]+$/, '')
}
