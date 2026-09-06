document.addEventListener("DOMContentLoaded", async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');

    if (!id) {
        console.error("Aucun ID de rapport spécifié.");
        return;
    }

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

        if (data && (data.id || data.inspection_id || data.client_name || data.brand)) {
            renderFullReport(data);
        } else {
            alert("Rapport introuvable ou données incomplètes.");
        }
    } catch (err) {
        console.error("Erreur de chargement du rapport:", err);
        alert("Erreur de connexion au serveur lors du chargement des données.");
    }
});

function renderFullReport(data) {
    // 1. Page 1: Client & Vehicle Overview
    const reportId = data.inspection_id || data.id || '--';
    document.getElementById('rep-code').innerText = `REF: REP-2026-${reportId}`;
    
    document.getElementById('client-name').innerText = data.client_name || 'Non spécifié';
    document.getElementById('client-phone').innerText = data.client_phone || 'Non renseigné';
    
    const formattedDate = data.created_at ? new Date(data.created_at).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR');
    document.getElementById('rep-date').innerText = formattedDate;

    const brand = data.brand || '';
    const model = data.model || '';
    document.getElementById('car-brand-model').innerText = `${brand} ${model}`.trim() || 'Non spécifié';
    document.getElementById('car-plate').innerText = data.plate || 'Sans immatriculation';
    document.getElementById('car-color').innerText = data.color || 'Non spécifiée';
    
    // Kilométrage Mapping
    const kmVal = data.kilometrage_affiche;
    document.getElementById('car-km').innerText = (kmVal !== null && kmVal !== undefined) ? `${kmVal} KM` : 'Non renseigné';
    
    const kmStatusElem = document.getElementById('car-km-status');
    if (kmStatusElem) {
        const conf = data.km_conformite || 'CONFORME';
        kmStatusElem.innerText = conf;
        kmStatusElem.className = (conf === 'CONFORME' || conf === 'Conforme') ? 'badge bg-success' : 'badge bg-danger';
    }

    // 2. Moteur & Scanner Summaries
    const moteurSummary = document.getElementById('moteur-summary-body');
    if (moteurSummary) {
        const niveauHuile = data.niveau_huile || 'Non contrôlé';
        const isMoteurOk = niveauHuile !== 'NON_CONFORME' && niveauHuile !== 'Non contrôlé';
        moteurSummary.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="small fw-bold">Niveau & État Huile:</span>
                <span class="badge ${isMoteurOk ? 'bg-success' : 'bg-danger'}">${niveauHuile}</span>
            </div>
            <small class="text-muted d-block">Contrôle visuel et étanchéité effectués.</small>
        `;
    }

    const scannerSummary = document.getElementById('scanner-summary-body');
    if (scannerSummary) {
        const scannerCode = data.dtc_codes || data.calculateur_status || 'Aucun code défaut';
        scannerSummary.innerHTML = `
            <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="small fw-bold">Diagnostic OBD:</span>
                <span class="badge bg-info text-dark">${scannerCode}</span>
            </div>
            <small class="text-muted d-block">Systèmes électroniques scannés.</small>
        `;
    }

    // 3. Page 2: Carrosserie Matrix Table (15 Elements)
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

        const columnsList = [
            "Peinture", "A froid", "Rayures", "Choque", "Corrosion",
            "Jeu", "Mastique", "Visse", "Raccord", "Change", "Soudure"
        ];

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
                <td class="text-start fw-bold">
                    ${el.fr}
                    <small class="d-block text-muted fw-normal">${el.ar}</small>
                </td>`;

            columnsList.forEach((col) => {
                const isChecked = rowDefectsText.includes(col);
                rowHtml += `
                    <td>
                        ${isChecked ? '<i class="bi bi-x-circle-fill text-danger fs-6"></i>' : '<i class="bi bi-check2 text-muted opacity-25"></i>'}
                    </td>
                `;
            });

            rowHtml += `</tr>`;
            extBody.innerHTML += rowHtml;
        });

        renderMarkersAndLegend(markersList);
    }

    // 4. Page 3: Structure Checklist
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

    const generalConclusion = document.getElementById('general-conclusion');
    if (generalConclusion) {
        generalConclusion.innerText = data.conclusion_structure || 'Véhicule en bon état général selon les contrôles effectués.';
    }
}

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