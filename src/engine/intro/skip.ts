// 인트로 건너뛰기 — 시험용.
//
// 마박사 대목은 글이 45줄이고 이름을 두 번 짓는다. 그 뒤를 손보는 동안 매번
// 처음부터 다시 앉아 있을 수는 없다.
//
// **이름을 지어내지 않는다.** 우리가 아무 글자나 박으면 그건 원작에 없는
// 이름이고, 화면에 뜨는 순간 진짜와 구별이 안 된다. 그래서 인트로가 실제로
// 내미는 후보의 **첫 번째**를 그대로 쓴다 — 주인공은 롬의 제안 이름표에서,
// 라이벌은 마박사가 내미는 여덟 후보에서.
//
// 그래서 이 값은 판을 다시 열어도 늘 같다. 시험이 흔들리지 않는다.
import { loadDialogueBank } from '../../data/gameData'
import { loadGenericNames, pickName } from '../../data/genericNames'
import { UI_BANK } from '../../data/uiText'
import { RIVAL_NAME_CHOICES } from './beats'

export interface IntroChoice {
  name: string
  gender: 'boy' | 'girl'
  rivalName: string
}

/** 건너뛸 때 고른 것으로 치는 성별. 남자가 목록 앞이라 이쪽을 쓴다 */
const GENDER = 'boy'

/**
 * 두 뱅크에서 첫 후보를 집는다.
 *
 * 받아오는 일과 나눠 둔 이유: 이 부분이 **시험할 값**이고, fetch는 아니다
 */
export function chooseFrom(generic: readonly string[], intro: readonly string[]): IntroChoice {
  const first = RIVAL_NAME_CHOICES[0]
  return {
    name: pickName(generic, GENDER === 'boy' ? 'playerMale' : 'playerFemale', 0),
    gender: GENDER,
    rivalName: (first === undefined ? '' : intro[first]) ?? '',
  }
}

/**
 * 인트로를 끝까지 봤다면 나왔을 값.
 *
 * 뱅크 둘을 받아야 해서 비동기다. 둘 다 수 KB고 타이틀에서 한 번만 부른다
 */
export async function introSkipChoice(): Promise<IntroChoice> {
  const [generic, intro] = await Promise.all([
    loadGenericNames('ko'),
    loadDialogueBank('ko', UI_BANK.intro),
  ])
  return chooseFrom(generic, intro)
}
