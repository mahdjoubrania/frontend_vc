const API_URL = 'https://romantic-enjoyment-production-f458.up.railway.app/api';

let revenueChartInstance = null;
let typeChartInstance = null;
let rawRevenueData = []; 

// الحصول على توكن التوثيق من الجلسة
function getAuthToken() {
  const userSessionRaw = localStorage.getItem('verifcar_admin_user');
  if (!userSessionRaw) return '';
  try {
    const userSession = JSON.parse(userSessionRaw);
    return userSession.token || userSession.accessToken || '';
  } catch (e) {
    return '';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const userSessionRaw = localStorage.getItem('verifcar_admin_user');
  const userSession = userSessionRaw ? JSON.parse(userSessionRaw) : null;

  if (!userSession || userSession.role !== 'ADMIN') {
    alert('Accès refusé : Seul l\'administrateur est autorisé à accéder à cette page.');
    window.location.href = '../Auth/index.html';
    return;
  }

  const adminFullName = userSession.fullName || userSession.full_name || 'Admin';
  if (document.getElementById('admin-name')) document.getElementById('admin-name').innerText = adminFullName;
  if (document.getElementById('admin-welcome')) document.getElementById('admin-welcome').innerText = adminFullName.split(' ')[0];
  if (document.getElementById('admin-avatar')) document.getElementById('admin-avatar').innerText = adminFullName.charAt(0).toUpperCase();

  initMobileSidebar();
  setupFilterEvents();
  loadDashboardSummary(); // تم تصحيح استدعاء الدالة الرئيسية هنا
});

function initMobileSidebar() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('mobile-sidebar-toggle');
  const closeBtn = document.getElementById('sidebar-close-btn');

  if (toggleBtn && sidebar) toggleBtn.addEventListener('click', () => sidebar.classList.add('show'));
  if (closeBtn && sidebar) closeBtn.addEventListener('click', () => sidebar.classList.remove('show'));
}

async function loadDashboardSummary() {
  try {
    // 1. طلب بيانات اللوحة الرئيسية بالمسار الصحيح
    const res = await fetch(`${API_URL}/admin/dashboard-summary`, {
      headers: { 
        'Authorization': `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (res.ok) {
      const data = await res.json();
      
      // 2. تحديث بطاقات الإحصائيات (KPI Cards)
      if (data.users) {
        const totalUsersElem = document.getElementById('total-users-count') || document.getElementById('total-users');
        if (totalUsersElem) totalUsersElem.innerText = data.users.totalUsers || 0;
        
        if (document.getElementById('reception-count')) 
          document.getElementById('reception-count').innerText = data.users.receptionCount || 0;
        if (document.getElementById('tech-count')) 
          document.getElementById('tech-count').innerText = data.users.techCount || 0;
        if (document.getElementById('admin-count')) 
          document.getElementById('admin-count').innerText = data.users.adminCount || 0;
      }

      // 3. رسم مخطط الإيرادات
      if (data.revenue) {
        rawRevenueData = data.revenue;
        filterAndRenderRevenue();
      }

      // 4. رسم مخطط أنواع الفحوصات
      if (data.inspectionTypes) {
        initTypeChart(data.inspectionTypes);
      }
    }

    // 5. جلب جدول المواعيد الأخيرة
    loadRecentAppointments();

  } catch (error) {
    console.error("Erreur lors du chargement des statistiques:", error);
  }
}

async function loadRecentAppointments() {
  try {
    const res = await fetch(`${API_URL}/admin/appointments?limit=5`, {
      headers: { 
        'Authorization': `Bearer ${getAuthToken()}`,
        'Content-Type': 'application/json'
      }
    });
    if (res.ok) {
      const appointments = await res.json();
      renderRecentTickets(Array.isArray(appointments) ? appointments.slice(0, 5) : []);
    }
  } catch (error) {
    console.error("Erreur lors du chargement des rendez-vous récents:", error);
  }
}

function setupFilterEvents() {
  const periodSelect = document.getElementById('revenue-period-select');
  const applyBtn = document.getElementById('apply-date-btn');

  periodSelect?.addEventListener('change', () => {
    const customInputs = document.getElementById('custom-date-inputs');
    if (periodSelect.value === 'custom') {
      customInputs?.classList.remove('d-none');
    } else {
      customInputs?.classList.add('d-none');
      filterAndRenderRevenue();
    }
  });

  applyBtn?.addEventListener('click', filterAndRenderRevenue);
}

function filterAndRenderRevenue() {
  const period = document.getElementById('revenue-period-select')?.value || 'year';
  const now = new Date();

  if (period === 'year') {
    const monthLabels = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
    const totalPrixMonthly = new Array(12).fill(0);
    const versementMonthly = new Array(12).fill(0);

    rawRevenueData.forEach(item => {
      const monthIndex = Number(item.month) - 1;
      if (monthIndex >= 0 && monthIndex < 12) {
        totalPrixMonthly[monthIndex] += Number(item.total_prix) || 0;
        versementMonthly[monthIndex] += Number(item.total_versement) || 0;
      }
    });

    renderRevenueChart(monthLabels, totalPrixMonthly, versementMonthly);
    return;
  }

  let datesList = [];

  if (period === 'month') {
    const year = now.getFullYear();
    const month = now.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(Date.UTC(year, month, day));
      datesList.push(d.toISOString().split('T')[0]);
    }
  } else if (period === '15days') {
    for (let i = 14; i >= 0; i--) {
      const d = new Date();
      d.setDate(now.getDate() - i);
      datesList.push(d.toISOString().split('T')[0]);
    }
  } else if (period === 'custom') {
    const startVal = document.getElementById('start-date')?.value;
    const endVal = document.getElementById('end-date')?.value;

    if (startVal && endVal) {
      let current = new Date(startVal);
      const end = new Date(endVal);
      while (current <= end) {
        datesList.push(current.toISOString().split('T')[0]);
        current.setDate(current.getDate() + 1);
      }
    }
  }

  const totalsMap = {};
  const versementsMap = {};

  datesList.forEach(d => {
    totalsMap[d] = 0;
    versementsMap[d] = 0;
  });

  rawRevenueData.forEach(item => {
    const itemDate = item.date ? item.date.split('T')[0] : null;
    if (itemDate && totalsMap.hasOwnProperty(itemDate)) {
      totalsMap[itemDate] += Number(item.total_prix) || 0;
      versementsMap[itemDate] += Number(item.total_versement) || 0;
    }
  });

  const displayLabels = datesList.map(d => {
    const parts = d.split('-');
    return `${parts[2]}/${parts[1]}`;
  });

  const totalsData = datesList.map(d => totalsMap[d]);
  const versementsData = datesList.map(d => versementsMap[d]);

  renderRevenueChart(displayLabels, totalsData, versementsData);
}

function renderRevenueChart(labels, totalPrixData, versementData) {
  const ctx = document.getElementById('revenueChart');
  if (!ctx) return;

  if (revenueChartInstance) revenueChartInstance.destroy();

  revenueChartInstance = new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [
        {
          label: 'Total Prix (DZD)',
          data: totalPrixData,
          borderColor: '#de61f1',
          backgroundColor: 'rgba(222, 97, 241, 0.08)',
          fill: true,
          tension: 0.4,
          borderWidth: 3,
          pointRadius: 4
        },
        {
          label: 'Versement (DZD)',
          data: versementData,
          borderColor: '#56c8e8',
          backgroundColor: 'rgba(86, 200, 232, 0.08)',
          fill: true,
          tension: 0.4,
          borderWidth: 3,
          pointRadius: 4
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: 'top' },
        tooltip: {
          callbacks: { label: ctx => `${ctx.dataset.label}: ${ctx.raw.toLocaleString()} DZD` }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: { callback: val => val.toLocaleString() + ' DZD' }
        }
      }
    }
  });
}

function initTypeChart(inspectionTypes) {
  const typeCtx = document.getElementById('typeChart');
  if (!typeCtx) return;

  if (typeChartInstance) typeChartInstance.destroy();

  const labels = (inspectionTypes && inspectionTypes.length > 0) ? inspectionTypes.map(i => i.label) : ['Aucune donnée'];
  const counts = (inspectionTypes && inspectionTypes.length > 0) ? inspectionTypes.map(i => i.count) : [1];

  typeChartInstance = new Chart(typeCtx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: counts,
        backgroundColor: ['#2563eb', '#f59e0b', '#10b981', '#8b5cf6', '#ef4444'],
        borderWidth: 0
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom' } },
      cutout: '70%'
    }
  });
}

function renderRecentTickets(tickets) {
  const tableBody = document.getElementById('recent-tickets-body');
  if (!tableBody) return;

  if (!tickets || tickets.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3">Aucun rendez-vous récent</td></tr>`;
    return;
  }

  tableBody.innerHTML = '';
  tickets.forEach(ticket => {
    const ticketNum = ticket.ticket_number || ticket.id || '-';
    const clientName = ticket.client_name || ticket.client_full_name || 'N/A';
    const vehicleName = ticket.vehicle_name || (ticket.brand ? `${ticket.brand} ${ticket.model || ''}` : 'N/A');

    const row = `
      <tr>
        <td class="fw-bold text-primary">#RDV-${ticketNum}</td>
        <td><div class="fw-semibold text-dark">${clientName}</div></td>
        <td>${vehicleName}</td>
        <td>${formatDateTime(ticket.appointment_date)}</td>
        <td><span class="badge ${getStatusBadgeClass(ticket.status)} px-2 py-1">${ticket.status || 'PENDING'}</span></td>
        <td class="fw-bold text-dark">${ticket.total_amount ? Number(ticket.total_amount).toLocaleString() + ' DZD' : '-'}</td>
      </tr>
    `;
    tableBody.insertAdjacentHTML('beforeend', row);
  });
}

function getStatusBadgeClass(status) {
  switch (status?.toUpperCase()) {
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
  
  // التعامل مع النص المباشر لمنع تحويل التوقيت تلقائياً
  const cleanStr = dateTimeStr.replace('T', ' ').replace('Z', '');
  const parts = cleanStr.split(' ');
  const dateParts = parts[0].split('-');
  const timeParts = parts[1] ? parts[1].split(':') : ['00', '00'];

  const formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
  const formattedTime = `${timeParts[0]}:${timeParts[1]}`;

  return `${formattedDate} ${formattedTime}`;
}