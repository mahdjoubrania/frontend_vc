/* =====================================================================
   Réception — lien "Demandes en ligne" + compteur dans la barre latérale
   À inclure en dernier sur chaque page de la réception :
     <script src="online-bookings-badge.js"></script>
   - ajoute le lien dans le menu s'il n'existe pas déjà
   - affiche le nombre de demandes à vérifier (mis à jour toutes les 60 s)
   ===================================================================== */
(function () {
  const API_URL = 'https://romantic-enjoyment-production-f458.up.railway.app/api';
  const POLL_MS = 60000;
  const token = () => localStorage.getItem('token') || '';
  if (!token()) return;

  function ensureLink() {
    let link = document.querySelector('[data-online-bookings-link]');
    if (link) return link;
    const nav = document.querySelector('.sidebar ul.nav');
    if (!nav) return null;
    const li = document.createElement('li');
    li.className = 'nav-item';
    const active = /(^|\/)demandes\.html$/.test(location.pathname);
    li.innerHTML = `<a href="demandes.html" class="nav-link ${active ? 'active' : 'text-secondary'} d-flex align-items-center" data-online-bookings-link>
      <i class="bi bi-globe2 me-2"></i> Demandes en ligne
      <span class="badge rounded-pill bg-warning text-dark ms-auto d-none" data-online-bookings-badge>0</span></a>`;
    // Réception : après "Les Rendez-vous" ; Admin : après "Planning & RDV" ; sinon à la fin
    const after = (nav.querySelector('a[href="toutsrnd.html"]') || nav.querySelector('a[href="calendar.html"]') || nav.querySelector('a[href="Calendar.html"]'))?.closest('li');
    if (after && after.nextSibling) nav.insertBefore(li, after.nextSibling); else nav.appendChild(li);
    return li.querySelector('a');
  }

  const baseTitle = document.title;
  async function refresh() {
    const link = ensureLink();
    const badge = link && link.querySelector('[data-online-bookings-badge]');
    try {
      const res = await fetch(`${API_URL}/admin/online-bookings/pending-count`, { headers: { 'Authorization': `Bearer ${token()}` } });
      if (!res.ok) return;                        // 401/403/404 : on n'affiche rien, sans gêner la page
      const { count } = await res.json();
      const n = Number(count) || 0;
      if (badge) { badge.textContent = n; badge.classList.toggle('d-none', n === 0); }
      document.title = n > 0 ? `(${n}) ${baseTitle}` : baseTitle;
    } catch (e) { /* hors ligne : silencieux */ }
  }

  function start() {
    ensureLink();
    refresh();
    setInterval(() => { if (document.visibilityState === 'visible') refresh(); }, POLL_MS);
    window.addEventListener('online-bookings:changed', refresh);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
