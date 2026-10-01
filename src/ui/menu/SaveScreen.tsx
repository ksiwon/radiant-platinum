// 리포트 — 지금까지의 활약을 기록한다.
//
// 원작의 흐름을 그대로 따른다: 요약창을 띄우고 → "작성할까요?" → 이미 있으면
// "덮어써도 괜찮습니까?" → "작성하고 있습니다" → "{이름}는 리포트를 꼼꼼히
// 기록했다!". 물음도 대답도 전부 롬에서 나온 글이다.
//
// **여기가 디스크로 나가는 유일한 문이다.** 걸어다니는 동안에는 아무것도
// 안 남는다 (`state/saveStore.ts` 머리말).
import { useEffect, useState } from 'react'
import { fillMenuText, loadUiText, SAVE_TEXT, UI_BANK, YES_NO } from '../../data/uiText'
import { loadDialogueBank } from '../../data/gameData'
import { world } from '../../engine/map/world'
import { fieldScripts } from '../../engine/script/field'
import { useMenuStore } from '../../state/menuStore'
import { useGameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { avatarState, worldState } from '../../state/worldState'
import { vars } from '../theme/contract.css'
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
type Backup = { started: boolean } | null

/**
 * 지금 키가 하는 일.
 *
 * - `answer` — 「작성할까요?」·「덮어써도 괜찮습니까?」의 예/아니오
 * - `retry` — 다 썼는데 백업 다운로드가 막혔다. 「백업 파일 받기 / 닫기」를 고른다
 * - `close` — 다 썼거나 못 썼다. 결정 키로 닫는다
 * - `wait` — 쓰는 중. 아무 키도 안 먹는다
 *
 * ⚠️ **`retry`는 커서로 고른다.** 한때 「백업 파일 받기」가 맨 `<button>`뿐이었다.
 * `useMenuKeys`가 Enter·Space·Z를 먼저 가로채므로 Tab으로 단추에 가도 키로는 못
 * 눌렀고, 결정 키는 창을 닫아 버렸다 — 마우스로만 다시 받을 수 있었다
 */
type SaveKeys = 'answer' | 'retry' | 'close' | 'wait'

export function saveKeys(phase: Phase, backup: Backup): SaveKeys {
  if (phase === 'ask' || phase === 'overwrite') return 'answer'
  if (phase === 'writing') return 'wait'
  if (phase === 'done' && backup && !backup.started) return 'retry'
  return 'close'
}

/**
 * 아래 안내 줄. **그 자리에서 실제로 먹는 키만** 적는다 — 다 쓴 뒤에는 X가 아무것도
 * 안 하므로 「X 그만둔다」를 안 띄운다
 */
export const SAVE_HINT: Record<SaveKeys, string> = {
  answer: '←→ 고르기 · Z 결정 · X 그만둔다',
  retry: '←→ 고르기 · Z 결정',
  close: 'Z 닫기',
  wait: '',
}

/** 키가 부르는 일 — 화면이 넘겨준다 */
interface SaveActs {
  setYes: (yes: boolean) => void
  /** 리포트를 쓴다 */
  write: () => void
  /** 시작 메뉴로 물러난다 */
  back: () => void
  /** 막힌 백업 파일을 다시 받는다 */
  retryBackup: () => void
  closeAll: () => void
}

/**
 * 리포트 화면의 키.
 *
 * ⚠️ **가로로 놓였어도 ↑↓도 받는다.** 필드 예/아니오는 ↑↓로 고르므로(`field`의
 * `chooseFromMenu`) 그 손버릇이 여기서 죽으면 안 된다. 커서는 실제로 옮겨졌을
 * 때만 `true`를 내서 운다 (`useMenuKeys`의 `Handler`)
 */
export function saveMenuKeys(keys: SaveKeys, yes: boolean, act: SaveActs): Parameters<typeof useMenuKeys>[0] {
  const choosing = keys === 'answer' || keys === 'retry'
  const toYes = (): boolean => { if (!choosing || yes) return false; act.setYes(true); return true }
  const toNo = (): boolean => { if (!choosing || !yes) return false; act.setYes(false); return true }
  return {
    up: toYes,
    down: toNo,
    left: toYes,
    right: toNo,
    confirm: () => {
      if (keys === 'answer') { if (yes) act.write(); else act.back(); return }
      // 키 누름도 사용자 동작이라 다운로드가 다시 통과하는 일이 많다
      if (keys === 'retry') { if (yes) act.retryBackup(); else act.closeAll(); return }
      if (keys === 'close') { act.closeAll(); return }
      return false
    },
    // 다 쓴 뒤에는 X가 아무것도 안 한다 — 안내에도 안 적는다
    cancel: () => { if (keys !== 'answer') return false; act.back() },
  }
}

/**
 * 못 썼을 때의 대사 — 롬의 「리포트 작성에 실패했습니다」 한 줄이다
 * (전당 화면 `HallOfFameScreen`과 같은 줄).
 *
 * ⚠️ **원인 문장(`report`의 `why`)은 여기 안 붙인다.** '스키마', '임시 슬롯' 같은
 * 개발 말이라 대사창에 섞이면 안 읽힌다. 제보용으로 부른 쪽이 `console.warn`에 남긴다
 */
export function failedLine(common: readonly string[]): string {
  return common[SAVE_TEXT.failed] ?? ''
}

/**
 * 리포트 아래 백업 줄의 글.
 *
 * ⚠️ **파일 이름을 안 적는다.** 한때 「백업 파일도 받았다 — radiant-platinum_플래티넘_…rpsave」
 * 처럼 저장소 이름·밑줄·확장자가 대사 아래에 그대로 찍혔다. 받은 파일은 브라우저가
 * 내려받기 목록에 이미 보여 주고, 여기서 알릴 것은 받았는지 막혔는지 하나다
 */
export function backupLine(backup: NonNullable<Backup>): string {
  return backup.started
    ? '백업 파일도 받았다'
    : '브라우저가 백업 파일 다운로드를 막았다. 리포트는 남아 있다'
}

export function SaveScreen() {
  const [common, setCommon] = useState<string[]>([])
  /** 예·아니오. 리포트 뱅크가 아니라 메뉴 뱅크에 있다 (`YES_NO`) */
  const [entries, setEntries] = useState<string[]>([])
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
  const [backup, setBackup] = useState<Backup>(null)
  const [yes, setYes] = useState(true)
  const back = useMenuStore((s) => s.back)
  const closeAll = useMenuStore((s) => s.closeAll)
  const save = useSaveStore()
  // 설정의 언어. 바뀌면 글을 그 언어로 다시 받는다
  const locale = useGameLocale()

  useEffect(() => {
    let alive = true
    void Promise.all([
      loadUiText('saveInfo', locale), loadDialogueBank(locale, UI_BANK.common),
      loadUiText('menuEntries', locale),
    ])
      .then(([, strings, menu]) => { if (alive) { setCommon(strings); setEntries(menu) } })
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
        // 깨어진 세계는 격자에 높이가 없다 (`state/save/schema`의 `position.y`)
        y: p.y,
        avatar: avatarState(),
      })
      .then((got) => {
        setBackup({ started: got.backup.started })
        // 막혔으면 커서는 「백업 파일 받기」에서 시작한다
        if (got.saved) { setYes(true); setPhase('done'); return }
        console.warn('[report] 리포트를 쓰지 못했다', got.why)
        setPhase('failed')
      })
      .catch((e: unknown) => {
        console.warn('[report] 리포트를 쓰지 못했다', e)
        setPhase('failed')
      })
  }

  /** 다운로드가 막혔을 때. 사용자 클릭 안에서 다시 부르면 통과하는 일이 많다 */
  const retryBackup = (): void => {
    void useSaveStore.getState().exportReport().then((got) => {
      if (got.kind === 'none') return
      setBackup({ started: got.outcome.started })
    })
  }

  const keys = saveKeys(phase, backup)
  useMenuKeys(saveMenuKeys(keys, yes, { setYes, write, back, retryBackup, closeAll }))

  const line = phase === 'overwrite' ? common[SAVE_TEXT.overwrite]
    : phase === 'writing' ? common[SAVE_TEXT.writing]
      : phase === 'failed' ? failedLine(common)
        : phase === 'done' ? fillMenuText(common[SAVE_TEXT.done] ?? '', [save.trainer.name])
          : common[SAVE_TEXT.ask]

  return (
    <div className={css.overlay}>
      <div className={own.center}>
        <SaveInfo />

        <div className={own.prompt}>{line}</div>

        {keys === 'answer' && (
          <div className={own.choices}>
            <span className={yes ? own.choiceOn : own.choice}>{entries[YES_NO.yes] ?? '예'}</span>
            <span className={yes ? own.choice : own.choiceOn}>{entries[YES_NO.no] ?? '아니오'}</span>
          </div>
        )}

        {/*
          ⚠️ **두 줄이다.** 브라우저 저장소는 사용자가 모르는 사이에 비워지므로
          매 리포트마다 파일도 한 벌 내보낸다. 다운로드가 막히는 것은 흔한 일이고,
          그때 리포트까지 실패한 것처럼 보이면 안 된다 (IMPORT.md §10)
        */}
        {backup && phase === 'done' && (
          <div
            className={own.backup}
            // 이모지 대신 경고색이다 — OS 이모지는 창 글꼴과 색이 튄다
            style={backup.started ? undefined : { color: vars.state.bad, fontWeight: 700 }}
          >
            {backupLine(backup)}
          </div>
        )}

        {/* 마우스로도 누른다. 클릭도 사용자 동작이라 다운로드가 통과한다 */}
        {keys === 'retry' && (
          <div className={own.choices}>
            <span className={yes ? own.choiceOn : own.choice} onClick={retryBackup}>백업 파일 받기</span>
            <span className={yes ? own.choice : own.choiceOn} onClick={closeAll}>닫기</span>
          </div>
        )}
      </div>
      {/* 창 없이 어두운 덮개 위에 바로 선다 — 밝은 창용 `css.hint`는 여기서 안 읽힌다 */}
      <div className={own.hint}>{SAVE_HINT[keys]}</div>
    </div>
  )
}

