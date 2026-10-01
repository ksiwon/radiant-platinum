// 박스 화면의 커서 (`BoxScreen.tsx`의 `move`)
//
// 격자가 둘인 화면이라 커서가 어디로 넘어가는지가 손끝에 바로 걸린다. 원작은
// 6열 끝에서 오른쪽을 누르면 박스를 떠난다 (`box_app_manager`의
// `boxCol == MAX_PC_COLS - 1`). 그 경계를 안 만들면 파티로 갈 길이 Tab뿐이다.
import { describe, expect, it } from 'vitest'
import { BOX_MODE } from '../../engine/pokemon/boxes'
import type { PokemonInstance } from '../../engine/pokemon/instance'
import { noOrigin } from '../../engine/pokemon/origin'
import { monMenuItems, move } from './BoxScreen'

describe('박스 안에서', () => {
  it('끝에서 안 돈다 — 왼쪽 위에서 왼쪽은 제자리 · 위는 박스 이름 머리다', () => {
    // 원작도 맨 윗줄 위가 박스 이름 칸이다 — 거기서 A가 점프 · 벽지 · 이름을 연다 (`BoxMenu_FillHeaderMenu`)
    expect(move({ pane: 'box', at: 0 }, 0, -1, 3)).toEqual({ pane: 'header', at: 0 })
    expect(move({ pane: 'box', at: 0 }, -1, 0, 3)).toEqual({ pane: 'box', at: 0 })
    expect(move({ pane: 'header', at: 0 }, 0, -1, 3)).toEqual({ pane: 'header', at: 0 })
    expect(move({ pane: 'header', at: 0 }, 0, 1, 3)).toEqual({ pane: 'box', at: 0 })
  })

  it('한 줄이 6칸이다', () => {
    expect(move({ pane: 'box', at: 0 }, 0, 1, 3)).toEqual({ pane: 'box', at: 6 })
    expect(move({ pane: 'box', at: 3 }, 1, 0, 3)).toEqual({ pane: 'box', at: 4 })
    // 29번이 마지막(5줄 × 6칸)이라 아래로 더 안 간다
    expect(move({ pane: 'box', at: 29 }, 0, 1, 3)).toEqual({ pane: 'box', at: 29 })
  })

  it('줄 끝에서 오른쪽으로 나가면 파티다', () => {
    expect(move({ pane: 'box', at: 5 }, 1, 0, 3)).toEqual({ pane: 'party', at: 0 })
    expect(move({ pane: 'box', at: 17 }, 1, 0, 3)).toEqual({ pane: 'party', at: 0 })
    // ⚠️ 줄 끝이 아니면 안 나간다. 4번(1줄 5번째)은 5번으로 갈 뿐이다
    expect(move({ pane: 'box', at: 4 }, 1, 0, 3)).toEqual({ pane: 'box', at: 5 })
  })
})

describe('파티 쪽에서', () => {
  it('왼쪽으로 나가면 박스의 오른쪽 끝으로 돌아온다', () => {
    expect(move({ pane: 'party', at: 0 }, -1, 0, 3)).toEqual({ pane: 'box', at: 5 })
    expect(move({ pane: 'party', at: 3 }, -1, 0, 3)).toEqual({ pane: 'box', at: 5 })
  })

  it('세 칸씩 두 줄이다', () => {
    expect(move({ pane: 'party', at: 0 }, 0, 1, 6)).toEqual({ pane: 'party', at: 3 })
    expect(move({ pane: 'party', at: 1 }, 1, 0, 6)).toEqual({ pane: 'party', at: 2 })
    expect(move({ pane: 'party', at: 5 }, 0, 1, 6)).toEqual({ pane: 'party', at: 5 })
  })

  /**
   * **들어 있는 수 바로 다음 칸까지만** 간다.
   *
   * 빈 칸에도 서야 한다 — 거기에 놓을 수 있어야 하니까. 하지만 파티는 앞에서부터
   * 차므로 두 마리뿐인데 여섯 번째 칸에 서면, 놓을 수 없는 자리에 커서가 선다
   */
  it('빈 칸은 하나까지만 딛는다', () => {
    expect(move({ pane: 'party', at: 0 }, 1, 0, 2)).toEqual({ pane: 'party', at: 1 })
    expect(move({ pane: 'party', at: 1 }, 1, 0, 2)).toEqual({ pane: 'party', at: 2 })
    // 세 번째 칸이 이미 "다음 칸"이라 더 못 간다
    expect(move({ pane: 'party', at: 2 }, 0, 1, 2)).toEqual({ pane: 'party', at: 2 })
    // 여섯 마리면 마지막 칸까지 간다
    expect(move({ pane: 'party', at: 2 }, 0, 1, 6)).toEqual({ pane: 'party', at: 5 })
  })
})

/**
 * 마리 메뉴 (`BoxMenu_FillTopLevelMenuItems`). 번호는 원작 `enum BoxMenuItem`이다 —
 * 잡는다 34 · 상태를 본다 37 · 데리고 간다 38 · 맡긴다 39 · 지닌물건 40 · 놓아준다 42 · 그만둔다 43
 */
describe('마리 메뉴', () => {
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

  it('상태를 본다는 박스 마리에도 선다 — 맡기기 · 꺼내기 갈래도 둘째 자리다', () => {
    expect(monMenuItems(BOX_MODE.withdraw, true, mon())).toEqual([38, 37, 42, 43])
    expect(monMenuItems(BOX_MODE.deposit, false, mon())).toEqual([39, 37, 42, 43])
    expect(monMenuItems(BOX_MODE.move, true, mon())).toEqual([34, 37, 38, 42, 43])
  })

  it('지닌물건은 정리하기에서 물건을 든 마리에만 선다 — 상태를 본다 바로 다음이다', () => {
    expect(monMenuItems(BOX_MODE.move, true, mon({ heldItem: 234 }))).toEqual([34, 37, 40, 38, 42, 43])
    expect(monMenuItems(BOX_MODE.move, false, mon({ heldItem: 234 }))).toEqual([34, 37, 40, 39, 42, 43])
    // 알은 원작도 안 세운다 (`preview->isEgg == FALSE`)
    expect(monMenuItems(BOX_MODE.move, true, mon({ heldItem: 234, isEgg: true }))).not.toContain(40)
    // 맡기기 · 꺼내기 갈래에는 원작에도 없다
    expect(monMenuItems(BOX_MODE.withdraw, true, mon({ heldItem: 234 }))).not.toContain(40)
  })
})
