// 기술 배우기 상태 기계 한 벌 (SYSTEM §2.2 `useLearnFlow`, 4.19).
//
// 배틀 `LearnMove`에 있던 흐름을 꺼냈다. 진화 화면도 같은 길을 탄다 — 껍데기(그림)만 다르고
// **차례는 하나**다. 원작 `SEQ_GET_EXP_*`의 순서 그대로:
//
//   ask            다른 기술을 잊게 하겠습니까?        예 → pick · 아니오 → wellThen
//   pick           어느 기술을 잊게 하겠습니까?        기술 → 답(i) · 그만둔다 · X → wellThen
//   wellThen       「그럼...」                         아무 키 → confirmGiveUp
//   confirmGiveUp  배우는 것을 포기하겠습니까?         포기한다 → 답(null) · 포기하지 않는다 · X → ask
//
// ⚠️ **다섯째 칸은 새 기술이고 꼬리는 「그만둔다」다.** 이 단은 안 배우기로 정했을 때만 오므로
// 하네스는 `confirmGiveUp`에서 Space(포기한다)로 답한다 — 「포기하지 않는다」를 고르면 같은 자리를
// 맴돈다.
//
// 껍데기는 뿌리에 `learnRootProps`를 펼친다(`data-learn-stage` · `data-learn-new`). 하네스(`drive.mjs`)가
// 글이 아니라 그 속성으로 단을 읽는다. 기술 칸은 `data-move-id`를 단다.
import { useState } from 'react'

export type LearnStage = 'ask' | 'pick' | 'wellThen' | 'confirmGiveUp'

/** 지금 들고 있는 기술 한 칸 */
export interface LearnSlot {
  move: number | null
  pp: number
  maxPp: number
}

/** 「잊게 한다」 줄의 한 걸음 — `pick`에서 칸을 눌렀을 때 일어나는 일 */
export type PickResult =
  | { kind: 'cancel' }
  | { kind: 'refused', why: string }
  | { kind: 'forget', index: number }

/** 첫 물음의 답 — 예면 고르러 가고, 아니오면 「그럼...」으로 물러선다 */
export function afterAsk(forget: boolean): LearnStage {
  return forget ? 'pick' : 'wellThen'
}

/** 「그럼...」 다음은 늘 포기 확인이다 */
export function afterWellThen(): LearnStage {
  return 'confirmGiveUp'
}

/**
 * 포기 확인의 답. 포기하면 `answer: null`(안 배운다)이고, 안 하면 처음 물음으로 돌아간다 —
 * 원작이 「배우고 싶다…!」부터 다시 묻는다
 */
export function afterConfirm(giveUp: boolean): { stage: LearnStage } | { answer: null } {
  return giveUp ? { answer: null } : { stage: 'ask' }
}

/**
 * 잊을 칸을 눌렀다.
 *
 * `rows`는 **기술이 있는 칸만** 모은 것이다. 번호가 `rows.length`이면 꼬리 칸(「그만둔다」)이다.
 * 비전기술은 못 잊는다 — 원작 배틀 파티 화면이 까닭을 띄우고 다시 고르게 한다
 */
export function pickAt(
  index: number,
  rows: readonly LearnSlot[],
  lockedWhy?: (move: number) => string | null,
): PickResult {
  if (index >= rows.length) return { kind: 'cancel' }
  const id = rows[index]!.move!
  const why = lockedWhy?.(id) ?? null
  return why !== null ? { kind: 'refused', why } : { kind: 'forget', index }
}

export interface LearnFlowInput {
  /** 배우려는 기술 번호 */
  move: number
  /** 지금 들고 있는 네 칸 */
  slots: readonly LearnSlot[]
  /** 그 기술을 **못 잊으면** 띄울 글, 잊어도 되면 null */
  lockedWhy?: (move: number) => string | null
  /** 답. `forget`이 null이면 안 배운다 */
  onAnswer: (forget: number | null) => void
}

export interface LearnFlow {
  stage: LearnStage
  /** 기술이 있는 칸만 — `pick`의 목록이다. 다섯째(꼬리)는 이 뒤에 선다 */
  rows: readonly LearnSlot[]
  /** 못 잊는 기술을 골랐을 때의 글. 다른 칸을 고르면 사라진다 */
  refused: string | null
  /** 껍데기 뿌리에 펼친다 — 하네스가 읽는 계약 */
  rootProps: { 'data-learn-stage': LearnStage, 'data-learn-new': number }
  /** `ask`의 답 */
  answerAsk(forget: boolean): void
  /** `wellThen`을 넘긴다 */
  passWellThen(): void
  /** `confirmGiveUp`의 답 */
  answerConfirm(giveUp: boolean): void
  /** `pick`에서 칸 번호(꼬리 포함)를 눌렀다 */
  pick(index: number): void
  /** `pick`에서 물러선다 (X · 꼬리 칸) → 「그럼...」 */
  backOff(): void
}

export function useLearnFlow(input: LearnFlowInput): LearnFlow {
  const [stage, setStage] = useState<LearnStage>('ask')
  const [refused, setRefused] = useState<string | null>(null)
  const rows = input.slots.filter((s) => s.move !== null)

  const backOff = (): void => { setRefused(null); setStage('wellThen') }

  return {
    stage,
    rows,
    refused,
    rootProps: { 'data-learn-stage': stage, 'data-learn-new': input.move },
    answerAsk: (forget) => { setStage(afterAsk(forget)) },
    passWellThen: () => { setStage(afterWellThen()) },
    answerConfirm: (giveUp) => {
      const next = afterConfirm(giveUp)
      if ('answer' in next) input.onAnswer(null)
      else setStage(next.stage)
    },
    pick: (index) => {
      const result = pickAt(index, rows, input.lockedWhy)
      if (result.kind === 'cancel') backOff()
      else if (result.kind === 'refused') setRefused(result.why)
      else input.onAnswer(result.index)
    },
    backOff,
  }
}
