// DOM HUD: bars, ammo, compass, minimap, messages, inventory and screens.
import { ITEMS } from './items.js';
import { WEAPONS, ORDER } from './weapons.js';
import { HALF } from './world.js';

const $ = (id) => document.getElementById(id);

export class UI {
  constructor(game) {
    this.game = game;
    this.el = {
      hud: $('hud'), hurt: $('hurt'), hp: $('bar-hp'), hpNum: $('num-hp'), stam: $('bar-stam'),
      food: $('bar-food'), water: $('bar-water'), status: $('status-row'), mag: $('ammo-mag'), res: $('ammo-res'),
      wname: $('weapon-name'), slots: $('slots'), clockT: $('clock-time'), clockD: $('clock-day'),
      obj: $('objective-text'), objSub: $('objective-sub'), feed: $('feed'), prompt: $('prompt'),
      progress: $('progress'), progressFill: $('progress-fill'), cross: $('crosshair'), hit: $('hitmarker'),
      compass: $('compass-strip'), kills: $('kills'), minimap: $('minimap'),
      invGrid: $('inv-grid'), invName: $('inv-name'), invDesc: $('inv-desc'), invCap: $('inv-cap'), invAmmo: $('inv-ammo'),
    };
    this.mm = this.el.minimap.getContext('2d');
    this.hurtV = 0;
    this.hitT = 0;
    this.statusKey = '';
    this.slotKey = '';
    this.buildCompass();
    this.mapCache = null;
  }

  // ---------- messages ----------
  msg(text, kind = '') {
    const d = document.createElement('div');
    d.className = 'msg ' + kind;
    d.textContent = text;
    this.el.feed.prepend(d);
    while (this.el.feed.children.length > 6) this.el.feed.lastChild.remove();
    setTimeout(() => { d.style.opacity = '0'; }, 4200);
    setTimeout(() => d.remove(), 4900);
  }

  hurt(k) {
    this.hurtV = Math.min(1, this.hurtV + 0.35 + k);
  }

  hitmarker(head) {
    this.hitT = 0.15;
    this.el.hit.classList.toggle('head', !!head);
  }

  prompt(html) {
    if (html) {
      if (this.el.prompt.innerHTML !== html) this.el.prompt.innerHTML = html;
      this.el.prompt.hidden = false;
    } else this.el.prompt.hidden = true;
  }

  progress(v) {
    if (v == null) { this.el.progress.hidden = true; return; }
    this.el.progress.hidden = false;
    this.el.progressFill.style.width = `${Math.round(v * 100)}%`;
  }

  // ---------- compass ----------
  buildCompass() {
    const strip = this.el.compass;
    const names = { 0: 'С', 45: 'СВ', 90: 'В', 135: 'ЮВ', 180: 'Ю', 225: 'ЮЗ', 270: 'З', 315: 'СЗ' };
    this.compassMarks = [];
    for (let rep = -1; rep <= 1; rep++) {
      for (let a = 0; a < 360; a += 15) {
        const s = document.createElement('span');
        const n = names[a];
        s.textContent = n || '·';
        if (n && n.length === 1) s.className = 'card';
        strip.appendChild(s);
        this.compassMarks.push({ s, a: a + rep * 360 });
      }
    }
    this.objMark = document.createElement('span');
    this.objMark.className = 'obj';
    this.objMark.textContent = '◆';
    strip.appendChild(this.objMark);
  }

  updateCompass(yaw, objAngle) {
    const w = this.el.compass.parentElement.clientWidth;
    const pxPerDeg = w / 150;
    // yaw 0 looks north (-Z); heading grows clockwise.
    const heading = ((-yaw * 180) / Math.PI) % 360;
    for (const m of this.compassMarks) {
      m.s.style.left = `${w / 2 + (m.a - heading) * pxPerDeg}px`;
    }
    if (objAngle == null) this.objMark.hidden = true;
    else {
      let d = objAngle - heading;
      d = ((d % 360) + 540) % 360 - 180;
      this.objMark.hidden = Math.abs(d) > 75;
      this.objMark.style.left = `${w / 2 + d * pxPerDeg}px`;
    }
  }

  // ---------- minimap ----------
  drawMapBase() {
    const w = this.game.world;
    const S = 1024;
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const k = S / (HALF * 2);
    const X = (x) => (x + HALF) * k;
    g.fillStyle = '#2b3122';
    g.fillRect(0, 0, S, S);
    g.fillStyle = '#44464a';
    for (const p of [-60, 0, 60]) {
      g.fillRect(X(p - 5), 0, 10 * k, S);
      g.fillRect(0, X(p - 5), S, 10 * k);
    }
    for (const b of w.buildings) {
      g.fillStyle = b.enterable ? '#8c8370' : '#5d5a55';
      g.fillRect(X(b.minX), X(b.minZ), (b.maxX - b.minX) * k, (b.maxZ - b.minZ) * k);
    }
    if (w.helipad) {
      g.strokeStyle = '#d9b23a';
      g.lineWidth = 4;
      g.beginPath();
      g.arc(X(w.helipad.x), X(w.helipad.z), 8 * k, 0, Math.PI * 2);
      g.stroke();
    }
    this.mapCache = { c, k };
  }

  drawMinimap() {
    const g = this.mm;
    const game = this.game;
    const p = game.player;
    if (!this.mapCache) this.drawMapBase();
    const { c, k } = this.mapCache;
    const W = this.el.minimap.width;
    const range = 55; // metres from centre to edge
    const scale = (W / 2) / range; // px per metre
    g.save();
    g.clearRect(0, 0, W, W);
    g.beginPath();
    g.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#1b1e18';
    g.fillRect(0, 0, W, W);
    g.translate(W / 2, W / 2);
    g.rotate(p.yaw);
    g.scale(scale / k, scale / k);
    g.drawImage(c, -(p.pos.x + HALF) * k, -(p.pos.z + HALF) * k);
    g.restore();

    g.save();
    g.beginPath();
    g.arc(W / 2, W / 2, W / 2, 0, Math.PI * 2);
    g.clip();
    const toScreen = (x, z) => {
      const dx = x - p.pos.x, dz = z - p.pos.z;
      const cs = Math.cos(p.yaw), sn = Math.sin(p.yaw);
      // Same rotation as the canvas transform above: forward always points up.
      return [W / 2 + (dx * cs - dz * sn) * scale, W / 2 + (dx * sn + dz * cs) * scale];
    };
    // zombies (only those you could hear: within 30 m)
    for (const z of game.zombies.list) {
      if (z.dead) continue;
      const d = Math.hypot(z.pos.x - p.pos.x, z.pos.z - p.pos.z);
      if (d > 30) continue;
      const [x, y] = toScreen(z.pos.x, z.pos.z);
      g.fillStyle = z.state === 'chase' ? '#ff4a3a' : 'rgba(210,90,70,0.7)';
      g.beginPath();
      g.arc(x, y, z.type === 'brute' ? 7 : 5, 0, Math.PI * 2);
      g.fill();
    }
    // loot pickups
    g.fillStyle = '#e7e2d4';
    for (const it of game.world.pickups) {
      const [x, y] = toScreen(it.x, it.z);
      g.fillRect(x - 3, y - 3, 6, 6);
    }
    // objective
    const obj = game.objectivePos();
    if (obj) {
      let [x, y] = toScreen(obj.x, obj.z);
      const dx = x - W / 2, dy = y - W / 2, d = Math.hypot(dx, dy);
      if (d > W / 2 - 12) { x = W / 2 + (dx / d) * (W / 2 - 12); y = W / 2 + (dy / d) * (W / 2 - 12); }
      g.fillStyle = '#e0a13a';
      g.save();
      g.translate(x, y);
      g.rotate(Math.PI / 4);
      g.fillRect(-7, -7, 14, 14);
      g.restore();
    }
    g.restore();
    // player arrow
    g.fillStyle = '#e7e2d4';
    g.beginPath();
    g.moveTo(W / 2, W / 2 - 12);
    g.lineTo(W / 2 - 8, W / 2 + 9);
    g.lineTo(W / 2, W / 2 + 4);
    g.lineTo(W / 2 + 8, W / 2 + 9);
    g.closePath();
    g.fill();
  }

  // ---------- per-frame HUD ----------
  update(dt) {
    const g = this.game;
    const p = g.player;
    const w = g.weapons;
    const e = this.el;

    e.hp.style.width = `${p.hp}%`;
    e.hp.classList.toggle('low', p.hp < 30);
    e.hpNum.textContent = Math.ceil(p.hp);
    e.stam.style.width = `${p.stamina}%`;
    e.stam.style.opacity = p.exhausted ? 0.4 : 1;
    e.food.style.width = `${p.hunger}%`;
    e.water.style.width = `${p.thirst}%`;

    const chips = [];
    if (p.bleeding) chips.push(['bad', 'Кровотечение']);
    if (p.hunger < 20) chips.push([p.hunger <= 0 ? 'bad' : 'warn', 'Голод']);
    if (p.thirst < 20) chips.push([p.thirst <= 0 ? 'bad' : 'warn', 'Жажда']);
    if (p.exhausted) chips.push(['warn', 'Одышка']);
    if (p.energyTime > 0) chips.push(['good', 'Энергия']);
    if (p.healOverTime > 0) chips.push(['good', 'Лечение']);
    if (p.lightOn || p.battery < 100) chips.push([p.battery < 20 ? 'warn' : '', `Фонарь ${Math.ceil(p.battery)}%`]);
    if (p.crouching) chips.push(['', 'Присед']);
    const key = chips.map((c) => c.join(':')).join('|');
    if (key !== this.statusKey) {
      this.statusKey = key;
      e.status.innerHTML = chips.map(([k, t]) => `<span class="chip ${k}">${t}</span>`).join('');
    }

    const d = w.def;
    if (d.melee) {
      e.mag.textContent = '—';
      e.res.textContent = '';
      e.mag.classList.remove('low');
    } else {
      const mag = w.mags[w.current];
      e.mag.textContent = w.reloading > 0 ? '··' : mag;
      e.mag.classList.toggle('low', mag <= Math.ceil(d.mag * 0.25));
      e.res.textContent = `/ ${w.reserve()}`;
    }
    e.wname.textContent = w.reloading > 0 ? 'Перезарядка…' : d.name;
    const sk = ORDER.map((k) => (w.owned[k] ? 1 : 0)).join('') + w.current;
    if (sk !== this.slotKey) {
      this.slotKey = sk;
      e.slots.innerHTML = ORDER.map((k) => {
        const cls = ['slot', w.owned[k] ? '' : 'empty', w.current === k ? 'active' : ''].join(' ');
        return `<div class="${cls}"><b>${WEAPONS[k].slot}</b>${w.owned[k] ? WEAPONS[k].name : '—'}</div>`;
      }).join('');
    }

    // crosshair spread
    const spread = d.melee ? 0.01 : w.spreadNow();
    e.cross.style.setProperty('--gap', `${Math.round(4 + spread * 380)}px`);
    e.cross.classList.toggle('hide', w.aimT > 0.6 || p.sprinting);

    this.hitT -= dt;
    e.hit.style.opacity = this.hitT > 0 ? 1 : 0;
    this.hurtV = Math.max(p.hp < 30 ? 0.35 + Math.sin(performance.now() / 300) * 0.1 : 0, this.hurtV - dt * 1.5);
    e.hurt.style.opacity = this.hurtV;

    // clock
    const mins = Math.floor(g.timeOfDay * 24 * 60);
    e.clockT.textContent = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    e.clockD.textContent = `День ${g.day}`;
    e.kills.textContent = g.stats.kills;

    const o = g.objective();
    if (e.obj.textContent !== o.text) e.obj.textContent = o.text;
    if (e.objSub.textContent !== o.sub) e.objSub.textContent = o.sub;

    const op = g.objectivePos();
    const ang = op ? ((Math.atan2(op.x - p.pos.x, -(op.z - p.pos.z)) * 180) / Math.PI + 360) % 360 : null;
    this.updateCompass(p.yaw, ang);
    this.drawMinimap();
  }

  // ---------- inventory ----------
  renderInventory() {
    const g = this.game;
    const inv = g.inventory;
    const e = this.el;
    e.invCap.textContent = `${inv.used()} / ${inv.size} ячеек`;
    e.invAmmo.textContent = `9 мм: ${inv.count('ammo_pistol')} · 12к: ${inv.count('ammo_shells')} · 5.45: ${inv.count('ammo_rifle')}`;
    e.invGrid.innerHTML = '';
    inv.slots.forEach((s, i) => {
      const b = document.createElement('button');
      b.className = 'cell' + (s ? '' : ' empty');
      b.id = `inv-cell-${i}`;
      if (s) {
        const it = ITEMS[s.id];
        b.innerHTML = `<span class="ic" style="background:${it.color}">${it.short}</span>${s.qty > 1 ? `<span class="q">${s.qty}</span>` : ''}`;
        b.addEventListener('mouseenter', () => this.describe(s.id));
        b.addEventListener('focus', () => this.describe(s.id));
        b.addEventListener('click', () => { g.useItem(i); this.renderInventory(); this.describe(inv.slots[i]?.id); });
        b.addEventListener('contextmenu', (ev) => { ev.preventDefault(); g.dropItem(i); this.renderInventory(); });
      } else b.tabIndex = -1;
      e.invGrid.appendChild(b);
    });
  }

  describe(id) {
    const e = this.el;
    if (!id) { e.invName.textContent = 'Выбери предмет'; e.invDesc.textContent = 'ЛКМ — использовать, ПКМ — выбросить.'; return; }
    const it = ITEMS[id];
    e.invName.textContent = it.name;
    const how = it.use ? 'ЛКМ — использовать, ПКМ — выбросить.' : it.quest ? 'Сюжетный предмет.' : 'ПКМ — выбросить.';
    e.invDesc.textContent = `${it.desc} ${how}`;
  }
}
