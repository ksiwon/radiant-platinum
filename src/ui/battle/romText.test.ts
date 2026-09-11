// 배틀 글의 줄 번호가 맞는지 (PARITY §2.24 · DATA.md §2.11)
//
// `romText.ts`가 든 번호는 손으로 적은 것이다. 하나가 밀리면 「몸을 지켰다」 자리에
// 엉뚱한 글이 뜨는데 **글자가 나오긴 하므로 눈으로는 넘어간다.** 그래서 번호마다
// 디컴프가 그 줄에 붙인 이름을 여기 다시 적고 둘을 맞대 본다.
//
// ⚠️ **롬이 없어도 도는 시험이다.** 이름표(`import/platinum/battleStrings`)는
// 이름의 순서일 뿐 롬에서 읽은 값이 아니라 저장소 안에 있다 — `uiText.test.ts`가
// 뱅크 번호를 `BANK_ORDER`로 재는 것과 같은 자리다. 글 자체가 맞는지는
// `messages.test.ts`가 실린 뱅크로 잰다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DATA, withData } from '../../data/romData.testkit'
import {
  BATTLE_BAG_ORDER, BATTLE_PARTY_ORDER, BATTLE_STRING_ORDER,
  bagMessage, battleMessage, partyMessage,
} from '../../import/platinum/battleStrings'
import { bankIndex } from '../../import/platinum/textBanks'
import {
  BAG, BAG_BANK, BATTLE_BANK, forSide, MOVE_BANK, moveUsedLine, MSG,
  PARTY, PARTY_BANK, SIDE_KEYS, STAT_SLOT,
} from './romText'

/** `MSG`의 키 → 디컴프가 그 줄에 붙인 이름 (`BattleStrings_Text_` 뒤) */
const NAMED: Record<keyof typeof MSG, string> = {
  flewUpHigh: "PokemonFlewUpHigh_Ally",
  burrowedUnderTheGround: "PokemonBurrowedItsWayUnderTheGround_Ally",
  hidUnderwater: "PokemonHidUnderwater_Ally",
  sprangUp: "PokemonSprangUp_Ally",
  whippedUpAWhirlwind: "PokemonWhippedUpAWhirlwind_Ally",
  tuckedInItsHead: "PokemonTuckedInItsHead_Ally",
  becameCloakedInAHarshLight: "PokemonBecameCloakedInAHarshLight_Ally",
  absorbedLight: "PokemonAbsorbedLight_Ally",
  vanishedInstantly: "PokemonVanishedInstantly_Ally",
  protectedItself: "PokemonProtectedItself_Ally",
  theSubstituteTookDamageForPokemon: "TheSubstituteTookDamageForPokemon_Ally",
  enduredTheHit: "PokemonEnduredTheHit_Ally",
  aBellChimed: "ABellChimed",
  aSoothingAromaWaftedThroughTheArea: "ASoothingAromaWaftedThroughTheArea",
  isProtectedByMist: "PokemonIsProtectedByMist_Ally",
  isProtectedBySafeguard: "PokemonIsProtectedBySafeguard_Ally",
  switchedItemsWithItsTarget: "PokemonSwitchedItemsWithItsTarget_Ally",
  magnitudeX: "MagnitudeX",
  isStoringEnergy: "PokemonIsStoringEnergy_Ally",
  isInLoveWithPokemon: "PokemonIsInLoveWithPokemon_AllyAlly",
  tookPokemonDownWithIt: "PokemonTookPokemonDownWithIt_AllyAlly",
  snatchedPokemonsMove: "PokemonSnatchedPokemonsMove_AllyAlly",
  isConfused: "PokemonIsConfused_Ally",
  anchoredItselfWithItsRoots: "PokemonAnchoredItselfWithItsRoots_Ally",
  anchorsItselfWithAbility: "PokemonAnchorsItselfWithAbility_Ally",
  tookAimAtPokemon: "PokemonTookAimAtPokemon_AllyAlly",
  sketchedMove: "PokemonSketchedMove_Ally",
  butNothingHappened: "ButNothingHappened",
  allPokemonHearingTheSongWillFaintInThreeTurns: "AllPokemonHearingTheSongWillFaintInThreeTurns",
  coinsScatteredEverywhere: "CoinsScatteredEverywhere",
  protectedItself2: "PokemonProtectedItself2_Ally",
  isTighteningItsFocus: "PokemonIsTighteningItsFocus_Ally",
  bracedItself: "PokemonBracedItself_Ally",
  shroudedItselfWithMagicCoat: "PokemonShroudedItselfWithMagicCoat_Ally",
  waitsForATargetToMakeAMove: "PokemonWaitsForATargetToMakeAMove_Ally",
  becameTheCenterOfAttention: "PokemonBecameTheCenterOfAttention_Ally",
  isReadyToHelpPokemon: "PokemonIsReadyToHelpPokemon_AllyAlly",
  isTryingToTakeItsFoeWithIt: "PokemonIsTryingToTakeItsFoeWithIt_Ally",
  wantsTheFoeToBearAGrudge: "PokemonWantsTheFoeToBearAGrudge_Ally",
  hitXTimes: "HitXTimes",
  butThereWasNoTarget: "ButThereWasNoTarget",
  itsAOneHitKO: "ItsAOneHitKO",
  pokemonsAbilityWasSuppressed: "PokemonsAbilityWasSuppressed_Ally",
  surroundedItselfWithAVeilOfWater: "PokemonSurroundedItselfWithAVeilOfWater_Ally",
  fellInLove: "PokemonFellInLove_Ally",
  gotOverItsInfatuation: "PokemonGotOverItsInfatuation",
  unleashedEnergy: "PokemonUnleashedEnergy_Ally",
  wasSqueezedByPokemon: "PokemonWasSqueezedByPokemon_AllyAlly",
  beganChargingPower: "PokemonBeganChargingPower_Ally",
  clampedPokemon: "PokemonClampedPokemon_AllyAlly",
  cutItsOwnHPAndLaidACurseOnPokemon: "PokemonCutItsOwnHPAndLaidACurseOnPokemon_AllyAlly",
  moveWasDisabled: "PokemonsMoveWasDisabled_Ally",
  isNoLongerDisabled: "PokemonIsNoLongerDisabled_Ally",
  choseMoveAsItsDestiny: "PokemonChoseMoveAsItsDestiny_Ally",
  cantUseItemsAnymore: "PokemonCantUseItemsAnymore_Ally",
  canUseItemsAgain: "PokemonCanUseItemsAgain_Ally",
  receivedAnEncore: "PokemonReceivedAnEncore_Ally",
  encoreEnded: "PokemonsEncoreEnded_Ally",
  wasTrappedInAVortex: "PokemonWasTrappedInAVortex_Ally",
  isGettingPumped: "PokemonIsGettingPumped_Ally",
  foresawAnAttack: "PokemonForesawAnAttack_Ally",
  wasPreventedFromHealing: "PokemonWasPreventedFromHealing_Ally",
  sealedTheOpponentsMoves: "PokemonSealedTheOpponentsMoves_Ally",
  plantedItsRoots: "PokemonPlantedItsRoots_Ally",
  wasSeeded: "PokemonWasSeeded_Ally",
  wasFreedFromMove: "PokemonWasFreedFromMove_Ally",
  becameTrappedBySwirlingMagma: "PokemonBecameTrappedBySwirlingMagma_Ally",
  levitatedOnElectromagnetism: "PokemonLevitatedOnElectromagnetism_Ally",
  electromagnetismWoreOff: "PokemonsElectromagnetismWoreOff_Ally",
  learnedMove2: "PokemonLearnedMove2_Ally",
  identifiedPokemon: "PokemonIdentifiedPokemon_AllyAlly",
  beganHavingANightmare: "PokemonBeganHavingANightmare_Ally",
  switchedItsAttackAndDefense: "PokemonSwitchedItsAttackAndDefense_Ally",
  wasTrappedBySandTomb: "PokemonWasTrappedBySandTomb_Ally",
  stockpiledX: "PokemonStockpiledX_Ally",
  stockpiledEffectWoreOff: "PokemonsStockpiledEffectWoreOff_Ally",
  madeASubstitute: "PokemonMadeASubstitute_Ally",
  substituteFaded: "PokemonsSubstituteFaded_Ally",
  fellForTheTaunt: "PokemonFellForTheTaunt_Ally",
  tauntWoreOff: "PokemonsTauntWoreOff_Ally",
  wasSubjectedToTorment: "PokemonWasSubjectedToTorment_Ally",
  moveWoreOff: "PokemonsMoveWoreOff_Ally",
  causedAnUproar: "PokemonCausedAnUproar_Ally",
  calmedDown: "PokemonCalmedDown_Ally",
  wasWrappedByPokemon: "PokemonWasWrappedByPokemon_AllyAlly",
  madePokemonDrowsy: "PokemonMadePokemonDrowsy_AllyAlly",
  becameConfused: "PokemonBecameConfused_Ally",
  snappedOutOfConfusion: "PokemonSnappedOutOfConfusion_Ally",
  abilityRaisedThePowerOfItsFireTypeMoves: "PokemonsAbilityRaisedThePowerOfItsFireTypeMoves_Ally",
  isExertingItsAbility: "PokemonIsExertingItsAbility_Ally",
  cantGetItGoingBecauseOfItsAbility: "PokemonCantGetItGoingBecauseOfItsAbility_Ally",
  finallyGotItsActTogether: "PokemonFinallyGotItsActTogether_Ally",
  moveRaisedYourTeamsSpecialDefense: "MoveRaisedYourTeamsSpecialDefense",
  moveRaisedYourTeamsDefense: "MoveRaisedYourTeamsDefense",
  yourTeamBecameCloakedInAMysticalVeil: "YourTeamBecameCloakedInAMysticalVeil",
  yourTeamIsNoLongerProtectedBySafeguard: "YourTeamIsNoLongerProtectedBySafeguard",
  yourTeamBecameShroudedInMist: "YourTeamBecameShroudedInMist",
  yourTeamsMoveEffectWoreOff: "YourTeamsMoveEffectWoreOff",
  spikesWereScatteredAllAroundYourTeamsFeet: "SpikesWereScatteredAllAroundYourTeamsFeet",
  poisonSpikesWereScatteredAllAroundYourTeamsFeet: "PoisonSpikesWereScatteredAllAroundYourTeamsFeet",
  thePoisonSpikesDisappearedFromAroundYourTeamsFeet: "ThePoisonSpikesDisappearedFromAroundYourTeamsFeet",
  pointedStonesFloatInTheAirAroundYourTeam: "PointedStonesFloatInTheAirAroundYourTeam",
  theTailwindBlewFromBehindYourTeam: "TheTailwindBlewFromBehindYourTeam",
  yourTeamsTailwindPeteredOut: "YourTeamsTailwindPeteredOut",
  theLuckyChantShieldedYourTeamFromCriticalHits: "TheLuckyChantShieldedYourTeamFromCriticalHits",
  yourTeamsLuckyChantWoreOff: "YourTeamsLuckyChantWoreOff",
  twistedTheDimensions: "PokemonTwistedTheDimensions_Ally",
  restoredTheTwistedDimensions: "PokemonRestoredTheTwistedDimensions_Ally",
  gravityIntensified: "GravityIntensified",
  goPokemon: "GoPokemon",
  aWildPokemonAppeared: "AWildPokemonAppeared",
  wasDraggedOut: "PokemonWasDraggedOut_Ally",
  pokemonFainted: "PokemonFainted_Ally",
  itsSuperEffective: "ItsSuperEffective",
  itsNotVeryEffective: "ItsNotVeryEffective",
  itDoesntAffectPokemon: "ItDoesntAffectPokemon_Ally",
  aCriticalHit: "ACriticalHit",
  pokemonAvoidedTheAttack: "PokemonAvoidedTheAttack_Ally",
  pokemonsAttackMissed: "PokemonsAttackMissed_Ally",
  butItFailed: "ButItFailed",
  pokemonRegainedHealth: "PokemonRegainedHealth_Ally",
  pokemonFellAsleep: "PokemonFellAsleep_Ally",
  pokemonWasPoisoned: "PokemonWasPoisoned_Ally",
  pokemonWasBadlyPoisoned: "PokemonWasBadlyPoisoned_Ally",
  pokemonWasBurned: "PokemonWasBurned_Ally",
  pokemonWasFrozenSolid: "PokemonWasFrozenSolid_Ally",
  pokemonIsParalyzedItMayBeUnableToMove: "PokemonIsParalyzedItMayBeUnableToMove_Ally",
  pokemonWokeUp: "PokemonWokeUp",
  pokemonWasCuredOfItsPoisoning: "PokemonWasCuredOfItsPoisoning",
  pokemonsBurnWasHealed: "PokemonsBurnWasHealed",
  pokemonThawedOut: "PokemonThawedOut_Ally",
  pokemonWasHealedOfParalysis: "PokemonWasHealedOfParalysis_Ally",
  pokemonIsFastAsleep: "PokemonIsFastAsleep_Ally",
  pokemonIsFrozenSolid: "PokemonIsFrozenSolid_Ally",
  pokemonIsParalyzedItCantMove: "PokemonIsParalyzedItCantMove_Ally",
  pokemonFlinched: "PokemonFlinched_Ally",
  pokemonMustRecharge: "PokemonMustRecharge_Ally",
  cantUseMoveAfterTheTaunt: "PokemonCantUseMoveAfterTheTaunt_Ally",
  pokemonIsImmobilizedByLove: "PokemonIsImmobilizedByLove_Ally",
  pokemonsStatRose: "PokemonsStatRose_Ally",
  pokemonsStatSharplyRose: "PokemonsStatSharplyRose_Ally",
  pokemonsStatFell: "PokemonsStatFell_Ally",
  pokemonsStatHarshlyFell: "PokemonsStatHarshlyFell_Ally",
  allStatChangesWereEliminated: "AllStatChangesWereEliminated",
  itStartedToRain: "ItStartedToRain",
  rainContinuesToFall: "RainContinuesToFall",
  theRainStopped: "TheRainStopped",
  aSandstormBrewed: "ASandstormBrewed",
  theSandstormRages: "TheSandstormRages",
  theSandstormSubsided: "TheSandstormSubsided",
  theSunlightTurnedHarsh: "TheSunlightTurnedHarsh",
  theSunlightIsStrong: "TheSunlightIsStrong",
  theSunlightFaded: "TheSunlightFaded",
  itStartedToHail: "ItStartedToHail",
  hailContinuesToFall: "HailContinuesToFall",
  theHailStopped: "TheHailStopped",
  isBuffetedByTheWeather: "PokemonIsBuffetedByTheWeather_Ally",
  pokemonIsHurtByPoison: "PokemonIsHurtByPoison_Ally",
  pokemonIsHurtByItsBurn: "PokemonIsHurtByItsBurn_Ally",
  gotchaPokemonWasCaught: "GotchaPokemonWasCaught",
  ohNoThePokemonBrokeFree: "OhNoThePokemonBrokeFree",
  gotAwaySafely: "GotAwaySafely",
  cantEscape: "CantEscape",
  gravityReturnedToNormal: "GravityReturnedToNormal",
  pokemonIsHurtByMove: "PokemonIsHurtByMove_Ally",
  healthIsSappedByLeechSeed: "PokemonsHealthIsSappedByLeechSeed_Ally",
  isHurtByTheSpikes: "PokemonIsHurtByTheSpikes_Ally",
  pointedStonesDugIntoPokemon: "PointedStonesDugIntoPokemon_Ally",
  pokemonGainedExpPoints: "PokemonGainedExpPoints",
  pokemonGrewToLevel: "PokemonGrewToLevel",
  pokemonLearnedMove: "PokemonLearnedMove",
  pokemonIsTryingToLearnMove: "PokemonIsTryingToLearnMove",
  playerGotMoneyForWinning: "PlayerGotMoneyForWinning",
  pokemonIgnoredOrdersWhileAsleep: "PokemonIgnoredOrdersWhileAsleep",
  pokemonIgnoredOrders: "PokemonIgnoredOrders",
  pokemonBeganToNap: "PokemonBeganToNap",
  pokemonIsLoafingAround: "PokemonIsLoafingAround",
  pokemonWontObey: "PokemonWontObey",
  itHurtItselfInItsConfusion: "ItHurtItselfInItsConfusion",
  theWildPokemonFled: "TheWildPokemonFled",
  playerThrewSomeBaitAtThePokemon: "PlayerThrewSomeBaitAtThePokemon",
  pokemonIsEating: "PokemonIsEating",
  pokemonIsBusyEating: "PokemonIsBusyEating",
  playerThrewMudAtThePokemon: "PlayerThrewMudAtThePokemon",
  pokemonIsAngry: "PokemonIsAngry",
  pokemonIsBesideItselfWithAnger: "PokemonIsBesideItselfWithAnger",
  pokemonIsWatchingCarefully: "PokemonIsWatchingCarefully",
  playerUsedOneItem: "PlayerUsedOneItem",
  youAreChallengedByTr: "YouAreChallengedByTr",
  youAreChallengedByLinkTr: "YouAreChallengedByLinkTr",
  playerDefeatedTr: "PlayerDefeatedTr",
  playerDefeatedLinkTr: "PlayerDefeatedLinkTr",
  trSentOutPokemon: "TrSentOutPokemon",
  linkTrSentOutPokemon: "LinkTrSentOutPokemon",
  trUsedOneItem: "TrUsedOneItem",
  willYouSwitchYourPokemon: "WillYouSwitchYourPokemon",
  playerBlackedOut: "PlayerBlackedOut",
  theTrainerBlockedTheBall: "TheTrainerBlockedTheBall",
}

describe('배틀 글 줄 번호', () => {
  it('뱅크가 battle_strings다', () => {
    expect(BATTLE_BANK).toBe(bankIndex('battle_strings', 'us'))
  })

  it('이름표가 뱅크 길이와 같다', () => {
    // 미국·한국·일본 롬 셋 다 1,269줄이다. 이름표가 그보다 짧으면 뒤쪽 번호가
    // 조용히 범위 밖이 된다
    expect(BATTLE_STRING_ORDER).toHaveLength(1269)
  })

  for (const [key, name] of Object.entries(NAMED) as [keyof typeof MSG, string][]) {
    it(`${key}는 ${name}이다`, () => {
      expect(MSG[key]).toBe(battleMessage(name))
    })
  }

  it('진영 줄은 우리 편 바로 다음이 상대다', () => {
    // ⚠️ **이 +1이 유일하게 자리를 세는 자리다.** 한 칸이라도 어긋나면 상대가
    // 리플렉터를 깔았을 때 「우리 편은…」이 뜬다 — 글자가 나오므로 눈으로는 넘어간다
    for (const key of SIDE_KEYS) {
      const mine = BATTLE_STRING_ORDER[MSG[key]]!
      const theirs = BATTLE_STRING_ORDER[forSide(MSG[key], false)]!
      expect(mine, key).toMatch(/Your|TheFeetOfTheFoes/)
      expect(theirs, key).toMatch(/Foe|Enemy/)
    }
    expect(SIDE_KEYS).toHaveLength(14)
  })

  it('이름을 안 적어 둔 번호가 없다', () => {
    // 새 줄을 놓으면서 이름을 안 적으면 그 번호는 아무도 안 잰다
    expect(Object.keys(MSG).sort()).toEqual(Object.keys(NAMED).sort())
  })
})

withData('dialogue/ko/' + String(MOVE_BANK) + '.json')('기술을 쓰는 줄', () => {
  const read = (at: string): string[] =>
    JSON.parse(readFileSync(resolve(DATA, at), 'utf8')) as string[]

  it('자리는 기술 번호 곱하기 셋이다', () => {
    // ⚠️ **이 곱셈이 이 뱅크의 전부다.** 한 칸만 밀려도 몸통박치기를 쓸 때
    // 누르기가 뜨는데, 글자가 나오므로 눈으로는 안 보인다. 그래서 롬이 스스로
    // 답하게 한다 — **기술 이름표의 이름이 제 자리 줄 안에 들어 있는가**
    const lines = read('dialogue/ko/' + String(MOVE_BANK) + '.json')
    const names = read('names/moves.ko.json')
    const wrong: string[] = []
    let checked = 0
    for (const [id, name] of names.entries()) {
      if (id === 0 || !name) continue
      const line = lines[moveUsedLine(id)]
      checked++
      if (line === undefined || !line.includes(name)) wrong.push(String(id) + ' ' + name)
    }
    expect(wrong, wrong.slice(0, 5).join(' / ')).toEqual([])
    expect(checked).toBe(467)

    // 그 다음 둘이 야생 줄과 상대 줄이다 — 우리는 이름표가 자리 표시를 붙이므로
    // 맨 줄만 쓴다
    expect(lines[moveUsedLine(33) + 1]).toMatch(/^야생 /)
    expect(lines[moveUsedLine(33) + 2]).toMatch(/^상대 /)
    expect(lines).toHaveLength(1404)
  })
})

// ── 배틀 **안**의 두 화면 (PARITY §2.26) ────────────────────────────────────

/** `BAG`의 키 → 디컴프가 그 줄에 붙인 이름 (`BattleBag_Text_` 뒤) */
const BAG_NAMED: Record<keyof typeof BAG, string> = {
  pocketRestore: 'PocketNameRestore',
  pocketStatus: 'PocketNameStatus',
  pocketBalls: 'PocketNamePokeBalls',
  pocketBattleItems: 'PocketNameBattleItems',
  embargoBlockingItemUse: 'EmbargoBlockingItemUse',
}

/** `PARTY`의 키 → 디컴프가 그 줄에 붙인 이름 (`BattleParty_Text_` 뒤) */
const PARTY_NAMED: Record<keyof typeof PARTY, string> = {
  chooseAPokemon: 'ChooseAPokemon',
  useOnWhichPokemon: 'UseOnWhichPokemon',
  cantSwitchWithPokemonAlreadyInBattle: 'CantSwitchWithPokemonAlreadyInBattle',
  cantSwitchWithFaintedPokemon: 'CantSwitchWithFaintedPokemon',
  cantSwitchPokemon: 'CantSwitchPokemon',
  itemWontHaveAnyEffect: 'ItemWontHaveAnyEffect',
  restoreWhichMove: 'RestoreWhichMove',
  embargoPreventsItemUse: 'EmbargoPreventsItemUse',
}

describe('배틀 안 가방·파티의 줄 번호', () => {
  it('뱅크가 battle_bag과 battle_party다', () => {
    expect(BAG_BANK).toBe(bankIndex('battle_bag', 'us'))
    expect(PARTY_BANK).toBe(bankIndex('battle_party', 'us'))
  })

  it('이름표가 뱅크 길이와 같다', () => {
    expect(BATTLE_BAG_ORDER).toHaveLength(49)
    expect(BATTLE_PARTY_ORDER).toHaveLength(96)
  })

  for (const [key, name] of Object.entries(BAG_NAMED) as [keyof typeof BAG, string][]) {
    it(`가방 ${key}는 ${name}이다`, () => {
      expect(BAG[key]).toBe(bagMessage(name))
    })
  }

  for (const [key, name] of Object.entries(PARTY_NAMED) as [keyof typeof PARTY, string][]) {
    it(`파티 ${key}는 ${name}이다`, () => {
      expect(PARTY[key]).toBe(partyMessage(name))
    })
  }

  it('이름을 안 적어 둔 번호가 없다', () => {
    expect(Object.keys(BAG).sort()).toEqual(Object.keys(BAG_NAMED).sort())
    expect(Object.keys(PARTY).sort()).toEqual(Object.keys(PARTY_NAMED).sort())
  })
})

withData('dialogue/ko/' + String(BAG_BANK) + '.json')('배틀 안 가방의 글', () => {
  const read = (at: string): string[] =>
    JSON.parse(readFileSync(resolve(DATA, at), 'utf8')) as string[]

  it('주머니 이름 넷이 우리가 들고 있던 것과 같다', () => {
    // ⚠️ **같아서 안 고쳤다는 것을 여기 못박는다.** 손으로 든 배틀 글 마흔여덟 중
    // 일곱만 맞았던 자리와 달리 이 넷은 글자까지 같았다 — 그래도 롬에서 읽는다.
    // 손으로 들면 로케일을 바꿔도 한국어가 남는다
    const lines = read('dialogue/ko/' + String(BAG_BANK) + '.json')
    expect(lines[BAG.pocketRestore]).toBe('회복')
    expect(lines[BAG.pocketStatus]).toBe('상태')
    expect(lines[BAG.pocketBalls]).toBe('볼')
    expect(lines[BAG.pocketBattleItems]).toBe('배틀용')
    expect(lines).toHaveLength(49)
  })

  it('금제 줄의 빈칸은 이름 하나와 기술 하나다', () => {
    const lines = read('dialogue/ko/' + String(BAG_BANK) + '.json')
    const line = lines[BAG.embargoBlockingItemUse]!
    // 0번 칸이 이름, 1번 칸이 기술 이름이다 (`battle_bag.c`의 `TryUseItem`)
    expect(line).toContain('{STRVAR_1 1, 0, 0}')
    expect(line).toContain('{STRVAR_1 6, 1, 0}')
  })
})

withData('dialogue/ko/' + String(PARTY_BANK) + '.json')('배틀 안 파티의 글', () => {
  const read = (at: string): string[] =>
    JSON.parse(readFileSync(resolve(DATA, at), 'utf8')) as string[]

  it('못 고르는 두 줄이 이름을 빈칸으로 받는다', () => {
    // 이름이 안 풀리면 `romLine`이 문장을 통째로 비운다 — 조사가 뒤에 붙어서다
    const lines = read('dialogue/ko/' + String(PARTY_BANK) + '.json')
    expect(lines[PARTY.cantSwitchWithFaintedPokemon]).toContain('{STRVAR_1 1, 0, 1}')
    expect(lines[PARTY.cantSwitchWithPokemonAlreadyInBattle]).toContain('{STRVAR_1 1, 0, 1}')
    expect(lines).toHaveLength(96)
  })

  it('고르라는 두 줄에는 빈칸이 없다', () => {
    const lines = read('dialogue/ko/' + String(PARTY_BANK) + '.json')
    expect(lines[PARTY.chooseAPokemon]).toBe('포켓몬을 선택해 주십시오')
    expect(lines[PARTY.useOnWhichPokemon]).toBe('어느 포켓몬에게 쓰겠습니까?')
    expect(lines[PARTY.restoreWhichMove]).toBe('어느 기술을 회복하겠습니까?')
  })
})

withData('dialogue/ko/551.json')('랭크 이름표', () => {
  it('STAT_SLOT이 가리키는 자리가 그 능력의 이름이다', () => {
    // 배틀 로그와 배틀 가방이 같은 표를 읽는다. 한 칸 밀리면 「방어가 올라갔다」가
    // 「스피드가 올라갔다」로 뜨는데 글자가 나오므로 눈으로는 안 보인다
    const lines = JSON.parse(
      readFileSync(resolve(DATA, 'dialogue/ko/551.json'), 'utf8'),
    ) as string[]
    expect(lines[STAT_SLOT.atk]).toBe('공격')
    expect(lines[STAT_SLOT.def]).toBe('방어')
    expect(lines[STAT_SLOT.spe]).toBe('스피드')
    expect(lines[STAT_SLOT.spa]).toBe('특수공격')
    expect(lines[STAT_SLOT.spd]).toBe('특수방어')
    expect(lines[STAT_SLOT.accuracy]).toBe('명중률')
    expect(lines[STAT_SLOT.evasion]).toBe('회피율')
  })
})
