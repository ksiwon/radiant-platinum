// 시원의 말 (SIWON.md §4)
//
// ⚠️ **이 저장소에서 우리가 지은 글은 여기뿐이다.** CODEMAP §2.6은 「한 글자도
// 짓지 않는다」이고 그 규칙은 그대로 산다 — 그 규칙이 막으려는 것은 **원작인
// 척하는 문장**이고, 시원은 원작 사람이 아니라 우리가 덧붙인 사람이라 그 위험이
// 없다. **여기를 근거로 다른 자리에 글을 짓지 않는다.**
//
// 롬에서 온 글은 배포물에 안 실리는데(COPYRIGHT §5) 이 글은 우리 것이라 실린다.
// 게임 안에서 유일하게 그럴 수 있는 글이다.
//
// 글 모양은 원작 대사창 규칙을 따른다 — 창이 두 줄이고
//   `\n` 줄 바꿈 · `\r` 기다렸다 창을 비움 · `\f` 기다렸다 한 줄 올림
// 물건 이름은 여기 안 적는다. 「받았다」는 말은 롬의 글이 한다

export type SiwonLocale = 'ko' | 'en' | 'ja'

export interface SiwonLines {
  /** 전당등록 전에 말을 걸었다 */
  locked: string
  /** 전당등록 직전, 리그 복도에서의 기습 등장 */
  cameo: string
  /** 선물을 건네기 전에 하는 말. 차례가 `SIWON_GIFTS`와 같다 */
  gift: readonly string[]
  /**
   * 앞의 것을 아직 안 썼다. 열쇠가 `SIWON_GIFTS`의 `at`이다.
   *
   * ⚠️ **배열이 아니라 자리를 못 박는 표다.** `used`가 늘 참인 선물(화강돌 0 ·
   * 마나피 알 4)과 마지막(피리 6)은 이 말이 영영 안 뜬다 — 배열로 두면 그
   * 자리가 구멍이 되고, 구멍을 메우려고 안 뜨는 글을 지어내게 된다
   */
  wait: Readonly<Record<number, string>>
  /** 일곱을 다 줬다 */
  done: string
  /** 파티가 가득 찼다 */
  partyFull: string
  /** 가방이 그 물건을 더 못 받는다 */
  bagFull: string
}

const KO: SiwonLines = {
  locked:
    '어, 손님이네.\n'
    + '나는 시원. 여기서 이 세계를 만들어.\r'
    + '보여 줄 게 있는데… 아직은 아니야.\n'
    + '명예의 전당에 이름을 올리고 다시 와 줘.',
  cameo:
    '……잠깐!\r'
    + '나는 시원. 이 세계를 만든 사람이야.\n'
    + '여기서 인사할 시간은 없고.\r'
    + '축복시티 콘도미니엄 2층으로 와 줘.\n'
    + '전해 주지 못한 것들이 있어.\r'
    + '먼 옛날에 딱 한 번씩만 나눠 주고\n'
    + '닫아 버린 것들이야. 기다릴게.',
  gift: [
    '먼저 이 아이부터.\n'
    + '209번도로의 무덤에 갇혀 있던 아이야.\r'
    + '그 돌을 여는 건 땅 밑에서 나눈 인사\n'
    + '백여덟 번인데, 그 길이 여기엔 없어.\r'
    + '그래서 내가 데리고 나왔어.',
    '영원시티의 잠긴 문을 여는 열쇠야.\r'
    + '로토무를 데려가서 가전에 넣어 봐.\n'
    + '아직 로토무가 없다면 숲의 양옥집이야. 밤에.',
    '신월섬으로 가는 배는 이게 있어야 타.\n'
    + '운하시티 여관에서 물어봐.\r'
    + '그 섬에 있는 건… 직접 보는 게 낫겠어.',
    '오박사님이 남긴 편지야.\n'
    + '224번도로 끝에서 읽어 줘.\r'
    + '길이 하나 더 생길 거야.',
    '이건 알이야.\n'
    + '많이 걸어야 깨어나.\r'
    + '바다에서 온 아이라고만 해 둘게.',
    '이 아이는 물건이 아니라 친구야.\n'
    + '몸이 무거워서 처음엔 잘 못 움직여.\r'
    + '이 아이를 데리고 유적 셋을 찾아가 봐.\n'
    + '잠긴 석상이 반응할 거야.',
    '마지막이야.\n'
    + '이건 소리를 내는 물건이야.\r'
    + '창기둥에서만 울려.\n'
    + '무엇이 내려오는지는… 말 안 할래.',
  ],
  wait: {
    1: '열쇠는 아직 안 써 봤구나.\n'
      + '로토무를 가전에 넣어 보고 다시 와.',
    2: '신월섬에는 아직 안 갔구나.\n'
      + '거기서 만날 걸 만나고 다시 와.',
    3: '편지는 아직 그대로네.\n'
      + '224번도로 끝까지 가 보고 다시 와.',
    5: '유적은 아직 조용한가 봐.\n'
      + '그 아이를 데리고 다녀오고 다시 와.',
  },
  done:
    '이제 내 손에는 아무것도 없어.\r'
    + '닫힌 문은 다 열었으니까,\n'
    + '나머지는 네 이야기야. 잘 가.',
  partyFull:
    '손이 모자라 보이는데.\n'
    + '한 자리 비우고 다시 와 줘.',
  bagFull:
    '가방이 그걸 더는 못 받는대.\n'
    + '자리를 만들고 다시 와 줘.',
}

const EN: SiwonLines = {
  locked:
    'Oh — a visitor.\n'
    + 'I’m Siwon. I build this world.\r'
    + 'There’s something I want to hand you…\n'
    + 'but not yet.\r'
    + 'Come back once your name is in the\n'
    + 'Hall of Fame.',
  cameo:
    '…Hold on!\r'
    + 'I’m Siwon. I built this world.\n'
    + 'No time for a proper hello here.\r'
    + 'Come to the Jubilife City\n'
    + 'Condominiums, second floor.\r'
    + 'There are things I never got to hand\n'
    + 'out — given away once, long ago,\r'
    + 'then shut away for good.\n'
    + 'I’ll be waiting.',
  gift: [
    'This one first.\n'
    + 'It was sealed in the tower on\r'
    + 'Route 209. What opens that stone is\n'
    + 'a hundred and eight greetings traded\r'
    + 'underground — and that road isn’t\n'
    + 'here. So I brought it out myself.',
    'It opens a locked door in Eterna.\r'
    + 'Bring a Rotom and let it into the\n'
    + 'appliances.\r'
    + 'No Rotom yet? Old Chateau. At night.',
    'You need this to board the ship to\n'
    + 'Newmoon Island.\r'
    + 'Ask at the Canalave inn.\n'
    + 'What waits there — better you see it.',
    'A letter the Professor left behind.\n'
    + 'Read it at the end of Route 224.\r'
    + 'A new path will open.',
    'This one’s an Egg.\r'
    + 'It needs a lot of walking to wake up.\n'
    + 'All I’ll say is: it came from the sea.',
    'This one isn’t an item. It’s a friend.\n'
    + 'Heavy — slow to get going at first.\r'
    + 'Take it to the three ruins.\n'
    + 'The sealed statues will answer.',
    'The last one.\n'
    + 'This one makes a sound.\r'
    + 'It only carries at the Spear Pillar.\n'
    + 'What comes down… I won’t spoil it.',
  ],
  wait: {
    1: 'You haven’t used the key yet.\n'
      + 'Let a Rotom into an appliance first.',
    2: 'You haven’t been to Newmoon Island.\n'
      + 'Meet what’s there, then come back.',
    3: 'The letter’s still sealed.\n'
      + 'Go to the end of Route 224 first.',
    5: 'The ruins are still quiet.\n'
      + 'Take that friend there, then come back.',
  },
  done:
    'My hands are empty now.\r'
    + 'Every shut door is open.\n'
    + 'The rest is your story. Take care.',
  partyFull:
    'Looks like your hands are full.\n'
    + 'Make room and come back.',
  bagFull:
    'Your Bag can’t take another one.\n'
    + 'Make room and come back.',
}

const JA: SiwonLines = {
  locked:
    'おや おきゃくさんだ。\n'
    + 'ぼくは シウォン。この せかいを つくってる。\r'
    + 'わたしたい ものが あるんだけど…\n'
    + 'まだ はやいな。\r'
    + 'なまえを でんどういりさせてから\n'
    + 'また きて ほしい。',
  cameo:
    '……ちょっと まって！\r'
    + 'ぼくは シウォン。この せかいを つくった。\n'
    + 'ここで あいさつしてる ひまは ない。\r'
    + 'コトブキシティの マンション ２かいへ\n'
    + 'きて ほしい。\r'
    + 'わたしそびれた ものが あるんだ。\n'
    + 'むかし いちどだけ くばって\r'
    + 'そのまま とじた ものたち。\n'
    + 'まってるよ。',
  gift: [
    'まずは この こから。\n'
    + '２０９ばんどうろの はかに\r'
    + 'とじこめられて いた こだ。\n'
    + 'あの いしを ひらくのは ちかで かわす\r'
    + 'あいさつ １０８かい だけど\n'
    + 'その みちは ここには ない。\r'
    + 'だから ぼくが つれて きた。',
    'ハクタイの とじた とびらの かぎだ。\r'
    + 'ロトムを つれて かでんに いれてみて。\n'
    + 'ロトムが いないなら もりの ようかん。よるだ。',
    'シンゲツじまへの ふねは これが いる。\n'
    + 'ミオシティの やどで きいてみて。\r'
    + 'あそこに いる ものは… じぶんの めで。',
    'オーキドはかせの てがみだ。\n'
    + '２２４ばんどうろの はてで よんで。\r'
    + 'みちが ひとつ ふえる。',
    'これは タマゴだよ。\r'
    + 'たくさん あるかないと めを ささない。\n'
    + 'うみから きた こ とだけ いっておく。',
    'これは どうぐじゃない。なかまだ。\n'
    + 'からだが おもくて はじめは のろい。\r'
    + 'この こと いっしょに ３つの いせきへ。\n'
    + 'とじた せきぞうが こたえる。',
    'さいごだ。\n'
    + 'これは おとを だす もの。\r'
    + 'やりのはしらでしか ひびかない。\n'
    + 'なにが おりてくるかは… いわないでおく。',
  ],
  wait: {
    1: 'かぎは まだ つかってないね。\n'
      + 'ロトムを かでんに いれてから また きて。',
    2: 'シンゲツじまへ まだ いってないね。\n'
      + 'あそこで あうべき ものに あってから。',
    3: 'てがみは まだ そのままだ。\n'
      + '２２４ばんどうろの はてまで いってみて。',
    5: 'いせきは まだ しずかだ。\n'
      + 'あの こを つれて いってから また きて。',
  },
  done:
    'もう てもとには なにも ない。\r'
    + 'とじた とびらは ぜんぶ あいた。\n'
    + 'あとは きみの ものがたりだ。またね。',
  partyFull:
    'てが ふさがってるみたいだ。\n'
    + 'ひとつ あけてから また きて。',
  bagFull:
    'バッグが もう うけとれないって。\n'
    + 'あけてから また きて。',
}

const TABLE: Readonly<Record<SiwonLocale, SiwonLines>> = { ko: KO, en: EN, ja: JA }

/** 그 나라 말의 시원. 모르는 로케일은 한국어다 */
export function siwonLines(locale: string): SiwonLines {
  return TABLE[locale as SiwonLocale] ?? KO
}
