// 볼 · 내보내기 · 거두기 · 기절 — BDSP 시퀀스를 그대로 튼다 (BATTLE_FX §4 · PARITY §2.13).
//
// 뷰가 바뀌는 순간을 보고 「무엇을 틀지」를 정해 시퀀스 한 벌씩 세운다(`Cue`). 어떤 시퀀스를 어떤 옵션으로 펴는지는
// `engine/battle/fx/ballPlans`가 쥐고, 박자(`captureTiming`)는 같은 시퀀스에서 잰 상수다 — 글과 연출이 안 어긋난다.
//
//   자리의 마리가 바뀐다     앞 마리가 서 있었으면 `ee610`(거둔다) → `ee400`/`ee406`(볼이 날아와 열리고 몸이 떨어져 착지)
//   한 쪽 두 자리가 같이 선다  (더블 · 태그의 첫 등판) 한 시퀀스로 둘 다 — `ee404`/`ee405`(내 쪽) · `ee401`/`ee402`(상대 쪽)
//   볼을 던졌다(`lastBall`)  `ee101` → `ee102~104` → `ee105`/`ee106~109`를 한 계획으로
//   쓰러졌다(`presence`)    트레이너의 포켓몬 `ee620` · 야생 `ee621`
//
// 몸이 나타나는 · 사라지는 시각은 `stageRefs.ballOpen` · `bodyGone`에 적는다 — 무대의 몸(`BattleStage`의 `Slot`)과
// 소리 · 체력판이 그 시각을 기다린다. 시퀀스를 못 받은 판(옛 묶음)에서도 그 시각은 선다.
import { useEffect, useRef, useState } from 'react'
import { SLOTS, type SlotId } from '../../engine/battle/events'
import { battleClock } from '../../engine/battle/presentationClock'
import type { BattleView } from '../../engine/battle/view'
import {
  faintVanishAt, pairAppearAt, recallSeconds, sendOutAppearAt,
} from '../../engine/battle/captureTiming'
import {
  captureSeqNames, capturePlan, faintSeqName, returnPlan, sendOutHome, sendOutPairPlan, sendOutPairSeqName, sendOutPlan, sendOutSeqName,
} from '../../engine/battle/fx/ballPlans'
import { worldAround, worldPair, type SeqData, type SeqPlan, type V3 } from '../../engine/battle/fx/sequence'
import { ballOpen, bodyGone, clearBallOpen } from './stageRefs'
import { BdspSequence } from './fx/BdspSequence'
import { ballMeta, moveTypeOf } from './fx/ballModel'
import { loadSeq } from './fx/moveSeq'
import { useBattleStore } from '../../state/battleStore'
import { Ball } from '../../engine/battle/meta/capture'
import { recallsBody } from './battleBallMotion'

/** 포획 볼이 몸을 빨아들여 몸이 사라지는 프레임 — `ee101` `PokemonVisible visible=0` f45, 트레이너 몸짓 9프레임을 자른 뒤 */
const CAPTURE_VANISH = 36

/** 쌍으로 나오는 둘째 자리 (`Cue.mate`) */
interface Mate { slot: SlotId; ball: number; species: number }

type Cue =
  | {
    id: number; kind: 'send'; slot: SlotId; ball: number; species: number; started: number; doubles: boolean
    /** 같은 쪽 둘째 자리가 **같이** 나온다 — 한 시퀀스로 둘을 튼다 (`sendOutPairPlan`) */
    mate?: Mate
    /** 한 쪽에 트레이너가 둘이다 (태그 — `ee405` · `ee402`) */
    tag?: boolean
  }
  | { id: number; kind: 'recall'; slot: SlotId; started: number }
  | { id: number; kind: 'capture'; slot: SlotId; ball: number; shakes: number; caught: boolean; started: number }
  | { id: number; kind: 'faint'; slot: SlotId; wild: boolean; started: number }

let nextCueId = 1

/** 무대가 쓰는 시퀀스 — 판이 열리면 미리 받는다 */
const PRELOAD = ['ee101', 'ee102', 'ee103', 'ee104', 'ee105', 'ee106', 'ee107', 'ee108', 'ee109', 'ee400', 'ee406', 'ee401', 'ee402', 'ee404', 'ee405', 'ee610', 'ee620', 'ee621']

export function BattleBallEffects({
  view,
  spotAt,
}: {
  view: BattleView | null
  spotAt: (slot: SlotId) => [number, number]
}) {
  // 야생·사파리는 상대 쪽에 트레이너가 없다 (`state/battleStore`의 `kind`)
  const kind = useBattleStore((s) => s.kind)
  const wildFoe = kind === 'wild' || kind === 'safari'
  const [cues, setCues] = useState<Cue[]>([])
  const activeKeys = useRef<Record<SlotId, string | null> | null>(null)
  /** 자리마다 앞서 본 마리가 **서 있었는가** — 쓰러진 뒤의 교체는 거둘 몸이 없다 */
  const standing = useRef<Record<SlotId, boolean>>({ p1a: false, p1b: false, p2a: false, p2b: false })
  const seenBall = useRef(0)

  useEffect(() => {
    for (const n of PRELOAD) void loadSeq(n)
    void ballMeta()
  }, [])

  useEffect(() => {
    if (!view) {
      activeKeys.current = null
      clearBallOpen()
      return
    }
    const current: Record<SlotId, string | null> = {
      p1a: view.active.p1a?.key ?? null,
      p1b: view.active.p1b?.key ?? null,
      p2a: view.active.p2a?.key ?? null,
      p2b: view.active.p2b?.key ?? null,
    }
    const previous = activeKeys.current
    activeKeys.current = current
    const stood = standing.current
    const now: Record<SlotId, boolean> = {
      p1a: view.active.p1a?.presence === 'alive',
      p1b: view.active.p1b?.presence === 'alive',
      p2a: view.active.p2a?.presence === 'alive',
      p2b: view.active.p2b?.presence === 'alive',
    }
    standing.current = now
    // 볼은 **그 개체가 든 볼**이다 (`RosterEntry.ball`). 명부는 판이 열릴 때 한 번 서므로
    // 값으로 읽는다 — 구독하면 이 효과가 명부 때문에 한 번 더 돈다
    const { roster, partner, foes } = useBattleStore.getState()
    const started = battleClock.now()
    const doubles = current.p1b !== null || current.p2b !== null
    const added: Cue[] = []
    for (const slot of SLOTS) {
      const key = current[slot]
      const was = previous?.[slot] ?? null
      // 쓰러졌다 — 같은 마리가 서 있다가 `down`이 됐다
      if (key !== null && key === was && stood[slot] && !now[slot]) {
        const wild = wildFoe && slot.startsWith('p2')
        added.push({ id: nextCueId++, kind: 'faint', slot, wild, started })
        bodyGone[slot] = { at: started + faintVanishAt(wild), key }
        continue
      }
      if (key === was) continue
      // ⚠️ **거두는 빔은 서 있던 다른 마리에게만 쏜다** (`recallsBody`). 쓰러진 뒤의 교체는
      // 몸이 이미 졌고 원작도 쓰러진 마리를 거두지 않는다. 변신은 열쇠가 같아 여기까지 안 온다
      const recall = recallsBody({ key: was, alive: stood[slot] }, key)
      if (recall && was !== null) {
        added.push({ id: nextCueId++, kind: 'recall', slot, started })
        bodyGone[slot] = { at: started + recallSeconds(), key: was }
      }
      if (!key) continue
      // ⚠️ **야생은 볼에서 안 나온다.** 던질 사람이 없다 — 풀숲에서 튀어나온다
      if (wildFoe && slot.startsWith('p2')) continue
      const begin = started + (recall ? recallSeconds() : 0)
      const mon = view.active[slot]
      added.push({
        id: nextCueId++, kind: 'send', slot, ball: roster[key]?.ball ?? Ball.POKE, species: mon?.species ?? 0,
        started: begin, doubles, tag: slot.startsWith('p1') ? partner !== null : foes.length > 1,
      })
    }
    // 한 쪽 두 자리가 같은 순간(앞 마리 없이)에 서면 한 시퀀스로 묶는다 — BDSP가 두 볼을 같이 던진다 (`ee404` 등)
    for (const side of ['p1', 'p2'] as const) {
      const a = added.find((c) => c.kind === 'send' && c.slot === `${side}a`)
      const b = added.find((c) => c.kind === 'send' && c.slot === `${side}b`)
      if (a?.kind !== 'send' || b?.kind !== 'send' || a.started !== b.started || a.mate) continue
      a.mate = { slot: b.slot, ball: b.ball, species: b.species }
      added.splice(added.indexOf(b), 1)
    }
    // **몸은 볼이 열려 나타나는 프레임까지 기다린다** (`ee400`의 `PokemonIntroMotion`). 안 적으면
    // 포켓몬이 먼저 서 있고 그 뒤에 볼이 날아온다
    for (const c of added) {
      if (c.kind !== 'send') continue
      const side = c.slot.startsWith('p1') ? 'p1' : 'p2'
      ballOpen[c.slot] = c.started + (c.mate ? pairAppearAt(side, false) : sendOutAppearAt())
      if (c.mate) ballOpen[c.mate.slot] = c.started + pairAppearAt(side, true)
    }
    if (added.length > 0) setCues((old) => [...old, ...added].slice(-16))
  }, [view, wildFoe])

  useEffect(() => {
    const event = view?.lastBall
    if (!event || event.seq === seenBall.current) return
    seenBall.current = event.seq
    const started = battleClock.now()
    if (event.caught) {
      const key = view?.active[event.slot]?.key
      if (key) bodyGone[event.slot] = { at: started + CAPTURE_VANISH / 30, key }
    }
    setCues((old) => [...old, {
      id: nextCueId++, kind: 'capture' as const, slot: event.slot, ball: event.ball,
      shakes: event.shakes, caught: event.caught, started,
    }].slice(-16))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 던진 그 순간의 자리만 본다
  }, [view?.lastBall])

  return (
    <group>
      {cues.map((cue) => (
        <CueSequence
          key={cue.id}
          cue={cue}
          spotAt={spotAt}
          opponent={opponentOf(cue.slot, view)}
          onDone={() => { setCues((old) => old.filter((c) => c.id !== cue.id)) }}
        />
      ))}
    </group>
  )
}

/** 맞은편 첫 자리 (서 있는 마리가 있으면) */
function opponentOf(slot: SlotId, view: BattleView | null): SlotId | null {
  const side = slot.startsWith('p1') ? 'p2' : 'p1'
  for (const s of [`${side}a`, `${side}b`] as const) if (view?.active[s]) return s
  return null
}

/** 맞은편 두 자리 */
const OPPOSITE = { p1: ['p2a', 'p2b'] } as const

/** 시퀀스를 받아 계획을 펴고 튼다 */
function CueSequence({ cue, spotAt, opponent, onDone }: {
  cue: Cue
  spotAt: (slot: SlotId) => [number, number]
  opponent: SlotId | null
  onDone: () => void
}) {
  const [plan, setPlan] = useState<SeqPlan | null | undefined>(undefined)
  // 자리는 그 순간 값으로 묶는다 — 연출 도중 상대가 바뀌어도 한 연출은 한 무대다
  // 쌍으로 나오는 내보내기는 역할 0이 첫째 자리 · 1이 둘째 자리다 (`sendOutPairPlan`)
  const roles = useRef<readonly [SlotId | null, SlotId]>(
    cue.kind === 'send' && cue.mate ? [cue.slot, cue.mate.slot] : [opponent, cue.slot],
  )

  useEffect(() => {
    let ok = true
    const side = cue.slot.startsWith('p1') ? 'p1' : 'p2'
    const run = async (): Promise<SeqPlan | null> => {
      const meta = await ballMeta()
      switch (cue.kind) {
        case 'send': {
          if (cue.mate) {
            const pair = await loadSeq(sendOutPairSeqName(side, cue.tag === true))
            if (!pair) return null
            return sendOutPairPlan(pair, {
              side, balls: [cue.ball, cue.mate.ball], meta,
              moveTypes: [await moveTypeOf(cue.species), await moveTypeOf(cue.mate.species)],
            })
          }
          const seq = await loadSeq(sendOutSeqName(side))
          if (!seq) return null
          return sendOutPlan(seq, { side, ball: cue.ball, moveType: await moveTypeOf(cue.species), doubles: cue.doubles, meta })
        }
        case 'capture': {
          const names = captureSeqNames(cue.shakes, cue.caught)
          const got = await Promise.all(names.map((n) => loadSeq(n)))
          const seqs: Record<string, SeqData> = {}
          names.forEach((n, i) => { const s = got[i]; if (s) seqs[n] = s })
          return capturePlan(seqs, { ball: cue.ball, shakes: cue.shakes, caught: cue.caught, meta })?.plan ?? null
        }
        case 'recall': {
          const seq = await loadSeq('ee610')
          return seq ? returnPlan(seq, { mine: side === 'p1', camera: false }) : null
        }
        case 'faint': {
          const seq = await loadSeq(faintSeqName(cue.wild))
          return seq ? returnPlan(seq, { mine: side === 'p1', camera: true }) : null
        }
      }
    }
    void run().then((p) => { if (ok) setPlan(p) }, () => { if (ok) setPlan(null) })
    return () => { ok = false }
  }, [cue])

  useEffect(() => {
    // 시퀀스가 없는 판 — 몸의 시각(`ballOpen` · `bodyGone`)만 서고 연출은 없다
    if (plan === null) onDone()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan])

  if (!plan) return null
  const [x, z] = spotAt(cue.slot)
  const home: V3 = [x, 0, z]
  const side = cue.slot.startsWith('p1') ? 'p1' : 'p2'
  const pair = cue.kind === 'send' && cue.mate ? cue.mate : null
  return (
    <BdspSequence
      plan={plan}
      roles={roles.current}
      spotAt={spotAt as (slot: string) => [number, number]}
      startedAt={cue.started}
      vanish
      // 맞은편 몸은 내 쪽 내보내기 카메라가 그 몸 너머를 볼 때 감추는 것만 받는다(`sendOutPlan`) — 다른 시퀀스는 이 몸만 쥔다
      bodies={[pair !== null || (cue.kind === 'send' && !cue.doubles && side === 'p1'), true]}
      // 쌍으로 나올 때 맞은편 둘은 카메라가 그 사이를 지나는 동안 감춘다 (`sendOutPairPlan`)
      away={pair && side === 'p1' ? [...OPPOSITE.p1] : undefined}
      ball={cue.kind === 'send' || cue.kind === 'capture' ? cue.ball : undefined}
      // 내보내기는 BDSP 무대 좌표(내 쪽 0/0/250)로, 그 밖은 그 몸 발밑 기준으로 적혀 있다 (`worldAround`).
      // 쌍은 두 발판 사이로 옮긴다 — 볼이 몸 위에서 열리고 카메라는 두 마리 가운데를 본다 (`worldPair`)
      world={pair
        ? worldPair(spotAt(cue.slot), spotAt(pair.slot), side === 'p1' ? -250 : 250, side === 'p1' ? 250 : -250)
        : worldAround(home, cue.kind === 'send' ? sendOutHome(side) : [0, 0, 0])}
      // 거두기는 교체 한가운데라 고정 카메라로 · 혼자 나오는 더블 내보내기는(`sendOutPlan`) 계획이 카메라를 안 싣는다
      camera={cue.kind !== 'recall'}
      hideOthers={cue.kind === 'capture' || cue.kind === 'faint'}
      others={SLOTS}
      minScale={1}
      onDone={onDone}
    />
  )
}
