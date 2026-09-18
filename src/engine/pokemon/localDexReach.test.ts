// 신오도감 210종 — **볼 길이 하나라도 있는가** (전국도감 조건)
//
// 원작은 신오도감을 **본 수가 210**이 되어야 전국도감을 준다 — `LOCAL_DEX_GOAL`이
// `REGIONAL_DEX_COUNT - NUM_EXCLUDED_LOCAL`이고 뺄 종이 없다(`sExcludedMonsLocal = {}`,
// `pokedex.c`). 엔딩 뒤 이야기가 그 열쇠에 걸려 있다.
//
// ⚠️ **우리는 원작의 일부를 막아 두었다** — 지하통로·통신·콘테스트·포켓트레·GBA
// 슬롯(PARITY §9). 원작에서 **그 길로만 볼 수 있는 종**이 있으면 이야기가 거기서
// 멈춘다. 그래서 막은 길을 빼고 센다. 실측(2026-09-19): 야생·꿀나무·대습원·교환·
// 진화로 156 · 트레이너(첫 대전)로 46 · 스크립트로 8(창기둥 연출 · 고정 배틀 ·
// 대저택 책 · 진실동굴) — 빈 자리 0
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { DATA, withData, withDecomp } from '../../data/romData.testkit'

const DECOMP = resolve(__dirname, '../../../raw/decomp')
const read = (p: string) => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

/** 스크립트가 종을 「봤다」로 적는 명령 — 배틀에 들어오면 `Pokedex_Encounter`가 적는다 */
const MEETS = /^\s+(StartWildBattle|StartLegendaryBattle|StartGiratinaOriginBattle|SetSpeciesSeen|DrawPokemonPreview|GivePokemon|GiveEgg) (SPECIES_[A-Z0-9_]+)/gm

withData('pokedexSort.ko.json', 'encounters.json', 'encountersEx.json', 'trainers.json', 'npcTrades.json', 'species.json')(
  '전국도감에 닿는 길', () => {
    withDecomp('generated/species.txt', 'generated/trainers.txt', 'res/field/scripts')('디컴프와 함께', () => {
      it('⚠️ 막아 둔 길을 빼도 신오 210종을 다 볼 수 있다', () => {
        const sinnoh = read('pokedexSort.ko.json').lists.sinnoh as number[]
        expect(sinnoh.length).toBe(210)
        const seen = new Set<number>()
        const catchable = new Set<number>()
        // 야생 — 포켓트레(전국 뒤)·GBA 슬롯(범위 밖)·대량발생(TV가 알려 줘야 연다)은 안 센다
        for (const t of read('encounters.json').tables) {
          for (const s of [...t.land.map((x: { species: number }) => x.species), ...t.day, ...t.night,
            ...['surf', 'oldRod', 'goodRod', 'superRod'].flatMap((k) => t[k].slots.map((x: { species: number }) => x.species))]) {
            catchable.add(s)
          }
        }
        const ex = read('encountersEx.json')
        catchable.add(ex.feebas.species)
        for (const v of Object.values(ex.honeyTree) as number[][]) for (const s of v) catchable.add(s)
        // 대습원은 전국도감 **전** 표만 (`local`)
        for (const s of ex.greatMarsh.local) catchable.add(s)
        for (const t of read('npcTrades.json').trades) catchable.add(t.species)
        // 진화 — 잡을 수 있는 것에서 이어진 것
        const evo = new Map<number, number[]>((read('species.json').species as { id: number, evolutions?: { to: number }[] }[])
          .map((s) => [s.id, (s.evolutions ?? []).map((e) => e.to).filter((x) => x > 0)]))
        const queue = [...catchable]
        while (queue.length > 0) {
          for (const to of evo.get(queue.pop()!) ?? []) if (!catchable.has(to)) { catchable.add(to); queue.push(to) }
        }
        for (const s of catchable) seen.add(s)
        // 트레이너 — **재대전이 아닌** 첫 대전만 (이름표로 가른다)
        const names = readFileSync(resolve(DECOMP, 'generated/trainers.txt'), 'utf8').split(/\r?\n/)
        for (const tr of read('trainers.json').trainers as { id: number, party: { species: number }[] }[]) {
          if (/REMATCH/.test(names[tr.id] ?? '')) continue
          for (const p of tr.party) seen.add(p.species)
        }
        // 스크립트 — 고정 배틀·연출·선물
        const species = readFileSync(resolve(DECOMP, 'generated/species.txt'), 'utf8').split(/\r?\n/)
        const dir = resolve(DECOMP, 'res/field/scripts')
        for (const f of readdirSync(dir)) {
          if (!f.endsWith('.s')) continue
          for (const m of readFileSync(resolve(dir, f), 'utf8').matchAll(MEETS)) {
            const id = species.indexOf(m[2]!)
            if (id > 0) seen.add(id)
          }
        }
        seen.delete(0)
        const missing = sinnoh.filter((s) => !seen.has(s))
        expect(missing, '볼 길이 없는 신오 종').toEqual([])
      })
    })
  })
