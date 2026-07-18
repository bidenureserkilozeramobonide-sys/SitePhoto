// ===== Mon Village Médiéval — manager de village + batailles contre des IA =====
import './style.css';

const SAVE_KEY = 'village-medieval-save-v1';
const SLOT_COUNT = 12;
const OFFLINE_CAP_H = 8; // production hors-ligne plafonnée à 8 h

// ---------- Définition des bâtiments ----------
const BUILDINGS = {
  ferme:    { icon: '🌾', name: 'Ferme',    desc: 'Produit de la nourriture.',            prod: { food: 1.2 },  cost: { wood: 30, stone: 10 } },
  scierie:  { icon: '🪵', name: 'Scierie',  desc: 'Produit du bois.',                     prod: { wood: 0.8 },  cost: { food: 20, stone: 15 } },
  carriere: { icon: '🪨', name: 'Carrière', desc: 'Produit de la pierre.',                prod: { stone: 0.5 }, cost: { food: 25, wood: 25 } },
  marche:   { icon: '🪙', name: 'Marché',   desc: "Produit de l'or.",                     prod: { gold: 0.3 },  cost: { wood: 50, stone: 40 } },
  maison:   { icon: '🏠', name: 'Maison',   desc: '+5 habitants max par niveau.',         pop: 5,               cost: { wood: 40, stone: 20 } },
  caserne:  { icon: '⚔️', name: 'Caserne',  desc: 'Renforce tes soldats (+2 puissance).', power: 2,             cost: { wood: 60, stone: 60, gold: 20 } },
  muraille: { icon: '🧱', name: 'Muraille', desc: '+15 défense du village par niveau.',   def: 15,              cost: { stone: 80, gold: 10 } },
};

// Coût d'amélioration : coût de base × 1.6^(niveau)
const upgradeCost = (type, level) => {
  const out = {};
  for (const [res, base] of Object.entries(BUILDINGS[type].cost)) {
    out[res] = Math.round(base * Math.pow(1.6, level));
  }
  return out;
};

const SOLDIER_COST = { food: 30, gold: 15 };
const SOLDIER_BASE_POWER = 5;

// ---------- Villages IA rivaux ----------
const RIVALS = [
  { id: 0, icon: '🏕️', name: 'Camp de brigands',      power: 40,   loot: { food: 80,  wood: 60,  stone: 40,  gold: 20 } },
  { id: 1, icon: '🛖', name: 'Hameau de Grognac',     power: 120,  loot: { food: 180, wood: 140, stone: 100, gold: 50 } },
  { id: 2, icon: '🏘️', name: 'Bourg de Malefosse',    power: 300,  loot: { food: 400, wood: 320, stone: 240, gold: 120 } },
  { id: 3, icon: '🏰', name: 'Forteresse du Corbeau', power: 700,  loot: { food: 900, wood: 700, stone: 550, gold: 300 } },
  { id: 4, icon: '👑', name: 'Citadelle Royale',      power: 1500, loot: { food: 2000, wood: 1600, stone: 1200, gold: 800 } },
];

const RES_ICONS = { food: '🌾', wood: '🪵', stone: '🪨', gold: '🪙' };

// ---------- État du jeu ----------
let state = null;

function newGame() {
  return {
    resources: { food: 60, wood: 60, stone: 30, gold: 10 },
    slots: Array(SLOT_COUNT).fill(null), // { type, level }
    soldiers: 0,
    defeated: [], // ids des rivaux vaincus
    nextRaidAt: Date.now() + raidDelay(),
    lastSeen: Date.now(),
  };
}

const raidDelay = () => (150 + Math.random() * 120) * 1000; // raid toutes les 2.5 à 4.5 min

function save() {
  state.lastSeen = Date.now();
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s.resources || !Array.isArray(s.slots)) return null;
    return s;
  } catch {
    return null;
  }
}

// ---------- Calculs dérivés ----------
function production() {
  const prod = { food: 0, wood: 0, stone: 0, gold: 0 };
  for (const slot of state.slots) {
    if (!slot) continue;
    const def = BUILDINGS[slot.type];
    if (!def.prod) continue;
    for (const [res, rate] of Object.entries(def.prod)) prod[res] += rate * slot.level;
  }
  return prod;
}

const sumLevels = (type) =>
  state.slots.reduce((n, s) => n + (s && s.type === type ? s.level : 0), 0);

const popCap = () => 5 + sumLevels('maison') * BUILDINGS.maison.pop;
const popUsed = () => state.soldiers;
const soldierPower = () => SOLDIER_BASE_POWER + sumLevels('caserne') * BUILDINGS.caserne.power;
const armyPower = () => state.soldiers * soldierPower();
const wallDefense = () => sumLevels('muraille') * BUILDINGS.muraille.def;

function canAfford(cost) {
  return Object.entries(cost).every(([res, n]) => state.resources[res] >= n);
}
function payCost(cost) {
  for (const [res, n] of Object.entries(cost)) state.resources[res] -= n;
}
function costLabel(cost) {
  return Object.entries(cost).map(([res, n]) => `${RES_ICONS[res]} ${fmt(n)}`).join('  ');
}
const fmt = (n) => (n >= 10000 ? `${(n / 1000).toFixed(1)}k` : String(Math.floor(n)));

// ---------- Boucle de jeu ----------
let lastTick = Date.now();

function tick() {
  const now = Date.now();
  const dt = (now - lastTick) / 1000;
  lastTick = now;

  const prod = production();
  for (const res of Object.keys(prod)) state.resources[res] += prod[res] * dt;

  // Raid ennemi ?
  if (now >= state.nextRaidAt && !battleOpen) {
    state.nextRaidAt = now + raidDelay();
    launchRaid();
  }

  renderTopbar();
}

function applyOfflineProgress(s) {
  const elapsed = Math.min(Date.now() - (s.lastSeen || Date.now()), OFFLINE_CAP_H * 3600 * 1000) / 1000;
  if (elapsed < 30) return;
  state = s; // production() lit l'état global
  const prod = production();
  let gained = false;
  for (const res of Object.keys(prod)) {
    const amount = prod[res] * elapsed;
    if (amount >= 1) gained = true;
    s.resources[res] += amount;
  }
  s.nextRaidAt = Date.now() + raidDelay();
  if (gained) {
    const mins = Math.round(elapsed / 60);
    toast(`⏳ Pendant ton absence (${mins} min), ton village a produit des ressources !`);
  }
}

// ---------- Rendu : barre de ressources ----------
const $ = (sel) => document.querySelector(sel);

function renderTopbar() {
  $('#res-food span').textContent = fmt(state.resources.food);
  $('#res-wood span').textContent = fmt(state.resources.wood);
  $('#res-stone span').textContent = fmt(state.resources.stone);
  $('#res-gold span').textContent = fmt(state.resources.gold);
  $('#res-pop span').textContent = `${popUsed()}/${popCap()}`;
}

// ---------- Rendu : onglets ----------
let currentTab = 'village';

function switchTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  renderScreen();
}

function renderScreen() {
  const screen = $('#screen');
  screen.innerHTML = '';
  if (currentTab === 'village') renderVillage(screen);
  else if (currentTab === 'armee') renderArmy(screen);
  else renderBattles(screen);
}

// ----- Onglet Village -----
function renderVillage(screen) {
  const prod = production();
  const prodLabel = Object.entries(prod)
    .filter(([, v]) => v > 0)
    .map(([res, v]) => `${RES_ICONS[res]} +${v.toFixed(1)}/s`)
    .join('  ') || 'Aucune production — construis des bâtiments !';

  screen.insertAdjacentHTML('beforeend', `
    <h1 class="screen-title">🏘️ Mon village</h1>
    <p class="screen-sub">${prodLabel}</p>
    <div class="village-grid"></div>
  `);

  const grid = screen.querySelector('.village-grid');
  state.slots.forEach((slot, i) => {
    const btn = document.createElement('button');
    if (slot) {
      const def = BUILDINGS[slot.type];
      btn.className = 'slot built';
      btn.innerHTML = `${def.icon}<span class="lvl">Niv. ${slot.level}</span><span class="bname">${def.name}</span>`;
      btn.addEventListener('click', () => openUpgradeSheet(i));
    } else {
      btn.className = 'slot empty';
      btn.textContent = '＋';
      btn.addEventListener('click', () => openBuildSheet(i));
    }
    grid.appendChild(btn);
  });
}

// ----- Onglet Armée -----
function renderArmy(screen) {
  const affordable = canAfford(SOLDIER_COST) && popUsed() < popCap();
  screen.insertAdjacentHTML('beforeend', `
    <h1 class="screen-title">⚔️ Mon armée</h1>
    <p class="screen-sub">Recrute des soldats pour attaquer et te défendre.</p>
    <div class="card">
      <h3>🪖 Soldats</h3>
      <div class="stat-big">${state.soldiers}</div>
      <p>Puissance par soldat : ${soldierPower()} (améliore tes casernes !)</p>
      <p>Puissance totale : <b>${armyPower()}</b> &nbsp;·&nbsp; Défense des murailles : <b>+${wallDefense()}</b></p>
      <div class="row">
        <span class="cost ${canAfford(SOLDIER_COST) ? '' : 'ko'}">${costLabel(SOLDIER_COST)} · 1 👥</span>
        <button class="btn primary" id="recruit" ${affordable ? '' : 'disabled'}>Recruter</button>
      </div>
      ${popUsed() >= popCap() ? '<p style="margin-top:8px">⚠️ Population au maximum — construis des maisons.</p>' : ''}
    </div>
    <div class="card">
      <h3>💡 Conseil</h3>
      <p>Les casernes augmentent la puissance de chaque soldat, les murailles protègent ton village pendant les raids ennemis.</p>
    </div>
  `);
  $('#recruit')?.addEventListener('click', () => {
    if (!canAfford(SOLDIER_COST) || popUsed() >= popCap()) return;
    payCost(SOLDIER_COST);
    state.soldiers += 1;
    save();
    renderScreen();
    renderTopbar();
  });
}

// ----- Onglet Batailles -----
function renderBattles(screen) {
  screen.insertAdjacentHTML('beforeend', `
    <h1 class="screen-title">🛡️ Batailles</h1>
    <p class="screen-sub">Attaque les villages rivaux pour piller leurs ressources. Ta puissance : <b>${armyPower()}</b></p>
  `);
  for (const rival of RIVALS) {
    const beaten = state.defeated.includes(rival.id);
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <h3>${rival.icon} ${rival.name} ${beaten ? '<span class="badge">Vaincu</span>' : ''}</h3>
      <p class="rival-power">Puissance : ${rival.power} · Butin : ${costLabel(rival.loot)}</p>
      <div class="row">
        <span></span>
        <button class="btn ${beaten ? '' : 'danger'}" ${state.soldiers === 0 ? 'disabled' : ''}>
          ${beaten ? 'Repiller' : 'Attaquer'}
        </button>
      </div>
    `;
    card.querySelector('button').addEventListener('click', () => startAttack(rival));
    screen.appendChild(card);
  }
  if (state.soldiers === 0) {
    screen.insertAdjacentHTML('beforeend', `<p class="screen-sub">⚠️ Il te faut au moins un soldat pour attaquer.</p>`);
  }
}

// ---------- Bottom sheet : construction / amélioration ----------
function openSheet(title, bodyHTML) {
  $('#sheet-title').textContent = title;
  $('#sheet-body').innerHTML = bodyHTML;
  $('#sheet').classList.remove('hidden');
}
function closeSheet() {
  $('#sheet').classList.add('hidden');
}

function openBuildSheet(slotIndex) {
  let html = '';
  for (const [type, def] of Object.entries(BUILDINGS)) {
    const cost = upgradeCost(type, 0);
    const ok = canAfford(cost);
    html += `
      <div class="card">
        <h3>${def.icon} ${def.name}</h3>
        <p>${def.desc}</p>
        <div class="row">
          <span class="cost ${ok ? '' : 'ko'}">${costLabel(cost)}</span>
          <button class="btn primary" data-build="${type}" ${ok ? '' : 'disabled'}>Construire</button>
        </div>
      </div>`;
  }
  openSheet('🔨 Construire', html);
  $('#sheet-body').querySelectorAll('[data-build]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const type = btn.dataset.build;
      const cost = upgradeCost(type, 0);
      if (!canAfford(cost)) return;
      payCost(cost);
      state.slots[slotIndex] = { type, level: 1 };
      save();
      closeSheet();
      renderScreen();
      renderTopbar();
      toast(`${BUILDINGS[type].icon} ${BUILDINGS[type].name} construit(e) !`);
    });
  });
}

function openUpgradeSheet(slotIndex) {
  const slot = state.slots[slotIndex];
  const def = BUILDINGS[slot.type];
  const cost = upgradeCost(slot.type, slot.level);
  const ok = canAfford(cost);
  openSheet(`${def.icon} ${def.name} — Niv. ${slot.level}`, `
    <div class="card">
      <p>${def.desc}</p>
      <div class="row">
        <span class="cost ${ok ? '' : 'ko'}">${costLabel(cost)}</span>
        <button class="btn primary" id="do-upgrade" ${ok ? '' : 'disabled'}>Améliorer → Niv. ${slot.level + 1}</button>
      </div>
    </div>
  `);
  $('#do-upgrade')?.addEventListener('click', () => {
    if (!canAfford(cost)) return;
    payCost(cost);
    slot.level += 1;
    save();
    closeSheet();
    renderScreen();
    renderTopbar();
  });
}

// ---------- Combat ----------
let battleOpen = false;

function openBattle(title, enemyName) {
  battleOpen = true;
  $('#battle-title').textContent = title;
  $('#enemy-name').textContent = enemyName;
  $('#battle-log').innerHTML = '';
  $('#battle-close').classList.add('hidden');
  $('#hp-player').style.width = '100%';
  $('#hp-enemy').style.width = '100%';
  $('#battle').classList.remove('hidden');
}

function logLine(html, cls = '') {
  const log = $('#battle-log');
  const p = document.createElement('div');
  if (cls) p.className = cls;
  p.innerHTML = html;
  log.appendChild(p);
  log.scrollTop = log.scrollHeight;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rand = (a, b) => a + Math.random() * (b - a);

// Simule un combat au tour par tour. Retourne { won, playerHpRatio }.
async function simulateBattle(playerPower, enemyPower, playerLabel, enemyLabel) {
  let playerHp = Math.max(playerPower, 1) * 3;
  let enemyHp = Math.max(enemyPower, 1) * 3;
  const playerMax = playerHp;
  const enemyMax = enemyHp;

  logLine(`⚔️ ${playerLabel} (puissance ${Math.round(playerPower)}) affronte ${enemyLabel} (puissance ${Math.round(enemyPower)}) !`);
  await sleep(700);

  let round = 1;
  while (playerHp > 0 && enemyHp > 0 && round <= 20) {
    const pHit = playerPower * rand(0.7, 1.3);
    const eHit = enemyPower * rand(0.7, 1.3);
    enemyHp -= pHit;
    playerHp -= eHit;
    $('#hp-player').style.width = `${Math.max(0, (playerHp / playerMax) * 100)}%`;
    $('#hp-enemy').style.width = `${Math.max(0, (enemyHp / enemyMax) * 100)}%`;
    logLine(`Tour ${round} : tu infliges <b>${Math.round(pHit)}</b> dégâts, tu en subis <b>${Math.round(eHit)}</b>.`);
    round += 1;
    await sleep(650);
  }

  const won = enemyHp <= 0 && playerHp > enemyHp;
  return { won, playerHpRatio: Math.max(0, playerHp) / playerMax };
}

async function startAttack(rival) {
  if (state.soldiers === 0 || battleOpen) return;
  openBattle(`⚔️ Attaque : ${rival.name}`, rival.name);

  const enemyPower = rival.power * rand(0.9, 1.1);
  const { won, playerHpRatio } = await simulateBattle(armyPower(), enemyPower, 'Ton armée', rival.name);

  // Pertes proportionnelles aux dégâts subis
  const losses = Math.min(state.soldiers, Math.ceil(state.soldiers * (1 - playerHpRatio) * (won ? 0.5 : 0.8)));
  state.soldiers -= losses;

  if (won) {
    const firstWin = !state.defeated.includes(rival.id);
    // Repiller un village déjà vaincu rapporte moitié moins
    const mult = firstWin ? 1 : 0.5;
    for (const [res, n] of Object.entries(rival.loot)) state.resources[res] += n * mult;
    if (firstWin) state.defeated.push(rival.id);
    logLine(`🏆 Victoire ! Tu pilles : ${costLabel(Object.fromEntries(Object.entries(rival.loot).map(([r, n]) => [r, n * mult])))}`, 'win');
    if (losses > 0) logLine(`💀 Tu as perdu ${losses} soldat(s) au combat.`);
  } else {
    logLine(`☠️ Défaite... Ton armée est repoussée et tu perds ${losses} soldat(s).`, 'lose');
  }
  save();
  finishBattle();
}

// Raid ennemi sur ton village
async function launchRaid() {
  const totalRes = Object.values(state.resources).reduce((a, b) => a + b, 0);
  if (totalRes < 100) return; // rien à piller, pas de raid

  const raidPower = Math.max(20, (armyPower() + wallDefense()) * rand(0.5, 1.1) + totalRes * 0.02);
  toast('🚨 Des pillards attaquent ton village !', true);
  await sleep(1200);

  openBattle('🛡️ Défense du village', 'Pillards');
  const defense = armyPower() + wallDefense();
  const { won, playerHpRatio } = await simulateBattle(Math.max(defense, 5), raidPower, 'Ta garnison', 'les pillards');

  const losses = Math.min(state.soldiers, Math.ceil(state.soldiers * (1 - playerHpRatio) * 0.5));
  state.soldiers -= losses;

  if (won) {
    logLine('🏆 Raid repoussé ! Ton village est sauf.', 'win');
    if (losses > 0) logLine(`💀 ${losses} soldat(s) sont tombés en défendant le village.`);
  } else {
    const stolen = {};
    for (const res of Object.keys(state.resources)) {
      stolen[res] = Math.floor(state.resources[res] * 0.3);
      state.resources[res] -= stolen[res];
    }
    logLine(`☠️ Les pillards ont volé : ${costLabel(stolen)}`, 'lose');
    if (losses > 0) logLine(`💀 Tu as aussi perdu ${losses} soldat(s).`);
  }
  save();
  finishBattle();
}

function finishBattle() {
  renderTopbar();
  $('#battle-close').classList.remove('hidden');
}

// ---------- Toasts ----------
function toast(msg, alert = false) {
  const el = document.createElement('div');
  el.className = `toast${alert ? ' alert' : ''}`;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

// ---------- Initialisation ----------
function init() {
  const saved = load();
  if (saved) {
    applyOfflineProgress(saved);
    state = saved;
  } else {
    state = newGame();
    toast('🏰 Bienvenue ! Construis ta première ferme pour commencer.');
  }

  document.querySelectorAll('.tab').forEach((btn) =>
    btn.addEventListener('click', () => switchTab(btn.dataset.tab))
  );
  $('#sheet-close').addEventListener('click', closeSheet);
  $('#sheet').addEventListener('click', (e) => {
    if (e.target === $('#sheet')) closeSheet();
  });
  $('#battle-close').addEventListener('click', () => {
    $('#battle').classList.add('hidden');
    battleOpen = false;
    renderScreen();
  });

  renderTopbar();
  renderScreen();
  lastTick = Date.now();
  setInterval(tick, 250);
  setInterval(save, 5000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
    else lastTick = Date.now();
  });

  // Rafraîchit l'écran actif régulièrement (coûts abordables, compteurs…)
  setInterval(() => {
    if (!battleOpen && $('#sheet').classList.contains('hidden')) renderScreen();
  }, 3000);
}

init();
