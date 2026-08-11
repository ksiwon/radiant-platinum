// @ts-nocheck
/**
 * ⚠️ **생성물이다. 손으로 고치지 않는다** — `tools/distribution/mechanics/bake.mjs`가
 * `@pkmn/sim`(MIT, Guangcong Luo 외)의 4세대 표를 평탄화해 구운 것이다.
 *
 * 특성 효과. 번호와 이름은 롬이 준다
 *
 * **수치와 이름은 여기 없다.** 그것은 사용자의 롬에서 오고
 * (`src/engine/battle/dex/provider.ts`), 여기 있는 것은 효과 **구현**뿐이다.
 * 왜 그렇게 갈랐는지는 COPYRIGHT.md §2.9 · DEPLOY.md §4.
 */
import type { Mechanics } from '../mechanics'

export const ABILITY_MECHANICS: Record<string, Mechanics> = {
  adaptability: {
    onModifySTAB(stab, source, target, move) {
            if (move.forceSTAB || source.hasType(move.type)) {
                if (stab === 2) {
                    return 2.25;
                }
                return 2;
            }
        },
    flags: {},
  },
  aftermath: {
    onDamagingHitOrder: 1,
    onDamagingHit(damage, target, source, move) {
            if (move.flags['contact'] && !target.hp) {
                this.damage(source.baseMaxhp / 4, source, target, null, true);
            }
        },
    flags: {},
  },
  airlock: {
    onStart(pokemon) {
            pokemon.abilityState.ending = false;
        },
    onEnd(pokemon) {
            pokemon.abilityState.ending = true;
            this.eachEvent('WeatherChange', this.effect);
        },
    suppressWeather: true,
    flags: {},
  },
  angerpoint: {
    onHit(target, source, move) {
            if (!target.hp)
                return;
            if (move?.effectType === 'Move' && target.getMoveHitData(move).crit) {
                this.boost({ atk: 12 }, target, target);
            }
        },
    flags: {},
    onAfterSubDamage(damage, target, source, move) {
            if (!target.hp)
                return;
            if (move && move.effectType === 'Move' && target.getMoveHitData(move).crit) {
                target.setBoost({ atk: 6 });
                this.add('-setboost', target, 'atk', 12, '[from] ability: Anger Point');
            }
        },
  },
  anticipation: {
    onStart(pokemon) {
            for (const target of pokemon.foes()) {
                for (const moveSlot of target.moveSlots) {
                    const move = this.dex.moves.get(moveSlot.move);
                    if (move.category !== 'Status' && (this.dex.getImmunity(move.type, pokemon) && this.dex.getEffectiveness(move.type, pokemon) > 0 ||
                        move.ohko)) {
                        this.add('-ability', pokemon, 'Anticipation');
                        return;
                    }
                }
            }
        },
    flags: {},
  },
  arenatrap: {
    onFoeTrapPokemon(pokemon) {
            if (!pokemon.isAdjacent(this.effectState.target))
                return;
            if (pokemon.isGrounded()) {
                pokemon.tryTrap(true);
            }
        },
    onFoeMaybeTrapPokemon(pokemon, source) {
            if (!source)
                source = this.effectState.target;
            if (!source || !pokemon.isAdjacent(source))
                return;
            if (pokemon.isGrounded(!pokemon.knownType)) { // Negate immunity if the type is unknown
                pokemon.maybeTrapped = true;
            }
        },
    flags: {},
  },
  baddreams: {
    onResidualOrder: 10,
    onResidualSubOrder: 10,
    onResidual(pokemon) {
            if (!pokemon.hp)
                return;
            for (const target of pokemon.foes()) {
                if (target.status === 'slp' || target.hasAbility('comatose')) {
                    this.damage(target.baseMaxhp / 8, target, pokemon);
                }
            }
        },
    flags: {},
  },
  battlearmor: {
    onCriticalHit: false,
    flags: {
      breakable: 1,
    },
  },
  blaze: {
    onModifyAtkPriority: 5,
    onModifySpAPriority: 5,
    flags: {},
    onBasePowerPriority: 2,
    onBasePower(basePower, attacker, defender, move) {
            if (move.type === 'Fire' && attacker.hp <= attacker.maxhp / 3) {
                this.debug('Blaze boost');
                return this.chainModify(1.5);
            }
        },
  },
  chlorophyll: {
    onModifySpe(spe, pokemon) {
            if (['sunnyday', 'desolateland'].includes(pokemon.effectiveWeather())) {
                return this.chainModify(2);
            }
        },
    flags: {},
  },
  clearbody: {
    onTryBoost(boost, target, source, effect) {
            if (source && target === source)
                return;
            let showMsg = false;
            let i;
            for (i in boost) {
                if (boost[i] < 0) {
                    delete boost[i];
                    showMsg = true;
                }
            }
            if (showMsg && !effect.secondaries && effect.id !== 'octolock') {
                this.add("-fail", target, "unboost", "[from] ability: Clear Body", `[of] ${target}`);
            }
        },
    flags: {
      breakable: 1,
    },
  },
  cloudnine: {
    onStart(pokemon) {
            pokemon.abilityState.ending = false;
        },
    onEnd(pokemon) {
            pokemon.abilityState.ending = true;
            this.eachEvent('WeatherChange', this.effect);
        },
    suppressWeather: true,
    flags: {},
  },
  colorchange: {
    flags: {},
    onDamagingHit(damage, target, source, move) {
            if (!damage || !target.hp)
                return;
            const type = move.type;
            if (target.isActive && move.category !== 'Status' && type !== '???' && !target.hasType(type)) {
                if (!target.setType(type))
                    return false;
                this.add('-start', target, 'typechange', type, '[from] ability: Color Change');
            }
        },
  },
  compoundeyes: {
    onSourceModifyAccuracyPriority: 9,
    onSourceModifyAccuracy(accuracy) {
            if (typeof accuracy !== 'number')
                return;
            this.debug('compoundeyes - enhancing accuracy');
            return this.chainModify(1.3);
        },
    flags: {},
  },
  cutecharm: {
    onDamagingHit(damage, target, source, move) {
            if (damage && move.flags['contact']) {
                if (this.randomChance(3, 10)) {
                    source.addVolatile('attract', this.effectState.target);
                }
            }
        },
    flags: {},
  },
  damp: {
    onAnyTryMove(target, source, effect) {
            if (['explosion', 'mindblown', 'mistyexplosion', 'selfdestruct'].includes(effect.id)) {
                this.attrLastMove('[still]');
                this.add('cant', this.effectState.target, 'ability: Damp', effect, `[of] ${target}`);
                return false;
            }
        },
    onAnyDamage(damage, target, source, effect) {
            if (effect && effect.name === 'Aftermath') {
                return false;
            }
        },
    flags: {
      breakable: 1,
    },
  },
  download: {
    onStart(pokemon) {
            let totaldef = 0;
            let totalspd = 0;
            for (const target of pokemon.foes()) {
                if (target.volatiles.substitute)
                    continue;
                totaldef += target.getStat('def', false, true);
                totalspd += target.getStat('spd', false, true);
            }
            if (totaldef && totaldef >= totalspd) {
                this.boost({ spa: 1 });
            }
            else if (totalspd) {
                this.boost({ atk: 1 });
            }
        },
    flags: {},
  },
  drizzle: {
    onStart(source) {
            if (source.species.id === 'kyogre' && source.item === 'blueorb')
                return;
            this.field.setWeather('raindance');
        },
    flags: {},
  },
  drought: {
    onStart(source) {
            if (source.species.id === 'groudon' && source.item === 'redorb')
                return;
            this.field.setWeather('sunnyday');
        },
    flags: {},
  },
  dryskin: {
    onTryHit(target, source, move) {
            if (target !== source && move.type === 'Water') {
                if (!this.heal(target.baseMaxhp / 4)) {
                    this.add('-immune', target, '[from] ability: Dry Skin');
                }
                return null;
            }
        },
    onSourceBasePowerPriority: 17,
    onSourceBasePower(basePower, attacker, defender, move) {
            if (move.type === 'Fire') {
                return this.chainModify(1.25);
            }
        },
    onWeather(target, source, effect) {
            if (target.effectiveWeather() !== effect.id)
                return;
            if (effect.id === 'raindance' || effect.id === 'primordialsea') {
                this.heal(target.baseMaxhp / 8);
            }
            else if (effect.id === 'sunnyday' || effect.id === 'desolateland') {
                this.damage(target.baseMaxhp / 8, target, target);
            }
        },
    flags: {
      breakable: 1,
    },
  },
  earlybird: {
    flags: {},
  },
  effectspore: {
    onDamagingHit(damage, target, source, move) {
            if (damage && move.flags['contact'] && this.randomChance(3, 10)) {
                const status = this.sample(['slp', 'par', 'psn']);
                source.trySetStatus(status, target);
            }
        },
    flags: {},
  },
  filter: {
    onSourceModifyDamage(damage, source, target, move) {
            if (target.getMoveHitData(move).typeMod > 0) {
                this.debug('Filter neutralize');
                return this.chainModify(0.75);
            }
        },
    flags: {
      breakable: 1,
    },
  },
  flamebody: {
    onDamagingHit(damage, target, source, move) {
            if (damage && move.flags['contact']) {
                if (this.randomChance(3, 10)) {
                    source.trySetStatus('brn', target);
                }
            }
        },
    flags: {},
  },
  flashfire: {
    onTryHit(target, source, move) {
            if (target !== source && move.type === 'Fire') {
                if (target.status === 'frz') {
                    return;
                }
                if (!target.addVolatile('flashfire')) {
                    this.add('-immune', target, '[from] ability: Flash Fire');
                }
                return null;
            }
        },
    onEnd(pokemon) {
            pokemon.removeVolatile('flashfire');
        },
    condition: {
      noCopy: true,
      onStart(target) {
                this.add('-start', target, 'ability: Flash Fire');
            },
      onModifyAtkPriority: 5,
      onModifyAtk: undefined,
      onModifySpAPriority: 5,
      onModifySpA: undefined,
      onEnd(target) {
                this.add('-end', target, 'ability: Flash Fire', '[silent]');
            },
      onModifyDamagePhase1(atk, attacker, defender, move) {
                if (move.type === 'Fire') {
                    this.debug('Flash Fire boost');
                    return this.chainModify(1.5);
                }
            },
    },
    flags: {
      breakable: 1,
    },
  },
  flowergift: {
    onSwitchInPriority: -2,
    onStart(pokemon) {
            this.singleEvent('WeatherChange', this.effect, this.effectState, pokemon);
        },
    onWeatherChange(pokemon) {
            if (!pokemon.isActive || pokemon.baseSpecies.baseSpecies !== 'Cherrim' || pokemon.transformed)
                return;
            if (!pokemon.hp)
                return;
            if (['sunnyday', 'desolateland'].includes(pokemon.effectiveWeather())) {
                if (pokemon.species.id !== 'cherrimsunshine') {
                    pokemon.formeChange('Cherrim-Sunshine', this.effect, false, '0', '[msg]');
                }
            }
            else {
                if (pokemon.species.id === 'cherrimsunshine') {
                    pokemon.formeChange('Cherrim', this.effect, false, '0', '[msg]');
                }
            }
        },
    onAllyModifyAtkPriority: 3,
    onAllyModifyAtk(atk) {
            if (this.field.isWeather('sunnyday')) {
                return this.chainModify(1.5);
            }
        },
    onAllyModifySpDPriority: 4,
    onAllyModifySpD(spd) {
            if (this.field.isWeather('sunnyday')) {
                return this.chainModify(1.5);
            }
        },
    flags: {
      breakable: 1,
    },
  },
  forecast: {
    onSwitchInPriority: -2,
    onStart(pokemon) {
            this.singleEvent('WeatherChange', this.effect, this.effectState, pokemon);
        },
    onWeatherChange(pokemon) {
            if (pokemon.baseSpecies.baseSpecies !== 'Castform' || pokemon.transformed)
                return;
            let forme = null;
            switch (pokemon.effectiveWeather()) {
                case 'sunnyday':
                case 'desolateland':
                    if (pokemon.species.id !== 'castformsunny')
                        forme = 'Castform-Sunny';
                    break;
                case 'raindance':
                case 'primordialsea':
                    if (pokemon.species.id !== 'castformrainy')
                        forme = 'Castform-Rainy';
                    break;
                case 'hail':
                case 'snowscape':
                    if (pokemon.species.id !== 'castformsnowy')
                        forme = 'Castform-Snowy';
                    break;
                default:
                    if (pokemon.species.id !== 'castform')
                        forme = 'Castform';
                    break;
            }
            if (pokemon.isActive && forme) {
                pokemon.formeChange(forme, this.effect, false, '0', '[msg]');
            }
        },
    flags: {
      notrace: 1,
    },
  },
  forewarn: {
    onStart(pokemon) {
            let warnMoves = [];
            let warnBp = 1;
            for (const target of pokemon.foes()) {
                for (const moveSlot of target.moveSlots) {
                    const move = this.dex.moves.get(moveSlot.move);
                    let bp = move.basePower;
                    if (move.ohko)
                        bp = 160;
                    if (move.id === 'counter' || move.id === 'metalburst' || move.id === 'mirrorcoat')
                        bp = 120;
                    if (!bp && move.category !== 'Status')
                        bp = 80;
                    if (bp > warnBp) {
                        warnMoves = [move];
                        warnBp = bp;
                    }
                    else if (bp === warnBp) {
                        warnMoves.push(move);
                    }
                }
            }
            if (!warnMoves.length)
                return;
            const warnMove = this.sample(warnMoves);
            this.add('-activate', pokemon, 'ability: Forewarn', warnMove);
        },
    flags: {},
  },
  frisk: {
    onStart(pokemon) {
            const target = pokemon.side.randomFoe();
            if (target?.item) {
                this.add('-item', '', target.getItem().name, '[from] ability: Frisk', `[of] ${pokemon}`);
            }
        },
    flags: {},
  },
  gluttony: {
    onStart(pokemon) {
            pokemon.abilityState.gluttony = true;
        },
    onDamage(item, pokemon) {
            pokemon.abilityState.gluttony = true;
        },
    flags: {},
  },
  guts: {
    onModifyAtkPriority: 5,
    onModifyAtk(atk, pokemon) {
            if (pokemon.status) {
                return this.chainModify(1.5);
            }
        },
    flags: {},
  },
  heatproof: {
    onSourceModifyAtkPriority: 6,
    onSourceModifySpAPriority: 5,
    onDamage(damage, target, source, effect) {
            if (effect && effect.id === 'brn') {
                return damage / 2;
            }
        },
    flags: {
      breakable: 1,
    },
    onSourceBasePowerPriority: 18,
    onSourceBasePower(basePower, attacker, defender, move) {
            if (move.type === 'Fire') {
                this.debug('Heatproof BP weaken');
                return this.chainModify(0.5);
            }
        },
  },
  honeygather: {
    flags: {},
  },
  hugepower: {
    onModifyAtkPriority: 5,
    onModifyAtk(atk) {
            return this.chainModify(2);
        },
    flags: {},
  },
  hustle: {
    onModifyAtkPriority: 5,
    onModifyAtk(atk) {
            return this.modify(atk, 1.5);
        },
    onSourceModifyAccuracyPriority: 7,
    onSourceModifyAccuracy(accuracy, target, source, move) {
            if (move.category === 'Physical' && typeof accuracy === 'number') {
                return this.chainModify(0.8);
            }
        },
    flags: {},
  },
  hydration: {
    onResidualOrder: 5,
    onResidualSubOrder: 3,
    flags: {},
    onWeather(target, source, effect) {
            if (effect.id === 'raindance' && target.status) {
                this.add('-activate', target, 'ability: Hydration');
                target.cureStatus();
            }
        },
  },
  hypercutter: {
    onTryBoost(boost, target, source, effect) {
            if (source && target === source)
                return;
            if (boost.atk && boost.atk < 0) {
                delete boost.atk;
                if (!effect.secondaries) {
                    this.add("-fail", target, "unboost", "Attack", "[from] ability: Hyper Cutter", `[of] ${target}`);
                }
            }
        },
    flags: {
      breakable: 1,
    },
  },
  icebody: {
    onWeather(target, source, effect) {
            if (effect.id === 'hail' || effect.id === 'snowscape') {
                this.heal(target.baseMaxhp / 16);
            }
        },
    onImmunity(type, pokemon) {
            if (type === 'hail')
                return false;
        },
    flags: {},
  },
  illuminate: {
    flags: {},
  },
  immunity: {
    onUpdate(pokemon) {
            if (pokemon.status === 'psn' || pokemon.status === 'tox') {
                this.add('-activate', pokemon, 'ability: Immunity');
                pokemon.cureStatus();
            }
        },
    onSetStatus(status, target, source, effect) {
            if (status.id !== 'psn' && status.id !== 'tox')
                return;
            if (effect?.status) {
                this.add('-immune', target, '[from] ability: Immunity');
            }
            return false;
        },
    flags: {
      breakable: 1,
    },
  },
  innerfocus: {
    onTryAddVolatile(status, pokemon) {
            if (status.id === 'flinch')
                return null;
        },
    flags: {
      breakable: 1,
    },
  },
  insomnia: {
    onUpdate(pokemon) {
            if (pokemon.status === 'slp') {
                this.add('-activate', pokemon, 'ability: Insomnia');
                pokemon.cureStatus();
            }
        },
    onSetStatus(status, target, source, effect) {
            if (status.id !== 'slp')
                return;
            if (effect?.status) {
                this.add('-immune', target, '[from] ability: Insomnia');
            }
            return false;
        },
    onTryAddVolatile(status, target) {
            if (status.id === 'yawn') {
                this.add('-immune', target, '[from] ability: Insomnia');
                return null;
            }
        },
    flags: {
      breakable: 1,
    },
  },
  intimidate: {
    onStart(pokemon) {
            const activated = pokemon.adjacentFoes().some(target => (!(target.volatiles['substitute'] || target.volatiles['substitutebroken']?.move === 'uturn')));
            if (!activated) {
                this.hint("In Gen 4, Intimidate does not activate if every target has a Substitute (or the Substitute was just broken by U-turn).", false, pokemon.side);
                return;
            }
            this.add('-ability', pokemon, 'Intimidate', 'boost');
            for (const target of pokemon.adjacentFoes()) {
                if (target.volatiles['substitute']) {
                    this.add('-immune', target);
                }
                else if (target.volatiles['substitutebroken']?.move === 'uturn') {
                    this.hint("In Gen 4, if U-turn breaks Substitute the incoming Intimidate does nothing.");
                }
                else {
                    this.boost({ atk: -1 }, target, pokemon, null, true);
                }
            }
        },
    flags: {},
  },
  ironfist: {
    onBasePowerPriority: 23,
    onBasePower(basePower, attacker, defender, move) {
            if (move.flags['punch']) {
                this.debug('Iron Fist boost');
                return this.chainModify([4915, 4096]);
            }
        },
    flags: {},
  },
  keeneye: {
    onTryBoost(boost, target, source, effect) {
            if (source && target === source)
                return;
            if (boost.accuracy && boost.accuracy < 0) {
                delete boost.accuracy;
                if (!effect.secondaries) {
                    this.add("-fail", target, "unboost", "accuracy", "[from] ability: Keen Eye", `[of] ${target}`);
                }
            }
        },
    flags: {
      breakable: 1,
    },
  },
  klutz: {
    onSwitchInPriority: 1,
    onStart(pokemon) {
            this.singleEvent('End', pokemon.getItem(), pokemon.itemState, pokemon);
        },
    flags: {},
  },
  leafguard: {
    onSetStatus(status, target, source, effect) {
            if (effect && effect.id === 'rest') {
                // do nothing
            }
            else if (this.field.isWeather('sunnyday')) {
                return false;
            }
        },
    onTryAddVolatile(status, target) {
            if (status.id === 'yawn' && ['sunnyday', 'desolateland'].includes(target.effectiveWeather())) {
                this.add('-immune', target, '[from] ability: Leaf Guard');
                return null;
            }
        },
    flags: {
      breakable: 1,
    },
  },
  levitate: {
    flags: {
      breakable: 1,
    },
  },
  lightningrod: {
    onAnyRedirectTarget(target, source, source2, move) {
            if (move.type !== 'Electric' || move.flags['pledgecombo'])
                return;
            const redirectTarget = ['randomNormal', 'adjacentFoe'].includes(move.target) ? 'normal' : move.target;
            if (this.validTarget(this.effectState.target, source, redirectTarget)) {
                if (move.smartTarget)
                    move.smartTarget = false;
                if (this.effectState.target !== target) {
                    this.add('-activate', this.effectState.target, 'ability: Lightning Rod');
                }
                return this.effectState.target;
            }
        },
    flags: {
      breakable: 1,
    },
  },
  limber: {
    onUpdate(pokemon) {
            if (pokemon.status === 'par') {
                this.add('-activate', pokemon, 'ability: Limber');
                pokemon.cureStatus();
            }
        },
    onSetStatus(status, target, source, effect) {
            if (status.id !== 'par')
                return;
            if (effect?.status) {
                this.add('-immune', target, '[from] ability: Limber');
            }
            return false;
        },
    flags: {
      breakable: 1,
    },
  },
  liquidooze: {
    onSourceTryHeal(damage, target, source, effect) {
            this.debug(`Heal is occurring: ${target} <- ${source} :: ${effect.id}`);
            const canOoze = ['drain', 'leechseed'];
            if (canOoze.includes(effect.id) && this.activeMove?.id !== 'dreameater') {
                this.damage(damage, null, null, null, true);
                return 0;
            }
        },
    flags: {},
  },
  magicguard: {
    onDamage(damage, target, source, effect) {
            if (effect.effectType !== 'Move')
                return false;
        },
    flags: {},
    onSetStatus(status, target, source, effect) {
            if (effect && effect.id === 'toxicspikes') {
                return false;
            }
        },
  },
  magmaarmor: {
    onUpdate(pokemon) {
            if (pokemon.status === 'frz') {
                this.add('-activate', pokemon, 'ability: Magma Armor');
                pokemon.cureStatus();
            }
        },
    onImmunity(type, pokemon) {
            if (type === 'frz')
                return false;
        },
    flags: {
      breakable: 1,
    },
  },
  magnetpull: {
    onFoeTrapPokemon(pokemon) {
            if (pokemon.hasType('Steel') && pokemon.isAdjacent(this.effectState.target)) {
                pokemon.tryTrap(true);
            }
        },
    onFoeMaybeTrapPokemon(pokemon, source) {
            if (!source)
                source = this.effectState.target;
            if (!source || !pokemon.isAdjacent(source))
                return;
            if (!pokemon.knownType || pokemon.hasType('Steel')) {
                pokemon.maybeTrapped = true;
            }
        },
    flags: {},
  },
  marvelscale: {
    onModifyDefPriority: 6,
    onModifyDef(def, pokemon) {
            if (pokemon.status) {
                return this.chainModify(1.5);
            }
        },
    flags: {
      breakable: 1,
    },
  },
  minus: {
    onModifySpA(spa, pokemon) {
            for (const allyActive of pokemon.allies()) {
                if (allyActive.hasAbility('plus')) {
                    return this.chainModify(1.5);
                }
            }
        },
    flags: {},
  },
  moldbreaker: {
    onStart(pokemon) {
            this.add('-ability', pokemon, 'Mold Breaker');
        },
    onModifyMove(move) {
            move.ignoreAbility = true;
        },
    flags: {},
  },
  motordrive: {
    onTryHit(target, source, move) {
            if (target !== source && move.type === 'Electric') {
                if (!this.boost({ spe: 1 })) {
                    this.add('-immune', target, '[from] ability: Motor Drive');
                }
                return null;
            }
        },
    flags: {
      breakable: 1,
    },
  },
  multitype: {
    flags: {
      failroleplay: 1,
      noreceiver: 1,
      noentrain: 1,
      notrace: 1,
      failskillswap: 1,
      cantsuppress: 1,
    },
    onTakeItem: false,
    onSetAbility: false,
  },
  naturalcure: {
    onSwitchOut(pokemon) {
            if (!pokemon.status || pokemon.status === 'fnt')
                return;
            // Because statused/unstatused pokemon are shown after every switch
            // in gen 3-4, Natural Cure's curing is always known to both players
            this.add('-curestatus', pokemon, pokemon.status, '[from] ability: Natural Cure', '[silent]');
            pokemon.clearStatus();
        },
    flags: {},
  },
  noguard: {
    onAnyInvulnerabilityPriority: 1,
    onAnyInvulnerability(target, source, move) {
            if (move && (source === this.effectState.target || target === this.effectState.target))
                return 0;
        },
    onAnyAccuracy(accuracy, target, source, move) {
            if (move && (source === this.effectState.target || target === this.effectState.target)) {
                return true;
            }
            return accuracy;
        },
    flags: {},
  },
  normalize: {
    onModifyTypePriority: 1,
    onModifyType(move, pokemon) {
            const noModifyType = [
                'hiddenpower', 'judgment', 'multiattack', 'naturalgift', 'revelationdance', 'struggle', 'technoblast', 'terrainpulse', 'weatherball',
            ];
            if (!(move.isZ && move.category !== 'Status') &&
                // TODO: Figure out actual interaction
                (!noModifyType.includes(move.id) || this.activeMove?.isMax) && !(move.name === 'Tera Blast' && pokemon.terastallized)) {
                move.type = 'Normal';
                move.typeChangerBoosted = this.effect;
            }
        },
    onBasePowerPriority: 23,
    flags: {},
    onModifyMovePriority: 1,
    onModifyMove(move) {
            if (move.id !== 'struggle') {
                move.type = 'Normal';
            }
        },
  },
  oblivious: {
    onUpdate(pokemon) {
            if (pokemon.volatiles['attract']) {
                pokemon.removeVolatile('attract');
                this.add('-end', pokemon, 'move: Attract', '[from] ability: Oblivious');
            }
        },
    onImmunity(type, pokemon) {
            if (type === 'attract')
                return false;
        },
    onTryHit(pokemon, target, move) {
            if (move.id === 'captivate') {
                this.add('-immune', pokemon, '[from] Oblivious');
                return null;
            }
        },
    flags: {
      breakable: 1,
    },
  },
  overgrow: {
    onModifyAtkPriority: 5,
    onModifySpAPriority: 5,
    flags: {},
    onBasePowerPriority: 2,
    onBasePower(basePower, attacker, defender, move) {
            if (move.type === 'Grass' && attacker.hp <= attacker.maxhp / 3) {
                this.debug('Overgrow boost');
                return this.chainModify(1.5);
            }
        },
  },
  owntempo: {
    onUpdate(pokemon) {
            if (pokemon.volatiles['confusion']) {
                this.add('-activate', pokemon, 'ability: Own Tempo');
                pokemon.removeVolatile('confusion');
            }
        },
    onTryAddVolatile(status, pokemon) {
            if (status.id === 'confusion')
                return null;
        },
    onHit(target, source, move) {
            if (move?.volatileStatus === 'confusion') {
                this.add('-immune', target, 'confusion', '[from] ability: Own Tempo');
            }
        },
    flags: {
      breakable: 1,
    },
  },
  pickup: {
    onResidualOrder: 28,
    onResidualSubOrder: 2,
    flags: {},
  },
  plus: {
    onModifySpA(spa, pokemon) {
            for (const allyActive of pokemon.allies()) {
                if (allyActive.hasAbility('minus')) {
                    return this.chainModify(1.5);
                }
            }
        },
    flags: {},
  },
  poisonheal: {
    onDamagePriority: 1,
    onDamage(damage, target, source, effect) {
            if (effect.id === 'psn' || effect.id === 'tox') {
                this.heal(target.baseMaxhp / 8);
                return false;
            }
        },
    flags: {},
  },
  poisonpoint: {
    onDamagingHit(damage, target, source, move) {
            if (damage && move.flags['contact']) {
                if (this.randomChance(3, 10)) {
                    source.trySetStatus('psn', target);
                }
            }
        },
    flags: {},
  },
  pressure: {
    onStart(pokemon) {
            this.add('-ability', pokemon, 'Pressure');
        },
    onDeductPP(target, source) {
            if (target === source)
                return;
            return 1;
        },
    flags: {},
  },
  purepower: {
    onModifyAtkPriority: 5,
    onModifyAtk(atk) {
            return this.chainModify(2);
        },
    flags: {},
  },
  quickfeet: {
    onModifySpe(spe, pokemon) {
            if (pokemon.status) {
                return this.chainModify(1.5);
            }
        },
    flags: {},
  },
  raindish: {
    onWeather(target, source, effect) {
            if (target.effectiveWeather() !== effect.id)
                return;
            if (effect.id === 'raindance' || effect.id === 'primordialsea') {
                this.heal(target.baseMaxhp / 16);
            }
        },
    flags: {},
  },
  reckless: {
    onBasePowerPriority: 23,
    onBasePower(basePower, attacker, defender, move) {
            if (move.recoil || move.hasCrashDamage) {
                this.debug('Reckless boost');
                return this.chainModify([4915, 4096]);
            }
        },
    flags: {},
  },
  rivalry: {
    onBasePowerPriority: 24,
    onBasePower(basePower, attacker, defender, move) {
            if (attacker.gender && defender.gender) {
                if (attacker.gender === defender.gender) {
                    this.debug('Rivalry boost');
                    return this.chainModify(1.25);
                }
                else {
                    this.debug('Rivalry weaken');
                    return this.chainModify(0.75);
                }
            }
        },
    flags: {},
  },
  rockhead: {
    onDamage(damage, target, source, effect) {
            if (effect.id === 'recoil') {
                if (!this.activeMove)
                    throw new Error("Battle.activeMove is null");
                if (this.activeMove.id !== 'struggle')
                    return null;
            }
        },
    flags: {},
  },
  roughskin: {
    onDamagingHitOrder: 1,
    onDamagingHit(damage, target, source, move) {
            if (damage && move.flags['contact']) {
                this.damage(source.baseMaxhp / 8, source, target);
            }
        },
    flags: {},
  },
  runaway: {
    flags: {},
  },
  sandstream: {
    onStart(source) {
            this.field.setWeather('sandstorm');
        },
    flags: {},
  },
  sandveil: {
    onImmunity(type, pokemon) {
            if (type === 'sandstorm')
                return false;
        },
    onModifyAccuracyPriority: 8,
    onModifyAccuracy(accuracy) {
            if (typeof accuracy !== 'number')
                return;
            if (this.field.isWeather('sandstorm')) {
                this.debug('Sand Veil - decreasing accuracy');
                return this.chainModify(0.8);
            }
        },
    flags: {
      breakable: 1,
    },
  },
  scrappy: {
    onModifyMovePriority: -5,
    onModifyMove(move) {
            if (!move.ignoreImmunity)
                move.ignoreImmunity = {};
            if (move.ignoreImmunity !== true) {
                move.ignoreImmunity['Fighting'] = true;
                move.ignoreImmunity['Normal'] = true;
            }
        },
    flags: {},
  },
  serenegrace: {
    onModifyMovePriority: -2,
    onModifyMove(move) {
            if (move.secondaries && move.id !== 'chatter') {
                this.debug('doubling secondary chance');
                for (const secondary of move.secondaries) {
                    if (secondary.chance)
                        secondary.chance *= 2;
                }
            }
        },
    flags: {},
  },
  shadowtag: {
    onFoeTrapPokemon(pokemon) {
            if (!pokemon.hasAbility('shadowtag') && pokemon.isAdjacent(this.effectState.target)) {
                pokemon.tryTrap(true);
            }
        },
    onFoeMaybeTrapPokemon(pokemon, source) {
            if (!source)
                source = this.effectState.target;
            if (!source || !pokemon.isAdjacent(source))
                return;
            if (!pokemon.hasAbility('shadowtag')) {
                pokemon.maybeTrapped = true;
            }
        },
    flags: {},
  },
  shedskin: {
    onResidualOrder: 10,
    onResidualSubOrder: 3,
    onResidual(pokemon) {
            if (pokemon.hp && pokemon.status && this.randomChance(33, 100)) {
                this.debug('shed skin');
                this.add('-activate', pokemon, 'ability: Shed Skin');
                pokemon.cureStatus();
            }
        },
    flags: {},
  },
  shellarmor: {
    onCriticalHit: false,
    flags: {
      breakable: 1,
    },
  },
  shielddust: {
    onModifySecondaries(secondaries) {
            this.debug('Shield Dust prevent secondary');
            return secondaries.filter(effect => !!effect.self);
        },
    flags: {
      breakable: 1,
    },
  },
  simple: {
    flags: {
      breakable: 1,
    },
    onModifyBoost(boosts) {
            let key;
            for (key in boosts) {
                boosts[key] *= 2;
            }
        },
  },
  skilllink: {
    onModifyMove(move) {
            if (move.multihit && Array.isArray(move.multihit) && move.multihit.length) {
                move.multihit = move.multihit[1];
            }
            if (move.multiaccuracy) {
                delete move.multiaccuracy;
            }
        },
    flags: {},
  },
  slowstart: {
    onStart(pokemon) {
            this.add('-start', pokemon, 'ability: Slow Start');
            this.effectState.counter = 5;
        },
    onResidualOrder: 28,
    onResidualSubOrder: 2,
    onResidual(pokemon) {
            if (pokemon.activeTurns && this.effectState.counter) {
                this.effectState.counter--;
                if (!this.effectState.counter) {
                    this.add('-end', pokemon, 'Slow Start');
                    delete this.effectState.counter;
                }
            }
        },
    onModifyAtkPriority: 5,
    onModifyAtk(atk, pokemon, target, move) {
            // This is because the game checks the move's category in data, rather than what it is currently, unlike e.g. Huge Power
            if (this.effectState.counter && this.dex.moves.get(move.id).category === 'Physical') {
                return this.chainModify(0.5);
            }
        },
    onModifySpe(spe, pokemon) {
            if (this.effectState.counter) {
                return this.chainModify(0.5);
            }
        },
    onEnd(pokemon) {
            if (pokemon.beingCalledBack)
                return;
            this.add('-end', pokemon, 'Slow Start', '[silent]');
        },
    flags: {},
    onModifySpAPriority: 5,
    onModifySpA(spa, pokemon, target, move) {
            // Ordinary Z-moves like Breakneck Blitz will halve the user's Special Attack as well
            if (this.effectState.counter && this.dex.moves.get(move.id).category === 'Physical') {
                return this.chainModify(0.5);
            }
        },
  },
  sniper: {
    onModifyDamage(damage, source, target, move) {
            if (target.getMoveHitData(move).crit) {
                this.debug('Sniper boost');
                return this.chainModify(1.5);
            }
        },
    flags: {},
  },
  snowcloak: {
    onImmunity(type, pokemon) {
            if (type === 'hail')
                return false;
        },
    onModifyAccuracyPriority: 8,
    onModifyAccuracy(accuracy) {
            if (typeof accuracy !== 'number')
                return;
            if (this.field.isWeather('hail')) {
                this.debug('Snow Cloak - decreasing accuracy');
                return this.chainModify(0.8);
            }
        },
    flags: {
      breakable: 1,
    },
  },
  snowwarning: {
    onStart(source) {
            this.field.setWeather('hail');
        },
    flags: {},
  },
  solarpower: {
    onModifySpAPriority: 5,
    onModifySpA(spa, pokemon) {
            if (['sunnyday', 'desolateland'].includes(pokemon.effectiveWeather())) {
                return this.chainModify(1.5);
            }
        },
    onWeather(target, source, effect) {
            if (target.effectiveWeather() !== effect.id)
                return;
            if (effect.id === 'sunnyday' || effect.id === 'desolateland') {
                this.damage(target.baseMaxhp / 8, target, target);
            }
        },
    flags: {},
  },
  solidrock: {
    onSourceModifyDamage(damage, source, target, move) {
            if (target.getMoveHitData(move).typeMod > 0) {
                this.debug('Solid Rock neutralize');
                return this.chainModify(0.75);
            }
        },
    flags: {
      breakable: 1,
    },
  },
  soundproof: {
    onTryHit(target, source, move) {
            if (move.flags['sound']) {
                this.add('-immune', target, '[from] ability: Soundproof');
                return null;
            }
        },
    flags: {
      breakable: 1,
    },
  },
  speedboost: {
    onResidualOrder: 10,
    onResidualSubOrder: 3,
    onResidual(pokemon) {
            if (pokemon.activeTurns) {
                this.boost({ spe: 1 });
            }
        },
    flags: {},
  },
  stall: {
    onFractionalPriority(priority, pokemon) {
            // don't override Lagging Tail and Full Incense's -0.2 fractional priority
            if (priority >= 0)
                return -0.1;
        },
    flags: {},
  },
  static: {
    onDamagingHit(damage, target, source, move) {
            if (damage && move.flags['contact']) {
                if (this.randomChance(3, 10)) {
                    source.trySetStatus('par', target);
                }
            }
        },
    flags: {},
  },
  steadfast: {
    onFlinch(pokemon) {
            this.boost({ spe: 1 });
        },
    flags: {},
  },
  stench: {
    onModifyMovePriority: -1,
    flags: {},
  },
  stickyhold: {
    onTakeItem(item, pokemon, source) {
            if ((source && source !== pokemon) || (this.activeMove && this.activeMove.id === 'knockoff')) {
                this.add('-activate', pokemon, 'ability: Sticky Hold');
                return false;
            }
        },
    flags: {
      breakable: 1,
    },
  },
  stormdrain: {
    onAnyRedirectTarget(target, source, source2, move) {
            if (move.type !== 'Water' || move.flags['pledgecombo'])
                return;
            const redirectTarget = ['randomNormal', 'adjacentFoe'].includes(move.target) ? 'normal' : move.target;
            if (this.validTarget(this.effectState.target, source, redirectTarget)) {
                if (move.smartTarget)
                    move.smartTarget = false;
                if (this.effectState.target !== target) {
                    this.add('-activate', this.effectState.target, 'ability: Storm Drain');
                }
                return this.effectState.target;
            }
        },
    flags: {
      breakable: 1,
    },
  },
  sturdy: {
    onTryHit(pokemon, target, move) {
            if (move.ohko) {
                this.add('-immune', pokemon, '[from] ability: Sturdy');
                return null;
            }
        },
    onDamagePriority: -30,
    flags: {
      breakable: 1,
    },
  },
  suctioncups: {
    onDragOutPriority: 1,
    onDragOut(pokemon) {
            this.add('-activate', pokemon, 'ability: Suction Cups');
            return null;
        },
    flags: {
      breakable: 1,
    },
  },
  superluck: {
    onModifyCritRatio(critRatio) {
            return critRatio + 1;
        },
    flags: {},
  },
  swarm: {
    onModifyAtkPriority: 5,
    onModifySpAPriority: 5,
    flags: {},
    onBasePowerPriority: 2,
    onBasePower(basePower, attacker, defender, move) {
            if (move.type === 'Bug' && attacker.hp <= attacker.maxhp / 3) {
                this.debug('Swarm boost');
                return this.chainModify(1.5);
            }
        },
  },
  swiftswim: {
    onModifySpe(spe, pokemon) {
            if (['raindance', 'primordialsea'].includes(pokemon.effectiveWeather())) {
                return this.chainModify(2);
            }
        },
    flags: {},
  },
  synchronize: {
    onAfterSetStatus(status, target, source, effect) {
            if (!source || source === target)
                return;
            if (effect && effect.id === 'toxicspikes')
                return;
            let id = status.id;
            if (id === 'slp' || id === 'frz')
                return;
            if (id === 'tox')
                id = 'psn';
            source.trySetStatus(id, target);
        },
    flags: {},
  },
  tangledfeet: {
    onModifyAccuracyPriority: 6,
    onModifyAccuracy(accuracy, target) {
            if (typeof accuracy !== 'number')
                return;
            if (target?.volatiles['confusion']) {
                this.debug('Tangled Feet - decreasing accuracy');
                return this.chainModify(0.5);
            }
        },
    flags: {
      breakable: 1,
    },
  },
  technician: {
    onBasePowerPriority: 19,
    onBasePower(basePower, attacker, defender, move) {
            const basePowerAfterMultiplier = this.modify(basePower, this.event.modifier);
            this.debug(`Base Power: ${basePowerAfterMultiplier}`);
            if (basePowerAfterMultiplier <= 60) {
                this.debug('Technician boost');
                return this.chainModify(1.5);
            }
        },
    flags: {},
  },
  thickfat: {
    onSourceModifyAtkPriority: 6,
    onSourceModifySpAPriority: 5,
    flags: {
      breakable: 1,
    },
    onSourceBasePowerPriority: 1,
    onSourceBasePower(basePower, attacker, defender, move) {
            if (move.type === 'Ice' || move.type === 'Fire') {
                return this.chainModify(0.5);
            }
        },
  },
  tintedlens: {
    onModifyDamage(damage, source, target, move) {
            if (target.getMoveHitData(move).typeMod < 0) {
                this.debug('Tinted Lens boost');
                return this.chainModify(2);
            }
        },
    flags: {},
  },
  torrent: {
    onModifyAtkPriority: 5,
    onModifySpAPriority: 5,
    flags: {},
    onBasePowerPriority: 2,
    onBasePower(basePower, attacker, defender, move) {
            if (move.type === 'Water' && attacker.hp <= attacker.maxhp / 3) {
                this.debug('Torrent boost');
                return this.chainModify(1.5);
            }
        },
  },
  trace: {
    onStart(pokemon) {
            this.effectState.seek = true;
            // n.b. only affects Hackmons
            // interaction with No Ability is complicated: https://www.smogon.com/forums/threads/pokemon-sun-moon-battle-mechanics-research.3586701/page-76#post-7790209
            if (pokemon.adjacentFoes().some(foeActive => foeActive.ability === 'noability')) {
                this.effectState.seek = false;
            }
            // interaction with Ability Shield is similar to No Ability
            if (pokemon.hasItem('Ability Shield')) {
                this.add('-block', pokemon, 'item: Ability Shield');
                this.effectState.seek = false;
            }
            if (this.effectState.seek) {
                this.singleEvent('Update', this.effect, this.effectState, pokemon);
            }
        },
    onUpdate(pokemon) {
            if (!this.effectState.seek)
                return;
            const target = pokemon.side.randomFoe();
            if (!target || target.fainted)
                return;
            const ability = target.getAbility();
            if (ability.flags['notrace'])
                return;
            pokemon.setAbility(ability, target);
        },
    flags: {
      notrace: 1,
    },
  },
  truant: {
    onStart(pokemon) {
            pokemon.removeVolatile('truant');
            if (pokemon.activeTurns && (pokemon.moveThisTurnResult !== undefined || !this.queue.willMove(pokemon))) {
                pokemon.addVolatile('truant');
            }
        },
    onBeforeMovePriority: 9,
    onBeforeMove(pokemon) {
            if (pokemon.removeVolatile('truant')) {
                this.add('cant', pokemon, 'ability: Truant');
                return false;
            }
            pokemon.addVolatile('truant');
        },
    condition: {},
    flags: {},
  },
  unaware: {
    onAnyModifyBoost(boosts, pokemon) {
            const unawareUser = this.effectState.target;
            if (unawareUser === pokemon)
                return;
            if (unawareUser === this.activePokemon && pokemon === this.activeTarget) {
                boosts['def'] = 0;
                boosts['spd'] = 0;
                boosts['evasion'] = 0;
            }
            if (pokemon === this.activePokemon && unawareUser === this.activeTarget) {
                boosts['atk'] = 0;
                boosts['def'] = 0;
                boosts['spa'] = 0;
                boosts['accuracy'] = 0;
            }
        },
    flags: {
      breakable: 1,
    },
  },
  unburden: {
    onAfterUseItem(item, pokemon) {
            if (pokemon !== this.effectState.target)
                return;
            pokemon.addVolatile('unburden');
        },
    onTakeItem(item, pokemon) {
            pokemon.addVolatile('unburden');
        },
    onEnd(pokemon) {
            pokemon.removeVolatile('unburden');
        },
    condition: {
      onModifySpe(spe, pokemon) {
                if (!pokemon.item && !pokemon.ignoringAbility()) {
                    return this.chainModify(2);
                }
            },
    },
    flags: {},
  },
  vitalspirit: {
    onUpdate(pokemon) {
            if (pokemon.status === 'slp') {
                this.add('-activate', pokemon, 'ability: Vital Spirit');
                pokemon.cureStatus();
            }
        },
    onSetStatus(status, target, source, effect) {
            if (status.id !== 'slp')
                return;
            if (effect?.status) {
                this.add('-immune', target, '[from] ability: Vital Spirit');
            }
            return false;
        },
    onTryAddVolatile(status, target) {
            if (status.id === 'yawn') {
                this.add('-immune', target, '[from] ability: Vital Spirit');
                return null;
            }
        },
    flags: {
      breakable: 1,
    },
  },
  voltabsorb: {
    onTryHit(target, source, move) {
            if (target !== source && move.type === 'Electric') {
                if (!this.heal(target.baseMaxhp / 4)) {
                    this.add('-immune', target, '[from] ability: Volt Absorb');
                }
                return null;
            }
        },
    flags: {
      breakable: 1,
    },
  },
  waterabsorb: {
    onTryHit(target, source, move) {
            if (target !== source && move.type === 'Water') {
                if (!this.heal(target.baseMaxhp / 4)) {
                    this.add('-immune', target, '[from] ability: Water Absorb');
                }
                return null;
            }
        },
    flags: {
      breakable: 1,
    },
  },
  waterveil: {
    onUpdate(pokemon) {
            if (pokemon.status === 'brn') {
                this.add('-activate', pokemon, 'ability: Water Veil');
                pokemon.cureStatus();
            }
        },
    onSetStatus(status, target, source, effect) {
            if (status.id !== 'brn')
                return;
            if (effect?.status) {
                this.add('-immune', target, '[from] ability: Water Veil');
            }
            return false;
        },
    flags: {
      breakable: 1,
    },
  },
  whitesmoke: {
    onTryBoost(boost, target, source, effect) {
            if (source && target === source)
                return;
            let showMsg = false;
            let i;
            for (i in boost) {
                if (boost[i] < 0) {
                    delete boost[i];
                    showMsg = true;
                }
            }
            if (showMsg && !effect.secondaries && effect.id !== 'octolock') {
                this.add("-fail", target, "unboost", "[from] ability: White Smoke", `[of] ${target}`);
            }
        },
    flags: {
      breakable: 1,
    },
  },
  wonderguard: {
    onTryHit(target, source, move) {
            if (move.id === 'firefang') {
                this.hint("In Gen 4, Fire Fang is always able to hit through Wonder Guard.", true, target.side);
                return;
            }
            if (target === source || move.category === 'Status' || move.type === '???')
                return;
            this.debug('Wonder Guard immunity: ' + move.id);
            if (target.runEffectiveness(move) <= 0 || !target.runImmunity(move)) {
                this.add('-immune', target, '[from] ability: Wonder Guard');
                return null;
            }
        },
    flags: {
      failroleplay: 1,
      noreceiver: 1,
      failskillswap: 1,
      breakable: 1,
    },
  },
}
