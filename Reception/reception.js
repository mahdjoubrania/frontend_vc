const API_URL = 'https://romantic-enjoyment-production-f458.up.railway.app/api';

let appointmentsData = [];
let currentCalendarDate = new Date();
let timerInterval = null;

// ==========================================
// 1. INITIALIZATION & AUTH CHECK
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  checkAuth();
  loadDashboardData();
  setupEventListeners();
});

function getAuthToken() {
  return localStorage.getItem('token') || '';
}

function checkAuth() {
  const rawUser = localStorage.getItem('verifcar_reception_user') 
               || localStorage.getItem('verifcar_user') 
               || localStorage.getItem('verifcar_admin_user');
  
  const token = getAuthToken();
  const allowedRoles = ['ADMIN', 'RECEPTION'];

  if (!rawUser || !token) {
    alert('Accès non autorisé.');
    window.location.href = '../Auth/auth.html';
    return;
  }

  const userSession = JSON.parse(rawUser);
  const userRole = (userSession.role || '').toUpperCase();

  if (!allowedRoles.includes(userRole)) {
    alert('Accès non autorisé.');
    window.location.href = '../Auth/auth.html';
    return;
  }

  const nameEl = document.getElementById('admin-name') || document.getElementById('receptionist-name');
  if (nameEl && (userSession.fullName || userSession.full_name)) {
    nameEl.innerText = userSession.fullName || userSession.full_name;
  }

  const avatarEl = document.getElementById('admin-avatar');
  if (avatarEl && (userSession.fullName || userSession.full_name)) {
    const name = userSession.fullName || userSession.full_name;
    avatarEl.innerText = name.charAt(0).toUpperCase();
  }
}

// ==========================================
// 2. FETCH & RENDER DATA
// ==========================================
async function loadDashboardData() {
  try {
    const res = await fetch(`${API_URL}/admin/appointments`, {
      headers: {
        'Authorization': `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json'
      }
    });

    if (res.ok) {
      appointmentsData = await res.json();
      renderAppointmentsTable(appointmentsData);
      updateKPIs(appointmentsData);
      renderCalendarView();
    } else if (res.status === 401 || res.status === 403) {
      alert('Session expirée. Veuillez vous reconnecter.');
      window.location.href = '../Auth/auth.html';
    }
  } catch (error) {
    console.error('Erreur lors du chargement des rendez-vous:', error);
  }
}

function getRemainingTime(appointmentDateStr) {
  if (!appointmentDateStr) return '-';

  const startTime = new Date(appointmentDateStr).getTime();
  const endTime = startTime + (60 * 60 * 1000); // مهلة ساعة واحدة
  const now = new Date().getTime();

  if (now < startTime) {
    return `<span class="badge bg-secondary">Pas encore commencé</span>`;
  }

  if (now >= endTime) {
    return `<span class="badge bg-danger">Terminé (1h écoulée)</span>`;
  }

  const diff = endTime - now;
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);

  return `<span class="badge bg-primary">⏳ ${minutes}m ${seconds}s</span>`;
}

function renderAppointmentsTable(data) {
  const tbody = document.getElementById('rdv-table-body');
  if (!tbody) return;

  if (data.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="9" class="text-center py-4 text-muted">
          <i class="bi bi-inbox fs-3 d-block mb-2"></i>
          Aucun rendez-vous trouvé
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = data.map(item => {
    const appDate = item.appointment_date || item.start || item.appointmentDate;
    const timeFormatted = appDate 
      ? new Date(appDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'N/A';

    const currentStatus = item.extendedProps?.status || item.status || 'PENDING';
    const payStatus = item.payment_status || item.paymentStatus || 'UNPAID';
    const clientName = item.client_name || item.title || item.clientName || 'N/A';
    const phone = item.phone || item.extendedProps?.phone || 'N/A';
    const vehicle = item.vehicle_name || item.extendedProps?.vehicle || item.carModel || 'Véhicule';
    const vin = item.VIN || item.extendedProps?.vin || item.vin || '';
    const service = item.service_type || item.extendedProps?.serviceType || item.typedeverification || 'Inspection';

    return `
      <tr>
        <td class="fw-bold text-dark">${clientName}</td>
        <td>${phone}</td>
        <td>
          <div class="fw-semibold">${vehicle}</div>
          <small class="text-muted">${vin}</small>
        </td>
        <td><i class="bi bi-clock me-1 text-muted"></i>${timeFormatted}</td>
        <td><span class="badge bg-light text-dark border">${service}</span></td>
        <td id="chrono-${item.id}">${getRemainingTime(appDate)}</td>
        <td>
          <select class="form-select form-select-sm" onchange="updatePaymentStatus('${item.id}', this.value)">
            <option value="UNPAID" ${payStatus === 'UNPAID' ? 'selected' : ''}>Non payé</option>
            <option value="ADVANCE_PAID" ${payStatus === 'ADVANCE_PAID' ? 'selected' : ''}>Avance</option>
            <option value="FULLY_PAID" ${payStatus === 'FULLY_PAID' ? 'selected' : ''}>Payé</option>
          </select>
        </td>
        <td>
          <select class="form-select form-select-sm status-select" onchange="changeStatus('${item.id}', this.value)">
            <option value="PENDING" ${['PENDING', 'EN_ATTENTE'].includes(currentStatus) ? 'selected' : ''}>⏳ En Attente</option>
            <option value="IN_PROGRESS" ${['INCOMPLETE', 'EN_COURS', 'IN_PROGRESS'].includes(currentStatus) ? 'selected' : ''}>⚙️ En Cours</option>
            <option value="COMPLETED" ${['COMPLETED', 'TERMINE'].includes(currentStatus) ? 'selected' : ''}>✅ Terminé</option>
            <option value="CANCELLED" ${currentStatus === 'CANCELLED' ? 'selected' : ''}>❌ Annulé</option>
          </select>
        </td>
        <td class="text-end">
          <button class="btn btn-sm btn-outline-primary me-1" title="Imprimer Fiche" onclick="printAppointment('${item.id}')">
            <i class="bi bi-printer"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger" title="Annuler" onclick="cancelAppointment('${item.id}')">
            <i class="bi bi-trash"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    data.forEach(item => {
      const appDate = item.appointment_date || item.start || item.appointmentDate;
      const el = document.getElementById(`chrono-${item.id}`);
      if (el) el.innerHTML = getRemainingTime(appDate);
    });
  }, 1000);
}

// ==========================================
// 3. ACTIONS & API CALLS
// ==========================================
async function changeStatus(id, newStatus) {
  try {
    const res = await fetch(`${API_URL}/admin/appointments/${id}/status`, {
      method: 'PUT',
      headers: { 
        'Authorization': `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ status: newStatus })
    });

    if (res.ok) {
      loadDashboardData();
    } else {
      alert('Erreur lors de la mise à jour du statut.');
    }
  } catch (error) {
    console.error('Error changing status:', error);
  }
}

async function updatePaymentStatus(id, newStatus) {
  try {
    const res = await fetch(`${API_URL}/admin/appointments/${id}/payment-status`, {
      method: 'PUT',
      headers: { 
        'Authorization': `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify({ payment_status: newStatus })
    });
    if (!res.ok) throw new Error();
  } catch (err) {
    alert('Erreur lors de la mise à jour du paiement');
  }
}

function updateKPIs(data) {
  const todayStr = new Date().toISOString().split('T')[0];
  const todayCount = data.filter(a => {
    const dateVal = a.appointment_date || a.start || a.appointmentDate;
    if (!dateVal) return false;
    return new Date(dateVal).toISOString().split('T')[0] === todayStr;
  }).length;

  const pendingCount = data.filter(a => ['PENDING', 'EN_ATTENTE'].includes(a.extendedProps?.status || a.status)).length;
  const progressCount = data.filter(a => ['INCOMPLETE', 'EN_COURS', 'IN_PROGRESS'].includes(a.extendedProps?.status || a.status)).length;
  const completedCount = data.filter(a => ['COMPLETED', 'TERMINE'].includes(a.extendedProps?.status || a.status)).length;

  const countTodayEl = document.getElementById('count-today');
  const countPendingEl = document.getElementById('count-pending');
  const countProgressEl = document.getElementById('count-progress');
  const countCompletedEl = document.getElementById('count-completed');

  if (countTodayEl) countTodayEl.innerText = todayCount;
  if (countPendingEl) countPendingEl.innerText = pendingCount;
  if (countProgressEl) countProgressEl.innerText = progressCount;
  if (countCompletedEl) countCompletedEl.innerText = completedCount;
}

// ==========================================
// 4. SEARCH & EVENT LISTENERS
// ==========================================
function setupEventListeners() {
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      localStorage.removeItem('token');
      localStorage.removeItem('verifcar_reception_user');
      localStorage.removeItem('verifcar_user');
      localStorage.removeItem('verifcar_admin_user');
      window.location.href = '../Auth/auth.html';
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

  const phoneInput = document.getElementById('client-phone');
  if (phoneInput) {
    phoneInput.addEventListener('input', async (e) => {
      const phone = e.target.value.trim();
      if (phone.length >= 8) {
        try {
          const res = await fetch(`${API_URL}/clients/search?query=${encodeURIComponent(phone)}`, {
            headers: { 'Authorization': `Bearer ${getAuthToken()}` }
          });
          if (res.ok) {
            const clients = await res.json();
            if (clients.length > 0) {
              document.getElementById('client-name').value = clients[0].full_name;
              phoneInput.classList.add('is-valid');
            } else {
              phoneInput.classList.remove('is-valid');
            }
          }
        } catch (err) {
          console.error('Autofill error:', err);
        }
      }
    });
  }

  const rdvForm = document.getElementById('rdv-form');
  if (rdvForm) {
    rdvForm.addEventListener('submit', handleNewAppointment);
  }
}

setInterval(loadDashboardData, 30000);

// ==========================================
// 5. CREATE APPOINTMENT
// ==========================================
async function handleNewAppointment(e) {
  e.preventDefault();

  const selectedServices = Array.from(document.querySelectorAll('.service-checkbox:checked')).map(cb => cb.value);
  const customService = document.getElementById('service-autre').value.trim();
  if (customService) selectedServices.push(customService);

  const dateOnly = document.getElementById('rdv-date-only').value;
  const timeOnly = document.getElementById('rdv-time-only').value;
  const fullDateTime = `${dateOnly} ${timeOnly}:00`;

  const carInput = document.getElementById('car-make-model').value.trim().split(' ');
  const make = carInput[0] || 'Inconnu';
  const model = carInput.slice(1).join(' ') || 'Inconnu';

  const payload = {
    clientName: document.getElementById('client-name').value.trim(),
    phone: document.getElementById('client-phone').value.trim(),
    make: make,
    model: model,
    licensePlate: document.getElementById('car-matricule').value.trim(),
    vin: document.getElementById('car-vin').value.trim(),
    typedeverification: selectedServices.join(', '),
    appointmentDate: fullDateTime,
    totalAmount: parseFloat(document.getElementById('total-amount').value) || 0,
    versement: parseFloat(document.getElementById('versement-amount').value) || 0,
    notes: document.getElementById('vehicle-notes').value.trim(),
    paymentStatus: 'UNPAID',
    status: 'PENDING'
  };

  try {
    const res = await fetch(`${API_URL}/admin/appointments`, {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json' 
      },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      const modalEl = document.getElementById('addRendezVousModal');
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();

      document.getElementById('rdv-form').reset();
      loadDashboardData();
    } else {
      const errData = await res.json();
      alert('Erreur: ' + (errData.message || 'Impossible d\'enregistrer le rendez-vous'));
    }
  } catch (error) {
    console.error('Error creating appointment:', error);
    alert('Erreur de connexion avec le serveur.');
  }
}

// ==========================================
// 6. VIEWS, CALENDAR & UTILS
// ==========================================
function toggleView(view) {
  const tableContainer = document.getElementById('view-table-container');
  const calendarContainer = document.getElementById('view-calendar-container');
  const btnTable = document.getElementById('btn-view-table');
  const btnCalendar = document.getElementById('btn-view-calendar');

  if (view === 'table') {
    tableContainer.classList.remove('d-none');
    calendarContainer.classList.add('d-none');
    btnTable.classList.add('active');
    btnCalendar.classList.remove('active');
  } else {
    tableContainer.classList.add('d-none');
    calendarContainer.classList.remove('d-none');
    btnCalendar.classList.add('active');
    btnTable.classList.remove('active');
    renderCalendarView();
  }
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

function changeMonth(delta) {
  currentCalendarDate.setMonth(currentCalendarDate.getMonth() + delta);
  renderCalendarView();
}

function printAppointment(id) {
  window.open(`prise.de.rendez-vous.html?id=${id}`, '_blank');
}

async function cancelAppointment(id) {
  if (confirm('Êtes-vous sûr de vouloir annuler ce rendez-vous ?')) {
    await changeStatus(id, 'CANCELLED');
  }
}

function switchTab(tabName, event) {
  if (event) event.preventDefault();

  document.querySelectorAll('.tab-section').forEach(section => {
    section.classList.add('d-none');
  });

  document.querySelectorAll('.sidebar .nav-link').forEach(link => {
    link.classList.remove('active');
    link.classList.add('text-secondary');
  });

  const targetSection = document.getElementById(`section-${tabName}`);
  if (targetSection) {
    targetSection.classList.remove('d-none');
  }

  const activeTab = document.getElementById(`tab-${tabName}`);
  if (activeTab) {
    activeTab.classList.add('active');
    activeTab.classList.remove('text-secondary');
  }
}