// js/DataLink.js
import { drawBearingLine } from '../entities/rdfLine.js';
import { cesiumViewer, SITE_LAT, SITE_LON} from '../core/Map.js';

const serverIP = window.location.hostname; 
const TRACKER_WS_URL = `ws://${serverIP}:9001`;

// 1. KONEKSI TRACKER (C++)
export function connectTracker(onTrackReceived) {
  const trackerSocket = new WebSocket(TRACKER_WS_URL);
  trackerSocket.onopen = () => console.log("[C2 Data Link] Terhubung ke Radar Console (Port 9001)");
  trackerSocket.onmessage = (event) => {
    try {
      const trackData = JSON.parse(event.data);
      console.log("[C2 TARGET RECEIVED]:", trackData);
      if (onTrackReceived) {
        onTrackReceived(trackData);
      }
    } catch (err) {``
      console.error("[C2] JSON Parsing Error:", err);
    }
  };
  trackerSocket.onclose = () => {
    setTimeout(() => connectTracker(onTrackReceived), 2000);
  };
}

// 2. RDF (Radio Direction Finder) Connection
const PYTHON_BRIDGE_WS_URL = `ws://${window.location.hostname}:8080/ws/optronic`;
export function connectOptronicReceiver() {
    const optronicSocket = new WebSocket(PYTHON_BRIDGE_WS_URL);
    optronicSocket.onopen = () => {
        console.log("[DataLink] Connected to Python Optronic Bridge");
    };
    optronicSocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);      
            if (data.bearing !== undefined) {
                console.log(`[DataLink] C-UAV Target Received! Bearing: ${data.bearing}`);
                drawBearingLine(cesiumViewer, SITE_LON, SITE_LAT, data.bearing);
            }
        } catch (err) {
            console.error("[DataLink] Parsing error from Python Bridge:", err);
        }
    };
    optronicSocket.onclose = () => {
        setTimeout(connectOptronicReceiver, 2000);
    };
}