export function spawnHistoryLine(ctx) {
    const { id, airPosition, color, cesiumViewer, historyEntities } = ctx;

    const histEntity = cesiumViewer.entities.add({
        id: `hist_${id}`,
        polyline: {
            positions: new Cesium.CallbackProperty(() => {
                return historyEntities[id].customPositions || [];
            }, false),
            width: 2,
            material: color.withAlpha(0.9), 
            arcType: Cesium.ArcType.NONE
        }
    });
    
    histEntity.customPositions = [airPosition];
    historyEntities[id] = histEntity;
}

export function updateHistoryLine(ctx) {
    const { id, airPosition, color, historyEntities, MAX_HISTORY_POINTS } = ctx;
    const entity = historyEntities[id];
    if (!entity) return;

    const trail = entity.customPositions; 
    const lastPos = trail[trail.length - 1];
    
    if (!lastPos || !Cesium.Cartesian3.equals(lastPos, airPosition)) {
        trail.push(airPosition);
        if (trail.length > MAX_HISTORY_POINTS) {
            trail.shift(); 
        }
    }

    const alphaColor = color.withAlpha(0.4);
    if (!entity._lastTrailColor || !Cesium.Color.equals(entity._lastTrailColor, alphaColor)) {
        entity.polyline.material = alphaColor;
        entity._lastTrailColor = alphaColor;
    }
}