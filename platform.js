/* platform.js: Supabase login + cloud saving, shared by every page of the club site.
   Needs the supabase-js script and platform-config.js to be loaded first. */
(function () {
  const C = Object.assign({ url: '', anonKey: '', allowSignup: false, tables: {} }, window.PLATFORM_CONFIG || {});
  const T = Object.assign({ draws: 'draw_tournaments', players: 'saved_players' }, C.tables);
  const ready = /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(C.url) && String(C.anonKey).length > 20 && !!window.supabase;
  // A password-reset email link comes back as  #access_token=...&type=recovery  (or #error_code=... when it is expired).
  // supabase-js clears that hash as soon as it starts, so note it first.
  const URLTXT = String(location.hash || '') + '&' + String(location.search || '');
  let recovery = /(^|[#&?])type=recovery\b/.test(URLTXT);
  const recoveryErr = /error_code=|error_description=/.test(URLTXT) && /otp_expired|expired|invalid|access_denied/i.test(URLTXT.replace(/\+/g, ' ')) ? 'That reset link has expired or was already used. Request a new one.' : '';
  const sb = ready ? window.supabase.createClient(C.url, C.anonKey) : null;
  const LEVELS = ['High', 'Mid', 'Low'];
  let user = null, started = false;
  const subs = [], recSubs = [];

  // ---------- global authentication state ----------
  function setUser(next) {
    const changed = (next && next.id) !== (user && user.id);
    user = next || null;
    if (changed || !started) { started = true; subs.slice().forEach(fn => { try { fn(user); } catch (e) { console.error(e); } }); }
  }
  if (sb) {
    sb.auth.getSession().then(r => setUser(r.data && r.data.session ? r.data.session.user : null));
    sb.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') { recovery = true; recSubs.slice().forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); }
      setTimeout(() => setUser(session ? session.user : null), 0);
    });
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
  const listTournaments = () => { need(); return run(sb.from(T.draws).select('id, name, info, updated_at, sport:state->>sport').order('updated_at', { ascending: false })); };      // sport comes from inside the saved state (older files have none = badminton)
  const loadTournament = id => { need(); return run(sb.from(T.draws).select('*').eq('id', id).single()); };
  const saveTournament = t => {
    need();
    return run(sb.from(T.draws).upsert({ id: t.id, user_id: user.id, name: t.name, info: t.info || '', state: t.state }, { onConflict: 'id' }).select('id, updated_at').single());
  };
  const deleteTournament = id => { need(); return run(sb.from(T.draws).delete().eq('id', id)); };
  // automatic online backups (table draw_backups, see supabase-step9.sql)
  const listBackups = () => { need(); return run(sb.from('draw_backups').select('id, draw_id, name, info, created_at, sport:state->>sport').order('created_at', { ascending: false }).limit(60)); };
  const loadBackup = id => { need(); return run(sb.from('draw_backups').select('*').eq('id', id).single()); };
  const saveBackup = b => { need(); return run(sb.from('draw_backups').insert({ user_id: user.id, draw_id: b.draw_id || null, name: b.name || '', info: b.info || '', state: b.state }).select('id, created_at').single()); };
  async function pruneBackups(drawId, keep) {          // keep only the newest few snapshots of one tournament
    need(); const rows = await run(sb.from('draw_backups').select('id').eq('draw_id', drawId).order('created_at', { ascending: false }).range(keep, keep + 100));
    if (rows && rows.length) await run(sb.from('draw_backups').delete().in('id', rows.map(r => r.id)));
  }

  // ---------- saved player pool (for the queuing tool) ----------
  // One pool per sport, with no database change: pickleball names are stored as "pickleball::Name"; old rows without a prefix are badminton.
  const poolSport = () => { let k = 'badminton'; try { k = localStorage.getItem('sport') || 'badminton'; } catch (e) {} return /^[a-z]+$/.test(k) ? k : 'badminton'; };
  const poolKey = () => { const k = poolSport(); return k === 'badminton' ? '' : k + '::'; };
  const poolRow = r => { const n = String(r.name || ''), i = n.indexOf('::'); return i > 0 ? { id: r.id, level: r.level, sport: n.slice(0, i), name: n.slice(i + 2) } : { id: r.id, level: r.level, sport: 'badminton', name: n }; };
  /** Saves (or updates the level of) one player in the signed-in organizer's pool. */
  async function savePlayerToPool(name, level) {
    need();
    const clean = String(name || '').trim().replace(/\s+/g, ' ');
    const lv = LEVELS.find(l => l.toLowerCase() === String(level || '').trim().toLowerCase());
    if (!clean) throw new Error('Enter the player\'s name.');
    if (!lv) throw new Error('Level must be High, Mid or Low.');
    return run(sb.from(T.players).upsert({ user_id: user.id, name: poolKey() + clean, level: lv }, { onConflict: 'user_id,name' }).select('id, name, level').single()).then(poolRow);
  }
  /** Returns the whole pool as [{ id, name, level }], sorted by name. */
  async function fetchPlayerPool() {
    need();
    const me = poolSport();
    return run(sb.from(T.players).select('id, name, level').order('name', { ascending: true })).then(rows => (rows || []).map(poolRow).filter(r => r.sport === me).map(r => ({ id: r.id, name: r.name, level: r.level })));
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
    // always send people back to the main page of the site, which has the "choose a new password" screen
    const home = location.origin + location.pathname.replace(/[^/]*$/, '');
    const r = await sb.auth.resetPasswordForEmail(String(email).trim(), { redirectTo: home });
    if (r.error) throw new Error(r.error.message);
  }
  async function updatePassword(pw) {          // used after the reset link signed the person in
    if (!sb) need();
    if (String(pw || '').length < 8) throw new Error('Use a password with at least 8 characters.');
    const r = await sb.auth.updateUser({ password: pw });
    if (r.error) throw new Error(r.error.message);
    recovery = false;
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

  // ---------- queuing tool: shared sessions (several organizers, one live queue) ----------
  const QT = 'queue_sessions';
  async function listQueueSessions() {
    need(); const r = await sb.from(QT).select('id, name, owner, join_code, public_code, version, updated_at, sport:state->>sport').order('updated_at', { ascending: false });
    if (r.error) fail(r.error); return r.data || [];
  }
  async function getQueueSession(id) {
    need(); const r = await sb.from(QT).select('*').eq('id', id).maybeSingle();
    if (r.error) fail(r.error); return r.data;
  }
  async function getQueueVersion(id) {                       // tiny check: just the version number, not the whole queue
    need(); const r = await sb.from(QT).select('id, version').eq('id', id).maybeSingle();
    if (r.error) fail(r.error); return r.data;
  }
  async function createQueueSession(name, state) {
    need(); const r = await sb.from(QT).insert({ name, state, owner: user.id }).select('*').single();
    if (r.error) fail(r.error); return r.data;
  }
  async function saveQueueState(id, version, state) {      // returns null when someone else saved first (version moved on)
    need(); const r = await sb.from(QT).update({ state, version: version + 1 }).eq('id', id).eq('version', version).select('id, version, updated_at');
    if (r.error) fail(r.error); return (r.data && r.data[0]) || null;
  }
  async function renameQueueSession(id, name) { need(); const r = await sb.from(QT).update({ name }).eq('id', id); if (r.error) fail(r.error); }
  async function deleteQueueSession(id) { need(); const r = await sb.from(QT).delete().eq('id', id); if (r.error) fail(r.error); }
  async function joinQueueSession(code) {
    need(); const r = await sb.rpc('join_queue_session', { p_code: String(code || '').trim() });
    if (r.error) fail(r.error); return r.data;
  }
  async function getPublicQueue(code) {
    needSb(); const r = await sb.rpc('get_public_queue', { p_code: String(code || '') });
    if (r.error) fail(r.error); return (r.data && r.data[0]) || null;
  }
  // ---------- published schedule links ----------
  async function publishSchedule(drawId, name, html, matches) {
    need(); const r = await sb.rpc('publish_schedule', { p_draw: drawId, p_name: name, p_html: html, p_matches: matches || [] });
    if (r.error) fail(r.error); return r.data;
  }
  async function myPublishedSchedule(drawId) {
    need(); const r = await sb.from('published_schedules').select('slug, umpire_key, updated_at').eq('draw_id', drawId).maybeSingle();
    if (r.error) fail(r.error); return r.data;
  }
  async function unpublishSchedule(slug) { need(); const r = await sb.from('published_schedules').delete().eq('slug', slug); if (r.error) fail(r.error); }
  async function getLiveScores(slug) {
    needSb(); const r = await sb.rpc('get_live_scores', { p_slug: String(slug || '') });
    if (r.error) fail(r.error); return r.data || [];
  }
  async function clearLiveScores(slug) { need(); const r = await sb.rpc('clear_live_scores', { p_slug: slug }); if (r.error) fail(r.error); }
  async function umpireGet(slug, key) {
    needSb(); const r = await sb.rpc('umpire_get', { p_slug: slug, p_key: key });
    if (r.error) fail(r.error); return r.data;
  }
  async function umpireScore(slug, key, match, s1, s2, status) {
    needSb(); const r = await sb.rpc('umpire_score', { p_slug: slug, p_key: key, p_match: match, p_s1: s1, p_s2: s2, p_status: status });
    if (r.error) fail(r.error);
  }
  async function makeTvCode(slug, key, court, layout) {
    needSb(); const r = await sb.rpc('make_tv_code', { p_slug: slug, p_key: key, p_court: court, p_layout: layout || 'panels' });
    if (r.error) fail(r.error); return r.data;
  }
  async function getTvCode(code) {
    needSb(); const r = await sb.rpc('get_tv_code', { p_code: String(code || '') });
    if (r.error) fail(r.error); return r.data || null;
  }
  async function umpireReset(slug, key, match) {
    needSb(); const r = await sb.rpc('umpire_reset', { p_slug: slug, p_key: key, p_match: match });
    if (r.error) fail(r.error);
  }
  async function getPublicSchedule(slug) {
    needSb(); const r = await sb.rpc('get_public_schedule', { p_slug: String(slug || '') });
    if (r.error) fail(r.error); return (r.data && r.data[0]) || null;
  }
  function subscribeQueue(id, cb) {                         // live pushes; the page also polls as a safety net
    try {
      const ch = sb.channel('queue-' + id).on('postgres_changes', { event: 'UPDATE', schema: 'public', table: QT, filter: 'id=eq.' + id }, p => { if (p && p.new) cb(p.new); }).subscribe();
      return () => { try { sb.removeChannel(ch); } catch (e) {} };
    } catch (e) { return () => {}; }
  }

  // instant "something changed" pings between phones (Supabase Realtime broadcast). The data itself is always re-read from the database.
  const live = {};
  function liveChannel(name, onPing) {
    needSb();
    let e = live[name];
    if (!e) {
      const ch = sb.channel(name, { config: { broadcast: { self: false } } }); e = live[name] = { ch, cbs: [] };
      ch.on('broadcast', { event: 'ping' }, msg => e.cbs.slice().forEach(f => { try { f(msg && msg.payload); } catch (x) {} })).subscribe();
    }
    if (onPing) e.cbs.push(onPing);
    return { ping: payload => { try { e.ch.send({ type: 'broadcast', event: 'ping', payload: payload || {} }); } catch (x) {} } };
  }

  window.Platform = {
    configured: !!sb, config: C, onAuth, signIn, signUp, signOut, resetPassword, updatePassword, isOrganizer,
    recoveryPending: () => recovery, recoveryError: () => recoveryErr, onRecovery: fn => recSubs.push(fn),
    listTournaments, loadTournament, saveTournament, deleteTournament, listBackups, loadBackup, saveBackup, pruneBackups,
    savePlayerToPool, fetchPlayerPool, removePlayerFromPool,
    listPublicTournaments, listMyTournaments, getTournament, saveMyTournament: saveTournament2, deleteMyTournament: deleteTournament2,
    registerForTournament, slotCounts, listRegistrations, setRegistrationStatus, deleteRegistration,
    listQueueSessions, getQueueSession, getQueueVersion, createQueueSession, saveQueueState, renameQueueSession, deleteQueueSession, joinQueueSession, getPublicQueue, subscribeQueue, publishSchedule, myPublishedSchedule, getLiveScores, clearLiveScores, umpireGet, umpireScore, umpireReset, makeTvCode, getTvCode, unpublishSchedule, getPublicSchedule,
    liveChannel, whenReady: () => readyP,
    get user() { return user; }
  };
  window.savePlayerToPool = savePlayerToPool;
  window.fetchPlayerPool = fetchPlayerPool;
})();
