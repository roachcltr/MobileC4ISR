export let cesiumViewer = null;
export let SITE_LAT = -6.950689; 
export let SITE_LON = 107.619899;

export async function initMap() {
  // Your active Cesium Ion token
  Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiJiY2QxNTRiYy02ZTg4LTQwYWEtODI1NS1hODRlMGQxODRlNDkiLCJpZCI6NDU0NTMzLCJpc3MiOiJodHRwczovL2FwaS5jZXNpdW0uY29tIiwiYXVkIjoidW5kZWZpbmVkX2RlZmF1bHQiLCJpYXQiOjE3ODM2MTEwNjJ9.4VdzkENU6qgC6-_m8O5vVzGLmhOX0xfqd9a7sapaaQ8';

  // 1. Await the ArcGIS Map Server connection
  const arcgisProvider = await Cesium.ArcGisMapServerImageryProvider.fromUrl(
    "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer", {
      enablePickFeatures: false
    }
  );

  // 2. Initialize Viewer with Terrain and the ready ArcGIS map
  cesiumViewer = new Cesium.Viewer("cesium-container", {
    animation: false,
    timeline: false,
    geocoder: false,
    homeButton: false,
    sceneModePicker: false,
    navigationHelpButton: false,
    baseLayerPicker: false,
    infoBox: false,
    selectionIndicator: false,
    fullscreenButton: false,
    
    // Global high-res 3D terrain
    terrainProvider: await Cesium.createWorldTerrainAsync(),
    
    // Inject the fully loaded async provider here
    baseLayer: new Cesium.ImageryLayer(arcgisProvider)
  });

  // 3. Placeholder for customizing the base layer (brightness, saturation, etc.)
  const baseLayer = cesiumViewer.scene.imageryLayers.get(0);
  baseLayer.brightness = 0.7; 
  baseLayer.saturation = 0.5; 
  cesiumViewer.scene.globe.enableLighting = false; 
  cesiumViewer.cesiumWidget.creditContainer.style.display = "none";

  // 4. Fly camera to the radar site
  cesiumViewer.camera.flyTo({
    destination: Cesium.Cartesian3.fromDegrees(SITE_LON, SITE_LAT, 150000.0),
    orientation: {
      heading: Cesium.Math.toRadians(0.0),
      pitch: Cesium.Math.toRadians(-90.0),
      roll: 0.0
    },
    duration: 0
  });

  // 5. Draw the Site Marker (Clamped to 3D Terrain)
  cesiumViewer.entities.add({
    position: Cesium.Cartesian3.fromDegrees(SITE_LON, SITE_LAT), 
    point: {
      pixelSize: 10,
      color: Cesium.Color.fromCssColorString('#FF474C'),
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 2,
      heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY 
    },
    label: {
      text: "PT Len Industri",
      font: "18px Segoe UI",
      pixelOffset: new Cesium.Cartesian2(0, -20), // Pushed it down slightly so it doesn't overlap the dot
      style: Cesium.LabelStyle.FILL_AND_OUTLINE,
      fillColor: Cesium.Color.WHITE,
      outlineColor: Cesium.Color.BLACK,
      outlineWidth: 4,
      
      // --- THE FIX ---
      heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
      disableDepthTestDistance: Number.POSITIVE_INFINITY 
    }
  });
}

export function relocateRadarSite(newLat, newLon) {
    SITE_LAT = newLat;
    SITE_LON = newLon;

    if (cesiumViewer) {
        console.log(`[MAP] Relocating radar site to ${newLat}, ${newLon}`);
        
        // Fly the camera to the new location smoothly
        cesiumViewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(newLon, newLat, 3000), // 3000m altitude
            orientation: {
                heading: 0.0,
                pitch: Cesium.Math.toRadians(-90.0), // Look straight down
                roll: 0.0
            },
            duration: 1.5
        });

        // Optional: If you have an entity representing the radar truck itself, 
        // update its position here. (Assuming its ID is 'radar-site-marker')
        const siteMarker = cesiumViewer.entities.getById('radar-site-marker');
        if (siteMarker) {
            siteMarker.position = Cesium.Cartesian3.fromDegrees(newLon, newLat);
        }
    }
}