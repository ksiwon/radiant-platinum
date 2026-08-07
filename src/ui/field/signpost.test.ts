// 간판 판에 붙는 그림 (`signpost.ts`)
//
// 조용히 틀릴 자리가 둘이다:
//
//   ① **아틀라스 배율.** 배경 크기와 배경 위치가 같은 배율로 안 늘어나면
//      옆 칸이 반쯤 걸쳐 나온다. 화면으로는 "그림이 좀 이상하다"로만 보인다.
//   ② **갈래를 뒤집는다.** 종류 0이 마을 약도이고 1이 도로 화살표인데
//      뒤집으면 마을 이름표에 도로 화살표가 붙는다. 둘 다 그림이 뜨므로
//      원작을 옆에 놓고 보지 않는 한 안 보인다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { signpostsSchema } from '../../data/schema'
import { signpostImage } from './signpost'
import { withData } from '../../data/romData.testkit'

const DATA = resolve(__dirname, '../../../public/data')
const maybe = withData('signposts.json')

/** `generated/signpost_types.txt` */
const MAP = 0
const ARROW = 1

/** PNG 머리에서 크기를 읽는다. IHDR이 곧바로 이어진다 */
function pngSize(file: string): { width: number, height: number } {
  const buf = readFileSync(file)
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) }
}

const px = (v: string | number | undefined): number => Number(String(v).replace('px', ''))

maybe('간판 그림', () => {
  const atlas = signpostsSchema.parse(
    JSON.parse(readFileSync(resolve(DATA, 'signposts.json'), 'utf8')),
  )

  it('그림 파일이 표가 말하는 크기와 맞는다', () => {
    // 도로 31 + 마을 19 = 50장을 10칸씩 5줄로 놓았다
    expect(atlas.routeCount + atlas.cityCount).toBe(50)
    const rows = Math.ceil(50 / atlas.cols)
    const png = pngSize(resolve(DATA, 'signposts.png'))
    expect(png).toEqual({
      width: atlas.cols * atlas.width,
      height: rows * atlas.height,
    })
    // 한 칸이 6×4타일 = 48×32다
    expect({ w: atlas.width, h: atlas.height }).toEqual({ w: 48, h: 32 })
  })

  it('종류가 갈래를 정한다 — 지도는 마을, 화살표는 도로다', () => {
    // 신오 도로는 201~230번 30개다. 앞에 빈 판 하나가 있어 31장이다
    expect(atlas.routeCount).toBe(31)
    // 마을 18곳 + 빈 판
    expect(atlas.cityCount).toBe(19)
    // 화살표 갈래가 앞이라 0번 칸에서 시작한다
    expect(atlas.routeFirst).toBe(0)
    expect(atlas.cityFirst).toBe(atlas.routeCount)

    const arrow = signpostImage(atlas, ARROW, 1)
    const town = signpostImage(atlas, MAP, 1)
    expect(arrow.backgroundPosition).not.toBe(town.backgroundPosition)
  })

  it('배경 크기와 자리가 같은 배율로 늘어난다', () => {
    const one = signpostImage(atlas, ARROW, 1)
    const scale = px(one.width) / atlas.width
    expect(scale).toBeGreaterThan(1)
    // 배경 그림 전체가 같은 배율이어야 칸이 딱 떨어진다
    expect(one.backgroundSize).toBe(`${atlas.cols * atlas.width * scale}px auto`)
    expect(one.backgroundPosition).toBe(`-${atlas.width * scale}px -0px`)
    // 줄이 바뀌는 칸도 본다
    const wrapped = signpostImage(atlas, ARROW, atlas.cols)
    expect(wrapped.backgroundPosition).toBe(`-0px -${atlas.height * scale}px`)
  })

  it('표를 벗어난 번호는 빈 판으로 떨어진다', () => {
    // ⚠️ 배치표의 `data[0]`은 객체마다 뜻이 달라서 엉뚱한 수가 들어올 수 있다.
    // 두 갈래 모두 0번이 원작이 비워 둔 판이라 거기로 보내면 조용히 넘어간다
    const blank = signpostImage(atlas, MAP, 0)
    expect(signpostImage(atlas, MAP, 999).backgroundPosition).toBe(blank.backgroundPosition)
    expect(signpostImage(atlas, MAP, -1).backgroundPosition).toBe(blank.backgroundPosition)
  })
})
