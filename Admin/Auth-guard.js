document.addEventListener('DOMContentLoaded', () => {
  const userSessionRaw = localStorage.getItem('verifcar_admin_user');
  const userSession = userSessionRaw ? JSON.parse(userSessionRaw) : null;
 
  if (!userSession || userSession.role !== 'ADMIN') {
    alert("Accès refusé : Seul l'administrateur est autorisé à accéder à cette page.");
    window.location.href = '../Auth/index.html';
    return;
  }
 
  const adminFullName = userSession.fullName || userSession.full_name || 'Admin';
  const nameEl = document.getElementById('admin-name');
  const welcomeEl = document.getElementById('admin-welcome');
  const avatarEl = document.getElementById('admin-avatar');
 
  if (nameEl) nameEl.innerText = adminFullName;
  if (welcomeEl) welcomeEl.innerText = adminFullName.split(' ')[0];
  if (avatarEl) avatarEl.innerText = adminFullName.charAt(0).toUpperCase();
});
 
