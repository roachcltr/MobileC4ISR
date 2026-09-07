// Calculate the destination coordinates given a start point, bearing, and distance
function calculateDestination(startLon, startLat, bearingDegrees, distanceMeters) {
    const R = 6371e3; // Earth's radius in meters
    const bearingRad = bearingDegrees * (Math.PI / 180);
    const lat1Rad = startLat * (Math.PI / 180);
    const lon1Rad = startLon * (Math.PI / 180);

    const lat2Rad = Math.asin(
        Math.sin(lat1Rad) * Math.cos(distanceMeters / R) +
        Math.cos(lat1Rad) * Math.sin(distanceMeters / R) * Math.cos(bearingRad)
    );
    
    const lon2Rad = lon1Rad + Math.atan2(
        Math.sin(bearingRad) * Math.sin(distanceMeters / R) * Math.cos(lat1Rad),
        Math.cos(distanceMeters / R) - Math.sin(lat1Rad) * Math.sin(lat2Rad)
    );

    return {
        lon: lon2Rad * (180 / Math.PI),
        lat: lat2Rad * (180 / Math.PI)
    };
}

export function drawBearingLine(viewer, originLon, originLat, bearing) {
    const entityId = 'rdf-bearing-line';
    
    // Set the line to stretch 50 kilometers (50,000 meters) outward
    const distanceMeters = 50000; 
    const endPoint = calculateDestination(originLon, originLat, bearing, distanceMeters);

    // If a bearing line already exists from a previous click, remove it before drawing the new one
    const existingLine = viewer.entities.getById(entityId);
    if (existingLine) {
        viewer.entities.remove(existingLine);
    }

    // Draw the new clamped green line
    viewer.entities.add({
        id: entityId,
        polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray([
                originLon, originLat,
                endPoint.lon, endPoint.lat
            ]),
            width: 4,
            material: Cesium.Color.LIMEGREEN,
            clampToGround: true,
            arcType: Cesium.ArcType.GEODESIC
        }
    });
}