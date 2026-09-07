document.addEventListener('DOMContentLoaded', () => {
    const btnLogout = document.getElementById('btn-logout');
    const loginOverlay = document.getElementById('login-overlay');
    const inputPass = document.getElementById('login-pass');
    const msgBox = document.getElementById('login-error');

    if (btnLogout && loginOverlay) {
        btnLogout.addEventListener('click', () => {
            // 1. Munculkan kembali layar hitam login
            loginOverlay.style.visibility = 'visible';
            loginOverlay.style.opacity = '1';
            
            // 2. Bersihkan pesan error dan password agar aman
            if (msgBox) msgBox.textContent = '';
            if (inputPass) {
                inputPass.value = '';
            }
        });
    }
});