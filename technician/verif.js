const API_URL = 'https://romantic-enjoyment-production-f458.up.railway.app/api';
let currentInspectionId = null; 

// إشعار أنيق بدل alert() الافتراضي — type: success / danger / warning
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) {
    alert(message);
    return;
  }

  const icons = {
    success: 'bi-check-circle-fill',
    danger: 'bi-x-circle-fill',
    warning: 'bi-exclamation-triangle-fill'
  };
  const bg = {
    success: 'text-bg-success',
    danger: 'text-bg-danger',
    warning: 'text-bg-warning'
  };

  const toastEl = document.createElement('div');
  toastEl.className = `toast align-items-center ${bg[type] || bg.success} border-0 shadow-lg mb-2`;
  toastEl.setAttribute('role', 'alert');
  toastEl.setAttribute('aria-live', 'assertive');
  toastEl.setAttribute('aria-atomic', 'true');
  toastEl.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">
        <i class="bi ${icons[type] || icons.success} me-2"></i>${message}
      </div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
    </div>
  `;
  container.appendChild(toastEl);
  const bsToast = new bootstrap.Toast(toastEl, { delay: 4000 });
  bsToast.show();
  toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
}
let activeDrawingColor = '#dc3545';
let activeMarkType = 'choc';
let cachedDetails = null;
let appointmentsList = [];

// 1. استخراج التوكن بشكل دقيق وقراءة المفاتيح المحتملة كافة
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
        // في حال كان المحتوى نصياً وليس JSON
        if (sessionData.length > 20) return sessionData;
      }
    }
  }

  return localStorage.getItem('token') || '';
}

// 2. جلب بيانات المستخدم المسجل
function getAuthUser() {
  const sessionKeys = [
    'verifcar_technician_user',
    'verifcar_admin_user',
    'verifcar_reception_user',
    'verifcar_user',
    'user'
  ];

  for (const key of sessionKeys) {
    const rawUser = localStorage.getItem(key);
    if (rawUser) {
      try {
        return JSON.parse(rawUser);
      } catch (e) {
        return {};
      }
    }
  }
  return {};
}

// تهيئة الواجهة عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
  initUIComponents();
  loadAppointments();
});

function initUIComponents() {
  const sidebar = document.getElementById('sidebar');
  const toggleBtn = document.getElementById('sidebar-toggle-btn');
  const closeBtn = document.getElementById('sidebar-close-btn');
  const overlay = document.getElementById('sidebar-overlay');
  const logoutBtn = document.getElementById('logout-btn');

  if (toggleBtn && sidebar && overlay) {
    toggleBtn.addEventListener('click', () => {
      sidebar.classList.add('show');
      overlay.classList.add('show');
    });
  }

  const closeSidebar = () => {
    if (sidebar) sidebar.classList.remove('show');
    if (overlay) overlay.classList.remove('show');
  };

  if (closeBtn) closeBtn.addEventListener('click', closeSidebar);
  if (overlay) overlay.addEventListener('click', closeSidebar);

  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (confirm('Voulez-vous vraiment vous déconnecter ?')) {
        localStorage.clear();
        window.location.href = '../Auth/index.html';
      }
    });
  }

  const user = getAuthUser();
  const adminName = document.getElementById('admin-name');
  const adminAvatar = document.getElementById('admin-avatar');
  const mobileAvatar = document.getElementById('mobile-avatar');

  const fullName = user.fullName || user.full_name || user.username || 'Technicien';
  if (adminName) adminName.textContent = fullName;
  const initials = fullName.substring(0, 2).toUpperCase();
  if (adminAvatar) adminAvatar.textContent = initials;
  if (mobileAvatar) mobileAvatar.textContent = initials;
}

// جلب قائمة المواعيد المتاحة
async function loadAppointments() {
  const select = document.getElementById('select-rdv');
  if (!select) return;

  const token = getAuthToken();
  if (!token) {
    select.innerHTML = '<option value="">Erreur: Session expirée</option>';
    return;
  }

  try {
    const response = await fetch(`${API_URL}/admin/appointments/today`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const res = await response.json();
    let rawList = Array.isArray(res) ? res : (res.data || res.appointments || []);
    appointmentsList = rawList;

    select.innerHTML = '<option value="">-- Choisir un RDV --</option>';

    if (rawList.length > 0) {
      rawList.forEach(rdv => {
        const option = document.createElement('option');
        option.value = rdv.id;
        
        const client = rdv.client_name || 'Client';
        const vehicle = rdv.vehicle_name || 'Véhicule';
        const status = rdv.status ? ` [${rdv.status}]` : '';

        option.textContent = `#RDV-${rdv.id} - ${client} (${vehicle})${status}`;
        select.appendChild(option);
      });
    } else {
      select.innerHTML = '<option value="">Aucun RDV disponible pour le moment</option>';
    }
  } catch (err) {
    console.error("خطأ في جلب المواعيد:", err);
    select.innerHTML = '<option value="">Erreur de chargement des RDV</option>';
  }
}

async function onAppointmentSelect(appointmentId) {
  const newId = appointmentId ? parseInt(appointmentId) : null;
  const selectEl = document.getElementById('select-rdv');
  const previousId = currentInspectionId;

  // لو كان فيه موعد محدد سابقاً وبنبدّله لموعد ثاني
  if (previousId && previousId !== newId) {
    const hasData = await appointmentHasSavedData(previousId);

    if (hasData) {
      const confirmed = confirm(
        "Des données sont déjà enregistrées pour ce rendez-vous. Voulez-vous vraiment changer de véhicule ?\n" +
        "عندك بيانات محفوظة على هذا الموعد. متأكد تبي تبدّل السيارة؟"
      );
      if (!confirmed) {
        // إلغاء التبديل: نرجّع الـ select لقيمته القديمة
        if (selectEl) selectEl.value = previousId;
        return;
      }
    } else {
      // ما فيه أي بيانات محفوظة -> اختيار غير مقصود، نرجّع حالته تلقائياً
      await updateAppointmentStatus(previousId, 'READY_FOR_WORKSHOP');
    }
  }

  currentInspectionId = newId;
  const selected = appointmentsList.find(a => a.id == appointmentId);
  
  if (selected) {
    document.getElementById('info-client-name').textContent = selected.client_name || selected.client || '--';
    document.getElementById('info-client-phone').textContent = selected.phone || selected.client_phone || '--';
    document.getElementById('info-vehicle-name').textContent = selected.vehicle_name || selected.vehicle || '--';
    document.getElementById('info-vehicle-plate').textContent = selected.license_plate || selected.plate || '--';
    document.getElementById('info-vehicle-vin').textContent = selected.VIN || selected.vin || '--';
  } else {
    document.getElementById('info-client-name').textContent = '--';
    document.getElementById('info-client-phone').textContent = '--';
    document.getElementById('info-vehicle-name').textContent = '--';
    document.getElementById('info-vehicle-plate').textContent = '--';
    document.getElementById('info-vehicle-vin').textContent = '--';
  }

  updateCompleteButtonVisibility();

  if (currentInspectionId) {
    // دخول الورشة تلقائياً عند اختيار الموعد
    await updateAppointmentStatus(currentInspectionId, 'IN_WORKSHOP');
  }
}

// تحقق هل فيه بيانات محفوظة فعلاً لهذا الموعد (أي وحدة فحص واحدة على الأقل)
async function appointmentHasSavedData(inspectionId) {
  if (!inspectionId) return false;
  const token = getAuthToken();
  try {
    const res = await fetch(`${API_URL}/inspection/details/${inspectionId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (!res.ok) return false;
    const result = await res.json();
    return !!(result.success && result.data && result.data.inspection);
  } catch (e) {
    return false;
  }
}

// تحديث حالة الموعد بالباك‌إند (دخول الورشة / إعادة الجاهزية / الاكتمال)
async function updateAppointmentStatus(appointmentId, status) {
  const token = getAuthToken();
  try {
    await fetch(`${API_URL}/admin/appointments/${appointmentId}/status`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ status })
    });
  } catch (err) {
    console.error('Erreur mise à jour du statut:', err);
  }
}

// إظهار/إخفاء زر إنهاء الفحص حسب وجود موعد محدد
function updateCompleteButtonVisibility() {
  const btn = document.getElementById('btn-complete-inspection');
  if (!btn) return;
  btn.classList.toggle('d-none', !currentInspectionId);
}

// إنهاء الفحص يدوياً (الزر الجديد)
async function completeInspection() {
  if (!currentInspectionId) {
    showToast("Veuillez d'abord sélectionner un rendez-vous.", 'warning');
    return;
  }

  const hasData = await appointmentHasSavedData(currentInspectionId);
  if (!hasData) {
    showToast(
      "Aucune donnée enregistrée. Veuillez enregistrer au moins un module avant de terminer / لازم تحفظ وحدة واحدة على الأقل قبل الإنهاء.",
      'warning'
    );
    return;
  }

  const confirmed = confirm(
    "Êtes-vous sûr de vouloir terminer ce contrôle ? Cette action clôturera le rendez-vous.\n" +
    "متأكد تبي تنهي الفحص؟ هذا الإجراء يقفل الموعد."
  );
  if (!confirmed) return;

  const token = getAuthToken();
  try {
    const res = await fetch(`${API_URL}/inspection/complete/${currentInspectionId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    const result = await res.json();

    if (res.ok && result.success) {
      showToast('Contrôle terminé avec succès / تم إنهاء الفحص بنجاح', 'success');
      closeModule();
      currentInspectionId = null;
      updateCompleteButtonVisibility();
      loadAppointments();
    } else {
      showToast('Erreur: ' + (result.error || 'Impossible de terminer le contrôle.'), 'danger');
    }
  } catch (err) {
    showToast('Impossible de contacter le serveur.', 'danger');
    console.error(err);
  }
}

async function loadInspectionData(inspectionId) {
  const token = getAuthToken();
  try {
    const response = await fetch(`${API_URL}/inspection/details/${inspectionId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });

    if (response.status === 401) {
      alert('Session expirée. Veuillez vous reconnecter.');
      window.location.href = '../Auth/index.html';
      return;
    }

    const res = await response.json();
    cachedDetails = res.success ? res.data : null;
  } catch (err) {
    console.error("خطأ في تحميل تفاصيل الفحص:", err);
    cachedDetails = null;
  }
}

async function openModule(moduleType) {
  if (!currentInspectionId) {
    showToast("Veuillez d'abord sélectionner un rendez-vous dans la liste.", 'warning');
    return;
  }

  await loadInspectionData(currentInspectionId);
  const data = cachedDetails || {};

  document.getElementById('modules-selection-view').classList.add('d-none');
  document.getElementById('active-module-view').classList.remove('d-none');

  const title = document.getElementById('active-module-title');
  const content = document.getElementById('module-content-body');

  switch (moduleType) {
    case 'scanner':
      title.innerHTML = `<i class="fa-solid fa-laptop-code text-primary me-2"></i> Scanner Diagnostique`;
      content.innerHTML = renderScannerModule(data.scanner || {});
      break;
    case 'moteur':
      title.innerHTML = `<i class="fa-solid fa-car-battery text-warning me-2"></i> Moteur & Niveaux`;
      content.innerHTML = renderMoteurModule(data.moteur || {});
      break;
    case 'suspension':
      title.innerHTML = `<i class="fa-solid fa-truck-monster text-info me-2"></i> Suspension & Train`;
      content.innerHTML = renderSuspensionModule(data.suspension || {});
      break;
    case 'kilometrage':
      title.innerHTML = `<i class="fa-solid fa-gauge text-success me-2"></i> Kilométrage & Conformation`;
      content.innerHTML = renderKilometrageModule(data.kilometrage || {});
      break;
    case 'tole':
      title.innerHTML = `<i class="fa-solid fa-spray-can text-danger me-2"></i> Tôle & Carrosserie`;
      content.innerHTML = renderToleModule(data.tole || {});
      currentImageIndex = 0;
      drawingsMap = (data.tole && data.tole.elements_ext_json && data.tole.elements_ext_json.drawings) || {};
      initCanvas(drawingsMap[0] || null);
      break;
    
    // 🟢 إضافة الحالة الجديدة هنا:
    case 'general':
      title.innerHTML = `<i class="fa-solid fa-clipboard-check me-2" style="color: #6f42c1;"></i> Observations Générales & Rapport`;
      content.innerHTML = renderGeneralModule(data.general || {});
      break;
  }
}

function closeModule() {
  document.getElementById('active-module-view').classList.add('d-none');
  document.getElementById('modules-selection-view').classList.remove('d-none');
}

function renderScannerModule(data = {}) {
  return `
    <form id="form-scanner" onsubmit="saveScannerModule(event)">
      <div class="row g-3">
        <div class="col-md-6">
          <label class="form-label fw-semibold">Statut Calculateur / حالة الكمبيوتر</label>
          <select class="form-select" id="calculateur_status">
            <option value="OK" ${data.calculateur_status === 'OK' ? 'selected' : ''}>OK (Aucune erreur majeure / لا يوجد خطأ كبير)</option>
            <option value="DEFAUT" ${data.calculateur_status === 'DEFAUT' ? 'selected' : ''}>DÉFAUT (Anomalie détectée / تم كشف عطل)</option>
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label fw-semibold">Voyants Allumés / لمبات التحذير المضاءة</label>
          <input type="text" class="form-control" id="voyants_allumes" value="${data.voyants_allumes || ''}" placeholder="Ex: Check Engine, ABS / مثال: لمبة المحرك، ABS">
        </div>
        <div class="col-12">
          <label class="form-label fw-semibold">Codes d'Erreurs DTC / أكواد الأعطال</label>
          <textarea class="form-control" id="dtc_codes" rows="3" placeholder="Ex: P0300, P0171">${data.dtc_codes || ''}</textarea>
        </div>
        <div class="col-12">
          <label class="form-label fw-semibold">Notes / Observations / ملاحظات</label>
          <textarea class="form-control" id="scanner_notes" rows="2">${data.notes || ''}</textarea>
        </div>
      </div>
      <button type="submit" class="btn btn-primary px-4 mt-3 rounded-3"><i class="bi bi-save me-1"></i> Sauvegarder Scanner / حفظ جهاز الفحص</button>
    </form>`;
}

function renderMoteurModule(data = {}) {
  return `
    <form id="form-moteur" onsubmit="saveMoteurModule(event)">
      <div class="row g-3">
        <div class="col-md-4">
          <label class="form-label fw-semibold">Niveau d'Huile / مستوى الزيت</label>
          <select class="form-select" id="niveau_huile">
            <option value="OK" ${data.niveau_huile === 'OK' ? 'selected' : ''}>OK / جيد</option>
            <option value="BAS" ${data.niveau_huile === 'BAS' ? 'selected' : ''}>BAS / ناقص</option>
            <option value="ANORMAL" ${data.niveau_huile === 'ANORMAL' ? 'selected' : ''}>ANORMAL / غير طبيعي</option>
          </select>
        </div>
        <div class="col-md-4">
          <label class="form-label fw-semibold">Fumée d'Échappement / دخان العادم</label>
          <select class="form-select" id="fumee_echappement">
            <option value="AUCUNE" ${data.fumee_echappement === 'AUCUNE' ? 'selected' : ''}>AUCUNE / لا يوجد</option>
            <option value="BLANCHE" ${data.fumee_echappement === 'BLANCHE' ? 'selected' : ''}>BLANCHE / أبيض</option>
            <option value="NOIRE" ${data.fumee_echappement === 'NOIRE' ? 'selected' : ''}>NOIRE / أسود</option>
            <option value="BLEUE" ${data.fumee_echappement === 'BLEUE' ? 'selected' : ''}>BLEUE / أزرق</option>
          </select>
        </div>
        <div class="col-md-4 d-flex align-items-center gap-3 pt-4">
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="fuite_huile" ${data.fuite_huile ? 'checked' : ''}>
            <label class="form-check-label" for="fuite_huile">Fuite Huile / تسريب زيت</label>
          </div>
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="fuite_liquide_refroidissement" ${data.fuite_liquide_refroidissement ? 'checked' : ''}>
            <label class="form-check-label" for="fuite_liquide_refroidissement">Fuite Liquide / تسريب ماء الرادياتير</label>
          </div>
        </div>
        <div class="col-12">
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="bruit_moteur" ${data.bruit_moteur ? 'checked' : ''}>
            <label class="form-check-label fw-semibold" for="bruit_moteur">Bruit Anormal Moteur / صوت محرك غير طبيعي</label>
          </div>
        </div>
        <div class="col-12">
          <label class="form-label fw-semibold">Notes Moteur / ملاحظات المحرك</label>
          <textarea class="form-control" id="moteur_notes" rows="2">${data.notes || ''}</textarea>
        </div>
      </div>
      <button type="submit" class="btn btn-primary px-4 mt-3 rounded-3"><i class="bi bi-save me-1"></i> Sauvegarder Moteur / حفظ المحرك</button>
    </form>`;
}

function renderSuspensionModule(data = {}) {
  return `
    <form id="suspensionForm" onsubmit="saveSuspensionModule(event)">
      <div class="card shadow-sm border-0 mb-4 rounded-3">
        <div class="card-body p-4">
          
          <!-- Section 1: Usure Pneus -->
          <h6 class="fw-bold text-secondary mb-3 border-bottom pb-2">
            <i class="bi bi-circle-square me-1"></i> Usure des Pneus / تآكل العجلات
          </h6>
          <div class="row g-3 mb-4">
            <!-- AVG -->
            <div class="col-md-6 col-lg-3">
              <div class="p-3 border rounded bg-light">
                <label class="form-label fw-bold d-block text-center">Pneu AVG (أمامي أيسر)</label>
                <div class="btn-group w-100 mb-2" role="group">
                  <input type="radio" class="btn-check" name="usure_pneu_avg" id="avg_ok" value="Conforme" ${data.usure_pneu_avg !== 'Défaut' ? 'checked' : ''}>
                  <label class="btn btn-outline-success border-2" for="avg_ok">Conforme / سليم</label>
                  
                  <input type="radio" class="btn-check" name="usure_pneu_avg" id="avg_defaut" value="Défaut" ${data.usure_pneu_avg === 'Défaut' ? 'checked' : ''}>
                  <label class="btn btn-outline-danger border-2" for="avg_defaut">Défaut / خلل</label>
                </div>
                <input type="text" class="form-control form-control-sm" name="obs_pneu_avg" value="${data.obs_pneu_avg || ''}" placeholder="Observation / ملاحظة">
              </div>
            </div>

            <!-- AVD -->
            <div class="col-md-6 col-lg-3">
              <div class="p-3 border rounded bg-light">
                <label class="form-label fw-bold d-block text-center">Pneu AVD (أمامي أيمن)</label>
                <div class="btn-group w-100 mb-2" role="group">
                  <input type="radio" class="btn-check" name="usure_pneu_avd" id="avd_ok" value="Conforme" ${data.usure_pneu_avd !== 'Défaut' ? 'checked' : ''}>
                  <label class="btn btn-outline-success border-2" for="avd_ok">Conforme / سليم</label>
                  
                  <input type="radio" class="btn-check" name="usure_pneu_avd" id="avd_defaut" value="Défaut" ${data.usure_pneu_avd === 'Défaut' ? 'checked' : ''}>
                  <label class="btn btn-outline-danger border-2" for="avd_defaut">Défaut / خلل</label>
                </div>
                <input type="text" class="form-control form-control-sm" name="obs_pneu_avd" value="${data.obs_pneu_avd || ''}" placeholder="Observation / ملاحظة">
              </div>
            </div>

            <!-- ARG -->
            <div class="col-md-6 col-lg-3">
              <div class="p-3 border rounded bg-light border-warning">
                <label class="form-label fw-bold d-block text-center text-dark">Pneu ARG (خلفي أيسر)</label>
                <div class="btn-group w-100 mb-2" role="group">
                  <input type="radio" class="btn-check" name="usure_pneu_arg" id="arg_ok" value="Conforme" ${data.usure_pneu_arg !== 'Défaut' ? 'checked' : ''}>
                  <label class="btn btn-outline-success border-2" for="arg_ok">Conforme / سليم</label>
                  
                  <input type="radio" class="btn-check" name="usure_pneu_arg" id="arg_defaut" value="Défaut" ${data.usure_pneu_arg === 'Défaut' ? 'checked' : ''}>
                  <label class="btn btn-outline-danger border-2" for="arg_defaut">Défaut / خلل</label>
                </div>
                <input type="text" class="form-control form-control-sm" name="obs_pneu_arg" value="${data.obs_pneu_arg || ''}" placeholder="Observation / ملاحظة">
              </div>
            </div>

            <!-- ARD -->
            <div class="col-md-6 col-lg-3">
              <div class="p-3 border rounded bg-light border-warning">
                <label class="form-label fw-bold d-block text-center text-dark">Pneu ARD (خلفي أيمن)</label>
                <div class="btn-group w-100 mb-2" role="group">
                  <input type="radio" class="btn-check" name="usure_pneu_ard" id="ard_ok" value="Conforme" ${data.usure_pneu_ard !== 'Défaut' ? 'checked' : ''}>
                  <label class="btn btn-outline-success border-2" for="ard_ok">Conforme / سليم</label>
                  
                  <input type="radio" class="btn-check" name="usure_pneu_ard" id="ard_defaut" value="Défaut" ${data.usure_pneu_ard === 'Défaut' ? 'checked' : ''}>
                  <label class="btn btn-outline-danger border-2" for="ard_defaut">Défaut / خلل</label>
                </div>
                <input type="text" class="form-control form-control-sm" name="obs_pneu_ard" value="${data.obs_pneu_ard || ''}" placeholder="Observation / ملاحظة">
              </div>
            </div>
          </div>

          <!-- Section 2: État Jantes -->
          <h6 class="fw-bold text-secondary mb-3 border-bottom pb-2">
            <i class="bi bi-gear-wide-connected me-1"></i> État des Jantes / حالة الجنوط
          </h6>
          <div class="row g-3 mb-4">
            <div class="col-6 col-md-3">
              <label class="form-label text-muted small mb-1">Jante AVG (أمامي أيسر)</label>
              <select class="form-select mb-1" name="jante_avg">
                <option value="Conforme" ${data.jante_avg !== 'Défaut' ? 'selected' : ''}>Conforme / سليم</option>
                <option value="Défaut" ${data.jante_avg === 'Défaut' ? 'selected' : ''}>Défaut / خلل</option>
              </select>
              <input type="text" class="form-control form-control-sm" name="jante_avg_obs" value="${data.jante_avg_obs || ''}" placeholder="Observation / ملاحظة">
            </div>
            <div class="col-6 col-md-3">
              <label class="form-label text-muted small mb-1">Jante AVD (أمامي أيمن)</label>
              <select class="form-select mb-1" name="jante_avd">
                <option value="Conforme" ${data.jante_avd !== 'Défaut' ? 'selected' : ''}>Conforme / سليم</option>
                <option value="Défaut" ${data.jante_avd === 'Défaut' ? 'selected' : ''}>Défaut / خلل</option>
              </select>
              <input type="text" class="form-control form-control-sm" name="jante_avd_obs" value="${data.jante_avd_obs || ''}" placeholder="Observation / ملاحظة">
            </div>
            <div class="col-6 col-md-3">
              <label class="form-label text-muted small mb-1">Jante ARG (خلفي أيسر)</label>
              <select class="form-select mb-1" name="jante_arg">
                <option value="Conforme" ${data.jante_arg !== 'Défaut' ? 'selected' : ''}>Conforme / سليم</option>
                <option value="Défaut" ${data.jante_arg === 'Défaut' ? 'selected' : ''}>Défaut / خلل</option>
              </select>
              <input type="text" class="form-control form-control-sm" name="jante_arg_obs" value="${data.jante_arg_obs || ''}" placeholder="Observation / ملاحظة">
            </div>
            <div class="col-6 col-md-3">
              <label class="form-label text-muted small mb-1">Jante ARD (خلفي أيمن)</label>
              <select class="form-select mb-1" name="jante_ard">
                <option value="Conforme" ${data.jante_ard !== 'Défaut' ? 'selected' : ''}>Conforme / سليم</option>
                <option value="Défaut" ${data.jante_ard === 'Défaut' ? 'selected' : ''}>Défaut / خلل</option>
              </select>
              <input type="text" class="form-control form-control-sm" name="jante_ard_obs" value="${data.jante_ard_obs || ''}" placeholder="Observation / ملاحظة">
            </div>
          </div>

          <!-- Section 3: Soubassement -->
          <h6 class="fw-bold text-secondary mb-3 border-bottom pb-2">
            <i class="bi bi-shield-shaded me-1"></i> Soubassement / الهيكل السفلي
          </h6>
          <div class="row g-3 mb-4">
            <div class="col-md-6">
              <div class="p-3 border rounded">
                <div class="form-check form-switch d-flex justify-content-between align-items-center ps-0">
                  <label class="form-check-label fw-bold" for="corrosion">Corrosion soubassement / صدى الهيكل السفلي</label>
                  <input class="form-check-input ms-0" type="checkbox" role="switch" id="corrosion" name="corrosion_soubassement" ${data.corrosion_soubassement ? 'checked' : ''}>
                </div>
              </div>
            </div>
            <div class="col-md-6">
              <div class="p-3 border rounded">
                <div class="form-check form-switch d-flex justify-content-between align-items-center ps-0">
                  <label class="form-check-label fw-bold" for="traces_choc">Traces de choc dessous véhicule / آثار صدمات أسفل المركبة</label>
                  <input class="form-check-input ms-0" type="checkbox" role="switch" id="traces_choc" name="traces_choc" ${data.traces_choc ? 'checked' : ''}>
                </div>
              </div>
            </div>
          </div>

          <!-- Submit Button -->
          <div class="text-end pt-2">
            <button type="submit" class="btn btn-primary px-4 py-2 fw-bold shadow-sm">
              <i class="bi bi-save me-1"></i> Sauvegarder / حفظ البيانات
            </button>
          </div>

        </div>
      </div>   
    </form>`;
}

function renderKilometrageModule(data = {}) {
  const statusVal = (data.conformite !== undefined && data.conformite !== null ? String(data.conformite) : 'real').toUpperCase();

  const options = [
    { value: 'REAL', icon: 'bi-check-circle-fill', color: 'success', fr: 'Réel', ar: 'حقيقي' },
    { value: 'SUSPECT', icon: 'bi-x-circle-fill', color: 'danger', fr: 'Falsifié', ar: 'غير حقيقي (معدل)' },
    { value: 'UNCERTAIN', icon: 'bi-question-circle-fill', color: 'warning', fr: 'Incertain', ar: 'لا يمكن الجزم' }
  ];

  return `
    <form id="form-kilometrage" onsubmit="saveKilometrageModule(event)" dir="rtl" class="p-1">

      <!-- 1. القراءة -->
      <div class="card border-0 shadow-sm rounded-4 mb-4 overflow-hidden">
        <div class="card-header bg-dark text-white py-3">
          <h5 class="m-0 fw-bold"><i class="bi bi-speedometer2 me-2"></i>1. قراءة العداد (Relevé Kilométrage)</h5>
        </div>
        <div class="card-body p-4">
          <label class="form-label fw-bold text-dark mb-2">الكيلومترات المعروضة على العداد / Kilométrage Affiché (KM)</label>
          <input type="number" class="form-control form-control-lg rounded-3" id="kilometrage_affiche" required
                 value="${data.kilometrage_affiche || ''}" placeholder="Ex: 125000">
        </div>
      </div>

      <!-- 2. حالة المطابقة -->
      <div class="card border-0 shadow-sm rounded-4 mb-4 overflow-hidden">
        <div class="card-header bg-dark text-white py-3">
          <h5 class="m-0 fw-bold"><i class="bi bi-patch-check-fill me-2"></i>2. حالة المطابقة (Conformité)</h5>
        </div>
        <div class="card-body p-3">
          <div class="row g-3">
            ${options.map(opt => `
              <div class="col-md-4">
                <input type="radio" class="btn-check" name="conforme" id="km_${opt.value}" value="${opt.value.toLowerCase()}" ${statusVal === opt.value ? 'checked' : ''}>
                <label class="btn btn-outline-${opt.color} w-100 py-3 rounded-3 fw-bold" for="km_${opt.value}">
                  <i class="bi ${opt.icon} fs-4 d-block mb-1"></i>
                  ${opt.ar}<br><small class="fw-normal">${opt.fr}</small>
                </label>
              </div>
            `).join('')}
          </div>
        </div>
      </div>

      <!-- 3. الملاحظات وحفظ -->
      <div class="card border-0 shadow-sm rounded-4 mb-4 bg-light">
        <div class="card-body p-4">
          <label class="form-label fw-bold text-dark mb-2">ملاحظات وأسباب التقييم / Notes & Remarques</label>
          <textarea class="form-control rounded-3 shadow-none border mb-3" id="km_notes" rows="3"
                    placeholder="Ex: Traces d'usure incohérentes, calculateur non accessible...">${data.notes || ''}</textarea>
          <button type="submit" class="btn btn-success btn-lg px-5 py-3 fw-bold w-100 rounded-3 shadow-lg hover-scale">
            <i class="bi bi-check-circle-fill me-2"></i> حفظ العداد / Sauvegarder Kilométrage
          </button>
        </div>
      </div>

    </form>`;
}

// 1. إعادة بناء واجهة وحدة الهيكل (Tôle & Carrosserie) لتشمل مخطط السيارة الملون وأدوات التلوين
function renderToleModule(data = {}) {
  const structControls = [
    { name: "longerons", fr: "Longerons", ar: "العوارض الطولية (لونجرون)" },
    { name: "traverses", fr: "Traverses", ar: "العوارض العرضية (ترافيرس)" },
    { name: "passage_roues", fr: "Passage de roues", ar: "ممر العجلات (باساج)" },
    { name: "fond_coffre", fr: "Fond coffre", ar: "أرضية الصندوق" },
    { name: "chassis", fr: "Châssis", ar: "الهيكل الأساسي (شاسي)" },
    { name: "optique", fr: "Optique", ar: "الأضواء (الأوبتيك)" },
    { name: "vitre", fr: "Vitre", ar: "الزجاج" }
  ];

  return `
    <form id="form-tole" onsubmit="saveToleModule(event)" dir="rtl" class="p-1">
      
      <!-- 1. معرض الصور التفاعلي (Carrousel Photos) -->
      <div class="card border-0 shadow-sm rounded-4 mb-4 overflow-hidden">
        <div class="card-header bg-dark text-white py-3 d-flex justify-content-between align-items-center">
          <h5 class="m-0 fw-bold"><i class="bi bi-images me-2"></i> مخططات السيارة (Carrousel Photos)</h5>
          <span class="badge bg-secondary fs-6" id="carousel-indicator">1 / 5</span>
        </div>
        <div class="card-body bg-light text-center p-3 position-relative">
          
          <div class="carousel-container mx-auto position-relative" style="max-width: 750px; min-height: 380px;">
            <!-- زر السابق -->
            <button type="button" class="btn btn-dark position-absolute top-50 start-0 translate-middle-y z-3 rounded-circle opacity-75 ms-2" onclick="changeCarImage(-1)">
              <i class="bi bi-chevron-right fs-4"></i>
            </button>

            <!-- منطقة الرسم Canvas -->
            <canvas id="car-canvas" width="750" height="380" class="border rounded-3 bg-white shadow-sm" style="touch-action: none; cursor: crosshair;"></canvas>

            <!-- زر التالي -->
            <button type="button" class="btn btn-dark position-absolute top-50 end-0 translate-middle-y z-3 rounded-circle opacity-75 me-2" onclick="changeCarImage(1)">
              <i class="bi bi-chevron-left fs-4"></i>
            </button>
          </div>

          <!-- لوحة اختيار أدوات التلوين -->
          <div class="d-flex flex-wrap justify-content-center gap-2 mt-3 p-2 bg-white rounded-3 shadow-sm" dir="ltr">
            <button type="button" class="btn btn-sm btn-danger fw-bold active" onclick="setMarkStyle('choc', '#dc3545')">
              <i class="bi bi-record-circle me-1"></i> Choc / صدمة
            </button>
            <button type="button" class="btn btn-sm btn-warning text-dark fw-bold" onclick="setMarkStyle('rayure', '#ffc107')">
              <i class="bi bi-record-circle me-1"></i> Rayure / خدش
            </button>
            <button type="button" class="btn btn-sm btn-primary fw-bold" onclick="setMarkStyle('peinture', '#0d6efd')">
              <i class="bi bi-record-circle me-1"></i> Peinture / طلاء
            </button>
            <button type="button" class="btn btn-sm btn-secondary fw-bold" onclick="setMarkStyle('mastic', '#6c757d')">
              <i class="bi bi-record-circle me-1"></i> Mastic / معجون
            </button>
            <button type="button" class="btn btn-sm btn-dark fw-bold" onclick="setMarkStyle('corrosion', '#212529')">
              <i class="bi bi-record-circle me-1"></i> Corrosion / صدأ
            </button>
            <button type="button" class="btn btn-sm fw-bold text-white" style="background-color:#9333ea;" onclick="setMarkStyle('a_froid', '#9333ea')">
              <i class="bi bi-record-circle me-1"></i> À Froid / على البارد
            </button>
            <button type="button" class="btn btn-sm btn-outline-danger fw-bold ms-2" onclick="clearCanvas()">
              <i class="bi bi-eraser-fill me-1"></i> مسح التلوين
            </button>
          </div>
        </div>
      </div>

      <!-- 2. فحص الهيكل والتصادم -->
      <div class="card border-0 shadow-sm rounded-4 mb-4 overflow-hidden">
        <div class="card-header bg-dark text-white py-3">
          <h5 class="m-0 fw-bold"><i class="bi bi-shield-exclamation me-2"></i>2. فحص الهيكل والتصادم (Contrôle Structurel)</h5>
        </div>
        <div class="card-body p-3">
          <div class="table-responsive">
            <table class="table table-borderless align-middle mb-0">
              <thead class="table-light text-center rounded-3">
                <tr>
                  <th class="text-start ps-3">عنصر الهيكل</th>
                  <th style="width: 180px;">الحالة</th>
                  <th>ملاحظات / Observations</th>
                </tr>
              </thead>
              <tbody>
                ${structControls.map(sc => `
                  <tr class="border-bottom">
                    <td class="fw-bold ps-3">
                      <div class="fs-14 text-dark">${sc.ar}</div>
                      <small class="text-muted fw-normal">${sc.fr}</small>
                    </td>
                    <td class="text-center">
                      <div class="btn-group w-100 shadow-sm" role="group">
                        <input type="radio" class="btn-check" name="${sc.name}_status" id="${sc.name}_ok" value="Conforme" ${!(data[sc.name+"_status"]) || data[sc.name+"_status"] === "Conforme" ? "checked" : ""}>
                        <label class="btn btn-outline-success fw-bold btn-sm py-2" for="${sc.name}_ok">سليم</label>

                        <input type="radio" class="btn-check" name="${sc.name}_status" id="${sc.name}_nok" value="Défaut" ${data[sc.name+"_status"] === "Défaut" ? "checked" : ""}>
                        <label class="btn btn-outline-danger fw-bold btn-sm py-2" for="${sc.name}_nok">خلل</label>
                      </div>
                    </td>
                    <td>
                      <input type="text" class="form-control form-control-sm rounded-3 shadow-none border" name="${sc.name}_obs" value="${data[sc.name+"_obs"] || ""}" placeholder="أدخل الملاحظة إن وجدت...">
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- 3. ملاحظات إضافية -->
      <div class="card border-0 shadow-sm rounded-4 mb-4 overflow-hidden">
        <div class="card-header bg-dark text-white py-3">
          <h5 class="m-0 fw-bold"><i class="bi bi-journal-text me-2"></i>3. ملاحظات إضافية (Notes Complémentaires)</h5>
        </div>
        <div class="card-body p-3">
          <textarea class="form-control rounded-3 shadow-none border" name="notes" rows="4"
                    placeholder="أي ملاحظات إضافية تفصيلية عن حالة الهيكل والتصادم... / Toute remarque détaillée sur l'état de la carrosserie">${data.notes || ''}</textarea>
        </div>
      </div>

      <!-- 4. النتيجة العامة وحفظ الفحص -->
      <div class="card border-0 shadow-sm rounded-4 mb-4 bg-light">
        <div class="card-body p-4">
          <div class="row align-items-center g-3">
            <div class="col-md-7">
              <label class="form-label fw-bold h6 text-dark mb-2">النتيجة النهائية للهيكل (Conclusion Structure) :</label>
              <select class="form-select form-select-lg fw-bold text-primary rounded-3 border-0 shadow-sm" name="conclusion_structure">
                <option value="Aucun accident détecté" ${(!data.conclusion_structure || data.conclusion_structure === "Aucun accident détecté") ? "selected" : ""}>لم يتم كشف أي حادث (Aucun accident détecté)</option>
                <option value="Accident léger" ${data.conclusion_structure === "Accident léger" ? "selected" : ""}>حادث بسيط (Accident léger)</option>
                <option value="Accident réparé" ${data.conclusion_structure === "Accident réparé" ? "selected" : ""}>حادث تم إصلاحه (Accident réparé)</option>
                <option value="Véhicule accidenté structurellement" ${data.conclusion_structure === "Véhicule accidenté structurellement" ? "selected" : ""}>متضررة في الهيكل الأساسي (Accidenté structurellement)</option>
              </select>
            </div>
            <div class="col-md-5 text-end">
              <button type="submit" class="btn btn-success btn-lg px-5 py-3 fw-bold w-100 rounded-3 shadow-lg hover-scale">
                <i class="bi bi-check-circle-fill me-2"></i> حفظ الفحص الكامل للهيكل
              </button>
            </div>
          </div>
        </div>
      </div>

    </form>
  `;
}

// 5. تعديل دالة حفظ الفحص لتخزين صورة Canvas ملونة في النظام
async function saveToleModule(e) {
  e.preventDefault();
  try {
    const form = e.target;
    const formData = new FormData(form);

    // حفظ رسم الصورة الحالية قبل الإرسال (لو التقني كان يرسم وقت الحفظ)
    // نستخدم JPEG مضغوط بدل PNG لتقليل حجم الطلب (5 صور مرة وحدة)
    const canvas = document.getElementById('car-canvas');
    if (canvas) {
      drawingsMap[currentImageIndex] = canvas.toDataURL('image/jpeg', 0.7);
    }

    const payload = {
      inspection_id: currentInspectionId,
      elements_ext_json: { drawings: drawingsMap },
      longerons_status: formData.get('longerons_status'),
      longerons_obs: formData.get('longerons_obs'),
      traverses_status: formData.get('traverses_status'),
      traverses_obs: formData.get('traverses_obs'),
      passage_roues_status: formData.get('passage_roues_status'),
      passage_roues_obs: formData.get('passage_roues_obs'),
      fond_coffre_status: formData.get('fond_coffre_status'),
      fond_coffre_obs: formData.get('fond_coffre_obs'),
      chassis_status: formData.get('chassis_status'),
      chassis_obs: formData.get('chassis_obs'),
      optique_status: formData.get('optique_status'),
      optique_obs: formData.get('optique_obs'),
      vitre_status: formData.get('vitre_status'),
      vitre_obs: formData.get('vitre_obs'),
      conclusion_structure: formData.get('conclusion_structure'),
      notes: formData.get('notes') || ''
    };

    await sendData('/inspection/tole', payload);
  } catch (err) {
    console.error('Erreur saveToleModule:', err);
    showToast("Erreur lors de l'enregistrement du module Tôle / خطأ أثناء حفظ وحدة الهيكل: " + (err.message || ''), 'danger');
  }
}

async function saveScannerModule(e) {
  e.preventDefault();
  const payload = {
    inspection_id: currentInspectionId,
    calculateur_status: document.getElementById('calculateur_status').value,
    voyants_allumes: document.getElementById('voyants_allumes').value,
    dtc_codes: document.getElementById('dtc_codes').value,
    notes: document.getElementById('scanner_notes').value
  };
  await sendData('/inspection/scanner', payload);
}

async function saveMoteurModule(e) {
  e.preventDefault();
  const payload = {
    inspection_id: currentInspectionId,
    niveau_huile: document.getElementById('niveau_huile').value,
    fuite_huile: document.getElementById('fuite_huile').checked,
    fuite_liquide_refroidissement: document.getElementById('fuite_liquide_refroidissement').checked,
    bruit_moteur: document.getElementById('bruit_moteur').checked,
    fumee_echappement: document.getElementById('fumee_echappement').value,
    notes: document.getElementById('moteur_notes').value
  };
  await sendData('/inspection/moteur', payload);
}

function renderGeneralModule(data = {}) {
  return `
    <form id="form-general" onsubmit="saveGeneralModule(event)" dir="rtl" class="p-1">

      <!-- 1. معلومات أساسية -->
      <div class="card border-0 shadow-sm rounded-4 mb-4 overflow-hidden">
        <div class="card-header bg-dark text-white py-3">
          <h5 class="m-0 fw-bold"><i class="bi bi-key-fill me-2"></i>1. المعلومات الأساسية (Informations de Base)</h5>
        </div>
        <div class="card-body p-4">
          <div class="row g-3">
            <div class="col-md-4">
              <label class="form-label fw-bold text-dark mb-2">عدد المفاتيح / Nombre de clés</label>
              <input type="number" class="form-control form-control-lg rounded-3" id="nombre_cles" min="1" max="10" value="${data.nombre_cles || 1}" required>
            </div>
            <div class="col-md-8">
              <label class="form-label fw-bold text-dark mb-2">معدات الطوارئ / Équipements de secours</label>
              <input type="text" class="form-control form-control-lg rounded-3" id="equipements_secour" value="${data.equipements_secour || ''}" placeholder="Ex: Roue de secours, cric, triangle de signalisation...">
            </div>
          </div>
        </div>
      </div>

      <!-- 2. التقرير الميكانيكي والحفظ -->
      <div class="card border-0 shadow-sm rounded-4 mb-4 overflow-hidden">
        <div class="card-header bg-dark text-white py-3">
          <h5 class="m-0 fw-bold"><i class="bi bi-clipboard2-pulse-fill me-2"></i>2. التقرير الميكانيكي العام (Rapport Mécanique Général)</h5>
        </div>
        <div class="card-body p-4">
          <textarea class="form-control rounded-3 shadow-none border" id="rapport_mecanique" rows="6"
                    placeholder="Saisissez les observations mécaniques générales, état du moteur, boîte de vitesses, etc... / اكتب الملاحظات الميكانيكية العامة">${data.rapport_mecanique || ''}</textarea>
        </div>
      </div>

      <div class="text-end">
        <button type="submit" class="btn btn-success btn-lg px-5 py-3 fw-bold w-100 rounded-3 shadow-lg hover-scale">
          <i class="bi bi-check-circle-fill me-2"></i> حفظ الملاحظات العامة / Enregistrer
        </button>
      </div>
    </form>`;
}

async function saveSuspensionModule(e) {
  e.preventDefault();
  const form = e.target;
  const formData = new FormData(form);
  const payload = {
    inspection_id: currentInspectionId,
    usure_pneu_avg: formData.get('usure_pneu_avg') || 'Conforme',
    obs_pneu_avg: formData.get('obs_pneu_avg') || '',
    usure_pneu_avd: formData.get('usure_pneu_avd') || 'Conforme',
    obs_pneu_avd: formData.get('obs_pneu_avd') || '',
    usure_pneu_arg: formData.get('usure_pneu_arg') || 'Conforme',
    obs_pneu_arg: formData.get('obs_pneu_arg') || '',
    usure_pneu_ard: formData.get('usure_pneu_ard') || 'Conforme',
    obs_pneu_ard: formData.get('obs_pneu_ard') || '',
    jante_avg: formData.get('jante_avg') || 'Conforme',
    jante_avg_obs: formData.get('jante_avg_obs') || '',
    jante_avd: formData.get('jante_avd') || 'Conforme',
    jante_avd_obs: formData.get('jante_avd_obs') || '',
    jante_arg: formData.get('jante_arg') || 'Conforme',
    jante_arg_obs: formData.get('jante_arg_obs') || '',
    jante_ard: formData.get('jante_ard') || 'Conforme',
    jante_ard_obs: formData.get('jante_ard_obs') || '',
    corrosion_soubassement: form.querySelector('#corrosion')?.checked || false,
    traces_choc: form.querySelector('#traces_choc')?.checked || false,
    notes: ''
  };

  await sendData('/inspection/suspension', payload);
}

async function saveKilometrageModule(e) {
  e.preventDefault();
  const selected = document.querySelector('input[name="conforme"]:checked');
  const payload = {
    inspection_id: currentInspectionId,
    kilometrage_affiche: document.getElementById('kilometrage_affiche').value,
    conformite: selected ? selected.value : 'uncertain', // ترسل: 'real' أو 'suspect' أو 'uncertain'
    notes: document.getElementById('km_notes').value
  };
  await sendData('/inspection/kilometrage', payload);
}

async function sendData(endpoint, payload) {
  const token = getAuthToken();

  if (!token) {
    alert("Erreur: Utilisateur non authentifié. Veuillez vous re-connecter.");
    window.location.href = '../Auth/index.html';
    return;
  }

  try {
    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (response.ok && (result.success || result.message)) {
      showToast(result.message || 'Données enregistrées avec succès !', 'success');
    } else {
      showToast('Erreur: ' + (result.error || result.message || "Erreur lors de l'enregistrement"), 'danger');
    }
  } catch (err) {
    showToast('Impossible de contacter le serveur', 'danger');
    console.error(err);
  }
}
async function saveGeneralModule(e) {
    if (e) e.preventDefault();
    
    if (!currentInspectionId) {
        showToast("Veuillez sélectionner un rendez-vous d'abord !", 'warning');
        return;
    }
    const payload = {
  inspection_id: currentInspectionId,
  nombre_cles: parseInt(document.getElementById('nombre_cles')?.value || 1),
  equipements_secour: document.getElementById('equipements_secour')?.value || '', 
  rapport_mecanique: document.getElementById('rapport_mecanique')?.value || ''
};
await sendData('/inspection/general', payload);

}

const saveObsBtn = document.getElementById('btn-save-obs') || document.getElementById('btn-save-observations');

if (saveObsBtn) {
    saveObsBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        await saveGeneralObservations();
    });
}
// 1. تحديث نمط ولون التحديد/التلوين النشط
function setMarkStyle(type, color) {
  activeMarkType = type;
  activeDrawingColor = color;
  
  const buttons = document.querySelectorAll('#form-tole .btn-group button, #form-tole .d-flex button');
  buttons.forEach(btn => btn.classList.remove('active'));
  if (window.event && window.event.currentTarget) {
    window.event.currentTarget.classList.add('active');
  }
}

// مصفوفة مسارات الصور الـ 5 (زوايا السيارة المختلفة)
const carImagesList = [
  '../img/1.jfif', // الواجهة الأمامية
  '../img/2.jfif', // الواجهة الخلفية
  '../img/3.jfif', // الجانب الأيمن
  '../img/4.jfif', // الجانب الأيسر
  '../img/5.jfif'  // المنظر العلوي
];

let currentImageIndex = 0;
// كائن لتخزين رسومات كل صورة بشكل مستقل (يُرسل كاملاً مع الحفظ)
let drawingsMap = {};

function changeCarImage(direction) {
  const canvas = document.getElementById('car-canvas');
  if (canvas) {
    // حفظ الرسم الحالي للصورة الحالية قبل التبديل
    drawingsMap[currentImageIndex] = canvas.toDataURL('image/png');
  }

  currentImageIndex += direction;
  if (currentImageIndex < 0) currentImageIndex = carImagesList.length - 1;
  if (currentImageIndex >= carImagesList.length) currentImageIndex = 0;

  const indicator = document.getElementById('carousel-indicator');
  if (indicator) {
    indicator.textContent = `${currentImageIndex + 1} / ${carImagesList.length}`;
  }

  // إعادة تهيئة الـ Canvas بالصورة الجديدة والرسم المحفوظ لها إن وجد
  initCanvas(drawingsMap[currentImageIndex] || null);
}

function initCanvas(savedDrawing = null) {
  const canvas = document.getElementById('car-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let isDrawing = false;

  const carImg = new Image();
  carImg.src = carImagesList[currentImageIndex];

  function renderBackground() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.drawImage(carImg, 0, 0, canvas.width, canvas.height);

    if (savedDrawing) {
      const savedImg = new Image();
      savedImg.onload = () => ctx.drawImage(savedImg, 0, 0);
      savedImg.src = savedDrawing;
    }
  }

  carImg.onload = () => {
    renderBackground();
  };

  carImg.onerror = () => {
    console.error("خطأ في تحميل الصورة: " + carImagesList[currentImageIndex]);
  };

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: (clientX - rect.left) * (canvas.width / rect.width),
      y: (clientY - rect.top) * (canvas.height / rect.height)
    };
  }

  function startDrawing(e) {
    isDrawing = true;
    draw(e);
  }

  function stopDrawing() {
    isDrawing = false;
    ctx.beginPath();
  }

  function draw(e) {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getPos(e);

    ctx.lineWidth = 6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = activeDrawingColor || '#dc3545';

    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }

  canvas.onmousedown = startDrawing;
  canvas.onmousemove = draw;
  canvas.onmouseup = stopDrawing;
  canvas.onmouseleave = stopDrawing;

  canvas.addEventListener('touchstart', startDrawing, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  canvas.addEventListener('touchend', stopDrawing);
}

function clearCanvas() {
  drawingsMap[currentImageIndex] = null;
  initCanvas();
}