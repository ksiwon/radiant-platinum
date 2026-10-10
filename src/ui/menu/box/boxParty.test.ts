// 박스 파티 칸의 그림 (`box/BoxParty.tsx`) — **아이콘의 종이 이름의 종과 같다** (사용자 지적 ③).
//
// 한때 아이콘 칸 계산이 배율과 따로 놀아서 파티 아이콘이 잘리고 옆 칸의 종이 나왔다. 여기서는 실제로 그려 본 마크업에서
// 칸마다 (이름, 아이콘 칸 번호, 잘라 낸 배경 위치 · 크기)를 읽어, 한 개체에서 나온 짝인지와 아이콘이 잘리지 않는지를 잰다.
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { PokeIcons } from '../../../data/schema'
import { ICON_SLOTS, SPECIES_EGG, SPECIES_GIRATINA, iconSlot } from '../../../engine/pokemon/form'
import type { PokemonInstance } from '../../../engine/pokemon/instance'
import { noOrigin } from '../../../engine/pokemon/origin'
import { BoxParty } from './BoxParty'
import { PARTY_SCALE } from './boxMenus'

const mon = (over: Partial<PokemonInstance> = {}): PokemonInstance => ({
  species: 387, pid: 1, nickname: null, exp: 0, level: 5,
  ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
  moves: [], hp: 20, status: 'ok', statusTurns: 0, heldItem: 0,
  friendship: 70, isEgg: false, otId: 0, otSecretId: 0, ball: 0,
  origin: noOrigin({ name: '', gender: 'male' }),
  form: 0, pokerus: 0, mail: null,
  ...over,
})

const ICONS: PokeIcons = { size: 32, cols: 24, rows: 23, count: ICON_SLOTS }
const NAMES: string[] = []
for (let i = 1; i <= 493; i++) NAMES[i] = `종${String(i)}`
NAMES[SPECIES_EGG] = '알'

interface Cell {
  slotNo: number
  iconSlot: number | null
  name: string
  width: number
  height: number
  position: string
  size: string
}

/** 마크업에서 칸마다 읽는다 */
function cells(party: PokemonInstance[], ...rest: Partial<Parameters<typeof BoxParty>[0]>[]): Cell[] {
  const html = renderToStaticMarkup(createElement(BoxParty, {
    party, names: NAMES, icons: ICONS, maxHpOf: () => 40, cursorAt: null, ghost: null, lift: null,
    hopOf: () => null, slotRef: () => { /* 안 쓴다 */ }, onHover: () => { /* 안 쓴다 */ }, onGrab: () => { /* 안 쓴다 */ },
    ...Object.assign({}, ...rest),
  }))
  return html.split('data-box-party-slot="').slice(1).map((chunk) => {
    const style = /data-icon-slot="(\d+)"/.exec(chunk)
    const iconStyle = /<span class="[^"]*" style="([^"]*)" data-icon-slot/.exec(chunk)?.[1] ?? ''
    const px = (re: RegExp): number => Number(re.exec(iconStyle)?.[1] ?? Number.NaN)
    const nameText = /data-box-party-name[^>]*>([^<]*)</.exec(chunk)
    return {
      slotNo: Number(/^(\d+)"/.exec(chunk)?.[1]),
      iconSlot: style === null ? null : Number(style[1]),
      name: nameText?.[1] ?? '',
      width: px(/width:(\d+)px/),
      height: px(/height:(\d+)px/),
      position: /background-position:([^;]*)/.exec(iconStyle)?.[1] ?? '',
      size: /background-size:([^;]*)/.exec(iconStyle)?.[1] ?? '',
    }
  })
}

describe('파티 아이콘 — 이름과 같은 종이고 잘리지 않는다', () => {
  const party = [
    mon({ species: 448 }), mon({ species: 390 }), mon({ species: 396, nickname: '찌르' }),
    mon({ species: 77 }), mon({ species: SPECIES_GIRATINA, form: 1 }), mon({ species: 25, isEgg: true }),
  ]
  const drawn = cells(party)

  it('여섯 칸이 다 그려진다', () => {
    expect(drawn).toHaveLength(6)
    expect(drawn.every((c) => c.iconSlot !== null)).toBe(true)
  })

  it('칸마다 아이콘 칸 번호가 그 개체의 종에서 나온다 (이름을 구한 개체와 같다)', () => {
    party.forEach((m, i) => {
      expect(drawn[i]!.iconSlot, `${String(i)}번째 칸 번호`).toBe(iconSlot(m.species, m.form, m.isEgg))
    })
    // 폼 없는 종은 종족 번호가 곧 칸이다 — 이름의 종과 아이콘의 종이 같다
    expect(drawn[0]!.name).toBe('종448')
    expect(drawn[0]!.iconSlot).toBe(448)
    expect(drawn[1]!.name).toBe('종390')
    expect(drawn[1]!.iconSlot).toBe(390)
    expect(drawn[3]!.name).toBe('종77')
    expect(drawn[3]!.iconSlot).toBe(77)
  })

  it('별명이 있어도 아이콘은 종 칸이다', () => {
    expect(drawn[2]!.name).toBe('찌르')
    expect(drawn[2]!.iconSlot).toBe(396)
  })

  it('폼 아이콘은 폼 칸(495 이후)이다 — 이웃 종 칸이 아니다', () => {
    expect(drawn[4]!.iconSlot).toBe(533)
    expect(drawn[4]!.iconSlot).not.toBe(SPECIES_GIRATINA)
  })

  it('알은 알 칸이고 이름은 「알」이다 — 속의 종(25)이 새지 않는다', () => {
    expect(drawn[5]!.iconSlot).toBe(SPECIES_EGG)
    expect(drawn[5]!.name).toBe('알')
  })

  it('상자는 원본 칸 × 정수 배율(64×64)이고 시트 전체도 같은 배율이다 — 잘리지 않는다', () => {
    const box = 32 * PARTY_SCALE
    for (const c of drawn) {
      expect(c.width).toBe(box)
      expect(c.height).toBe(box)
      expect(c.size).toBe(`${String(24 * box)}px ${String(23 * box)}px`)
    }
  })

  it('배경 위치는 그 칸의 왼쪽 위다 — 이웃 칸이 한 줄도 비치지 않는다', () => {
    const box = 32 * PARTY_SCALE
    for (const c of drawn) {
      const slot = c.iconSlot!
      expect(c.position).toBe(`-${String((slot % 24) * box)}px -${String(Math.floor(slot / 24) * box)}px`)
    }
  })

  it('빈 칸은 아이콘 대신 점선 원이다 (아이콘을 안 그린다)', () => {
    const half = cells([mon({ species: 448 })])
    expect(half[0]!.iconSlot).toBe(448)
    for (const c of half.slice(1)) expect(c.iconSlot).toBeNull()
  })
})
