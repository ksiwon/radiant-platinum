import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { battleSongFor, TRAINER_CLASS, trainerVictorySong, VICTORY } from './battleSongs'

const C = TRAINER_CLASS
const trainer = (trainerClass: number, doubles = false) =>
  battleSongFor({ kind: 'trainer', trainerClass, doubles, foeSpecies: 0, mapId: 0 })

describe('배틀 곡 — 분류가 고른다', () => {
  it('관장 · 사천왕 · 챔피언 · 라이벌 · 갤럭시단 셋', () => {
    expect(trainer(C.leaderRoark)).toBe(1117)
    expect(trainer(C.eliteFourLucian)).toBe(1136)
    expect(trainer(C.championCynthia)).toBe(1122)
    expect(trainer(C.rival)).toBe(1124)
    expect(trainer(C.galacticGruntFemale)).toBe(1123)
    expect(trainer(C.commanderSaturn)).toBe(1134)
    expect(trainer(C.galacticBoss)).toBe(1120)
    expect(trainer(1)).toBe(1119)
  })

  it('더블은 전기 관장만 관장 곡 · 갤럭시단은 더블이어도 제 곡', () => {
    expect(trainer(C.leaderVolkner, true)).toBe(1117)
    expect(trainer(C.rival, true)).toBe(1119)
    expect(trainer(C.commanderMars, true)).toBe(1134)
  })

  it('시설은 브레인만 제 곡이다', () => {
    const factory = (trainerClass: number) =>
      battleSongFor({ kind: 'factory', trainerClass, doubles: false, foeSpecies: 0, mapId: 0 })
    expect(factory(C.factoryHead)).toBe(1202)
    expect(factory(C.leaderRoark)).toBe(1119)
  })

  it('야생은 종족이 고른다', () => {
    expect(battleSongFor({ kind: 'wild', trainerClass: null, doubles: false, foeSpecies: 487, mapId: 0 })).toBe(1201)
    expect(battleSongFor({ kind: 'wild', trainerClass: null, doubles: true, foeSpecies: 399, mapId: 0 })).toBe(1116)
  })

  it('승리 곡', () => {
    expect(trainerVictorySong(C.leaderByron)).toBe(VICTORY.gymLeader)
    expect(trainerVictorySong(C.commanderJupiter)).toBe(VICTORY.galacticGrunt)
    expect(trainerVictorySong(C.galacticBoss)).toBe(VICTORY.cyrus)
    expect(trainerVictorySong(C.rival)).toBe(VICTORY.trainer)
    expect(trainerVictorySong(C.arcadeStar)).toBe(VICTORY.frontierBrain)
  })
})

const CLASSES = 'raw/decomp/generated/trainer_classes.txt'
const SDAT = 'raw/decomp/generated/sdat.txt'
const ENC = 'raw/decomp/src/enc_effects.c'

describe.runIf(existsSync(CLASSES) && existsSync(SDAT) && existsSync(ENC))('원작과 맞대기', () => {
  it('분류 번호', () => {
    const lines = readFileSync(CLASSES, 'utf8').split(/\r?\n/)
    const camel = (s: string): string => s.toLowerCase().replace(/_(\w)/g, (_, c: string) => c.toUpperCase())
    for (const [name, id] of Object.entries(C)) {
      const at = lines.findIndex((l) => camel(l.replace(/^TRAINER_CLASS_/, '')) === name)
      expect(at, name).toBe(id)
    }
  })

  it('곡 번호 — sdat.txt를 닻으로 센다', () => {
    const ids = new Map<string, number>()
    let n = -1
    for (const raw of readFileSync(SDAT, 'utf8').split(/\r?\n/)) {
      const t = raw.trim()
      if (t === '' || t.startsWith('#') || t.startsWith('//')) continue
      const anchor = /^(\w+)\s*=\s*(\d+)/.exec(t)
      if (anchor) { n = Number(anchor[2]); ids.set(anchor[1]!, n); continue }
      const word = /^(\w+)/.exec(t)
      if (word) ids.set(word[1]!, ++n)
    }
    expect(ids.get('SEQ_BATTLE_GYM_LEADER')).toBe(trainer(C.leaderWake))
    expect(ids.get('SEQ_BATTLE_ELITE_FOUR')).toBe(trainer(C.eliteFourFlint))
    expect(ids.get('SEQ_BATTLE_GALACTIC_CMDR')).toBe(trainer(C.commanderMars))
    expect(ids.get('SEQ_BATTLE_CYRUS')).toBe(trainer(C.galacticBoss))
    expect(ids.get('SEQ_BATTLE_FRONTIER_BRAIN')).toBe(1202)
    expect(ids.get('SEQ_VICTORY_WILD_POKEMON')).toBe(VICTORY.wild)
    expect(ids.get('SEQ_VICTORY_ELITE_FOUR')).toBe(VICTORY.eliteFour)
    expect(ids.get('SEQ_VICTORY_FRONTIER_BRAIN')).toBe(VICTORY.frontierBrain)
  })

  it('더블은 전기 관장만 남긴다 (`ENCEFF_DOUBLE_LEADER`)', () => {
    expect(readFileSync(ENC, 'utf8')).toMatch(/if \(trainerEffect == ENCEFF_LEADER_VOLKNER\) \{\s*return ENCEFF_DOUBLE_LEADER;/)
  })
})
