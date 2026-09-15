// 1. دالة جلب التوكين (Global)
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
    return localStorage.getItem('token') || sessionStorage.getItem('token') || '';
}

document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');

    if (!id) {
        console.error("Aucun ID de rapport spécifié.");
        return;
    }

    try {
        const API_URL = 'https://romantic-enjoyment-production-f458.up.railway.app/api';
        const token = getAuthToken();
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };

        let response = await fetch(`${API_URL}/inspection/tole-report/${id}`, { headers });

        if (!response.ok) {
            response = await fetch(`${API_URL}/inspection/tole/${id}`, { headers });
        }
        
        if (!response.ok) {
            response = await fetch(`${API_URL}/inspection/details/${id}`, { headers });
        }

        const result = await response.json();
        const data = result.data || result.report || result;
        
        if (data && (data.id || data.inspection_id || data.client_name || data.brand || data.model)) {
            renderFullReport(data);
        } else {
            console.error("Data structure mismatched:", data);
            alert("Rapport introuvable ou données incomplètes.");
        }
        
    } catch (err) {
        console.error("Erreur de chargement du rapport:", err);
        alert("Erreur de connexion au serveur lors du chargement des données.");
    }
});

// 3. رسم النقاط على مخطط السيارة والخريطة
// عرض الصور الخمسة المرسومة (Tôle & Carrosserie) — تُقرأ من elements_ext_json.drawings
function renderCarImagesGallery(data) {
    const gallery = document.getElementById('car-images-gallery');
    if (!gallery) return;

    let extData = {};
    if (typeof data.elements_ext_json === 'string') {
        try { extData = JSON.parse(data.elements_ext_json); } catch (e) { extData = {}; }
    } else if (typeof data.elements_ext_json === 'object' && data.elements_ext_json !== null) {
        extData = data.elements_ext_json;
    }

    const drawings = extData.drawings || {};

    const angles = [
        { label: 'Face Avant / الواجهة الأمامية' },
        { label: 'Face Arrière / الواجهة الخلفية' },
        { label: 'Côté Droit / الجانب الأيمن' },
        { label: 'Côté Gauche / الجانب الأيسر' },
        { label: 'Vue de Dessus / المنظر العلوي' }
    ];

    gallery.innerHTML = angles.map((angle, index) => {
        const photo = drawings[index] || drawings[String(index)];
        const cellContent = photo
            ? `<img src="${photo}" class="car-image-photo" alt="${angle.label}">`
            : `<div class="car-image-empty"><i class="bi bi-camera-slash me-1"></i> Non renseigné</div>`;

        return `
            <div class="col-6">
                <div class="car-image-cell">
                    <div class="car-image-label">${angle.label}</div>
                    ${cellContent}
                </div>
            </div>
        `;
    }).join('');
}

// 4. عرض بيانات التقرير بالكامل
function renderFullReport(data) {
    // 0. معرض الصور الخمسة المرسومة (Tôle & Carrosserie) — الصفحة الأخيرة
    renderCarImagesGallery(data);

    const setText = (id, val, fallback = '--') => {
        const el = document.getElementById(id);
        if (el) el.innerText = (val !== undefined && val !== null && val !== '') ? val : fallback;
    };

    const statusBadge = (val, okLabel = 'Conforme', defautLabel = 'Défaut') => {
        const isDefaut = String(val).toUpperCase() === 'DEFAUT' || String(val) === 'Défaut';
        return isDefaut
            ? `<span class="status-badge defect"><i class="bi bi-x-circle-fill"></i> ${defautLabel}</span>`
            : `<span class="status-badge ok"><i class="bi bi-check-circle-fill"></i> ${okLabel}</span>`;
    };

    const boolBadge = (val, yesLabel = 'Oui', noLabel = 'Non') => {
        return val
            ? `<span class="status-badge defect"><i class="bi bi-x-circle-fill"></i> ${yesLabel}</span>`
            : `<span class="status-badge ok"><i class="bi bi-check-circle-fill"></i> ${noLabel}</span>`;
    };

    // ===== PAGE 1: Informations Générales =====
    const reportId = data.inspection_id || data.id || '--';
    setText('rep-code', `REF: REP-2026-${reportId}`);
    setText('client-name', data.client_name, 'Non spécifié');
    setText('client-phone', data.client_phone, 'Non renseigné');

    const formattedDate = data.created_at ? new Date(data.created_at).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR');
    setText('rep-date', formattedDate);

    setText('car-brand-model', `${data.brand || ''} ${data.model || ''}`.trim() || 'Non spécifié');
    setText('car-plate', data.plate, 'Non spécifié');
    setText('car-vin', data.vin_number, 'Non renseigné');

    setText('km-value', data.kilometrage_affiche ? Number(data.kilometrage_affiche).toLocaleString() : null, 'Non contrôlé');
    const kmConformiteMap = { REAL: ['ok', 'Réel'], SUSPECT: ['defect', 'Falsifié'], UNCERTAIN: ['defect', 'Incertain'] };
    const kmConf = (data.km_conformite || 'UNCERTAIN').toUpperCase();
    const kmInfo = kmConformiteMap[kmConf] || kmConformiteMap.UNCERTAIN;
    const kmBadgeEl = document.getElementById('km-conformite-badge');
    if (kmBadgeEl) kmBadgeEl.innerHTML = `<span class="status-badge ${kmInfo[0]}"><i class="bi bi-check-circle-fill"></i> ${kmInfo[1]}</span>`;
    setText('km-notes', data.km_notes, 'Aucune remarque');

    setText('car-keys', data.nombre_cles, '--');
    setText('equip-secours', data.equipements_secour, 'Non renseigné');

    // ===== PAGE 2: Scanner + Moteur =====
    const scannerBadgeEl = document.getElementById('scanner-calculateur-badge');
    if (scannerBadgeEl) scannerBadgeEl.innerHTML = statusBadge(data.calculateur_status, 'OK', 'DÉFAUT');
    setText('scanner-voyants', data.voyants_allumes, 'Aucun');
    setText('scanner-dtc', data.dtc_codes, 'Aucun code détecté');
    setText('scanner-notes', data.scanner_notes, 'Aucune remarque');

    setText('moteur-huile', data.niveau_huile, 'Non contrôlé');
    setText('moteur-fumee', data.fumee_echappement, 'Aucune');
    const fuiteHuileEl = document.getElementById('moteur-fuite-huile-badge');
    if (fuiteHuileEl) fuiteHuileEl.innerHTML = boolBadge(!!data.fuite_huile);
    const fuiteLiquideEl = document.getElementById('moteur-fuite-liquide-badge');
    if (fuiteLiquideEl) fuiteLiquideEl.innerHTML = boolBadge(!!data.fuite_liquide_refroidissement);
    const bruitEl = document.getElementById('moteur-bruit-badge');
    if (bruitEl) bruitEl.innerHTML = boolBadge(!!data.bruit_moteur);
    setText('moteur-notes', data.moteur_notes, 'Aucune remarque');

    // ===== PAGE 3: Suspension & Structure =====
    const tiresBody = document.getElementById('suspension-tires-body');
    if (tiresBody) {
        const positions = [
            { key: 'avg', label: 'Avant Gauche (AVG)' },
            { key: 'avd', label: 'Avant Droit (AVD)' },
            { key: 'arg', label: 'Arrière Gauche (ARG)' },
            { key: 'ard', label: 'Arrière Droit (ARD)' }
        ];
        tiresBody.innerHTML = positions.map(pos => {
            const pneuObs = data['obs_pneu_' + pos.key];
            const janteObs = data['jante_' + pos.key + '_obs'];
            const obsParts = [];
            if (pneuObs) obsParts.push(`Pneu: ${pneuObs}`);
            if (janteObs) obsParts.push(`Jante: ${janteObs}`);
            const obsText = obsParts.length > 0 ? obsParts.join(' — ') : '--';

            return `
            <tr>
                <td class="text-start fw-bold">${pos.label}</td>
                <td>${statusBadge(data['usure_pneu_' + pos.key])}</td>
                <td>${statusBadge(data['jante_' + pos.key])}</td>
                <td class="text-start">${obsText}</td>
            </tr>
        `;
        }).join('');
    }
    const suspCorrosionEl = document.getElementById('susp-corrosion-badge');
    if (suspCorrosionEl) suspCorrosionEl.innerHTML = boolBadge(!!data.corrosion_soubassement);
    const suspChocEl = document.getElementById('susp-choc-badge');
    if (suspChocEl) suspChocEl.innerHTML = boolBadge(!!data.traces_choc);
    setText('susp-notes', data.suspension_notes, 'Aucune remarque');

    const structBody = document.getElementById('struct-defects-body');
    if (structBody) {
        const structElements = [
            { key: 'longerons', fr: 'Longerons' },
            { key: 'traverses', fr: 'Traverses' },
            { key: 'passage_roues', fr: 'Passage de roues' },
            { key: 'fond_coffre', fr: 'Fond coffre' },
            { key: 'chassis', fr: 'Châssis' },
            { key: 'optique', fr: 'Optique' },
            { key: 'vitre', fr: 'Vitre' }
        ];
        structBody.innerHTML = structElements.map(el => `
            <tr>
                <td class="text-start fw-bold">${el.fr}</td>
                <td class="text-center">${statusBadge(data[el.key + '_status'])}</td>
                <td class="text-start">${data[el.key + '_obs'] || '--'}</td>
            </tr>
        `).join('');
    }
    setText('struct-conclusion', data.conclusion_structure, 'Aucun accident détecté');
    setText('struct-notes', data.tole_notes, 'Aucune remarque');

    // ===== PAGE 4: Observations Générales + Conclusion =====
    setText('rapport-mecanique-text', data.rapport_mecanique, 'Aucune observation mécanique enregistrée.');

    const generalConclusion = document.getElementById('general-conclusion');
    if (generalConclusion) {
        generalConclusion.innerText = data.conclusion_structure || 'Aucun accident détecté';
    }

    // استدعاء تلخيص الذكاء الاصطناعي (يحدّث الملخصات + الخاتمة العامة بصفحة 4)
    // نرسل نسخة خفيفة بدون elements_ext_json (يحتوي 5 صور base64 ضخمة غير مستخدمة بالـ prompt)
    const { elements_ext_json, ...aiPayload } = data;
    fetchAISummary(aiPayload);
}

// 5. النصوص البديلة في حال فشل الاتصال بالسيرفر
function fallbackSummaries() {
    const defaultMsg = "Aucun résumé disponible pour le moment.";
    ['ai-scanner-summary', 'ai-moteur-summary', 'ai-suspension-summary', 'ai-structure-summary'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerText = defaultMsg;
    });
}

// 6. دالة جلب ملخص الذكاء الاصطناعي (موحدة ومعالجة)
async function fetchAISummary(inspectionData) {
    const elScanner = document.getElementById('ai-scanner-summary');
    const elMoteur = document.getElementById('ai-moteur-summary');
    const elSuspension = document.getElementById('ai-suspension-summary');
    const elStructure = document.getElementById('ai-structure-summary');
    const elConclusion = document.getElementById('general-conclusion');

    const API_URL = 'https://romantic-enjoyment-production-f458.up.railway.app/api';

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); 

    try {
        const response = await fetch(`${API_URL}/ai/generate-summary`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getAuthToken()}`
            },
            body: JSON.stringify(inspectionData),
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        const result = await response.json();

        if (result.success && result.data) {
            if (elScanner) elScanner.innerText = result.data.scanner_summary || "R.A.S / لا توجد ملاحظات";
            if (elMoteur) elMoteur.innerText = result.data.moteur_summary || "R.A.S / لا توجد ملاحظات";
            if (elSuspension) elSuspension.innerText = result.data.suspension_summary || "R.A.S / لا توجد ملاحظات";
            if (elStructure) elStructure.innerText = result.data.carrosserie_summary || "R.A.S / لا توجد ملاحظات";
            if (elConclusion) elConclusion.innerText = result.data.conclusion_generale || inspectionData.conclusion_structure || "Aucun accident détecté";
        } else {
            fallbackSummaries();
        }
    } catch (error) {
        console.error("Erreur AI Frontend:", error);
        fallbackSummaries();
    }
}