/* All nine source motions; shared moments use their original combined frames. */
const roster = [
  ['chiikawa', '치이카와'], ['hachiware', '하치와레'], ['usagi', '우사기'],
  ['momonga', '모몽가'], ['shisa', '시사'], ['rakko', '랏코'],
  ['kurimanju', '쿠리만주'], ['siren', '세이렌'], ['furuhonya', '후루혼야'],
  ['anoko', '아노코'], ['dekatsuyo', '데카츠요']
];
// Temporarily hidden; retain their assets and motion support for later.
const hiddenPets = new Set(['siren', 'dekatsuyo', 'anoko']);
const activeRoster = roster.filter(([id]) => !hiddenPets.has(id));
const motions = { idle: [0, 6], right: [1, 8], left: [2, 8], wave: [3, 4],
  jump: [4, 5], failed: [5, 8], waiting: [6, 6], working: [7, 6], review: [8, 6] };
const canvas = document.getElementById('world');
const ctx = canvas.getContext('2d');
const bubble = document.getElementById('hachiware-bubble');
let teamData = null, teamError = false;
const speechGap = () => 20000 + Math.random() * 20000;
let momongaData = null, momongaError = false, productIndex = 0;
async function refreshMomonga() {
  try { momongaData = await window.petsAPI.loadMomongaReport(); momongaError = false; }
  catch { momongaError = true; }
}
refreshMomonga();
setInterval(refreshMomonga, 60000);
function sayMomonga(element) {
  if (momongaError || !momongaData) { element.textContent = '직전 실적을 확인 중이야. 조금 뒤 다시 알려줄게!'; return; }
  const products = momongaData.products || [];
  if (!products.length) { element.textContent = '현재 방송과 정확히 연결되는 편성 키를 찾지 못했어.'; return; }
  const product = products[productIndex++ % products.length];
  const amount = value => value == null ? '—' : (value / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 0 }) + '만';
  const lines = product.history.map(row => `${row.broadcastDate.slice(5).replace('-', '/')} ${row.broadcastTime}  ${amount(row.salesPerWeightedMin)}/${amount(row.profitPerWeightedMin)}`);
  element.textContent = `${product.perfKey}\n심야 제외 직전 ${product.history.length}회 실적이야!\n가중분당 취급/이익\n${lines.length ? lines.join('\n') : '조건에 맞는 직전 실적이 없어.'}${momongaData.fromCache ? '\n저장된 실적 기준이야.' : ''}`;
}
let remainingProductIndex = 0;
const remainingPages = new Map();
function sayRemaining(element) {
  if (momongaError || !momongaData) { element.textContent = '잔여편성을 확인하고 있어. 조금 뒤 다시 알려줄게!'; return; }
  const products = momongaData.products || [];
  if (!products.length) { element.textContent = '현재 방송과 정확히 연결되는 편성 키를 찾지 못했어.'; return; }
  const product = products[remainingProductIndex++ % products.length];
  const slots = product.remaining || [];
  if (!slots.length) { element.textContent = `${product.perfKey}\n운영 편성에 등록된 향후 잔여편성이 없어!`; return; }
  const pages = slots.length;
  const page = (remainingPages.get(product.perfKey) || 0) % pages;
  remainingPages.set(product.perfKey, page + 1);
  const slot = slots[page];
  const channel = slot.channel === 'ALL' ? 'SK Stoa' : slot.channel;
  const lines = [
    `${slot.date.slice(5).replace('-', '/')} ${slot.time} · ${channel}`,
    slot.pgmCodeName || product.pgmCodeName,
    [slot.mdTeam, slot.dealType].filter(Boolean).join(' · '),
    slot.memoCode ? `메모코드: ${slot.memoCode}` : '',
    slot.scheduleComment ? `편성 코멘트: ${slot.scheduleComment}` : ''
  ].filter(Boolean);
  element.textContent = `다음 잔여편성을 알려줄게! (${page + 1}/${pages})\n${lines.join('\n')}`;
}
const teamSpeakers = [
  { id: 'kurimanju', team: '가전팀' },
  { id: 'shisa', team: '식품팀' },
  { id: 'rakko', team: '헬스푸드팀' },
  { id: 'momonga', report: 'previous' },
  { id: 'chiikawa', report: 'remaining' }
].map(speaker => ({ ...speaker, bubble: document.getElementById(`${speaker.id}-bubble`), until: 0, next: performance.now() + speechGap() }));
async function refreshTeamPerformance() {
  try { teamData = await window.petsAPI.loadTeamPerformance(); teamError = false; }
  catch { teamError = true; }
}
refreshTeamPerformance();
setInterval(refreshTeamPerformance, 300000);
function sayTeamPerformance(speaker) {
  const teamBubble = speaker.bubble;
  if (speaker.report === 'previous') { sayMomonga(teamBubble); return; }
  if (speaker.report === 'remaining') { sayRemaining(teamBubble); return; }
  if (teamError || !teamData) { teamBubble.textContent = '이번 달 실적을 확인 중이야. 잠시 뒤 다시 알려줄게!'; return; }
  const row = teamData.teams.find(row => row.team === speaker.team);
  if (!row) { teamBubble.textContent = `${speaker.team} 실적을 확인하고 있어!`; return; }
  if (!row.count) { teamBubble.textContent = `${Number(teamData.month.slice(5))}월 ${row.team}은\n아직 등록된 실적이 없어.`; return; }
  const billions = value => (value / 100000000).toLocaleString('ko-KR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  const efficiency = value => row.share > 0 ? (value / row.share / 10000).toLocaleString('ko-KR', { maximumFractionDigits: 0 }) : '—';
  const progress = key => row.targets?.[key] > 0 ? `${(row[key] / row.targets[key] * 100).toFixed(1)}%` : '목표 없음';
  teamBubble.textContent = `${Number(teamData.month.slice(5))}월 ${row.team} 누적 실적이야!\n가중분당 ${efficiency(row.handling)}만/${efficiency(row.profit)}만\n\n취급고 ${billions(row.handling)}억/[${progress('handling')}]\n한계이익 ${billions(row.profit)}억[${progress('profit')}]\n가중편성 ${row.share.toLocaleString('ko-KR', { maximumFractionDigits: 1 })}분[${progress('share')}]\n\n${row.latestDate.slice(5).replace('-', '/')} 실적까지 집계했어.`;
}
let scheduleItems = [], scheduleCached = false, scheduleError = false;
let speechUntil = 0, nextSpeech = performance.now() + 8000 + Math.random() * 12000;
function updateScheduleBubble() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()).split(':').map(Number);
  const now = parts[0] * 60 + parts[1];
  const live = scheduleItems.filter(item => {
    const parse = value => { const [h, m] = String(value || '').split(':').map(Number); return h * 60 + m; };
    const start = parse(item.startTime), end = parse(item.endTime);
    return Number.isFinite(start) && Number.isFinite(end) && (end <= start ? now >= start || now < end : now >= start && now < end);
  });
  bubble.textContent = live.length
    ? `지금은 이 방송이야!${scheduleCached ? ' (저장된 편성 기준)' : ''}\n${live[0].startTime}–${live[0].endTime}\n${[...new Set(live.map(item => item.title))].join(' · ')}`
    : scheduleError ? '편성을 불러오지 못했어. 잠시 뒤 다시 확인할게!' : '지금 시간에 맞는 편성을 찾지 못했어.';
}
async function refreshSchedule() {
  try {
    const data = await window.petsAPI.loadSchedule();
    scheduleItems = data.items || []; scheduleCached = Boolean(data.fromCache); scheduleError = false;
  } catch { scheduleError = true; }
  updateScheduleBubble();
}
refreshSchedule();
setInterval(refreshSchedule, 60000);
setInterval(updateScheduleBubble, 1000);
const cursor = { x: -1000, y: -1000 };
window.petsAPI.onCursor(point => Object.assign(cursor, point));
const load = src => new Promise((resolve, reject) => {
  const image = new Image(); image.onload = () => resolve(image); image.onerror = () => reject(new Error(src)); image.src = src;
});
const asset = name => `../assets/pets/${name}`;
const pets = [];
let drag = null;
const sets = [];
let shared = null, nextEncounter = 0, last = 0, lastRegions = 0;
let W = innerWidth, H = innerHeight;
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
function resize() {
  W = innerWidth; H = innerHeight;
  canvas.width = Math.round(W * devicePixelRatio); canvas.height = Math.round(H * devicePixelRatio);
  ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
}
addEventListener('resize', resize); resize();
function act(p, state, now, duration) {
  p.state = state; p.start = now; p.until = now + duration;
  if (state === 'left' || state === 'right') {
    const angle = Math.random() * Math.PI * 2;
    p.vx = Math.cos(angle); p.vy = Math.sin(angle);
    p.state = p.vx >= 0 ? 'right' : 'left';
  }
}
function rect(p) { return { x: p.x + p.w * .12, y: p.y + p.h * .1, w: p.w * .76, h: p.h * .85 }; }
function nearby(group) { return group.every(a => group.every(b => Math.hypot(a.x - b.x, a.y - b.y) < 125)); }
function encounter(now) {
  if (shared || now < nextEncounter || reduced.matches) return;
  for (const set of [...sets].reverse()) {
    const group = set.ids.map(id => pets.find(p => p.id === id));
    if (group.some(p => !p || p === drag?.pet || now < p.petUntil) || !nearby(group)) continue;
    const width = set.ids.length === 3 ? 230 : 170;
    shared = { set, group, start: now, x: Math.max(0, Math.min(W - width, group.reduce((s, p) => s + p.x, 0) / group.length)), w: width, bottom: Math.min(H - 3, group.reduce((sum, p) => sum + p.y + p.h, 0) / group.length),
      pose: set.poses.length ? set.poses[Math.floor(Math.random() * set.poses.length)] : null };
    // Explicit audio only for shared scenes, at a gentle volume.
    set.audio.currentTime = 0; set.audio.play().catch(() => {});
    break;
  }
}
function paintShared(now) {
  if (!shared) return;
  const s = shared, elapsed = now - s.start;
  const trio = s.group.length === 3;
  const duration = trio ? (Number.isFinite(s.set.audio.duration) ? s.set.audio.duration * 1000 : s.set.frames.length / 9 * 1000) : 5200;
  if (elapsed >= duration) {
    s.group.forEach((p, i) => { p.x = Math.max(0, Math.min(W - p.w, s.x + i * 85)); p.y = Math.max(0, s.bottom - p.h); act(p, 'idle', now, 1200); });
    s.set.audio.pause(); shared = null; nextEncounter = now + 60000 + Math.random() * 90000; return;
  }
  const index = trio ? Math.min(s.set.frames.length - 1, Math.floor(elapsed / duration * s.set.frames.length)) : Math.floor(elapsed / (1000 / 9)) % s.set.frames.length;
  const image = !trio && elapsed >= 3400 ? s.pose : s.set.frames[index];
  const height = s.w * image.height / image.width;
  ctx.drawImage(image, s.x, Math.max(0, s.bottom - height), s.w, height);
}
function tick(now) {
  // Schedule first: an isolated drawing/bubble error must not kill every pet.
  requestAnimationFrame(tick);
  try { renderFrame(now); }
  catch (error) { console.error('PETS_FRAME_ERROR', error.stack || error.message); }
}
function renderFrame(now) {
  const dt = Math.min(.05, (now - (last || now)) / 1000); last = now;
  ctx.clearRect(0, 0, W, H);
  encounter(now);
  for (const p of pets) {
    if (shared?.group.includes(p)) continue;
    if (p !== drag?.pet && now > p.until && now > p.petUntil) {
      const walking = p.state === 'left' || p.state === 'right';
      if (walking) {
        const actions = ['idle', 'wave', 'jump', 'failed', 'waiting', 'working', 'review'];
        p.cycle = (p.cycle + 1) % actions.length;
        act(p, actions[p.cycle], now, 900 + Math.random() * 900);
      } else {
        act(p, Math.random() < .5 ? 'left' : 'right', now, 5000 + Math.random() * 5000);
      }
    }
    if (p !== drag?.pet && !reduced.matches && now > p.petUntil && (p.state === 'left' || p.state === 'right')) {
      p.x += p.vx * p.speed * dt;
      p.y += p.vy * p.speed * dt;
      if (p.x <= 0 || p.x >= W - p.w) p.vx *= -1;
      if (p.y <= 28 || p.y >= H - p.h - 3) p.vy *= -1;
      p.state = p.vx >= 0 ? 'right' : 'left';
    }
    p.x = Math.max(0, Math.min(W - p.w, p.x)); p.y = Math.max(28, Math.min(H - p.h - 3, p.y));
    let [row, count] = motions[p.state];
    let frame = reduced.matches ? 0 : Math.floor((now - p.start) / 140) % count;
    if (p.state === 'idle' && Math.hypot(cursor.x - p.x, cursor.y - p.y) < 200 && now > p.petUntil) {
      const angle = (Math.atan2(cursor.y - p.y - p.h / 2, cursor.x - p.x - p.w / 2) + Math.PI / 2 + Math.PI * 2) % (Math.PI * 2);
      const look = Math.round(angle / (Math.PI * 2) * 16) % 16; row = 9 + Math.floor(look / 8); frame = look % 8;
    }
    const elapsed = now - p.start;
    const hop = p.state === 'jump' && !reduced.matches ? Math.max(0, Math.sin(Math.min(1, elapsed / 700) * Math.PI)) * 24 : 0;
    ctx.drawImage(p.image, frame * 192, row * 208, 192, 208, p.x, p.y - hop, p.w, p.h);
    if (now < p.petUntil) {
      ctx.font = '18px sans-serif'; ctx.fillStyle = '#ff8fac';
      ctx.fillText('♥', p.x + p.w / 2, p.y - 4 - ((now - p.start) / 100 % 12));
    }
  }
  paintShared(now);
  for (const speaker of teamSpeakers) {
    const kuri = pets.find(p => p.id === speaker.id);
    const teamBubble = speaker.bubble;
    if (!kuri) continue;
    if (now >= speaker.next) {
      sayTeamPerformance(speaker);
      speaker.until = now + 10000;
      speaker.next = speaker.until + speechGap();
    }
    teamBubble.hidden = now >= speaker.until || Boolean(shared?.group.includes(kuri));
    if (!teamBubble.hidden) {
      const anchor = kuri.x + kuri.w / 2;
      const width = teamBubble.offsetWidth, height = teamBubble.offsetHeight;
      const left = Math.max(6, Math.min(W - width - 6, anchor - width / 2));
      const below = kuri.y + kuri.h * .12 - height - 12 < 6;
      teamBubble.classList.toggle('is-below', below);
      teamBubble.style.left = `${left}px`;
      teamBubble.style.top = `${below ? kuri.y + kuri.h + 12 : kuri.y + kuri.h * .12 - height - 12}px`;
      teamBubble.style.setProperty('--tail-x', `${Math.max(16, Math.min(width - 28, anchor - left - 6))}px`);
    }
  }
  const hachi = pets.find(p => p.id === 'hachiware');
  if (hachi) {
    const together = Boolean(shared?.group.includes(hachi));
    if (!together && now >= nextSpeech) {
      updateScheduleBubble();
      speechUntil = now + 7000;
      nextSpeech = speechUntil + speechGap();
    }
    bubble.hidden = together || now >= speechUntil;
    if (!bubble.hidden) {
      const elapsed = now - hachi.start;
      const hop = hachi.state === 'jump' && !reduced.matches ? Math.max(0, Math.sin(Math.min(1, elapsed / 700) * Math.PI)) * 24 : 0;
      const anchorX = hachi.x + hachi.w / 2;
      const headY = hachi.y - hop + hachi.h * .12;
      const width = bubble.offsetWidth, height = bubble.offsetHeight;
      const left = Math.max(6, Math.min(W - width - 6, anchorX - width / 2));
      const below = headY - height - 12 < 6;
      const top = below ? hachi.y + hachi.h + 12 : headY - height - 12;
      bubble.classList.toggle('is-below', below);
      bubble.style.left = `${left}px`;
      bubble.style.top = `${top}px`;
      bubble.style.setProperty('--tail-x', `${Math.max(16, Math.min(width - 28, anchorX - left - 6))}px`);
    }
  }
  if (now - lastRegions > 80) {
    window.petsAPI.regions(pets.filter(p => !shared?.group.includes(p)).map(rect)); lastRegions = now;
  }
}
canvas.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  const now = performance.now();
  const p = [...pets].reverse().find(p => {
    const r = rect(p);
    return !shared?.group.includes(p) && event.clientX >= r.x && event.clientX <= r.x + r.w && event.clientY >= r.y && event.clientY <= r.y + r.h;
  });
  if (p) {
    drag = { pet: p, pointerId: event.pointerId, offsetX: event.clientX - p.x, offsetY: event.clientY - p.y, startX: event.clientX, startY: event.clientY, moved: false };
    canvas.setPointerCapture(event.pointerId);
    window.petsAPI.dragging(true);
    act(p, 'idle', now, 1000);
    canvas.style.cursor = 'grabbing';
  }
});
canvas.addEventListener('pointermove', event => {
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (!(event.buttons & 1)) { endDrag({ type: 'pointercancel' }); return; }
  if (Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) > 5) drag.moved = true;
  if (!drag.moved) return;
  drag.pet.x = Math.max(0, Math.min(W - drag.pet.w, event.clientX - drag.offsetX));
  drag.pet.y = Math.max(28, Math.min(H - drag.pet.h - 3, event.clientY - drag.offsetY));
});
function endDrag(event) {
  if (!drag || (event.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
  const { pet, moved } = drag;
  drag = null;
  const now = performance.now();
  if (!moved && event.type === 'pointerup') { pet.petUntil = now + 1600; act(pet, 'wave', now, 1900); }
  else act(pet, 'idle', now, 1800);
  window.petsAPI.dragging(false);
  canvas.style.cursor = '';
}
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('lostpointercapture', endDrag);
window.addEventListener('blur', () => endDrag({ type: 'pointercancel' }));
async function init() {
  await Promise.all(activeRoster.map(async ([id, name], index) => {
    const image = await load(asset(`${id}.png`));
    const scale = id === 'momonga' ? 1.5 : 1;
    pets.push({ id, name, image, w: 76 * scale, h: 208 / 192 * 76 * scale,
      x: Math.random() * Math.max(0, W - 114), y: 28 + Math.random() * Math.max(0, H - 160), vx: Math.cos(index * 2.4), vy: Math.sin(index * 2.4), speed: 20 + index * 2.5,
      state: index % 2 ? 'left' : 'right', start: performance.now(), until: performance.now() + 2500 + index * 180,
      petUntil: 0, cycle: index % 9 });
  }));
  for (const [folder, ids, count, audioName] of [
    ['hc_walktogether', ['chiikawa', 'hachiware'], 9, 'together'],
    ['tanuki_trio', ['chiikawa', 'hachiware', 'usagi'], 51, 'tanuki']
  ]) {
    const frames = await Promise.all(Array.from({ length: count }, (_, i) => load(asset(`coanimations/${folder}/${i}.png`))));
    const poses = folder === 'hc_walktogether' ? await Promise.all(['hc_heart.png', 'hc_handholding.png'].map(n => load(asset(`coanimations/${n}`)))) : [];
    const audio = new Audio(asset(`coanimations/sounds/${audioName}.wav`)); audio.volume = .2;
    sets.push({ ids, frames, poses, audio });
  }
  console.info('PETS_READY', pets.length, 'SHARED_SETS', sets.length);
  requestAnimationFrame(tick);
}
init().catch(error => console.error('PETS_INIT_FAILED', error));
