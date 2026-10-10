/* =====================================================================
   Réception — tableau de bord (index.html)
   ===================================================================== */
const API_URL = 'https://romantic-enjoyment-production-f458.up.railway.app/api';
const POLL_MS = 30000;   // تحديث تلقائي كل 30 ثانية

// أيام وساعات عمل الورشة (للتنبيه عند الحجز خارجها): السبت → الأربعاء، 09:00 → 17:00
const REST_DAYS = [4, 5];      // 4 = الخميس، 5 = الجمعة
const OPEN_TIME = '09:00';
const CLOSE_TIME = '17:00';

let appointmentsData = [];     // آخر بيانات وصلت من السيرفر (مواعيد اليوم)
let searchTerm = '';           // نص البحث الحالي: يُحفظ بين عمليات التحديث التلقائي
let timerInterval = null;
let lastLoadedAt = 0;
let redirecting = false;
let savingNew = false;
let savingEdit = false;
let cancelling = false;
let reminderMode = 'off';     // off | dry-run | live (يأتي من السيرفر)
let reminderMap = {};          // id -> { reminder_status, reminder_error }
let resending = false;

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

// نص تاريخ السيرفر -> Date محلي بلا أي إزاحة زمنية (يعمل على Safari أيضاً، بخلاف new Date("YYYY-MM-DD HH:MM:SS"))
function parseLocalAppointmentDate(dateStr) {
  if (!dateStr) return null;
  const parts = String(dateStr).split(/[- :T]/);
  if (parts.length < 5) return null;
  const [year, month, day, hours, minutes] = parts.map((p) => parseInt(p, 10));
  if ([year, month, day, hours, minutes].some(Number.isNaN)) return null;
  return new Date(year, month - 1, day, hours, minutes, 0);
}

// توحيد صيغة الهاتف: الخادم يستعمل الرقم كمفتاح لإيجاد العميل، فاختلاف المسافات يُنشئ عميلاً مكرراً
function normalizePhone(raw) {
  let p = String(raw ?? '').replace(/[\s.\-()]/g, '');
  const m = p.match(/^(?:\+213|00213|213)(\d{9})$/);
  if (m) p = '0' + m[1];
  return p;
}
function isValidPhone(p) { return /^\+?\d{8,15}$/.test(p); }

// القيم الافتراضية من الخادم ("Non Spécifié" / "Inconnu") لا يجوز أن تُعاد كاسم سيارة حقيقي عند التعديل
function cleanVehicleText(name) {
  return String(name ?? '')
    .replace(/non\s+sp[ée]cifi[ée]/gi, '')
    .replace(/\binconnu\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}
function cleanPlateText(plate, vin) {
  const p = String(plate ?? '').trim();
  if (!p || /non\s+sp[ée]cifi[ée]/i.test(p) || (vin && p === String(vin).trim())) return '';
  return p;
}

function validateAmounts(totalRaw, versementRaw) {
  const total = totalRaw === '' || totalRaw == null ? 0 : Number(totalRaw);
  const versement = versementRaw === '' || versementRaw == null ? 0 : Number(versementRaw);
  const errors = [];
  if (!Number.isFinite(total) || total < 0) errors.push('Le prix total doit être un nombre positif.');
  if (!Number.isFinite(versement) || versement < 0) errors.push('Le versement doit être un nombre positif.');
  if (errors.length === 0 && versement > total) errors.push('Le versement ne peut pas dépasser le prix total.');
  return { errors, total, versement };
}

function derivePaymentStatus(total, versement) {
  if (versement <= 0) return 'PENDING_VERSEMENT';
  return versement >= total ? 'FULLY_PAID' : 'ADVANCE_PAID';
}

// تنبيهات (وليست أخطاء) عند حجز موعد خارج أيام/ساعات العمل أو بتاريخ ماضٍ
function scheduleWarnings(dateStr, timeStr, now = new Date()) {
  const warnings = [];
  if (!dateStr || !timeStr) return warnings;
  const d = new Date(`${dateStr}T${timeStr}:00`);
  if (isNaN(d.getTime())) return warnings;
  if (REST_DAYS.includes(d.getDay())) warnings.push("Ce jour est un jour de repos de l'atelier (jeudi / vendredi).");
  if (timeStr < OPEN_TIME || timeStr > CLOSE_TIME) warnings.push(`Cette heure est en dehors des horaires de l'atelier (${OPEN_TIME} – ${CLOSE_TIME}).`);
  if (dateStr < localDateStr(now)) warnings.push('Cette date est déjà passée.');
  return warnings;
}

function formatDelay(minutes) {
  if (minutes < 90) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h${pad2(minutes % 60)}`;
}

const fmtMoney = (n) => `${Number(n || 0).toLocaleString('fr-FR')} DZD`;

function itemMatchesSearch(item, term) {
  if (!term) return true;
  const hay = normalizeText([
    item.client_name || item.title || item.clientName, item.phone, item.vehicle_name, item.license_plate, item.VIN, item.service_type
  ].join(' '));
  return hay.includes(term);
}
// </helpers>

/* ========================= جلسة المستخدم ========================= */
const $ = (id) => document.getElementById(id);

function getAuthToken() {
  return localStorage.getItem('token') || '';
}

// نختار أول جلسة بدور مسموح (ADMIN / RECEPTION) بدل أول مفتاح موجود (قد يكون جلسة قديمة لدور آخر)
function getSession() {
  const keys = ['verifcar_reception_user', 'verifcar_user', 'verifcar_admin_user'];
  for (const key of keys) {
    try {
      const session = JSON.parse(localStorage.getItem(key) || 'null');
      if (session && ['ADMIN', 'RECEPTION'].includes(String(session.role || '').toUpperCase())) return session;
    } catch (e) { /* جلسة تالفة: نتجاهلها */ }
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
  if (!session || !getAuthToken()) {
    redirectToLogin('Accès non autorisé.');
    return false;
  }
  const name = session.fullName || session.full_name;
  if (name) {
    ['admin-name', 'receptionist-name'].forEach((id) => { const el = $(id); if (el) el.textContent = name; });
    ['admin-avatar', 'mobile-avatar'].forEach((id) => { const el = $(id); if (el) el.textContent = name.charAt(0).toUpperCase(); });
  }
  return true;
}

async function apiFetch(path, options = {}) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'Authorization': `Bearer ${getAuthToken()}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  let body = null;
  try { body = await res.json(); } catch (e) { /* ignore */ }
  return { res, body };
}

/* ========================= تحميل البيانات ========================= */
function showLoadError(message) {
  const box = $('load-error');
  if (!box) return;
  box.textContent = message;
  box.classList.remove('d-none');
}
function hideLoadError() { $('load-error')?.classList.add('d-none'); }

async function loadDashboardData() {
  try {
    const { res, body } = await apiFetch('/admin/appointments/today');

    if (res.ok && Array.isArray(body)) {
      appointmentsData = body;
      lastLoadedAt = Date.now();
      hideLoadError();
      await loadReminderStatus();
      renderAppointmentsTable();
      updateKPIs(appointmentsData);
    } else if (res.status === 401 || res.status === 403) {
      redirectToLogin('Session expirée. Veuillez vous reconnecter.');
    } else {
      showLoadError(`Impossible de charger les rendez-vous (erreur ${res.status}). Les données affichées peuvent être anciennes.`);
    }
  } catch (error) {
    console.error('Erreur lors du chargement des rendez-vous:', error);
    showLoadError('Connexion au serveur impossible. Les données affichées peuvent être anciennes.');
  }
}

/* ========================= تذكير واتساب ========================= */
// فشل هذا الطلب (سيرفر قديم، migration ناقصة...) لا يؤثر أبداً على باقي اللوحة
async function loadReminderStatus() {
  try {
    const { res, body } = await apiFetch('/admin/appointments/reminders-today');
    if (res.ok && body && Array.isArray(body.items)) {
      reminderMode = body.mode || 'off';
      reminderMap = {};
      body.items.forEach((r) => { reminderMap[Number(r.id)] = r; });
    } else {
      reminderMode = 'off';
    }
  } catch (e) {
    reminderMode = 'off';
  }
  const th = $('th-reminder');
  if (th) th.classList.toggle('d-none', reminderMode === 'off');
}

function reminderCell(item) {
  if (reminderMode === 'off') return '';
  const id = Number(item.id);
  const st = item.extendedProps?.status || item.status || 'PENDING';
  if (['COMPLETED', 'CANCELLED', 'ABSENT'].includes(st)) return '<td><span class="text-muted">—</span></td>';
  const r = reminderMap[id] || {};
  const btn = (label) => `<button class="btn btn-sm btn-outline-success py-0 px-1 ms-1" title="${label}" onclick="resendReminder(${id})"><i class="bi bi-whatsapp"></i></button>`;
  let html;
  switch (r.reminder_status) {
    case 'SENT': html = `<span class="badge bg-success"><i class="bi bi-check2-all"></i> Envoyé</span>${btn('Renvoyer le rappel')}`; break;
    case 'SENDING': html = '<span class="badge bg-info text-dark">Envoi…</span>'; break;
    case 'FAILED': html = `<span class="badge bg-danger" title="${escapeHtml(r.reminder_error || '')}">Échec</span>${btn('Réessayer')}`; break;
    case 'SKIPPED': html = `<span class="badge bg-secondary" title="${escapeHtml(r.reminder_error || '')}">Non envoyé</span>${btn('Envoyer maintenant')}`; break;
    default: html = `<span class="badge bg-light text-muted border">${reminderMode === 'dry-run' ? 'Test' : 'Auto −10 min'}</span>${btn('Envoyer maintenant')}`;
  }
  return `<td class="text-nowrap">${html}</td>`;
}

async function resendReminder(id) {
  if (resending) return;
  if (!confirm('Envoyer le rappel WhatsApp à ce client maintenant ?')) return;
  resending = true;
  try {
    const { res, body } = await apiFetch(`/admin/appointments/${id}/reminder`, { method: 'POST', body: JSON.stringify({}) });
    alert((body && body.message) || (res.ok ? 'Rappel envoyé.' : 'Échec de l\'envoi.'));
  } catch (e) {
    alert('Connexion au serveur impossible.');
  } finally {
    resending = false;
  }
  loadDashboardData();
}

/* ========================= عرض الجدول ========================= */
function getRemainingTime(item) {
  const currentStatus = item.status || item.extendedProps?.status;

  if (currentStatus === 'COMPLETED') {
    return `<span class="badge bg-success"><i class="bi bi-check-all"></i> Terminé</span>`;
  }
  if (['CANCELLED', 'ABSENT'].includes(currentStatus)) {
    return `<span class="badge bg-danger">${escapeHtml(item.cancel_reason || 'Annulé')}</span>`;
  }

  // السيارة دخلت الورشة فعلياً: العد التنازلي من لحظة الدخول الحقيقية (started_at)
  if (['IN_WORKSHOP', 'IN_PROGRESS', 'INCOMPLETE'].includes(currentStatus)) {
    const startedDate = parseLocalAppointmentDate(item.started_at || item.extendedProps?.started_at);
    if (!startedDate) return `<span class="badge bg-info text-dark">⚙️ En cours</span>`;

    const remainingMs = 60 * 60 * 1000 - (Date.now() - startedDate.getTime());
    if (remainingMs <= 0) return `<span class="badge bg-danger">⏱️ Dépassement (+1h)</span>`;

    const minutesLeft = Math.floor(remainingMs / 60000);
    const secondsLeft = Math.floor((remainingMs % 60000) / 1000);
    return `<span class="badge bg-primary fs-12">⏳ ${minutesLeft}m ${secondsLeft}s</span>`;
  }

  // لم تدخل الورشة بعد
  const appDate = parseLocalAppointmentDate(item.appointment_date || item.start || item.appointmentDate);
  if (!appDate) return `<span class="badge bg-secondary">--</span>`;

  if (Date.now() < appDate.getTime()) {
    const minutesUntil = Math.ceil((appDate.getTime() - Date.now()) / 60000);
    return `<span class="badge bg-light text-muted border">Dans ${formatDelay(minutesUntil)}</span>`;
  }
  return `<span class="badge bg-warning text-dark">En attente d'entrée</span>`;
}

function renderRow(item) {
  const id = Number(item.id);
  const appDate = parseLocalAppointmentDate(item.appointment_date || item.start || item.appointmentDate);
  const timeFormatted = appDate ? `${pad2(appDate.getHours())}:${pad2(appDate.getMinutes())}` : 'N/A';

  const status = item.extendedProps?.status || item.status || 'PENDING';
  const payStatus = item.payment_status || item.paymentStatus || 'PENDING_VERSEMENT';
  const total = Number(item.total_amount) || 0;
  const rest = Math.max(0, total - (Number(item.versement) || 0));

  const clientName = item.client_name || item.title || item.clientName || 'N/A';
  const phone = item.phone || item.extendedProps?.phone || 'N/A';
  const vehicle = cleanVehicleText(item.vehicle_name) || 'Véhicule non précisé';
  const plate = cleanPlateText(item.license_plate, item.VIN);
  const service = item.service_type || item.extendedProps?.serviceType || 'Inspection';

  const statusValue = ['IN_PROGRESS', 'IN_WORKSHOP', 'INCOMPLETE'].includes(status) ? 'IN_PROGRESS'
    : ['COMPLETED', 'TERMINE'].includes(status) ? 'COMPLETED'
    : ['CANCELLED', 'ABSENT'].includes(status) ? 'CANCELLED' : 'PENDING';

  return `
    <tr>
      <td class="fw-bold text-dark">${escapeHtml(clientName)}</td>
      <td>${escapeHtml(phone)}</td>
      <td>
        <div class="fw-semibold">${escapeHtml(vehicle)}</div>
        <small class="text-muted">${escapeHtml(plate)}</small>
      </td>
      <td><i class="bi bi-clock me-1 text-muted"></i>${timeFormatted}</td>
      <td><span class="badge bg-light text-dark border">${escapeHtml(service)}</span></td>
      <td id="chrono-${id}">${getRemainingTime(item)}</td>
      ${reminderCell(item)}
      <td>
        <select class="form-select form-select-sm" data-current="${escapeHtml(payStatus)}" onchange="onPaymentSelectChange(${id}, this)">
          <option value="PENDING_VERSEMENT" ${payStatus === 'PENDING_VERSEMENT' ? 'selected' : ''}>Non payé</option>
          <option value="ADVANCE_PAID" ${payStatus === 'ADVANCE_PAID' ? 'selected' : ''}>Avance</option>
          <option value="FULLY_PAID" ${payStatus === 'FULLY_PAID' ? 'selected' : ''}>Payé</option>
        </select>
        ${payStatus !== 'FULLY_PAID' && rest > 0 ? `<div class="fs-11 text-danger fw-semibold mt-1">Reste : ${fmtMoney(rest)}</div>` : ''}
      </td>
      <td>
        <select class="form-select form-select-sm status-select" data-current="${statusValue}" onchange="onStatusSelectChange(${id}, this)">
          <option value="PENDING" ${statusValue === 'PENDING' ? 'selected' : ''}>⏳ En Attente</option>
          <option value="IN_PROGRESS" ${statusValue === 'IN_PROGRESS' ? 'selected' : ''}>⚙️ En Cours</option>
          <option value="COMPLETED" ${statusValue === 'COMPLETED' ? 'selected' : ''}>✅ Terminé</option>
          <option value="CANCELLED" ${statusValue === 'CANCELLED' ? 'selected' : ''}>❌ Annulé</option>
        </select>
      </td>
      <td class="text-end">
        <button class="btn btn-sm btn-outline-secondary me-1" title="Modifier" onclick="openEditModalById(${id})"><i class="bi bi-pencil"></i></button>
        <button class="btn btn-sm btn-outline-primary me-1" title="Imprimer Fiche" onclick="printAppointment(${id})"><i class="bi bi-printer"></i></button>
        <button class="btn btn-sm btn-outline-danger" title="Annuler" onclick="openCancelModal(${id})"><i class="bi bi-trash"></i></button>
      </td>
    </tr>`;
}

function renderAppointmentsTable() {
  const tbody = $('rdv-table-body');
  if (!tbody) return;

  const data = appointmentsData.filter((item) => itemMatchesSearch(item, searchTerm));

  if (data.length === 0) {
    const text = searchTerm ? 'Aucun résultat pour cette recherche' : "Aucun rendez-vous aujourd'hui";
    tbody.innerHTML = `
      <tr>
        <td colspan="${reminderMode === 'off' ? 9 : 10}" class="text-center py-4 text-muted">
          <i class="bi bi-inbox fs-3 d-block mb-2"></i>${text}
        </td>
      </tr>`;
  } else {
    tbody.innerHTML = data.map(renderRow).join('');
  }

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    data.forEach((item) => {
      const el = $(`chrono-${Number(item.id)}`);
      if (el) el.innerHTML = getRemainingTime(item);
    });
  }, 1000);
}

function updateKPIs(data) {
  const todayStr = localDateStr(new Date());   // بتوقيت الجهاز المحلي (toISOString كان يعطي تاريخ UTC)
  const dateOf = (a) => a.appointment_date || a.start || a.appointmentDate || '';
  const statusOf = (a) => a.extendedProps?.status || a.status;

  const set = (id, value) => { const el = $(id); if (el) el.textContent = value; };
  set('count-today', data.filter((a) => String(dateOf(a)).startsWith(todayStr)).length);
  set('count-pending', data.filter((a) => ['PENDING', 'EN_ATTENTE', 'READY_FOR_WORKSHOP'].includes(statusOf(a))).length);
  set('count-progress', data.filter((a) => ['INCOMPLETE', 'EN_COURS', 'IN_PROGRESS', 'IN_WORKSHOP'].includes(statusOf(a))).length);
  set('count-completed', data.filter((a) => ['COMPLETED', 'TERMINE'].includes(statusOf(a))).length);
}

/* ========================= الإجراءات ========================= */
async function changeStatus(id, newStatus) {
  try {
    const { res, body } = await apiFetch(`/admin/appointments/${id}/status`, { method: 'PUT', body: JSON.stringify({ status: newStatus }) });
    if (!res.ok) alert((body && body.message) || 'Erreur lors de la mise à jour du statut.');
  } catch (error) {
    console.error('Error changing status:', error);
    alert('Connexion au serveur impossible.');
  }
  loadDashboardData();   // نعيد التحميل دائماً: يُحدّث الجدول أو يعيد القائمة لقيمتها الحقيقية عند الفشل
}

// "Annulé" من القائمة المنسدلة يمرّ بنافذة اختيار السبب (كان يتجاوزها فتُحفظ إلغاءات بلا سبب)
function onStatusSelectChange(id, selectEl) {
  if (selectEl.value === 'CANCELLED') {
    selectEl.value = selectEl.dataset.current;
    openCancelModal(id);
    return;
  }
  changeStatus(id, selectEl.value);
}

async function updatePaymentStatus(id, newStatus) {
  try {
    const { res, body } = await apiFetch(`/admin/appointments/${id}/payment-status`, { method: 'PUT', body: JSON.stringify({ payment_status: newStatus }) });
    if (!res.ok) alert((body && body.message) || 'Erreur lors de la mise à jour du paiement.');
  } catch (err) {
    alert('Connexion au serveur impossible.');
  }
  loadDashboardData();
}

function onPaymentSelectChange(id, selectEl) {
  if (selectEl.value === 'FULLY_PAID') {
    const item = appointmentsData.find((a) => Number(a.id) === Number(id));
    const total = item ? fmtMoney(item.total_amount) : '';
    if (!confirm(`Marquer ce rendez-vous comme entièrement payé ?\nLe versement sera égal au prix total${total ? ` (${total})` : ''}.`)) {
      selectEl.value = selectEl.dataset.current;
      return;
    }
  }
  updatePaymentStatus(id, selectEl.value);
}

function printAppointment(id) {
  window.open(`prise.de.rendez-vous.html?id=${encodeURIComponent(id)}`, '_blank', 'noopener');
}

/* ========================= نوافذ الإلغاء والتعديل ========================= */
function openCancelModal(id) {
  $('cancel-rdv-id').value = id;
  document.querySelectorAll('input[name="cancelReason"]').forEach((r) => { r.checked = false; });
  $('cancel-reason-error')?.classList.add('d-none');
  bootstrap.Modal.getOrCreateInstance($('cancelReasonModal')).show();
}

async function confirmCancelWithReason() {
  if (cancelling) return;
  const id = $('cancel-rdv-id').value;
  const reason = document.querySelector('input[name="cancelReason"]:checked')?.value;
  if (!reason) {
    $('cancel-reason-error')?.classList.remove('d-none');
    return;
  }

  const btn = $('confirm-cancel-btn');
  cancelling = true;
  if (btn) btn.disabled = true;
  try {
    const { res, body } = await apiFetch(`/admin/appointments/${id}/status`, { method: 'PUT', body: JSON.stringify({ status: 'CANCELLED', cancel_reason: reason }) });
    if (res.ok) {
      bootstrap.Modal.getOrCreateInstance($('cancelReasonModal')).hide();
      loadDashboardData();
    } else {
      alert((body && body.message) || "Erreur lors de l'annulation du rendez-vous.");
    }
  } catch (err) {
    console.error('Error cancelling appointment:', err);
    alert('Connexion au serveur impossible.');
  } finally {
    cancelling = false;
    if (btn) btn.disabled = false;
  }
}

function openEditModalById(id) {
  const item = appointmentsData.find((a) => Number(a.id) === Number(id));
  if (item) openEditModal(item);
}

function openEditModal(item) {
  $('edit-rdv-id').value = item.id;
  $('edit-client-name').value = item.client_name || '';
  $('edit-client-phone').value = item.phone || '';
  $('edit-car-make-model').value = cleanVehicleText(item.vehicle_name);
  $('edit-car-matricule').value = cleanPlateText(item.license_plate, item.VIN || item.vin);
  $('edit-car-vin').value = item.VIN || item.vin || '';
  $('edit-total-amount').value = item.total_amount || 0;
  $('edit-versement-amount').value = item.versement || 0;
  $('edit-vehicle-notes').value = item.notes || '';

  const d = parseLocalAppointmentDate(item.appointment_date || item.start || item.appointmentDate);
  if (d) {
    $('edit-rdv-date-only').value = localDateStr(d);
    $('edit-rdv-time-only').value = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }

  const existingServices = (item.service_type || '').split(',').map((s) => s.trim()).filter(Boolean);
  const checkboxes = document.querySelectorAll('.edit-service-checkbox');
  const otherInput = $('edit-service-autre');
  checkboxes.forEach((cb) => { cb.checked = existingServices.includes(cb.value); });
  const standard = Array.from(checkboxes).map((cb) => cb.value);
  if (otherInput) otherInput.value = existingServices.filter((s) => !standard.includes(s)).join(', ');

  bootstrap.Modal.getOrCreateInstance($('editRendezVousModal')).show();
}

function setBusy(button, busy, busyText) {
  if (!button) return;
  if (busy) { button.dataset.label = button.innerHTML; button.disabled = true; button.innerHTML = `<span class="spinner-border spinner-border-sm me-2"></span>${busyText}`; }
  else { button.disabled = false; if (button.dataset.label) button.innerHTML = button.dataset.label; }
}

async function handleEditSubmit(e) {
  e.preventDefault();
  if (savingEdit) return;

  const id = $('edit-rdv-id')?.value;
  if (!id) return alert('Rendez-vous introuvable.');

  const clientName = $('edit-client-name').value.trim();
  const phone = normalizePhone($('edit-client-phone').value);
  const amounts = validateAmounts($('edit-total-amount').value, $('edit-versement-amount').value);
  const errors = [...amounts.errors];
  if (!clientName) errors.push('Le nom du client est obligatoire.');
  if (!isValidPhone(phone)) errors.push('Numéro de téléphone invalide (au moins 8 chiffres).');
  if (errors.length) return alert(errors.join('\n'));

  const services = Array.from(document.querySelectorAll('.edit-service-checkbox:checked')).map((cb) => cb.value);
  const custom = $('edit-service-autre')?.value.trim();
  if (custom) services.push(custom);

  const editDate = $('edit-rdv-date-only')?.value;
  const editTime = $('edit-rdv-time-only')?.value;
  const carParts = $('edit-car-make-model').value.trim().split(/\s+/).filter(Boolean);

  const payload = {
    appointmentDate: (editDate && editTime) ? `${editDate} ${editTime}:00` : null,
    clientName,
    phone,
    make: carParts[0] || 'Inconnu',
    model: carParts.slice(1).join(' ') || 'Inconnu',
    licensePlate: $('edit-car-matricule').value.trim(),
    vin: $('edit-car-vin').value.trim(),
    serviceType: services.length ? services.join(', ') : 'Inspection',
    totalAmount: amounts.total,
    versement: amounts.versement,
    paymentStatus: derivePaymentStatus(amounts.total, amounts.versement),
    notes: $('edit-vehicle-notes').value.trim()
  };

  const btn = e.target.querySelector('button[type="submit"]');
  savingEdit = true; setBusy(btn, true, 'Enregistrement...');
  try {
    const { res, body } = await apiFetch(`/admin/appointments/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
    if (res.ok) {
      bootstrap.Modal.getOrCreateInstance($('editRendezVousModal')).hide();
      loadDashboardData();
    } else {
      alert('Erreur : ' + ((body && body.message) || 'Erreur lors de la modification'));
    }
  } catch (err) {
    console.error('Save error:', err);
    alert('Connexion au serveur impossible.');
  } finally {
    savingEdit = false; setBusy(btn, false);
  }
}

/* ========================= إنشاء موعد ========================= */
async function handleNewAppointment(e) {
  e.preventDefault();
  if (savingNew) return;   // يمنع تسجيل نفس الموعد مرتين عند النقر المزدوج

  const clientName = $('client-name').value.trim();
  const phone = normalizePhone($('client-phone').value);
  const amounts = validateAmounts($('total-amount').value, $('versement-amount').value);
  const errors = [...amounts.errors];
  if (!clientName) errors.push('Le nom du client est obligatoire.');
  if (!isValidPhone(phone)) errors.push('Numéro de téléphone invalide (au moins 8 chiffres).');
  if (errors.length) return alert(errors.join('\n'));

  const dateOnly = $('rdv-date-only').value;
  const timeOnly = $('rdv-time-only').value;
  const warnings = scheduleWarnings(dateOnly, timeOnly);
  if (warnings.length && !confirm(`${warnings.join('\n')}\n\nEnregistrer quand même ?`)) return;

  const services = Array.from(document.querySelectorAll('.service-checkbox:checked')).map((cb) => cb.value);
  const custom = $('service-autre').value.trim();
  if (custom) services.push(custom);
  const carParts = $('car-make-model').value.trim().split(/\s+/).filter(Boolean);

  const payload = {
    clientName,
    phone,
    make: carParts[0] || 'Inconnu',
    model: carParts.slice(1).join(' ') || 'Inconnu',
    licensePlate: $('car-matricule').value.trim(),
    vin: $('car-vin').value.trim(),
    typedeverification: services.join(', '),
    appointmentDate: `${dateOnly} ${timeOnly}:00`,
    totalAmount: amounts.total,
    versement: amounts.versement,
    notes: $('vehicle-notes').value.trim(),
    paymentStatus: derivePaymentStatus(amounts.total, amounts.versement),
    status: 'PENDING'
  };

  const btn = e.target.querySelector('button[type="submit"]');
  savingNew = true; setBusy(btn, true, 'Enregistrement...');
  try {
    const { res, body } = await apiFetch('/admin/appointments', { method: 'POST', body: JSON.stringify(payload) });
    if (res.ok) {
      bootstrap.Modal.getOrCreateInstance($('addRendezVousModal')).hide();
      $('rdv-form').reset();
      const nameInput = $('client-name'); if (nameInput) delete nameInput.dataset.autofilled;
      loadDashboardData();
    } else {
      alert('Erreur : ' + ((body && body.message) || "Impossible d'enregistrer le rendez-vous"));
    }
  } catch (error) {
    console.error('Error creating appointment:', error);
    alert('Connexion au serveur impossible.');
  } finally {
    savingNew = false; setBusy(btn, false);
  }
}

// فتح نافذة موعد جديد تلقائياً من التقويم: index.html?new=1&date=YYYY-MM-DD&time=HH:MM
function openNewAppointmentFromUrl() {
  const params = new URLSearchParams(window.location.search);
  if (params.get('new') !== '1') return;

  const date = params.get('date');
  const time = params.get('time');
  if (date && /^\d{4}-\d{2}-\d{2}$/.test(date)) $('rdv-date-only').value = date;
  if (time && /^\d{2}:\d{2}$/.test(time)) $('rdv-time-only').value = time;

  history.replaceState(null, '', window.location.pathname);   // كي لا تُفتح النافذة ثانية عند إعادة تحميل الصفحة
  bootstrap.Modal.getOrCreateInstance($('addRendezVousModal')).show();
}

/* ========================= الأحداث ========================= */
function setupEventListeners() {
  $('logout-btn')?.addEventListener('click', () => {
    ['token', 'verifcar_reception_user', 'verifcar_user', 'verifcar_admin_user'].forEach((k) => localStorage.removeItem(k));
    window.location.href = '../Auth/index.html';
  });

  $('search-input')?.addEventListener('input', (e) => {
    searchTerm = normalizeText(e.target.value.trim());
    renderAppointmentsTable();
  });

  // تعبئة اسم العميل تلقائياً من رقم هاتف معروف (مع تأخير بسيط، وبدون الكتابة فوق اسم أدخله المستخدم)
  const phoneInput = $('client-phone');
  const nameInput = $('client-name');
  if (phoneInput && nameInput) {
    nameInput.addEventListener('input', () => { delete nameInput.dataset.autofilled; });
    let timer = null;
    phoneInput.addEventListener('input', () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const phone = normalizePhone(phoneInput.value);
        if (phone.length < 8) { phoneInput.classList.remove('is-valid'); return; }
        try {
          const { res, body } = await apiFetch(`/admin/clients/search?query=${encodeURIComponent(phone)}`);
          const clients = res.ok && Array.isArray(body) ? body : [];
          if (clients.length > 0) {
            if (!nameInput.value.trim() || nameInput.dataset.autofilled === '1') {
              nameInput.value = clients[0].full_name;
              nameInput.dataset.autofilled = '1';
            }
            phoneInput.classList.add('is-valid');
          } else {
            phoneInput.classList.remove('is-valid');
          }
        } catch (err) {
          console.error('Autofill error:', err);
        }
      }, 400);
    });
  }

  $('rdv-form')?.addEventListener('submit', handleNewAppointment);
  $('edit-rdv-form')?.addEventListener('submit', handleEditSubmit);
}

function startPolling() {
  setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (document.querySelector('.modal.show')) return;                                   // لا نقاطع من يكتب بنافذة
    const active = document.activeElement;
    if (active && active.closest && active.closest('#rdv-table-body')) return;          // ولا قائمة منسدلة مفتوحة بالجدول
    loadDashboardData();
  }, POLL_MS);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - lastLoadedAt > 10000) loadDashboardData();
  });
}

document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth()) return;
  setupEventListeners();
  loadDashboardData();
  startPolling();
  openNewAppointmentFromUrl();
});