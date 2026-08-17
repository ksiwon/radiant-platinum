// 인트로 첫머리에 마박사가 하는 **우리 말** (PARITY §1.18 · COPYRIGHT §11)
//
// ⚠️ **인트로의 나머지는 한 자도 짓지 않는다.** 마박사의 말 45줄은 전부
// `rowan_intro` 뱅크에서 오고 `beats.ts`는 그 번호만 든다. 여기 넉 줄만
// 예외이고, 예외인 이유는 `world/siwonText`와 같다 — **원작인 척하는 문장이
// 아니라 이 프로젝트가 제 이름으로 하는 말**이라서다. 원작에 이 말은 없다.
//
// 왜 여기냐: 고지가 설치 화면·타이틀·크레딧 셋에 있었는데(COPYRIGHT §11) 그
// 셋은 다 **게임 밖**이다. 이어하기로 들어오면 타이틀을 스쳐 지나고, 크레딧은
// 끝까지 깬 사람만 본다. 처음 시작하는 사람이 **게임 안에서** 이 말을 듣는
// 자리가 한 군데도 없었다.
//
// 글 모양은 원작 대사창 규칙 그대로다 — 창이 두 줄이고 `\n`이 줄 바꿈,
// `\r`이 「눌러서 창을 비우고 다음」이다. 마박사의 말투(~일세/~라네 · ~じゃ)를
// 따르되 **내용은 우리 것**이라 이름도 우리 이름으로 적는다.

export type IntroLocale = 'ko' | 'en' | 'ja'

const KO =
  '레디언트 플래티넘의 세계에 온 것을\n'
  + '환영하네!\r'
  + '이 세계는 Siwon J. Park의\n'
  + '개인 프로젝트일세.\r'
  + '비공식·비제휴 비영리 팬게임이고,\n'
  + '관련 상표와 저작물은\r'
  + '각 권리자의 것이라네.\n'
  + '그럼, 이야기를 시작해 볼까.'

const EN =
  'Welcome to the world of\n'
  + 'Radiant Platinum!\r'
  + 'This world is a personal project by\n'
  + 'Siwon J. Park.\r'
  + 'It is an unofficial, unaffiliated,\n'
  + 'non-commercial fan game, and all\r'
  + 'related trademarks and works belong\n'
  + 'to their respective owners.\r'
  + 'Now then — let us begin.'

const JA =
  'ラディアント プラチナの せかいへ\n'
  + 'ようこそ！\r'
  + 'この せかいは Siwon J. Park の\n'
  + 'こじんプロジェクトじゃ。\r'
  + 'ひこうしき・ひていけいの\n'
  + 'ひえいり ファンゲームで\r'
  + 'かんれんする しょうひょうと ちょさくぶつは\n'
  + 'それぞれの けんりしゃの ものじゃ。\r'
  + 'それでは はじめようかの。'

const TABLE: Readonly<Record<IntroLocale, string>> = { ko: KO, en: EN, ja: JA }

/** 롬에 없는 언어로 시작하면 한국어다 (`siwonText`와 같은 규칙) */
export function introWelcome(locale: string): string {
  return TABLE[locale as IntroLocale] ?? KO
}
