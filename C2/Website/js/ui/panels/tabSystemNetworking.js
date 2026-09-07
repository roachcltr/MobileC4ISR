// ============================================================================
// STATE MEMORY & ARCHIVE
// ============================================================================
let lastRenderTime = 0;
const collapsedTracks = new Set();
const telemetryArchive = []; 
const MAX_ARCHIVE = 100000;    

let isFilterActive = false;
let filteredTracksDict = {};
let currentLiveTracks = {}; // Variabel baru penampung data real-time terakhir untuk diekspor
let isSystemTabInitialized = false; 

export function initSystemTab() {
    if (isSystemTabInitialized) return; 
    isSystemTabInitialized = true;      

    const panel = document.getElementById('panel-system-debug');
    if (!panel) return;

    // 1. Tombol Filter
    document.getElementById('btn-sys-filter').addEventListener('click', () => {
        const startStr = document.getElementById('filter-start').value;
        const endStr = document.getElementById('filter-end').value;
        
        if(!startStr || !endStr) {
            alert("Please input both Start Time and End Time!");
            return;
        }

        isFilterActive = true;
        document.getElementById('btn-sys-filter').style.background = 'var(--strokeorborder)';
        document.getElementById('btn-sys-filter').style.color = '#000';
        
        const today = new Date();
        const startParts = startStr.split(':');
        const endParts = endStr.split(':');
        
        const startTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), startParts[0], startParts[1], startParts[2] || 0).getTime();
        const endTime = new Date(today.getFullYear(), today.getMonth(), today.getDate(), endParts[0], endParts[1], endParts[2] || 0).getTime();

        filteredTracksDict = {};
        telemetryArchive.forEach(record => {
            if(record.timeMs >= startTime && record.timeMs <= endTime) {
                filteredTracksDict[record.trackId] = record.trackData;
            }
        });

        renderDataToScreen(filteredTracksDict);
    });

    // 2. Tombol Clear
    document.getElementById('btn-sys-clear').addEventListener('click', () => {
        isFilterActive = false;
        document.getElementById('filter-start').value = '';
        document.getElementById('filter-end').value = '';
        document.getElementById('btn-sys-filter').style.background = '';
        document.getElementById('btn-sys-filter').style.color = '';
    });

    // 3. Tombol Export PDF (SUDAH DIROMBAK UNTUK FORMAT DOKUMEN CETAK)
    document.getElementById('btn-sys-pdf').addEventListener('click', () => {
        // Tentukan data mana yang mau diekspor (hasil filter atau data live terbaru)
        const dataToExport = isFilterActive ? filteredTracksDict : currentLiveTracks;
        
        // Buat kerangka HTML "tak terlihat" khusus untuk PDF
        const printContainer = document.createElement('div');
        printContainer.innerHTML = buildPrintableHTML(dataToExport, isFilterActive);

        // Hapus konfigurasi background hitam (backgroundColor: '#05070a')
        const opt = {
            margin:       0.5,
            filename:     `TMMR_Telemetry_Report_${isFilterActive ? 'Filtered' : 'Latest'}_${Date.now()}.pdf`,
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2, useCORS: true }, 
            jsPDF:        { unit: 'in', format: 'a4', orientation: 'portrait' }
        };
        
        // Eksekusi print dari kerangka tak terlihat tersebut
        html2pdf().set(opt).from(printContainer).save();
    });
}

// ============================================================================
// GENERATOR DOKUMEN PDF (LATAR PUTIH, FORMAT TABEL RESMI)
// ============================================================================
function buildPrintableHTML(dataDict, isFiltered) {
    let html = `
        <div style="font-family: Arial, sans-serif; color: #000; background: #fff; padding: 10px;">
            <h2 style="text-align: center; border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px; font-size: 18px;">
                TMMR TELEMETRY REPORT
            </h2>
            <div style="margin-bottom: 20px; font-size: 12px; color: #333;">
                <p style="margin: 4px 0;"><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
                <p style="margin: 4px 0;"><strong>Data Mode:</strong> ${isFiltered ? 'Filtered (Archive)' : 'Live / Latest'}</p>
                <p style="margin: 4px 0;"><strong>Total Targets:</strong> ${Object.keys(dataDict).length}</p>
            </div>
    `;

    const trackIds = Object.keys(dataDict);
    if (trackIds.length === 0) {
        html += `<p style="text-align: center; color: #666; font-style: italic;">No telemetry data available for this report.</p>`;
    }

    trackIds.forEach(id => {
        const track = dataDict[id];
        const classification = track.tactical_data?.classification || 'UNKNOWN';

        html += `
            <div style="margin-bottom: 30px; page-break-inside: avoid;">
                <div style="background: #e2e8f0; padding: 6px 10px; border: 1px solid #94a3b8; border-bottom: none; font-weight: bold; font-size: 13px;">
                    TRACK ID: TRK-${id} <span style="float: right;">CLASS: ${classification}</span>
                </div>
                <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                    <thead>
                        <tr style="background-color: #f1f5f9;">
                            <th style="border: 1px solid #94a3b8; padding: 6px; text-align: left; width: 40%;">PARAMETER</th>
                            <th style="border: 1px solid #94a3b8; padding: 6px; text-align: left; width: 60%;">VALUE</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        // Rekursif untuk mencetak tabel 2 kolom yang rata (Flatten)
        function renderPrintRows(obj, prefix = '') {
            let rows = '';
            for (const key in obj) {
                const val = obj[key];
                if (val === null || val === undefined) continue;

                const displayKey = formatLabel(key);
                const rowLabel = prefix ? `${prefix} &gt; ${displayKey}` : displayKey;

                if (Array.isArray(val)) {
                    rows += `
                        <tr>
                            <td style="border: 1px solid #94a3b8; padding: 4px 6px; text-transform: uppercase;">${rowLabel}</td>
                            <td style="border: 1px solid #94a3b8; padding: 4px 6px; font-weight: bold;">[ARRAY: ${val.length}]</td>
                        </tr>
                    `;
                } else if (typeof val === 'object') {
                    rows += renderPrintRows(val, rowLabel);
                } else {
                    let displayVal = val;
                    if (typeof val === 'number' && !Number.isInteger(val)) {
                        displayVal = val.toFixed(3);
                    }
                    rows += `
                        <tr>
                            <td style="border: 1px solid #94a3b8; padding: 4px 6px; text-transform: uppercase;">${rowLabel}</td>
                            <td style="border: 1px solid #94a3b8; padding: 4px 6px;">${displayVal}</td>
                        </tr>
                    `;
                }
            }
            return rows;
        }

        html += renderPrintRows(track);
        html += `
                    </tbody>
                </table>
            </div>
        `;
    });

    html += `</div>`;
    return html;
}

// Helper Format Label/Value
function formatLabel(key) {
    if (key === 'classification') return 'class';
    if (key === 'formatted_time') return 'time';
    return key; 
}

function formatValue(val) {
    let displayVal = val;
    if (typeof val === 'number' && !Number.isInteger(val)) {
        displayVal = val.toFixed(3);
    }
    return String(displayVal);
}

function getValueStyle(strVal) {
    if (strVal.length > 14) return "font-size: 7.5px; white-space: nowrap;";
    if (strVal.length > 10) return "font-size: 8.5px; white-space: nowrap;";
    return "";
}

// Auto-Parser Rekursif untuk Layar Web (Theme Gelap)
function buildDOMKeyValueRows(obj, documentFragment) {
    const rowTemplate = document.getElementById('tmpl-data-row');
    const groupTemplate = document.getElementById('tmpl-data-group');

    for (const key in obj) {
        const val = obj[key];
        if (val === null || val === undefined) continue;

        const displayKey = formatLabel(key);

        if (Array.isArray(val)) {
            const rowNode = rowTemplate.content.cloneNode(true);
            rowNode.querySelector('.sys-key').textContent = displayKey;
            
            const valSpan = rowNode.querySelector('.sys-val');
            valSpan.textContent = `[ARR:${val.length}]`;
            valSpan.style.cssText = "color:#facc15; white-space: nowrap;";
            
            documentFragment.appendChild(rowNode);
        } else if (typeof val === 'object') {
            const groupNode = groupTemplate.content.cloneNode(true);
            groupNode.querySelector('.sys-group-header').textContent = `> ${displayKey}`;
            
            buildDOMKeyValueRows(val, groupNode);
            
            const wrapperDiv = document.createElement('div');
            wrapperDiv.appendChild(groupNode);
            documentFragment.appendChild(wrapperDiv);
            
        } else {
            const rowNode = rowTemplate.content.cloneNode(true);
            rowNode.querySelector('.sys-key').textContent = displayKey;
            
            const strVal = formatValue(val);
            const valSpan = rowNode.querySelector('.sys-val');
            valSpan.textContent = strVal;
            
            const extraStyle = getValueStyle(strVal);
            if(extraStyle) valSpan.style.cssText = extraStyle;
            
            documentFragment.appendChild(rowNode);
        }
    }
}

function renderDataToScreen(dataDict) {
    const container = document.getElementById('telemetry-cards-container');
    if (!container) return;

    const scrollParent = container.closest('.section-body');
    const trackIds = Object.keys(dataDict);
    
    if (trackIds.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 30px 10px; color: var(--strokeorborder); font-family: monospace; font-size: 11px; opacity: 0.4;">
                // NO TARGETS MATCHING CRITERIA
            </div>`;
    } else {
        const currentScrollPos = scrollParent ? scrollParent.scrollTop : 0;
        container.innerHTML = '';
        
        const cardTemplate = document.getElementById('tmpl-track-card');
        const rowTemplate = document.getElementById('tmpl-data-row');
        const groupTemplate = document.getElementById('tmpl-data-group');

        trackIds.forEach(id => {
            const track = dataDict[id];
            const classType = track.tactical_data?.classification || 'UNKNOWN';
            const isEvasive = classType.includes('EVASIVE');
            const badgeBg = isEvasive ? '#ef4444' : 'var(--strokeorborder)';
            const badgeColor = isEvasive ? '#fff' : '#000';

            const cardNode = cardTemplate.content.cloneNode(true);
            const headerNode = cardNode.querySelector('.sys-track-header');
            const gridContainer = cardNode.querySelector('.sys-track-grid');
            const chevronIcon = cardNode.querySelector('.sys-chevron');

            cardNode.querySelector('.track-id').textContent = `TRK-${id}`;
            const badgeSpan = cardNode.querySelector('.track-class');
            badgeSpan.textContent = classType;
            badgeSpan.style.background = badgeBg;
            badgeSpan.style.color = badgeColor;
            
            if (collapsedTracks.has(id)) {
                gridContainer.style.display = 'none';
                chevronIcon.style.transform = 'rotate(-90deg)';
            }

            headerNode.addEventListener('click', () => {
                if (collapsedTracks.has(id)) {
                    collapsedTracks.delete(id);
                    gridContainer.style.display = ''; 
                    chevronIcon.style.transform = 'rotate(0deg)';
                } else {
                    collapsedTracks.add(id);
                    gridContainer.style.display = 'none';
                    chevronIcon.style.transform = 'rotate(-90deg)';
                }
            });

            for (const key in track) {
                const val = track[key];
                if (val !== null && typeof val !== 'object') {
                    const displayKey = formatLabel(key);
                    const rowNode = rowTemplate.content.cloneNode(true);
                    rowNode.querySelector('.sys-key').textContent = displayKey;
                    const strVal = formatValue(val);
                    const valSpan = rowNode.querySelector('.sys-val');
                    valSpan.textContent = strVal;
                    
                    const extraStyle = getValueStyle(strVal);
                    if(extraStyle) valSpan.style.cssText = extraStyle;
                    gridContainer.appendChild(rowNode);
                    
                } else if (typeof val === 'object' && val !== null) {
                        if (key === 'raw_asterix') {
                        buildDOMKeyValueRows(val, gridContainer);
                    } else {
                        const displayKey = formatLabel(key);
                        const groupWrapper = document.createElement('div');
                        const groupNode = groupTemplate.content.cloneNode(true);
                        groupNode.querySelector('.sys-group-header').textContent = `> ${displayKey}`;
                        groupWrapper.appendChild(groupNode);
                        buildDOMKeyValueRows(val, groupWrapper);
                        gridContainer.appendChild(groupWrapper);
                    }
                }
            }
            container.appendChild(cardNode);
        });

        if (scrollParent) {
            requestAnimationFrame(() => scrollParent.scrollTop = currentScrollPos);
        }
    }
}

// Fungsi Gateway Utama
export function updateAllRawJsonDisplay(activeTracksDict) {
    const now = Date.now();
    
    // Perbarui penampung data live untuk PDF ekspor
    currentLiveTracks = activeTracksDict;
    
    Object.keys(activeTracksDict).forEach(id => {
        telemetryArchive.push({
            trackId: id,
            timeMs: now,
            trackData: JSON.parse(JSON.stringify(activeTracksDict[id]))
        });
    });
    
    if (telemetryArchive.length > MAX_ARCHIVE) {
        telemetryArchive.splice(0, telemetryArchive.length - MAX_ARCHIVE);
    }

    if (isFilterActive) return;

    if (now - lastRenderTime > 250) {
        renderDataToScreen(activeTracksDict);
        lastRenderTime = now;
    }
}

// ============================================================================
// AUTO-INITIALIZE
// ============================================================================
setTimeout(() => {
    initSystemTab();
}, 500);