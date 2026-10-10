/* =====================================================================
   Réception — liste de tous les rendez-vous (toutsrnd.html)
   ===================================================================== */
const API_URL = 'https://romantic-enjoyment-production-f458.up.railway.app/api';
const PAGE_SIZE = 50;

let allAppointments = [];
let visibleCount = PAGE_SIZE;
const filters = { period: 'all', status: 'all', term: '' };
let redirecting = false;

// <helpers>  دوال نقية بدون DOM (قابلة للاختبار)
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}
function normalizeText(s) {
  return String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
function pad2(n) { return String(n).padStart(2, '0'); }
function localDateStr(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }

// نص تاريخ السيرفر -> Date محلي بلا إزاحة زمنية (يعمل على Safari أيضاً)
function parseLocalAppointmentDate(dateStr) {
  if (!dateStr) return null;
  const parts = String(dateStr).split(/[- :T]/);
  if (parts.length < 5) return null;
  const [year, month, day, hours, minutes] = parts.map((p) => parseInt(p, 10));
  if ([year, month, day, hours, minutes].some(Number.isNaN)) return null;
  return new Date(year, month - 1, day, hours, minutes, 0);
}

function cleanVehicleText(name) {
  return String(name ?? '').replace(/non\s+sp[ée]cifi[ée]/gi, '').replace(/\binconnu\b/gi, '').replace(/\s+/g, ' ').trim();
}
function cleanPlateText(plate, vin) {
  const p = String(plate ?? '').trim();
  if (!p || /non\s+sp[ée]cifi[ée]/i.test(p) || (vin && p === String(vin).trim())) return '';
  return p;
}
const fmtMoney = (n) => `${Number(n || 0).toLocaleString('fr-FR')} DZD`;

function statusGroup(status) {
  switch (String(status || '').toUpperCase()) {
    case 'COMPLETED': return 'done';
    case 'IN_WORKSHOP': case 'IN_PROGRESS': case 'INCOMPLETE': return 'progress';
    case 'CANCELLED': case 'CANCELED': case 'ANNULE': case 'NO_SHOW': case 'ABSENT': return 'cancelled';
    default: return 'pending';   // PENDING و READY_FOR_WORKSHOP
  }
}
const STATUS_LABEL = {
  pending: ['En attente', 'bg-warning-subtle text-warning-emphasis'],
  progress: ['En cours', 'bg-primary-subtle text-primary'],
  done: ['Terminé', 'bg-success-subtle text-success'],
  cancelled: ['Annulé', 'bg-danger-subtle text-danger']
};

// بداية الأسبوع = السبت (دوام الورشة: السبت → الأربعاء)
function weekStart(now) {
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 1) % 7));
  return d;
}

function periodRange(period, now = new Date()) {
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === 'today') return [startOfDay, new Date(startOfDay.getTime() + 86400000)];
  if (period === 'week') { const s = weekStart(now); return [s, new Date(s.getTime() + 7 * 86400000)]; }
  if (period === 'month') return [new Date(now.getFullYear(), now.getMonth(), 1), new Date(now.getFullYear(), now.getMonth() + 1, 1)];
  return null;
}

function applyFilters(list, f, now = new Date()) {
  const range = periodRange(f.period, now);
  const term = f.term;
  return list.filter((item) => {
    if (f.status !== 'all' && statusGroup(item.status) !== f.status) return false;
    if (range) {
      const d = parseLocalAppointmentDate(item.appointment_date);
      if (!d || d < range[0] || d >= range[1]) return false;
    }
    if (term) {
      const hay = normalizeText([item.client_name, item.phone, item.vehicle_name, item.license_plate, item.VIN, item.service_type].join(' '));
      if (!hay.includes(term)) return false;
    }
    return true;
  });
}

// الفترات القادمة (اليوم/الأسبوع) تُرتَّب تصاعدياً، والبقية الأحدث أولاً
function sortForPeriod(list, period) {
  const key = (i) => { const d = parseLocalAppointmentDate(i.appointment_date); return d ? d.getTime() : 0; };
  const asc = period === 'today' || period === 'week';
  return [...list].sort((a, b) => (asc ? key(a) - key(b) : key(b) - key(a)));
}
// </helpers>

/* ========================= الجلسة ========================= */
const $ = (id) => document.getElementById(id);
const getAuthToken = () => localStorage.getItem('token') || '';

function getSession() {
  for (const key of ['verifcar_reception_user', 'verifcar_user', 'verifcar_admin_user']) {
    try {
      const session = JSON.parse(localStorage.getItem(key) || 'null');
      if (session && ['ADMIN', 'RECEPTION'].includes(String(session.role || '').toUpperCase())) return session;
    } catch (e) { /* جلسة تالفة */ }
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
  const session = getSession();
  if (!session || !getAuthToken()) { redirectToLogin('Accès non autorisé.'); return false; }
  const name = session.fullName || session.full_name;
  if (name) {
    ['admin-name', 'receptionist-name'].forEach((id) => { const el = $(id); if (el) el.textContent = name; });
    ['admin-avatar', 'mobile-avatar'].forEach((id) => { const el = $(id); if (el) el.textContent = name.charAt(0).toUpperCase(); });
  }
  return true;
}

/* ========================= البيانات ========================= */
function showLoadError(message) { const b = $('load-error'); if (b) { b.textContent = message; b.classList.remove('d-none'); } }
function hideLoadError() { $('load-error')?.classList.add('d-none'); }

async function loadAllAppointments() {
  try {
    const res = await fetch(`${API_URL}/admin/appointments`, {
      headers: { 'Authorization': `Bearer ${getAuthToken()}`, 'Content-Type': 'application/json' }
    });
    if (res.status === 401 || res.status === 403) { redirectToLogin('Session expirée. Veuillez vous reconnecter.'); return; }
    if (!res.ok) { showLoadError(`Impossible de charger les rendez-vous (erreur ${res.status}).`); return; }

    const data = await res.json();
    allAppointments = Array.isArray(data) ? data : [];
    hideLoadError();
    render();
  } catch (error) {
    console.error('Erreur lors du chargement de tous les rendez-vous:', error);
    showLoadError('Connexion au serveur impossible.');
  }
}

/* ========================= العرض ========================= */
function paymentCell(item) {
  const total = Number(item.total_amount) || 0;
  const rest = Math.max(0, total - (Number(item.versement) || 0));
  const st = item.payment_status;
  if (st === 'FULLY_PAID') return '<span class="badge bg-success-subtle text-success">Payé</span>';
  const badge = st === 'ADVANCE_PAID'
    ? '<span class="badge bg-warning-subtle text-warning-emphasis">Avance</span>'
    : '<span class="badge bg-danger-subtle text-danger">Non payé</span>';
  return `${badge}${rest > 0 ? `<div class="fs-11 text-muted mt-1">Reste : ${fmtMoney(rest)}</div>` : ''}`;
}

function rowHtml(item) {
  const id = Number(item.id);
  const d = parseLocalAppointmentDate(item.appointment_date);
  const dateFormatted = d ? `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}` : '--/--/----';
  const timeFormatted = d ? `${pad2(d.getHours())}:${pad2(d.getMinutes())}` : '--:--';
  const [label, cls] = STATUS_LABEL[statusGroup(item.status)];
  const reason = statusGroup(item.status) === 'cancelled' && item.cancel_reason
    ? `<div class="fs-11 text-muted mt-1">${escapeHtml(item.cancel_reason)}</div>` : '';

  const vehicle = cleanVehicleText(item.vehicle_name) || 'Véhicule non précisé';
  const plate = cleanPlateText(item.license_plate, item.VIN);

  return `
    <tr>
      <td class="fw-bold text-dark">${escapeHtml(item.client_name || 'N/A')}</td>
      <td>${escapeHtml(item.phone || 'N/A')}</td>
      <td>
        <div class="fw-semibold">${escapeHtml(vehicle)}</div>
        <small class="text-muted">${escapeHtml(plate)}</small>
      </td>
      <td>
        <div><i class="bi bi-calendar-event me-1 text-muted"></i>${dateFormatted}</div>
        <small class="text-muted"><i class="bi bi-clock me-1"></i>${timeFormatted}</small>
      </td>
      <td><span class="badge bg-light text-dark border">${escapeHtml(item.service_type || 'Inspection')}</span></td>
      <td><span class="badge ${cls}">${label}</span>${reason}</td>
      <td>${paymentCell(item)}</td>
      <td class="text-end">
        <a class="btn btn-sm btn-outline-secondary me-1" title="Voir au planning" href="calendar.html?date=${d ? localDateStr(d) : ''}"><i class="bi bi-calendar-week"></i></a>
        <button class="btn btn-sm btn-outline-primary" title="Imprimer Fiche" onclick="printAppointment(${id})"><i class="bi bi-printer"></i></button>
      </td>
    </tr>`;
}

function render() {
  const tbody = $('rdv-table-body');
  if (!tbody) return;

  const list = sortForPeriod(applyFilters(allAppointments, filters), filters.period);
  const shown = list.slice(0, visibleCount);

  const counter = $('result-count');
  if (counter) counter.textContent = list.length;

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="text-center py-4 text-muted">
          <i class="bi bi-inbox fs-3 d-block mb-2"></i>Aucun rendez-vous trouvé
        </td>
      </tr>`;
  } else {
    tbody.innerHTML = shown.map(rowHtml).join('');
  }

  const remaining = list.length - shown.length;
  $('load-more-box')?.classList.toggle('d-none', remaining <= 0);
  const moreBtn = $('load-more-btn');
  if (moreBtn) moreBtn.textContent = `Afficher plus (${remaining} restants)`;
}

function printAppointment(id) {
  window.open(`prise.de.rendez-vous.html?id=${encodeURIComponent(id)}`, '_blank', 'noopener');
}

/* ========================= الأحداث ========================= */
function setupEventListeners() {
  $('logout-btn')?.addEventListener('click', () => {
    ['token', 'verifcar_reception_user', 'verifcar_user', 'verifcar_admin_user'].forEach((k) => localStorage.removeItem(k));
    window.location.href = '../Auth/index.html';
  });

  const refilter = () => { visibleCount = PAGE_SIZE; render(); };
  $('filter-period')?.addEventListener('change', (e) => { filters.period = e.target.value; refilter(); });
  $('filter-status')?.addEventListener('change', (e) => { filters.status = e.target.value; refilter(); });
  $('search-input')?.addEventListener('input', (e) => { filters.term = normalizeText(e.target.value.trim()); refilter(); });
  $('load-more-btn')?.addEventListener('click', () => { visibleCount += PAGE_SIZE; render(); });
}

document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth()) return;
  setupEventListeners();
  loadAllAppointments();
});