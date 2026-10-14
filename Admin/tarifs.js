/* =====================================================================
   Admin — Tarifs, promotions & fidélité (tarifs.html)
   API : /api/admin/pricing*  (ADMIN uniquement)
   ===================================================================== */
const API_URL = 'https://romantic-enjoyment-production-f458.up.railway.app/api';

let data = { services: [], promotions: [], loyalty: { enabled: false, min_completed: 2, percent: 10 }, today: '' };
let clients = [];
let clientFilter = 'all';
let clientSearch = '';
let redirecting = false;

// <helpers>
const $ = (id) => document.getElementById(id);
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const fmtDA = (n) => `${Number(n || 0).toLocaleString('fr-FR')} DA`;
const fmtPct = (p) => `${Math.round(Number(p) * 100) / 100} %`;
const roundDA = (n) => Math.round(n / 10) * 10;                 // même arrondi que le serveur
const applyPct = (base, pct) => roundDA(base * (1 - pct / 100));
function fmtDate(iso) { const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; }
function normalizeText(s) { return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
function promoState(p, today) {
  if (!p.active) return ['off', 'Désactivée'];
  if (p.starts_on && p.starts_on.slice(0, 10) > today) return ['plan', 'Programmée'];
  if (p.ends_on && p.ends_on.slice(0, 10) < today) return ['exp', 'Expirée'];
  return ['run', 'En cours'];
}
function bestPromo(serviceId) {
  return data.promotions
    .filter((p) => promoState(p, data.today)[0] === 'run' && (p.service_id === null || p.service_id === serviceId))
    .sort((a, b) => b.percent - a.percent)[0] || null;
}
// </helpers>

/* ========================= Session & API ========================= */
function getAdmin() {
  for (const k of ['verifcar_admin_user', 'verifcar_user']) {
    try { const s = JSON.parse(localStorage.getItem(k) || 'null'); if (s && String(s.role || '').toUpperCase() === 'ADMIN') return s; } catch (e) { /* */ }
  }
  return null;
}
function redirectToLogin(msg) {
  if (redirecting) return; redirecting = true;
  if (msg) alert(msg);
  window.location.href = '../Auth/index.html';
}
async function api(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  if (res.status === 401) { redirectToLogin('Session expirée. Veuillez vous reconnecter.'); throw new Error('401'); }
  let body = null; try { body = await res.json(); } catch (e) { /* */ }
  if (!res.ok) throw new Error((body && body.message) || `Erreur ${res.status}`);
  return body;
}
function toast(msg, ok = true) {
  const el = $('toast');
  el.classList.toggle('text-bg-dark', ok); el.classList.toggle('text-bg-danger', !ok);
  $('toast-body').textContent = msg;
  bootstrap.Toast.getOrCreateInstance(el, { delay: 2600 }).show();
}

/* ========================= Chargement ========================= */
async function loadAll() {
  try {
    data = await api('/admin/pricing');
    $('load-error').classList.add('d-none');
    renderServices(); renderPromos(); renderLoyalty();
    await loadClients();
  } catch (e) {
    if (e.message === '401') return;
    const box = $('load-error');
    box.innerHTML = `Impossible de charger les tarifs : ${escapeHtml(e.message)}.<br><small>Vérifiez que le script <b>sql/phase_pricing.sql</b> a été exécuté sur la base et que le serveur est à jour.</small>`;
    box.classList.remove('d-none');
  }
}
async function loadClients() {
  const r = await api(`/admin/pricing/loyal-clients?q=${encodeURIComponent(clientSearch)}`);
  clients = r.clients || [];
  renderClients();
}

/* ========================= 1. Prix ========================= */
function renderServices() {
  $('services-body').innerHTML = data.services.map((s) => `
    <tr data-id="${escapeHtml(s.id)}">
      <td>
        <input class="form-control form-control-sm lbl-input mb-1" data-f="label_fr" value="${escapeHtml(s.label_fr)}" placeholder="Français">
        <div class="d-flex gap-1">
          <input class="form-control form-control-sm lbl-input" dir="rtl" data-f="label_ar" value="${escapeHtml(s.label_ar)}" placeholder="العربية">
          <input class="form-control form-control-sm lbl-input" data-f="label_en" value="${escapeHtml(s.label_en)}" placeholder="English">
        </div>
      </td>
      <td><input type="number" min="0" step="100" class="form-control form-control-sm price-input" data-f="base_price" value="${s.base_price ?? ''}" placeholder="sur devis"></td>
      <td data-cell="promo"></td>
      <td data-cell="final"></td>
      <td class="text-center"><div class="form-check form-switch d-inline-block"><input class="form-check-input" type="checkbox" data-f="active" ${s.active ? 'checked' : ''}></div></td>
      <td class="text-end"><button class="btn btn-sm btn-primary" data-save-service><i class="bi bi-check2"></i> Enregistrer</button></td>
    </tr>`).join('');
  data.services.forEach((s) => updateServiceRow(s.id));
}
function updateServiceRow(id) {
  const tr = document.querySelector(`#services-body tr[data-id="${CSS.escape(id)}"]`);
  if (!tr) return;
  const raw = tr.querySelector('[data-f="base_price"]').value;
  const base = raw === '' ? null : Number(raw);
  const promo = bestPromo(id);
  tr.querySelector('[data-cell="promo"]').innerHTML = promo
    ? `<span class="pill pill-run">−${fmtPct(promo.percent)}</span><div class="fs-12 text-muted">${escapeHtml(promo.label)}${promo.ends_on ? ` · jusqu'au ${fmtDate(promo.ends_on)}` : ''}</div>`
    : '<span class="text-muted fs-12">—</span>';
  tr.querySelector('[data-cell="final"]').innerHTML = base === null
    ? '<span class="text-muted fs-12">Sur devis (non réservable)</span>'
    : promo ? `<span class="final-price">${fmtDA(applyPct(base, promo.percent))}<s>${fmtDA(base)}</s></span>` : `<span class="final-price">${fmtDA(base)}</span>`;
}
async function saveService(tr) {
  const id = tr.dataset.id;
  const get = (f) => tr.querySelector(`[data-f="${f}"]`);
  const body = {
    label_fr: get('label_fr').value, label_ar: get('label_ar').value, label_en: get('label_en').value,
    base_price: get('base_price').value === '' ? null : Number(get('base_price').value),
    active: get('active').checked
  };
  const btn = tr.querySelector('[data-save-service]'); btn.disabled = true;
  try {
    await api(`/admin/pricing/services/${encodeURIComponent(id)}`, { method: 'PUT', body: JSON.stringify(body) });
    Object.assign(data.services.find((s) => s.id === id), body);
    tr.classList.remove('row-dirty');
    toast('Prestation enregistrée ✓');
  } catch (e) { if (e.message !== '401') toast(e.message, false); }
  finally { btn.disabled = false; }
}

/* ========================= 2. Promotions ========================= */
function serviceLabel(id) { return id === null ? 'Toutes les prestations' : (data.services.find((s) => s.id === id)?.label_fr || id); }
function renderPromos() {
  const body = $('promos-body');
  if (!data.promotions.length) { body.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Aucune promotion</td></tr>'; return; }
  body.innerHTML = data.promotions.map((p) => {
    const [k, label] = promoState(p, data.today);
    const period = p.starts_on || p.ends_on
      ? `${p.starts_on ? 'du ' + fmtDate(p.starts_on) : 'dès maintenant'} ${p.ends_on ? 'au ' + fmtDate(p.ends_on) : '· sans fin'}`
      : 'Sans limite';
    return `<tr>
      <td class="fw-semibold">${escapeHtml(p.label)}</td>
      <td>${escapeHtml(serviceLabel(p.service_id))}</td>
      <td><span class="fw-bold text-danger">−${fmtPct(p.percent)}</span></td>
      <td class="fs-13">${period}</td>
      <td><span class="pill pill-${k}">${label}</span></td>
      <td class="text-end text-nowrap">
        <button class="btn btn-sm btn-light border" title="${p.active ? 'Désactiver' : 'Activer'}" data-toggle-promo="${p.id}"><i class="bi ${p.active ? 'bi-pause-fill' : 'bi-play-fill'}"></i></button>
        <button class="btn btn-sm btn-light border" title="Modifier" data-edit-promo="${p.id}"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-light border text-danger" title="Supprimer" data-del-promo="${p.id}"><i class="bi bi-trash"></i></button>
      </td></tr>`;
  }).join('');
}
function openPromo(p) {
  $('promo-modal-title').textContent = p ? 'Modifier la promotion' : 'Nouvelle promotion';
  $('p-id').value = p ? p.id : '';
  $('p-label').value = p ? p.label : '';
  $('p-service').innerHTML = '<option value="">Toutes les prestations</option>' +
    data.services.map((s) => `<option value="${escapeHtml(s.id)}">${escapeHtml(s.label_fr)}</option>`).join('');
  $('p-service').value = p ? (p.service_id || '') : 'complete';
  $('p-percent').value = p ? p.percent : '';
  $('p-start').value = p && p.starts_on ? p.starts_on.slice(0, 10) : '';
  $('p-end').value = p && p.ends_on ? p.ends_on.slice(0, 10) : '';
  $('p-active').checked = p ? !!p.active : true;
  $('p-error').classList.add('d-none');
  updatePromoPreview();
  bootstrap.Modal.getOrCreateInstance($('promoModal')).show();
}
function promoFormBody() {
  return {
    label: $('p-label').value.trim(), service_id: $('p-service').value || null, percent: Number($('p-percent').value),
    starts_on: $('p-start').value || null, ends_on: $('p-end').value || null, active: $('p-active').checked
  };
}
function updatePromoPreview() {
  const b = promoFormBody();
  const el = $('p-preview');
  const targets = b.service_id ? data.services.filter((s) => s.id === b.service_id) : data.services;
  const lines = targets.filter((s) => s.base_price !== null && s.base_price !== undefined && b.percent > 0)
    .map((s) => `${escapeHtml(s.label_fr)} : <b>${fmtDA(applyPct(Number(s.base_price), b.percent))}</b> au lieu de ${fmtDA(s.base_price)}`);
  el.innerHTML = lines.length ? `<i class="bi bi-eye me-1"></i> Aperçu sur le site :<br>${lines.join('<br>')}` : '<span class="text-muted">Saisissez une remise pour voir l\'aperçu.</span>';
}
async function savePromo(e) {
  e.preventDefault();
  const b = promoFormBody(), id = $('p-id').value;
  const err = (m) => { $('p-error').textContent = m; $('p-error').classList.remove('d-none'); };
  if (b.label.length < 2) return err('Le nom est obligatoire.');
  if (!(b.percent > 0 && b.percent <= 90)) return err('La remise doit être comprise entre 1 et 90 %.');
  if (b.starts_on && b.ends_on && b.ends_on < b.starts_on) return err('La date de fin est avant la date de début.');
  const btn = $('p-save'); btn.disabled = true;
  try {
    await api(id ? `/admin/pricing/promotions/${id}` : '/admin/pricing/promotions', { method: id ? 'PUT' : 'POST', body: JSON.stringify(b) });
    bootstrap.Modal.getOrCreateInstance($('promoModal')).hide();
    toast(id ? 'Promotion modifiée ✓' : 'Promotion créée ✓');
    await loadAll();
  } catch (ex) { if (ex.message !== '401') err(ex.message); }
  finally { btn.disabled = false; }
}
async function togglePromo(id) {
  const p = data.promotions.find((x) => x.id === id); if (!p) return;
  try {
    await api(`/admin/pricing/promotions/${id}`, { method: 'PUT', body: JSON.stringify({ ...p, active: !p.active, starts_on: p.starts_on ? p.starts_on.slice(0, 10) : null, ends_on: p.ends_on ? p.ends_on.slice(0, 10) : null }) });
    toast(p.active ? 'Promotion désactivée' : 'Promotion activée ✓');
    await loadAll();
  } catch (e) { if (e.message !== '401') toast(e.message, false); }
}
async function deletePromo(id) {
  const p = data.promotions.find((x) => x.id === id);
  if (!p || !confirm(`Supprimer définitivement la promotion « ${p.label} » ?`)) return;
  try { await api(`/admin/pricing/promotions/${id}`, { method: 'DELETE' }); toast('Promotion supprimée'); await loadAll(); }
  catch (e) { if (e.message !== '401') toast(e.message, false); }
}

/* ========================= 3. Fidélité ========================= */
function renderLoyalty() {
  $('loy-enabled').checked = !!data.loyalty.enabled;
  $('loy-min').value = data.loyalty.min_completed;
  $('loy-pct').value = data.loyalty.percent;
  updateLoyaltyPreview();
}
function updateLoyaltyPreview() {
  const on = $('loy-enabled').checked, n = Number($('loy-min').value), pct = Number($('loy-pct').value);
  const svc = data.services.find((s) => s.base_price !== null && s.base_price !== undefined && !bestPromo(s.id)) || data.services.find((s) => s.base_price != null);
  let ex = '';
  if (svc && pct > 0) {
    const promo = bestPromo(svc.id);
    const best = promo && promo.percent >= pct ? `la promotion (−${fmtPct(promo.percent)}) reste appliquée car elle est plus avantageuse` : `il paie <b>${fmtDA(applyPct(Number(svc.base_price), pct))}</b> au lieu de ${fmtDA(svc.base_price)}`;
    ex = `<br>Exemple — ${escapeHtml(svc.label_fr)} : ${best}.`;
  }
  $('loy-preview').innerHTML = on
    ? `<i class="bi bi-info-circle me-1"></i> Un client ayant <b>${n || '?'} inspection(s) terminée(s)</b> obtient automatiquement <b>−${fmtPct(pct || 0)}</b> (reconnu par son numéro de téléphone lors de la réservation en ligne).${ex}`
    : '<i class="bi bi-pause-circle me-1"></i> Règle automatique désactivée : seuls les clients avec une remise manuelle en bénéficient.';
}
async function saveLoyalty() {
  const body = { enabled: $('loy-enabled').checked, min_completed: Number($('loy-min').value), percent: Number($('loy-pct').value) };
  if (!(body.min_completed >= 1)) return toast('Nombre d\'inspections invalide.', false);
  if (!(body.percent > 0 && body.percent <= 90)) return toast('La remise doit être comprise entre 1 et 90 %.', false);
  try { await api('/admin/pricing/loyalty', { method: 'PUT', body: JSON.stringify(body) }); data.loyalty = body; toast('Règle de fidélité enregistrée ✓'); await loadClients(); }
  catch (e) { if (e.message !== '401') toast(e.message, false); }
}
const MODE = { AUTO: ['pill-auto', 'Automatique'], MANUAL: ['pill-manual', 'Manuel'], EXCLUDED: ['pill-excl', 'Exclu'], NONE: ['pill-none', '—'] };
function renderClients() {
  const list = clients.filter((c) => clientFilter === 'all' || (clientFilter === 'loyal' ? c.effective_percent > 0 : c.loyalty_percent !== null));
  $('clients-count').textContent = list.length;
  if (!list.length) { $('clients-body').innerHTML = '<tr><td colspan="6" class="text-center text-muted py-4">Aucun client</td></tr>'; return; }
  const need = Number(data.loyalty.min_completed) || 0;
  $('clients-body').innerHTML = list.map((c) => {
    const [cls, label] = MODE[c.mode] || MODE.NONE;
    const progress = data.loyalty.enabled && c.mode === 'NONE' && need > c.completed ? `<div class="fs-11 text-muted">encore ${need - c.completed} pour être fidèle</div>` : '';
    return `<tr data-client="${c.id}">
      <td class="fw-semibold">${escapeHtml(c.full_name || 'Client')}</td>
      <td>${escapeHtml(c.phone || '')}</td>
      <td class="text-center"><span class="badge bg-light text-dark border">${c.completed}</span>${progress}</td>
      <td>${c.effective_percent > 0 ? `<b class="text-success">−${fmtPct(c.effective_percent)}</b>` : '<span class="text-muted">—</span>'}</td>
      <td><span class="pill ${cls}">${label}</span></td>
      <td class="text-end text-nowrap">
        <div class="input-group input-group-sm d-inline-flex" style="width:190px">
          <input type="number" class="form-control" min="0" max="90" step="0.5" placeholder="%" value="${c.loyalty_percent ?? ''}" data-manual>
          <button class="btn btn-outline-primary" data-set-loyal title="Appliquer"><i class="bi bi-check2"></i></button>
          <button class="btn btn-outline-secondary" data-auto-loyal title="Revenir à la règle automatique">Auto</button>
        </div>
      </td></tr>`;
  }).join('');
}
async function setClientLoyalty(id, percent) {
  try {
    await api(`/admin/pricing/clients/${id}/loyalty`, { method: 'PUT', body: JSON.stringify({ percent }) });
    toast(percent === null ? 'Règle automatique rétablie ✓' : percent === 0 ? 'Client exclu de la fidélité' : `Remise de ${fmtPct(percent)} appliquée ✓`);
    await loadClients();
  } catch (e) { if (e.message !== '401') toast(e.message, false); }
}

/* ========================= Événements ========================= */
function setup() {
  const admin = getAdmin();
  if (!admin || !localStorage.getItem('token')) { redirectToLogin("Accès refusé : réservé à l'administrateur."); return false; }
  const name = admin.fullName || admin.full_name || 'Admin';
  $('admin-name').textContent = name; $('admin-avatar').textContent = name.charAt(0).toUpperCase();

  $('services-body').addEventListener('input', (e) => {
    const tr = e.target.closest('tr'); if (!tr) return;
    tr.classList.add('row-dirty');
    if (e.target.dataset.f === 'base_price') updateServiceRow(tr.dataset.id);
  });
  $('services-body').addEventListener('change', (e) => { const tr = e.target.closest('tr'); if (tr) tr.classList.add('row-dirty'); });
  $('services-body').addEventListener('click', (e) => { const b = e.target.closest('[data-save-service]'); if (b) saveService(b.closest('tr')); });

  $('new-promo-btn').addEventListener('click', () => openPromo(null));
  $('promos-body').addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.editPromo) openPromo(data.promotions.find((p) => p.id === Number(t.dataset.editPromo)));
    if (t.dataset.togglePromo) togglePromo(Number(t.dataset.togglePromo));
    if (t.dataset.delPromo) deletePromo(Number(t.dataset.delPromo));
  });
  $('promo-form').addEventListener('submit', savePromo);
  ['p-service', 'p-percent'].forEach((id) => $(id).addEventListener('input', updatePromoPreview));

  ['loy-enabled', 'loy-min', 'loy-pct'].forEach((id) => $(id).addEventListener('input', updateLoyaltyPreview));
  $('loy-save').addEventListener('click', saveLoyalty);

  let t = null;
  $('clients-search').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => { clientSearch = e.target.value.trim(); loadClients().catch(() => {}); }, 300); });
  $('clients-filter').addEventListener('change', (e) => { clientFilter = e.target.value; renderClients(); });
  $('clients-body').addEventListener('click', (e) => {
    const tr = e.target.closest('tr[data-client]'); if (!tr) return;
    const id = Number(tr.dataset.client);
    if (e.target.closest('[data-auto-loyal]')) return setClientLoyalty(id, null);
    if (e.target.closest('[data-set-loyal]')) {
      const v = tr.querySelector('[data-manual]').value;
      if (v === '') return setClientLoyalty(id, null);
      const n = Number(v);
      if (!(n >= 0 && n <= 90)) return toast('Remise invalide (0 à 90 %).', false);
      setClientLoyalty(id, n);
    }
  });

  $('logout-btn')?.addEventListener('click', () => {
    ['token', 'verifcar_reception_user', 'verifcar_user', 'verifcar_admin_user'].forEach((k) => localStorage.removeItem(k));
    window.location.href = '../Auth/index.html';
  });
  const sidebar = document.querySelector('.sidebar');
  let overlay = document.querySelector('.sidebar-overlay');
  if (!overlay) { overlay = document.createElement('div'); overlay.className = 'sidebar-overlay'; document.body.appendChild(overlay); }
  const close = () => { sidebar?.classList.remove('show'); overlay.classList.remove('show'); };
  $('mobile-sidebar-toggle')?.addEventListener('click', () => { sidebar?.classList.add('show'); overlay.classList.add('show'); });
  $('sidebar-close-btn')?.addEventListener('click', close);
  overlay.addEventListener('click', close);
  return true;
}

document.addEventListener('DOMContentLoaded', () => { if (setup()) loadAll(); });
