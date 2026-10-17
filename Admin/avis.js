/* =====================================================================
   Admin — Avis clients (avis.html)
   API : GET /api/admin/reviews?status=… , PUT /api/admin/reviews/:id  (ADMIN)
   ===================================================================== */
const API_URL = 'https://romantic-enjoyment-production-f458.up.railway.app/api';

let current = 'PENDING';
let redirecting = false;
const $ = (id) => document.getElementById(id);
function escapeHtml(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
function fmtDate(v) { const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/); return m ? `${m[3]}/${m[2]}/${m[1]}${m[4] ? ' ' + m[4] + ':' + m[5] : ''}` : ''; }
const stars = (n) => `<span class="stars">${'★'.repeat(n)}<span class="off">${'★'.repeat(5 - n)}</span></span>`;
const LANG = { fr: 'FR', ar: 'ع', en: 'EN' };
const STATUS = { PENDING: 'En attente', APPROVED: 'Publié', REJECTED: 'Refusé', INVITED: 'Invitation envoyée' };

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
async function load() {
  $('list').innerHTML = '<div class="text-center text-muted py-5">Chargement...</div>';
  try {
    const [r, pub] = await Promise.all([
      api(`/admin/reviews?status=${current}`),
      fetch(`${API_URL}/public/reviews`).then((x) => x.json()).catch(() => null)
    ]);
    $('load-error').classList.add('d-none');
    Object.entries(r.counts || {}).forEach(([k, v]) => { const b = $(`b-${k}`); if (b) b.textContent = v; });
    $('st-pending').textContent = r.counts?.PENDING || 0;
    $('st-approved').textContent = r.counts?.APPROVED || 0;
    $('st-invited').textContent = r.counts?.INVITED || 0;
    $('st-avg').innerHTML = pub && pub.average ? `${pub.average} / 5 ${stars(Math.round(pub.average))}` : '--';
    render(r.reviews || []);
  } catch (e) {
    if (e.message === '401') return;
    $('list').innerHTML = '';
    const box = $('load-error');
    box.innerHTML = `Impossible de charger les avis : ${escapeHtml(e.message)}.<br><small>Vérifiez que le serveur est à jour (fichier reviews/reviews.controller.js).</small>`;
    box.classList.remove('d-none');
  }
}

function render(list) {
  if (!list.length) {
    const empty = { PENDING: 'Aucun avis en attente.', APPROVED: 'Aucun avis publié pour le moment.', REJECTED: 'Aucun avis refusé.', INVITED: 'Aucune invitation en attente de réponse.' };
    $('list').innerHTML = `<div class="text-center text-muted py-5"><i class="bi bi-chat-square-heart fs-2 d-block mb-2"></i>${empty[current]}</div>`;
    return;
  }
  $('list').innerHTML = list.map((r) => {
    const invited = r.status === 'INVITED';
    const actions = invited ? '' : `
      <div class="d-flex gap-2 flex-wrap">
        ${r.status !== 'APPROVED' ? `<button class="btn btn-success btn-sm" data-act="APPROVED" data-id="${r.id}"><i class="bi bi-check-lg me-1"></i>${r.status === 'REJECTED' ? 'Publier quand même' : 'Approuver et publier'}</button>` : ''}
        ${r.status !== 'REJECTED' ? `<button class="btn btn-outline-danger btn-sm" data-act="REJECTED" data-id="${r.id}"><i class="bi bi-x-lg me-1"></i>${r.status === 'APPROVED' ? 'Retirer du site' : 'Refuser'}</button>` : ''}
      </div>`;
    return `
      <div class="rev">
        <div class="d-flex justify-content-between align-items-start gap-2 flex-wrap">
          <div>
            ${invited ? '' : `${stars(Number(r.rating) || 0)} <b class="ms-2">${escapeHtml(r.author_name)}</b> <span class="badge bg-light text-dark border ms-1">${LANG[r.lang] || ''}</span>`}
            <div class="small text-muted mt-1">
              Client : ${escapeHtml(r.client_name || '-')} · ${escapeHtml(r.client_phone || '')} · ${escapeHtml(r.vehicle || '')}
              · Rapport <a href="../Reception/carrosserie-report.html?id=${encodeURIComponent(r.inspection_id)}" target="_blank" rel="noopener">REP-2026-${Number(r.inspection_id)}</a>
            </div>
          </div>
          <div class="text-end">
            <span class="pill pill-${r.status}">${STATUS[r.status] || r.status}</span>
            <div class="small text-muted mt-1">${invited ? 'Invité le ' + fmtDate(r.created_at) : 'Reçu le ' + fmtDate(r.submitted_at)}</div>
          </div>
        </div>
        ${invited ? '' : `<p class="rev-text" dir="auto">${escapeHtml(r.comment)}</p>`}
        ${r.moderated_at ? `<div class="small text-muted mb-2">${r.status === 'APPROVED' ? 'Publié' : 'Traité'} le ${fmtDate(r.moderated_at)}${r.moderated_by_name ? ' par ' + escapeHtml(r.moderated_by_name) : ''}</div>` : ''}
        ${actions}
      </div>`;
  }).join('');
}

async function moderate(id, status, btn) {
  if (status === 'REJECTED' && !confirm('Refuser / retirer cet avis du site ?')) return;
  btn.disabled = true;
  try {
    await api(`/admin/reviews/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
    toast(status === 'APPROVED' ? 'Avis publié sur le site ✅' : 'Avis retiré / refusé.');
    await load();
  } catch (e) {
    if (e.message !== '401') toast(e.message, false);
    btn.disabled = false;
  }
}

/* ========================= Init ========================= */
function setup() {
  const admin = getAdmin();
  if (!admin || !localStorage.getItem('token')) { redirectToLogin("Accès refusé : réservé à l'administrateur."); return false; }
  const name = admin.fullName || admin.full_name || 'Admin';
  $('admin-name').textContent = name; $('admin-avatar').textContent = name.charAt(0).toUpperCase();

  $('tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-status]'); if (!b) return;
    document.querySelectorAll('#tabs .nav-link').forEach((x) => x.classList.toggle('active', x === b));
    current = b.dataset.status; load();
  });
  $('list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    moderate(Number(b.dataset.id), b.dataset.act, b);
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
document.addEventListener('DOMContentLoaded', () => { if (setup()) load(); });
