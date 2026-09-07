// js/data/TrackHandler.js
import { updateCesiumMarkers } from '../entities/trackMain.js';
import { updateLeafletMarkers } from '../entities/trackMainLite.js';
import { updateRadarMarkers } from '../core/MapRadar.js';
import { isLiteModeActive, isRadarModeActive } from '../core/settings.js';
import { updateTracksTableUI } from '../ui/panels/tabTargets.js';
import { updateAllRawJsonDisplay } from '../ui/panels/tabSystemNetworking.js'; 

const activeTracks = {};
const TRACK_TIMEOUT = 2000;
export const manualClassifications = {};

export function assignTrackClassification(trackId, newClassification) {
    manualClassifications[trackId] = newClassification;
}

export function handleIncomingTrack(trackData) {
    if (!trackData.special_purpose) trackData.special_purpose = {};

    // DEFAULT: Jika target baru masuk, IFF-nya adalah UNDETERMINED (Putih)
    if (!trackData.special_purpose.iff_status) {
        trackData.special_purpose.iff_status = 'UNDETERMINED'; 
    }

    // CEGATAN IFF MANUAL: Kita ubah "iff_status"-nya, BUKAN classification-nya!
    if (manualClassifications[trackData.track_id]) {
        trackData.special_purpose.iff_status = manualClassifications[trackData.track_id];
        trackData.is_manual_override = true;
    }

    activeTracks[trackData.track_id] = {...trackData, lastSeen: Date.now()};

    const now = Date.now();
    for (const id in activeTracks) {
        if (now - activeTracks[id].lastSeen > TRACK_TIMEOUT) {
            delete activeTracks[id];
            delete manualClassifications[id];
        }
    }

    updateAllRawJsonDisplay(activeTracks);

    if (isRadarModeActive()) updateRadarMarkers(activeTracks);
    else if (isLiteModeActive()) updateLeafletMarkers(activeTracks);
    else updateCesiumMarkers(activeTracks);

    const tracksList = Object.values(activeTracks).map(track => {
        return {
            id: track.track_id, 
            type: track.special_purpose?.classification || 'UNDETERMINED', 
            isEvasive: track.special_purpose?.classification?.includes('EVASIVE') || false, 
            rawJson: track 
        };
    });

    updateTracksTableUI(tracksList);
}