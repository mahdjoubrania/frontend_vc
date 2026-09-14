const API_URL = 'https://romantic-enjoyment-production-f458.up.railway.app/api';

let appointmentsToday = [];

// ==========================================
// 1. قراءة التوكن وجلسة المستخدم
// ==========================================
function getAuthToken() {
  const sessionKeys = [
    'verifcar_technician_user',
    'verifcar_admin_user',
    'verifcar_reception_user',
    'verifcar_user'
  ];

  for (const key of sessionKeys) {
    const sessionData = localStorage.getItem(key);
    if (sessionData) {
      try {
        const parsed = JSON.parse(sessionData);
        if (parsed.token) return parsed.token;
        if (parsed.accessToken) return parsed.accessToken;
      } catch (e) {
        if (sessionData.length > 20) return sessionData;
      }
    }
  }

  return localStorage.getItem('token') || '';
}

function getUserSession() {
  const sessionKeys = [
    'verifcar_technician_user',
    'verifcar_admin_user',
    'verifcar_reception_user',
    'verifcar_user'
  ];

  for (const key of sessionKeys) {
    const rawUser = localStorage.getItem(key);
    if (rawUser) {
      try {
        return JSON.parse(rawUser);
      } catch (e) {
        return null;
      }
    }
  }
  return null;
}

// ==========================================
// 2. فحص الصلاحية (ADMIN / TECHNICIAN فقط) + تعبئة الملف الشخصي
// ==========================================
function checkAuth() {
  const userSession = getUserSession();
  const token = getAuthToken();
  const allowedRoles = ['ADMIN', 'TECHNICIAN', 'TECHNICIEN'];

  if (!userSession || !token) {
    alert('Accès non autorisé.');
    window.location.href = '../Auth/index.html';
    return false;
  }

  const userRole = (userSession.role || '').toUpperCase();
  if (!allowedRoles.includes(userRole)) {
    alert('Accès non autorisé.');
    window.location.href = '../Auth/index.html';
    return false;
  }

  const fullName = userSession.fullName || userSession.full_name || 'Technicien';
  const firstName = fullName.split(' ')[0];
  const initial = fullName.charAt(0).toUpperCase();

  const nameEl = document.getElementById('admin-name');
  const welcomeEl = document.getElementById('admin-welcome');
  const avatarEl = document.getElementById('admin-avatar');

  if (nameEl) nameEl.innerText = fullName;
  if (welcomeEl) welcomeEl.innerText = firstName;
  if (avatarEl) avatarEl.innerText = initial;

  return true;
}

// ==========================================
// 3. القائمة الجانبية للهاتف
// ==========================================
function initMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('mobile-sidebar-toggle');
  const closeBtn = document.getElementById('sidebar-close-btn');

  let overlay = document.querySelector('.sidebar-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);
  }

  toggleBtn?.addEventListener('click', () => {
    sidebar?.classList.add('show');
    overlay?.classList.add('show');
  });

  closeBtn?.addEventListener('click', () => {
    sidebar?.classList.remove('show');
    overlay?.classList.remove('show');
  });

  overlay?.addEventListener('click', () => {
    sidebar?.classList.remove('show');
    overlay?.classList.remove('show');
  });
}

function setupLogout() {
  const logoutBtn = document.getElementById('logout-btn');
  logoutBtn?.addEventListener('click', () => {
    localStorage.clear();
    window.location.href = '../Auth/index.html';
  });
}

// ==========================================
// 4. جلب مواعيد اليوم وتحديث بطاقات KPI
// ==========================================
async function loadTodayAppointments() {
  try {
    const res = await fetch(`${API_URL}/admin/appointments/today`, {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json'
      }
    });

    if (res.ok) {
      const data = await res.json();
      appointmentsToday = Array.isArray(data) ? data : (data.data || []);
      renderRecentTickets(appointmentsToday);
      updateTechnicianKPIs(appointmentsToday);
    } else if (res.status === 401 || res.status === 403) {
      alert('Session expirée. Veuillez vous reconnecter.');
      window.location.href = '../Auth/index.html';
    } else {
      console.error('Erreur HTTP lors du chargement des RDV du jour:', res.status);
    }
  } catch (error) {
    console.error('Erreur lors du chargement des rendez-vous du jour:', error);
  }
}

function updateTechnicianKPIs(tickets) {
  if (!Array.isArray(tickets)) return;

  const todayCount = tickets.length;
  const inWorkshopCount = tickets.filter(t =>
    ['IN_PROGRESS', 'IN_WORKSHOP', 'EN_COURS'].includes((t.status || '').toUpperCase())
  ).length;
  const completedCount = tickets.filter(t =>
    ['COMPLETED', 'TERMINE'].includes((t.status || '').toUpperCase())
  ).length;

  const todayElem = document.getElementById('stat-today-count');
  const workshopElem = document.getElementById('stat-in-workshop');
  const completedElem = document.getElementById('stat-completed');

  if (todayElem) todayElem.innerText = todayCount;
  if (workshopElem) workshopElem.innerText = inWorkshopCount;
  if (completedElem) completedElem.innerText = completedCount;
}

// تنظيف أي نص قبل إدراجه كـ innerHTML (يمنع حقن HTML من بيانات العملاء/المركبات)
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[ch]));
}

function renderRecentTickets(tickets) {
  const tableBody = document.getElementById('recent-tickets-body');
  if (!tableBody) return;

  if (!tickets || tickets.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-3">Aucun rendez-vous aujourd'hui</td></tr>`;
    return;
  }

  tableBody.innerHTML = tickets.map(ticket => {
    const ticketNum = ticket.ticket_number || ticket.id || '-';
    const clientName = ticket.client_name || ticket.client_full_name || 'N/A';
    const vehicleName = ticket.vehicle_name || (ticket.brand ? `${ticket.brand} ${ticket.model || ''}` : 'N/A');

    return `
      <tr>
        <td class="fw-bold text-primary">#RDV-${escapeHtml(ticketNum)}</td>
        <td><div class="fw-semibold text-dark">${escapeHtml(clientName)}</div></td>
        <td>${escapeHtml(vehicleName)}</td>
        <td>${formatDateTime(ticket.appointment_date || ticket.start)}</td>
        <td><span class="badge ${getStatusBadgeClass(ticket.status)} px-2 py-1">${escapeHtml(ticket.status || 'PENDING')}</span></td>
      </tr>
    `;
  }).join('');
}

function getStatusBadgeClass(status) {
  switch ((status || '').toUpperCase()) {
    case 'COMPLETED': return 'bg-success-subtle text-success';
    case 'PENDING': return 'bg-warning-subtle text-warning';
    case 'CANCELLED':
    case 'CANCELED':
    case 'NO_SHOW': return 'bg-danger-subtle text-danger';
    default: return 'bg-primary-subtle text-primary';
  }
}

function formatDateTime(dateTimeStr) {
  if (!dateTimeStr) return '-';
  const cleanStr = dateTimeStr.replace('T', ' ').replace('Z', '');
  const parts = cleanStr.split(' ');
  const dateParts = parts[0].split('-');
  const timeParts = parts[1] ? parts[1].split(':') : ['00', '00'];

  const formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
  const formattedTime = `${timeParts[0]}:${timeParts[1]}`;

  return `${formattedDate} ${formattedTime}`;
}

// ==========================================
// 5. نقطة الدخول
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  if (!checkAuth()) return;

  initMobileSidebar();
  setupLogout();
  loadTodayAppointments();
});s