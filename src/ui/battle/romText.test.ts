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
import { describe, expect, it } from 'vitest'
import { BATTLE_STRING_ORDER, battleMessage } from '../../import/platinum/battleStrings'
import { bankIndex } from '../../import/platinum/textBanks'
import { BATTLE_BANK, forSide, MSG, SIDE_KEYS } from './romText'

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
