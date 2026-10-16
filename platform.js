/* platform.js: Supabase login + cloud saving, shared by every page of the club site.
   Needs the supabase-js script and platform-config.js to be loaded first. */
(function () {
  const C = Object.assign({ url: '', anonKey: '', allowSignup: false, tables: {} }, window.PLATFORM_CONFIG || {});
  const T = Object.assign({ draws: 'draw_tournaments', players: 'saved_players' }, C.tables);
  const ready = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(C.url) && String(C.anonKey).length > 20 && !!window.supabase;
  const sb = ready ? window.supabase.createClient(C.url, C.anonKey) : null;
  const LEVELS = ['High', 'Mid', 'Low'];
  let user = null, started = false;
  const subs = [];

  // ---------- global authentication state ----------
  function setUser(next) {
    const changed = (next && next.id) !== (user && user.id);
    user = next || null;
    if (changed || !started) { started = true; subs.slice().forEach(fn => { try { fn(user); } catch (e) { console.error(e); } }); }
  }
  if (sb) {
    sb.auth.getSession().then(r => setUser(r.data && r.data.session ? r.data.session.user : null));
    sb.auth.onAuthStateChange((event, session) => setTimeout(() => setUser(session ? session.user : null), 0));
  } else setTimeout(() => setUser(null), 0);

  const needSb = () => { if (!sb) throw new Error('The cloud is not connected yet. Add your Supabase URL and key in platform-config.js.'); };
  const readyP = new Promise(res => subs.push(() => res()));   // resolves once we know if someone is signed in
  const need = () => {
    if (!sb) throw new Error('The cloud is not connected yet. Add your Supabase URL and key in platform-config.js.');
    if (!user) throw new Error('Please sign in first.');
  };
  async function run(query) {
    const r = await query;
    if (r.error) throw new Error(r.error.message);
    return r.data;
  }

  // ---------- cloud tournaments (one row per saved Draw & Schedule file, private to its owner) ----------
  const listTournaments = () => { need(); return run(sb.from(T.draws).select('id, name, info, updated_at').order('updated_at', { ascending: false })); };
  const loadTournament = id => { need(); return run(sb.from(T.draws).select('*').eq('id', id).single()); };
  const saveTournament = t => {
    need();
    return run(sb.from(T.draws).upsert({ id: t.id, user_id: user.id, name: t.name, info: t.info || '', state: t.state }, { onConflict: 'id' }).select('id, updated_at').single());
  };
  const deleteTournament = id => { need(); return run(sb.from(T.draws).delete().eq('id', id)); };

  // ---------- saved player pool (for the queuing tool) ----------
  /** Saves (or updates the level of) one player in the signed-in organizer's pool. */
  async function savePlayerToPool(name, level) {
    need();
    const clean = String(name || '').trim().replace(/\s+/g, ' ');
    const lv = LEVELS.find(l => l.toLowerCase() === String(level || '').trim().toLowerCase());
    if (!clean) throw new Error('Enter the player\'s name.');
    if (!lv) throw new Error('Level must be High, Mid or Low.');
    return run(sb.from(T.players).upsert({ user_id: user.id, name: clean, level: lv }, { onConflict: 'user_id,name' }).select('id, name, level').single());
  }
  /** Returns the whole pool as [{ id, name, level }], sorted by name. */
  async function fetchPlayerPool() {
    need();
    return run(sb.from(T.players).select('id, name, level').order('name', { ascending: true }));
  }
  const removePlayerFromPool = id => { need(); return run(sb.from(T.players).delete().eq('id', id)); };

  // ---------- sign in / out ----------
  async function signIn(email, password) {
    if (!sb) need();
    const r = await sb.auth.signInWithPassword({ email: String(email).trim(), password });
    if (r.error) throw new Error(r.error.message);
  }
  async function signUp(email, password) {
    if (!sb) need();
    if (!C.allowSignup) throw new Error('Creating accounts is turned off right now.');
    if (String(password || '').length < 8) throw new Error('Use a password with at least 8 characters.');
    const r = await sb.auth.signUp({ email: String(email).trim(), password, options: { emailRedirectTo: location.href.split('#')[0] } });
    if (r.error) throw new Error(r.error.message);
    return r.data && r.data.session ? 'signed-in' : 'check-email';
  }
  async function resetPassword(email) {
    if (!sb) need();
    const r = await sb.auth.resetPasswordForEmail(String(email).trim(), { redirectTo: location.href.split('#')[0] });
    if (r.error) throw new Error(r.error.message);
  }
  // true only for owner / co-organizers (rows in the organizers table); everyone else gets a private workspace
  let orgFor = null, orgVal = false;
  async function isOrganizer() {
    if (!sb || !user) return false;
    if (orgFor === user.id) return orgVal;
    const r = await sb.rpc('is_organizer');
    orgFor = user.id; orgVal = !r.error && r.data === true;
    return orgVal;
  }
  async function signOut() { if (sb) await sb.auth.signOut(); }

  function onAuth(fn) { subs.push(fn); if (started) setTimeout(() => fn(user), 0); }


  // ---------- public tournaments, sharing and player registrations ----------
  const TT = 'tournaments', RT = 'registrations';
  const fail = e => { throw new Error(e && e.message ? e.message : 'Something went wrong.'); };
  async function listPublicTournaments() {
    needSb(); const r = await sb.from(TT).select('*').eq('published', true).order('event_date', { ascending: true });
    if (r.error) fail(r.error); return r.data || [];
  }
  async function listMyTournaments() {
    need(); if (!user) return [];
    const r = await sb.from(TT).select('*').eq('created_by', user.id).order('created_at', { ascending: false });
    if (r.error) fail(r.error); return r.data || [];
  }
  async function getTournament(slug) {
    needSb(); const r = await sb.from(TT).select('*').eq('slug', slug).maybeSingle();
    if (r.error) fail(r.error); return r.data;
  }
  async function saveTournament2(row) {            // insert (no id) or update (id) one of MY tournaments
    need(); if (!user) throw new Error('Please sign in first.');
    const body = Object.assign({}, row, { created_by: undefined });
    let q;
    if (row.id) q = sb.from(TT).update(body).eq('id', row.id).select('*').single();
    else q = sb.from(TT).insert(Object.assign(body, { created_by: user.id })).select('*').single();
    const r = await q;
    if (r.error) { if (r.error.code === '23505') throw new Error('That page address is already taken. Try another one.'); fail(r.error); }
    return r.data;
  }
  async function deleteTournament2(id) { need(); const r = await sb.from(TT).delete().eq('id', id); if (r.error) fail(r.error); }
  async function registerForTournament(tournamentId, p) {   // works for visitors who are not signed in
    needSb();
    const r = await sb.from(RT).insert({ tournament_id: tournamentId, name: p.name, email: p.email, phone: p.phone || null, level: p.level || null });
    if (r.error) {
      if (r.error.code === '23505') throw new Error('This email is already registered for this tournament.');
      if (r.error.code === '42501') throw new Error('Registration is closed for this tournament.');
      fail(r.error);
    }
  }
  async function slotCounts(tournamentId) {
    needSb(); const r = await sb.rpc('slot_counts', { t: tournamentId });
    if (r.error) fail(r.error); const o = {}; (r.data || []).forEach(x => { o[x.level] = Number(x.n); }); return o;
  }
  async function listRegistrations(tournamentId) {
    need(); const r = await sb.from(RT).select('*').eq('tournament_id', tournamentId).order('created_at', { ascending: true });
    if (r.error) fail(r.error); return r.data || [];
  }
  async function setRegistrationStatus(id, status) {
    need(); const r = await sb.from(RT).update({ status }).eq('id', id); if (r.error) fail(r.error);
  }
  async function deleteRegistration(id) { need(); const r = await sb.from(RT).delete().eq('id', id); if (r.error) fail(r.error); }

  window.Platform = {
    configured: !!sb, config: C, onAuth, signIn, signUp, signOut, resetPassword, isOrganizer,
    listTournaments, loadTournament, saveTournament, deleteTournament,
    savePlayerToPool, fetchPlayerPool, removePlayerFromPool,
    listPublicTournaments, listMyTournaments, getTournament, saveMyTournament: saveTournament2, deleteMyTournament: deleteTournament2,
    registerForTournament, slotCounts, listRegistrations, setRegistrationStatus, deleteRegistration,
    whenReady: () => readyP,
    get user() { return user; }
  };
  window.savePlayerToPool = savePlayerToPool;
  window.fetchPlayerPool = fetchPlayerPool;
})();
