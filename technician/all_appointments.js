const API_URL = 'https://romantic-enjoyment-production-f458.up.railway.app/api';

let appointmentsData = [];
let currentCalendarDate = new Date();

// ==========================================
// 1. INITIALIZATION & AUTH CHECK
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  if (checkAuth()) {
    loadAllAppointments();
    setupEventListeners();
  }
});

function getAuthToken() {
  const userSessionRaw = localStorage.getItem('verifcar_admin_user') 
                      || localStorage.getItem('verifcar_reception_user') 
                      || localStorage.getItem('verifcar_user');
  if (userSessionRaw) {
    try {
      const parsed = JSON.parse(userSessionRaw);
      return parsed.token || parsed.accessToken || localStorage.getItem('token') || '';
    } catch (e) {
      return localStorage.getItem('token') || '';
    }
  }
  return localStorage.getItem('token') || '';
}

function checkAuth() {
  const rawUser = localStorage.getItem('verifcar_admin_user') 
               || localStorage.getItem('verifcar_reception_user') 
               || localStorage.getItem('verifcar_user');
  
  const token = getAuthToken();
  const allowedRoles = ['ADMIN', 'RECEPTION'];

  if (!rawUser || !token) {
    alert('Accès non autorisé.');
    window.location.href = '../Auth/index.html';
    return false;
  }

  let userSession;
  try {
    userSession = JSON.parse(rawUser);
  } catch (e) {
    window.location.href = '../Auth/index.html';
    return false;
  }

  const userRole = (userSession.role || '').toUpperCase();

  if (!allowedRoles.includes(userRole)) {
    alert('Accès non autorisé.');
    window.location.href = '../Auth/index.html';
    return false;
  }

  const nameEl = document.getElementById('admin-name') || document.getElementById('receptionist-name');
  const fullName = userSession.fullName || userSession.full_name || 'Utilisateur';
  if (nameEl) nameEl.innerText = fullName;

  const avatarEl = document.getElementById('admin-avatar');
  if (avatarEl) avatarEl.innerText = fullName.charAt(0).toUpperCase();

  return true;
}

// ==========================================
// 2. FETCH ALL APPOINTMENTS DATA
// ==========================================
async function loadAllAppointments() {
  try {
    const res = await fetch(`${API_URL}/admin/appointments`, {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json'
      }
    });

    if (res.ok) {
      const responseData = await res.json();
      appointmentsData = Array.isArray(responseData) ? responseData : (responseData.data || responseData.appointments || []);
      renderAppointmentsTable(appointmentsData);
      renderCalendarView();
    } else if (res.status === 401 || res.status === 403) {
      alert('Session expirée. Veuillez vous reconnecter.');
      window.location.href = '../Auth/index.html';
    }
  } catch (error) {
    console.error('Erreur lors du chargement de tous les rendez-vous:', error);
  }
}

function parseLocalAppointmentDate(dateStr) {
  if (!dateStr) return null;
  const parts = dateStr.split(/[- : T]/);
  if (parts.length < 3) return null;

  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const hours = parts[3] ? parseInt(parts[3], 10) : 0;
  const minutes = parts[4] ? parseInt(parts[4], 10) : 0;

  return new Date(year, month, day, hours, minutes, 0);
}

// ==========================================
// 3. RENDER TABLE & CALENDAR
// ==========================================
function renderAppointmentsTable(data) {
  const tbody = document.getElementById('rdv-table-body');
  if (!tbody) return;

  if (data.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center py-4 text-muted">
          <i class="bi bi-inbox fs-3 d-block mb-2"></i>
          Aucun rendez-vous trouvé
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = data.map(item => {
    const appDateRaw = item.appointment_date || item.start || item.appointmentDate;
    const appDate = parseLocalAppointmentDate(appDateRaw);
    
    const dateFormatted = appDate 
      ? appDate.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : '--/--/----';

    const timeFormatted = appDate 
      ? appDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : '--:--';

    const clientName = item.client_name || item.title || item.clientName || 'N/A';
    const phone = item.phone || item.extendedProps?.phone || 'N/A';
    const vehicle = item.vehicle_name || item.extendedProps?.vehicle || item.carModel || 'Véhicule';
    const licensePlate = item.license_plate || item.VIN || item.extendedProps?.vin || item.vin || '';
    const service = item.service_type || item.extendedProps?.serviceType || item.typedeverification || 'Inspection';

    return `
      <tr>
        <td class="fw-bold text-dark">${clientName}</td>
        <td>${phone}</td>
        <td>
          <div class="fw-semibold">${vehicle}</div>
          <small class="text-muted">${licensePlate}</small>
        </td>
        <td>
          <div><i class="bi bi-calendar-event me-1 text-muted"></i>${dateFormatted}</div>
          <small class="text-muted"><i class="bi bi-clock me-1"></i>${timeFormatted}</small>
        </td>
        <td><span class="badge bg-light text-dark border">${service}</span></td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary me-1" title="Imprimer Fiche" onclick="printAppointment('${item.id || item.ticket_number}')">
            <i class="bi bi-printer"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderCalendarView() {
  const monthYearEl = document.getElementById('calendar-month-year');
  const gridEl = document.getElementById('calendar-grid');
  if (!gridEl) return;

  const year = currentCalendarDate.getFullYear();
  const month = currentCalendarDate.getMonth();

  if (monthYearEl) {
    monthYearEl.innerText = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(currentCalendarDate);
  }
  gridEl.innerHTML = '';

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  for (let i = 0; i < (firstDay === 0 ? 6 : firstDay - 1); i++) {
    gridEl.innerHTML += `<div class="calendar-day bg-light opacity-50"></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dayAppointments = appointmentsData.filter(a => {
      const d = a.appointment_date || a.start || a.appointmentDate;
      return d && d.startsWith(dateStr);
    });

    let appListHtml = dayAppointments.map(a => `
      <div class="bg-primary text-white fs-11 p-1 rounded mb-1 text-truncate" title="${a.client_name || a.title || a.clientName}">
        ${a.client_name || a.title || a.clientName}
      </div>
    `).join('');

    gridEl.innerHTML += `
      <div class="calendar-day">
        <div class="fw-bold text-secondary mb-1">${day}</div>
        ${appListHtml}
      </div>
    `;
  }
}

// ==========================================
// 4. LISTENERS & UTILS
// ==========================================
function setupEventListeners() {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.clear();
      window.location.href = '../Auth/index.html';
    });
  }

  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase().trim();
      const filtered = appointmentsData.filter(item => {
        const client = (item.client_name || item.title || item.clientName || '').toLowerCase();
        const phone = (item.phone || item.extendedProps?.phone || '');
        const car = (item.vehicle_name || item.extendedProps?.vehicle || item.carModel || '').toLowerCase();
        return client.includes(term) || phone.includes(term) || car.includes(term);
      });
      renderAppointmentsTable(filtered);
    });
  }
}

function toggleView(view) {
  const tableContainer = document.getElementById('view-table-container');
  const calendarContainer = document.getElementById('view-calendar-container');
  const btnTable = document.getElementById('btn-view-table');
  const btnCalendar = document.getElementById('btn-view-calendar');

  if (view === 'table') {
    tableContainer?.classList.remove('d-none');
    calendarContainer?.classList.add('d-none');
    btnTable?.classList.add('active');
    btnCalendar?.classList.remove('active');
  } else {
    tableContainer?.classList.add('d-none');
    calendarContainer?.classList.remove('d-none');
    btnCalendar?.classList.add('active');
    btnTable?.classList.remove('active');
    renderCalendarView();
  }
}

function changeMonth(delta) {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
  renderCalendarView();
}

function printAppointment(id) {
  window.open(`prise.de.rendez-vous.html?id=${id}`, '_blank');
}