// js/entities/trackLifecycle.js
import { cesiumViewer } from '../core/Map.js';
import { isLiteModeActive } from '../core/settings.js';

const TRACK_TIMEOUT = 5000;
let cleanupStarted = false;

export function startCleanupTimer(trackEntities, predictionEntities, historyEntities, arrowEntities) {
    if (cleanupStarted) return;
    cleanupStarted = true;

    const interval = isLiteModeActive() ? 2000 : 500;
    setInterval(() => cleanupStaleTracks(trackEntities, predictionEntities, historyEntities, arrowEntities), interval);
}

function cleanupStaleTracks(trackEntities, predictionEntities, historyEntities, arrowEntities) {
    if (!cesiumViewer) return;
    const now = Date.now();
    for (const id in trackEntities) {
        if (now - trackEntities[id].lastSeen > TRACK_TIMEOUT) {
            cesiumViewer.entities.remove(trackEntities[id]);
            delete trackEntities[id];

            if (predictionEntities[id]) {
                cesiumViewer.entities.remove(predictionEntities[id]);
                delete predictionEntities[id];
            }
            if (historyEntities[id]) {
                cesiumViewer.entities.remove(historyEntities[id]);
                delete historyEntities[id];
            }
            if (arrowEntities[id]) {
                cesiumViewer.entities.remove(arrowEntities[id]);
                delete arrowEntities[id];
            }
        }
    }
}