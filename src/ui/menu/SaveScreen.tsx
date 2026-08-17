// 리포트 — 지금까지의 활약을 기록한다.
//
// 원작의 흐름을 그대로 따른다: 요약창을 띄우고 → "작성할까요?" → 이미 있으면
// "덮어써도 괜찮습니까?" → "작성하고 있습니다" → "{이름}는 리포트를 꼼꼼히
// 기록했다!". 물음도 대답도 전부 롬에서 나온 글이다.
//
// **여기가 디스크로 나가는 유일한 문이다.** 걸어다니는 동안에는 아무것도
// 안 남는다 (`state/saveStore.ts` 머리말).
import { useEffect, useState } from 'react'
import { fillMenuText, loadUiText, SAVE_TEXT, UI_BANK } from '../../data/uiText'
import { loadDialogueBank } from '../../data/gameData'
import { world } from '../../engine/map/world'
import { fieldScripts } from '../../engine/script/field'
import { useMenuStore } from '../../state/menuStore'
import { useGameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { worldState } from '../../state/worldState'
import { useMenuKeys } from './useMenuKeys'
import { SaveInfo } from './SaveInfo'
import * as css from './menuChrome.css'
import * as own from './dialog.css'

type Phase = 'ask' | 'overwrite' | 'writing' | 'done' | 'failed'

/**
 * 파일 백업 상태 — **내부 저장과 따로다** (IMPORT.md §10).
 *
 * ⚠️ 둘을 하나로 묶으면 브라우저가 반복 다운로드를 막았을 때 "리포트를 쓰지
 * 못했다"가 뜬다. 사실은 써졌다. 그래서 두 줄로 나눠 보여 주고, 못 받았으면
 * 그 자리에 "백업 파일 받기"를 남긴다
 */
type Backup = { started: boolean; fileName: string } | null

export function SaveScreen() {
  const [common, setCommon] = useState<string[]>([])
  /**
   * 이미 리포트가 있으면 덮어쓸지부터 묻는다.
   *
   * ⚠️ **물음은 열 때 정해진다.** 한때 이것을 글 받는 `then` 안에서 정했다.
   * 그런데 대사 뱅크는 설치본에서 꺼내느라 늦게 오고, 그 사이에 사람은 이미
   * 답할 수 있다. 그러면 다 쓰고 난 **뒤에** 늦게 온 `then`이 화면을 물음으로
   * 되돌렸다 — 리포트는 남았는데 「꼼꼼히 기록했다!」가 사라지고 「덮어써도
   * 괜찮습니까?」가 다시 떴다. 실측으로 ㉕가 여기서 60초를 섰다.
   * `loaded`는 스토어에서 바로 읽히므로 기다릴 이유가 없다
   */
  const [phase, setPhase] = useState<Phase>(
    () => (useSaveStore.getState().loaded ? 'overwrite' : 'ask'),
  )
  const [failure, setFailure] = useState<string | null>(null)
  const [backup, setBackup] = useState<Backup>(null)
  const [yes, setYes] = useState(true)
  const back = useMenuStore((s) => s.back)
  const closeAll = useMenuStore((s) => s.closeAll)
  const save = useSaveStore()
  // 설정의 언어. 바뀌면 글을 그 언어로 다시 받는다
  const locale = useGameLocale()

  useEffect(() => {
    let alive = true
    void Promise.all([loadUiText('saveInfo', locale), loadDialogueBank(locale, UI_BANK.common)])
      .then(([, strings]) => { if (alive) setCommon(strings) })
      .catch(() => { /* 글을 못 받아도 기록은 된다 */ })
    return () => { alive = false }
  }, [locale])

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
      .then((got) => {
        setBackup({ started: got.backup.started, fileName: got.fileName })
        if (got.saved) { setPhase('done'); return }
        setFailure(got.why ?? null)
        setPhase('failed')
      })
      .catch((e: unknown) => {
        setFailure(e instanceof Error ? e.message : String(e))
        setPhase('failed')
      })
  }

  /** 다운로드가 막혔을 때. 사용자 클릭 안에서 다시 부르면 통과하는 일이 많다 */
  const retryBackup = (): void => {
    void useSaveStore.getState().exportReport().then((got) => {
      if (got.kind === 'none') return
      setBackup({ started: got.outcome.started, fileName: got.fileName })
    })
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
      : phase === 'failed' ? `리포트를 쓰지 못했다${failure === null ? '' : `\n${failure}`}`
        : phase === 'done' ? fillMenuText(common[SAVE_TEXT.done] ?? '', [save.trainer.name])
          : common[SAVE_TEXT.ask]

  return (
    <div className={css.overlay}>
      <div className={own.center}>
        <SaveInfo />

        <div className={own.prompt}>{line}</div>

        {asking && (
          <div className={own.choices}>
            <span className={yes ? own.choiceOn : own.choice}>{common[82] ?? '예'}</span>
            <span className={yes ? own.choice : own.choiceOn}>{common[83] ?? '아니오'}</span>
          </div>
        )}

        {/*
          ⚠️ **두 줄이다.** 브라우저 저장소는 사용자가 모르는 사이에 비워지므로
          매 리포트마다 파일도 한 벌 내보낸다. 다운로드가 막히는 것은 흔한 일이고,
          그때 리포트까지 실패한 것처럼 보이면 안 된다 (IMPORT.md §10)
        */}
        {backup && phase === 'done' && (
          <div className={own.backup}>
            {backup.started
              ? `백업 파일도 받았다 — ${backup.fileName}`
              : '⚠️ 브라우저가 백업 파일 다운로드를 막았다. 리포트는 남아 있다'}
            {!backup.started && (
              <button className={own.backupButton} onClick={retryBackup}>백업 파일 받기</button>
            )}
          </div>
        )}
      </div>
      <div className={css.hint}>←→ 고르기 · Z 결정 · X 그만둔다</div>
    </div>
  )
}

