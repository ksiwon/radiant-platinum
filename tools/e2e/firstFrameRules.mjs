// **첫 화면 관문의 판정만** 여기 있다 — 브라우저도 파일도 안 건드린다.
//
// ⚠️ **왜 갈라 뒀나.** 판정이 하네스 본문 안에 있으면 브라우저를 띄우지 않고는
// 「크기가 어긋난 컷 한 쌍이 통과로 새어 들어가는가」를 못 잰다. 실제로 그 구멍이
// 있었다 — 비교기가 크기 불일치에 `1`을 냈고 부르는 쪽은 그것을 **정상 변화**로
// 읽었다. 여기 있는 것은 순수 함수뿐이고, `canvasShot.test.mjs`가 지어낸 판으로
// 그 구멍을 직접 쏜다.
//
// 한 판(`run`)의 모양:
//
//     { n, crash?, shots: [이름…], field, neg, moved, span }
//       field  { drawn, colors, stdev }
//       neg    { drawn, colors, stdev, still: { comparable, ratio } }
//       moved  { drawn, colors, walked, key, change: { comparable, ratio } }
//       span   { ok, why }   기준 컷부터 마지막 컷까지 화면이 안 흔들렸는가

/** 정상 입력 앞뒤로 세계가 달라졌다고 볼 최소 비율. 실측 표본에서 온 값이다 */
export const MOVED = 0.02

/** 한 판에서 반드시 찍어야 할 컷. **판정 밖에서 온다** */
export const NEED = ['field', 'bg', 'bg-again', 'moved']

const mark = (id, what, status, detail) => ({ id, what, status, detail })

/**
 * 다섯 줄을 낸다.
 *
 * ⚠️ **못 견준 컷은 어디서도 통과로 안 샌다.** `comparable`이 거짓이면 그것을
 * 쓰는 줄은 PASS를 못 받는다 — 자가 판단을 못 한 것이지 게임이 잘한 것이 아니다
 */
export function judgeFirstFrame(runs, wanted) {
  const ok = runs.filter((r) => r.crash === undefined)
  const rows = []

  // ⑴ 자가 실패를 잡는가 — 배경만 나온 컷과 정지 프레임
  const negBroken = ok.filter((r) => !r.neg.still.comparable)
  const negBad = ok.filter((r) => r.neg.drawn
    || (r.neg.still.comparable && r.neg.still.ratio > MOVED))
  rows.push(mark('01', '검사가 실패를 잡는다 (배경만 · 정지 프레임)',
    ok.length === 0 ? 'BLOCKED'
      : negBroken.length > 0 || negBad.length > 0 ? 'FAIL' : 'PASS',
    negBroken.length > 0
      ? `대조군 두 컷을 못 견줬다: ${negBroken.map((r) => `${String(r.n)}판 ${String(r.neg.still.why)}`).join(' · ')}`
      : ok.map((r) => `${String(r.n)}판 배경만 색 ${String(r.neg.colors)}`
        + `·흩어짐 ${String(r.neg.stdev)}·정지차 ${String(r.neg.still.ratio)}`).join(' · ')))

  // ⑵ 찍어야 할 컷을 다 찍었는가
  const short = ok.filter((r) => NEED.some((one) => !r.shots.includes(one)))
  rows.push(mark('02', '필요한 컷을 다 찍었다',
    ok.length === wanted && short.length === 0 ? 'PASS' : 'FAIL',
    `${String(ok.length)}/${String(wanted)}판이 끝까지 갔다`
    + (short.length > 0
      ? ` · 빠진 컷 ${short.map((r) => NEED.filter((one) => !r.shots.includes(one)).join(',')).join(' / ')}`
      : '')
    + (ok.length < wanted
      ? ` · ${runs.filter((r) => r.crash !== undefined).map((r) => `${String(r.n)}판 ${String(r.crash)}`).join(' / ')}`
      : '')))

  // ⑶ **기준 컷부터 마지막 컷까지** 화면이 안 흔들렸는가.
  //    한 컷의 앞뒤만 보면 「첫 컷과 나중 컷 사이에 크기가 바뀐」 판을 놓친다
  const shook = ok.filter((r) => !r.span.ok)
  rows.push(mark('03', '재는 동안 화면을 안 흔들었다 (첫 컷부터 마지막 컷까지)',
    ok.length === 0 ? 'BLOCKED' : shook.length === 0 ? 'PASS' : 'FAIL',
    shook.length > 0
      ? shook.map((r) => `${String(r.n)}판 ${String(r.span.why)}`).join(' · ')
      : ok.map((r) => `${String(r.n)}판 ${String(r.span.what ?? '그대로')}`).join(' · ')))

  // ⑷ 첫 화면 — 창도 부모 CSS도 안 흔들고 세계가 나왔는가
  const blank = ok.filter((r) => !r.field.drawn)
  rows.push(mark('04', '창을 안 흔들고 첫 세계가 나온다',
    ok.length === 0 ? 'BLOCKED'
      : ok.length === wanted && blank.length === 0 ? 'PASS' : 'FAIL',
    ok.map((r) => `${String(r.n)}판 색 ${String(r.field.colors)}·흩어짐 ${String(r.field.stdev)}`).join(' · ')))

  // ⑸ 정상 입력에 화면이 따라오는가.
  //    못 걸었거나 못 견줬으면 **판정이 아니라 BLOCKED**다
  //    ⚠️ **앞뒤 둘 다 세계여야 한다.** 걷고 나서 단색이 되어도 tile이 바뀌고
  //    이미지 차이가 문턱을 넘으면 예전 판정은 그것을 PASS로 줬다 — 모은
  //    `moved.drawn`을 안 쓰고 있었다
  const noStep = ok.filter((r) => !r.moved.walked)
  const noCompare = ok.filter((r) => !r.moved.change.comparable)
  const stuck = ok.filter((r) => r.moved.change.comparable && r.moved.change.ratio < MOVED)
  const gone = ok.filter((r) => !r.field.drawn || !r.moved.drawn)
  rows.push(mark('05', '정상 입력 앞뒤로 세계가 달라진다 (앞뒤 둘 다 세계다)',
    gone.length > 0 ? 'FAIL'
      : ok.length === 0 || noStep.length > 0 || noCompare.length > 0 ? 'BLOCKED'
        : ok.length === wanted && stuck.length === 0 ? 'PASS' : 'FAIL',
    gone.length > 0
      ? `세계가 없는 컷이 있다: ${gone.map((r) => `${String(r.n)}판 `
        + `${r.field.drawn ? `걸은 뒤가 색 ${String(r.moved.colors)}` : `첫 컷이 색 ${String(r.field.colors)}`}`).join(' · ')}`
      : noCompare.length > 0
        ? `앞뒤 컷을 못 견줬다: ${noCompare.map((r) => `${String(r.n)}판 ${String(r.moved.change.why)}`).join(' · ')}`
        : ok.map((r) => `${String(r.n)}판 차이 ${String(r.moved.change.ratio)} · ${String(r.moved.tile)}`
          + `${r.moved.key === null ? ' (네 방향 다 못 갔다)' : ` (${String(r.moved.key)})`}`).join(' · ')))

  return rows
}
