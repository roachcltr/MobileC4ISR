// js/ui/buttons/setOrigin.js
export function initSetOriginButton() {
    const btn = document.getElementById('set-origin-btn');
    const overlay = document.getElementById('coord-modal-overlay');
    const cancelBtn = document.getElementById('coord-cancel');
    const submitBtn = document.getElementById('coord-submit');

    if (!btn || !overlay) return;

    // Buka Modal
    btn.addEventListener('click', () => {
        overlay.style.display = 'flex';
    });

    // Tutup Modal
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            overlay.style.display = 'none';
        });
    }

    // Submit Modal
    if (submitBtn) {
        submitBtn.addEventListener('click', () => {
            const lat = parseFloat(document.getElementById('input-lat').value);
            const lon = parseFloat(document.getElementById('input-lon').value);
            
            if (!isNaN(lat) && !isNaN(lon)) {
                updateRadarLocation(lat, lon);
                overlay.style.display = 'none';
            } else {
                alert("Invalid coordinate format.");
            }
        });
    }
}

function updateRadarLocation(newLat, newLon) {
    if (typeof activeTrackerSocket !== 'undefined' && activeTrackerSocket && activeTrackerSocket.readyState === WebSocket.OPEN) {
        const payload = JSON.stringify({
            type: "UPDATE_RADAR_LOCATION",
            lat: newLat,
            lon: newLon
        });
        activeTrackerSocket.send(payload);
        console.log(`[C2] Requested radar relocation to: ${newLat}, ${newLon}`);
    } else {
        console.warn("[C2] Tracker socket is offline. Cannot update location.");
    }
}