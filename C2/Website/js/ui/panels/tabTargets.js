// js/ui/panels/tabTargets.js
import { cesiumViewer } from '../../core/Map.js';
import { sendOptronicCommand } from '../../hardware/optronic.js';
import { assignTrackClassification } from '../../data/TrackHandler.js'; 

let currentSelectedTrackId = null;
let activeTrackedId = null;
const emptyTubes = new Set([6, 11]); 

export function initGlobalEntitiesTab() {
    const tbody = document.getElementById('tracks-tbody');
    const targetContainer = document.getElementById('selected-target-container');
    if (!tbody || !targetContainer) return;

    // Menutup menu dropdown jika user klik di sembarang tempat
    document.addEventListener('click', (e) => {
        const dropdown = document.getElementById('assign-dropdown');
        if (dropdown && dropdown.style.display === 'block') {
            dropdown.style.display = 'none';
        }
    });
}

// =====================================================================
// TABLE UI
// =====================================================================
export function updateTracksTableUI(tracksList) {
    const tbody = document.getElementById('tracks-tbody');
    const countSpan = document.getElementById('track-count');
    const emptyMsg = document.getElementById('empty-tracks-msg');
    
    if (!tbody || !countSpan || !emptyMsg) return;

    countSpan.innerText = tracksList ? tracksList.length : 0;

    if (!tracksList || tracksList.length === 0) {
        tbody.innerHTML = '';
        emptyMsg.style.display = 'block';
        if (currentSelectedTrackId) clearSelectedTarget();
        return;
    }

    emptyMsg.style.display = 'none';
    const activeIds = new Set();

    tracksList.forEach(track => {
        const trackData = track.rawJson || track;
        const id = trackData.track_id || 'UNKNOWN';
        const type = trackData.special_purpose?.classification || 'UNKNOWN';
        const isEvasive = type.includes('EVASIVE');
        
        activeIds.add(id.toString());
        let row = document.getElementById(`track-row-${id}`);

        if (!row) {
            row = createTrackRow(id);
            tbody.appendChild(row);
        }

        row.__trackData = trackData;
        row.__isEvasive = isEvasive;
        
        const lat = trackData.kinematics?.lat;
        const lon = trackData.kinematics?.lon;
        const altFt = trackData.raw_asterix?.altitude?.alt_ft || 0;
        row.__lat = lat;
        row.__lon = lon;
        row.__altMeters = altFt * 0.3048;

        updateRowVisuals(row, type, isEvasive);

        if (currentSelectedTrackId === id) {
            renderSelectedTargetUI(trackData, true); 
        }
    });

    Array.from(tbody.children).forEach(row => {
        const rowId = row.id.replace('track-row-', '');
        if (!activeIds.has(rowId)) {
            tbody.removeChild(row);
            if (currentSelectedTrackId === rowId) clearSelectedTarget();
        }
    });
}

function createTrackRow(id) {
    const row = document.createElement('div');
    row.id = `track-row-${id}`;
    row.style.display = 'flex';
    row.style.alignItems = 'center';
    row.style.justifyContent = 'space-between';
    row.style.padding = '10px 16px'; 
    row.style.borderRadius = '6px'; 
    row.style.cursor = 'pointer';
    row.style.transition = 'background-color 0.2s ease';
    row.style.border = '1px solid transparent'; 

    const idSpan = document.createElement('div');
    idSpan.className = 'track-id-span';
    idSpan.style.fontFamily = 'monospace';
    idSpan.style.fontWeight = 'bold';
    idSpan.style.fontSize = '13px';
    idSpan.style.width = '65px';
    idSpan.style.color = '#ffffff';
    idSpan.textContent = id;

    const typeSpan = document.createElement('div');
    typeSpan.className = 'track-type-span';
    typeSpan.style.fontSize = '12px';
    typeSpan.style.flexGrow = '1';
    typeSpan.style.letterSpacing = '0.5px';

    row.appendChild(idSpan);
    row.appendChild(typeSpan);

    row.addEventListener('click', () => renderSelectedTargetUI(row.__trackData));
    row.addEventListener('dblclick', () => flyToTrack(row.__lon, row.__lat, row.__altMeters));
    row.addEventListener('mouseenter', () => { if(!row.__isEvasive) row.style.backgroundColor = 'rgba(30, 41, 59, 0.8)'; });
    row.addEventListener('mouseleave', () => { if(!row.__isEvasive) row.style.backgroundColor = 'rgba(15, 23, 42, 0.4)'; });

    return row;
}

// js/ui/panels/tabTargets.js (Hanya fungsi updateRowVisuals)

function updateRowVisuals(row, type, isEvasive) {
    const typeSpan = row.querySelector('.track-type-span');
    const iffStatus = row.__trackData.special_purpose?.iff_status || 'UNDETERMINED'; 

    let displayType = type.replace(/_/g, ' ').replace(' EVASIVE', '');
    if (!displayType || displayType.trim() === '') displayType = 'UNDETERMINED';
    
    const iffLabel = row.__trackData.is_manual_override ? `[IFF:${iffStatus}]` : `[${iffStatus}]`;

    // Pewarnaan Teks
    let iffColorHex = '#ffffff'; // Default putih
    if (iffStatus === 'HOSTILE') iffColorHex = '#ef4444'; 
    else if (iffStatus === 'FRIEND') iffColorHex = '#3b82f6'; 
    else if (iffStatus === 'BOGEY') iffColorHex = '#eab308'; 

    typeSpan.innerHTML = `<strong style="color:${iffColorHex}">${iffLabel}</strong> ${displayType}`;
    
    // Pewarnaan Highlight Baris
    if (iffStatus === 'HOSTILE') {
        row.style.borderColor = 'rgba(239, 68, 68, 0.4)';
        row.style.backgroundColor = 'rgba(69, 26, 26, 0.5)';
    } else if (iffStatus === 'FRIEND') {
        row.style.borderColor = 'rgba(59, 130, 246, 0.4)';
        row.style.backgroundColor = 'rgba(26, 46, 69, 0.5)';
    } else if (iffStatus === 'BOGEY') {
        row.style.borderColor = 'rgba(234, 179, 8, 0.4)';
        row.style.backgroundColor = 'rgba(69, 56, 26, 0.5)';
    } else {
        // UNDETERMINED
        row.style.borderColor = 'rgba(255, 255, 255, 0.2)';
        row.style.backgroundColor = 'rgba(255, 255, 255, 0.05)';
    }

    if (isEvasive) {
        row.style.borderStyle = 'dashed'; 
    } else {
        row.style.borderStyle = 'solid';
    }
}

// =====================================================================
// TARGET DETAILS CARD (JSON PANEL)
// =====================================================================

export function renderSelectedTargetUI(trackJson, isSilentUpdate = false) {
    const emptyMsg = document.getElementById('empty-target-msg');
    const jsonCard = document.getElementById('target-json-card');
    if (!emptyMsg || !jsonCard) return;

    if (!trackJson) {
        clearSelectedTarget();
        return;
    }

    const id = trackJson.track_id || 'UNKNOWN';
    currentSelectedTrackId = id; 

    if (isSilentUpdate && !jsonCard.classList.contains('hidden')) {
        updateCardLiveValues(trackJson);
        return;
    }

    emptyMsg.style.display = 'none';
    jsonCard.classList.remove('hidden');
    jsonCard.innerHTML = ''; 
    jsonCard.style.padding = '16px'; 
    jsonCard.style.background = 'rgba(10, 15, 24, 0.8)';
    jsonCard.style.borderRadius = '6px';
    jsonCard.style.border = '1px solid rgba(255, 255, 255, 0.1)';
    jsonCard.style.boxShadow = '0 4px 6px rgba(0, 0, 0, 0.3)';
    jsonCard.style.display = 'flex';
    jsonCard.style.flexDirection = 'column';
    jsonCard.style.gap = '16px'; 

    const type = trackJson.special_purpose?.classification || 'UNKNOWN';
    const rawLat = trackJson.kinematics?.lat;
    const rawLon = trackJson.kinematics?.lon;
    const lat = rawLat !== undefined ? rawLat.toFixed(5) : 'N/A';
    const lon = rawLon !== undefined ? rawLon.toFixed(5) : 'N/A';
    const alt = trackJson.kinematics?.height_m !== undefined ? trackJson.kinematics?.height_m + ' m' : 'N/A';
    const altFt = alt !== undefined ? Math.round(alt * 3.28084) + ' ft' : 'N/A';
    const lastSeenStr = trackJson.meta?.time_of_day_s || 'N/A'; //need to be converted later

    // 1. Header (Dengan Tombol X di Pojok)
    const headerTitle = document.createElement('div');
    headerTitle.style.position = 'relative'; 
    headerTitle.style.border = '1px solid rgba(74, 222, 128, 0.3)';
    headerTitle.style.padding = '8px';
    headerTitle.style.textAlign = 'center';
    headerTitle.style.background = 'rgba(74, 222, 128, 0.05)';
    headerTitle.style.borderRadius = '4px';
    
    const titleSpan = document.createElement('span');
    titleSpan.style.color = 'var(--strokeorborder)';
    titleSpan.style.fontWeight = 'bold';
    titleSpan.style.fontSize = '13px';
    titleSpan.style.letterSpacing = '1.5px';
    titleSpan.textContent = `TARGET: ${id}`;
    headerTitle.appendChild(titleSpan);
    
    const closeBtn = document.createElement('button');
    closeBtn.textContent = 'X'; 
    closeBtn.style.position = 'absolute';
    closeBtn.style.top = '50%';
    closeBtn.style.right = '8px';
    closeBtn.style.transform = 'translateY(-50%)';
    closeBtn.style.background = 'transparent';
    closeBtn.style.border = 'none';
    closeBtn.style.color = '#ef4444'; 
    closeBtn.style.fontWeight = 'bold';
    closeBtn.style.cursor = 'pointer';
    closeBtn.style.opacity = '0.5';
    closeBtn.onmouseenter = () => closeBtn.style.opacity = '1';
    closeBtn.onmouseleave = () => closeBtn.style.opacity = '0.5';
    closeBtn.onclick = () => clearSelectedTarget();
    headerTitle.appendChild(closeBtn);

    jsonCard.appendChild(headerTitle);

    // 2. Data Grid 
    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = '1fr';
    grid.style.gap = '10px'; 
    grid.style.fontFamily = "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif";

    let displayType = type.replace(/_/g, ' ');
    if (trackJson.is_manual_override) displayType += ' [MANUAL IFF]';

    grid.appendChild(createDetailRow('CLASS', displayType, '#ffffff', 'val-class'));
    grid.appendChild(createDetailRow('STATUS', 'TRACKING', 'var(--strokeorborder)', 'val-status'));
    grid.appendChild(createDetailRow('LATITUDE', lat, '#60a5fa', 'val-lat'));
    grid.appendChild(createDetailRow('LONGITUDE', lon, '#60a5fa', 'val-lon'));
    grid.appendChild(createDetailRow('ALTITUDE', alt, '#ffffff', 'val-alt'));
    grid.appendChild(createDetailRow('LAST SEEN', lastSeenStr, '#ffffff', 'val-lastseen'));
    
    grid.lastChild.style.borderBottom = 'none';
    grid.lastChild.style.paddingBottom = '0';
    jsonCard.appendChild(grid);

    // 3. Action Buttons 
    const btnContainer = document.createElement('div');
    btnContainer.style.marginTop = '4px';
    btnContainer.style.display = 'flex';
    btnContainer.style.gap = '8px';
    
    const targetEntityId = `track_${id}`;
    let isTracking = cesiumViewer && cesiumViewer.trackedEntity && cesiumViewer.trackedEntity.id === targetEntityId;

    const isCamTracking = (activeTrackedId === id);
    const camBaseBg = isCamTracking ? 'rgba(225, 29, 72, 0.2)' : 'rgba(234, 179, 8, 0.2)';
    const camHoverBg = isCamTracking ? 'rgba(225, 29, 72, 0.5)' : 'rgba(234, 179, 8, 0.5)';
    const camBorderColor = isCamTracking ? '#be123c' : '#ca8a04';
    const camLabel = isCamTracking ? 'STOP CAM' : 'CAM';

    // SVG Icons
    const iconView = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="22" y1="12" x2="18" y2="12"></line><line x1="6" y1="12" x2="2" y2="12"></line><line x1="12" y1="6" x2="12" y2="2"></line><line x1="12" y1="22" x2="12" y2="18"></line></svg>`;
    const iconAssign = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;
    const iconCam = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>`;
    const iconIntercept = `<svg width="14" height="14" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 10h4v4h-4zm0 0L6.5 6.5M9.96 6A3.5 3.5 0 1 0 6 9.96m8 .04l3.5-3.5m.5 3.46A3.5 3.5 0 1 0 14.04 6M14 14l3.5 3.5m-3.46.5A3.5 3.5 0 1 0 18 14.04M10 14l-3.5 3.5M6 14.04A3.5 3.5 0 1 0 9.96 18"/></svg>`;

    const viewBtn = createButton(isTracking ? 'UNVIEW' : 'VIEW', iconView, 'rgba(14, 165, 233, 0.2)', 'rgba(14, 165, 233, 0.5)', '#0284c7');
    const assignBtn = createButton('ASSIGN', iconAssign, 'rgba(34, 197, 94, 0.2)', 'rgba(34, 197, 94, 0.5)', '#16a34a');
    const camBtn = createButton(camLabel, iconCam, camBaseBg, camHoverBg, camBorderColor);
    const interceptBtn = createButton('INTERCEPT', iconIntercept, 'rgba(168, 85, 247, 0.2)', 'rgba(168, 85, 247, 0.5)', '#9333ea');

    viewBtn.addEventListener('click', () => {
        if (!cesiumViewer) return;
        const labelSpan = viewBtn.querySelector('.btn-label');
        if (isTracking) {
            cesiumViewer.trackedEntity = undefined;
            cesiumViewer.camera.cancelFlight(); 
            if(labelSpan) labelSpan.textContent = 'VIEW';
            isTracking = false;
        } else {
            cesiumViewer.trackedEntity = undefined; 
            cesiumViewer.camera.cancelFlight();
            
            const targetEntity = cesiumViewer.entities.getById(targetEntityId);
            if (targetEntity) {
                if(labelSpan) labelSpan.textContent = 'UNVIEW';
                isTracking = true;
                cesiumViewer.flyTo(targetEntity, {
                    offset: new Cesium.HeadingPitchRange(0.0, Cesium.Math.toRadians(-35.0), 3000),
                    duration: 1.5
                }).then(() => { if (isTracking) cesiumViewer.trackedEntity = targetEntity; });
            }
        }
    });

    assignBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleAssignDropdown(id, assignBtn);
    });

    camBtn.addEventListener('click', () => {
        if (activeTrackedId === id) {
            activeTrackedId = null;
            sendOptronicCommand('STOP_TRACKING');
        } else {
            const openCamBtn = document.getElementById('btn-open-camera');
            const cameraPanel = document.getElementById('right-camera-panel');
            activeTrackedId = id;
            sendOptronicCommand(`TRACK:${id}`);
            sendOptronicCommand(JSON.stringify(trackJson));
            if (cameraPanel && cameraPanel.classList.contains('closed')) {
                openCamBtn?.click();
            }
        }
        renderSelectedTargetUI(trackJson); 
    });

    interceptBtn.addEventListener('click', () => openInterceptModal(id));

    btnContainer.appendChild(viewBtn);
    btnContainer.appendChild(assignBtn);
    btnContainer.appendChild(camBtn);
    btnContainer.appendChild(interceptBtn);
    
    jsonCard.appendChild(btnContainer);
}

// =====================================================================
// MENU DROPDOWN IFF (ASSIGN) - PURE DOM
// =====================================================================
function toggleAssignDropdown(trackId, parentBtn) {
    const dropdown = document.getElementById('assign-dropdown');
    if (!dropdown) return;

    if (dropdown.style.display === 'block' && dropdown.dataset.trackId === trackId) {
        dropdown.style.display = 'none';
        return;
    }

    dropdown.dataset.trackId = trackId;
    
    const rect = parentBtn.getBoundingClientRect();
    dropdown.style.bottom = `${window.innerHeight - rect.top + 5}px`; 
    dropdown.style.left = `${rect.left - 10}px`;
    dropdown.style.display = 'block';

    const newDropdown = dropdown.cloneNode(true);
    dropdown.parentNode.replaceChild(newDropdown, dropdown);

    newDropdown.querySelectorAll('.assign-option').forEach(opt => {
        opt.onclick = () => {
            const newClass = opt.dataset.class;
            assignTrackClassification(trackId, newClass);
            newDropdown.style.display = 'none';
        }
    });
}

// =====================================================================
// TACTICAL INTERCEPT MODAL LOGIC - SINGLE DRONE + REC + AUTO-ARM
// =====================================================================
function openInterceptModal(targetId) {
    const overlay = document.getElementById('intercept-modal-overlay');
    if (!overlay) return; 

    const grid = document.getElementById('launcher-grid');
    grid.innerHTML = ''; 
    let isRecording = false; // State untuk tracking tombol REC
    
    const launchBtn = document.getElementById('btn-launch-drone');
    const recBtn = document.getElementById('btn-rec-intercept');
    const statusText = document.getElementById('selected-drone-status');
    const closeBtn = document.getElementById('close-intercept-modal');
    const templateIcon = document.getElementById('tmpl-drone-icon');
    
    // --- AUTO-ARM: Langsung aktifkan tombol launch & teks status ---
    launchBtn.disabled = false;
    statusText.innerHTML = `TARGET: TRACK-${targetId} | <span style="color:#facc15;">INTERCEPTOR ARMED & READY</span>`;

    // Pastikan tombol REC reset ke mode awal
    if (recBtn) {
        recBtn.classList.remove('recording');
        isRecording = false;
        
        // Bersihkan listener lama
        const newRecBtn = recBtn.cloneNode(true);
        recBtn.parentNode.replaceChild(newRecBtn, recBtn);
        
        newRecBtn.onclick = () => {
            isRecording = !isRecording;
            newRecBtn.classList.toggle('recording', isRecording);
        };
    }

    // MEMBUAT HANYA 1 DRONE INTERSEPTOR (LANGSUNG TERPILIH/SELECTED)
    const slot = document.createElement('div');
    slot.className = 'drone-slot ready selected'; // Tambahan 'selected' agar langsung menyala
    
    const slotLabel = document.createElement('span');
    slotLabel.className = 'slot-number';
    slotLabel.textContent = 'INT-01'; 
    slot.appendChild(slotLabel);

    if (templateIcon) {
        const iconClone = templateIcon.content.cloneNode(true);
        slot.appendChild(iconClone);
        
        // slot.onclick dihapus sepenuhnya karena tidak butuh proses seleksi manual lagi
    }
    grid.appendChild(slot);

    // Logika Utama Saat LAUNCH Ditekan
    launchBtn.onclick = () => {
        slot.classList.remove('ready', 'selected');
        slot.classList.add('empty'); 
        launchBtn.disabled = true;
        statusText.innerHTML = `TARGET: TRACK-${targetId} | <span style="color:#ef4444;">INTERCEPTOR DEPLOYED!</span>`;
        
        // --- AKSI INTEGRASI OPTRONIC ---
        // 1. Selalu arahkan optronic ke target (meskipun tidak buka kamera/rekam)
        sendOptronicCommand(`TRACK:${targetId}`);
        
        // 2. JIKA REC AKTIF: Mulai rekam DAN buka panel kamera
        if (isRecording) {
            console.log("[OPTRONIC] Initiating SD Card Recording...");
            sendOptronicCommand('RECORD_START');

            // Buka Panel Optronic secara paksa karena mode REC menyala
            const openCamBtn = document.getElementById('btn-open-camera');
            const cameraPanel = document.getElementById('right-camera-panel');
            if (cameraPanel && cameraPanel.classList.contains('closed')) {
                openCamBtn?.click();
            }
        }

        setTimeout(() => {
            overlay.classList.add('hidden');
        }, 1500);
    };
    
    closeBtn.onclick = () => overlay.classList.add('hidden');
    overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.add('hidden'); };
    
    overlay.classList.remove('hidden');
}


// =====================================================================
// UTILITY FUNCTIONS
// =====================================================================

function clearSelectedTarget() {
    currentSelectedTrackId = null;
    const emptyMsg = document.getElementById('empty-target-msg');
    const jsonCard = document.getElementById('target-json-card');
    
    if (emptyMsg) emptyMsg.style.display = 'block';
    if (jsonCard) {
        jsonCard.classList.add('hidden');
        jsonCard.innerHTML = '';
    }

    if (cesiumViewer) {
        cesiumViewer.trackedEntity = undefined;
        cesiumViewer.camera.cancelFlight();
    }
}

function updateCardLiveValues(trackJson) {
    const elClass = document.getElementById('val-class');
    const elLat = document.getElementById('val-lat');
    const elLon = document.getElementById('val-lon');
    const elAlt = document.getElementById('val-alt');
    const elSeen = document.getElementById('val-lastseen');

    if (elClass) {
        let typeStr = trackJson.special_purpose?.classification || 'UNKNOWN';
        typeStr = typeStr.replace(/_/g, ' ');
        if (trackJson.is_manual_override) typeStr += ' [MANUAL IFF]';
        elClass.textContent = typeStr;
    }

    if (elLat) elLat.textContent = trackJson.kinematics?.lat?.toFixed(5) || 'N/A';
    if (elLon) elLon.textContent = trackJson.kinematics?.lon?.toFixed(5) || 'N/A';
    if (elAlt) elAlt.textContent = (Math.round(trackJson.kinematics?.height_m || 0)) + ' m';
    if (elSeen) elSeen.textContent = trackJson.meta?.time_of_day_s || 'N/A'; //need to be converted later

    if (activeTrackedId === trackJson.track_id) {
        sendOptronicCommand(JSON.stringify(trackJson));
    }
}

function createDetailRow(label, value, valColor, valId) {
    const container = document.createElement('div');
    container.style.display = 'flex';
    container.style.justifyContent = 'space-between';
    container.style.alignItems = 'flex-start'; 
    container.style.fontSize = '11.5px';
    container.style.letterSpacing = '0.5px';
    container.style.borderBottom = '1px solid rgba(255, 255, 255, 0.06)';
    container.style.paddingBottom = '8px';
    
    const labelSpan = document.createElement('span');
    labelSpan.style.color = '#8ba2b5';
    labelSpan.style.minWidth = '75px';
    labelSpan.textContent = label;

    const valSpan = document.createElement('span');
    valSpan.id = valId;
    valSpan.style.color = valColor;
    valSpan.style.fontWeight = '600';
    valSpan.style.fontFamily = 'monospace';
    valSpan.style.fontSize = '12px';
    valSpan.style.textAlign = 'right';
    valSpan.style.wordBreak = 'break-word';
    valSpan.textContent = value;

    container.appendChild(labelSpan);
    container.appendChild(valSpan);
    return container;
}

function createButton(label, svgIcon, baseBg, hoverBg, borderColor) {
    const btn = document.createElement('button');
    btn.style.flex = '1';
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.gap = '6px';
    btn.style.padding = '8px 4px';
    btn.style.background = baseBg;
    btn.style.border = `1px solid ${borderColor}`;
    btn.style.color = '#ffffff';
    btn.style.fontSize = '9px';
    btn.style.fontWeight = 'bold';
    btn.style.letterSpacing = '1px';
    btn.style.cursor = 'pointer';
    btn.style.borderRadius = '4px';
    btn.style.transition = 'background 0.2s';

    btn.innerHTML = `${svgIcon} <span class="btn-label" style="display: none; white-space: nowrap;">${label}</span>`;
    
    btn.onmouseenter = () => {
        btn.style.background = hoverBg;
        const lbl = btn.querySelector('.btn-label');
        if (lbl) lbl.style.display = 'inline';
    };
    btn.onmouseleave = () => {
        btn.style.background = baseBg;
        const lbl = btn.querySelector('.btn-label');
        if (lbl) lbl.style.display = 'none';
    };
    
    return btn;
}

function flyToTrack(lon, lat, altMeters) {
    if (cesiumViewer && lon !== undefined && lat !== undefined) {
        cesiumViewer.trackedEntity = undefined;
        cesiumViewer.camera.cancelFlight();

        cesiumViewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(lon, lat, altMeters + 3000), 
            orientation: {
                heading: Cesium.Math.toRadians(0.0), 
                pitch: Cesium.Math.toRadians(-35.0), 
                roll: 0.0
            },
            duration: 1.5
        });
    }
}