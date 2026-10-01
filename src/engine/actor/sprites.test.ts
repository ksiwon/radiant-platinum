// NPC 그림표 검증.
//
// 여기서 틀리면 사람이 **엉뚱한 쪽을 보고 서 있는다** — 그런데 그림 자체는
// 멀쩡히 나오므로 눈으로는 잘 안 걸린다. 그래서 뽑아 둔 자료와 맞대 본다.
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { Object3D, PerspectiveCamera } from 'three'
import {
  artDir, cameraQuadrant, castsFootShadow, darknessTint, footShadow, footShadowOpacity,
  frameOf, hidesFootShadow, loadNpcSprites, npcSprite, plateQuadrant, SHADOW_OFFSET,
  stepFootShadow, type NpcSprite,
} from './sprites'
import { Behavior } from '../map/zone'
import { TimeOfDay } from '../map/timeOfDay'
import { withData } from '../../data/romData.testkit'
import { plateShade } from '../../scene/NpcSprites'
import { faceCamera } from '../../scene/billboard'
import { NIGHT_FLOOR, TIME_LOOKS } from '../../scene/fx/sky'

/** 닌자꼬마와 같은 모양의 최소 표본 — 16장, 방향마다 4장 */
const WALKER: NpcSprite = {
  name: 'NINJA_BOY', w: 32, h: 32, frames: 16,
  seq: {
    ticks: [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48, 52, 56, 60],
    frames: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  },
  anims: [[0, 15, 0], [16, 31, 0], [32, 47, 0], [48, 63, 0]],
  directional: true,
}

describe('방향 고르기', () => {
  it('카메라가 안 돌면 원작과 같다 — 동작 번호가 곧 방향이다', () => {
    for (const dir of [0, 1, 2, 3]) expect(artDir(dir, 0)).toBe(dir)
  })

  it('마주 보면 얼굴이 보인다', () => {
    // 북(0)을 보는 사람을 남쪽에서 보면 뒤통수(0), 북쪽에서 보면 얼굴(1)이다
    expect(artDir(0, 0)).toBe(0)
    expect(artDir(0, 2)).toBe(1)
    // 남(1)을 보는 사람은 그 반대다
    expect(artDir(1, 0)).toBe(1)
    expect(artDir(1, 2)).toBe(0)
  })

  it('네 사분면을 돌면 제자리로 온다', () => {
    for (const dir of [0, 1, 2, 3]) {
      expect(artDir(dir, 4)).toBe(artDir(dir, 0))
      const seen = new Set([0, 1, 2, 3].map((q) => artDir(dir, q)))
      // 한 바퀴 돌면 네 그림이 한 번씩 나와야 한다. 겹치면 매핑이 접힌 것이다
      expect(seen.size).toBe(4)
    }
  })

  it('카메라 사분면은 −Z가 북쪽이다', () => {
    expect(cameraQuadrant(0, -1)).toBe(0)
    expect(cameraQuadrant(1, 0)).toBe(1)
    expect(cameraQuadrant(0, 1)).toBe(2)
    expect(cameraQuadrant(-1, 0)).toBe(3)
  })

  it('1인칭 화면 가장자리 사람은 그 사람 쪽으로 가는 선으로 고른다 — 마주 보면 얼굴이다', () => {
    // 카메라가 (0.5, 0.5)에서 북동 40°를 본다. 시선 하나로 고르면 0(북)이다
    const yaw = 40 * Math.PI / 180
    const view = cameraQuadrant(Math.sin(yaw), -Math.cos(yaw))
    expect(view).toBe(0)
    // 칸 (4, −1)의 사람은 시선에서 오른쪽으로 36° — 가로 화각 85°의 가장자리다
    const ray = Math.atan2(4.5 - 0.5, -(-0.5 - 0.5)) * 180 / Math.PI
    expect(ray - 40).toBeGreaterThan(30)
    expect(ray - 40).toBeLessThan(42.5)
    // 그 사람이 서쪽(2)을 보면 나를 마주 보는 것이다. 얼굴(남, 1)이어야 한다
    const q = plateQuadrant(view, true, 4, -1, 0.5, 0.5)
    expect(q).toBe(1)
    expect(artDir(2, q)).toBe(1)
    // 시선 하나로 고르면 서쪽 옆모습(2)이 나왔다
    expect(artDir(2, view)).toBe(2)
  })

  it('3인칭은 사람마다 고르지 않는다 — 시선(원작은 늘 북쪽, 0) 그대로다', () => {
    // 카메라 옆으로 멀리 선 사람도 원작처럼 제 방향 그림이다
    expect(plateQuadrant(0, false, 20, 0, 0.5, 6)).toBe(0)
    for (const dir of [0, 1, 2, 3]) expect(artDir(dir, plateQuadrant(0, false, 20, 0, 0.5, 6))).toBe(dir)
  })
})

describe('장 고르기', () => {
  it('서 있으면 그 방향의 첫 장이다', () => {
    expect(frameOf(WALKER, 0, 0)).toBe(0)
    expect(frameOf(WALKER, 1, 0)).toBe(4)
    expect(frameOf(WALKER, 2, 0)).toBe(8)
    expect(frameOf(WALKER, 3, 0)).toBe(12)
  })

  it('걸으면 네 장을 돌고 제자리로 온다', () => {
    expect([0, 4, 8, 12].map((t) => frameOf(WALKER, 1, t))).toEqual([4, 5, 6, 7])
    // 한 동작이 16틱이라 16틱째는 다시 처음이다
    expect(frameOf(WALKER, 1, 16)).toBe(4)
  })

  it('동작 구간을 넘어가도 옆 방향을 침범하지 않는다', () => {
    for (let t = 0; t < 200; t++) {
      expect(frameOf(WALKER, 0, t)).toBeLessThan(4)
      expect(frameOf(WALKER, 3, t)).toBeGreaterThanOrEqual(12)
    }
  })

  it('한 번만 도는 동작은 끝 장에서 멈춘다', () => {
    const once: NpcSprite = { ...WALKER, anims: [[0, 15, 1]] }
    expect(frameOf(once, 0, 12)).toBe(3)
    expect(frameOf(once, 0, 999)).toBe(3)
  })

  it('차례나 동작이 없는 정물은 늘 첫 장이다', () => {
    const rock: NpcSprite = {
      name: 'MOSS_ROCK', w: 16, h: 16, frames: 1, seq: null, anims: null, directional: false,
    }
    for (const t of [0, 7, 99]) expect(frameOf(rock, 0, t)).toBe(0)
    // 동작이 모자라면 있는 것 중 마지막을 쓴다. 범위 밖을 읽지 않는다
    expect(frameOf(rock, 3, 0)).toBe(0)
  })
})

describe('발밑 그림자 (`ov5_021F134C`)', () => {
  it('처음에는 감지 않고 그 시간대 값으로 바로 선다', () => {
    const s = footShadow()
    stepFootShadow(s, TimeOfDay.NIGHT, 1)
    expect(s.alpha).toBe(8)
    expect([s.sx, s.sz]).toEqual([1.125, 1])
    expect(footShadowOpacity(s)).toBeCloseTo(8 / 31)
  })

  it('시간대가 바뀌면 크기는 프레임마다 1/256, 알파는 1/8씩 간다', () => {
    const s = footShadow()
    stepFootShadow(s, TimeOfDay.DAY, 1)
    expect([s.alpha, s.sx, s.sz]).toEqual([18, 1.25, 1.25])
    // 낮 → 해질녘: 가로는 그대로(1.25), 세로만 1.25 → 1, 알파도 그대로다
    stepFootShadow(s, TimeOfDay.TWILIGHT, 1)
    expect(s.sx).toBe(1.25)
    expect(s.sz).toBeCloseTo(1.25 - 1 / 256)
    // 64프레임이면 0.25를 다 간다. 넘어가지 않는다
    stepFootShadow(s, TimeOfDay.TWILIGHT, 100)
    expect(s.sz).toBe(1)
    // 해질녘 → 심야: 알파 18 → 4는 1/8씩이라 112프레임이 걸린다
    stepFootShadow(s, TimeOfDay.LATE_NIGHT, 8)
    expect(s.alpha).toBe(17)
    // 모델에는 정수로 잘라 넘긴다 — 16.875는 16이다
    stepFootShadow(s, TimeOfDay.LATE_NIGHT, 1)
    expect(footShadowOpacity(s)).toBeCloseTo(16 / 31)
    stepFootShadow(s, TimeOfDay.LATE_NIGHT, 1000)
    expect([s.alpha, s.sx, s.sz]).toEqual([4, 0.875, 0.875])
  })

  it('자리는 사람에서 x −0.5 · z +1유닛 (한 칸 16유닛)', () => {
    expect(SHADOW_OFFSET).toEqual({ x: -1 / 32, z: 1 / 16 })
  })

  it('풀숲·물·웅덩이·얕은 물·눈·진흙·거울 바닥에서는 감춘다 (`sub_02063B20`)', () => {
    for (const b of [
      Behavior.TALL_GRASS, Behavior.VERY_TALL_GRASS, Behavior.PUDDLE, Behavior.PUDDLE_NO_SPLASHING,
      Behavior.SHALLOW_WATER, Behavior.SNOW_DEEP, Behavior.SNOW_SHALLOW, Behavior.MUD,
      Behavior.MUD_WITH_GRASS, 0x2c,
    ]) expect(hidesFootShadow(b), b.toString(16)).toBe(true)
    // 맨땅 · 모래 · 그림자가 지는 눈은 그림자가 선다
    for (const b of [0, Behavior.SAND, Behavior.SNOW_WITH_SHADOWS]) {
      expect(hidesFootShadow(b), b.toString(16)).toBe(false)
    }
    // 물·눈 위 다리는 사람이 다리 위에 서 있다 — 그림자가 선다
    expect(hidesFootShadow(0x73)).toBe(false)
    expect(hidesFootShadow(0x75)).toBe(false)
  })

  it('간판·문·무리 그림은 그림자를 안 깐다', () => {
    expect(castsFootShadow({ ...WALKER, name: 'GRUNTS_GROUP_OF_4' })).toBe(false)
    expect(castsFootShadow({ ...WALKER, name: 'GALACTIC_HQ_DOOR' })).toBe(false)
    expect(castsFootShadow(WALKER)).toBe(true)
  })

  // 원작 표를 직접 읽어 맞댄다 — 손으로 옮긴 목록이 한 줄이라도 빠지면 걸린다
  const TABLE = resolve(__dirname, '../../../raw/decomp/src/overlay005/ov5_021FAF40.c')
  it.runIf(existsSync(TABLE))('그림자 깃발이 원작 표(`Unk_ov5_021FC194`)와 같다', () => {
    const src = readFileSync(TABLE, 'utf8')
    const body = src.slice(src.indexOf('Unk_ov5_021FC194[] = {'))
    const rows = [...body.slice(0, body.indexOf('};')).matchAll(/\{ OBJ_EVENT_GFX_(\w+), (\d+), (\d+),/g)]
    expect(rows.length).toBeGreaterThan(250)
    for (const [, name, , shadow] of rows) {
      expect(castsFootShadow({ ...WALKER, name: name! }), name).toBe(shadow !== '0')
    }
  })
})

describe('판때기 밝기 (`plateShade`)', () => {
  const at = (i: number) => {
    const l = TIME_LOOKS[i]!
    return plateShade({ ambient: l.ambient, skyColor: l.skyColor, sun: l.sun, sunColor: l.sunColor, fill: l.fill })
  }

  it('낮은 1이다 — 낮 화면은 전과 같다', () => {
    expect(at(TimeOfDay.DAY)).toBeCloseTo(1, 6)
  })

  it('밤과 심야는 입체 사람처럼 낮의 `NIGHT_FLOOR`까지 내려간다', () => {
    expect(at(TimeOfDay.NIGHT)).toBeCloseTo(NIGHT_FLOOR, 6)
    expect(at(TimeOfDay.LATE_NIGHT)).toBeCloseTo(NIGHT_FLOOR, 6)
  })

  it('해질녘은 낮과 밤 사이다', () => {
    const dusk = at(TimeOfDay.TWILIGHT)
    expect(dusk).toBeLessThan(1)
    expect(dusk).toBeGreaterThan(NIGHT_FLOOR)
  })
})

describe('몸빛 단계 (`darknessTint`)', () => {
  it('0이면 그대로, 16이면 새까맣다', () => {
    expect(darknessTint(0)).toBe(1)
    expect(darknessTint(16)).toBe(0)
  })

  it('원작 식 `base + ((0 − base) · level >> 4)`의 배율이다', () => {
    // 5비트 31에 8단계면 원작은 31 − 16 = 15다 (>>4가 음수를 내림한다). 곱은 15.5 —
    // 반올림 한 칸 안이다
    expect(darknessTint(8)).toBe(0.5)
    expect(Math.abs(31 * darknessTint(8) - (31 + ((0 - 31) * 8 >> 4)))).toBeLessThanOrEqual(1)
  })

  it('16을 넘거나 음수면 끝에서 멈춘다 (`SPRITE_PALETTE_MAX_TINT_LEVEL`)', () => {
    expect(darknessTint(40)).toBe(0)
    expect(darknessTint(-3)).toBe(1)
  })
})

describe('판때기 세우기 (`faceCamera`)', () => {
  /** 한 칸 앞, 눈이 발보다 1.2칸 위 — 1인칭에서 한 칸 앞 사람을 보는 자리 */
  const near = (): { plate: Object3D, eye: PerspectiveCamera } => {
    const plate = new Object3D()
    plate.position.set(0, 0, 0)
    const eye = new PerspectiveCamera()
    eye.position.set(0, 1.2, 1)
    return { plate, eye }
  }

  it('3인칭은 카메라를 통째로 본다 — 내려다보는 각만큼 뒤로 눕는다', () => {
    const { plate, eye } = near()
    faceCamera(plate, eye)
    expect(plate.rotation.x).toBeCloseTo(-Math.atan2(1.2, 1), 6)
  })

  it('1인칭은 좌우로만 돈다 — 한 칸 앞 사람이 뒤로 안 눕는다', () => {
    const { plate, eye } = near()
    faceCamera(plate, eye, true)
    expect(plate.rotation.x).toBe(0)
    expect(plate.rotation.z).toBe(0)
  })

  it('좌우로 도는 각은 두 렌즈가 같다', () => {
    const a = near(), b = near()
    a.eye.position.set(3, 1.2, -2)
    b.eye.position.set(3, 1.2, -2)
    faceCamera(a.plate, a.eye)
    faceCamera(b.plate, b.eye, true)
    expect(b.plate.rotation.y).toBeCloseTo(a.plate.rotation.y, 6)
    expect(b.plate.rotation.y).toBeCloseTo(Math.atan2(3, -2), 6)
  })
})

// ── 뽑아 둔 진짜 자료와 맞댄다 ──────────────────────────────────────────────
const FILE = resolve(__dirname, '../../../public/data/npcSprites.json')
const maybe = withData('npcSprites.json')

maybe('뽑아 둔 표', () => {
  const data = JSON.parse(readFileSync(FILE, 'utf8')) as Record<string, NpcSprite>
  loadNpcSprites(data)

  it('주인공과 흔한 NPC가 들어 있다', () => {
    expect(npcSprite(0)?.name).toBe('PLAYER_M')
    expect(npcSprite(1)?.name).toBe('NINJA_BOY')
  })

  it('방향이 있는 것은 네 쪽이 서로 다른 그림으로 선다', () => {
    const walkers = Object.entries(data).filter(([, s]) => s.directional)
    expect(walkers.length).toBeGreaterThan(100)
    for (const [gfx, s] of walkers) {
      expect(s.anims?.length, `${gfx} ${s.name}`).toBeGreaterThanOrEqual(4)
      const standing = [0, 1, 2, 3].map((d) => frameOf(s, d, 0))
      expect(new Set(standing).size, `${gfx} ${s.name}`).toBe(4)
    }
  })

  it('방향이 없다고 적힌 것은 정말로 안 갈린다', () => {
    for (const [gfx, s] of Object.entries(data)) {
      if (s.directional) continue
      const standing = [0, 1, 2, 3].map((d) => frameOf(s, d, 0))
      // 갈리는데 안 갈린다고 적혀 있으면 표가 틀린 것이다
      expect(new Set(standing).size, `${gfx} ${s.name}`).toBeLessThan(4)
    }
  })

  it('차례표가 가리키는 장이 전부 아틀라스 안에 있다', () => {
    for (const [gfx, s] of Object.entries(data)) {
      if (s.seq === null) continue
      expect(s.seq.ticks).toHaveLength(s.seq.frames.length)
      for (const f of s.seq.frames) {
        expect(f, `${gfx} ${s.name}`).toBeGreaterThanOrEqual(0)
        expect(f, `${gfx} ${s.name}`).toBeLessThan(s.frames)
      }
    }
  })

  it('어느 방향 어느 틱을 물어도 아틀라스 밖을 안 가리킨다', () => {
    for (const s of Object.values(data)) {
      for (let a = 0; a < 4; a++) {
        for (const t of [0, 1, 5, 13, 47, 63, 64, 255]) {
          const f = frameOf(s, a, t)
          expect(f, s.name).toBeGreaterThanOrEqual(0)
          expect(f, s.name).toBeLessThan(s.frames)
        }
      }
    }
  })

  it('그림표에 있는 것은 PNG도 있다', () => {
    for (const gfx of Object.keys(data)) {
      expect(existsSync(resolve(__dirname, `../../../public/data/npc/${gfx}.png`)), gfx).toBe(true)
    }
  })

  it('배치된 사람이 전부 그림을 찾는다 — 못 찾는 것은 사람이 아니다', () => {
    const events = JSON.parse(
      readFileSync(resolve(__dirname, '../../../public/data/events.json'), 'utf8'),
    ) as { events: Record<string, { npcs: { sprite: number }[] }> }

    // 사람이 아닌 것들. 간판·우편함·책은 프롭이고, 열매밭은 자란 정도로 그림이
    // 갈리고, VAR_0…F는 실행 중에 변수에서 읽는다 (DATA.md §2.16)
    const NOT_PEOPLE = new Set([
      91, 92, 93, 94, 95, 96, 100, 118, 183, 209, 262,
      101, 102, 103, 104, 105, 111, 112,
    ])

    let drawn = 0
    let props = 0
    const orphans = new Map<number, number>()
    for (const file of Object.values(events.events)) {
      for (const npc of file.npcs) {
        if (data[String(npc.sprite)] !== undefined) drawn++
        else if (NOT_PEOPLE.has(npc.sprite)) props++
        else orphans.set(npc.sprite, (orphans.get(npc.sprite) ?? 0) + 1)
      }
    }
    expect([...orphans], '그림도 없고 프롭도 아닌 배치가 있다').toEqual([])
    expect(drawn).toBe(3128)
    expect(props).toBe(427)
  })

  it('리조트 왼쪽 집 안에 서는 판때기는 사람 그림이 아니다 — 열매밭 둘이다 (I-p18-5)', () => {
    // 그 집 창·벽에 비치던 도트 조각의 주인을 배치표에서 찾는다. 리조트(맵 457)의
    // 배치는 436번 파일이고, 집은 BDSP `M_D_014_House_01`(815.1~818.9 × 467.0~470.0
    // — `BerryPatchProps`의 `BDSP_COVERED`가 잰 상자)이다. 칸 한가운데가 그 안이면
    // 집 안이다
    const events = JSON.parse(
      readFileSync(resolve(__dirname, '../../../public/data/events.json'), 'utf8'),
    ) as { events: Record<string, { npcs: { sprite: number, x: number, z: number }[] }> }
    const inside = events.events['436']!.npcs.filter((n) =>
      n.x + 0.5 > 815.1 && n.x + 0.5 < 818.9 && n.z + 0.5 > 467.0 && n.z + 0.5 < 470.0)
    // 둘 다 `OBJ_EVENT_GFX_BERRY_SOIL`(100)이라 `NpcSprites`는 안 세운다 — 그
    // 판은 `BerryPatchProps`가 자란 나무열매 그림으로 세운 것이다
    expect(inside.map((n) => [n.x, n.z, n.sprite])).toEqual([[816, 469, 100], [817, 469, 100]])
    for (const n of inside) expect(data[String(n.sprite)], `${n.x},${n.z}`).toBeUndefined()
  })

  it('입체로 세우는 바위 둘은 16×16 한 장이다 — 덩이 폭이 한 칸 상자에서 나온다', () => {
    // `NpcSprites`가 이 둘을 판때기 대신 덩이로 세우고, 폭을 `w / 16`칸 상자에서 잰다.
    // 원작 판도 둘 다 16×16유닛이다 (`rock_smash.nsbmd` = `generic_16x16.nsbmd`)
    expect(npcSprite(84)).toMatchObject({ name: 'STRENGTH_BOULDER', w: 16, h: 16, frames: 1 })
    expect(npcSprite(85)).toMatchObject({ name: 'ROCK_SMASH', w: 16, h: 16, frames: 1 })
  })

  it('닌자꼬마가 서 있는 네 장이 .1 .5 .9 .13이다', () => {
    // 16장이 방향마다 4장씩이라 첫 장은 0·4·8·12다. 그림을 뽑아 눈으로도 봤다:
    // 0은 뒤통수(북), 4는 얼굴(남), 8과 12는 서로 거울인 옆모습(서·동)이다.
    // 차례표가 밀리면 이 넷이 달라진다
    const s = npcSprite(1)
    expect(s).not.toBeNull()
    expect([0, 1, 2, 3].map((d) => frameOf(s as NpcSprite, d, 0))).toEqual([0, 4, 8, 12])
  })
})
