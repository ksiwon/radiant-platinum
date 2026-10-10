// 리포트 — 지금까지의 활약을 기록한다.
//
// 원작의 흐름을 그대로 따른다: 요약창을 띄우고 → "작성할까요?" → 이미 있으면
// "덮어써도 괜찮습니까?" → "작성하고 있습니다" → "{이름}는 리포트를 꼼꼼히
// 기록했다!". 물음도 대답도 전부 롬에서 나온 글이다.
//
// **여기가 디스크로 나가는 유일한 문이다.** 걸어다니는 동안에는 아무것도
// 안 남는다 (`state/saveStore.ts` 머리말).
import { useEffect, useRef, useState } from 'react'
import { fillMenuText, loadUiText, SAVE_TEXT, UI_BANK, YES_NO } from '../../data/uiText'
import { loadDialogueBank } from '../../data/gameData'
import { world } from '../../engine/map/world'
import { fieldScripts } from '../../engine/script/field'
import { useMenuStore } from '../../state/menuStore'
import { useGameLocale } from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { avatarState, worldState } from '../../state/worldState'
import { KeyHints } from '../common/KeyHints'
import { MessageWindow } from '../common/MessageWindow'
import { bandAt } from '../common/pickBand'
import { pointerMoved } from '../pointerMoved'
import { pickBand } from '../theme/window.css'
import { useMenuKeys } from './useMenuKeys'
import { SaveInfo } from './SaveInfo'
import * as pop from '../common/choiceMenu.css'
import * as own from './saveScreen.css'

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

/**
 * 쓰는 중 글 — 처음 쓰는 판(`SAVE_TYPE_NO_DATA_EXISTS`)은 21번 「리포트에 많은 내용을 기록 중입니다」,
 * 이미 리포트가 있는 판(평소 quick 저장)은 15번 「작성하고 있습니다」다 (`CommonScript_TrySaveGame`).
 * `loaded`는 이 판이 리포트를 불러온 것인가(`saveStore.loaded`)
 */
export function writingLine(common: readonly string[], loaded: boolean): string {
  return (loaded ? common[SAVE_TEXT.writing] : common[SAVE_TEXT.writingFull]) ?? ''
}

/**
 * 다 썼다는 소리를 내는가 — **쓰기가 끝나 `done`으로 들어서는 그 한 번**뿐이다 (`PlaySE SEQ_SE_DP_SAVE`).
 * 실패(`failed`)는 소리가 없고, 같은 단계에서 다시 그려져도 다시 내지 않는다
 */
export function savedChime(prev: Phase | null, next: Phase): boolean {
  return next === 'done' && prev !== 'done'
}

/**
 * 예/아니오 창 — `YesNo`와 같은 살갗이지만 **키를 안 가진다.** 이 화면의 키는 `saveMenuKeys` 하나가 쥔다
 * (←→와 ↑↓ 둘 다 받고, 다 쓴 뒤에는 「백업 파일 받기 / 닫기」를 같은 창에서 고른다). `YesNo`는 제 키를 가져서
 * 같이 쓰면 Z 한 번이 두 번 먹는다 — 공용에 「키 없는 꼴」이 생기면 그쪽으로 바꾼다
 */
function ReportChoices(
  { labels, label, yes, onPick, onHover }: {
    labels: readonly [string, string]
    /** 읽어 주는 이름 */
    label: string
    yes: boolean
    onPick: (first: boolean) => void
    onHover: (first: boolean) => void
  },
) {
  return (
    <div className={`${pop.root} ${own.choices}`} role="radiogroup" aria-label={label}>
      <div className={`${pop.list} ${own.choiceList}`}>
        <span className={pickBand.y} aria-hidden style={bandAt('y', yes ? 0 : 1)}>
          <span className={pop.caret} />
        </span>
        {labels.map((text, i) => (
          <div
            key={i}
            className={(i === 0) === yes ? `${pop.item} ${pop.itemOn}` : pop.item}
            role="radio"
            aria-checked={(i === 0) === yes}
            onPointerMove={(e) => { if (pointerMoved(e)) onHover(i === 0) }}
            onClick={() => { onPick(i === 0) }}
          >
            {text}
          </div>
        ))}
      </div>
    </div>
  )
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
  /** 쓰기를 **시작할 때** 리포트를 불러온 판이었나 — 쓰는 중 글(15 · 21번)을 고른다. 쓰고 나면 `loaded`가 참이 되므로 그때 값을 쥔다 */
  const [loadedAtStart, setLoadedAtStart] = useState(() => useSaveStore.getState().loaded)
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
    setLoadedAtStart(useSaveStore.getState().loaded)
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

  // 다 쓴 순간에 소리 한 번 — `SEQ_SE_DP_SAVE`. 소리 뭉치는 첫 화면 밖이라 그때 연다 (`engine/audio/lazy`)
  const seen = useRef<Phase | null>(null)
  useEffect(() => {
    const prev = seen.current
    seen.current = phase
    if (!savedChime(prev, phase)) return
    void Promise.all([import('../../engine/audio/music'), import('../../engine/audio/sfx')])
      .then(([m, s]) => m.music.playEffect(s.SFX.SAVE))
      .catch(() => { /* 소리는 필수가 아니다 */ })
  }, [phase])

  const line = phase === 'overwrite' ? common[SAVE_TEXT.overwrite]
    : phase === 'writing' ? writingLine(common, loadedAtStart)
      : phase === 'failed' ? failedLine(common)
        : phase === 'done' ? fillMenuText(common[SAVE_TEXT.done] ?? '', [save.trainer.name])
          : common[SAVE_TEXT.ask]

  const hint = SAVE_HINT[keys]

  return (
    <div className={own.root}>
      <div className={own.stage}>
        <SaveInfo state={phase === 'writing' ? 'writing' : phase === 'done' ? 'done' : 'idle'} />

        {/*
          ⚠️ **두 줄이다.** 브라우저 저장소는 사용자가 모르는 사이에 비워지므로 매 리포트마다 파일도 한 벌 내보낸다.
          다운로드가 막히는 것은 흔한 일이고, 그때 리포트까지 실패한 것처럼 보이면 안 된다 (IMPORT.md §10) —
          그래서 백업 줄은 대사와 따로, 대사창 왼쪽 위에 선다
        */}
        {backup && phase === 'done' && (
          <div className={backup.started ? own.backup : `${own.backup} ${own.backupBad}`}>
            {backupLine(backup)}
          </div>
        )}

        {keys === 'answer' && (
          <ReportChoices
            label="예 아니오"
            labels={[entries[YES_NO.yes] ?? '예', entries[YES_NO.no] ?? '아니오']}
            yes={yes}
            onHover={setYes}
            onPick={(first) => { if (first) write(); else back() }}
          />
        )}
        {/* 마우스로도 누른다. 클릭도 사용자 동작이라 다운로드가 통과한다 */}
        {keys === 'retry' && (
          <ReportChoices
            label="백업"
            labels={['백업 파일 받기', '닫기']}
            yes={yes}
            onHover={setYes}
            onPick={(first) => { if (first) retryBackup(); else closeAll() }}
          />
        )}

        <div className={own.messageBar}>
          <MessageWindow lines={line ?? ''} {...(phase === 'writing' ? { dial: true } : {})} />
        </div>

        {hint !== '' && <div className={own.hint}><KeyHints text={hint} /></div>}
      </div>
    </div>
  )
}
