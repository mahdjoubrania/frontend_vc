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
function renderMarkersAndLegend(markersList) {
    const markersContainer = document.getElementById('markers-container');
    const legendContainer = document.getElementById('markers-legend');
    
    if (markersContainer) markersContainer.innerHTML = '';
    if (legendContainer) legendContainer.innerHTML = '';

    const coordinates = {
        "Capot": { top: "35%", left: "85%" },
        "Aile AVG": { top: "20%", left: "75%" },
        "Aile AVD": { top: "50%", left: "75%" },
        "Porte AVG": { top: "20%", left: "55%" },
        "Porte AVD": { top: "50%", left: "55%" },
        "Porte ARG": { top: "20%", left: "38%" },
        "Porte ARD": { top: "50%", left: "38%" },
        "Aile ARG": { top: "20%", left: "22%" },
        "Aile ARD": { top: "50%", left: "22%" },
        "Toit": { top: "35%", left: "48%" },
        "Coffre": { top: "35%", left: "12%" },
        "Pare-chocs Avant": { top: "35%", left: "95%" },
        "Pare-chocs Arrière": { top: "35%", left: "5%" },
        "Bas de caisse": { top: "65%", left: "48%" },
        "Montant": { top: "35%", left: "62%" }
    };

    if (markersList.length === 0 && legendContainer) {
        legendContainer.innerHTML = `<div class="col-12 text-center text-success fw-bold py-2"><i class="bi bi-check-circle-fill me-2"></i>Aucun défaut extérieur à afficher sur le schéma</div>`;
        return;
    }

    markersList.forEach(m => {
        const coord = coordinates[m.part] || { top: "35%", left: "50%" };
        
        if (markersContainer) {
            markersContainer.innerHTML += `
                <div class="defect-marker" style="top: ${coord.top}; left: ${coord.left};" title="${m.part}: ${m.defects}">
                    ${m.id}
                </div>
            `;
        }

        if (legendContainer) {
            legendContainer.innerHTML += `
                <div class="col-6">
                    <span class="badge bg-danger me-1">${m.id}</span> <strong>${m.part}:</strong> <span class="text-dark">${m.defects}</span>
                </div>
            `;
        }
    });
}

// 4. عرض بيانات التقرير بالكامل
function renderFullReport(data) {
    // 1. البيانات العامة
    const reportId = data.inspection_id || data.id || '--';
    if (document.getElementById('rep-code')) document.getElementById('rep-code').innerText = `REF: REP-2026-${reportId}`;
    if (document.getElementById('client-name')) document.getElementById('client-name').innerText = data.client_name || 'Non spécifié';
    if (document.getElementById('client-phone')) document.getElementById('client-phone').innerText = data.client_phone || 'Non renseigné';
    
    const formattedDate = data.created_at ? new Date(data.created_at).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR');
    if (document.getElementById('rep-date')) document.getElementById('rep-date').innerText = formattedDate;

    if (document.getElementById('car-brand-model')) document.getElementById('car-brand-model').innerText = `${data.brand || ''} ${data.model || ''}`.trim() || 'Non spécifié';
    if (document.getElementById('car-plate')) document.getElementById('car-plate').innerText = data.plate || '';
    if (document.getElementById('car-vin')) document.getElementById('car-vin').innerText = data.vin_number || data.vin || '--';
// 1. استخراج عام الصنع (Année) - إما من السيرفر أو تلقائياً من رقم اللوحة (Matricule)
let carYear = data.year || data.annee || data.car_year || data.model_year;

if (!carYear && data.plate) {
    
    const plateParts = String(data.plate).split('-');
    if (plateParts.length >= 2) {
        const middlePart = plateParts[1].trim(); 
        if (middlePart.length >= 2) {
            const yearDigits = middlePart.slice(-2); 
            const fullYear = parseInt(yearDigits, 10) > 50 ? `19${yearDigits}` : `20${yearDigits}`;
            carYear = fullYear;
        }
    }
}
if (document.getElementById('car-year')) {
    document.getElementById('car-year').innerText = carYear ? carYear : 'Non spécifié';
}

    if (document.getElementById('car-fuel')) document.getElementById('car-fuel').innerText = data.fuel || 'Essence / Diesel';
    if (document.getElementById('car-gearbox')) document.getElementById('car-gearbox').innerText = data.gearbox || 'Manuelle / Auto';

    // عرض حالة الكيلومتراج (حقيقي / غير حقيقي / لا يمكن الجزم)
    const kmVal = data.kilometrage_affiche;
    const kmStatus = String(data.conformite !== undefined ? data.conformite : (data.kilometrage_status || 'real'));

    let kmBadgeHtml = '';
    if (kmStatus === 'real' || kmStatus === '1' || kmStatus === 'true') {
        kmBadgeHtml = `<span class="badge bg-success ms-1"><i class="bi bi-check-circle me-1"></i>Réel (حقيقي)</span>`;
    } else if (kmStatus === 'suspect' || kmStatus === '0' || kmStatus === 'false') {
        kmBadgeHtml = `<span class="badge bg-danger ms-1"><i class="bi bi-exclamation-triangle me-1"></i>Non Réel / Suspect (غير حقيقي)</span>`;
    } else if (kmStatus === 'uncertain') {
        kmBadgeHtml = `<span class="badge bg-warning text-dark ms-1"><i class="bi bi-question-circle me-1"></i>Non vérifiable (لا يمكن الجزم)</span>`;
    }

    if (document.getElementById('car-km')) {
        document.getElementById('car-km').innerHTML = (kmVal !== null && kmVal !== undefined) 
            ? `${kmVal} KM ${kmBadgeHtml}` 
            : 'Non renseigné';
    }
    // 2. قراءة عدد المفاتيح (Nombre de clés) مع فحص كافة الاحتمالات الممكنة لاسم الحقل
const keysCount = data.keys_count ?? data.keys ?? data.nombre_cles ?? data.nombre_de_cles ?? data.car_keys;

if (document.getElementById('car-keys')) {
    document.getElementById('car-keys').innerText = (keysCount !== undefined && keysCount !== null && keysCount !== '') 
        ? keysCount 
        : 'Non spécifié';
}

    // 2. جدول الهيكل الخارجي (Carrosserie)
    const extBody = document.getElementById('ext-defects-body');
    if (extBody) {
        extBody.innerHTML = '';
        const elementsList = [
            { fr: "Capot", ar: "غطاء المحرك" },
            { fr: "Pare-chocs Avant", ar: "الواقي الأمامي" },
            { fr: "Aile AVG", ar: "الجناح أمامي أيسر" },
            { fr: "Porte AVG", ar: "الباب أمامي أيسر" },
            { fr: "Porte ARG", ar: "الباب خلفي أيسر" },
            { fr: "Aile ARG", ar: "الجناح خلفي أيسر" },
            { fr: "Coffre", ar: "الصندوق الخلفي" },
            { fr: "Toit", ar: "سقف السيارة" },
            { fr: "Pare-chocs Arrière", ar: "الواقي الخلفي" },
            { fr: "Aile AVD", ar: "الجناح أمامي أيمن" },
            { fr: "Porte AVD", ar: "الباب أمامي أيمن" },
            { fr: "Porte ARD", ar: "الباب خلفي أيمن" },
            { fr: "Aile ARD", ar: "الجناح خلفي أيمن" },
            { fr: "Montant", ar: "العارضة (المونطون)" },
            { fr: "Bas de caisse", ar: "أسفل الهيكل" }
        ];

        const columnsList = ["Peinture", "A froid", "Rayures", "Choque", "Corrosion", "Jeu", "Mastique", "Visse", "Raccord", "Change", "Soudure"];

        let extDefects = {};
        if (typeof data.elements_ext_json === 'string') {
            try { extDefects = JSON.parse(data.elements_ext_json); } catch(e) {}
        } else if (typeof data.elements_ext_json === 'object' && data.elements_ext_json !== null) {
            extDefects = data.elements_ext_json;
        }

        let markerIndex = 1;
        const markersList = [];

        elementsList.forEach((el) => {
            const detectedDefects = extDefects[el.fr] || [];
            let rowDefectsText = Array.isArray(detectedDefects) ? detectedDefects : [detectedDefects];

            if (rowDefectsText.length > 0 && rowDefectsText[0] !== '') {
                markersList.push({ id: markerIndex++, part: el.fr, defects: rowDefectsText.join(', ') });
            }

            let rowHtml = `<tr>
                <td class="text-start fw-bold">${el.fr} <small class="d-block text-muted fw-normal">${el.ar}</small></td>`;

            columnsList.forEach((col) => {
                const isChecked = rowDefectsText.includes(col);
                rowHtml += `<td>${isChecked ? '<i class="bi bi-x-circle-fill text-danger fs-6"></i>' : '<i class="bi bi-check2 text-muted opacity-25"></i>'}</td>`;
            });

            rowHtml += `</tr>`;
            extBody.innerHTML += rowHtml;
        });

        renderMarkersAndLegend(markersList);
    }

    // 3. Fiches de Contrôle Structurel
    const structBody = document.getElementById('struct-defects-body');
    if (structBody) {
        structBody.innerHTML = '';
        const structItems = [
            { key: 'longerons', name: 'Longerons / العوارض الطولية' },
            { key: 'traverses', name: 'Traverses / العوارض العرضية' },
            { key: 'passage_roues', name: 'Passage de roues / ممر العجلات' },
            { key: 'fond_coffre', name: 'Fond de coffre / أرضية الصندوق' },
            { key: 'chassis', name: 'Châssis / الهيكل الأساسي' },
            { key: 'optique', name: 'Optique / الأضواء' },
            { key: 'vitre', name: 'Vitre / الزجاج' }
        ];

        structItems.forEach(item => {
            const status = data[`${item.key}_status`] || 'Conforme';
            const obs = data[`${item.key}_obs`] || 'سليم / Aucun défaut';
            const isOk = status === 'Conforme' || status === 'OK' || status === 'سليم';

            structBody.innerHTML += `
                <tr>
                    <td class="fw-bold text-dark text-start">${item.name}</td>
                    <td class="text-center">
                        <span class="status-badge ${isOk ? 'ok' : 'defect'}">
                            ${isOk ? '<i class="bi bi-check-lg me-1"></i>Conforme' : '<i class="bi bi-exclamation-triangle-fill me-1"></i>Défaut'}
                        </span>
                    </td>
                    <td class="text-start">${obs}</td>
                </tr>
            `;
        });
    }

    // 4. Pneus / Jantes / Soubassement
    const suspBody = document.getElementById('suspension-defects-body');
    if (suspBody) {
        suspBody.innerHTML = '';
        const suspItems = [
            { name: 'Usure pneus (AVG, AVD, ARG, ARD)', val: data.usure_pneus || 'Conforme' },
            { name: 'État jantes (AVG, AVD, ARG, ARD)', val: data.etat_jantes || 'Conforme' },
            { name: 'Corrosion soubassement (صدأ أسفل الهيكل)', val: data.corrosion_soubassement ? 'Défaut' : 'Conforme' },
            { name: 'Traces de choc dessous véhicule (آثار صدمات سفلي)', val: data.traces_choc ? 'Défaut' : 'Conforme' }
        ];

        suspItems.forEach(item => {
            const isOk = item.val === 'Conforme' || item.val === 'OK';
            suspBody.innerHTML += `
                <tr>
                    <td class="fw-bold text-dark text-start">${item.name}</td>
                    <td class="text-center">
                        <span class="status-badge ${isOk ? 'ok' : 'defect'}">
                            ${isOk ? '<i class="bi bi-check-lg me-1"></i>Conforme' : '<i class="bi bi-exclamation-triangle-fill me-1"></i>Défaut'}
                        </span>
                    </td>
                    <td class="text-start">${isOk ? 'سليم / R.A.S' : 'A contrôler'}</td>
                </tr>
            `;
        });
    }

    // 5. الخاتمة الافتراضية
    const generalConclusion = document.getElementById('general-conclusion');
    if (generalConclusion) {
        generalConclusion.innerText = data.conclusion_structure || 'Aucun accident détecté';
    }

    // 6. استدعاء تلخيص الذكاء الاصطناعي
    fetchAISummary(data);
}

// 5. النصوص البديلة في حال فشل الاتصال بالسيرفر
function fallbackSummaries() {
    const defaultMsg = "Aucun résumé disponible pour le moment.";
    if (document.getElementById('ai-carrosserie-summary')) document.getElementById('ai-carrosserie-summary').innerText = defaultMsg;
    if (document.getElementById('ai-structure-summary')) document.getElementById('ai-structure-summary').innerText = defaultMsg;
    if (document.getElementById('ai-suspension-summary')) document.getElementById('ai-suspension-summary').innerText = defaultMsg;
    if (document.getElementById('moteur-summary-body')) document.getElementById('moteur-summary-body').innerText = defaultMsg;
    if (document.getElementById('scanner-summary-body')) document.getElementById('scanner-summary-body').innerText = defaultMsg;
}

// 6. دالة جلب ملخص الذكاء الاصطناعي (موحدة ومعالجة)
async function fetchAISummary(inspectionData) {
    const elCarrosserie = document.getElementById('ai-carrosserie-summary');
    const elStructure = document.getElementById('ai-structure-summary');
    const elSuspension = document.getElementById('ai-suspension-summary');
    const elMoteur = document.getElementById('moteur-summary-body');
    const elScanner = document.getElementById('scanner-summary-body');
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
            if (elCarrosserie) elCarrosserie.innerText = result.data.carrosserie_summary || "R.A.S / لا توجد ملاحظات";
            if (elStructure) elStructure.innerText = result.data.structure_summary || "R.A.S / لا توجد ملاحظات";
            if (elSuspension) elSuspension.innerText = result.data.suspension_summary || "R.A.S / لا توجد ملاحظات";
            if (elMoteur) elMoteur.innerHTML = `<i class="bi bi-robot text-danger me-1"></i> ${result.data.moteur_summary || "Bilan Moteur Conforme"}`;
            if (elScanner) elScanner.innerHTML = `<i class="bi bi-robot text-danger me-1"></i> ${result.data.scanner_summary || "Aucun code défaut"}`;
            if (elConclusion) elConclusion.innerText = result.data.conclusion_generale || inspectionData.conclusion_structure || "Aucun accident détecté";
        } else {
            fallbackSummaries();
        }
    } catch (error) {
        console.error("Erreur AI Frontend:", error);
        fallbackSummaries();
    }
}