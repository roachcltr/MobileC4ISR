// js/ui/panels/tabHardware.js
import { initOptronic } from '../../hardware/optronic.js';

export function initHardwareTab() {
    const panel = document.getElementById('panel-hardware');
    if (!panel) return;
    
    // Inisialisasi logika Optronic
    initOptronic();
}

// =====================================================================
// FUNGSI PENGUBAH WARNA / STATUS HARDWARE (HELPER)
// =====================================================================
export function setHardwareStatus(deviceName, isActive) {
    const ledEl = document.getElementById(`led-${deviceName}`);
    const statusEl = document.getElementById(`status-${deviceName}`);

    if (!ledEl || !statusEl) return;

    if (isActive) {
        // Ubah menjadi ACTIVE (Hijau LED Berkedip)
        ledEl.classList.remove('inactive');
        ledEl.classList.add('active');
        
        statusEl.classList.remove('inactive');
        statusEl.classList.add('active');
        statusEl.innerText = 'ACTIVE';
    } else {
        // Ubah menjadi NONACTIVE (Merah LED Statis)
        ledEl.classList.remove('active');
        ledEl.classList.add('inactive');
        
        statusEl.classList.remove('active');
        statusEl.classList.add('inactive');
        statusEl.innerText = 'NONACTIVE';
    }
}