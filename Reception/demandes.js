/* =====================================================================
   Réception — demandes de réservation en ligne (demandes.html)
   Validation du reçu BaridiMob → création du RDV, ou refus motivé.
   API : /api/admin/online-bookings (ADMIN + RECEPTION)
   ===================================================================== */
const API_URL = 'https://romantic-enjoyment-production-f458.up.railway.app/api';
const POLL_MS = 60000;
const REST_DAYS = [4, 5];            // jeudi, vendredi
const OPEN_TIME = '09:00';
const CLOSE_TIME = '17:00';

let allRequests = [];
let currentTab = 'PENDING_REVIEW';
let searchTerm = '';
let current = null;                  // demande ouverte dans la modale
let receiptUrl = null;               // objectURL du reçu (à libérer)
let busy = false;
let redirecting = false;
let lastLoadedAt = 0;
// Même fichier pour Reception/ et Admin/ : dans Admin/, seul le rôle ADMIN est accepté
const IS_ADMIN_AREA = /\/admin\//i.test(location.pathname);
const ALLOWED_ROLES = IS_ADMIN_AREA ? ['ADMIN'] : ['ADMIN', 'RECEPTION'];
const FICHE_URL = IS_ADMIN_AREA ? '../Reception/prise.de.rendez-vous.html' : 'prise.de.rendez-vous.html';

// <helpers>
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
function normalizeText(s) { return String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); }
const pad2 = (n) => String(n).padStart(2, '0');
function parseLocal(dateStr) {
  if (!dateStr) return null;
  const p = String(dateStr).split(/[- :T]/).map((x) => parseInt(x, 10));
  if (p.length < 5 || p.slice(0, 5).some(Number.isNaN)) return null;
  return new Date(p[0], p[1] - 1, p[2], p[3], p[4], 0);
}
const fmtDate = (d) => d ? `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}` : '--/--/----';
const fmtTime = (d) => d ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : '--:--';
const fmtLong = (d) => d ? d.toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
const fmtMoney = (n) => `${Number(n || 0).toLocaleString('fr-FR')} DZD`;
function waNumber(phone) {
  let d = String(phone ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('00')) d = d.slice(2); else if (d.startsWith('0')) d = '213' + d.slice(1);
  return d.length >= 11 ? d : null;
}
const STATUS = {
  PENDING_REVIEW: ['À vérifier', 'bg-warning-subtle text-warning-emphasis'],
  ACCEPTED: ['Validée', 'bg-success-subtle text-success'],
  REJECTED: ['Refusée', 'bg-danger-subtle text-danger']
};
const LANG_LABEL = { fr: 'Français', ar: 'العربية', en: 'English' };

// Messages WhatsApp pré-remplis, dans la langue choisie par le client sur le site
function waMessage(req, kind, extra = {}) {
  const d = parseLocal(extra.date || req.appointment_date);
  const date = fmtDate(d), time = fmtTime(d), ref = req.reference, name = req.full_name;
  const T = {
    fr: {
      accepted: `Bonjour ${name},\nVotre paiement a bien été vérifié ✅\nVotre rendez-vous VérifCar est confirmé le ${date} à ${time}.\nRéférence : ${ref}\nMerci de vous présenter 10 minutes avant avec la carte grise.\nVERIFCAR — Oran`,
      rejected: `Bonjour ${name},\nNous n'avons pas pu valider votre demande de réservation ${ref}.\nMotif : ${extra.reason || ''}\nContactez-nous pour régulariser votre réservation.\nVERIFCAR — Oran`,
      pending: `Bonjour ${name}, nous avons bien reçu votre demande ${ref}. Nous vérifions votre paiement.`
    },
    ar: {
      accepted: `مرحباً ${name}،\nتم التحقق من الدفع ✅\nموعدك في VérifCar مؤكد يوم ${date} على الساعة ${time}.\nالمرجع: ${ref}\nيرجى الحضور قبل الموعد بـ 10 دقائق مع البطاقة الرمادية.\nVERIFCAR — وهران`,
      rejected: `مرحباً ${name}،\nلم نتمكن من تأكيد طلب الحجز ${ref}.\nالسبب: ${extra.reason || ''}\nيرجى التواصل معنا لتسوية حجزك.\nVERIFCAR — وهران`,
      pending: `مرحباً ${name}، استلمنا طلبك ${ref} ونحن بصدد التحقق من الدفع.`
    },
    en: {
      accepted: `Hello ${name},\nYour payment has been verified ✅\nYour VérifCar appointment is confirmed on ${date} at ${time}.\nReference: ${ref}\nPlease arrive 10 minutes early with your registration card.\nVERIFCAR — Oran`,
      rejected: `Hello ${name},\nWe could not confirm your booking request ${ref}.\nReason: ${extra.reason || ''}\nPlease contact us to sort out your booking.\nVERIFCAR — Oran`,
      pending: `Hello ${name}, we have received your request ${ref}. We are verifying your payment.`
    }
  };
  return (T[req.lang] || T.fr)[kind];
}
function scheduleWarnings(dateStr, timeStr) {
  const w = [];
  if (!dateStr || !timeStr) return w;
  const d = new Date(`${dateStr}T${timeStr}:00`);
  if (isNaN(d)) return w;
  if (REST_DAYS.includes(d.getDay())) w.push('Jour de repos de l\'atelier (jeudi / vendredi).');
  if (timeStr < OPEN_TIME || timeStr > CLOSE_TIME) w.push(`Hors horaires (${OPEN_TIME} – ${CLOSE_TIME}).`);
  return w;
}
// </helpers>

/* ========================= Session ========================= */
const $ = (id) => document.getElementById(id);
const getAuthToken = () => localStorage.getItem('token') || '';
function getSession() {
  const keys = IS_ADMIN_AREA ? ['verifcar_admin_user', 'verifcar_user'] : ['verifcar_reception_user', 'verifcar_user', 'verifcar_admin_user'];
  for (const key of keys) {
    try {
      const s = JSON.parse(localStorage.getItem(key) || 'null');
      if (s && ALLOWED_ROLES.includes(String(s.role || '').toUpperCase())) return s;
    } catch (e) { /* session corrompue */ }
  }
  return null;
}
function redirectToLogin(message) {
  if (redirecting) return;
  redirecting = true;
  if (message) alert(message);
  window.location.href = '../Auth/index.html';
}
function checkAuth() {
  const s = getSession();
  if (!s || !getAuthToken()) { redirectToLogin('Accès non autorisé.'); return false; }
  const name = s.fullName || s.full_name || (IS_ADMIN_AREA ? 'Admin' : 'Réception');
  if ($('admin-name')) $('admin-name').textContent = name;
  ['admin-avatar', 'mobile-avatar'].forEach((id) => { if ($(id)) $(id).textContent = name.charAt(0).toUpperCase(); });
  return true;
}
async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Authorization': `Bearer ${getAuthToken()}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  if (res.status === 401) { redirectToLogin('Session expirée. Veuillez vous reconnecter.'); throw new Error('401'); }
  let body = null;
  try { body = await res.json(); } catch (e) { /* vide */ }
  return { res, body };
}

/* ========================= Données ========================= */
async function loadRequests() {
  try {
    const { res, body } = await apiFetch('/admin/online-bookings?status=ALL');
    if (res.status === 403) { showError('Accès refusé : réservé à la réception et à l\'administrateur.'); return; }
    if (!res.ok || !Array.isArray(body)) { showError(`Impossible de charger les demandes (erreur ${res.status}).`); return; }
    allRequests = body;
    lastLoadedAt = Date.now();
    $('load-error')?.classList.add('d-none');
    render();
    const now = new Date();
    $('last-updated').textContent = `Mis à jour à ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
    window.dispatchEvent(new Event('online-bookings:changed'));
  } catch (e) {
    if (e.message !== '401') showError('Connexion au serveur impossible.');
  }
}
function showError(msg) { const b = $('load-error'); if (b) { b.textContent = msg; b.classList.remove('d-none'); } }

/* ========================= Tableau ========================= */
function matches(r) {
  if (currentTab !== 'ALL' && r.status !== currentTab) return false;
  if (!searchTerm) return true;
  return normalizeText([r.reference, r.full_name, r.phone, r.vehicle, r.vin, r.plate, r.transaction_ref, r.service_label].join(' ')).includes(searchTerm);
}

function render() {
  ['PENDING_REVIEW', 'ACCEPTED', 'REJECTED'].forEach((s) => { $(`count-${s}`).textContent = allRequests.filter((r) => r.status === s).length; });
  $('count-ALL').textContent = allRequests.length;

  const tbody = $('req-table-body');
  const list = allRequests.filter(matches).sort((a, b) => {
    // À vérifier : le plus proche RDV en premier ; sinon : plus récent en premier
    if (currentTab === 'PENDING_REVIEW') return String(a.appointment_date).localeCompare(String(b.appointment_date));
    return String(b.created_at).localeCompare(String(a.created_at));
  });

  if (!list.length) {
    const empty = currentTab === 'PENDING_REVIEW' && !searchTerm ? 'Aucune demande en attente de vérification 🎉' : 'Aucune demande trouvée';
    tbody.innerHTML = `<tr><td colspan="8" class="text-center text-muted py-4"><i class="bi bi-inbox fs-3 d-block mb-2"></i>${empty}</td></tr>`;
    return;
  }

  tbody.innerHTML = list.map((r) => {
    const id = Number(r.id);
    const d = parseLocal(r.appointment_date);
    const [label, cls] = STATUS[r.status] || ['-', 'bg-light text-dark'];
    const past = d && d < new Date() && r.status === 'PENDING_REVIEW';
    return `
      <tr class="req-row ${r.status === 'PENDING_REVIEW' ? 'is-new' : ''}" data-id="${id}">
        <td><div class="fw-bold text-primary">${escapeHtml(r.reference)}</div><small class="text-muted">${escapeHtml(fmtDate(parseLocal(r.created_at)))} ${escapeHtml(fmtTime(parseLocal(r.created_at)))}</small></td>
        <td><div class="fw-bold text-dark">${escapeHtml(r.full_name)}</div><small class="text-muted">${escapeHtml(r.phone)}</small></td>
        <td><div class="fw-semibold">${escapeHtml(r.vehicle)}</div><small class="text-muted vin">${escapeHtml(r.vin || '')}</small></td>
        <td><div>${fmtDate(d)}</div><small class="${past ? 'text-danger fw-semibold' : 'text-muted'}"><i class="bi bi-clock me-1"></i>${fmtTime(d)}${past ? ' · dépassé' : ''}</small></td>
        <td><span class="badge bg-light text-dark border">${escapeHtml(r.service_label)}</span>${r.amount_due != null ? `<div class="fs-12 fw-semibold mt-1">${fmtMoney(r.amount_due)}${Number(r.discount_percent) > 0 ? ` <span class="text-danger">−${Number(r.discount_percent)}%</span>` : ''}</div>` : ''}</td>
        <td class="vin">${escapeHtml(r.transaction_ref)}</td>
        <td><span class="badge ${cls}">${label}</span>${r.status === 'REJECTED' && r.reject_reason ? `<div class="fs-11 text-muted mt-1">${escapeHtml(r.reject_reason)}</div>` : ''}</td>
        <td class="text-end"><button class="btn btn-sm ${r.status === 'PENDING_REVIEW' ? 'btn-primary' : 'btn-outline-secondary'}" data-open="${id}">
          ${r.status === 'PENDING_REVIEW' ? '<i class="bi bi-shield-check me-1"></i> Vérifier' : '<i class="bi bi-eye me-1"></i> Voir'}</button></td>
      </tr>`;
  }).join('');
}

/* ========================= Modale ========================= */
function setText(id, v, fallback = '-') { const el = $(id); if (el) el.textContent = (v !== undefined && v !== null && v !== '') ? v : fallback; }

async function loadReceipt(id) {
  const box = $('m-receipt');
  const openBtn = $('m-receipt-open');
  if (receiptUrl) { URL.revokeObjectURL(receiptUrl); receiptUrl = null; }
  box.innerHTML = '<span class="text-muted small"><span class="spinner-border spinner-border-sm me-2"></span>Chargement du reçu...</span>';
  openBtn.classList.add('d-none');
  try {
    const res = await fetch(`${API_URL}/admin/online-bookings/${id}/receipt`, { headers: { 'Authorization': `Bearer ${getAuthToken()}` } });
    if (!res.ok) { box.innerHTML = `<span class="text-danger small">Reçu indisponible (erreur ${res.status}).</span>`; return; }
    const blob = await res.blob();
    if (!current || Number(current.id) !== Number(id)) return;   // la modale a changé entre-temps
    receiptUrl = URL.createObjectURL(blob);
    if (blob.type === 'application/pdf') {
      box.innerHTML = '';
      const frame = document.createElement('iframe');
      frame.src = receiptUrl; frame.title = 'Reçu PDF';
      box.appendChild(frame);
    } else {
      box.innerHTML = '';
      const img = document.createElement('img');
      img.src = receiptUrl; img.alt = 'Reçu de paiement';
      img.addEventListener('click', () => window.open(receiptUrl, '_blank'));
      box.appendChild(img);
    }
    openBtn.href = receiptUrl;
    openBtn.classList.remove('d-none');
  } catch (e) {
    box.innerHTML = '<span class="text-danger small">Connexion au serveur impossible.</span>';
  }
}

function openRequest(id) {
  const r = allRequests.find((x) => Number(x.id) === Number(id));
  if (!r) return;
  current = r;
  const d = parseLocal(r.appointment_date);
  const [label, cls] = STATUS[r.status] || ['-', ''];

  setText('m-ref', r.reference);
  const st = $('m-status'); st.className = `badge ms-2 ${cls}`; st.textContent = label;
  setText('m-name', r.full_name);
  setText('m-phone', r.phone);
  setText('m-vehicle', r.vehicle);
  setText('m-plate', r.plate, 'Non renseignée');
  setText('m-vin', r.vin, 'Non renseigné');
  setText('m-service', r.service_label);
  setText('m-lang', LANG_LABEL[r.lang] || r.lang);
  setText('m-date', fmtLong(d));
  setText('m-created', fmtLong(parseLocal(r.created_at)));
  setText('m-tx', r.transaction_ref);
  setText('m-message', r.message, 'Aucune');
  const due = r.amount_due !== null && r.amount_due !== undefined ? Number(r.amount_due) : null;
  const disc = Number(r.discount_percent) > 0
    ? ` — remise ${Number(r.discount_percent)} % (${r.discount_source === 'LOYALTY' ? 'client fidèle' : (r.discount_label || 'promotion')}), prix de base ${fmtMoney(r.base_price)}`
    : '';
  setText('m-amount', due !== null ? `${fmtMoney(due)}${disc}` : 'Non calculé (réservation antérieure aux tarifs)');

  const pending = r.status === 'PENDING_REVIEW';
  $('m-decision').classList.toggle('d-none', !pending);
  const result = $('m-result');
  result.classList.toggle('d-none', pending);
  if (!pending) {
    const when = r.reviewed_at ? fmtLong(parseLocal(r.reviewed_at)) : '';
    const who = r.reviewed_by_name ? ` par ${escapeHtml(r.reviewed_by_name)}` : '';
    result.className = `alert mb-3 ${r.status === 'ACCEPTED' ? 'alert-success' : 'alert-danger'}`;
    result.innerHTML = r.status === 'ACCEPTED'
      ? `<i class="bi bi-check-circle me-1"></i> Validée${who}${when ? ` le ${escapeHtml(when)}` : ''}. Rendez-vous <b>#RDV-${Number(r.appointment_id) || '?'}</b> créé.`
      : `<i class="bi bi-x-circle me-1"></i> Refusée${who}${when ? ` le ${escapeHtml(when)}` : ''}.<br><b>Motif :</b> ${escapeHtml(r.reject_reason || '-')}`;
  }

  // formulaire de validation
  if (d) { $('a-date').value = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; $('a-time').value = fmtTime(d); }
  $('a-total').value = due ?? ''; $('a-versement').value = due ?? '';   // paiement intégral attendu
  $('r-reason').value = '';
  ['a-error', 'r-error', 'a-warn'].forEach((x) => $(x).classList.add('d-none'));

  // contact
  const wa = waNumber(r.phone);
  $('m-call').href = `tel:${String(r.phone).replace(/[^\d+]/g, '')}`;
  const kind = r.status === 'ACCEPTED' ? 'accepted' : r.status === 'REJECTED' ? 'rejected' : 'pending';
  $('m-wa').classList.toggle('d-none', !wa);
  if (wa) $('m-wa').href = `https://wa.me/${wa}?text=${encodeURIComponent(waMessage(r, kind, { reason: r.reject_reason }))}`;
  const print = $('m-print');
  print.classList.toggle('d-none', !(r.status === 'ACCEPTED' && r.appointment_id));
  if (r.appointment_id) print.href = `${FICHE_URL}?id=${encodeURIComponent(r.appointment_id)}`;

  bootstrap.Modal.getOrCreateInstance($('reqModal')).show();
  loadReceipt(r.id);
}

function updateScheduleWarn() {
  const w = scheduleWarnings($('a-date').value, $('a-time').value);
  const el = $('a-warn');
  el.classList.toggle('d-none', !w.length);
  el.innerHTML = w.map((x) => `<i class="bi bi-exclamation-triangle me-1"></i>${escapeHtml(x)}`).join('<br>');
}

function setBusy(btn, on, text) {
  if (on) { btn.dataset.label = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${text}`; }
  else { btn.disabled = false; if (btn.dataset.label) btn.innerHTML = btn.dataset.label; }
}

async function acceptCurrent() {
  if (busy || !current) return;
  const err = $('a-error');
  const total = $('a-total').value === '' ? 0 : Number($('a-total').value);
  const versement = Number($('a-versement').value);
  const date = $('a-date').value, time = $('a-time').value;
  const show = (m) => { err.textContent = m; err.classList.remove('d-none'); };
  err.classList.add('d-none');

  if (!date || !time) return show('Veuillez indiquer la date et l\'heure du rendez-vous.');
  if ($('a-versement').value === '' || !Number.isFinite(versement) || versement <= 0) return show('Indiquez le montant reçu (visible sur le reçu).');
  if (!Number.isFinite(total) || total < 0) return show('Le prix total doit être un nombre positif.');
  if (total > 0 && versement > total) return show('Le montant reçu ne peut pas dépasser le prix total.');
  const w = scheduleWarnings(date, time);
  if (w.length && !confirm(`${w.join('\n')}\n\nValider quand même ?`)) return;
  if (!confirm(`Confirmer que le paiement de ${fmtMoney(versement)} (transaction ${current.transaction_ref}) a bien été reçu ?`)) return;

  const btn = $('accept-btn');
  busy = true; setBusy(btn, true, 'Validation...');
  try {
    const { res, body } = await apiFetch(`/admin/online-bookings/${current.id}/accept`, {
      method: 'PUT',
      body: JSON.stringify({ totalAmount: total, versement, appointmentDate: `${date} ${time}` })
    });
    if (!res.ok) return show((body && body.message) || `Erreur ${res.status}.`);
    const req = current;
    await loadRequests();
    openRequest(req.id);   // réaffiche la demande avec son résultat + boutons WhatsApp / fiche
    const wa = waNumber(req.phone);
    if (wa && confirm('Rendez-vous créé ✅\n\nEnvoyer la confirmation au client sur WhatsApp ?')) {
      window.open(`https://wa.me/${wa}?text=${encodeURIComponent(waMessage(req, 'accepted', { date: `${date} ${time}` }))}`, '_blank', 'noopener');
    }
  } catch (e) {
    if (e.message !== '401') show('Connexion au serveur impossible.');
  } finally {
    busy = false; setBusy(btn, false);
  }
}

async function rejectCurrent() {
  if (busy || !current) return;
  const err = $('r-error');
  const reason = $('r-reason').value.trim();
  err.classList.add('d-none');
  if (reason.length < 3) { err.textContent = 'Veuillez indiquer le motif du refus.'; err.classList.remove('d-none'); return; }
  if (!confirm(`Refuser la demande ${current.reference} ?\nMotif : ${reason}`)) return;

  const btn = $('reject-btn');
  busy = true; setBusy(btn, true, 'Refus...');
  try {
    const { res, body } = await apiFetch(`/admin/online-bookings/${current.id}/reject`, { method: 'PUT', body: JSON.stringify({ reason }) });
    if (!res.ok) { err.textContent = (body && body.message) || `Erreur ${res.status}.`; err.classList.remove('d-none'); return; }
    const req = current;
    await loadRequests();
    openRequest(req.id);
    const wa = waNumber(req.phone);
    if (wa && confirm('Demande refusée.\n\nPrévenir le client sur WhatsApp ?')) {
      window.open(`https://wa.me/${wa}?text=${encodeURIComponent(waMessage(req, 'rejected', { reason }))}`, '_blank', 'noopener');
    }
  } catch (e) {
    if (e.message !== '401') { err.textContent = 'Connexion au serveur impossible.'; err.classList.remove('d-none'); }
  } finally {
    busy = false; setBusy(btn, false);
  }
}

/* ========================= Événements ========================= */
function setup() {
  $('logout-btn')?.addEventListener('click', () => {
    ['token', 'verifcar_reception_user', 'verifcar_user', 'verifcar_admin_user'].forEach((k) => localStorage.removeItem(k));
    window.location.href = '../Auth/index.html';
  });
  $('refresh-btn')?.addEventListener('click', loadRequests);
  document.querySelectorAll('#status-tabs .tab-pill').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('#status-tabs .tab-pill').forEach((x) => x.classList.toggle('active', x === b));
    currentTab = b.dataset.status;
    render();
  }));
  $('search-input')?.addEventListener('input', (e) => { searchTerm = normalizeText(e.target.value.trim()); render(); });
  $('req-table-body')?.addEventListener('click', (e) => {
    const row = e.target.closest('[data-open], .req-row');
    if (row) openRequest(row.dataset.open || row.dataset.id);
  });
  $('accept-btn')?.addEventListener('click', acceptCurrent);
  $('reject-btn')?.addEventListener('click', rejectCurrent);
  $('a-date')?.addEventListener('change', updateScheduleWarn);
  $('a-time')?.addEventListener('change', updateScheduleWarn);
  document.querySelectorAll('#reject-reasons [data-reason]').forEach((b) => b.addEventListener('click', () => { $('r-reason').value = b.dataset.reason; }));
  $('m-tx-copy')?.addEventListener('click', () => { navigator.clipboard?.writeText(current?.transaction_ref || ''); });
  $('reqModal')?.addEventListener('hidden.bs.modal', () => {
    if (receiptUrl) { URL.revokeObjectURL(receiptUrl); receiptUrl = null; }
    $('m-receipt').innerHTML = '';
    current = null;
  });

  // barre latérale mobile
  const sidebar = document.querySelector('.sidebar');
  let overlay = document.querySelector('.sidebar-overlay');
  if (!overlay) { overlay = document.createElement('div'); overlay.className = 'sidebar-overlay'; document.body.appendChild(overlay); }
  const close = () => { sidebar?.classList.remove('show'); overlay?.classList.remove('show'); };
  const open = () => { sidebar?.classList.add('show'); overlay?.classList.add('show'); };
  $('sidebar-toggle-btn')?.addEventListener('click', open);
  $('mobile-sidebar-toggle')?.addEventListener('click', open);
  $('sidebar-close-btn')?.addEventListener('click', close);
  overlay?.addEventListener('click', close);

  // rafraîchissement auto (sauf si une modale est ouverte)
  setInterval(() => {
    if (document.visibilityState === 'visible' && !document.querySelector('.modal.show')) loadRequests();
  }, POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastLoadedAt > 20000 && !document.querySelector('.modal.show')) loadRequests();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth()) return;
  setup();
  loadRequests().then(() => {
    // lien direct : demandes.html?ref=VC-...
    const ref = new URLSearchParams(location.search).get('ref');
    const r = ref && allRequests.find((x) => x.reference === ref);
    if (r) openRequest(r.id);
  });
});
