// Item catalogue, loot tables and the backpack.
import { weighted } from './util.js';

export const ITEMS = {
  ammo_pistol: { name: 'Патроны 9 мм', short: '9мм', color: '#d8b35a', stack: 60, desc: 'Для пистолета ПМ.', ammo: true },
  ammo_shells: { name: 'Дробь 12 калибра', short: '12к', color: '#c4553d', stack: 24, desc: 'Для дробовика.', ammo: true },
  ammo_rifle: { name: 'Патроны 5.45', short: '5.45', color: '#a8a15a', stack: 90, desc: 'Для автомата.', ammo: true },
  bandage: { name: 'Бинт', short: 'БНТ', color: '#e8e4da', stack: 5, desc: 'Останавливает кровотечение, +15 HP.', use: 'heal' },
  medkit: { name: 'Аптечка', short: '+', color: '#d9534f', stack: 3, desc: 'Останавливает кровотечение, +60 HP.', use: 'heal' },
  painkillers: { name: 'Обезболивающее', short: 'ТАБ', color: '#8fb3d9', stack: 4, desc: '+25 HP постепенно.', use: 'heal' },
  canned: { name: 'Тушёнка', short: 'ЕДА', color: '#9bb56a', stack: 4, desc: 'Голод +45.', use: 'eat' },
  chips: { name: 'Сухари', short: 'СУХ', color: '#d9b47a', stack: 6, desc: 'Голод +20.', use: 'eat' },
  water: { name: 'Бутылка воды', short: 'H₂O', color: '#6fb0dc', stack: 4, desc: 'Жажда +50.', use: 'drink' },
  energy: { name: 'Энергетик', short: 'ЭНР', color: '#b6e04a', stack: 4, desc: 'Жажда +20, 40 секунд бег без усталости.', use: 'drink' },
  battery: { name: 'Батарейка', short: 'БАТ', color: '#c9c9c9', stack: 6, desc: 'Заряжает фонарик на 100%.', use: 'battery' },
  radio_part: { name: 'Деталь рации', short: 'РАД', color: '#e0a13a', stack: 3, desc: 'Нужны три, чтобы вызвать эвакуацию с вышки.', quest: true },
  // Weapons are not stored in the backpack, they go straight into weapon slots.
  w_shotgun: { name: 'Дробовик ИЖ-81', short: 'ДРБ', color: '#8a6a4a', weapon: 'shotgun' },
  w_rifle: { name: 'Автомат АКС-74У', short: 'АКС', color: '#6a6a5a', weapon: 'rifle' },
};

// What a container can hold, by container kind. Weights, not probabilities.
const TABLES = {
  crate: [['ammo_pistol', 5], ['ammo_shells', 3], ['ammo_rifle', 3], ['battery', 2], ['canned', 2], ['water', 2], ['bandage', 2], ['w_shotgun', 0.8], ['w_rifle', 0.6]],
  cabinet: [['bandage', 4], ['medkit', 2], ['painkillers', 3], ['battery', 3], ['ammo_pistol', 3], ['chips', 2], ['water', 2]],
  fridge: [['canned', 4], ['water', 5], ['chips', 3], ['energy', 3]],
  trunk: [['ammo_pistol', 3], ['ammo_shells', 2], ['water', 2], ['canned', 2], ['bandage', 2], ['energy', 1], ['battery', 1], ['w_shotgun', 0.4]],
  military: [['ammo_rifle', 5], ['ammo_shells', 3], ['ammo_pistol', 3], ['medkit', 3], ['w_rifle', 1.2], ['w_shotgun', 1], ['energy', 1]],
  chest: [['bandage', 3], ['canned', 3], ['chips', 3], ['water', 2], ['battery', 2], ['ammo_shells', 2], ['ammo_pistol', 2], ['w_shotgun', 0.5]],
  shelf: [['canned', 4], ['chips', 4], ['water', 4], ['energy', 3], ['battery', 2], ['painkillers', 1]],
  toolbox: [['battery', 4], ['ammo_shells', 2], ['bandage', 1], ['ammo_pistol', 1]],
  zombie: [['ammo_pistol', 4], ['bandage', 3], ['chips', 2], ['water', 2], ['ammo_shells', 1], ['ammo_rifle', 1], ['battery', 1], ['painkillers', 1]],
};

const QTY = {
  ammo_pistol: [6, 16], ammo_shells: [4, 8], ammo_rifle: [10, 30],
  chips: [1, 2], water: [1, 1], canned: [1, 1], bandage: [1, 2], battery: [1, 1],
};

export function rollLoot(kind, lootMul = 1, r = Math.random) {
  const table = TABLES[kind] || TABLES.crate;
  const n = Math.max(0, Math.round((kind === 'zombie' ? 1 : 1 + r() * 2.4) * lootMul));
  const out = [];
  for (let i = 0; i < n; i++) {
    const id = weighted(table, r);
    const [a, b] = QTY[id] || [1, 1];
    out.push({ id, qty: Math.round(a + r() * (b - a)) });
  }
  return out;
}

export class Inventory {
  constructor(size = 20) {
    this.size = size;
    this.slots = new Array(size).fill(null);
  }

  clear() {
    this.slots.fill(null);
  }

  count(id) {
    let n = 0;
    for (const s of this.slots) if (s && s.id === id) n += s.qty;
    return n;
  }

  used() {
    return this.slots.filter(Boolean).length;
  }

  // Returns how many could NOT be added.
  add(id, qty) {
    const max = ITEMS[id].stack || 1;
    for (const s of this.slots) {
      if (qty <= 0) break;
      if (s && s.id === id && s.qty < max) {
        const put = Math.min(max - s.qty, qty);
        s.qty += put;
        qty -= put;
      }
    }
    for (let i = 0; i < this.size && qty > 0; i++) {
      if (!this.slots[i]) {
        const put = Math.min(max, qty);
        this.slots[i] = { id, qty: put };
        qty -= put;
      }
    }
    return qty;
  }

  // Removes up to qty, returns how many were removed. Takes from the smallest stacks first.
  remove(id, qty) {
    let removed = 0;
    const idx = this.slots
      .map((s, i) => (s && s.id === id ? i : -1))
      .filter((i) => i >= 0)
      .sort((a, b) => this.slots[a].qty - this.slots[b].qty);
    for (const i of idx) {
      if (removed >= qty) break;
      const s = this.slots[i];
      const take = Math.min(s.qty, qty - removed);
      s.qty -= take;
      removed += take;
      if (s.qty <= 0) this.slots[i] = null;
    }
    return removed;
  }
}
