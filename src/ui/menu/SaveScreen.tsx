// 리포트 — 지금까지의 활약을 기록한다.
//
// 원작의 흐름을 그대로 따른다: 요약창을 띄우고 → "작성할까요?" → 이미 있으면
// "덮어써도 괜찮습니까?" → "작성하고 있습니다" → "{이름}는 리포트를 꼼꼼히
// 기록했다!". 물음도 대답도 전부 롬에서 나온 글이다.
//
// **여기가 디스크로 나가는 유일한 문이다.** 걸어다니는 동안에는 아무것도
// 안 남는다 (`state/saveStore.ts` 머리말).
import { useEffect, useState } from 'react'
import { fillMenuText, loadUiText, SAVE_INFO, SAVE_TEXT, UI_BANK } from '../../data/uiText'
import { loadDialogueBank } from '../../data/gameData'
import { world } from '../../engine/map/world'
import { fieldScripts } from '../../engine/script/field'
import { useMenuStore } from '../../state/menuStore'
import { dexHas, useSaveStore } from '../../state/saveStore'
import { worldState } from '../../state/worldState'
import { useMenuKeys } from './useMenuKeys'
import * as css from './menuChrome.css'
import * as own from './dialog.css'

/** 전국도감 493종. 잡은 수를 세는 범위다 */
const DEX_MAX = 493
/** 배지 8개 */
const BADGES = 8

type Phase = 'ask' | 'overwrite' | 'writing' | 'done' | 'failed'

export function SaveScreen() {
  const [labels, setLabels] = useState<string[]>([])
  const [common, setCommon] = useState<string[]>([])
  const [phase, setPhase] = useState<Phase>('ask')
  const [yes, setYes] = useState(true)
  const back = useMenuStore((s) => s.back)
  const closeAll = useMenuStore((s) => s.closeAll)
  const save = useSaveStore()

  useEffect(() => {
    let alive = true
    void Promise.all([loadUiText('saveInfo'), loadDialogueBank('ko', UI_BANK.common)])
      .then(([info, strings]) => {
        if (!alive) return
        setLabels(info)
        setCommon(strings)
        // 이미 리포트가 있으면 덮어쓸지부터 묻는다
        setPhase(useSaveStore.getState().loaded ? 'overwrite' : 'ask')
      })
      .catch(() => { /* 글을 못 받아도 기록은 된다 */ })
    return () => { alive = false }
  }, [])

  const caught = countDex(save.pokedex.caught)
  const badges = countBits(save.badges, BADGES)

  const write = (): void => {
    setPhase('writing')
    // 스크립트가 세운 플래그를 먼저 스토어로 끌어온다. 안 그러면 방금 만난
    // NPC의 상태가 리포트에 안 들어간다
    save.commitScriptState(fieldScripts.vars.saved, fieldScripts.vars.flags)
    const p = worldState.player.position
    void useSaveStore.getState()
      .report({
        map: world.mapId,
        matrix: world.matrix,
        x: p.x,
        z: p.z,
        facing: worldState.player.facing,
      })
      .then(() => { setPhase('done') })
      .catch(() => { setPhase('failed') })
  }

  const asking = phase === 'ask' || phase === 'overwrite'
  useMenuKeys({
    left: () => { setYes(true) },
    right: () => { setYes(false) },
    confirm: () => {
      if (asking) { if (yes) write(); else back(); return }
      if (phase === 'done' || phase === 'failed') closeAll()
    },
    cancel: () => { if (asking) back() },
  })

  const line = phase === 'overwrite' ? common[SAVE_TEXT.overwrite]
    : phase === 'writing' ? common[SAVE_TEXT.writing]
      : phase === 'failed' ? '리포트를 쓰지 못했다'
        : phase === 'done' ? fillMenuText(common[SAVE_TEXT.done] ?? '', [save.trainer.name])
          : common[SAVE_TEXT.ask]

  return (
    <div className={css.overlay}>
      <div className={own.center}>
        <dl className={own.info}>
          <dt>{labels[SAVE_INFO.player] ?? '주인공'}</dt>
          <dd>{save.trainer.name || '이름 없음'}</dd>
          <dt>{labels[SAVE_INFO.badges] ?? '가진 배지'}</dt>
          <dd>{badges}개</dd>
          <dt>{labels[SAVE_INFO.pokedex] ?? '포켓몬 도감'}</dt>
          <dd>{caught}마리</dd>
          <dt>{labels[SAVE_INFO.playtime] ?? '플레이 시간'}</dt>
          <dd>{clock(save.trainer.playtimeMs)}</dd>
        </dl>

        <div className={own.prompt}>{line}</div>

        {asking && (
          <div className={own.choices}>
            <span className={yes ? own.choiceOn : own.choice}>{common[82] ?? '예'}</span>
            <span className={yes ? own.choice : own.choiceOn}>{common[83] ?? '아니오'}</span>
          </div>
        )}
      </div>
      <div className={css.foot}>←→ 고르기 · Z 결정 · X 그만둔다</div>
    </div>
  )
}

/** `HH:MM`. 원작 요약창도 시·분까지만 보여준다 */
function clock(ms: number): string {
  const minutes = Math.floor(ms / 60000)
  return `${String(Math.floor(minutes / 60))}:${String(minutes % 60).padStart(2, '0')}`
}

function countDex(field: Uint8Array): number {
  let n = 0
  for (let i = 1; i <= DEX_MAX; i++) if (dexHas(field, i)) n++
  return n
}

function countBits(mask: number, upTo: number): number {
  let n = 0
  for (let i = 0; i < upTo; i++) if (mask & (1 << i)) n++
  return n
}
