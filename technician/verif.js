
const API_URL = 'https://romantic-enjoyment-production-f458.up.railway.app/api';
let currentInspectionId = null; 
let activeDrawingColor = '#RED';
let activeMarkType = 'choc';
let cachedDetails = null;
let appointmentsList = [];

// تحميل البيانات والتهيئة عند تحميل الصفحة
document.addEventListener('DOMContentLoaded', () => {
  initUIComponents();
  loadAppointments();
});

// 1. تهيئة القائمة الجانبية، تسجيل الخروج، واستبدال البيانات
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
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = 'login.html';
      }
    });
  }

  // عرض اسم المستخدم المخزن في localStorage
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const adminName = document.getElementById('admin-name');
  const adminAvatar = document.getElementById('admin-avatar');
  const mobileAvatar = document.getElementById('mobile-avatar');

  const fullName = user.full_name || user.username || 'YACINE';
  if (adminName) adminName.textContent = fullName;
  const initials = fullName.substring(0, 2).toUpperCase();
  if (adminAvatar) adminAvatar.textContent = initials;
  if (mobileAvatar) mobileAvatar.textContent = initials;
}

// 2. جلب وتعبئة قائمة المواعيد المتاحة
async function loadAppointments() {
  const select = document.getElementById('select-rdv');
  if (!select) return;

  try {
    // تعديل المسار إلى /admin/appointments بدلاً من /appointments
    const response = await fetch(`${API_URL}/admin/appointments`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${localStorage.getItem('token') || ''}`
      }
    });

    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    
    const res = await response.json();
    
    // استخراج المصفوفة
    let rawList = Array.isArray(res) ? res : (res.data || res.appointments || []);

    // حفظ القائمة الكاملة
    appointmentsList = rawList;

    // إعادة تفريغ وبناء القائمة المنسدلة
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

// 3. عند تغيير الاختيار في المواعيد
function onAppointmentSelect(appointmentId) {
  currentInspectionId = appointmentId ? parseInt(appointmentId) : null;
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
}

// 4. جلب تفاصيل الفحص للموعد المباشر
// التعديل المطلوب في دالة loadInspectionData
async function loadInspectionData(inspectionId) {
  try {
    const token = localStorage.getItem('token');
    const response = await fetch(`${API_URL}/inspection/details/${inspectionId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token || ''}`
      }
    });

    if (response.status === 401) {
      handleAuthError();
      return;
    }

    const res = await response.json();
    cachedDetails = res.success ? res.data : null;
  } catch (err) {
    console.error("خطأ في تحميل تفاصيل الفحص:", err);
    cachedDetails = null;
  }
}

// 5. فتح الموديولات المختلفة
async function openModule(moduleType) {
  if (!currentInspectionId) {
    alert("Veuillez d'abord sélectionner un rendez-vous dans la liste.");
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
      content.innerHTML = renderToleModule();
      initCanvas(data.drawing);
      loadToleElements(data.tole_elements || []);
      break;
  }
}

function closeModule() {
  document.getElementById('active-module-view').classList.add('d-none');
  document.getElementById('modules-selection-view').classList.remove('d-none');
}

// 6. واجهات العرض الخاصة بالنماذج (UI Renderers)
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
    <form id="form-suspension" onsubmit="saveSuspensionModule(event)">
      <div class="row g-3">
        <div class="col-md-6">
          <label class="form-label fw-semibold">Amortisseurs Avant / المساعدين الأماميين</label>
          <select class="form-select" id="amortisseurs_avant">
            <option value="OK" ${data.amortisseurs_avant === 'OK' ? 'selected' : ''}>OK / سليم</option>
            <option value="DEFAUT" ${data.amortisseurs_avant === 'DEFAUT' ? 'selected' : ''}>DÉFAUT / تالف</option>
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label fw-semibold">Amortisseurs Arrière / المساعدين الخلفيين</label>
          <select class="form-select" id="amortisseurs_arriere">
            <option value="OK" ${data.amortisseurs_arriere === 'OK' ? 'selected' : ''}>OK / سليم</option>
            <option value="DEFAUT" ${data.amortisseurs_arriere === 'DEFAUT' ? 'selected' : ''}>DÉFAUT / تالف</option>
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label fw-semibold">Pneumatiques (Usure) / الإطارات (التآكل)</label>
          <select class="form-select" id="pneus_usure">
            <option value="OK" ${data.pneus_usure === 'OK' ? 'selected' : ''}>OK / سليمة</option>
            <option value="DEFAUT" ${data.pneus_usure === 'DEFAUT' ? 'selected' : ''}>DÉFAUT / متآكلة</option>
          </select>
        </div>
        <div class="col-md-6">
          <label class="form-label fw-semibold">Rotules & Crémaillère / الركب وعلبة الدريكسيون</label>
          <select class="form-select" id="rotules_cremaillere">
            <option value="OK" ${data.rotules_cremaillere === 'OK' ? 'selected' : ''}>OK / سليم</option>
            <option value="DEFAUT" ${data.rotules_cremaillere === 'DEFAUT' ? 'selected' : ''}>DÉFAUT / تالف</option>
          </select>
        </div>
        <div class="col-12">
          <div class="form-check">
            <input class="form-check-input" type="checkbox" id="corrosion_soubassement" ${data.corrosion_soubassement ? 'checked' : ''}>
            <label class="form-check-label fw-semibold" for="corrosion_soubassement">Corrosion Soubassement / صدأ الهيكل السفلي</label>
          </div>
        </div>
        <div class="col-12">
          <label class="form-label fw-semibold">Notes Suspension / ملاحظات نظام التعليق</label>
          <textarea class="form-control" id="suspension_notes" rows="2">${data.notes || ''}</textarea>
        </div>
      </div>
      <button type="submit" class="btn btn-primary px-4 mt-3 rounded-3"><i class="bi bi-save me-1"></i> Sauvegarder Suspension / حفظ التعليق</button>
    </form>`;
}

function renderKilometrageModule(data = {}) {
  return `
    <form id="form-kilometrage" onsubmit="saveKilometrageModule(event)">
      <div class="row g-3">
        <div class="col-md-6">
          <label class="form-label fw-semibold">Kilométrage Affiché (KM) / العداد الظاهر</label>
          <input type="number" class="form-control" id="kilometrage_affiche" required value="${data.kilometrage_affiche || ''}" placeholder="Ex: 125000">
        </div>
        <div class="col-md-6">
          <label class="form-label fw-semibold">Conformité / المطابقة</label>
          <select class="form-select" id="conforme">
            <option value="1" ${data.conforme === 1 || data.conforme === true ? 'selected' : ''}>Conforme (Réel) / مطابق (حقيقي)</option>
            <option value="0" ${data.conforme === 0 || data.conforme === false ? 'selected' : ''}>Non Conforme / Suspect / غير مطابق (مشبوه)</option>
          </select>
        </div>
        <div class="col-12">
          <label class="form-label fw-semibold">Notes / Remarques / ملاحظات</label>
          <textarea class="form-control" id="km_notes" rows="2">${data.notes || ''}</textarea>
        </div>
      </div>
      <button type="submit" class="btn btn-primary px-4 mt-3 rounded-3"><i class="bi bi-save me-1"></i> Sauvegarder Kilométrage / حفظ العداد</button>
    </form>`;
}

function renderToleModule() {
  return `
    <div class="row g-4">
      <div class="col-lg-7">
        <h6 class="fw-bold mb-3">Schéma Carrosserie (Canvas & Marks) / مخطط الهيكل</h6>
        <div class="mb-2 d-flex gap-2 flex-wrap">
          <button type="button" class="btn btn-sm btn-outline-danger active" onclick="setMarkStyle('choc', 'red')">Choc / صدمة (أحمر)</button>
          <button type="button" class="btn btn-sm btn-outline-warning" onclick="setMarkStyle('peinture', 'gold')">Peinture / طلاء (أصفر)</button>
          <button type="button" class="btn btn-sm btn-outline-secondary" onclick="setMarkStyle('a_froid', 'purple')">À Froid / تعديل عالبارد (بنفسجي)</button>
        </div>
        <div class="canvas-container">
          <canvas id="car-canvas" width="600" height="350"></canvas>
        </div>
        <button type="button" class="btn btn-sm btn-light border mt-2" onclick="clearCanvas()"><i class="bi bi-trash me-1"></i> Effacer dessin / مسح الرسم</button>
      </div>

      <div class="col-lg-5">
        <h6 class="fw-bold mb-3">Éléments de Carrosserie / أجزاء الهيكل</h6>
        <div class="table-responsive" style="max-height: 350px;">
          <table class="table table-sm align-middle">
            <thead>
              <tr>
                <th>Élément / الجزء</th>
                <th>Peinture / طلاء</th>
                <th>À Froid / بارد</th>
                <th>Choc / صدمة</th>
              </tr>
            </thead>
            <tbody id="tole-elements-list"></tbody>
          </table>
        </div>
      </div>
    </div>
    <button type="button" class="btn btn-primary px-4 mt-3 rounded-3" onclick="saveToleModule()"><i class="bi bi-save me-1"></i> Sauvegarder Carrosserie / حفظ الهيكل</button>`;
}

// 7. إدارة الرسم والإشارات
function setMarkStyle(type, color) {
  activeMarkType = type;
  activeDrawingColor = color;
}

function initCanvas(savedDrawing = null) {
  const canvas = document.getElementById('car-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  if (savedDrawing) {
    const img = new Image();
    img.onload = () => ctx.drawImage(img, 0, 0);
    img.src = savedDrawing;
  } else {
    ctx.strokeStyle = '#cccccc';
    ctx.lineWidth = 2;
    ctx.strokeRect(50, 50, 500, 250);
    ctx.font = "16px Inter";
    ctx.fillStyle = "#aaa";
    ctx.fillText("Schéma Carrosserie Véhicule / مخطط هيكل السيارة", 150, 180);
  }

  canvas.onclick = function(e) {
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    ctx.fillStyle = activeDrawingColor;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, 2 * Math.PI);
    ctx.fill();
  };
}

function clearCanvas() {
  const canvas = document.getElementById('car-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    initCanvas();
  }
}

function loadToleElements(savedElements = []) {
  const elements = [
    { fr: "Capot", ar: "غطاء المحرك (كابو)" },
    { fr: "Pare-chocs Avant", ar: "الوفد الأمني (بارشوك أمام)" },
    { fr: "Aile AVG", ar: "جناح أيسر أمام (أنال يسار)" },
    { fr: "Porte AVG", ar: "باب أمامي أيسر" },
    { fr: "Aile ARG", ar: "جناح أيسر خلفي" },
    { fr: "Malle / Hayon", ar: "الصندوق الخلفي (المستودع)" },
    { fr: "Pavillon", ar: "السقف (سقف السيارة)" }
  ];

  const tbody = document.getElementById('tole-elements-list');
  if (!tbody) return;

  tbody.innerHTML = elements.map(item => {
    const found = savedElements.find(el => (el.element_name || el.name) === item.fr) || {};
    return `
      <tr>
        <td class="fw-semibold">${item.fr} <br><small class="text-muted">${item.ar}</small></td>
        <td><input class="form-check-input" type="checkbox" name="peinture_${item.fr}" ${found.peinture ? 'checked' : ''}></td>
        <td><input class="form-check-input" type="checkbox" name="afroid_${item.fr}" ${found.a_froid ? 'checked' : ''}></td>
        <td><input class="form-check-input" type="checkbox" name="choque_${item.fr}" ${found.choque ? 'checked' : ''}></td>
      </tr>
    `;
  }).join('');
}

// 8. إرسال وحفظ البيانات
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

async function saveSuspensionModule(e) {
  e.preventDefault();
  const payload = {
    inspection_id: currentInspectionId,
    amortisseurs_avant: document.getElementById('amortisseurs_avant').value,
    amortisseurs_arriere: document.getElementById('amortisseurs_arriere').value,
    pneus_usure: document.getElementById('pneus_usure').value,
    rotules_cremaillere: document.getElementById('rotules_cremaillere').value,
    corrosion_soubassement: document.getElementById('corrosion_soubassement').checked,
    notes: document.getElementById('suspension_notes').value
  };
  await sendData('/inspection/suspension', payload);
}

async function saveKilometrageModule(e) {
  e.preventDefault();
  const payload = {
    inspection_id: currentInspectionId,
    kilometrage_affiche: document.getElementById('kilometrage_affiche').value,
    conforme: document.getElementById('conforme').value === "1",
    notes: document.getElementById('km_notes').value
  };
  await sendData('/inspection/kilometrage', payload);
}

async function saveToleModule() {
  const canvas = document.getElementById('car-canvas');
  const drawingData = canvas ? canvas.toDataURL() : null;
  const elements = [];

  const listRows = document.querySelectorAll('#tole-elements-list tr');
  listRows.forEach(row => {
    // استخراج اسم العنصر الأصلي (السطر الأول فقط قبل الترجمة العربية)
    const nameCell = row.querySelector('.fw-semibold');
    const name = nameCell.childNodes[0].textContent.trim();

    const peinture = row.querySelector(`input[name="peinture_${name}"]`)?.checked || false;
    const a_froid = row.querySelector(`input[name="afroid_${name}"]`)?.checked || false;
    const choque = row.querySelector(`input[name="choque_${name}"]`)?.checked || false;

    elements.push({ element_name: name, peinture, a_froid, choque });
  });

  const payload = {
    inspection_id: currentInspectionId,
    drawing_data: drawingData,
    elements: elements
  };
  await sendData('/inspection/tole', payload);
}

async function sendData(endpoint, payload) {
  try {
    const token = localStorage.getItem('token'); // جلب التوكن

    const response = await fetch(`${API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token || ''}` // إرسال التوكن مع الطلب
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (response.ok && result.success) {
      alert(result.message || 'Données enregistrées avec succès !');
    } else {
      alert('Erreur: ' + (result.error || result.message || 'Erreur lors de l\'enregistrement'));
    }
  } catch (err) {
    alert('Impossible de contacter le serveur');
    console.error(err);
  }
}
