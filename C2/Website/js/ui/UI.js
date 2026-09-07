// js/ui/UI.js
import { initMapPanels } from './panels/tabMap.js';
import { initResetView } from './buttons/resetView.js';
import { SidebarTabs } from './panels/tabIndex.js';
import { initHardwareTab } from './panels/tabHardware.js';
import { initFullscreenControl } from './buttons/fullscreenControl.js';
import { initBaseView } from './buttons/baseView.js';
import { initSetOriginButton } from './buttons/setOrigin.js';
import { initCompass } from './buttons/compass.js';
import { initTheme } from './buttons/theme.js';
import { initLiteModeToggle } from './buttons/liteMode.js';
import { initRadarModeToggle } from './buttons/radarMode.js';
import { isLiteModeActive, isRadarModeActive } from '../core/settings.js';
import { initRangeRings } from './overlays/rangeRings.js';
import { initAzimuthLines } from './overlays/azimuthLines.js';
import { initLatLonGrid } from './overlays/latLonGrid.js';
import { initMapAppearance } from './overlays/mapAppearance.js';
import { initTrackPopup } from '../entities/trackPopup.js';
import {
    registerOverlayControllers,
    syncMapOverlayColors,
    initOverlaySync
} from './overlays/overlaySync.js';

export function initUI() {
    initFullscreenControl();
    initTheme();
    initLiteModeToggle();
    initRadarModeToggle();
    initMapPanels();
    new SidebarTabs();
    initHardwareTab();
}

export function initMapDependentUI() {
    if (isLiteModeActive() || isRadarModeActive()) return;

    initBaseView();
    initResetView();
    initCompass();
    initSetOriginButton();
    initTrackPopup();

    const rings = initRangeRings(() => syncMapOverlayColors());
    const azimuth = initAzimuthLines(rings.ringDistances);
    const grid = initLatLonGrid();

    registerOverlayControllers({ rings, azimuth, grid });
    initOverlaySync();
    syncMapOverlayColors();

    initMapAppearance();
}
