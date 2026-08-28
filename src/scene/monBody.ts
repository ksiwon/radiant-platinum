// 포켓몬 몸 하나를 받아 세우는 자리 — **네 화면이 같은 것을 쓴다** (REPAIR §9)
//
// 몸을 받아 `wait`를 걸고 살아 있는 동안만 들고 있는 열여덟 줄이 네 곳에 그대로
// 있었다: 연출(`CinematicStage`) · 명예의 전당(`HallOfFameStage`) · 첫 파트너
// 고르기(`field/StarterMon`) · 미리보기(`PokemonPreviewStage`).
//
// ⚠️ **넷이 이미 갈라져 있었다.** 셋은 종이 바뀔 때 `setBody(null)`로 옛 몸을
// 먼저 내리는데 첫 파트너만 안 내렸다 — 새 몸이 올 때까지 **옛 종의 몸이 그대로
// 서 있는** 창이 열려 있었다. 합치면서 내리는 쪽에 맞춘다.
//
// ⚠️ **배틀은 여기 안 들어온다** (`battle/BattleStage`). 배틀은 몸 하나를
// 여러 동작으로 갈아 태우고 교체 연출이 그 위에 얹혀 있어서, 「받아서 `wait`」
// 한 줄로 줄어들지 않는다.
import { useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { loadMonModel, makeBody, play, type MonBody } from './battle/monModel'

/** 이 몸을 세우기 전에 손볼 것이 있으면 — 돌려준 함수는 몸을 내릴 때 부른다 */
type Prepare = (body: MonBody) => (() => void) | void

interface MonBodyOptions {
  form?: number
  gender?: 'male' | 'female' | 'genderless'
  shiny?: boolean
  prepare?: Prepare
}

/**
 * 그 종의 몸을 받아 `wait`를 걸어 돌려준다. 아직 안 왔거나 설치본에 그 종의
 * GLB가 없으면 `null`이다 — 부르는 쪽이 절차형 몸으로 떨어진다.
 *
 * ⚠️ **믹서도 여기서 돌린다.** 넷이 모두 `body?.mixer.update(delta)` 한 줄을
 * 각자의 `useFrame`에 달고 있었다. 여기 두면 그 줄이 사라지는 대신 프레임
 * 콜백이 하나 더 붙는데, 몸 하나에 하나씩이라 수가 늘지 않는다.
 *
 * ⚠️ **`prepare`는 딸림값에 안 넣는다.** 부르는 쪽이 매 렌더 새 함수를 만들어도
 * 몸을 다시 받지 않아야 한다 — 종·모습이 바뀔 때만 다시 받는다
 */
export function useMonBody(
  species: number | null,
  { form = 0, gender, shiny, prepare }: MonBodyOptions = {},
): MonBody | null {
  const [body, setBody] = useState<MonBody | null>(null)

  useEffect(() => {
    let alive = true
    let made: MonBody | null = null
    let undo: (() => void) | void
    setBody(null)
    if (species === null) return
    void loadMonModel(species, form, { gender, shiny })
      .then((loaded) => {
        if (!alive || !loaded) return
        made = makeBody(loaded)
        undo = prepare?.(made)
        play(made, 'wait')
        setBody(made)
      })
      .catch(() => {
        /* 부르는 쪽의 절차형 몸이 그대로 선다 */
      })
    return () => {
      alive = false
      made?.mixer.stopAllAction()
      undo?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `prepare`는 위 머리말대로 뺀다
  }, [species, form, gender, shiny])

  useFrame((_, delta) => {
    body?.mixer.update(delta)
  })

  return body
}
