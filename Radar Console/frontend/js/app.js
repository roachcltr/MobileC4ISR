// js/app.js
let currentRange = 5;

// ============ KONEKSI WEBSOCKET & TABEL ============
window.liveTargets = [];
const trackListEl = document.getElementById('track-list');

// Membuka jalur komunikasi real-time secara dinamis mengikuti IP server
const ws = new WebSocket(`ws://${window.location.hostname}:8004`);

ws.onopen = () => console.log("[WS] Terhubung ke backend.js!");

// Tambahkan variabel global untuk menyimpan target yang dipilih
window.selectedTracks = [];

ws.onmessage = (event) => {
    const targets = JSON.parse(event.data);
    window.liveTargets = targets;

    const checkedIds = Array.from(document.querySelectorAll('.track-table input:checked')).map(cb => cb.value);
    window.selectedTracks = checkedIds; // Update global state

    trackListEl.innerHTML = '';
    targets.forEach(trk => {
        const isChecked = checkedIds.includes(trk.track_id) ? 'checked' : '';
        const tr = document.createElement('tr');
        
        // Mengambil nilai berdasarkan struktur JSON yang baru
        const classification = trk.special_purpose.classification ?? 'UNKNOWN';
        const speedMps = trk.kinematics.speed_ms;
        const hdgDeg = trk.kinematics.heading_deg;
        const altM = trk.kinematics.height_m;

        // Menentukan warna label klasifikasi
        const clsfClass = classification.includes('DRONE') ? 'unk' : 'trk';

        tr.innerHTML = `
            <td class="chk"><input type="checkbox" value="${trk.track_id}" ${isChecked}></td>
            <td class="id-cell">${trk.track_id}</td>
            <td>${(trk.kinematics.range_m / 1000).toFixed(2)} km</td>
            <td>${Number(trk.kinematics.azimuth_deg).toFixed(1)}&deg;</td>
            <td>${altM != null ? Math.round(altM) : '&mdash;'} m</td>
            <td>${speedMps != null ? speedMps.toFixed(1) : '&mdash;'} m/s</td>
            <td>${hdgDeg != null ? Number(hdgDeg).toFixed(1) : '&mdash;'}&deg;</td>
            <td>${trk.special_purpose.rcs_db} dB</td>
            <td><span class="clsf ${clsfClass}">${classification}</span></td>
        `;
        if(isChecked) tr.classList.add('sel');
        
        tr.querySelector('input').addEventListener('change', (e) => {
            tr.classList.toggle('sel', e.target.checked);
            // Langsung update global state saat dicentang
            window.selectedTracks = Array.from(document.querySelectorAll('.track-table input:checked')).map(cb => cb.value);
        });
        trackListEl.appendChild(tr);
    });

    const countStr = targets.length;
    document.getElementById('track-count').textContent = `${countStr} tracks`;
    document.getElementById('hud-trackcount').textContent = countStr;
    document.getElementById('status-trackcount').textContent = `TRACKS: ${countStr}`;
};

// ============ Tombol Send to C2 ============
window.sendToC2 = function() {
    const selectedIds = window.selectedTracks || [];
    if (selectedIds.length === 0) return alert("Pilih minimal satu track terlebih dahulu.");
    
    const btn = document.querySelector('.send-btn');
    const originalHTML = btn.innerHTML;
    btn.innerHTML = "Transmitting to C2&hellip;";
    btn.style.background = "#ffb020";
    btn.style.color = "#1f2733";

    // Kirim aba-aba ke backend.js via WebSocket
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: "FORWARD_TO_C2",
            selected_ids: selectedIds
        }));
        
        setTimeout(() => {
            btn.innerHTML = "Data Sent ✓";
            btn.style.background = "#0067c0";
            btn.style.color = "#fff";
            setTimeout(() => {
                btn.innerHTML = originalHTML;
                btn.style.background = "";
                btn.style.color = "";
            }, 1500);
        }, 500);
    } else {
        alert("Koneksi ke backend radar terputus!");
        btn.innerHTML = originalHTML;
    }
}

// ============ Jam Real-Time ============
function tickClock() {
    const now = new Date();
    const hh = String((now.getUTCHours()+7)).padStart(2, '0');
    const mm = String(now.getUTCMinutes()).padStart(2, '0');
    const ss = String(now.getUTCSeconds()).padStart(2, '0');
    document.getElementById('hud-clock').textContent = `${hh}:${mm}:${ss} UTC`;
    document.getElementById('status-clock').textContent = `UTC ${hh}:${mm}:${ss}`;
    const y = now.getUTCFullYear();
    const mo = String(now.getUTCMonth() + 1).padStart(2, '0');
    const da = String(now.getUTCDate()).padStart(2, '0');
    document.getElementById('hud-date').textContent = `${y}-${mo}-${da}`;
}
tickClock(); setInterval(tickClock, 1000);

// ============ Main Radar Canvas ============
const radarCanvas = document.getElementById('radar-canvas');
const ctx = radarCanvas.getContext('2d');
let width, height, cx, cy, angle = 0;

function resizeCanvas() {
    radarCanvas.width = radarCanvas.parentElement.clientWidth;
    radarCanvas.height = radarCanvas.parentElement.clientHeight;
    width = radarCanvas.width; height = radarCanvas.height;
    cx = width / 2; cy = height / 2;
}
window.addEventListener('resize', resizeCanvas); resizeCanvas();

const cardinal = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
function drawCompassAndRings(maxRadius) {
    ctx.lineWidth = 1; ctx.font = '10px Segoe UI, monospace';
    for (let i = 1; i <= 4; i++) {
        const r = (maxRadius / 4) * i;
        ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = i === 4 ? 'rgba(120, 220, 150, 0.35)' : 'rgba(255, 255, 255, 0.14)';
        ctx.stroke();
        const ringRangeNm = (currentRange / 4) * i;
        ctx.fillStyle = 'rgba(150, 230, 170, 0.65)';
        ctx.fillText(ringRangeNm.toFixed(1), cx + 4, cy - r - 2);
    }
    for (let deg = 0; deg < 360; deg += 10) {
        const rad = (deg * Math.PI) / 180;
        const isMajor = deg % 30 === 0;
        const outer = maxRadius + (isMajor ? 14 : 7);
        const inner = maxRadius + 2;
        ctx.beginPath(); ctx.moveTo(cx + Math.sin(rad) * inner, cy - Math.cos(rad) * inner);
        ctx.lineTo(cx + Math.sin(rad) * outer, cy - Math.cos(rad) * outer);
        ctx.strokeStyle = isMajor ? 'rgba(160,230,180,0.8)' : 'rgba(120,180,140,0.4)';
        ctx.lineWidth = isMajor ? 1.2 : 0.7; ctx.stroke();
        if (isMajor) {
            ctx.fillStyle = cardinal[deg] ? '#e8fff0' : 'rgba(170,230,190,0.75)';
            ctx.font = cardinal[deg] ? 'bold 12px Segoe UI' : 'monospace';
            const label = cardinal[deg] || String(deg).padStart(3, '0');
            const tw = ctx.measureText(label).width;
            ctx.fillText(label, cx + Math.sin(rad) * (outer + 9) - tw / 2, cy - Math.cos(rad) * (outer + 9) + 4);
        }
    }
    ctx.beginPath(); ctx.moveTo(cx, cy - maxRadius); ctx.lineTo(cx, cy + maxRadius);
    ctx.moveTo(cx - maxRadius, cy); ctx.lineTo(cx + maxRadius, cy);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)'; ctx.stroke();
}

let scanDirection = 1;
let currentTailAngle = -0.4;
function drawRadar() {
    ctx.fillStyle = 'rgba(3, 10, 4, 0.16)';
    ctx.fillRect(0, 0, width, height);
    const maxRadius = Math.min(width, height) / 2 - 34;

    drawCompassAndRings(maxRadius);

    // Mapping Target dari WebSocket ke Canvas
    window.liveTargets.forEach(target => {
        const range_nm = target.kinematics.range_m / 1852.0; 
        const scale = maxRadius / currentRange;
        const r_px = range_nm * scale;
        
        if(r_px <= maxRadius) {
            const rad = (target.kinematics.azimuth_deg - 90) * Math.PI / 180;
            const tx = cx + r_px * Math.cos(rad);
            const ty = cy + r_px * Math.sin(rad);

            const isSelected = window.selectedTracks && window.selectedTracks.includes(target.track_id);

            if (isSelected) {
                ctx.beginPath();
                ctx.arc(tx, ty, 14, 0, Math.PI * 2);
                ctx.strokeStyle = '#00ffff'; 
                ctx.lineWidth = 1.5;
                ctx.stroke();

                ctx.fillStyle = '#00ffff';
                ctx.font = 'bold 10px monospace';
                ctx.fillText(target.track_id, tx + 18, ty + 4);
            }

            ctx.beginPath(); ctx.arc(tx, ty, 4, 0, Math.PI * 2);
            ctx.fillStyle = isSelected ? '#ff8888' : '#ff3333'; ctx.fill();
            ctx.beginPath(); ctx.arc(tx, ty, 7, 0, Math.PI * 2);
            ctx.strokeStyle = isSelected ? '#ffffff' : 'rgba(255,80,80,0.8)'; 
            ctx.lineWidth = 1; ctx.stroke();
        }
    });

    // Putaran Sapuan Radar (Sector Scan)
    ctx.save(); 
    ctx.translate(cx, cy); 
    ctx.rotate(angle);
    
    // Garis utama
    ctx.beginPath(); 
    ctx.moveTo(0, 0); 
    ctx.lineTo(0, -maxRadius);
    ctx.strokeStyle = 'rgba(120, 255, 150, 0.85)'; 
    ctx.lineWidth = 1.6; 
    ctx.stroke();
    
    // 1. Set the target tail size based on direction
    const targetTailAngle = (scanDirection === 1) ? -1 : 1;

    // 2. Smoothly ease the current tail towards the target (0.001 controls the transition speed)
    currentTailAngle += (targetTailAngle - currentTailAngle) * 0.1;
    
    // 3. Draw the dynamically sized tail
    ctx.beginPath(); 
    ctx.moveTo(0, 0); 
    
    // If currentTailAngle is negative, Canvas needs to draw counter-clockwise (true)
    const isCounterClockwise = currentTailAngle < 0; 
    
    ctx.arc(0, 0, maxRadius, -Math.PI / 2, -Math.PI / 2 + currentTailAngle, isCounterClockwise);
    
    const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, maxRadius);
    grad.addColorStop(0, 'rgba(60, 255, 120, 0.28)'); 
    grad.addColorStop(1, 'rgba(60, 255, 120, 0.0)');
    ctx.fillStyle = grad; 
    ctx.fill(); 
    ctx.restore();

    // Logika Pemantulan Sudut (300 derajat ke 60 derajat)
    const limit = Math.PI / 4; // 45 derajat dalam radian
    const speed = 0.4;
    
    angle += speed * scanDirection;
    if (angle >= limit) {
        angle = limit;
        scanDirection = -1; // Balik arah ke kiri
    } else if (angle <= -limit) {
        angle = -limit;
        scanDirection = 1; // Balik arah ke kanan
    }

    requestAnimationFrame(drawRadar);
}
drawRadar();
