// BTA0(SRT0)·BTP0(PAT0)를 **롬 전체로** 잰다.
//
// ⚠️ **공개 문서가 SRT0 절을 「매우 불완전하다」고 적어 두었다** — 그래서 자리를
// 믿지 않고 값으로 확인한다. 여기 잣대는 셋이다:
//
//   ① 트랙 이름이 그 소품의 **재질 이름**과 맞는가 (안 맞으면 자리가 틀린 것이다)
//   ② 배율·회전 채널이 정말 상수 1.0·단위인가
//   ③ 이동값의 자가 **텍셀**인가 — 같은 재질의 두 축이 가른다
import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { bytesSource, narcCount, narcEntry, openNds } from './nds'
import { romPath, withRom } from '../../data/romData.testkit'
import { blocks, parseMaterials, type Material } from './chunks'
import { parseModel, readDict } from './nsbmd'
import { readNsbta } from './nsbta'
import { patAt, patTextures, readNsbtp } from './nsbtp'
import { readAnimeList } from './propAnims'

const ANIM = '/arc/bm_anime.narc'
const LIST = '/arc/bm_anime_list.narc'
const MODELS = '/fielddata/build_model/build_model.narc'

/** 소품 하나의 재질 (이름과 그림 크기를 안다) */
function materialsOf(file: Uint8Array): Material[] {
  const view = new DataView(file.buffer, file.byteOffset, file.byteLength)
  const mdlAt = blocks(file, view).MDL0!
  const modelAt = mdlAt + view.getUint32(readDict(file, view, mdlAt + 8)[0]!.at, true)
  return parseMaterials(file, view, modelAt, parseModel(file, view, modelAt))
}

interface Rom {
  anime: Uint8Array
  list: Uint8Array
  models: Uint8Array
  /** 애니 멤버 번호 → 그것을 쓰는 소품들 */
  usedBy: Map<number, number[]>
}

async function openAll(): Promise<Rom> {
  const fs = await openNds(bytesSource(new Uint8Array(readFileSync(romPath('en')!))))
  const anime = (await fs!.read(ANIM))!
  const list = (await fs!.read(LIST))!
  const models = (await fs!.read(MODELS))!
  const usedBy = new Map<number, number[]>()
  for (const [prop, row] of readAnimeList(list).entries()) {
    for (const id of row.anims) usedBy.set(id, [...(usedBy.get(id) ?? []), prop])
  }
  return { anime, list, models, usedBy }
}

const kindOf = (m: Uint8Array): string => String.fromCharCode(...m.subarray(0, 4))

withRom('en')('BTA0 — UV 이동', () => {
  it('트랙 마흔셋이 하나도 안 남기고 소품 재질 이름과 맞는다', async () => {
    const rom = await openAll()
    let members = 0, tracks = 0
    for (let i = 0; i < narcCount(rom.anime)!; i++) {
      const raw = narcEntry(rom.anime, i)!
      if (kindOf(raw) !== 'BTA0') continue
      members++
      for (const anim of readNsbta(raw)) {
        expect(anim.frames, `애니 ${String(i)}`).toBeGreaterThan(0)
        for (const prop of rom.usedBy.get(i) ?? []) {
          const names = materialsOf(narcEntry(rom.models, prop)!).map((m) => m.name)
          for (const t of anim.tracks) {
            expect(names, `애니 ${String(i)} 트랙 ${t.material} · 소품 ${String(prop)}`)
              .toContain(t.material)
            tracks++
          }
        }
      }
    }
    expect(members).toBe(43)
    expect(tracks).toBe(82)
  })

  it('이동값의 자가 **텍셀**이다 — 같은 재질의 두 축이 가른다', async () => {
    // 애니 45 `lambert4`는 U축 그림이 16텍셀 · V축이 32텍셀인데 총 이동이
    // 2,052와 3,080이다. 텍셀 자로 읽으면 4바퀴(4×16×32=2048)와
    // 3바퀴(3×32×32=3072)로 맞고, 정규화 UV(÷4096)로 읽으면 0.501·0.752바퀴다 —
    // 480프레임짜리가 반 바퀴에서 끊길 리가 없다
    const rom = await openAll()
    const anim = readNsbta(narcEntry(rom.anime, 45)!)[0]!
    const track = anim.tracks.find((t) => t.material === 'lambert4')!
    const mats = materialsOf(narcEntry(rom.models, (rom.usedBy.get(45) ?? [])[0]!)!)
    const mat = mats.find((m) => m.name === 'lambert4')!
    expect([mat.origWidth, mat.origHeight]).toEqual([16, 32])

    const span = (at: (f: number) => number): number =>
      Math.abs(at(anim.frames - 1) - at(0))
    // `readNsbta`가 이미 32로 나눠 텍셀로 준다
    expect(span(track.u) / mat.origWidth).toBeCloseTo(4, 1)
    expect(span(track.v) / mat.origHeight).toBeCloseTo(3, 1)
  })

  it('자전거 비탈이 정확히 넉 바퀴 흐른다', async () => {
    // 소품 303·304 (`bike_muddy_slope`)의 클립 스물한 프레임이 V로 **그림 넉
    // 장**을 흘린다 — 0.35초에 넉 바퀴라 진흙이 아래로 쏟아지는 자국이 된다.
    // ⚠️ **딱 떨어지는 것이 자를 고른 근거다** — 128텍셀 ÷ 32텍셀 = 4다
    const rom = await openAll()
    const ids = readAnimeList(rom.list)[303]!.anims
    const anim = readNsbta(narcEntry(rom.anime, ids[0]!)!)[0]!
    expect(anim.frames).toBe(21)
    const track = anim.tracks[0]!
    const mat = materialsOf(narcEntry(rom.models, 303)!).find((m) => m.name === track.material)!
    expect(Math.abs(track.v(20) - track.v(0))).toBeCloseTo(128, 3)
    expect(Math.abs(track.v(20) - track.v(0)) / mat.origHeight).toBeCloseTo(4, 3)
    // U는 안 움직인다 — 옆으로 흐르면 비탈이 아니라 강이 된다
    expect(track.u(20)).toBe(track.u(0))
  })
})

withRom('en')('BTP0 — 그림 갈아 끼우기', () => {
  it('트랙 이름이 다 맞고, 부르는 그림이 소품 TEX0에 있다', async () => {
    const rom = await openAll()
    let members = 0, keys = 0
    for (let i = 0; i < narcCount(rom.anime)!; i++) {
      const raw = narcEntry(rom.anime, i)!
      if (kindOf(raw) !== 'BTP0') continue
      members++
      for (const anim of readNsbtp(raw)) {
        for (const prop of rom.usedBy.get(i) ?? []) {
          const names = materialsOf(narcEntry(rom.models, prop)!).map((m) => m.name)
          for (const t of anim.tracks) {
            expect(names, `애니 ${String(i)} 트랙 ${t.material}`).toContain(t.material)
            expect(t.keys.length).toBeGreaterThan(0)
            for (const k of t.keys) {
              expect(k.texture, `애니 ${String(i)}`).not.toBe('')
              keys++
            }
          }
        }
      }
    }
    expect(members).toBe(23)
    expect(keys).toBeGreaterThan(0)
  })

  it('에스컬레이터가 넉 장을 다섯 프레임마다 갈아 낀다', async () => {
    // 포켓몬센터 계단(소품 130·131·425·426)이 `esca_up1.1~4`를 돌린다.
    // ⚠️ **넷 중 첫 장만 재질이 가리킨다** — 나머지 셋은 어느 재질도 안 부르므로
    // 시트에 같이 안 구우면 계단이 멈춘 그림으로 선다 (`wantedItems`의 `extra`)
    const rom = await openAll()
    const ids = readAnimeList(rom.list)[131]!.anims
    const anim = readNsbtp(narcEntry(rom.anime, ids[0]!)!)[0]!
    expect(anim.frames).toBe(20)
    const track = anim.tracks.find((t) => t.material === 'esca_up1')!
    expect(track.keys.map((k) => k.frame)).toEqual([0, 5, 10, 15])
    expect(track.keys.map((k) => k.texture))
      .toEqual(['esca_up1.1', 'esca_up1.2', 'esca_up1.3', 'esca_up1.4'])
    // 키는 **바뀔 때만** 있다 — 사이 프레임은 직전 것을 물고 있는다
    expect(patAt(track, 0)!.texture).toBe('esca_up1.1')
    expect(patAt(track, 4)!.texture).toBe('esca_up1.1')
    expect(patAt(track, 5)!.texture).toBe('esca_up1.2')
    expect(patAt(track, 19)!.texture).toBe('esca_up1.4')

    // 재질이 부르는 것은 첫 장뿐이다
    const own = new Set(materialsOf(narcEntry(rom.models, 131)!).map((m) => m.texture))
    const called = patTextures([anim]).map(([tex]) => tex)
    expect(called.filter((t) => !own.has(t))).toHaveLength(6)
  })
})
