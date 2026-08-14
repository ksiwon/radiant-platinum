// 가방 — 주머니 8개, 좌우로 넘긴다.
//
// 주머니마다 나열 순서가 다르다. 나무열매와 기술머신은 번호순, 나머지는 주운
// 순서다 (`engine/bag/bag.ts`). 그 차이가 여기서 눈에 보이므로 정렬을 다시
// 하지 않고 저장된 순서를 그대로 그린다.
//
// ⚠️ 설명칸에 **아이콘을 크게** 세운다. 목록의 28픽셀짜리로는 무엇을 고르고
// 있는지가 안 보인다 — 원작도 위 화면에 고른 물건을 크게 띄운다.
import { useEffect, useMemo, useState } from 'react'
import {
  loadItemDescriptions, loadItemIcons, loadItemNames, loadItems, loadMoves, loadSpecies,
  type ItemTable, type MoveTable, type SpeciesTable,
} from '../../data/gameData'
import { loadUiText } from '../../data/uiText'
import { POCKET_SIZE } from '../../engine/bag/bag'
import { useMenuStore } from '../../state/menuStore'
import { itemChoice } from './itemChoice'
import { useGameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import type { ItemIcons } from '../../data/schema'
import { clampCursor, scrollIntoView, useMenuKeys, wrapCursor } from './useMenuKeys'
import { BIKE_WHY, bikeBlock, isOnCyclingRoad } from '../../engine/actor/bike'
import { onElevatedBridge } from '../../engine/actor/bridge'
import { fieldAction, FieldUse } from '../../engine/bag/fieldUse'
import { tradeEvolutionItems } from '../../engine/pokemon/evolution'
import { castRod } from '../../scene/fishingSystem'
import { turnOnRadar } from '../../scene/pokeRadar'
import { isSurfable } from '../../engine/map/zone'
import { fieldScripts, frontTile } from '../../engine/script/field'
import { SYSTEM_FLAG } from '../../engine/script/commands'
import { isRadarGrass } from '../../engine/battle/encounter'
import { mapById, world } from '../../engine/map/world'
import { worldState } from '../../state/worldState'
import { itemIcon } from './itemIcon'
import { withHeldItem } from './formChange'
import { MenuScreen } from './MenuScreen'
import * as css from './menuChrome.css'
import * as own from './bagScreen.css'

/** 목록의 아이콘. 줄 높이(32)를 넘지 않는다 */
const LIST_ICON = 28
/** 설명칸의 아이콘. 이 화면에서 제일 큰 그림이어야 한다 */
const BIG_ICON = 96

interface Loaded {
  items: ItemTable
  names: string[]
  descriptions: string[]
  icons: ItemIcons
  pockets: string[]
  /**
   * 종족·기술 표.
   *
   * ⚠️ **도구를 「건네준다」로 붙이는 자리 때문에 필요하다** — 백금옥을 쥐여
   * 주면 그 자리에서 기라티나의 폼과 능력치가 바뀐다 (PARITY §3.4)
   */
  species: SpeciesTable
  moves: MoveTable
}

export function BagScreen() {
  const [data, setData] = useState<Loaded | null>(null)
  // 설정의 언어. 바뀌면 이름과 설명을 그 언어로 다시 받는다
  const locale = useGameLocale()
  const [pocket, setPocket] = useState(0)
  const [cursor, setCursor] = useState(0)
  /** 못 쓰는 이유. 원작도 한 줄 띄우고 만다 */
  const [denied, setDenied] = useState<string | null>(null)
  const back = useMenuStore((s) => s.back)
  const bag = useSaveStore((s) => s.bag)
  const money = useSaveStore((s) => s.money)
  const steps = useSaveStore((s) => s.steps)
  const removeItem = useSaveStore((s) => s.removeItem)
  const addItem = useSaveStore((s) => s.addItem)
  const openPartyWithItem = useMenuStore((s) => s.openPartyWithItem)
  const giveTo = useMenuStore((s) => s.giveTo)
  const pickPocket = useMenuStore((s) => s.pickPocket)
  const closeAll = useMenuStore((s) => s.closeAll)
  const push = useMenuStore((s) => s.push)
  const openBerryTag = useMenuStore((s) => s.openBerryTag)

  useEffect(() => {
    let alive = true
    void Promise.all([
      loadItems(), loadItemNames(locale), loadItemDescriptions(locale),
      loadItemIcons(), loadUiText('bagPockets', locale), loadSpecies(), loadMoves(),
    ])
      .then(([items, names, descriptions, icons, pockets, species, moves]) => {
        if (alive) setData({ items, names, descriptions, icons, pockets, species, moves })
      })
      .catch(() => { /* 빈 가방으로 뜬다 */ })
    return () => { alive = false }
  }, [locale])

  /**
   * 지닌 채 교환해야 하던 도구들 (PARITY §12.2). 종족표에서 뽑아 롬 이름표로
   * 바꾼다 — 도구표의 갈래(`fieldUseFunc`)로는 못 찾는다
   */
  const evoItems = useMemo(() => {
    if (!data) return undefined
    const out = new Set<string>()
    for (const id of tradeEvolutionItems(data.species.all)) {
      const constant = data.items.all[id]?.constant
      if (constant !== undefined) out.add(constant)
    }
    return out
  }, [data])

  // 스크립트가 고르라고 열었으면 그 주머니에 못 박힌다 (`FieldSystem_CreateBagContext`)
  const shown = pickPocket ?? pocket
  const slots = bag[shown] ?? []
  const at = Math.min(cursor, Math.max(0, slots.length - 1))
  const selected = slots[at]

  /**
   * 도구를 파티의 한 마리에게 붙인다 (`PartyMenu_SelectItemGive`).
   *
   * ⚠️ **이미 들고 있으면 맞바꾼다.** 원작이 들고 있던 것을 가방에 돌려주고
   * 새것을 붙인다 — 덮어쓰면 도구 하나가 세상에서 사라진다
   */
  const giveItem = (slot: number, id: number, pocket: number): void => {
    const party = useSaveStore.getState().party
    const mon = party[slot]
    if (!mon) return
    const held = mon.heldItem
    const next = [...party]
    // 백금옥을 쥐여 주면 그 자리에서 오리진이 된다 (PARITY §3.4)
    next[slot] = withHeldItem({ ...mon, heldItem: id }, data?.species, data?.moves)
    useSaveStore.setState({ party: next })
    removeItem(pocket, id, 1)
    if (held > 0) addItem(data?.items.get(held).pocket ?? 0, held, 1)
    back()
  }

  /**
   * 고른 물건을 쓴다 (PARITY §4.1).
   *
   * 무엇을 하는지는 도구표의 `fieldUseFunc`가 정한다 (`engine/bag/fieldUse`) —
   * 원작의 `sItemUseFuncs`와 같은 표다. 예전에는 자전거 하나만 반응하고
   * 나머지는 **눌러도 아무 일도 안 일어났다**
   */
  const use = (): void => {
    const id = selected?.item
    // ⚠️ **고르라고 열린 가방은 쓰지 않는다.** 고른 번호만 남기고 닫는다 —
    // 스크립트가 그 뒤에 `GetSelectedItem`으로 읽는다
    if (pickPocket !== null) {
      if (id === undefined) return
      itemChoice.item = id
      closeAll()
      return
    }
    if (id === undefined || !data) return
    const item = data.items.get(id)
    // 「건네준다」로 열린 가방이다 (`PartyMenu_SelectItemGive`). 쓰는 것이
    // 아니라 **붙이는 것**이라 도구표의 갈래를 아예 안 본다
    if (giveTo !== null) { giveItem(giveTo, id, item.pocket ?? 0); return }
    const header = mapById(world.mapId)
    const p = worldState.player
    const grid = world.grid
    const front = frontTile()
    const action = fieldAction(item, {
      mapId: world.mapId,
      mapType: header?.mapType ?? 0,
      escapeRopeAllowed: header?.escapeRope === 1,
      repelSteps: steps.repel,
      waterAhead: grid !== null && isSurfable(grid.behavior(front.x, front.z)),
      onBridge: onElevatedBridge(),
      // ⚠️ 레이더는 **선** 칸을 본다 — 낚싯대가 앞 칸을 보는 것과 다르다
      inTallGrass: grid !== null
        && isRadarGrass(grid.behaviorAtWorld(p.position.x, p.position.z)),
      hasPartner: fieldScripts.vars?.checkFlag(SYSTEM_FLAG.hasPartner) === true,
      onBike: p.cycling,
      evoItems,
    })

    switch (action.kind) {
      case 'bike': {
        const here = grid?.behaviorAtWorld(p.position.x, p.position.z) ?? null
        const why = bikeBlock(header, here, p.surfing, p.cycling, isOnCyclingRoad())
        if (why !== null) { setDenied(BIKE_WHY[why]); return }
        p.cycling = !p.cycling
        p.pedalling = 0
        back()
        return
      }
      case 'party':
        openPartyWithItem({ item: id, use: action.use })
        return
      case 'repel':
        // `TryUseRepel` — 걸음을 세우고 한 개를 쓴다
        useSaveStore.setState({ steps: { ...steps, repel: action.steps } })
        removeItem(item.pocket ?? 0, id, 1)
        setDenied(`${data.names[id] ?? ''}을(를) 썼다!`)
        return
      case 'flute':
        // 걸음을 안 센다. 이 맵을 벗어나면 풀린다 (`FieldSystem_InitFlagsWarp`)
        useSaveStore.setState({ flute: action.factor })
        removeItem(item.pocket ?? 0, id, 1)
        setDenied(`${data.names[id] ?? ''}을(를) 불었다!`)
        return
      case 'escapeRope': {
        const exit = useSaveStore.getState().exit
        if (!exit) { setDenied('돌아갈 자리가 없다.'); return }
        removeItem(item.pocket ?? 0, id, 1)
        world.pending = {
          to: exit.map, matrix: exit.matrix, x: exit.x, z: exit.z, facing: exit.facing,
          // 문으로 나오는 것이 아니라 굴 밖에 툭 선다. 원작도 문 여닫는 연출이 없다
          viaDoor: false,
        }
        closeAll()
        return
      }
      case 'fish':
        // 던지는 순간 가방을 닫는다. 원작도 낚싯대를 쓰면 가방이 사라지고
        // 필드 과제(`FieldTask_Fishing`)가 화면을 가져간다
        castRod(action.rod)
        closeAll()
        return
      case 'screen':
        // 여는 것이 전부인 도구. 쌓아 올려서 B로 가방으로 돌아온다
        push(action.screen)
        return
      case 'missing':
        setDenied(`${action.what}이(가) 아직 없다.`)
        return
      case 'radar':
        // 켜는 순간 가방을 닫는다. 원작도 필드 과제(`RefreshRadarChain`)가
        // 화면을 가져간다 — 배터리가 덜 찼는지는 그쪽이 롬의 대사로 말한다
        turnOnRadar()
        closeAll()
        return
      default:
        setDenied(action.why)
    }
  }

  useMenuKeys({
    up: () => { setCursor((c) => clampCursor(c, -1, slots.length)) },
    down: () => { setCursor((c) => clampCursor(c, 1, slots.length)) },
    left: () => {
      if (pickPocket !== null) return
      setPocket((p) => wrapCursor(p, -1, POCKET_SIZE.length)); setCursor(0)
    },
    right: () => {
      if (pickPocket !== null) return
      setPocket((p) => wrapCursor(p, 1, POCKET_SIZE.length)); setCursor(0)
    },
    // ⚠️ **원작은 가방의 갈래 메뉴에서 태그를 연다** (「태그를 본다」).
    // 우리 가방에는 아직 갈래 메뉴가 없어서 Tab으로 연다 — 여는 길만 다르다
    tab: () => {
      const id = selected?.item
      if (id === undefined || !data) return
      if (data.items.get(id).fieldUseFunc !== FieldUse.BERRY) {
        setDenied('나무열매가 아니다')
        return
      }
      openBerryTag(id)
    },
    confirm: use,
    // ⚠️ 고르라고 열린 가방은 취소도 **0을 남기고** 닫아야 한다 — 안 그러면
    // 앞서 고른 도구가 그대로 남아 다시 심긴다
    cancel: () => {
      if (pickPocket === null) { back(); return }
      itemChoice.item = 0
      closeAll()
    },
  })

  return (
    <MenuScreen
      title="가방"
      note={`${money.toLocaleString('ko-KR')}원`}
      foot={denied
        ?? (pickPocket === null
          ? `←→ 주머니 · ↑↓ 고르기 · Z 쓴다 · X 닫기`
          : `↑↓ 고르기 · Z 고른다 · X 그만둔다`)
        + ` · ${String(slots.length)}/${String(POCKET_SIZE[shown] ?? 0)}칸`}
    >
      <div className={css.tabs}>
        {(data?.pockets ?? []).map((name, i) => (
          // 고르라고 열린 가방은 그 주머니 하나만 보인다
          pickPocket !== null && i !== pickPocket ? null : (
            <span
              key={name}
              className={i === shown ? css.tab.on : css.tab.off}
              onPointerDown={() => {
                if (pickPocket !== null) return
                setPocket(i); setCursor(0)
              }}
            >
              {name}
            </span>
          )
        ))}
      </div>

      <div className={css.stage}>
        <div className={css.list}>
          {slots.length === 0 && <div className={css.empty}>아무것도 없다</div>}
          {slots.map((slot, i) => (
            <div
              key={slot.item}
              className={i === at ? css.rowOn : css.row}
              ref={i === at ? scrollIntoView : undefined}
              onPointerEnter={() => { setCursor(i) }}
            >
              {i === at && <span className={css.caret} aria-hidden />}
              <span className={css.face}>
                <span className={css.icon} style={itemIcon(data?.icons, slot.item, LIST_ICON)} aria-hidden />
                <span className={css.label}>{data?.names[slot.item] ?? ''}</span>
                {/* 중요한 물건은 개수를 안 붙인다 — 원작도 한 개뿐이라 안 센다 */}
                {data?.items.get(slot.item).preventToss === 1
                  ? null
                  : <span className={css.countNear}>×{slot.count}</span>}
              </span>
            </div>
          ))}
        </div>

        <div className={css.detail}>
          {selected && (
            <>
              <div className={own.hero}>
                <span
                  className={own.heroIcon}
                  style={itemIcon(data?.icons, selected.item, BIG_ICON)}
                  aria-hidden
                />
                <span className={own.heroText}>
                  <span className={own.heroName}>{data?.names[selected.item] ?? ''}</span>
                  <span className={own.heroSub}>
                    {data?.pockets[shown] ?? ''}
                    {data?.items.get(selected.item).preventToss === 1 ? '' : ` · ${String(selected.count)}개`}
                  </span>
                </span>
              </div>
              <div className={css.detailText}>{data?.descriptions[selected.item] ?? ''}</div>
            </>
          )}
        </div>
      </div>
    </MenuScreen>
  )
}
