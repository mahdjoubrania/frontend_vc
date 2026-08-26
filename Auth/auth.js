const API_URL = 'https://romantic-enjoyment-production-f458.up.railway.app/api';

const loginForm = document.getElementById('login-form');
const alertBox = document.getElementById('alert-box');
const roleInput = document.getElementById('Role'); 
const passwordInput = document.getElementById('password');
const togglePasswordBtn = document.getElementById('toggle-password');
const toggleIcon = document.getElementById('toggle-icon');
const btnSubmit = document.getElementById('btn-submit');
const btnText = document.getElementById('btn-text');
const btnSpinner = document.getElementById('btn-spinner');


if (togglePasswordBtn && passwordInput && toggleIcon) {
  togglePasswordBtn.addEventListener('click', () => {
    const isPassword = passwordInput.type === 'password';
    passwordInput.type = isPassword ? 'text' : 'password';
    toggleIcon.className = isPassword ? 'bi bi-eye-slash-fill' : 'bi bi-eye-fill';
  });
}


if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const role = roleInput ? roleInput.value.trim() : '';
    const password = passwordInput ? passwordInput.value.trim() : '';

    if (!role || !password) {
      showAlert('Veuillez remplir tous les champs.', 'danger');
      return;
    }

    alertBox.innerHTML = '';
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, password }) 
      });

      const data = await res.json();

      if (res.ok) {
        const userData = data.user || { role: role, fullName: 'User' };
        localStorage.setItem('verifcar_admin_user', JSON.stringify(userData));
        
        if (data.token) {
          localStorage.setItem('token', data.token);
        }

        showAlert('Connexion réussie, redirection...', 'success');

        setTimeout(() => {
          if (userData.role === 'ADMIN') {
            window.location.href = '../Admin/index.html'; 
          } else if (userData.role === 'RECEPTION') {
            window.location.href = '../Reception/index.html'; 
          } else {
            window.location.href = '../Admin/index.html';
          }
        }, 800);

      } else {
        showAlert(data.message || 'Identifiants incorrects', 'danger');
        setLoading(false);
      }
    } catch (err) {
      showAlert('Impossible de se connecter au serveur Backend.', 'danger');
      setLoading(false);
    }
  });
}

function showAlert(message, type) {
  if (!alertBox) return;
  const icon = type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill';
  alertBox.innerHTML = `
    <div class="alert alert-${type} d-flex align-items-center py-2 px-3 small border-0 rounded-3 shadow-sm mb-3" role="alert">
      <i class="bi ${icon} me-2 fs-6"></i>
      <div>${message}</div>
    </div>
  `;
}

function setLoading(isLoading) {
  if (!btnSubmit || !btnText || !btnSpinner) return;
  if (isLoading) {
    btnSubmit.disabled = true;
    btnText.textContent = 'Connexion en cours...';
    btnSpinner.classList.remove('d-none');
  } else {
    btnSubmit.disabled = false;
    btnText.textContent = 'Se connecter';
    btnSpinner.classList.add('d-none');
  }
}