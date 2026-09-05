// 그리는 쪽을 **롬의 자료로** 잰다.
//
// ⚠️ **「그려진다」로는 모자란다.** 입자는 값이 조용히 틀려도 그럴듯한 얼룩이
// 나온다 — 그래서 여기서 재는 것은 원작 규칙 그 자체다: 그리는 차례,
// 텍스처마다 나뉘는가, 빌보드 축이 카메라와 무관한가, 알파 0을 거르는가.
import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { Matrix4 } from 'three'
import { bytesSource, narcEntry, openNds } from '../../import/platinum/nds'
import { romPath, withRom } from '../../data/romData.testkit'
import { readSpa, type SplFile } from '../../engine/battle/spl/resource'
import { SplShow, type SplCue } from './splDraw'
import { splBasis, type Vec3 } from './splPlace'

const WAZA = '/wazaeffect/effectdata/waza_particle.narc'
/** `battle_particles.order`의 64번째 줄이 `tackle.spa`다 */
const TACKLE = 63

const BY: Vec3 = [0, 0.6, 2.2]
const FOE: Vec3 = [0, 0.7, -2.2]
const METRE = 0.4

async function waza(member: number): Promise<SplFile> {
  const fs = await openNds(bytesSource(new Uint8Array(readFileSync(romPath('en')!))))
  const narc = (await fs!.read(WAZA))!
  return readSpa(narcEntry(narc, member)!)
}

const show = (cues: readonly SplCue[]): SplShow =>
  new SplShow(cues, BY, FOE, splBasis(BY, FOE), METRE, 7)

/** 카메라를 어디에 두어도 되게 — 무대 밖 비스듬한 자리 하나 */
function camera(): { view: Matrix4, world: Matrix4 } {
  const world = new Matrix4().makeRotationY(0.7).setPosition(-2.7, 5, 4)
  return { view: world.clone().invert(), world }
}

withRom('en')('SplShow — 롬 실측', () => {
  it('묶음이 이미터마다·텍스처마다 나뉜다', async () => {
    const file = await waza(TACKLE)
    const s = show([
      { file, res: 0, at: 'defender', frame: 0 },
      { file, res: 1, at: 'attacker', frame: 0 },
    ])
    // 몸통박치기 0번은 자식을 뿌린다 — 부모 묶음과 자식 묶음이 따로 선다
    expect(file.resources[0]!.header.flags.hasChildResource).toBe(true)
    expect(s.groups.length).toBeGreaterThanOrEqual(3)
    // 같은 텍스처를 두 이미터가 써도 묶음은 따로다 (그리는 차례가 다르다)
    expect(new Set(s.groups.map((g) => g.key)).size).toBe(s.groups.length)
  })

  it('늦게 선 이미터가 먼저 그려진다 (`SPL_DRAW_ORDER_REVERSE`)', async () => {
    const file = await waza(TACKLE)
    const s = show([
      { file, res: 0, at: 'defender', frame: 0 },
      { file, res: 1, at: 'defender', frame: 0 },
    ])
    const first = s.groups.filter((g) => g.key.startsWith('0'))
    const second = s.groups.filter((g) => g.key.startsWith('1'))
    expect(first.length).toBeGreaterThan(0)
    expect(second.length).toBeGreaterThan(0)
    // 나중 것(`1`)의 차례 번호가 더 작다 = 먼저 그려진다
    expect(Math.max(...second.map((g) => g.renderOrder)))
      .toBeLessThan(Math.min(...first.map((g) => g.renderOrder)))
  })

  it('부모를 숨기라면 부모 묶음이 아예 없다', async () => {
    const file = await waza(TACKLE)
    const res = file.resources[0]!
    const hidden: SplFile = {
      textures: file.textures,
      resources: [{
        ...res,
        header: { ...res.header, flags: { ...res.header.flags, hideParent: true } },
      }],
    }
    const s = show([{ file: hidden, res: 0, at: 'defender', frame: 0 }])
    expect(s.groups.every((g) => g.key.endsWith('c'))).toBe(true)
  })

  it('세운 프레임이 되어야 뿜는다', async () => {
    const file = await waza(TACKLE)
    const s = show([{ file, res: 0, at: 'defender', frame: 10 }])
    const cam = camera()
    for (let f = 0; f < 10; f++) {
      s.step()
      s.write(cam.view, cam.world)
      expect(s.groups.reduce((n, g) => n + g.count, 0), `프레임 ${String(f)}`).toBe(0)
    }
    let seen = 0
    for (let f = 0; f < 20; f++) {
      s.step()
      s.write(cam.view, cam.world)
      seen += s.groups.reduce((n, g) => n + g.count, 0)
    }
    expect(seen).toBeGreaterThan(0)
  })

  it('값이 유한하고 알파가 0~1이다', async () => {
    const file = await waza(TACKLE)
    const s = show([
      { file, res: 0, at: 'defender', frame: 0 },
      { file, res: 1, at: 'attacker', frame: 2 },
    ])
    const cam = camera()
    let drawn = 0
    for (let f = 0; f < 40; f++) {
      s.step()
      s.write(cam.view, cam.world)
      for (const g of s.groups) {
        for (let i = 0; i < g.count; i++) {
          drawn++
          for (const k of [0, 1, 2]) {
            expect(Number.isFinite(g.center[i * 3 + k])).toBe(true)
            expect(Number.isFinite(g.axisX[i * 3 + k])).toBe(true)
            expect(Number.isFinite(g.axisY[i * 3 + k])).toBe(true)
            expect(g.color[i * 3 + k]).toBeGreaterThanOrEqual(0)
            expect(g.color[i * 3 + k]).toBeLessThanOrEqual(1)
          }
          // ⚠️ **알파 0은 아예 안 넣는다** — `SPLDraw_Setup`이 그 자리에서 돌아선다
          expect(g.alpha[i]).toBeGreaterThan(0)
          expect(g.alpha[i]).toBeLessThanOrEqual(1)
        }
      }
    }
    expect(drawn).toBeGreaterThan(0)
  })

  it('입자가 붙인 자리 둘레에 선다', async () => {
    const file = await waza(TACKLE)
    const s = show([{ file, res: 0, at: 'defender', frame: 0 }])
    const cam = camera()
    let far = 0
    let count = 0
    for (let f = 0; f < 25; f++) {
      s.step()
      s.write(cam.view, cam.world)
      for (const g of s.groups) {
        for (let i = 0; i < g.count; i++) {
          count++
          far = Math.max(far, Math.hypot(
            g.center[i * 3]! - FOE[0],
            g.center[i * 3 + 1]! - FOE[1],
            g.center[i * 3 + 2]! - FOE[2],
          ))
        }
      }
    }
    expect(count).toBeGreaterThan(0)
    // 몸이 세 단위이므로 0.4m/단위면 몸이 1.2m다 — 몸 두 벌 안에 든다
    expect(far).toBeLessThan(2.4)
  })

  it('빌보드 축은 카메라를 안 본다 — 원작도 뷰 공간에서 바로 낸다', async () => {
    const file = await waza(TACKLE)
    const cam1 = camera()
    const world2 = new Matrix4().makeRotationY(-2.1).setPosition(6, 1, -3)
    const cam2 = { view: world2.clone().invert(), world: world2 }

    const runOne = (cam: { view: Matrix4, world: Matrix4 }): number[] => {
      const s = show([{ file, res: 0, at: 'defender', frame: 0 }])
      const out: number[] = []
      for (let f = 0; f < 6; f++) {
        s.step()
        s.write(cam.view, cam.world)
        for (const g of s.groups) {
          for (let i = 0; i < g.count; i++) {
            out.push(g.axisX[i * 3]!, g.axisX[i * 3 + 1]!, g.axisY[i * 3]!, g.axisY[i * 3 + 1]!)
          }
        }
      }
      return out
    }
    expect(file.resources[0]!.header.flags.drawType).toBe(0)
    const a = runOne(cam1)
    expect(a.length).toBeGreaterThan(0)
    expect(runOne(cam2)).toEqual(a)
  })

  it('가로세로비가 사각형의 가로에만 걸린다', async () => {
    const file = await waza(TACKLE)
    const res = file.resources[0]!
    const wide: SplFile = {
      textures: file.textures,
      // 가로세로비 2배 · 크기 곡선 없음 · 회전 없음으로 두고 축을 잰다
      resources: [{
        ...res,
        scaleAnim: null,
        alphaAnim: null,
        header: {
          ...res.header,
          aspectRatio: 8192,
          initAngle: 0,
          flags: {
            ...res.header.flags, hasScaleAnim: false, hasAlphaAnim: false,
            hasRotation: false, randomInitAngle: false, hasChildResource: false,
          },
        },
      }],
    }
    const s = show([{ file: wide, res: 0, at: 'defender', frame: 0 }])
    const cam = camera()
    s.step()
    s.write(cam.view, cam.world)
    const g = s.groups.find((x) => x.count > 0)!
    // 회전 0이면 축이 화면의 가로·세로 그대로다
    expect(g.axisX[1]).toBeCloseTo(0, 6)
    expect(g.axisY[0]).toBeCloseTo(0, 6)
    expect(g.axisX[0]! / g.axisY[1]!).toBeCloseTo(2, 4)
  })

  it('자식이 부모와 다른 갈래여도 제 갈래로 그린다', async () => {
    const file = await waza(TACKLE)
    const res = file.resources[0]!
    expect(res.header.flags.drawType).toBe(0)
    expect(res.child).not.toBeNull()

    // 부모는 빌보드 그대로 두고 **자식만** 폴리곤으로 바꾼다. 롬에 실제로
    // 그런 자료가 62벌 있다 (`spl/resource.test.ts`)
    const mixed: SplFile = {
      textures: file.textures,
      resources: [{ ...res, child: { ...res.child!, drawType: 2 } }],
    }
    const s = show([{ file: mixed, res: 0, at: 'defender', frame: 0 }])
    const cam = camera()
    const zOf = (want: 'p' | 'c'): number[] => {
      const out: number[] = []
      for (const g of s.groups) {
        if (!g.key.endsWith(want === 'c' ? 'c' : String(res.header.textureIndex))) continue
        for (let i = 0; i < g.count; i++) out.push(g.axisX[i * 3 + 2]!, g.axisY[i * 3 + 2]!)
      }
      return out
    }
    let parent: number[] = []
    let kids: number[] = []
    for (let f = 0; f < 30; f++) {
      s.step()
      s.write(cam.view, cam.world)
      parent = parent.concat(zOf('p'))
      kids = kids.concat(zOf('c'))
    }
    expect(parent.length).toBeGreaterThan(0)
    expect(kids.length).toBeGreaterThan(0)
    // ⚠️ **빌보드는 뷰 평면에 눕는다** — 두 축의 z가 언제나 0이다.
    // 폴리곤은 월드에 눕고 뷰로 돌려 오므로 z가 산다. 그 둘이 갈리는지를 본다
    expect(parent.every((v) => v === 0)).toBe(true)
    expect(kids.some((v) => v !== 0)).toBe(true)
  })

  it('UV 폭이 되풀이 횟수와 뒤집기를 담는다', async () => {
    const file = await waza(TACKLE)
    const res = file.resources[0]!
    const tiled: SplFile = {
      textures: file.textures,
      resources: [{
        ...res,
        header: {
          ...res.header, textureTileCountS: 2, textureTileCountT: 0,
          flipTextureS: false, flipTextureT: true,
        },
      }],
    }
    const s = show([{ file: tiled, res: 0, at: 'defender', frame: 0 }])
    const parent = s.groups.find((g) => g.key.endsWith('p' + String(res.header.textureIndex)))!
    expect(parent.uvSpan).toEqual([4, -1])
  })
})
