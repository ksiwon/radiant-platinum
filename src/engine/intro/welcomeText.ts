// 인트로에서 마박사가 하는 **우리 말** (PARITY §1.18 · COPYRIGHT §11)
//
// ⚠️ **이 저장소에서 우리가 지은 글은 여기와 `world/siwonText`뿐이다.**
// CODEMAP §2.6은 「한 글자도 짓지 않는다」이고 그 규칙은 그대로 산다 — 그 규칙이
// 막으려는 것은 **원작인 척하는 문장**이고, 이 글은 원작인 척하지 않는다.
// **여기를 근거로 다른 자리에 글을 짓지 않는다.**
//
// 왜 여기냐: 고지가 설치 화면·타이틀·크레딧 셋에 있었는데(COPYRIGHT §11) 그
// 셋은 다 **게임 밖**이다. 이어하기로 들어오면 타이틀을 스쳐 지나고, 크레딧은
// 끝까지 깬 사람만 본다. 처음 시작하는 사람이 **게임 안에서** 이 말을 듣는
// 자리가 한 군데도 없었다.
//
// 이 글이 지는 짐이 넷이다 — **세계의 이름 · 만든 사람과 그 사람의 자리 ·
// 명예의 전당 뒤에 열리는 배포 · 비영리 팬게임이라는 것.** 인트로에서 원작
// 마박사의 소개를 걷어내고 여기서 바로 성별·이름으로 넘어가므로(`beats.ts`),
// 게임 안에서 이 말을 할 자리는 이제 여기 하나뿐이다.
//
// 글 모양은 원작 대사창 규칙 그대로다 — 창이 두 줄이고 `\n`이 줄 바꿈,
// `\r`이 「눌러서 창을 비우고 다음」이다. 마박사의 말투(~일세/~라네 · ~じゃ)를
// 따르되 **내용은 우리 것**이라 이름도 우리 이름으로 적는다.

type IntroLocale = 'ko' | 'en' | 'ja'

const KO =
  '레디언트 플래티넘의 세계에 온 것을\n'
  + '환영하네!\r'
  + '이 세계는 Siwon J. Park의\n'
  + '개인 프로젝트일세.\r'
  + '만든 이의 다른 일이 궁금하거든\n'
  + 'siwon.it.kr에 들러 보게.\r'
  + '비공식·비제휴 비영리 팬게임이고,\n'
  + '관련 상표와 저작물은\r'
  + '각 권리자의 것이라네.\r'
  + '아, 하나 더. 명예의 전당에 이름을\n'
  + '올리고 나면 만든 이가 찾아온다네.\r'
  + '먼 옛날 딱 한 번씩만 나눠 주고\n'
  + '닫아 버린 것들을 건네줄 걸세.\r'
  + '그럼, 자네 이야기를 시작해 볼까.'

const EN =
  'Welcome to the world of\n'
  + 'Radiant Platinum!\r'
  + 'This world is a personal project by\n'
  + 'Siwon J. Park.\r'
  + 'Curious about their other work?\n'
  + 'Drop by siwon.it.kr.\r'
  + 'It is an unofficial, unaffiliated,\n'
  + 'non-commercial fan game, and all\r'
  + 'related trademarks and works belong\n'
  + 'to their respective owners.\r'
  + 'One more thing. Once your name is in\n'
  + 'the Hall of Fame, the maker visits.\r'
  + 'They kept things that were handed out\n'
  + 'once, long ago, then shut away.\r'
  + 'Now then — let your story begin.'

const JA =
  'ラディアント プラチナの せかいへ\n'
  + 'ようこそ！\r'
  + 'この せかいは Siwon J. Park の\n'
  + 'こじんプロジェクトじゃ。\r'
  + 'つくった ものの ほかの しごとが\n'
  + 'きに なるなら siwon.it.kr へ。\r'
  + 'ひこうしき・ひていけいの\n'
  + 'ひえいり ファンゲームで\r'
  + 'かんれんする しょうひょうと ちょさくぶつは\n'
  + 'それぞれの けんりしゃの ものじゃ。\r'
  + 'もう ひとつ。なまえを でんどういり\n'
  + 'させると つくった ものが たずねてくる。\r'
  + 'むかし いちどだけ くばって\n'
  + 'そのまま とじた ものたちを わたすのじゃ。\r'
  + 'それでは きみの ものがたりを はじめようかの。'

const TABLE: Readonly<Record<IntroLocale, string>> = { ko: KO, en: EN, ja: JA }

/** 롬에 없는 언어로 시작하면 한국어다 (`siwonText`와 같은 규칙) */
export function introWelcome(locale: string): string {
  return TABLE[locale as IntroLocale] ?? KO
}
