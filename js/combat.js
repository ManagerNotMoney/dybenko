// combat.js
// ============================================================
// Логика боя. Не трогает DOM напрямую — только меняет данные
// (Player/Enemy) и испускает события через bus.
// ============================================================
import { bus } from "./engine.js";
import { composeEquipment } from "./equipment.js";
import { getUniqueItemById } from "./data/unique-items.js";
import { getConsumableById } from "./data/consumables.js";
import { renderIcon } from "./ui/icon.js";
import { saveRunIfRecord } from "./records.js";

const HIDEOUT_CHANCE = 0.35; // шанс при побеге найти укромное место вместо мгновенного бегства

export class CombatManager {
  constructor(state) {
    this.state = state;
  }
  _handlePlayerDefeat(enemy) {
    bus.emit("combat:log", { text: "Ты пал в подземелье...", type: "system" });
    this.state.phase = "defeat";

    const player = this.state.player;
    const { isNewRecord } = saveRunIfRecord({
      depth: this.state.depth,
      level: player.level,
      stoicism: player.stoicism,
      strength: player.strength,
      agility: player.agility,
      killedBy: { name: enemy.name, icon: enemy.icon },
      equipment: player.getEquipmentSnapshot(),
      date: Date.now(),
    });

    if (isNewRecord) {
      bus.emit("combat:log", { text: `🏆 Новый рекорд глубины: ${this.state.depth}!`, type: "good" });
    }
  }
  /**
   * Общая проверка парирования мечом (для игрока и для врагов).
   * Шанс парирования = (стойкость защищающегося - ловкость атакующего) / 100.
   * Критический удар парировать нельзя. Если парирование удалось —
   * тем же шансом, отдельным броском, защищающийся наносит немедленную
   * ответную контратаку (риппост).
   */
  _tryParry(defenderStoicism, defenderAgility, attackerAgility, isCrit, hasSword) {
    if (isCrit || !hasSword) return { parried: false, counterAttack: false };

    const diff = defenderStoicism - attackerAgility;
    if (diff <= 0) return { parried: false, counterAttack: false };

    // Шанс самого парирования учитывает ловкость защищающегося (половину её значения).
    // Шанс ответного удара (риппоста) — только исходная разница, без этого бонуса.
    const parryChance = Math.min(1, (diff + defenderAgility / 2) / 100);
    const riposteChance = Math.min(1, diff / 100);

    if (Math.random() >= parryChance) return { parried: false, counterAttack: false };

    return { parried: true, counterAttack: Math.random() < riposteChance };
  }

  playerAttack() {
    const { player, enemy } = this.state;
    if (!player.isAlive || !enemy.isAlive || this.state.isBusy) return;

    this.state.isBusy = true;
    bus.emit("combat:turn-start", {});

    let spearFirstStrike = false;

    if (!this.state.initiativeRolled) {
      this.state.initiativeRolled = true;

      if (this.state.forceEnemyInitiative) {
        this.state.forceEnemyInitiative = false;
        bus.emit("combat:log", {
          text: `⚠️ Пока ты медлил в укрытии, ${enemy.name} застаёт тебя врасплох и бьёт первым!`,
          type: "system",
        });
        this._enemyAttackThenPlayer();
        return;
      }

      // Копьё держит врага на расстоянии — инициатива не бросается вообще,
      // игрок гарантированно бьёт первым, и именно этот удар усилен на 50%
      // (см. spearFirstStrike в _performPlayerAttack).
      if (player.equippedWeaponForm === "spear") {
        spearFirstStrike = true;
        bus.emit("combat:log", {
          text: `🔱 Длинное древко копья не подпускает ${enemy.name} вплотную — ты бьёшь первым, и удар выходит особенно мощным!`,
          type: "system",
        });
      } else {
        const playerRoll = player.rollInitiative();
        const enemyAgility = Math.floor(enemy.level / 2);
        const enemyRoll = Math.floor(Math.random() * 20) + 1 + enemyAgility;

        if (enemyRoll > playerRoll) {
          bus.emit("combat:log", {
            text: `⚡ ${enemy.name} реагирует быстрее (инициатива: ты ${playerRoll} vs враг ${enemyRoll}) и бьёт первым!`,
            type: "system",
          });
          this._enemyAttackThenPlayer();
          return;
        } else {
          bus.emit("combat:log", {
            text: `⚡ Ты успеваешь первым (инициатива: ты ${playerRoll} vs враг ${enemyRoll}).`,
            type: "system",
          });
        }
      }
    }

    this._performPlayerAttack({ spearFirstStrike });

    // Враг мог парировать удар мечом и тут же ответить контратакой — игрок
    // способен погибнуть прямо на своём ходу. _handlePlayerDefeat() уже
    // вызван внутри _performPlayerAttack (в ветке риппоста) — повторный
    // вызов здесь дублирует лог "Ты пал в подземелье...".
    if (!player.isAlive) {
      this.state.isBusy = false;
      bus.emit("combat:turn-end", {});
      return;
    }

    if (!enemy.isAlive) {
      this._resolveVictory();
      return;
    }

    setTimeout(() => this._enemyAttack(), 480);
  }

  /**
   * Удар игрока по врагу (и обычный, и ответный после первого удара врага).
   * Учитывает возможность уворота врага: чем выше его ловкость относительно
   * силы удара и ловкости игрока — тем больше шанс полностью избежать урона.
   * Критический удар увернуть нельзя.
   */
  _performPlayerAttack({ isCounter = false, canRiposte = true, isRiposte = false, spearFirstStrike = false } = {}) {
    const { player, enemy } = this.state;
    const { amount: rolledAmount, isCrit } = player.rollAttack(enemy.agility);
    // Гарантированный первый удар копья (см. playerAttack) — на 50% сильнее.
    const amount = spearFirstStrike ? Math.round(rolledAmount * 1.5) : rolledAmount;

    if (!isCrit && enemy.agility > amount + player.agility && Math.random() < 0.6) {
      bus.emit("combat:log", {
        text: isCounter
          ? `Ты бьёшь в ответ, но ${enemy.name} уворачивается!`
          : `Ты бьёшь ${enemy.name}, но он уворачивается от удара!`,
        type: "system",
      });
      bus.emit("enemy:dodged", {});
      return { dodged: true };
    }

    // Парирование врага мечом (если у него есть стойкость и он "вооружён" мечом):
    // чем выше его стойкость относительно ловкости игрока, тем больше шанс
    // полностью отразить удар и (отдельным броском) ответить контратакой.
    const isEnemySwordsman = typeof enemy.wields === "string" && enemy.wields.includes("sword");
    // Риппост (мгновенный ответный удар после чужого парирования) парировать
    const parry = isRiposte
      ? { parried: false, counterAttack: false }
      : this._tryParry(enemy.stoicism || 0, enemy.agility, player.agility, isCrit, isEnemySwordsman);
    if (parry.parried) {
      bus.emit("combat:log", {
        text: isCounter
          ? `Ты бьёшь в ответ, но ${enemy.name} парирует удар мечом!`
          : `Ты бьёшь ${enemy.name}, но он парирует удар мечом!`,
        type: "system",
      });
      bus.emit("enemy:parried", {});

      if (parry.counterAttack && canRiposte && player.isAlive) {
        bus.emit("combat:log", { text: `${enemy.name} тут же наносит ответный удар!`, type: "damage" });
        this._performEnemyAttack({ isFirstStrike: false, canRiposte: false, isRiposte: true });
        if (!player.isAlive) this._handlePlayerDefeat(enemy);
      }

      return { dodged: false, parried: true };
    }

    enemy.takeDamage(amount);
    bus.emit("enemy:damaged", { amount, isCrit, current: enemy.currentHP, max: enemy.maxHP });
    bus.emit("combat:log", {
      text: isCrit
        ? (isCounter
            ? `Ты отвечаешь критическим ударом: ${amount} урона!`
            : `Ты наносишь критический удар: ${amount} урона!`)
        : (isCounter
            ? `Ты отвечаешь ударом: ${amount} урона.`
            : `Ты атакуешь ${enemy.name} и наносишь ${amount} урона.`),
      type: "player",
    });

    // Оружие было смочено ядом — удар состоялся (не увёрнут, не парирован),
    // поэтому яд переходит на врага, а заряд на оружии расходуется.
    if (enemy.isAlive && player.weaponPoison) {
      const poisonDmg = Math.round(enemy.maxHP * player.weaponPoison.damagePercent);
      enemy.applyPoison(poisonDmg, player.weaponPoison.ticks);
      bus.emit("combat:log", {
        text: `${renderIcon(player.weaponPoison.icon)} Яд с оружия проникает в рану — ${enemy.name} будет травиться ещё ${player.weaponPoison.ticks} х.`,
        type: "good",
      });
      bus.emit("enemy:poisoned", { ticksLeft: player.weaponPoison.ticks });
      player.weaponPoison = null;
    }

    return { dodged: false, amount, isCrit };
  }

  _performEnemyAttack({ isFirstStrike, canRiposte = true, isRiposte = false }) {
    const { player, enemy } = this.state;
    const { amount: incoming, isCrit } = enemy.rollAttack(player.agility);
    const verb = isFirstStrike ? "бьёт первым" : "атакует";
    const critPrefix = isCrit ? "Точный выстрел! " : "";

    // Уворот 1: ловкость выше сырого урона + ловкости врага — 70% шанс полностью избежать удара
    const agilityDodge = !isCrit && player.agility > incoming + enemy.agility && Math.random() < 0.7;
    // Уворот 2: независимый шанс от экипировки (например, теневой ткани) — работает всегда
    const gearDodge = !isCrit && !agilityDodge && Math.random() < player.dodgeChance;

    if (agilityDodge || gearDodge) {
      bus.emit("combat:log", {
        text: `${enemy.name} ${verb} (${incoming} урона), но ты уворачиваешься!`,
        type: "system",
      });
      bus.emit("player:dodged", { incoming });

      // Копьё: любое уклонение от удара врага заканчивается бесплатным
      // ответным ударом. canRiposte=false (например, во время провала
      // побега или уже внутри чужой риппост-цепочки) гасит его, чтобы
      // не порождать бесконечные цепочки контратак.
      if (canRiposte && enemy.isAlive && player.equippedWeaponForm === "spear") {
        bus.emit("combat:log", { text: `🔱 Ты уходишь с линии удара и тут же бьёшь копьём в ответ!`, type: "player" });
        this._performPlayerAttack({ isCounter: true, canRiposte: false, isRiposte: true });
        if (!enemy.isAlive) this._resolveVictory();
      }

      return { taken: 0, blocked: 0, penetrated: 0, dodged: true };
    }

    // Парирование мечом: чем выше стойкость игрока относительно ловкости врага,
    // тем больше шанс полностью отразить удар и (отдельным броском) ответить контратакой.
    // Риппост парировать повторно нельзя (см. комментарий в _performPlayerAttack).
    const parry = isRiposte
      ? { parried: false, counterAttack: false }
      : this._tryParry(player.stoicism, player.agility, enemy.agility, isCrit, player.equippedWeaponForm === "sword");
    if (parry.parried) {
      bus.emit("combat:log", {
        text: `${critPrefix}${enemy.name} ${verb} (${incoming} урона), но ты парируешь удар мечом!`,
        type: "system",
      });
      bus.emit("player:parried", {});

      if (parry.counterAttack && canRiposte && enemy.isAlive) {
        bus.emit("combat:log", { text: "Молниеносный ответный удар!", type: "player" });
        this._performPlayerAttack({ isCounter: true, canRiposte: false, isRiposte: true });
        if (!enemy.isAlive) this._resolveVictory();
      }

      return { taken: 0, blocked: 0, penetrated: 0, parried: true };
    }

    const { blocked, taken, penetrated, part, hitParts } = player.takeDamage(incoming, enemy.agility);
    const partSuffix = part ? ` Удар приходится на ${part.nameAcc}.` : "";

    let text;
    if (penetrated > 0 && blocked > 0) {
      text = `${critPrefix}${enemy.name} ${verb} (${incoming} урона) — пробивает броню на ${penetrated}, поглощается ${blocked}, ты получаешь ${taken}.${partSuffix}`;
    } else if (penetrated > 0) {
      text = `${critPrefix}${enemy.name} ${verb} (${incoming} урона) — ловкость пробивает всю броню, ты получаешь ${taken}!${partSuffix}`;
    } else if (blocked > 0) {
      text = `${critPrefix}${enemy.name} ${verb} (${incoming} урона) — броня поглощает ${blocked}, ты получаешь ${taken}.${partSuffix}`;
    } else if (isFirstStrike) {
      text = `${critPrefix}${enemy.name} бьёт первым и наносит тебе ${taken} урона.${partSuffix}`;
    } else {
      text = `${critPrefix}${enemy.name} атакует и наносит тебе ${taken} урона.${partSuffix}`;
    }

    bus.emit("combat:log", { text, type: "damage" });

    // Ядовитая стрела: если враг умеет травить (лучники с полем poisonOnHit),
    // с заданным шансом заражает игрока на пораженной атаке — на увороте/
    // парировании этот код не выполняется, мы сюда доходим только по факту урона.
    if (player.isAlive && enemy.poisonOnHit && Math.random() < enemy.poisonOnHit.chance) {
      const poisonDmg = Math.round(player.maxHP * enemy.poisonOnHit.damagePercent);
      player.applyPoison(poisonDmg, enemy.poisonOnHit.ticks);
      bus.emit("combat:log", {
        text: `☠️ Наконечник стрелы был отравлен — яд проникает в кровь, ты будешь травиться ещё ${enemy.poisonOnHit.ticks} х.`,
        type: "damage",
      });
      bus.emit("player:poisoned", { ticksLeft: enemy.poisonOnHit.ticks });
    }

    // Если урон "прошёл" через несколько частей тела (одна была уничтожена
    // и избыток ушёл дальше) — отдельной строкой перечисляем всю цепочку.
    if (hitParts && hitParts.length > 1) {
      const chain = hitParts.map((p) => `${p.nameAcc} (${p.amount})`).join(" → ");
      bus.emit("combat:log", { text: `Урон распределился по цепочке: ${chain}.`, type: "system" });
    }

    return { taken, blocked, penetrated, isCrit, part, hitParts };
  }

  /**
   * Один тик яда на враге за боевой раунд (аналог player.tickBleeding(), но
   * для врага). Возвращает true, если враг умер именно от этого тика —
   * тогда вызывающий код должен сам разрешить победу и не продолжать раунд.
   */
  _tickEnemyPoison() {
    const { enemy } = this.state;
    const result = enemy.tickPoison();
    if (!result) return false;

    bus.emit("enemy:damaged", { amount: result.amount, isCrit: false, current: enemy.currentHP, max: enemy.maxHP, poison: true });
    bus.emit("combat:log", {
      text: result.ticksLeft > 0
        ? `☠️ Яд разъедает ${enemy.name} изнутри: -${result.amount} HP (ещё ${result.ticksLeft} х.).`
        : `☠️ Яд в последний раз обжигает ${enemy.name}: -${result.amount} HP. Действие яда закончилось.`,
      type: "damage",
    });

    return !enemy.isAlive;
  }

  /**
   * Тик яда от отравленной стрелы на игроке — раз за боевой раунд, как и
   * у врага. Тикает уже внутри player.tickPoison(), здесь только сообщаем
   * вызывающему коду, не убил ли этот тик игрока.
   */
  _tickPlayerPoison() {
    const { player } = this.state;
    const result = player.tickPoison();
    if (!result) return false;
    return !player.isAlive;
  }
  
  _enemyAttack() {
    const { player, enemy } = this.state;
    if (!player.isAlive) {
      this.state.isBusy = false;
      return;
    }

    const healed = enemy.tryHeal();
    if (healed != null) {
      bus.emit("enemy:healed", { amount: healed, current: enemy.currentHP, max: enemy.maxHP });
      bus.emit("combat:log", {
        text: `${enemy.name} вместо удара опрокидывает в себя зелье и восстанавливает ${healed} здоровья!`,
        type: "system",
      });
      this.state.isBusy = false;
      bus.emit("combat:turn-end", {});
      return;
    }

    this._performEnemyAttack({ isFirstStrike: false });

    // Игрок мог парировать удар и добить врага ответной атакой — победа
    // уже разрешена внутри _performEnemyAttack, дальше ходить не нужно.
    if (!enemy.isAlive) return;

    // Яд с оружия игрока тикает раз за раунд — здесь, а не в самом ударе,
    // потому что удар мог случиться несколько ходов назад: враг просто
    // "гниёт" дальше сам по себе, пока не кончатся тики.
    if (this._tickEnemyPoison()) {
      this._resolveVictory();
      return;
    }

    this.state.isBusy = false;

    if (player.isAlive) {
      player.tickBandages();
      player.tickBleeding();
      this._tickPlayerPoison();
    }

    if (!player.isAlive) {
      this._handlePlayerDefeat(enemy);
    }

    bus.emit("combat:turn-end", {});
  }

  /**
   * Враг атакует первым, затем, если игрок жив,
   * немедленно следует удар игрока в ответ.
   */
  _enemyAttackThenPlayer() {
    const { player, enemy } = this.state;

    this._performEnemyAttack({ isFirstStrike: true });

    // Игрок мог парировать первый удар и сразу добить врага ответной атакой.
    if (!enemy.isAlive) return;

    if (!player.isAlive) {
      this._handlePlayerDefeat(enemy);
      this.state.isBusy = false;
      bus.emit("combat:turn-end", {});
      return;
    }

    setTimeout(() => {
      this._performPlayerAttack({ isCounter: true });

      // Враг мог парировать ответный удар и тут же добить игрока.
      if (!player.isAlive) {
        this.state.isBusy = false;
        bus.emit("combat:turn-end", {});
        return;
      }

      if (!enemy.isAlive) {
        this._resolveVictory();
        return;
      }

      if (this._tickEnemyPoison()) {
        this._resolveVictory();
        return;
      }

      player.tickBandages();
      player.tickBleeding();
      this._tickPlayerPoison();

      if (!player.isAlive) {
        this._handlePlayerDefeat(enemy);
        this.state.isBusy = false;
        bus.emit("combat:turn-end", {});
        return;
      }

      this.state.isBusy = false;
      bus.emit("combat:turn-end", {});
    }, 480);
  }

  _resolveVictory() {
    const { player, enemy } = this.state;
    const xp = enemy.xpReward;
    const gold = player.gainGoldWithBonus(enemy.goldReward);
    const drops = [{ icon: "img/items/gold.png" }];

    bus.emit("combat:log", {
      text: `${enemy.name} повержен! +${xp} опыта, +${gold} золота.`,
      type: "good",
    });
    bus.emit("enemy:died", { enemy, xp, gold });

    player.gainXP(xp);

    this._rollItemDrops(enemy).forEach((item) => {
      if (!item) return;
      player.addItem(item.id);
      bus.emit("combat:log", {
        text: `Находка: ${renderIcon(item.icon)} ${item.name}!`,
        type: "system",
      });
      bus.emit("player:item-found", { item });
      drops.push({ icon: item.icon });
    });

    bus.emit("enemy:loot", { drops });

    this.state.phase = "victory";
    this.state.isBusy = false;
  }
  _rollItemDrops(enemy) {
    return enemy.drops
      .filter((entry) => Math.random() < entry.chance)
      .map((entry) => {
        if (entry.materialId && entry.formId) {
          return composeEquipment(entry.materialId, entry.formId);
        }
        if (entry.consumableId) {
          return getConsumableById(entry.consumableId);
        }
        if (entry.itemId) {
          return getUniqueItemById(entry.itemId);
        }
        return null;
      })
      .filter(Boolean);
  }

  flee() {
    if (this.state.isBusy || !this.state.player.isAlive) return;

    const player = this.state.player;

    // Шанс уйти вообще (сбежать ИЛИ найти укрытие) зависит от здоровья ног:
    // полностью здоровые — 100%, полностью уничтоженные — 0%. Если бросок
    // не прошёл — побег проваливается, враг бьёт один раз без ответа игрока.
    if (Math.random() >= player.legHealthPct) {
      bus.emit("combat:log", {
        text: "Ты пытаешься оторваться, но раненые ноги подводят — не успеваешь увернуться от удара!",
        type: "system",
      });
      this._failedFleeAttack();
      return;
    }

    // Вместо гарантированного мгновенного побега — шанс найти укромное
    // место, где можно спокойно отдохнуть несколько раз подряд (см.
    // hideout-логику в main.js: restHideout/leaveHideout).
    if (Math.random() < HIDEOUT_CHANCE) {
      this.state.phase = "hideout";
      this.state.hideoutRestsMax = 3 + Math.floor(Math.random() * 6); // 3..8
      this.state.hideoutRestsUsed = 0;
      this.state.hideoutWarned = false;
      this.state.hideoutAmbushPending = false;

      bus.emit("combat:log", {
        text: "Тебе удаётся укрыться в тёмной нише — здесь можно ненадолго перевести дух.",
        type: "system",
      });
      bus.emit("hideout:found", { restsMax: this.state.hideoutRestsMax });
      return;
    }

    bus.emit("combat:log", { text: "Ты отступаешь в тень коридора...", type: "system" });
    this.state.phase = "fled";
  }

  /**
   * Провал попытки побега/укрытия (см. flee() — раненые ноги): враг наносит
   * один гарантированный удар (как первый удар при проигранной инициативе),
   * игрок в ответ не атакует — он был занят попыткой оторваться, а не боем.
   * Пассивная защита (уворот/парирование) всё ещё работает, но риппоста
   * после парирования не будет — bой просто продолжается дальше как обычно.
   */
  _failedFleeAttack() {
    const { player, enemy } = this.state;

    this.state.isBusy = true;
    bus.emit("combat:turn-start", {});

    this._performEnemyAttack({ isFirstStrike: true, canRiposte: false });

    if (!player.isAlive) {
      this._handlePlayerDefeat(enemy);
      this.state.isBusy = false;
      bus.emit("combat:turn-end", {});
      return;
    }

    if (this._tickEnemyPoison()) {
      this._resolveVictory();
      return;
    }

    player.tickBandages();
    player.tickBleeding();
    this._tickPlayerPoison();

    if (!player.isAlive) {
      this._handlePlayerDefeat(enemy);
    }

    this.state.isBusy = false;
    bus.emit("combat:turn-end", {});
  }
}