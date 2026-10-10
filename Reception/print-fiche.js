/* =====================================================================
   Réception — fiche de contrôle imprimable (prise.de.rendez-vous.html)
   ===================================================================== */
const API_URL = 'https://romantic-enjoyment-production-f458.up.railway.app/api';

// <helpers>  دوال نقية بدون DOM (قابلة للاختبار)
const pad2 = (n) => String(n).padStart(2, '0');

// نص تاريخ السيرفر -> Date محلي بلا إزاحة زمنية (new Date("YYYY-MM-DD HH:MM:SS") لا يعمل على Safari/iOS)
function parseLocalAppointmentDate(dateStr) {
  if (!dateStr) return null;
  const parts = String(dateStr).split(/[- :T]/);
  if (parts.length < 5) return null;
  const [year, month, day, hours, minutes] = parts.map((p) => parseInt(p, 10));
  if ([year, month, day, hours, minutes].some(Number.isNaN)) return null;
  return new Date(year, month - 1, day, hours, minutes, 0);
}

// ورقة تُسلَّم للعميل: أرقام فرنسية ثابتة مهما كانت لغة متصفح الجهاز (toLocaleString() الافتراضي قد يطبع أرقاماً هندية عربية)
const fmtMoney = (n) => `${Number(n || 0).toLocaleString('fr-FR')} DZD`;
const fmtDate = (d) => `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
const fmtTime = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;

// القيم الافتراضية من الخادم لا تُطبع كأنها بيانات حقيقية
function cleanVehicleText(name) {
  return String(name ?? '').replace(/non\s+sp[ée]cifi[ée]/gi, '').replace(/\binconnu\b/gi, '').replace(/\s+/g, ' ').trim();
}
function cleanPlateText(plate, vin) {
  const p = String(plate ?? '').trim();
  if (!p || /non\s+sp[ée]cifi[ée]/i.test(p) || (vin && p === String(vin).trim())) return '';
  return p;
}
// </helpers>

const $ = (id) => document.getElementById(id);
const setText = (id, text) => { const el = $(id); if (el) el.textContent = text; };

function getSession() {
  for (const key of ['verifcar_reception_user', 'verifcar_user', 'verifcar_admin_user']) {
    try {
      const session = JSON.parse(localStorage.getItem(key) || 'null');
      if (session && ['ADMIN', 'RECEPTION'].includes(String(session.role || '').toUpperCase())) return session;
    } catch (e) { /* جلسة تالفة */ }
  }
  return null;
}

document.addEventListener('DOMContentLoaded', () => {
  if (!getSession() || !localStorage.getItem('token')) {
    alert('Accès non autorisé.');
    window.location.href = '../Auth/index.html';
    return;
  }
  loadAppointmentDetails();
});

async function loadAppointmentDetails() {
  const appointmentId = new URLSearchParams(window.location.search).get('id');
  if (!appointmentId) {
    alert('Identifiant du rendez-vous manquant.');
    return;
  }

  try {
    const res = await fetch(`${API_URL}/admin/appointments`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token') || ''}` }
    });
    if (res.status === 401 || res.status === 403) {
      alert('Session expirée. Veuillez vous reconnecter.');
      window.location.href = '../Auth/index.html';
      return;
    }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const appointments = await res.json();
    const rdv = (Array.isArray(appointments) ? appointments : []).find((item) => String(item.id) === String(appointmentId));
    if (!rdv) {
      alert('Rendez-vous introuvable.');
      return;
    }

    // 1. المرجع والتاريخ
    setText('doc-ref', `VC-${String(rdv.id).padStart(4, '0')}`);
    setText('doc-issue-date', fmtDate(new Date()));

    // 2. العميل والسيارة
    setText('client-name', rdv.client_name || rdv.clientName || rdv.full_name || 'N/A');
    setText('client-phone', rdv.phone || rdv.client_phone || '--');
    setText('car-model', cleanVehicleText(rdv.vehicle_name) || 'Non renseigné');
    setText('car-matricule', cleanPlateText(rdv.license_plate, rdv.VIN || rdv.vin) || 'Non renseignée');
    setText('services-list', rdv.service_type || 'VÉRIFICATION COMPLÈTE');

    // 3. تاريخ الموعد والتوقيت
    const rdvDate = parseLocalAppointmentDate(rdv.appointment_date || rdv.start || rdv.date);
    if (rdvDate) {
      setText('rdv-date', fmtDate(rdvDate));
      setText('rdv-time', fmtTime(rdvDate));
    }

    // 4. الأسعار
    const total = parseFloat(rdv.total_amount) || 0;
    const versement = parseFloat(rdv.versement) || 0;
    setText('price-total', fmtMoney(total));
    setText('price-versement', fmtMoney(versement));
    setText('price-reste', fmtMoney(Math.max(0, total - versement)));

    // 5. الملاحظات (يُرجعها الخادم الآن؛ كانت الخانة تبقى فارغة دائماً)
    setText('vehicle-remarks', (rdv.notes || '').trim() || 'Aucune remarque spécifique.');

  } catch (error) {
    console.error('Erreur lors du chargement de la fiche:', error);
    alert('Erreur lors du chargement des données de la fiche.');
  }
}