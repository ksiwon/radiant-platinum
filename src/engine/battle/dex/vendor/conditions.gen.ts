// @ts-nocheck
/**
 * ⚠️ **생성물이다. 손으로 고치지 않는다** — `tools/distribution/mechanics/bake.mjs`가
 * `@pkmn/sim`(MIT, Guangcong Luo 외)의 4세대 표를 평탄화해 구운 것이다.
 *
 * 상태·날씨·필드. 전부 구현이라 자를 것이 없다
 *
 * **수치와 이름은 여기 없다.** 그것은 사용자의 롬에서 오고
 * (`src/engine/battle/dex/provider.ts`), 여기 있는 것은 효과 **구현**뿐이다.
 * 왜 그렇게 갈랐는지는 COPYRIGHT.md §2.9 · DEPLOY.md §4.
 */
import type { Mechanics } from '../mechanics'

export const CONDITIONS: Record<string, Mechanics> = {
  arceus: {
    name: "Arceus",
    onBeforeSwitchIn(pokemon) {
            pokemon.setType('Normal'); // Multitype will prevent this
        },
    onSwitchIn(pokemon) {
            if (pokemon.ability === 'multitype') {
                const item = pokemon.getItem();
                const targetForme = (item?.onPlate ? 'Arceus-' + item.onPlate : 'Arceus');
                if (pokemon.species.name !== targetForme) {
                    pokemon.formeChange(targetForme);
                }
            }
        },
  },
  brn: {
    name: "brn",
    effectType: "Status",
    onStart(target, source, sourceEffect) {
            if (sourceEffect && sourceEffect.id === 'flameorb') {
                this.add('-status', target, 'brn', '[from] item: Flame Orb');
            }
            else if (sourceEffect && sourceEffect.effectType === 'Ability') {
                this.add('-status', target, 'brn', '[from] ability: ' + sourceEffect.name, `[of] ${source}`);
            }
            else {
                this.add('-status', target, 'brn');
            }
        },
    onResidualOrder: 10,
    onResidual(pokemon) {
            this.damage(pokemon.baseMaxhp / 8);
        },
    onResidualSubOrder: 6,
  },
  choicelock: {
    name: "choicelock",
    noCopy: true,
    onStart(pokemon) {
            if (!pokemon.lastMove)
                return false;
            this.effectState.move = pokemon.lastMove.id;
        },
    onBeforeMove: undefined,
    onDisableMove(pokemon) {
            if (!pokemon.getItem().isChoice || !pokemon.hasMove(this.effectState.move)) {
                pokemon.removeVolatile('choicelock');
                return;
            }
            if (pokemon.ignoringItem() || pokemon.volatiles['dynamax']) {
                return;
            }
            for (const moveSlot of pokemon.moveSlots) {
                if (moveSlot.id !== this.effectState.move) {
                    pokemon.disableMove(moveSlot.id, false, this.effectState.sourceEffect);
                }
            }
        },
  },
  commanded: {
    name: "Commanded",
    noCopy: true,
    onStart(pokemon) {
            this.boost({ atk: 2, spa: 2, spe: 2, def: 2, spd: 2 }, pokemon);
        },
    onDragOutPriority: 2,
    onDragOut() {
            return false;
        },
    onTrapPokemonPriority: -11,
    onTrapPokemon(pokemon) {
            pokemon.trapped = true;
        },
  },
  commanding: {
    name: "Commanding",
    noCopy: true,
    onDragOutPriority: 2,
    onDragOut() {
            return false;
        },
    onTrapPokemonPriority: -11,
    onTrapPokemon(pokemon) {
            pokemon.trapped = true;
        },
    onInvulnerability: false,
    onBeforeTurn(pokemon) {
            this.queue.cancelAction(pokemon);
        },
  },
  confusion: {
    name: "confusion",
    onStart(target, source, sourceEffect) {
            if (sourceEffect?.id === 'lockedmove') {
                this.add('-start', target, 'confusion', '[fatigue]');
            }
            else if (sourceEffect?.effectType === 'Ability') {
                this.add('-start', target, 'confusion', '[from] ability: ' + sourceEffect.name, `[of] ${source}`);
            }
            else {
                this.add('-start', target, 'confusion');
            }
            const min = sourceEffect?.id === 'axekick' ? 3 : 2;
            this.effectState.time = this.random(min, 6);
        },
    onEnd(target) {
            this.add('-end', target, 'confusion');
        },
    onBeforeMovePriority: 3,
    onBeforeMove(pokemon) {
            pokemon.volatiles['confusion'].time--;
            if (!pokemon.volatiles['confusion'].time) {
                pokemon.removeVolatile('confusion');
                return;
            }
            this.add('-activate', pokemon, 'confusion');
            if (this.randomChance(1, 2)) {
                return;
            }
            const damage = this.actions.getDamage(pokemon, pokemon, 40);
            if (typeof damage !== 'number')
                throw new Error("Confusion damage not dealt");
            this.damage(damage, pokemon, pokemon, {
                id: 'confused',
                effectType: 'Move',
                type: '???',
            });
            return false;
        },
  },
  deltastream: {
    name: "DeltaStream",
    effectType: "Weather",
    duration: 0,
    onEffectivenessPriority: -1,
    onEffectiveness(typeMod, target, type, move) {
            if (move && move.effectType === 'Move' && move.category !== 'Status' && type === 'Flying' && typeMod > 0) {
                this.add('-fieldactivate', 'Delta Stream');
                return 0;
            }
        },
    onFieldStart(field, source, effect) {
            this.add('-weather', 'DeltaStream', '[from] ability: ' + effect.name, `[of] ${source}`);
        },
    onFieldResidualOrder: 1,
    onFieldResidual() {
            this.add('-weather', 'DeltaStream', '[upkeep]');
            this.eachEvent('Weather');
        },
    onFieldEnd() {
            this.add('-weather', 'none');
        },
  },
  desolateland: {
    name: "DesolateLand",
    effectType: "Weather",
    duration: 0,
    onTryMovePriority: 1,
    onTryMove(attacker, defender, move) {
            if (move.type === 'Water' && move.category !== 'Status') {
                this.debug('Desolate Land water suppress');
                this.add('-fail', attacker, move, '[from] Desolate Land');
                this.attrLastMove('[still]');
                return null;
            }
        },
    onWeatherModifyDamage(damage, attacker, defender, move) {
            if (defender.effectiveWeather() !== 'desolateland')
                return;
            if (move.type === 'Fire') {
                this.debug('Desolate Land fire boost');
                return this.chainModify(1.5);
            }
        },
    onFieldStart(field, source, effect) {
            this.add('-weather', 'DesolateLand', '[from] ability: ' + effect.name, `[of] ${source}`);
        },
    onImmunity(type, pokemon) {
            if (pokemon.effectiveWeather() !== 'desolateland')
                return;
            if (type === 'frz')
                return false;
        },
    onFieldResidualOrder: 1,
    onFieldResidual() {
            this.add('-weather', 'DesolateLand', '[upkeep]');
            this.eachEvent('Weather');
        },
    onFieldEnd() {
            this.add('-weather', 'none');
        },
  },
  dynamax: {
    name: "Dynamax",
    noCopy: true,
    onStart(pokemon) {
            this.effectState.turns = 0;
            pokemon.removeVolatile('minimize');
            pokemon.removeVolatile('substitute');
            if (pokemon.volatiles['torment']) {
                delete pokemon.volatiles['torment'];
                this.add('-end', pokemon, 'Torment', '[silent]');
            }
            if (['cramorantgulping', 'cramorantgorging'].includes(pokemon.species.id) && !pokemon.transformed) {
                pokemon.formeChange('cramorant');
            }
            this.add('-start', pokemon, 'Dynamax', pokemon.gigantamax ? 'Gmax' : '');
            if (pokemon.baseSpecies.name === 'Shedinja')
                return;
            // Changes based on dynamax level, 2 is max (at LVL 10)
            const ratio = 1.5 + (pokemon.dynamaxLevel * 0.05);
            pokemon.maxhp = Math.floor(pokemon.maxhp * ratio);
            pokemon.hp = Math.floor(pokemon.hp * ratio);
            this.add('-heal', pokemon, pokemon.getHealth, '[silent]');
        },
    onTryAddVolatile(status, pokemon) {
            if (status.id === 'flinch')
                return null;
        },
    onBeforeSwitchOutPriority: -1,
    onBeforeSwitchOut(pokemon) {
            pokemon.removeVolatile('dynamax');
        },
    onSourceModifyDamage(damage, source, target, move) {
            if (move.id === 'behemothbash' || move.id === 'behemothblade' || move.id === 'dynamaxcannon') {
                return this.chainModify(2);
            }
        },
    onDragOutPriority: 2,
    onDragOut(pokemon) {
            this.add('-block', pokemon, 'Dynamax');
            return null;
        },
    onResidualPriority: -100,
    onResidual() {
            this.effectState.turns++;
        },
    onEnd(pokemon) {
            this.add('-end', pokemon, 'Dynamax');
            if (pokemon.baseSpecies.name === 'Shedinja')
                return;
            pokemon.hp = pokemon.getUndynamaxedHP();
            pokemon.maxhp = pokemon.baseMaxhp;
            this.add('-heal', pokemon, pokemon.getHealth, '[silent]');
        },
  },
  flinch: {
    name: "flinch",
    duration: 1,
    onBeforeMovePriority: 8,
    onBeforeMove(pokemon) {
            this.add('cant', pokemon, 'flinch');
            this.runEvent('Flinch', pokemon);
            return false;
        },
  },
  frz: {
    name: "frz",
    effectType: "Status",
    onStart(target, source, sourceEffect) {
            if (sourceEffect && sourceEffect.effectType === 'Ability') {
                this.add('-status', target, 'frz', '[from] ability: ' + sourceEffect.name, `[of] ${source}`);
            }
            else {
                this.add('-status', target, 'frz');
            }
            if (target.species.name === 'Shaymin-Sky' && target.baseSpecies.baseSpecies === 'Shaymin') {
                target.formeChange('Shaymin', this.effect, true);
            }
        },
    onBeforeMovePriority: 10,
    onBeforeMove(pokemon, target, move) {
            if (this.randomChance(1, 5)) {
                pokemon.cureStatus();
                return;
            }
            if (move.flags['defrost'])
                return;
            this.add('cant', pokemon, 'frz');
            return false;
        },
    onModifyMove(move, pokemon) {
            if (move.flags['defrost']) {
                this.add('-curestatus', pokemon, 'frz', `[from] move: ${move}`);
                pokemon.clearStatus();
            }
        },
    onAfterMoveSecondary(target, source, move) {
            if (move.thawsTarget) {
                target.cureStatus();
            }
        },
    onDamagingHit(damage, target, source, move) {
            if (move.type === 'Fire' && move.category !== 'Status' && move.id !== 'polarflare') {
                target.cureStatus();
            }
        },
  },
  futuremove: {
    name: "futuremove",
    onStart(target) {
            this.effectState.targetSlot = target.getSlot();
            this.effectState.endingTurn = (this.turn - 1) + 2;
            if (this.effectState.endingTurn >= 254) {
                this.hint(`In Gen 8+, Future attacks will never resolve when used on the 255th turn or later.`);
            }
        },
    onResidualOrder: 11,
    onResidual(target) {
            if (this.getOverflowedTurnCount() < this.effectState.endingTurn)
                return;
            target.side.removeSlotCondition(this.getAtSlot(this.effectState.targetSlot), 'futuremove');
        },
    onEnd(target) {
            const data = this.effectState;
            // time's up; time to hit! :D
            const move = this.dex.moves.get(data.move);
            if (target.fainted || target === data.source) {
                this.hint(`${move.name} did not hit because the target is ${(target.fainted ? 'fainted' : 'the user')}.`);
                return;
            }
            this.add('-end', target, 'move: ' + move.name);
            target.removeVolatile('Protect');
            target.removeVolatile('Endure');
            if (data.source.hasAbility('infiltrator') && this.gen >= 6) {
                data.moveData.infiltrates = true;
            }
            if (data.source.hasAbility('normalize') && this.gen >= 6) {
                data.moveData.type = 'Normal';
            }
            const hitMove = new this.dex.Move(data.moveData);
            this.actions.trySpreadMoveHit([target], data.source, hitMove, true);
            if (data.source.isActive && data.source.hasItem('lifeorb') && this.gen >= 5) {
                this.singleEvent('AfterMoveSecondarySelf', data.source.getItem(), data.source.itemState, data.source, target, data.source.getItem());
            }
            this.activeMove = null;
            this.checkWin();
        },
  },
  gem: {
    duration: 1,
    affectsFainted: true,
    onBasePower(basePower, user, target, move) {
            this.debug('Gem Boost');
            return this.chainModify(1.5);
        },
  },
  hail: {
    name: "Hail",
    effectType: "Weather",
    duration: 5,
    durationCallback(source, effect) {
            if (source?.hasItem('icyrock')) {
                return 8;
            }
            return 5;
        },
    onFieldStart(field, source, effect) {
            if (effect?.effectType === 'Ability') {
                if (this.gen <= 5)
                    this.effectState.duration = 0;
                this.add('-weather', 'Hail', '[from] ability: ' + effect.name, `[of] ${source}`);
            }
            else {
                this.add('-weather', 'Hail');
            }
        },
    onFieldResidualOrder: 8,
    onFieldResidual() {
            this.add('-weather', 'Hail', '[upkeep]');
            if (this.field.isWeather('hail'))
                this.eachEvent('Weather');
        },
    onWeather(target) {
            this.damage(target.baseMaxhp / 16);
        },
    onFieldEnd() {
            this.add('-weather', 'none');
        },
  },
  healreplacement: {
    name: "healreplacement",
    onStart(target, source, sourceEffect) {
            this.effectState.sourceEffect = sourceEffect;
            this.add('-activate', source, 'healreplacement');
        },
    onSwitchIn(target) {
            if (!target.fainted) {
                target.heal(target.maxhp);
                this.add('-heal', target, target.getHealth, '[from] move: ' + this.effectState.sourceEffect, '[zeffect]');
                target.side.removeSlotCondition(target, 'healreplacement');
            }
        },
  },
  lockedmove: {
    name: "lockedmove",
    duration: 2,
    onResidual(target) {
            if (target.status === 'slp') {
                // don't lock, and bypass confusion for calming
                delete target.volatiles['lockedmove'];
            }
            this.effectState.trueDuration--;
        },
    onStart(target, source, effect) {
            this.effectState.trueDuration = this.random(2, 4);
            this.effectState.move = effect.id;
        },
    onRestart() {
            if (this.effectState.trueDuration >= 2) {
                this.effectState.duration = 2;
            }
        },
    onAfterMove: undefined,
    onEnd(target) {
            if (this.effectState.trueDuration > 1)
                return;
            target.addVolatile('confusion');
        },
    onLockMove(pokemon) {
            if (pokemon.volatiles['dynamax'])
                return;
            return this.effectState.move;
        },
  },
  mustrecharge: {
    name: "mustrecharge",
    duration: 2,
    onBeforeMovePriority: 11,
    onBeforeMove(pokemon) {
            this.add('cant', pokemon, 'recharge');
            pokemon.removeVolatile('mustrecharge');
            pokemon.removeVolatile('truant');
            return null;
        },
    onStart(pokemon) {
            this.add('-mustrecharge', pokemon);
        },
    onLockMove: "recharge",
  },
  par: {
    name: "par",
    effectType: "Status",
    onStart(target, source, sourceEffect) {
            if (sourceEffect && sourceEffect.effectType === 'Ability') {
                this.add('-status', target, 'par', '[from] ability: ' + sourceEffect.name, `[of] ${source}`);
            }
            else {
                this.add('-status', target, 'par');
            }
        },
    onModifySpePriority: -101,
    onModifySpe(spe, pokemon) {
            if (!pokemon.hasAbility('quickfeet')) {
                return this.chainModify(0.25);
            }
            return spe;
        },
    onBeforeMovePriority: 1,
    onBeforeMove(pokemon) {
            if (!pokemon.hasAbility('magicguard') && this.randomChance(1, 4)) {
                this.add('cant', pokemon, 'par');
                return false;
            }
        },
  },
  partiallytrapped: {
    name: "partiallytrapped",
    duration: 5,
    durationCallback(target, source) {
            if (source.hasItem('gripclaw'))
                return 6;
            return this.random(3, 7);
        },
    onStart(pokemon, source) {
            this.add('-activate', pokemon, 'move: ' + this.effectState.sourceEffect, `[of] ${source}`);
            this.effectState.boundDivisor = source.hasItem('bindingband') ? 8 : 16;
        },
    onResidualOrder: 10,
    onResidual(pokemon) {
            const trapper = this.effectState.source;
            if (trapper && (!trapper.isActive || trapper.hp <= 0 || !trapper.activeTurns)) {
                delete pokemon.volatiles['partiallytrapped'];
                this.add('-end', pokemon, this.effectState.sourceEffect, '[partiallytrapped]', '[silent]');
                return;
            }
            this.damage(pokemon.baseMaxhp / this.effectState.boundDivisor);
        },
    onEnd(pokemon) {
            this.add('-end', pokemon, this.effectState.sourceEffect, '[partiallytrapped]');
        },
    onTrapPokemon(pokemon) {
            const gmaxEffect = ['gmaxcentiferno', 'gmaxsandblast'].includes(this.effectState.sourceEffect.id);
            if (this.effectState.source?.isActive || gmaxEffect)
                pokemon.tryTrap();
        },
    onResidualSubOrder: 9,
  },
  primordialsea: {
    name: "PrimordialSea",
    effectType: "Weather",
    duration: 0,
    onTryMovePriority: 1,
    onTryMove(attacker, defender, move) {
            if (move.type === 'Fire' && move.category !== 'Status') {
                this.debug('Primordial Sea fire suppress');
                this.add('-fail', attacker, move, '[from] Primordial Sea');
                this.attrLastMove('[still]');
                return null;
            }
        },
    onWeatherModifyDamage(damage, attacker, defender, move) {
            if (defender.effectiveWeather() !== 'primordialsea')
                return;
            if (move.type === 'Water') {
                this.debug('Rain water boost');
                return this.chainModify(1.5);
            }
        },
    onFieldStart(field, source, effect) {
            this.add('-weather', 'PrimordialSea', '[from] ability: ' + effect.name, `[of] ${source}`);
        },
    onFieldResidualOrder: 1,
    onFieldResidual() {
            this.add('-weather', 'PrimordialSea', '[upkeep]');
            this.eachEvent('Weather');
        },
    onFieldEnd() {
            this.add('-weather', 'none');
        },
  },
  psn: {
    name: "psn",
    effectType: "Status",
    onStart(target, source, sourceEffect) {
            if (sourceEffect && sourceEffect.effectType === 'Ability') {
                this.add('-status', target, 'psn', '[from] ability: ' + sourceEffect.name, `[of] ${source}`);
            }
            else {
                this.add('-status', target, 'psn');
            }
        },
    onResidualOrder: 10,
    onResidual(pokemon) {
            this.damage(pokemon.baseMaxhp / 8);
        },
    onResidualSubOrder: 6,
  },
  raindance: {
    name: "RainDance",
    effectType: "Weather",
    duration: 5,
    durationCallback(source, effect) {
            if (source?.hasItem('damprock')) {
                return 8;
            }
            return 5;
        },
    onWeatherModifyDamage(damage, attacker, defender, move) {
            if (defender.effectiveWeather() !== 'raindance')
                return;
            if (move.type === 'Water') {
                this.debug('rain water boost');
                return this.chainModify(1.5);
            }
            if (move.type === 'Fire') {
                this.debug('rain fire suppress');
                return this.chainModify(0.5);
            }
        },
    onFieldStart(field, source, effect) {
            if (effect?.effectType === 'Ability') {
                if (this.gen <= 5)
                    this.effectState.duration = 0;
                this.add('-weather', 'RainDance', '[from] ability: ' + effect.name, `[of] ${source}`);
            }
            else {
                this.add('-weather', 'RainDance');
            }
        },
    onFieldResidualOrder: 8,
    onFieldResidual() {
            this.add('-weather', 'RainDance', '[upkeep]');
            this.eachEvent('Weather');
        },
    onFieldEnd() {
            this.add('-weather', 'none');
        },
  },
  rolloutstorage: {
    name: "rolloutstorage",
    duration: 2,
    onBasePower(relayVar, source, target, move) {
            let bp = Math.max(1, move.basePower);
            bp *= 2 ** source.volatiles['rolloutstorage'].contactHitCount;
            if (source.volatiles['defensecurl']) {
                bp *= 2;
            }
            source.removeVolatile('rolloutstorage');
            return bp;
        },
  },
  sandstorm: {
    name: "Sandstorm",
    effectType: "Weather",
    duration: 5,
    durationCallback(source, effect) {
            if (source?.hasItem('smoothrock')) {
                return 8;
            }
            return 5;
        },
    onModifySpDPriority: 10,
    onModifySpD(spd, pokemon) {
            if (pokemon.hasType('Rock') && pokemon.effectiveWeather() === 'sandstorm') {
                return this.modify(spd, 1.5);
            }
        },
    onFieldStart(field, source, effect) {
            if (effect?.effectType === 'Ability') {
                if (this.gen <= 5)
                    this.effectState.duration = 0;
                this.add('-weather', 'Sandstorm', '[from] ability: ' + effect.name, `[of] ${source}`);
            }
            else {
                this.add('-weather', 'Sandstorm');
            }
        },
    onFieldResidualOrder: 8,
    onFieldResidual() {
            this.add('-weather', 'Sandstorm', '[upkeep]');
            if (this.field.isWeather('sandstorm'))
                this.eachEvent('Weather');
        },
    onWeather(target) {
            this.damage(target.baseMaxhp / 16);
        },
    onFieldEnd() {
            this.add('-weather', 'none');
        },
  },
  silvally: {
    name: "Silvally",
    onTypePriority: 1,
    onType(types, pokemon) {
            if (pokemon.transformed || pokemon.ability !== 'rkssystem' && this.gen >= 8)
                return types;
            let type = 'Normal';
            if (pokemon.ability === 'rkssystem') {
                type = pokemon.getItem().onMemory;
                if (!type) {
                    type = 'Normal';
                }
            }
            return [type];
        },
  },
  slp: {
    name: "slp",
    effectType: "Status",
    onStart(target, source, sourceEffect) {
            if (sourceEffect && sourceEffect.effectType === 'Move') {
                this.add('-status', target, 'slp', `[from] move: ${sourceEffect.name}`);
            }
            else {
                this.add('-status', target, 'slp');
            }
            // 1-4 turns
            this.effectState.time = this.random(2, 6);
            if (target.removeVolatile('nightmare')) {
                this.add('-end', target, 'Nightmare', '[silent]');
            }
        },
    onBeforeMovePriority: 10,
    onBeforeMove(pokemon, target, move) {
            if (pokemon.hasAbility('earlybird')) {
                pokemon.statusState.time--;
            }
            pokemon.statusState.time--;
            if (pokemon.statusState.time <= 0) {
                pokemon.cureStatus();
                return;
            }
            this.add('cant', pokemon, 'slp');
            if (move.sleepUsable) {
                return;
            }
            return false;
        },
  },
  snowscape: {
    name: "Snowscape",
    effectType: "Weather",
    duration: 5,
    durationCallback(source, effect) {
            if (source?.hasItem('icyrock')) {
                return 8;
            }
            return 5;
        },
    onModifyDefPriority: 10,
    onModifyDef(def, pokemon) {
            if (pokemon.hasType('Ice') && pokemon.effectiveWeather() === 'snowscape') {
                return this.modify(def, 1.5);
            }
        },
    onFieldStart(field, source, effect) {
            if (effect?.effectType === 'Ability') {
                if (this.gen <= 5)
                    this.effectState.duration = 0;
                this.add('-weather', 'Snowscape', '[from] ability: ' + effect.name, `[of] ${source}`);
            }
            else {
                this.add('-weather', 'Snowscape');
            }
        },
    onFieldResidualOrder: 1,
    onFieldResidual() {
            this.add('-weather', 'Snowscape', '[upkeep]');
            if (this.field.isWeather('snowscape'))
                this.eachEvent('Weather');
        },
    onFieldEnd() {
            this.add('-weather', 'none');
        },
  },
  stall: {
    duration: 2,
    counterMax: 8,
    onStart() {
            this.effectState.counter = 2;
        },
    onStallMove() {
            // this.effectState.counter should never be undefined here.
            // However, just in case, use 1 if it is undefined.
            const counter = this.effectState.counter || 1;
            if (counter >= 256) {
                return this.randomChance(1, 2 ** 32);
            }
            this.debug(`Success chance: ${Math.round(100 / counter)}%`);
            return this.randomChance(1, counter);
        },
    onRestart() {
            if (this.effectState.counter < this.effect.counterMax) {
                this.effectState.counter *= 2;
            }
            this.effectState.duration = 2;
        },
  },
  substitutebroken: {
    noCopy: true,
  },
  sunnyday: {
    name: "SunnyDay",
    effectType: "Weather",
    duration: 5,
    durationCallback(source, effect) {
            if (source?.hasItem('heatrock')) {
                return 8;
            }
            return 5;
        },
    onWeatherModifyDamage(damage, attacker, defender, move) {
            if (move.id === 'hydrosteam' && attacker.effectiveWeather() === 'sunnyday') {
                this.debug('Sunny Day Hydro Steam boost');
                return this.chainModify(1.5);
            }
            if (defender.effectiveWeather() !== 'sunnyday')
                return;
            if (move.type === 'Fire') {
                this.debug('Sunny Day fire boost');
                return this.chainModify(1.5);
            }
            if (move.type === 'Water') {
                this.debug('Sunny Day water suppress');
                return this.chainModify(0.5);
            }
        },
    onFieldStart(battle, source, effect) {
            if (effect?.effectType === 'Ability') {
                if (this.gen <= 5)
                    this.effectState.duration = 0;
                this.add('-weather', 'SunnyDay', '[from] ability: ' + effect.name, `[of] ${source}`);
            }
            else {
                this.add('-weather', 'SunnyDay');
            }
        },
    onImmunity(type, pokemon) {
            if (pokemon.effectiveWeather() !== 'sunnyday')
                return;
            if (type === 'frz')
                return false;
        },
    onFieldResidualOrder: 8,
    onFieldResidual() {
            this.add('-weather', 'SunnyDay', '[upkeep]');
            this.eachEvent('Weather');
        },
    onFieldEnd() {
            this.add('-weather', 'none');
        },
  },
  tox: {
    name: "tox",
    effectType: "Status",
    onStart(target, source, sourceEffect) {
            this.effectState.stage = 0;
            if (sourceEffect && sourceEffect.id === 'toxicorb') {
                this.add('-status', target, 'tox', '[from] item: Toxic Orb');
            }
            else if (sourceEffect && sourceEffect.effectType === 'Ability') {
                this.add('-status', target, 'tox', '[from] ability: ' + sourceEffect.name, `[of] ${source}`);
            }
            else {
                this.add('-status', target, 'tox');
            }
        },
    onSwitchIn() {
            this.effectState.stage = 0;
        },
    onResidualOrder: 10,
    onResidual(pokemon) {
            if (this.effectState.stage < 15) {
                this.effectState.stage++;
            }
            this.damage(this.clampIntRange(pokemon.baseMaxhp / 16, 1) * this.effectState.stage);
        },
    onResidualSubOrder: 6,
  },
  trapped: {
    name: "trapped",
    noCopy: false,
    onTrapPokemon(pokemon) {
            pokemon.tryTrap();
        },
    onStart(target) {
            this.add('-activate', target, 'trapped');
        },
  },
  trapper: {
    name: "trapper",
    noCopy: false,
  },
  twoturnmove: {
    name: "twoturnmove",
    duration: 2,
    onStart(attacker, defender, effect) {
            // ("attacker" is the Pokemon using the two turn move and the Pokemon this condition is being applied to)
            this.effectState.move = effect.id;
            attacker.addVolatile(effect.id);
            // lastMoveTargetLoc is the location of the originally targeted slot before any redirection
            // note that this is not updated for moves called by other moves
            // i.e. if Dig is called by Metronome, lastMoveTargetLoc will still be the user's location
            let moveTargetLoc = attacker.lastMoveTargetLoc;
            if (effect.sourceEffect && this.dex.moves.get(effect.id).target !== 'self') {
                // this move was called by another move such as Metronome
                // and needs a random target to be determined this turn
                // it will already have one by now if there is any valid target
                // but if there isn't one we need to choose a random slot now
                if (defender.fainted) {
                    defender = this.sample(attacker.foes(true));
                }
                moveTargetLoc = attacker.getLocOf(defender);
            }
            attacker.volatiles[effect.id].targetLoc = moveTargetLoc;
            this.attrLastMove('[still]');
            // Run side-effects normally associated with hitting (e.g., Protean, Libero)
            this.runEvent('PrepareHit', attacker, defender, effect);
        },
    onEnd(target) {
            target.removeVolatile(this.effectState.move);
        },
    onLockMove() {
            return this.effectState.move;
        },
    onMoveAborted(pokemon) {
            pokemon.removeVolatile('twoturnmove');
        },
  },
  zacian: {
    name: "Zacian",
    onBattleStart(pokemon) {
            if (pokemon.item !== 'rustedsword')
                return;
            const rawSpecies = this.dex.species.get('Zacian-Crowned');
            const species = pokemon.setSpecies(rawSpecies);
            if (!species)
                return;
            pokemon.baseSpecies = rawSpecies;
            pokemon.details = pokemon.getUpdatedDetails();
            pokemon.setAbility(species.abilities['0'], null, null, true);
            pokemon.baseAbility = pokemon.ability;
            const ironHeadIndex = pokemon.baseMoves.indexOf('ironhead');
            if (ironHeadIndex >= 0) {
                const move = this.dex.moves.get('behemothblade');
                const pp = this.calculatePP(move, pokemon.ppUps[ironHeadIndex]);
                pokemon.baseMoveSlots[ironHeadIndex] = {
                    move: move.name,
                    id: move.id,
                    pp,
                    maxpp: pp,
                    target: move.target,
                    disabled: false,
                    disabledSource: '',
                    used: false,
                };
                pokemon.moveSlots = pokemon.baseMoveSlots.slice();
            }
        },
  },
  zamazenta: {
    name: "Zamazenta",
    onBattleStart(pokemon) {
            if (pokemon.item !== 'rustedshield')
                return;
            const rawSpecies = this.dex.species.get('Zamazenta-Crowned');
            const species = pokemon.setSpecies(rawSpecies);
            if (!species)
                return;
            pokemon.baseSpecies = rawSpecies;
            pokemon.details = pokemon.getUpdatedDetails();
            pokemon.setAbility(species.abilities['0'], null, null, true);
            pokemon.baseAbility = pokemon.ability;
            const ironHeadIndex = pokemon.baseMoves.indexOf('ironhead');
            if (ironHeadIndex >= 0) {
                const move = this.dex.moves.get('behemothbash');
                const pp = this.calculatePP(move, pokemon.ppUps[ironHeadIndex]);
                pokemon.baseMoveSlots[ironHeadIndex] = {
                    move: move.name,
                    id: move.id,
                    pp,
                    maxpp: pp,
                    target: move.target,
                    disabled: false,
                    disabledSource: '',
                    used: false,
                };
                pokemon.moveSlots = pokemon.baseMoveSlots.slice();
            }
        },
  },
}
