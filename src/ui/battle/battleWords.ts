// 배틀 안 화면들(명령 칸 · 가방 · 교체)의 우리 글 — 설정의 세 언어를 같은 자리에 둔다.
//
// 롬에 같은 뜻의 줄이 있는 말(교체한다 · 그만둔다 · 포켓몬을 선택해 주십시오 · 어느 포켓몬에게 쓰겠습니까)은
// 여기 두지 않고 `PARTY`의 줄 번호로 읽는다. 이 표는 롬에 없는 안내와 짧은 상태 글이다.
// 한국어만 적어 두면 언어를 바꿔도 그 줄만 한국어로 남아 한 화면에 두 언어가 섞인다.
import type { DataLocale } from '../../data/gameData'
import { useGameLocale } from '../../state/optionsStore'
import type { Words } from './CommandArea'

export const BATTLE_WORDS: Record<DataLocale, Words> = {
  ko: {
    bagBlocked: '지금은 쓸 수 없다', partyBlocked: '교체할 포켓몬이 없다',
    run: '배틀을 끝낸다', runNever: '도망칠 수 없다', runBlocked: '지금은 도망칠 수 없다',
    bait: '잡기 쉬워지고 잘 달아난다', mud: '안 달아나지만 잡기 어려워진다',
    stay: '그대로 싸운다', swap: '포켓몬을 고른다',
    skip: 'Z 넘기기', next: 'Z 계속', pick: '↑↓ 고르기 · Z 결정', back: ' · X 닫기',
    continue: '계속', preparing: '배틀 준비 중…', leave: '필드로 돌아가기',
    aim: '누구에게?', here: '나와 있다', pickMove: '↑↓ 기술 · Z 결정', pocketKeys: '←→ 주머니 · ',
    throwBall: '던져서 잡는다', escapes: '반드시 도망칠 수 있다', useActive: '나와 있는 포켓몬에게 쓴다',
    close: 'X 닫기',
  },
  en: {
    bagBlocked: 'Can\'t use items now',
    partyBlocked: 'No Pokémon to switch in',
    run: 'End the battle', runNever: 'No escape here', runBlocked: 'Can\'t run right now',
    bait: 'Easier to catch, but flees more', mud: 'Flees less, but harder to catch',
    stay: 'Keep battling', swap: 'Choose a Pokémon',
    skip: 'Z Skip', next: 'Z Continue', pick: '↑↓ Select · Z Confirm', back: ' · X Close',
    continue: 'Continue', preparing: 'Preparing the battle…', leave: 'Return to the field',
    aim: 'Which target?', here: 'In battle', pickMove: '↑↓ Move · Z Confirm', pocketKeys: '←→ Pocket · ',
    throwBall: 'Throw it to catch', escapes: 'Escape guaranteed', useActive: 'Use on the Pokémon in battle',
    close: 'X Close',
  },
  ja: {
    bagBlocked: '今は使えない',
    partyBlocked: '入れ替えるポケモンがいない',
    run: 'バトルを終える', runNever: '逃げられない', runBlocked: '今は逃げられない',
    bait: '捕まえやすいが逃げやすくなる', mud: '逃げにくいが捕まえにくくなる',
    stay: 'そのまま戦う', swap: 'ポケモンを選ぶ',
    skip: 'Z 送る', next: 'Z 続ける', pick: '↑↓ 選ぶ · Z 決定', back: ' · X 閉じる',
    continue: '続ける', preparing: 'バトルの準備中…', leave: 'フィールドに戻る',
    aim: 'だれに？', here: '戦闘に出ている', pickMove: '↑↓ わざ · Z 決定', pocketKeys: '←→ ポケット · ',
    throwBall: '投げて捕まえる', escapes: '必ず逃げられる', useActive: '出ているポケモンに使う',
    close: 'X 閉じる',
  },
}

/** 설정의 언어로 고른 표. 언어가 바뀌면 다시 그린다 */
export function useBattleWords(): Words {
  return BATTLE_WORDS[useGameLocale()]
}
