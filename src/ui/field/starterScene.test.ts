// 파트너 고르는 장면의 카메라 (`choose_starter/choose_starter_app.c`)
//
// ⚠️ **화각을 눈으로 맞추면 안 된다.** `Camera_InitWithTarget`이 받는 22°가
// 전각인지 반각인지에 따라 화면이 두 배 넓어지거나 좁아지는데, 화면을 못 보는
// 자리에서는 어느 쪽이든 "그럴듯해" 보인다.
//
// 다행히 원작이 답을 적어 두었다. `otherSelectionMatrix`는 커서 스프라이트를
// 놓는 **화면 좌표**고, 볼 셋의 3D 자리는 `selectionMatrix`에 있다. 카메라를
// 제대로 풀면 앞의 것에서 뒤의 것이 나와야 한다 — 자유 변수가 없는 잣대다.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  BALL_POSITION, CAMERA_CHOOSE, CAMERA_OPEN, CURSOR_SCREEN, FOV_HALF, GROUND_PLACE,
  OPEN_FRAMES, SCREEN, STARTER_MODEL, cameraPosition, projectToScreen,
} from './starterScene'
import { withData } from '../../data/romData.testkit'

describe('파트너 고르는 장면 — 카메라', () => {
  it('볼 셋의 가로 자리가 원작 커서 좌표와 맞는다', () => {
    // 커서는 볼 **위에** 뜨므로 세로는 어긋난다. 가로는 스프라이트 폭만큼만
    // 어긋나고, 원작이 손으로 놓은 값이라 셋이 딱 같지는 않다 (77.2·128.0·171.1
    // 대 78·130·172). 자유 변수 없이 세 자리가 2픽셀 안에 들어오는 것이 근거다
    const got = BALL_POSITION.map((p) => projectToScreen(p, CAMERA_CHOOSE)[0])
    CURSOR_SCREEN.forEach(([x], i) => {
      expect(Math.abs(got[i]! - x), `볼 ${String(i)} → ${got[i]!.toFixed(1)} 대 ${String(x)}`)
        .toBeLessThan(2.5)
    })
    // 그리고 벌어진 간격이 그대로 나온다 — 배율이 틀리면 여기서 깨진다
    expect(got[2]! - got[0]!).toBeCloseTo(CURSOR_SCREEN[2]![0] - CURSOR_SCREEN[0]![0], 0)
  })

  it('커서가 볼 위에 뜬다 — 세로 차이가 셋 다 비슷하다', () => {
    // 스프라이트 위끝을 적은 값이라 볼 중심보다 늘 위다. 그 차이가 셋 다
    // 40픽셀 언저리로 같아야 카메라가 맞는 것이다 (한 개만 맞으면 우연이다)
    const gap = BALL_POSITION.map((p, i) =>
      projectToScreen(p, CAMERA_CHOOSE)[1] - CURSOR_SCREEN[i]![1])
    for (const g of gap) expect(g).toBeGreaterThan(35)
    for (const g of gap) expect(g).toBeLessThan(45)
    expect(Math.max(...gap) - Math.min(...gap)).toBeLessThan(4)
  })

  it('22°를 전각으로 읽으면 자리가 화면 밖으로 벌어진다 — 그게 갈림길이다', () => {
    // 반각이 맞다는 위 시험은, 전각이 **틀린다는** 것을 같이 보여야 뜻이 있다.
    // 전각으로 읽으면 배율이 두 배가 되어 왼쪽 볼이 22픽셀까지 밀려난다
    const wrong = BALL_POSITION.map((p) => projectToScreen(p, CAMERA_CHOOSE, FOV_HALF / 2)[0])
    expect(wrong[0]!).toBeCloseTo(22.3, 0)
    expect(wrong[2]!).toBeCloseTo(217.6, 0)
    for (const i of [0, 2]) {
      expect(Math.abs(wrong[i]! - CURSOR_SCREEN[i]![0])).toBeGreaterThan(45)
    }
    // 화면 폭이 256이니 전각이면 볼 셋이 화면을 거의 다 채운다 — 원작 화면과 다르다
    expect(wrong[2]! - wrong[0]!).toBeGreaterThan(SCREEN.width * 0.75)
  })

  it('카메라가 물체 위·앞에 선다', () => {
    const [ox, oy, oz] = cameraPosition(CAMERA_OPEN)
    expect(ox).toBe(0)
    expect(oy).toBeCloseTo(150, 3)
    expect(oz).toBeCloseTo(259.808, 3)
    const [, cy, cz] = cameraPosition(CAMERA_CHOOSE)
    // 목표가 z=36으로 옮겨 간 만큼 같이 앞으로 온다
    expect(cy).toBeCloseTo(153.209, 3)
    expect(cz).toBeCloseTo(36 + 128.558, 3)
    // 고를 때가 더 가깝고 더 내려다본다
    expect(cy / cz).toBeGreaterThan(oy / oz)
  })
})

const DATA = resolve(__dirname, '../../../public/data')
const maybe = withData('starter/index.json', 'chunks/index.json')

/** `chunks/index.json`의 `unitsPerTile`. 굽는 쪽이 이만큼으로 나눠 놓는다 */
const TILE_TO_DS = 16

/**
 * 구운 모델의 x·z 범위 (타일).
 *
 * `PT3C` 머리 뒤에 정점이 그대로 있다 — 앞 6바이트가 i16 좌표 셋이고,
 * `posScale`로 나누면 타일이다 (`scene/chunkMesh.ts`의 `build`와 같은 셈)
 */
function extentOf(id: number): { x: [number, number], z: [number, number] } {
  const fmt = JSON.parse(readFileSync(resolve(DATA, 'chunks/index.json'), 'utf8')) as {
    posScale: number, vertexBytes: number, unitsPerTile: number
  }
  expect(fmt.unitsPerTile, 'unitsPerTile이 바뀌면 이 시험의 16도 바뀐다').toBe(TILE_TO_DS)
  const buf = readFileSync(resolve(DATA, `starter/${String(id)}.bin`))
  const metaLen = buf.readUInt32LE(4)
  const meta = JSON.parse(buf.subarray(8, 8 + metaLen).toString('utf8')) as { verts: number }
  const head = 8 + metaLen + ((4 - (metaLen % 4)) % 4)
  const x: [number, number] = [Infinity, -Infinity]
  const z: [number, number] = [Infinity, -Infinity]
  for (let i = 0; i < meta.verts; i++) {
    const o = head + i * fmt.vertexBytes
    const vx = buf.readInt16LE(o) / fmt.posScale
    const vz = buf.readInt16LE(o + 4) / fmt.posScale
    x[0] = Math.min(x[0], vx); x[1] = Math.max(x[1], vx)
    z[0] = Math.min(z[0], vz); z[1] = Math.max(z[1], vz)
  }
  return { x, z }
}

maybe('파트너 고르는 장면 — 구운 모델', () => {
  const index = JSON.parse(readFileSync(resolve(DATA, 'starter/index.json'), 'utf8')) as {
    models: number[]
    sheets: Record<string, unknown>
    clips: Record<string, number>
  }

  it('원작이 부르는 칸을 그대로 굽는다', () => {
    // `Make3DGraphics`가 1·8·3·5·7·9를 부른다. 번호를 바꾸면 가방 대신 볼이
    // 뜨는 식이라 화면이 통째로 달라진다
    expect(index.models).toEqual([
      STARTER_MODEL.caseClosed, STARTER_MODEL.caseOpen,
      ...STARTER_MODEL.balls, STARTER_MODEL.ground,
    ])
    for (const id of index.models) {
      expect(existsSync(resolve(DATA, `starter/${String(id)}.bin`)), `모델 ${String(id)}`).toBe(true)
      expect(index.sheets[String(id)], `그림 ${String(id)}`).toBeTruthy()
    }
  })

  it('가방이 열리는 길이를 JNT0에서 읽어 온다 — 짐작한 값이 아니다', () => {
    expect(index.clips[String(STARTER_MODEL.caseClosed)]).toBe(OPEN_FRAMES)
    // 볼 셋은 흔들리는 고리라 셋 다 같은 길이다 (`psel_mb_a/b/c`)
    const ball = STARTER_MODEL.balls.map((id) => index.clips[String(id)])
    expect(ball).toEqual([73, 73, 73])
  })

  it('바닥판만 자리·크기·각도를 따로 받는다', () => {
    expect(GROUND_PLACE.position).toEqual([0, -28, 40])
    expect(GROUND_PLACE.scale).toEqual([3.5, 1, 3.5])
    expect(GROUND_PLACE.rotationY).toBeCloseTo(Math.PI, 10)
  })

  // ⚠️ **구운 모델과 배치 상수의 단위가 다르다.** 굽는 길이 소품·청크와 같아서
  // 마지막에 `pos / unitsPerTile`로 **타일**이 되는데, 위 자리들은 원작 소스에서
  // 그대로 옮긴 **DS 유닛**이다. 그래서 무대가 16분의 1로 서서 화면에서 사라졌다.
  //
  // 카메라 시험들은 상수끼리만 견주므로 이 어긋남을 못 본다 — 구운 파일을 열어
  // 재야 잡힌다.
  it('볼 셋이 열린 가방 안에 들어간다 — 16을 곱해야 맞는다', () => {
    const open = extentOf(STARTER_MODEL.caseOpen)
    const scaled = {
      x: open.x.map((v) => v * TILE_TO_DS) as [number, number],
      z: open.z.map((v) => v * TILE_TO_DS) as [number, number],
    }
    for (const [x, , z] of BALL_POSITION) {
      expect(x, `볼 x ${String(x)} ⊄ ${scaled.x.join('~')}`).toBeGreaterThan(scaled.x[0])
      expect(x).toBeLessThan(scaled.x[1])
      expect(z, `볼 z ${String(z)} ⊄ ${scaled.z.join('~')}`).toBeGreaterThan(scaled.z[0])
      expect(z).toBeLessThan(scaled.z[1])
    }
    // 그리고 **안 곱하면 깨진다** — 이게 없으면 위 조건은 "지금 값으로는 맞다"뿐이다.
    // 가방이 x ±4.8타일이라 −44에 있는 볼이 가방 밖 아홉 배 거리에 선다
    expect(BALL_POSITION[0]![0]).toBeLessThan(open.x[0])
    expect(BALL_POSITION[2]![0]).toBeGreaterThan(open.x[1])
  })

  it('가방과 볼이 사람이 볼 만한 크기다 — 화면에서 몇 픽셀인가', () => {
    // "안 보인다"를 숫자로 잡는다. 고르는 카메라에서 가방 폭이 화면의 절반쯤이고
    // 볼 하나가 열 몇 픽셀이어야 한다. 16을 빼먹으면 볼이 1픽셀이 된다
    const open = extentOf(STARTER_MODEL.caseOpen)
    const wide = (half: number): number =>
      projectToScreen([half * TILE_TO_DS, 0, 0], CAMERA_CHOOSE)[0]
      - projectToScreen([-half * TILE_TO_DS, 0, 0], CAMERA_CHOOSE)[0]
    expect(wide(open.x[1])).toBeGreaterThan(SCREEN.width * 0.4)
    // 볼은 20.5픽셀. 16으로 나누면 1.28픽셀이라 **점 하나도 안 된다**
    const ball = extentOf(STARTER_MODEL.balls[0]!)
    expect(wide(ball.x[1])).toBeCloseTo(20.5, 0)
    expect(wide(ball.x[1]) / TILE_TO_DS).toBeCloseTo(1.28, 1)
  })
})
