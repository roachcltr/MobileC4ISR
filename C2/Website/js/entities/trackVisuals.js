// js/entities/trackVisuals.js

// Warna sekarang ditentukan MURNI dari status IFF
export function getClassColor(iffStatus) {
    if (iffStatus === "HOSTILE") return Cesium.Color.fromCssColorString('#ef4444');
    if (iffStatus === "FRIEND") return Cesium.Color.fromCssColorString('#3b82f6');
    if (iffStatus === "BOGEY") return Cesium.Color.fromCssColorString('#eab308');
    return Cesium.Color.WHITE; // UNDETERMINED = Putih
}

export function getClassColorHex(iffStatus) {
    if (iffStatus === "HOSTILE") return "#ef4444";
    if (iffStatus === "FRIEND") return "#3b82f6";
    if (iffStatus === "BOGEY") return "#eab308";
    return "#ffffff"; // UNDETERMINED = Putih
}

function getEvasiveBadge() {
    return `
        <circle cx="100" cy="8" r="10" fill="white" stroke="black" stroke-width="2"/>
        <g transform="translate(91,-1) scale(0.75)" fill="none" stroke="red" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11"/>
        </g>`;
}

const symbolCache = new Map();

// Bentuk ditentukan MURNI dari Klasifikasi
export function getClassSymbol(classification, colorStr) {
    const cacheKey = `${classification}|${colorStr}`;
    const cached = symbolCache.get(cacheKey);
    if (cached) return cached;

    let shape = '';
    const classUpper = (classification || "UNDETERMINED").toUpperCase();
    const isEvasive = classUpper.includes("EVASIVE");

    // Pemetaan bentuk persis sesuai dengan Legend di UI
    if (classUpper.includes("AIRPLANE") || classUpper.includes("FIXED_WING")) {
        shape = `<polygon points="18,4 32,28 4,28" fill="none" stroke="${colorStr}" stroke-width="3"/>`;
    } 
    else if (classUpper.includes("HELICOPTER")) {
        shape = `<polygon points="18,10 32,28 4,28" fill="none" stroke="${colorStr}" stroke-width="3"/><line x1="6" y1="10" x2="30" y2="10" stroke="${colorStr}" stroke-width="3"/>`;
    }
    else if (classUpper.includes("ROTARY")) {
        shape = `<circle cx="18" cy="18" r="13" fill="none" stroke="${colorStr}" stroke-width="3"/><line x1="9" y1="9" x2="27" y2="27" stroke="${colorStr}" stroke-width="3"/><line x1="9" y1="27" x2="27" y2="9" stroke="${colorStr}" stroke-width="3"/>`;
    }
    else if (classUpper.includes("DRONE") || classUpper.includes("UAV")) {
        shape = `<circle cx="18" cy="18" r="13" fill="none" stroke="${colorStr}" stroke-width="3"/>`;
    }
    else if (classUpper.includes("MAN")) {
        shape = `<rect x="12" y="6" width="12" height="24" rx="6" fill="none" stroke="${colorStr}" stroke-width="3"/>`;
    }
    else if (classUpper.includes("SURFACE")) {
        shape = `<polygon points="4,12 32,12 26,26 10,26" fill="none" stroke="${colorStr}" stroke-width="3"/>`;
    }
    else {
        // Default: UNDETERMINED / Lainnya = Bentuk Diamond
        shape = `<polygon points="18,4 32,18 18,32 4,18" fill="none" stroke="${colorStr}" stroke-width="3"/>`;
    }

    const svg = `
        <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
            ${shape}
            ${isEvasive ? getEvasiveBadge() : ""}
        </svg>`;

    const dataUri = "data:image/svg+xml," + encodeURIComponent(svg);
    symbolCache.set(cacheKey, dataUri);
    return dataUri;
}

export function formatAltitude(meters) {
    return Math.round(meters).toLocaleString('id-ID');
}