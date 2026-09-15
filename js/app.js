import { supabase, configured } from './supabaseClient.js';

const els = {
  setupNotice: document.querySelector('#setupNotice'),
  halfTitle: document.querySelector('#halfTitle'),
  connectionBadge: document.querySelector('#connectionBadge'),
  rocketField: document.querySelector('#rocketField'),
  timer: document.querySelector('#timer'),
  surgeAnnouncement: document.querySelector('#surgeAnnouncement'),
  surgeRoomLabel: document.querySelector('#surgeRoomLabel'),
  modalBackdrop: document.querySelector('#modalBackdrop'),
  loginModal: document.querySelector('#loginModal'),
  loginTitle: document.querySelector('#loginTitle'),
  loginSubtitle: document.querySelector('#loginSubtitle'),
  loginForm: document.querySelector('#loginForm'),
  loginEmail: document.querySelector('#loginEmail'),
  loginPassword: document.querySelector('#loginPassword'),
  loginError: document.querySelector('#loginError'),
  adminModal: document.querySelector('#adminModal'),
  pointsModal: document.querySelector('#pointsModal'),
  resetModal: document.querySelector('#resetModal'),
  adminIdentity: document.querySelector('#adminIdentity'),
  pointsIdentity: document.querySelector('#pointsIdentity'),
  revealTeamButtons: document.querySelector('#revealTeamButtons'),
  scoreControls: document.querySelector('#scoreControls'),
  teamNameEditor: document.querySelector('#teamNameEditor'),
  roomNameEditor: document.querySelector('#roomNameEditor'),
  surgeRoomSelect: document.querySelector('#surgeRoomSelect'),
  adminStatus: document.querySelector('#adminStatus'),
  pointsStatus: document.querySelector('#pointsStatus'),
  resetConfirmText: document.querySelector('#resetConfirmText'),
  confirmReset: document.querySelector('#confirmReset'),
  toast: document.querySelector('#toast'),
};

let state = { teams: [], settings: null, rooms: [] };
let currentUser = null;
let currentRole = null;
let requestedPanel = null;
let timerInterval = null;
let realtimeChannel = null;
let initialLoadDone = false;
let toastTimer = null;

const lanePositions = [7.5, 24.5, 41.5, 58.5, 75.5, 92.5];

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.add('hidden'), 3200);
}

function openModal(modal) {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  els.modalBackdrop.classList.remove('hidden');
  modal.classList.remove('hidden');
}
function closeModals() {
  document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
  els.modalBackdrop.classList.add('hidden');
  els.loginError.classList.add('hidden');
  els.resetConfirmText.value = '';
  els.confirmReset.disabled = true;
}

document.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', closeModals));
els.modalBackdrop.addEventListener('click', closeModals);

function rankHeight(team, teams, hiddenMode) {
  if (hiddenMode && !team.revealed) return 8;
  if (team.score <= 0) return 8;
  const uniquePositive = [...new Set(teams.filter(t => t.score > 0).map(t => t.score))].sort((a,b)=>b-a);
  const index = uniquePositive.indexOf(team.score);
  if (index < 0) return 8;
  if (uniquePositive.length === 1) return 65;
  const top = 65, low = 17;
  return top - (index * (top-low) / Math.max(1, uniquePositive.length-1));
}

function teamVisible(team) {
  return !state.settings?.scores_hidden || team.revealed;
}

function rocketMarkup(team, i) {
  const visible = teamVisible(team);
  const height = rankHeight(team, state.teams, state.settings?.scores_hidden);
  return `<div class="rocket-position" id="rocket-${team.id}" style="left:${lanePositions[i] ?? 50}%;--rest:${height}%;--bob-delay:${(-i*.31).toFixed(2)}s">
    <div class="rocket-bob"><div class="rocket-boost" id="boost-${team.id}">
      <img class="flame-image" src="./assets/flame.png" alt="" />
      <img class="rocket-image" src="./assets/rocket.png" alt="${escapeHtml(team.name)} rocket" />
      <div class="team-label"><div class="team-name">${escapeHtml(team.name)}</div><div class="team-score ${visible?'':'score-hidden'}">${visible ? team.score : '???'}</div></div>
    </div></div>
  </div>`;
}

function escapeHtml(value='') {
  return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[ch]));
}

function renderRockets({ previousScores = new Map(), animateTeamId = null, delta = 0 } = {}) {
  const oldElements = new Map(state.teams.map(t => [t.id, document.querySelector(`#rocket-${t.id}`)]));
  if (!els.rocketField.children.length || !initialLoadDone) {
    els.rocketField.innerHTML = state.teams.map(rocketMarkup).join('');
    return;
  }

  state.teams.forEach((team, i) => {
    let pos = oldElements.get(team.id);
    if (!pos) {
      els.rocketField.innerHTML = state.teams.map(rocketMarkup).join('');
      return;
    }
    const visible = teamVisible(team);
    pos.style.left = `${lanePositions[i] ?? 50}%`;
    pos.querySelector('.team-name').textContent = team.name;
    const scoreEl = pos.querySelector('.team-score');
    scoreEl.textContent = visible ? team.score : '???';
    scoreEl.classList.toggle('score-hidden', !visible);
    pos.querySelector('.rocket-image').alt = `${team.name} rocket`;

    const target = `${rankHeight(team, state.teams, state.settings?.scores_hidden)}%`;
    if (team.id === animateTeamId && delta > 0) {
      const boost = pos.querySelector('.rocket-boost');
      const klass = delta >= 15 ? 'boost-large' : delta >= 10 ? 'boost-medium' : 'boost-small';
      boost.classList.remove('boost-small','boost-medium','boost-large');
      void boost.offsetWidth;
      boost.classList.add(klass);
      setTimeout(() => { pos.style.setProperty('--rest', target); }, 280);
      setTimeout(() => boost.classList.remove(klass), 1050);
    } else {
      pos.style.setProperty('--rest', target);
    }
  });
}

function renderSettings() {
  if (!state.settings) return;
  els.halfTitle.textContent = `HALF ${state.settings.current_half}`;
  if (state.settings.point_surge_active && state.settings.active_surge_room_id) {
    const room = state.rooms.find(r => r.id === state.settings.active_surge_room_id);
    els.surgeRoomLabel.textContent = (room?.name || `Room ${state.settings.active_surge_room_id}`).toUpperCase();
    els.surgeAnnouncement.classList.remove('hidden');
  } else {
    els.surgeAnnouncement.classList.add('hidden');
  }
  restartTimerTick();
}

function restartTimerTick() {
  clearInterval(timerInterval);
  const tick = () => {
    if (!state.settings?.timer_visible || !state.settings.timer_ends_at) {
      els.timer.classList.add('hidden');
      return;
    }
    els.timer.classList.remove('hidden');
    const remaining = Math.max(0, new Date(state.settings.timer_ends_at).getTime() - Date.now());
    const totalSeconds = Math.ceil(remaining / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    els.timer.textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;
  };
  tick();
  timerInterval = setInterval(tick, 250);
}

function renderAdminControls() {
  if (!state.settings) return;
  document.querySelectorAll('.half-button').forEach(b => {
    const active = Number(b.dataset.half) === state.settings.current_half;
    b.className = `half-button ${active ? 'primary-button' : 'secondary-button'}`;
  });
  els.revealTeamButtons.innerHTML = state.teams.map(t => `<button class="secondary-button reveal-one" data-team-id="${t.id}" ${t.revealed ? 'disabled':''}>${t.revealed ? '✓ ' : ''}${escapeHtml(t.name)}</button>`).join('');
  els.teamNameEditor.innerHTML = state.teams.map(t => `<label>${escapeHtml(t.name)}<input class="team-name-input" data-team-id="${t.id}" maxlength="30" value="${escapeHtml(t.name)}" /></label>`).join('');
  els.surgeRoomSelect.innerHTML = state.rooms.map(r => `<option value="${r.id}" ${state.settings.active_surge_room_id===r.id?'selected':''}>${escapeHtml(r.name)}</option>`).join('');
  els.roomNameEditor.innerHTML = state.rooms.map(r => `<label>Room ${r.id}<input class="room-name-input" data-room-id="${r.id}" maxlength="30" value="${escapeHtml(r.name)}" /></label>`).join('');
}

function renderPointsControls() {
  els.scoreControls.innerHTML = state.teams.map(t => `<div class="score-team-card"><div class="score-team-header"><strong>${escapeHtml(t.name)}</strong><span class="score-current">${t.score}</span></div><div class="score-buttons">${[-1,-5,1,5,10,15].map(d => `<button class="score-btn ${d<0?'minus':'plus'}" data-team-id="${t.id}" data-delta="${d}">${d>0?'+':''}${d}</button>`).join('')}</div></div>`).join('');
}

function renderAll(opts={}) {
  renderRockets(opts);
  renderSettings();
  renderAdminControls();
  renderPointsControls();
}

async function loadState() {
  const [{ data: teams, error: teamsError }, { data: settings, error: settingsError }, { data: rooms, error: roomsError }] = await Promise.all([
    supabase.from('teams').select('*').order('display_order'),
    supabase.from('leaderboard_settings').select('*').eq('id',1).single(),
    supabase.from('surge_rooms').select('*').order('id'),
  ]);
  const error = teamsError || settingsError || roomsError;
  if (error) throw error;
  state = { teams, settings, rooms };
  renderAll();
  initialLoadDone = true;
}

async function refreshTeamsWithAnimation(payload) {
  const oldScores = new Map(state.teams.map(t => [t.id,t.score]));
  const changedId = payload?.new?.id ?? null;
  const oldScore = oldScores.get(changedId);
  const newScore = payload?.new?.score;
  const delta = Number.isFinite(oldScore) && Number.isFinite(newScore) ? newScore-oldScore : 0;
  const { data, error } = await supabase.from('teams').select('*').order('display_order');
  if (error) return console.error(error);
  state.teams = data;
  renderAll({ previousScores: oldScores, animateTeamId: changedId, delta });
}

async function subscribeRealtime() {
  if (realtimeChannel) await supabase.removeChannel(realtimeChannel);
  realtimeChannel = supabase.channel('kdc-leaderboard-live')
    .on('postgres_changes',{event:'*',schema:'public',table:'teams'}, payload => refreshTeamsWithAnimation(payload))
    .on('postgres_changes',{event:'*',schema:'public',table:'leaderboard_settings'}, async () => {
      const {data,error}=await supabase.from('leaderboard_settings').select('*').eq('id',1).single();
      if(!error){ state.settings=data; renderAll(); }
    })
    .on('postgres_changes',{event:'*',schema:'public',table:'surge_rooms'}, async () => {
      const {data,error}=await supabase.from('surge_rooms').select('*').order('id');
      if(!error){ state.rooms=data; renderAll(); }
    })
    .subscribe(status => {
      els.connectionBadge.textContent = status === 'SUBSCRIBED' ? '● LIVE' : status;
      els.connectionBadge.classList.toggle('live', status === 'SUBSCRIBED');
      els.connectionBadge.classList.toggle('offline', status === 'CHANNEL_ERROR' || status === 'TIMED_OUT');
    });
}

async function getRole() {
  const { data: { user } } = await supabase.auth.getUser();
  currentUser = user;
  if (!user) { currentRole = null; return null; }
  const { data, error } = await supabase.rpc('my_role');
  if (error) { console.error(error); currentRole = null; return null; }
  currentRole = data;
  return currentRole;
}

async function requestPanel(panel) {
  requestedPanel = panel;
  await getRole();
  const allowed = panel === 'admin' ? currentRole === 'admin' : ['admin','points_master'].includes(currentRole);
  if (allowed) return showPanel(panel);
  els.loginTitle.textContent = panel === 'admin' ? 'Admin Sign In' : 'Points Master Sign In';
  els.loginSubtitle.textContent = panel === 'admin' ? 'An admin account is required.' : 'A Points Master or admin account is required.';
  els.loginForm.reset();
  els.loginError.classList.add('hidden');
  openModal(els.loginModal);
}

function showPanel(panel) {
  if (panel === 'admin') {
    els.adminIdentity.textContent = `${currentUser?.email || ''} • ${currentRole}`;
    renderAdminControls();
    openModal(els.adminModal);
  } else {
    els.pointsIdentity.textContent = `${currentUser?.email || ''} • ${currentRole}`;
    renderPointsControls();
    openModal(els.pointsModal);
  }
}

els.loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  els.loginError.classList.add('hidden');
  const { error } = await supabase.auth.signInWithPassword({ email: els.loginEmail.value.trim(), password: els.loginPassword.value });
  if (error) {
    els.loginError.textContent = error.message;
    els.loginError.classList.remove('hidden');
    return;
  }
  const role = await getRole();
  const allowed = requestedPanel === 'admin' ? role === 'admin' : ['admin','points_master'].includes(role);
  if (!allowed) {
    await supabase.auth.signOut();
    els.loginError.textContent = requestedPanel === 'admin' ? 'This account is not an admin.' : 'This account is not a Points Master.';
    els.loginError.classList.remove('hidden');
    return;
  }
  showPanel(requestedPanel);
});

document.querySelector('#adminButton').addEventListener('click',()=>requestPanel('admin'));
document.querySelector('#pointsButton').addEventListener('click',()=>requestPanel('points'));

async function signOut() { await supabase.auth.signOut(); currentUser=null; currentRole=null; closeModals(); toast('Signed out.'); }
document.querySelector('#adminLogout').addEventListener('click',signOut);
document.querySelector('#pointsLogout').addEventListener('click',signOut);

async function rpc(name,args={},statusEl=els.adminStatus) {
  statusEl.textContent = 'Saving…';
  const { error } = await supabase.rpc(name,args);
  if (error) { statusEl.textContent = `Error: ${error.message}`; toast(error.message); return false; }
  statusEl.textContent = 'Saved.';
  setTimeout(()=>{ if(statusEl.textContent==='Saved.') statusEl.textContent=''; },1500);
  return true;
}

document.querySelectorAll('.half-button').forEach(btn => btn.addEventListener('click',()=>rpc('admin_set_half',{p_half:Number(btn.dataset.half)})));
document.querySelector('#startTimer').addEventListener('click',()=>{
  const minutes = Number(document.querySelector('#timerMinutes').value||0);
  const seconds = Number(document.querySelector('#timerSeconds').value||0);
  const total = minutes*60+seconds;
  if(total<=0) return toast('Choose a timer longer than 0 seconds.');
  rpc('admin_start_timer',{p_seconds:total});
});
document.querySelector('#clearTimer').addEventListener('click',()=>rpc('admin_clear_timer'));
document.querySelector('#hideScores').addEventListener('click',()=>rpc('admin_hide_scores'));
document.querySelector('#revealAll').addEventListener('click',()=>rpc('admin_reveal_all'));
els.revealTeamButtons.addEventListener('click',e=>{
  const b=e.target.closest('.reveal-one'); if(!b) return;
  rpc('admin_reveal_team',{p_team_id:Number(b.dataset.teamId)});
});
document.querySelector('#startSurge').addEventListener('click',()=>rpc('admin_start_point_surge',{p_room_id:Number(els.surgeRoomSelect.value)}));
document.querySelector('#clearSurge').addEventListener('click',()=>rpc('admin_clear_point_surge'));

document.querySelector('#saveTeamNames').addEventListener('click', async ()=>{
  for (const input of document.querySelectorAll('.team-name-input')) {
    const ok = await rpc('admin_rename_team',{p_team_id:Number(input.dataset.teamId),p_name:input.value.trim()});
    if(!ok) break;
  }
});
document.querySelector('#saveRoomNames').addEventListener('click', async ()=>{
  for (const input of document.querySelectorAll('.room-name-input')) {
    const ok = await rpc('admin_rename_room',{p_room_id:Number(input.dataset.roomId),p_name:input.value.trim()});
    if(!ok) break;
  }
});

els.scoreControls.addEventListener('click',async e=>{
  const b=e.target.closest('.score-btn'); if(!b) return;
  b.disabled=true;
  await rpc('adjust_team_score',{p_team_id:Number(b.dataset.teamId),p_delta:Number(b.dataset.delta)},els.pointsStatus);
  setTimeout(()=>b.disabled=false,350);
});

document.querySelector('#resetLeaderboard').addEventListener('click',()=>openModal(els.resetModal));
els.resetConfirmText.addEventListener('input',()=>els.confirmReset.disabled=els.resetConfirmText.value!=='RESET');
els.confirmReset.addEventListener('click',async()=>{ if(await rpc('admin_reset_leaderboard')) { closeModals(); toast('Leaderboard reset.'); } });

document.querySelector('#fullscreenButton').addEventListener('click', async ()=>{
  try { await document.documentElement.requestFullscreen(); } catch(err) { toast('Fullscreen could not start in this browser.'); }
});
document.addEventListener('fullscreenchange',()=>document.body.classList.toggle('fullscreen-active',Boolean(document.fullscreenElement)));

document.addEventListener('keydown',e=>{ if(e.key==='Escape' && !document.fullscreenElement) closeModals(); });

async function init() {
  if (!configured) {
    els.setupNotice.classList.remove('hidden');
    els.connectionBadge.textContent='SETUP REQUIRED';
    els.connectionBadge.classList.add('offline');
    return;
  }
  try {
    await loadState();
    await subscribeRealtime();
    await getRole();
  } catch (err) {
    console.error(err);
    els.connectionBadge.textContent='DATA ERROR';
    els.connectionBadge.classList.add('offline');
    toast(`Could not load leaderboard: ${err.message}`);
  }
}
init();
