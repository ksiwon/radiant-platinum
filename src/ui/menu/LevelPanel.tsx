// 레벨업 능력치 창 — 오른 폭(+n)을 먼저 보이고, A·B에 새 값으로 바꾼다.
//
// 원작은 같은 창을 두 군데서 띄운다:
// - 파티 화면의 이상한사탕 (`windows.c`의 `PartyMenu_DrawLevelUpStatIncreases` →
//   `PartyMenu_DrawLevelUpNewStatValues`)
// - 배틀에서 경험치로 레벨이 오를 때, 레벨마다 한 번 (`battle_script.c`의
//   `SEQ_GET_EXP_LEVEL_UP_SUMMARY_PRINT_DIFF` → `…_PRINT_TRUE`)
//
// 둘 다 14×12칸 창에 능력치 이름 여섯 줄을 적고, 오른쪽 끝에 값을 맞춘다. 차례도
// 같다(최대HP · 공격 · 방어 · 특수공격 · 특수방어 · 스피드). 그래서 그리는 쪽을 하나로
// 둔다 — 어디에 띄울지(`className`)와 언제 넘길지는 부르는 쪽 몫이다.
//
// ⚠️ 글은 **파티 뱅크(453)** 의 185~192를 쓴다. 배틀 뱅크의 같은 자리
// (`BattleStrings_Text_StatName` · `_PlusStatIncrease` · `_StatValue`)는 이름 줄이
// `{STRVAR_1 13, …}` 빈칸 하나뿐이라 — 능력치 이름을 다른 뱅크에서 끌어와 채운다
// (`TAG_STAT`) — 그 줄만 읽어서는 이름이 안 나온다. 「+n」과 값은 두 뱅크가 같은 모양이다.
import { useEffect, useState } from 'react'
import { fillMenuText, loadUiText } from '../../data/uiText'
import { useGameLocale } from '../../state/optionsStore'
import type { Stats } from '../../data/schema'
import * as own from './partyScreen.css'

/** 파티 뱅크(453)의 자리 — 185~190이 능력치 이름, 191이 「+n」, 192가 새 값이다 */
const TEXT = { statNames: 185, statGain: 191, statValue: 192 } as const

/**
 * 창에 적는 차례 (`PartyMenu_DrawLevelUpStatIncreases`의 `stats[]` · 배틀의 `statParams[]`) —
 * 최대HP · 공격 · 방어 · 특수공격 · 특수방어 · 스피드. 스피드가 **맨 끝**이다
 */
const STAT_ORDER = ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const

/** 오른 폭을 보이는 쪽인가(`gain`), 새 값을 보이는 쪽인가(`value`) */
export type LevelPanelShow = 'gain' | 'value'

interface LevelPanelProps {
  before: Stats
  after: Stats
  show: LevelPanelShow
  /** 파티 뱅크(453). 부르는 쪽이 이미 들고 있으면 넘긴다 — 안 넘기면 스스로 받는다 */
  text?: readonly string[]
  /** 창 자리. 안 주면 왼쪽 위다 (원작 파티 화면의 (1,1)) */
  className?: string
}

/**
 * 창의 여섯 줄 — 이름과 오른쪽 끝의 값.
 *
 * 오른 폭은 `after − before`다. 원작도 레벨을 올린 뒤의 값에서 올리기 전 값을 뺀다
 * (`stats[stat] - application->monStats[stat]` · `Pokemon_GetValue(…) - oldStats->stat[i]`)
 */
export function levelPanelRows(
  before: Stats, after: Stats, show: LevelPanelShow, text: readonly string[],
): { key: keyof Stats; label: string; value: string }[] {
  const template = text[show === 'gain' ? TEXT.statGain : TEXT.statValue] ?? ''
  return STAT_ORDER.map((key, i) => ({
    key,
    label: fillMenuText(text[TEXT.statNames + i] ?? '', []),
    value: fillMenuText(template, [String(show === 'gain' ? after[key] - before[key] : after[key])]),
  }))
}

export function LevelPanel({ before, after, show, text, className }: LevelPanelProps) {
  const locale = useGameLocale()
  const [loaded, setLoaded] = useState<readonly string[]>([])
  useEffect(() => {
    if (text !== undefined) return
    let alive = true
    void loadUiText('partyMenu', locale)
      .then((lines) => { if (alive) setLoaded(lines) })
      .catch(() => { /* 이름과 값의 틀만 빈다 */ })
    return () => { alive = false }
  }, [text, locale])

  return (
    <div className={className ?? own.levelPanel} data-level-panel={show}>
      {levelPanelRows(before, after, show, text ?? loaded).map((row) => (
        <div key={row.key} className={own.levelRow}>
          <span>{row.label}</span>
          <span className={own.levelValue}>{row.value}</span>
        </div>
      ))}
    </div>
  )
}
