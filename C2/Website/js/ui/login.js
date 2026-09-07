document.addEventListener('DOMContentLoaded', () => {
    const btnLogin = document.getElementById('btn-login');
    const inputUser = document.getElementById('login-user');
    const inputPass = document.getElementById('login-pass');
    const msgBox = document.getElementById('login-error');
    const overlay = document.getElementById('login-overlay');

    // Fungsi untuk mengecek login
    function attemptLogin() {
        const user = inputUser.value;
        const pass = inputPass.value;

        if (user === 'c2' && pass === 'radar'
            // || user === 'c2-user' && pass === 'radar'
        ) {
            // Berhasil
            msgBox.textContent = 'ACCESS GRANTED. INITIALIZING...';
            msgBox.style.color = 'var(--strokeorborder)'; // Hijau taktis
            
            // Animasi memudar setelah setengah detik
            setTimeout(() => {
                overlay.style.opacity = '0';
                overlay.style.visibility = 'hidden';
            }, 600);

        } else {
            // Gagal
            msgBox.textContent = 'ACCESS DENIED. INVALID CREDENTIALS.';
            msgBox.style.color = '#ef4444'; // Merah peringatan
            
            // Mengosongkan password agar bisa coba lagi
            inputPass.value = '';
            inputPass.focus();
        }
    }

    // Eksekusi saat tombol diklik
    btnLogin.addEventListener('click', attemptLogin);

    // Eksekusi saat tombol "Enter" ditekan di keyboard
    inputPass.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            attemptLogin();
        }
    });
    inputUser.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            inputPass.focus();
        }
    });
});