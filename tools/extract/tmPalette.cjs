'use strict'
// 기술머신 아이콘의 팔레트를 기술 타입에 맞춘다 (docs/BUGS.md §1.1)
//
// ⚠️ **두 파이프라인이 같은 값을 내야 한다.** 노드 추출기(`items.js`)와 브라우저
// 변환기가 쓰는 표(`itemTableModule.cjs`)가 각자 팔레트를 계산하는데, 한쪽만
// 고치면 `convert.test.ts`가 바이트 비교에서 걸린다 — 그래서 규칙을 여기 한 곳에
// 둔다.
//
// 규칙은 이름 그 자체다. 기술머신 아이콘의 팔레트는 `tm_flying.NCLR`처럼
// **가르치는 기술의 타입**을 이름에 달고 있다. 그래서 맞는지 짐작할 필요가 없다.
//
// 백 개 중 하나가 어긋난다 — 비전머신5(디폿)는 비행 기술인데 `tm_water`를
// 가리켜서 가방에서 물빛으로 뜬다. 나머지 99개는 열일곱 타입 전부 만장일치라,
// 이 검사는 그 하나만 잡는다.
const fs = require('node:fs')
const path = require('node:path')

/**
 * 그 기술머신이 써야 할 팔레트 색인.
 *
 * @param decomp 디컴프 뿌리
 * @param iconIndex `item_icon.order`의 `이름_확장자` → 줄 번호
 * @param teachesMove `MOVE_DEFOG` 같은 이름표
 * @returns 팔레트 색인
 */
function wantedPalette(decomp, iconIndex, teachesMove) {
  const stem = teachesMove.slice('MOVE_'.length).toLowerCase()
  const data = JSON.parse(
    fs.readFileSync(path.join(decomp, `res/moves/${stem}/data.json`), 'utf8'),
  )
  const name = `tm_${String(data.type).slice('TYPE_'.length).toLowerCase()}_NCLR`
  const want = iconIndex.get(name)
  if (want === undefined) throw new Error(`${teachesMove}: ${name}이 순서 파일에 없다`)
  return want
}

/**
 * 어긋난 것을 고치고 `log`에 적는다. 기술머신이 아니면 그대로 돌려준다.
 *
 * 하나를 넘으면 원작 버그가 아니라 이 규칙이 틀린 것이므로 `check`가 던진다
 */
function fixTmPalette(decomp, iconIndex, constant, teachesMove, palette, log) {
  const want = wantedPalette(decomp, iconIndex, teachesMove)
  if (want === palette) return palette
  log.push(`${constant} ${teachesMove} ${palette} → ${want}`)
  return want
}

/** 고친 것이 하나뿐인지 본다. 두 개면 규칙을 다시 봐야 한다 */
function checkTmPalette(log) {
  if (log.length > 1) {
    throw new Error(`타입과 다른 팔레트가 ${log.length}개다:\n  ${log.join('\n  ')}`)
  }
}

module.exports = { fixTmPalette, checkTmPalette }
