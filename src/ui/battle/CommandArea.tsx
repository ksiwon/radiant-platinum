// 배틀 명령 구역 — 뿌리 메뉴·사파리·예/아니오·기술 칸 (`BattleScreen`에서 꺼냈다. SYSTEM 4.15).
//
// 칸 한 장의 모양은 `CommandButton`이, 스타일은 `command.css`가 쥔다. 이 파일은 **어느 칸이
// 어떤 순서로 서는가**와 키 커서만 다룬다. 화면 짜맞춤과 상태는 `BattleScreen`에 남는다.
//
// 구역은 380×264 안에 든다 (4.16). 뿌리는 「싸운다」 한 판이 크고 나머지 셋이 가로 한 줄이다 — 보이는 차례는
// 싸운다 → 가방 → 포켓몬 → 도망간다이고 ↓와 → 둘 다 다음 칸이다(`useListCursor`). 물음 글(「누구에게?」 ·
// 「무엇을 할까?」)은 판 위에 안 뜬다 — 글창이 말한다.
//
// `onAim`은 더블에서 겨눈 상대를 HUD가 알아야 할 때를 위한 자리다 — `BattleScreen`이 받아 상대 판에 금 테두리를 준다.
import { useEffect, useState } from 'react'
import type { BattleAction } from '../../engine/battle/choice'
import type { SafariCommand } from '../../engine/battle/safariBattle'
import { MATCH_LABEL, type MoveMatch } from '../../engine/battle/movePreview'
import type { Move, PokeIcons } from '../../data/schema'
import { loadPokeIcons } from '../../data/gameData'
import { fillMenuText } from '../../data/uiText'
import { PIXEL } from '../theme/scale'
import { TypeBadge } from '../common/TypeBadge'
import { monIconAt } from '../menu/pokeIcon'
import { CommandButton, EmptyPlate } from './CommandButton'
import { useListCursor } from './listCursor'
import type { BattleNames } from './messages'
import { ppTone } from './ppTone'
import { MSG } from './romText'
import { romLine } from './romLine'
import { typeColor } from './typeColor'
import * as css from './command.css'

/**
 * 롬에 없는 우리 글 — 명령 칸 밑줄과 바닥 안내.
 *
 * 명령 이름(싸운다·가방…)은 롬 줄이라 설정의 언어를 저절로 따른다. 이 표는 그
 * 밑에 붙는 설명과 안내라 롬에서 못 가져오므로, 설정의 세 언어를 **같은 자리에**
 * 둔다 — 한국어만 적어 두면 언어를 바꿔도 이 줄만 한국어로 남아 한 칸에 두 언어가
 * 섞인다 (`OptionsScreen`의 `our`와 같은 까닭)
 */
export interface Words {
  bagBlocked: string
  partyBlocked: string
  run: string
  runNever: string
  runBlocked: string
  bait: string
  mud: string
  stay: string
  swap: string
  skip: string
  next: string
  pick: string
  back: string
  continue: string
  preparing: string
  leave: string
  /** 더블에서 기술의 목표를 고르는 단의 물음 */
  aim: string
  /** 파티 카드의 「이미 나와 있다」 표시 */
  here: string
  /** 기술 단의 안내 앞쪽 */
  pickMove: string
  /** 가방의 안내 앞쪽 — 주머니를 넘기는 키 */
  pocketKeys: string
  /** 가방 상태 줄 — 볼 · 도망 도구 · 나와 있는 한 마리에게 쓰는 도구 */
  throwBall: string
  escapes: string
  useActive: string
  /** 안내 줄에 붙는 「X 닫기」 */
  close: string
}

/**
 * 명령 메뉴가 지금 어느 단인가. 원작과 같은 두 단이다 —
 * 뿌리에서 무엇을 할지 고르고, 한 단 들어가서 무엇으로 할지 고른다
 */
export type MenuPage = 'root' | 'fight' | 'bag' | 'party'

/**
 * 기술 한 칸이 **고르기 전에** 보여 주는 것 (PARITY §2.22).
 *
 * `type`이 기술표의 값과 다를 수 있다 — 잠재파워가 그렇다. 칸 색과 타입 이름도
 * 이 값을 따라가야 상성 표시와 어긋나지 않는다
 */
export interface MovePreview {
  type: number | null
  match: MoveMatch | null
}

/** 기술 칸이 타입까지 보여주려면 기술표가 필요하다. 이름만으로는 모자란다 */
export interface Extras {
  types: string[]
  /** 특성 설명. 교체 화면이 쓴다 */
  abilityText: string[]
  move(id: number): Move | undefined
  /** 그 모습의 타입 둘. 상성 표시가 본다 (§2.22) */
  typesOf(species: number, form: number): readonly number[] | null
  /**
   * 잊을 수 없는 기술이면 그 까닭(롬 글), 아니면 null — 비전기술이다
   * (`CheckSelectedMoveIsHM` · REPAIR §76)
   */
  hmLock(move: number): string | null
}

/** 「싸운다」 판에 세울 아이콘의 주인 — 지금 명령을 묻는 포켓몬이다 (원작 `NewPokeIconSprite`) */
interface IconMon {
  species: number
  form: number
}

/**
 * 포켓몬 아이콘 한 칸을 정수 2배(64)로 — 더블이면 자리마다 바뀌어서 **누구에게 묻는지가 글자 없이** 보인다.
 * 글자가 0이다 (`aria-hidden`은 부르는 쪽 `lead`가 단다)
 */
function MonIcon({ mon }: { mon: IconMon }) {
  const [icons, setIcons] = useState<PokeIcons | undefined>(undefined)
  useEffect(() => {
    let alive = true
    void loadPokeIcons().then((got) => { if (alive) setIcons(got) }).catch(() => { /* 아이콘 없이도 판은 선다 */ })
    return () => { alive = false }
  }, [])
  return <span style={monIconAt(icons, { ...mon, isEgg: false }, PIXEL.x2)} />
}

/**
 * 원작의 첫 단. 싸운다·가방·포켓몬·도망간다.
 *
 * 이름은 **롬 줄**이다 (배틀 글 뱅크 924~927 · `MSG`). 「싸운다」가 큰 판이고 나머지 셋이 가로 한 줄이다 —
 * 원작도 「싸운다」가 위 2/3를 쓰고 나머지는 바닥 한 줄이다. 이름 밑줄(「기술을 고른다」 따위)은 롬에 없는
 * 우리 글이고 이름과 같은 말이라 뺐다 — **꺼진 칸의 까닭**만 남는다
 */
export function RootMenu(
  { words, lines, canFight, canSwitch, wild, canSpend, icon, onPick, onRun, onBack }: {
    words: Words
    /** 배틀 글 뱅크 (`BATTLE_BANK`) */
    lines: readonly string[]
    canFight: boolean
    canSwitch: boolean
    wild: boolean
    /** 지금 명령을 묻고 있는 마리의 아이콘. 없으면 판에 아이콘이 없다 */
    icon: IconMon | null
    /** 앞 자리로 되돌아간다 (더블 둘째 자리). 없으면 X가 아무 일도 안 한다 */
    onBack: (() => void) | null
    /**
     * 턴을 쓸 수 있는 턴인가. 참기·역린에 묶였거나 앙코르에 걸리면 닫힌다 —
     * 그때 가방과 도망은 **눌러도 아무 일이 없다**(`session.hasIdle`)
     */
    canSpend: boolean
    onPick: (page: MenuPage) => void
    onRun: () => void
  },
) {
  const entries = [
    {
      label: romLine(lines, MSG.fight) ?? '싸운다', pilot: 'fight', size: 'hero' as const,
      tint: css.TINT.fight, on: canFight, go: () => { onPick('fight') },
    },
    {
      label: romLine(lines, MSG.bag) ?? '가방', pilot: 'bag', size: 'row' as const,
      // 까닭은 꺼졌을 때만 말한다 — 켜진 칸의 설명은 이름과 같은 말이다
      sub: canSpend ? undefined : words.bagBlocked,
      tint: css.TINT.bag, on: canSpend, go: () => { onPick('bag') },
    },
    {
      label: romLine(lines, MSG.pokemon) ?? '포켓몬', size: 'row' as const,
      sub: canSwitch ? undefined : words.partyBlocked,
      tint: css.TINT.party, on: canSwitch, go: () => { onPick('party') },
    },
    {
      label: romLine(lines, MSG.run) ?? '도망간다', size: 'row' as const,
      sub: !wild ? words.runNever : canSpend ? undefined : words.runBlocked,
      tint: css.TINT.run, on: wild && canSpend, go: onRun,
    },
  ]
  const cursor = useListCursor(
    entries.length,
    (i) => { if (entries[i]?.on) entries[i].go() },
    onBack ?? undefined,
  )
  const plate = (entry: (typeof entries)[number], i: number) => (
    <CommandButton
      key={entry.label}
      on={i === cursor}
      label={entry.label}
      size={entry.size}
      {...('sub' in entry && entry.sub !== undefined ? { sub: entry.sub } : {})}
      {...(entry.size === 'hero' && icon !== null ? { lead: <MonIcon mon={icon} /> } : {})}
      tint={entry.tint}
      {...('pilot' in entry ? { pilot: entry.pilot } : {})}
      onClick={entry.go}
      disabled={!entry.on}
    />
  )
  return (
    <>
      {plate(entries[0]!, 0)}
      <div className={css.trio}>{entries.slice(1).map((entry, i) => plate(entry, i + 1))}</div>
    </>
  )
}

/**
 * 사파리의 명령 넷 (PARITY §2.19 · `PLAYER_INPUT_SAFARI_*`).
 *
 * 차례가 원작 그대로다 — 볼·미끼·진흙·도망. 원작은 아래 화면에 네 칸을 두고
 * 남은 볼을 그 옆에 적는데, 우리는 한 화면이라 **볼 수를 첫 칸에 붙인다**.
 *
 * ⚠️ **미끼와 진흙이 서로 반대가 아니다.** 미끼는 잡히는 값을 올리면서 도망도
 * 올리고, 진흙은 도망을 내리면서 잡히는 값도 내린다 — 어느 쪽도 공짜가 아니라
 * 그 대가를 칸 밑에 적는다. 그 글이 길어서 여기는 세로 네 판이다(56 × 4 + 6 × 3 = 242, 264 안이다)
 */
export function SafariMenu(
  { balls, onPick, words, lines, stock }: {
    balls: number; onPick: (command: SafariCommand) => void; words: Words
    /** 배틀 글 뱅크 (`BATTLE_BANK`). 칸 이름 넷이 롬 줄이다 (931~933 · 927) */
    lines: readonly string[]
    /**
     * 남은 볼 줄 — 시작 메뉴 뱅크의 「{N}개 남음」 (`START_MENU.ballStock`). 빈칸은
     * 0번 칸이다. 뱅크가 안 왔으면 null
     */
    stock: string | null
  },
) {
  const left = stock !== null ? fillMenuText(stock, [String(balls)]) : `${String(balls)}개 남음`
  // 칸 이름은 롬 줄이다 — 뱅크가 안 왔을 때만 같은 말로 물러선다
  const entries: { label: string; sub: string; tint: string; go: SafariCommand }[] = [
    { label: romLine(lines, MSG.ball) ?? '볼', sub: left, tint: css.TINT.fight, go: 'ball' },
    { label: romLine(lines, MSG.bait) ?? '먹이', sub: words.bait, tint: css.TINT.bag, go: 'bait' },
    { label: romLine(lines, MSG.mud) ?? '진흙', sub: words.mud, tint: css.TINT.party, go: 'mud' },
    // 일반 배틀의 도망 칸과 같은 말이다 — 한쪽만 「이 판을 끝낸다」였다
    { label: romLine(lines, MSG.run) ?? '도망간다', sub: words.run, tint: css.TINT.run, go: 'run' },
  ]
  const cursor = useListCursor(entries.length, (i) => {
    const entry = entries[i]
    // 볼이 0이면 던질 수가 없다. 그래도 칸은 남긴다 — 왜 못 던지는지가 보인다
    if (entry && !(entry.go === 'ball' && balls <= 0)) onPick(entry.go)
  })
  return (
    <>
      {entries.map((entry, i) => (
        <CommandButton
          key={entry.label}
          on={i === cursor}
          label={entry.label}
          sub={entry.sub}
          tint={entry.tint}
          onClick={() => { onPick(entry.go) }}
          disabled={entry.go === 'ball' && balls <= 0}
        />
      ))}
    </>
  )
}

/**
 * 예·아니오 두 칸. 시합규칙 「교체」가 쓴다.
 *
 * 차례는 **예 → 아니오**다 — 필드 대사의 예·아니오, 원작과 같다. 그래도 커서는
 * **「아니오」에서 시작한다** — 원작이 그렇다. 빨리 넘기려고 Z를 연타하는 사람이
 * 뜻하지 않게 교체 화면으로 끌려가지 않는다. X는 「아니오」다 (필드와 같은 손버릇).
 *
 * 물음 글은 안 적는다 — 글창에 롬 줄이 이미 떠 있다
 */
export function YesNo(
  { yes, no, words, onPick }: {
    yes: string; no: string; words: Words; onPick: (yes: boolean) => void
  },
) {
  const entries = [
    { label: yes, sub: words.swap, tint: css.TINT.fight, yes: true },
    { label: no, sub: words.stay, tint: css.TINT.run, yes: false },
  ]
  const cursor = useListCursor(
    entries.length, (i) => { onPick(entries[i]!.yes) }, () => { onPick(false) }, 1,
  )
  return (
    <>
      {entries.map((entry, i) => (
        <CommandButton
          key={entry.label}
          on={i === cursor}
          label={entry.label}
          sub={entry.sub}
          tint={entry.tint}
          onClick={() => { onPick(entry.yes) }}
        />
      ))}
    </>
  )
}

/** 기술 네 칸. 원작처럼 타입과 남은 PP를 같이 보여준다 */
export function MoveMenu(
  { actions, names, extras, lines, onPick, onBack, doubles = false, targetName, previewOf, onAim }: {
    actions: BattleAction[]
    names: BattleNames | null
    extras: Extras | null
    /** 배틀 글 뱅크 — 「돌아간다」(928) · 「PP」(938)가 롬 줄이다 */
    lines: readonly string[]
    onPick: (a: BattleAction) => void
    onBack: () => void
    doubles?: boolean
    /** 대상 번호 → 화면에 쓸 이름 */
    targetName?: (target: number) => string
    /** 그 명령을 고르기 전에 보여 줄 것 */
    previewOf: (a: BattleAction) => MovePreview
    /**
     * 더블에서 **지금 겨눠지는 대상**(커서가 선 후보의 대상 번호, 아니면 null)을 위로 올린다. 체력판이 겨눠진
     * 상대 판에 금 테두리를 두려는 자리다
     */
    onAim?: (target: number | null) => void
  },
) {
  /**
   * 대상을 고르는 중이면 그 기술의 후보들.
   *
   * ⚠️ **기술 목록에는 칸마다 하나만 세운다.** 후보를 그대로 펴면 몸통박치기가
   * 두 줄로 뜬다 — 원작도 기술을 고른 **다음에** 누구에게인지를 묻는다
   */
  const [aiming, setAiming] = useState<BattleAction[] | null>(null)
  // 같은 칸 번호의 후보를 하나로 접는다. 접힌 것이 둘 이상이면 대상을 묻는다
  const groups = new Map<number, BattleAction[]>()
  for (const a of actions) {
    if (a.type !== 'move') continue
    groups.set(a.slot, [...(groups.get(a.slot) ?? []), a])
  }
  const rows = [...groups.values()].map((g) => g[0]!)

  const pick = (row: BattleAction): void => {
    if (row.type !== 'move') return
    const all = groups.get(row.slot) ?? [row]
    if (doubles && all.length > 1) { setAiming(all); return }
    onPick(row)
  }

  const aimCursor = useListCursor(
    aiming?.length ?? 0,
    (i) => { const a = aiming?.[i]; if (a) onPick(a) },
    () => { setAiming(null) },
  )
  // 겨눈 대상을 HUD에 알린다. 대상 고르기를 벗어나면 비운다
  const aimed = aiming?.[aimCursor]
  const aimedTarget = aimed?.type === 'move' ? aimed.target ?? null : null
  useEffect(() => {
    if (!onAim) return
    onAim(aimedTarget)
    return () => { onAim(null) }
  }, [aimedTarget, onAim])
  const back = romLine(lines, MSG.cancel) ?? '돌아간다'
  if (aiming) {
    // 「누구에게?」는 글창이 말한다 — `BattleScreen`이 겨눈 대상이 있을 때 그 줄을 올린다
    return (
      <>
        {aiming.map((a, i) => (
          <CommandButton
            key={a.type === 'move' ? a.target : i}
            on={i === aimCursor}
            label={a.type === 'move' ? targetName?.(a.target ?? 0) ?? '' : ''}
            sub={<MatchLine match={previewOf(a).match} />}
            tint={css.TINT.fight}
            onClick={() => { onPick(a) }}
          />
        ))}
        <button className={css.backStrip} onClick={() => { setAiming(null) }}>{back}</button>
      </>
    )
  }
  return (
    <MoveRows
      rows={rows} names={names} extras={extras} lines={lines} onPick={pick} onBack={onBack}
      // 접힌 줄에는 후보가 하나일 때만 적는다. 여럿이면 자리마다 다르다
      previewOf={(a) => {
        const at = previewOf(a)
        return a.type === 'move' && (groups.get(a.slot)?.length ?? 1) > 1
          ? { type: at.type, match: null } : at
      }}
    />
  )
}

/** 기술 이름 밑 한 줄. 상성이 없으면 자리도 안 잡는다 */
function MatchLine({ match }: { match: MoveMatch | null }) {
  if (match === null) return null
  return <span className={`${css.matchLine} ${css.matchTone[match]}`}>{MATCH_LABEL[match]}</span>
}

/**
 * 기술 칸의 꼬리 — 「PP」 이름표와 `남은/최대`. 글자색은 원작 `GetPPTextColor`의 네 단이다(`ppTone`).
 * **기술 칸만 `n/m` 꼴을 갖는다** — 하네스가 그 꼴로 기술 칸을 센다
 */
export function PpTail({ now, max, label }: { now: number; max: number; label: string }) {
  return (
    <span className={css.tail}>
      <span className={css.ppLabel}>{label}</span>
      <span className={`${css.pp} ${css.ppTone[ppTone(now, max)]}`}>
        <span className={css.ppNow}>{now}</span>
        <span className={css.ppMax}>/{max}</span>
      </span>
    </span>
  )
}

/** 기술 단이 서는 판 수. 빈 칸으로 채워 칸 수가 바뀌어도 판이 오르내리지 않는다 */
const MOVE_SLOTS = 4

function MoveRows(
  { rows: actions, names, extras, lines, onPick, onBack, previewOf }: {
    rows: BattleAction[]
    names: BattleNames | null
    extras: Extras | null
    lines: readonly string[]
    onPick: (a: BattleAction) => void
    onBack: () => void
    previewOf: (a: BattleAction) => MovePreview
  },
) {
  const cursor = useListCursor(actions.length, (i) => {
    const action = actions[i]
    if (action) onPick(action)
  }, onBack)
  const ppLabel = romLine(lines, MSG.pp) ?? 'PP'
  const back = romLine(lines, MSG.cancel) ?? '돌아간다'
  return (
    <>
      {actions.map((action, i) => {
        if (action.type !== 'move') return null
        const label = (action.move !== null ? names?.moves[action.move] : null) ?? action.name
        const { type: typeId, match } = previewOf(action)
        const typeName = typeId !== null ? extras?.types[typeId] : undefined
        // PP를 못 푸는 칸이 있다 — 발버둥이 그렇다. 그때는 꼬리를 비운다
        const hasPp = action.pp !== undefined && action.maxPp !== undefined
        return (
          <CommandButton
            key={`m${action.slot}`}
            on={i === cursor}
            tone="type"
            // 기술 칸의 색은 **타입 색**이다. 색만 보고도 무엇을 고르는지 안다
            {...(typeId !== null ? { tint: typeColor(typeId) } : {})}
            label={label}
            // 타입 이름은 원판의 그림이 말한다 — 밑줄은 상성만 남는다
            sub={match !== null && <MatchLine match={match} />}
            lead={<TypeBadge type={typeId} {...(typeName !== undefined ? { name: typeName } : {})} />}
            tail={hasPp ? <PpTail now={action.pp!} max={action.maxPp!} label={ppLabel} /> : undefined}
            pilot={`move-${String(i)}`}
            onClick={() => { onPick(action) }}
          />
        )
      })}
      {Array.from({ length: Math.max(0, MOVE_SLOTS - actions.length) }, (_, i) => <EmptyPlate key={`e${String(i)}`} />)}
      <button className={css.backStrip} onClick={onBack}>{back}</button>
    </>
  )
}
