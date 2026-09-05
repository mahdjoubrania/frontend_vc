const API_URL = 'https://romantic-enjoyment-production-f458.up.railway.app/api';

document.addEventListener('DOMContentLoaded', () => {
  loadAppointmentDetails();
});

async function loadAppointmentDetails() {
  const urlParams = new URLSearchParams(window.location.search);
  const appointmentId = urlParams.get('id');

  if (!appointmentId) {
    alert('معرّف الموعد مفقود (ID Introuvable)');
    return;
  }

  try {
    const res = await fetch(`${API_URL}/admin/appointments`);
    if (!res.ok) throw new Error('فشل جلب البيانات من السيرفر');

    const appointments = await res.json();
    
    // طباعة البيانات في الكونسول للفحص عند الحاجة
    console.log("البيانات القادمة من السيرفر:", appointments);

    const rdv = appointments.find(item => String(item.id) === String(appointmentId));

    if (!rdv) {
      alert('لم يتم العثور على الموعد المطلوب');
      return;
    }

    // 1. المرجع والتاريخ
    document.getElementById('doc-ref').innerText = `VC-${String(rdv.id).padStart(4, '0')}`;
    document.getElementById('doc-issue-date').innerText = new Date().toLocaleDateString('fr-FR');

    // 2. اسم العميل ورقم الهاتف
    const clientName = rdv.client_name || rdv.clientName || rdv.full_name || rdv.title || 'N/A';
    const clientPhone = rdv.phone || rdv.client_phone || rdv.extendedProps?.phone || '--';

    // 3. نوع السيارة والترقيم (تغطية كل الاحتمالات)
    const carModel = (rdv.vehicle_name && rdv.vehicle_name.trim() !== '' && rdv.vehicle_name !== '--') 
  ? rdv.vehicle_name 
  : (rdv.car_make_model || rdv.car_model || rdv.vehicle || 'Non Spécifié');
    
    const carMatricule = rdv.car_matricule || rdv.license_plate || rdv.vin || rdv.extendedProps?.vin || 'Non Spécifié';
    const serviceType = rdv.service_type || rdv.extendedProps?.serviceType || 'VÉRIFICATION COMPLÈTE';

    document.getElementById('client-name').innerText = clientName;
    document.getElementById('client-phone').innerText = clientPhone;
    document.getElementById('car-model').innerText = carModel;
    document.getElementById('car-matricule').innerText = carMatricule;
    document.getElementById('services-list').innerText = serviceType;

    // 4. تاريخ الموعد والتوقيت
    const rdvDateRaw = rdv.appointment_date || rdv.start || rdv.date;
    if (rdvDateRaw) {
      const dateObj = new Date(rdvDateRaw);
      document.getElementById('rdv-date').innerText = dateObj.toLocaleDateString('fr-FR');
      document.getElementById('rdv-time').innerText = dateObj.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    }

    // 5. الأسعار والحسابات
    const total = parseFloat(rdv.total_amount || rdv.total_price || rdv.totalAmount || rdv.extendedProps?.totalAmount) || 0;
    const versement = parseFloat(rdv.versement || rdv.versement_amount || rdv.extendedProps?.versement) || 0;
    const reste = total - versement;

    document.getElementById('price-total').innerText = `${total.toLocaleString()} DZD`;
    document.getElementById('price-versement').innerText = `${versement.toLocaleString()} DZD`;
    document.getElementById('price-reste').innerText = `${reste.toLocaleString()} DZD`;

    // 6. الملاحظات
    if (document.getElementById('vehicle-remarks')) {
      document.getElementById('vehicle-remarks').innerText = rdv.notes || rdv.vehicle_notes || rdv.extendedProps?.notes || 'Aucune remarque spécifique.';
    }

  } catch (error) {
    console.error('Erreur lors du chargement de la fiche:', error);
    alert('حدث خطأ أثناء تحميل بيانات الفاتورة.');
  }
}