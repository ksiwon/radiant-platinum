// 설정 — 원작의 여섯 항목.
//
// 항목도 값도 `options_menu` 뱅크(us#220)에서 그대로 온다. 우리가 이름을 새로
// 짓지 않는다.
//
// 실제로 먹는 것은 **이야기의 속도**(대사창 인쇄기), **배틀 진행**, **시점**이다.
// 배틀 애니메이션·시합 룰·사운드는 아직 걸 데가 없어서 값만 남는다 — 있는 척하지
// 않고 흐리게 그린다.
//
// 아래 세 줄은 원작에 없다. **배틀 진행**은 원작이 느리다고 오래 비판받은 대목을
// 우리가 손댈 수 있게 연 자리고(원작 길이는 `playback.ts`에 그대로 있다),
// 시점 전환은 3D로 옮기면서 생겼고, "처음부터"는 원작이 타이틀에서
// 위+SELECT+B로 하는 것을 여기로 옮긴 것이다.
import { useEffect, useState } from 'react'
import { loadUiText, OPTIONS_TEXT } from '../../data/uiText'
import { useMenuStore } from '../../state/menuStore'
import {
  useOptionsStore, type BattlePace, type BattleRule, type BattleScene, type Options,
  type SoundMode, type TextSpeed, type ViewMode,
} from '../../state/optionsStore'
import { useSaveStore } from '../../state/saveStore'
import { clampCursor, useMenuKeys, wrapCursor } from './useMenuKeys'
import * as css from './menuChrome.css'
import * as own from './dialog.css'

interface Row {
  key: keyof Options | 'reset'
  label: string
  /** 고를 수 있는 값의 글. 'reset'은 값이 없다 */
  values: string[]
  at: number
  help: string
  /** 값은 남지만 아직 아무 데도 안 걸린 항목 */
  inert?: boolean
  /** 원작에 없는 항목 */
  ours?: boolean
}

export function OptionsScreen() {
  const [text, setText] = useState<string[]>([])
  const [cursor, setCursor] = useState(0)
  const [confirming, setConfirming] = useState(false)
  const back = useMenuStore((s) => s.back)
  const closeAll = useMenuStore((s) => s.closeAll)
  const options = useOptionsStore()
  const resetSave = useSaveStore((s) => s.resetSave)

  useEffect(() => {
    let alive = true
    void loadUiText('options').then((bank) => { if (alive) setText(bank) }).catch(() => { /* 빈 설정 */ })
    return () => { alive = false }
  }, [])

  const at = (i: number): string => text[i] ?? ''
  const pick = (list: readonly number[]): string[] => list.map(at)

  const rows: Row[] = [
    {
      key: 'speed', label: at(OPTIONS_TEXT.labels.speed),
      // 앞 셋은 원작 글이고 "즉시"는 우리가 연 자리다. 값은 원작의
      // `TEXT_SPEED_INSTANT`라 새로 지어낸 속도는 아니다
      values: [...pick(OPTIONS_TEXT.speed), '즉시'], at: options.speed,
      help: at(OPTIONS_TEXT.help.speed),
    },
    {
      key: 'battleScene', label: at(OPTIONS_TEXT.labels.battleScene),
      values: pick(OPTIONS_TEXT.battleScene), at: options.battleScene,
      help: at(OPTIONS_TEXT.help.battleScene), inert: true,
    },
    {
      key: 'battleRule', label: at(OPTIONS_TEXT.labels.battleRule),
      values: pick(OPTIONS_TEXT.battleRule), at: options.battleRule,
      help: at(OPTIONS_TEXT.help.battleRule), inert: true,
    },
    {
      key: 'sound', label: at(OPTIONS_TEXT.labels.sound),
      values: pick(OPTIONS_TEXT.sound), at: options.sound,
      help: at(OPTIONS_TEXT.help.sound),
    },
    {
      key: 'battlePace', label: '배틀 진행',
      values: ['원작대로', '빠르게', '아주 빠르게'], at: options.battlePace,
      help: '글이 머무는 시간과 체력바 속도\n원작 후반 한 턴이 14초쯤 걸립니다', ours: true,
    },
    {
      key: 'view', label: '시점',
      values: ['3인칭', '1인칭'], at: options.view,
      help: '휠과 V로도 바꿉니다\n1인칭은 마우스로 둘러보고 보는 쪽으로 걷습니다',
      ours: true,
    },
    {
      key: 'reset', label: '처음부터',
      values: [], at: 0,
      help: '리포트를 지우고 새로 시작합니다\n지운 것은 되돌릴 수 없습니다', ours: true,
    },
  ]

  const row = rows[Math.min(cursor, rows.length - 1)]

  const move = (delta: number): void => {
    if (!row || row.key === 'reset' || row.values.length === 0) return
    const next = wrapCursor(row.at, delta, row.values.length)
    options.set(row.key,
      next as TextSpeed & BattleScene & BattleRule & SoundMode & ViewMode & BattlePace)
  }

  useMenuKeys({
    up: () => { setCursor((c) => clampCursor(c, -1, rows.length)) },
    down: () => { setCursor((c) => clampCursor(c, 1, rows.length)) },
    left: () => { move(-1) },
    right: () => { move(1) },
    confirm: () => {
      if (row?.key === 'reset') { setConfirming(true); return }
      move(1)
    },
    cancel: () => { if (confirming) setConfirming(false); else back() },
  }, !confirming)

  if (confirming) return <ResetConfirm text={text} onNo={() => { setConfirming(false) }} onYes={() => {
    // 리포트를 지우고 타이틀로 나간다. 처음부터면 인트로부터 다시 봐야 한다
    void resetSave().then(() => { closeAll(); location.assign(import.meta.env.BASE_URL) })
  }} />

  return (
    <div className={css.overlay}>
      <div className={css.header}><span>{at(OPTIONS_TEXT.title) || '설정'}</span></div>
      <div className={own.center}>
        <div className={own.rows}>
          {rows.map((r, i) => (
            <div key={r.key} className={i === cursor ? css.rowOn : css.row}>
              <span className={own.rowLabel}>
                {r.label}
                {r.ours && <span className={own.ours}>추가</span>}
                {r.inert && <span className={own.ours}>아직</span>}
              </span>
              <span className={own.values}>
                {r.values.map((v, k) => (
                  <span key={v} className={k === r.at ? own.valueOn : own.value}>{v}</span>
                ))}
              </span>
            </div>
          ))}
        </div>
        <div className={own.help}>{row?.help}</div>
      </div>
      <div className={css.footer}>↑↓ 항목 · ←→ 값 · Z 결정 · X 돌아가기</div>
    </div>
  )
}

/** 되돌릴 수 없는 것은 한 번 더 묻는다 */
function ResetConfirm(
  { text, onYes, onNo }: { text: string[]; onYes: () => void; onNo: () => void },
) {
  const [yes, setYes] = useState(false)
  useMenuKeys({
    left: () => { setYes(true) },
    right: () => { setYes(false) },
    confirm: () => { if (yes) onYes(); else onNo() },
    cancel: onNo,
  })
  return (
    <div className={css.overlay}>
      <div className={own.center}>
        <div className={own.prompt}>
          {'리포트를 지우고 처음부터 시작합니다\n정말로 괜찮겠습니까?'}
        </div>
        <div className={own.choices}>
          <span className={yes ? own.choiceOn : own.choice}>{text[OPTIONS_TEXT.yes] ?? '예'}</span>
          <span className={yes ? own.choice : own.choiceOn}>{text[OPTIONS_TEXT.no] ?? '아니오'}</span>
        </div>
      </div>
      <div className={css.footer}>←→ 고르기 · Z 결정 · X 그만둔다</div>
    </div>
  )
}
