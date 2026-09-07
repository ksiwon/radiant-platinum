// 화면 판정의 **자**가 실패를 실제로 잡는가. 브라우저 없이 그림을 지어 재 본다.
//
// ⚠️ **이 검사가 없으면 「다 통과」가 곧 「아무것도 안 잡는다」일 수 있다.**
// 실측(7판)으로 화면 검사가 통과한 판에서 3D는 한 픽셀도 안 나왔다 — 문턱을
// 넘긴 색은 전부 계기판이 낸 것이었다. 자는 반드시 **거짓 통과를 거절하는
// 표본**과 함께 둔다.
//
// ⚠️ **자 하나만 재는 것으로는 모자란다.** 비교기가 크기 불일치에 `1`을 내던
// 시절, 그 값을 부르는 쪽은 전부 **정상 변화**로 읽었다 — 자만 보는 검사는
// 그 구멍을 못 봤다. 그래서 여기서는 **판정하는 함수까지** 지어낸 판으로 쏜다
// (`firstFrameRules.mjs`).
import { deflateSync } from 'node:zlib'
import { describe, expect, it } from 'vitest'
import {
  SHAPE_GAP, compareShots, diffRatio, looksDrawn, missingShots, roiGap, roiMean,
} from './canvasShot.mjs'
import { MOVED, judgeFirstFrame } from './firstFrameRules.mjs'
import { statsOf } from '../shot/png.mjs'

const CRC = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return (buf) => {
    let c = -1
    for (const b of buf) c = t[(c ^ b) & 0xff] ^ (c >>> 8)
    return (c ^ -1) >>> 0
  }
})()

const chunk = (type, data) => {
  const head = Buffer.alloc(8)
  head.writeUInt32BE(data.length, 0)
  head.write(type, 4, 'latin1')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(CRC(Buffer.concat([head.subarray(4), data])), 0)
  return Buffer.concat([head, data, crc])
}

/** RGB 8비트 PNG 하나를 짓는다. `pick(x, y)`가 `[r, g, b]`를 낸다 */
function png(w, h, pick) {
  const raw = Buffer.alloc(h * (1 + w * 3))
  let p = 0
  for (let y = 0; y < h; y++) {
    raw[p++] = 0
    for (let x = 0; x < w; x++) {
      const [r, g, b] = pick(x, y)
      raw[p++] = r; raw[p++] = g; raw[p++] = b
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}

const W = 240, H = 160
/** 아무것도 안 그린 캔버스 — 페이지 배경 한 색이 비친다 */
const flat = png(W, H, () => [126, 178, 216])
/** 세계가 나온 캔버스 — 색이 많고 밝기가 흩어진다 */
const world = png(W, H, (x, y) => [
  (x * 7 + y * 3) & 0xff, (x * 3 + y * 11) & 0xff, (x * 13 + y * 5) & 0xff])
/** 한 걸음 걸은 뒤 — 같은 세계가 옆으로 밀린다 */
const walked = png(W, H, (x, y) => [
  ((x + 9) * 7 + y * 3) & 0xff, ((x + 9) * 3 + y * 11) & 0xff, ((x + 9) * 13 + y * 5) & 0xff])

/** 하늘색으로 지우기만 한 판 (도형 없음) — 사다리의 음성 대조군과 같은 모양 */
const clearOnly = png(W, H, () => [126, 178, 216])
/** 같은 지움색 위에 **네모 하나**. 가운데 ROI 안에 든다 */
const withShape = png(W, H, (x, y) =>
  (x > 90 && x < 150 && y > 55 && y < 105 ? [224, 96, 48] : [126, 178, 216]))
/** 그 네모를 오른쪽으로 40px 옮긴 판 */
const shapeMoved = png(W, H, (x, y) =>
  (x > 130 && x < 190 && y > 55 && y < 105 ? [224, 96, 48] : [126, 178, 216]))

const IN = { x: 100, y: 65, w: 40, h: 30 }
const OUT = { x: 4, y: 4, w: 40, h: 30 }

describe('찍은 캔버스를 재는 자', () => {
  it('배경만 나온 컷을 「그려졌다」로 안 읽는다', () => {
    const s = statsOf(flat)
    expect(s.colors).toBe(1)
    expect(looksDrawn(s)).toBe(false)
  })

  it('세계가 나온 컷은 통과시킨다', () => {
    expect(looksDrawn(statsOf(world))).toBe(true)
  })

  it('한 프레임에 멎은 화면을 「갱신됐다」로 안 읽는다', () => {
    expect(diffRatio(world, world)).toBe(0)
    expect(diffRatio(world, world)).toBeLessThan(MOVED)
  })

  it('정상 입력 앞뒤로 달라진 화면은 잡아낸다', () => {
    expect(diffRatio(world, walked)).toBeGreaterThan(MOVED)
  })

  it('찍어야 할 컷이 빠지면 이름을 낸다', () => {
    expect(missingShots(['title', 'field', 'moved'], ['title', 'moved'])).toEqual(['field'])
    expect(missingShots(['title', 'field'], ['title', 'field'])).toEqual([])
  })
})

describe('크기가 다른 두 컷', () => {
  const other = png(W + 1, H, () => [0, 0, 0])

  it('**「100% 달라졌다」가 아니라 「못 견준다」다**', () => {
    const got = compareShots(world, other)
    expect(got.comparable).toBe(false)
    expect(got.ratio).toBeNull()
    expect(got.why).toMatch(/크기가 다르다/)
  })

  it('숫자만 내는 길에서는 던진다 — 조용한 값으로 안 내려간다', () => {
    expect(() => diffRatio(world, other)).toThrow(/못 견준다/)
  })
})

describe('도형이 거기 있는가 (사다리의 자)', () => {
  it('지움색만 있는 판은 안팎이 같다', () => {
    expect(roiGap(roiMean(clearOnly, IN), roiMean(clearOnly, OUT))).toBe(0)
    expect(roiGap(roiMean(clearOnly, IN), roiMean(clearOnly, OUT))).toBeLessThan(SHAPE_GAP)
  })

  it('도형이 있으면 안팎이 갈린다', () => {
    expect(roiGap(roiMean(withShape, IN), roiMean(withShape, OUT)))
      .toBeGreaterThan(SHAPE_GAP)
  })

  it('도형을 옮기면 같은 ROI가 달라진다', () => {
    expect(roiGap(roiMean(withShape, IN), roiMean(shapeMoved, IN)))
      .toBeGreaterThan(SHAPE_GAP)
  })

  it('같은 프레임을 두 번 재면 안 달라진다', () => {
    expect(roiGap(roiMean(withShape, IN), roiMean(withShape, IN))).toBe(0)
  })
})

/** 판정에 넣을 한 판 하나. 기본은 **다 정상인 판**이고, 필요한 것만 덮어쓴다 */
const runOf = (over = {}) => ({
  n: 1,
  shots: ['field', 'bg', 'bg-again', 'moved'],
  field: { drawn: true, colors: 3200, stdev: 44.1 },
  neg: { drawn: false, colors: 1, stdev: 0, still: { comparable: true, ratio: 0, why: null } },
  moved: {
    drawn: true, colors: 3100, walked: true, key: 'ArrowDown', tile: '4,6 → 4,7',
    change: { comparable: true, ratio: 0.42, why: null },
  },
  span: { ok: true, why: null, what: '960x640' },
  ...over,
})
const statusOf = (rows, id) => rows.find((r) => r.id === id).status

describe('첫 화면 관문의 판정', () => {
  it('다 정상인 판은 다섯 줄 다 통과한다', () => {
    const rows = judgeFirstFrame([runOf()], 1)
    expect(rows.map((r) => r.status)).toEqual(['PASS', 'PASS', 'PASS', 'PASS', 'PASS'])
  })

  it('**크기가 어긋난 앞뒤 컷으로는 ⑤가 통과 못 한다**', () => {
    const rows = judgeFirstFrame([runOf({
      moved: {
        ...runOf().moved,
        change: { comparable: false, ratio: null, why: '크기가 다르다 — 960x640 대 959x640' },
      },
    })], 1)
    expect(statusOf(rows, '05')).toBe('BLOCKED')
    expect(rows.some((r) => r.status === 'PASS' && r.id === '05')).toBe(false)
  })

  it('대조군 두 컷을 못 견주면 ①이 떨어진다', () => {
    const rows = judgeFirstFrame([runOf({
      neg: {
        ...runOf().neg,
        still: { comparable: false, ratio: null, why: '크기가 다르다' },
      },
    })], 1)
    expect(statusOf(rows, '01')).toBe('FAIL')
  })

  it('배경만 나온 컷이 「그려졌다」로 읽히면 ①이 떨어진다', () => {
    const rows = judgeFirstFrame([runOf({
      neg: { ...runOf().neg, drawn: true, colors: 900 },
    })], 1)
    expect(statusOf(rows, '01')).toBe('FAIL')
  })

  it('첫 컷과 마지막 컷 사이에 크기가 바뀌면 ③이 떨어진다', () => {
    const rows = judgeFirstFrame([runOf({
      span: { ok: false, why: '걸은 뒤 컷 앞에서 buffer가 960x640 → 959x640로 바뀌었다' },
    })], 1)
    expect(statusOf(rows, '03')).toBe('FAIL')
  })

  it('한 칸도 못 걸으면 ⑤는 판정이 아니라 BLOCKED다', () => {
    const rows = judgeFirstFrame([runOf({
      moved: { ...runOf().moved, walked: false, key: null },
    })], 1)
    expect(statusOf(rows, '05')).toBe('BLOCKED')
  })

  it('**세계가 나왔다가 걸은 뒤 단색이 되면 ⑤가 떨어진다**', () => {
    const rows = judgeFirstFrame([runOf({
      moved: { ...runOf().moved, drawn: false, colors: 1 },
    })], 1)
    expect(statusOf(rows, '05')).toBe('FAIL')
  })

  it('**첫 컷이 단색이면 차이가 아무리 커도 ⑤가 못 통과한다**', () => {
    const rows = judgeFirstFrame([runOf({
      field: { drawn: false, colors: 1, stdev: 0 },
      moved: { ...runOf().moved, change: { comparable: true, ratio: 0.97, why: null } },
    })], 1)
    expect(statusOf(rows, '05')).toBe('FAIL')
  })

  it('앞뒤 다 세계면서 달라졌으면 ⑤가 통과한다', () => {
    const rows = judgeFirstFrame([runOf()], 1)
    expect(statusOf(rows, '05')).toBe('PASS')
  })

  it('첫 화면이 한 색이면 ④가 떨어진다', () => {
    const rows = judgeFirstFrame([runOf({ field: { drawn: false, colors: 1, stdev: 0 } })], 1)
    expect(statusOf(rows, '04')).toBe('FAIL')
  })

  it('도중에 터진 판이 있으면 ②가 떨어진다', () => {
    const rows = judgeFirstFrame([runOf(), { n: 2, shots: [], crash: '시간 초과', span: {} }], 2)
    expect(statusOf(rows, '02')).toBe('FAIL')
  })

  it('컷을 하나 덜 찍으면 ②가 떨어진다', () => {
    const rows = judgeFirstFrame([runOf({ shots: ['field', 'bg', 'moved'] })], 1)
    expect(statusOf(rows, '02')).toBe('FAIL')
  })
})
