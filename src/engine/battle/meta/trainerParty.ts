// 트레이너 파티 조립 (DATA.md §2.9 → PLAN §7.6)
//
// 롬의 트레이너 개체는 야생과 다른 모양이다. 개체값 대신 **난이도 바이트 하나**를
// 갖고, 기술은 지정돼 있거나 아예 없다(없으면 그 레벨의 레벨업 기술로 싸운다).
import type { Species, TrainerMon } from '../../../data/schema'
import { expForLevel } from '../../pokemon/exp'
import { wildMoves, type MoveSlot, type PokemonInstance } from '../../pokemon/instance'
import { noOrigin } from '../../pokemon/origin'

/**
 * 난이도 바이트 → 여섯 능력치 공통 개체값.
 *
 * 롬은 개체값 여섯 개를 따로 안 담고 0~255 한 바이트만 담는다. 관장급은 200~250,
 * 잡트레이너는 0이다 — 그래서 이 바이트 하나가 곧 그 트레이너의 강함이다
 */
export function trainerIv(difficulty: number): number {
  return Math.floor((Math.max(0, Math.min(255, difficulty)) * 31) / 255)
}

/**
 * 트레이너 개체의 PID.
 *
 * **성격 보정을 안 받게 만든다.** 카트리지의 PID 유도식을 재현하지 않았으므로
 * 무작위로 정하면 같은 관장이 판마다 다른 능력치로 나온다 — 25의 배수로 두면
 * `pid % 25 == 0`이라 성격이 노력(무보정)으로 고정된다. 특성 칸은 그 위에서
 * 갈리므로(`pid & 1`) 두 특성 중 하나는 여전히 정해진다.
 */
function trainerPid(trainerId: number, slot: number, mon: TrainerMon): number {
  // 트레이너·자리·종족·레벨이 같으면 언제나 같은 개체가 나온다
  const h = (trainerId * 0x9e37 + slot * 0x2f1b + mon.species * 0x51 + mon.level) >>> 0
  return (h % 0x28f5c2) * 25
}

/**
 * 롬 트레이너 개체 → 우리 개체 모델.
 *
 * 기술이 지정돼 있지 않으면 그 레벨의 레벨업 기술을 쓴다 — 928명 중 676명이
 * 그렇다. PP는 기술 데이터를 여기서 모르므로 부르는 쪽이 채운다
 */
export function trainerMonToInstance(
  mon: TrainerMon,
  species: Species,
  trainerId: number,
  slot: number,
): PokemonInstance {
  const iv = trainerIv(mon.ivs)
  const moves: MoveSlot[] = mon.moves.length
    ? mon.moves.map((move) => ({ move, pp: 0, ppUps: 0 }))
    : wildMoves(species, mon.level)

  return {
    species: mon.species,
    pid: trainerPid(trainerId, slot, mon),
    nickname: null,
    exp: expForLevel(species.growthRate, mon.level),
    level: mon.level,
    ivs: { hp: iv, atk: iv, def: iv, spa: iv, spd: iv, spe: iv },
    evs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
    moves,
    // 부르는 쪽이 statsOf로 채운다
    hp: 0,
    status: 'ok',
    statusTurns: 0,
    heldItem: mon.item ?? 0,
    friendship: species.baseFriendship,
    isEgg: false,
    // 트레이너 개체는 잡을 수 없으므로 원트레이너가 의미 없다
    otId: 0,
    otSecretId: 0,
    ball: 0,
    // 같은 까닭으로 출신도 안 남는다. 세이브에 안 들어가는 개체다
    origin: noOrigin({ name: '', gender: 'male' }),
  }
}
