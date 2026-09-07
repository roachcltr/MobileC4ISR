const dgram = require('dgram');
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const { WebSocketServer } = require('ws');

const HTTP_PORT = 8001;
const WS_PORT = 8004;
const UDP_LISTEN_PORT = 8010;
const C2_SERVER_PORT = 9001 

const TARGET_CLASSES = {
    1: "UNDETERMINED", 2: "DRONE", 3: "AIRPLANE", 4: "HELICOPTER",
    5: "MAN", 6: "VEHICLE", 7: "ROTARY_DRONE"
};

const RADAR_LAT = -6.94839;
const RADAR_LON = 107.61602;
const EARTH_RADIUS_M = 6378137.0;

function getLatLon(rangeMeters, azimuthDeg) {
    const lat1 = RADAR_LAT * Math.PI / 180;
    const lon1 = RADAR_LON * Math.PI / 180;
    const brng = azimuthDeg * Math.PI / 180;

    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(rangeMeters / EARTH_RADIUS_M) +
                 Math.cos(lat1) * Math.sin(rangeMeters / EARTH_RADIUS_M) * Math.cos(brng));
    const lon2 = lon1 + Math.atan2(Math.sin(brng) * Math.sin(rangeMeters / EARTH_RADIUS_M) * Math.cos(lat1),
                         Math.cos(rangeMeters / EARTH_RADIUS_M) - Math.sin(lat1) * Math.sin(lat2));

    return { lat: lat2 * 180 / Math.PI, lon: lon2 * 180 / Math.PI };
}

// 1. HTTP SERVER
const server = http.createServer((req, res) => {
    // Naik satu tingkat dari folder js/ ke folder frontend/ untuk mencari index.html
    let filePath = path.join(__dirname, 'frontend', req.url === '/' ? 'index.html' : req.url);
    const extname = path.extname(filePath);
    let contentType = 'text/html';
    switch (extname) {
        case '.js': contentType = 'text/javascript'; break;
        case '.css': contentType = 'text/css'; break;
        case '.json': contentType = 'application/json'; break;
        case '.png': contentType = 'image/png'; break;
    }
    fs.readFile(filePath, (error, content) => {
        if (error) { res.writeHead(404); res.end('File not found'); } 
        else { res.writeHead(200, { 'Content-Type': contentType }); res.end(content, 'utf-8'); }
    });
});
server.listen(HTTP_PORT, () => {
    console.log(`[*] Web Server aktif! Buka http://localhost:${HTTP_PORT} di browser.`);
});

// 2. UDP LISTENER (FROM ASTERIX SIMULATOR TO THIS backend.js)
const sockIn = dgram.createSocket('udp4');
sockIn.on('message', (msg) => {
    if (msg.readUInt8(0) !== 10) return;

    const length = msg.readUInt16BE(1);
    let idx = 3;
    const targets = [];

    while (idx < length) {
        if (idx + 103 > msg.length) break;
        const recordRaw = msg.slice(idx, idx + 103);
        
        // Lewati 4 byte pertama (FSPEC ada di offset 0-3)
        const sac = recordRaw.readUInt8(4);
        const sic = recordRaw.readUInt8(5);
        const msgType = recordRaw.readUInt8(6);
        const trd = recordRaw.readUInt8(7); 
        const isSimulated = (trd & 0b00010000) !== 0; 
        
        const todRaw = (recordRaw.readUInt8(8) << 16) | (recordRaw.readUInt8(9) << 8) | recordRaw.readUInt8(10);
        const tod_s = todRaw / 128.0;

        const rhoRaw = recordRaw.readUInt16BE(11);
        const thetaRaw = recordRaw.readUInt16BE(13);
        const speedRaw = recordRaw.readUInt16BE(15);
        const headingRaw = recordRaw.readUInt16BE(17);
        
        const vxRaw = recordRaw.readInt16BE(19);
        const vyRaw = recordRaw.readInt16BE(21);
        
        const trackNum = recordRaw.readUInt16BE(23);
        const trackStatus = recordRaw.readUInt8(25);
        const heightRaw = recordRaw.readInt16BE(26);
        
        const sigRangeRaw = recordRaw.readUInt16BE(28);
        const sigAzRaw = recordRaw.readUInt16BE(30);
        const ampRaw = recordRaw.readInt8(32); 
        const axRaw = recordRaw.readInt8(33);
        const ayRaw = recordRaw.readInt8(34);

        const classRaw = recordRaw.readUInt8(36);
        const rcsRaw = recordRaw.readInt8(37);
        const varX = recordRaw.readFloatBE(38);
        const varY = recordRaw.readFloatBE(42);
        const varZ = recordRaw.readFloatBE(46);
        const varVx = recordRaw.readFloatBE(50);
        const varVy = recordRaw.readFloatBE(54);
        const varVz = recordRaw.readFloatBE(58);
        const vx_sp = recordRaw.readFloatBE(62);
        const vy_sp = recordRaw.readFloatBE(66);
        const vz_sp = recordRaw.readFloatBE(70);
        const assocX = recordRaw.readFloatBE(74);
        const assocY = recordRaw.readFloatBE(78);
        const assocZ = recordRaw.readFloatBE(82);
        const lastPltSec = recordRaw.readUInt32BE(86);
        const lastPltUsec = recordRaw.readUInt32BE(90);
        const confKin = recordRaw.readUInt8(94);
        const confUdop = recordRaw.readUInt8(95);
        const cntKin = recordRaw.readUInt8(96);
        const cntUdop = recordRaw.readUInt8(97);

        const rangeMeters = parseFloat((rhoRaw * 2.0).toFixed(2));
        const azimuthDeg = parseFloat((thetaRaw * (360.0 / 65536.0)).toFixed(2));
        const coords = getLatLon(rangeMeters, azimuthDeg);

        targets.push({
            track_id: `TRK-${trackNum}`,
            meta: {
                sac: sac, sic: sic, msg_type: msgType, is_simulated: isSimulated,
                time_of_day_s: parseFloat(tod_s.toFixed(3)), track_status_raw: trackStatus
            },
            kinematics: {
                range_m: rangeMeters, azimuth_deg: azimuthDeg,
                lat: parseFloat(coords.lat.toFixed(6)), lon: parseFloat(coords.lon.toFixed(6)),
                speed_ms: parseFloat((speedRaw * 0.1).toFixed(1)),
                heading_deg: parseFloat((headingRaw * (360.0 / 65536.0)).toFixed(2)),
                vx_ms: vxRaw * 0.25, vy_ms: vyRaw * 0.25,
                height_m: heightRaw, accel_x_ms2: axRaw * 0.25, accel_y_ms2: ayRaw * 0.25
            },
            quality: {
                sigma_range_m: sigRangeRaw * 1.0,
                sigma_azimuth_deg: parseFloat((sigAzRaw * (360.0 / 65536.0)).toFixed(2)),
                amplitude_db: ampRaw
            },
            special_purpose: {
                classification: TARGET_CLASSES[classRaw] || "UNKNOWN", rcs_db: rcsRaw,
                confidence_kin: confKin, confidence_udop: confUdop,
                counter_kin: cntKin, counter_udop: cntUdop,
                variance_xyz: [parseFloat(varX.toFixed(3)), parseFloat(varY.toFixed(3)), parseFloat(varZ.toFixed(3))],
                variance_vxyz: [parseFloat(varVx.toFixed(3)), parseFloat(varVy.toFixed(3)), parseFloat(varVz.toFixed(3))],
                velocities_sp: [parseFloat(vx_sp.toFixed(2)), parseFloat(vy_sp.toFixed(2)), parseFloat(vz_sp.toFixed(2))],
                assoc_plot_xyz: [parseFloat(assocX.toFixed(1)), parseFloat(assocY.toFixed(1)), parseFloat(assocZ.toFixed(1))],
                last_plot_validity: { sec: lastPltSec, usec: lastPltUsec }
            }
        });
        
        idx += 103;
    }

    if (targets.length > 0) {
        latestTargets = targets; 
        const jsonData = JSON.stringify(targets);
        
        // 1. BROADCAST TO RADAR CONSOLE UI (All Targets)
        wss.clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN) client.send(jsonData);
        });

        // 2. CONTINUOUS FORWARD TO C2 (Only Whitelisted Targets)
        if (activeC2Client && activeC2Client.readyState === WebSocket.OPEN && activeC2TrackIds.length > 0) {
            const targetsToForward = targets.filter(t => activeC2TrackIds.includes(t.track_id));
            targetsToForward.forEach(target => {
                const c2Payload = {
                    ...target,
                    source: "TMMR_RADAR"
                };
                activeC2Client.send(JSON.stringify(c2Payload));
            });
        }
    }
});
sockIn.bind(UDP_LISTEN_PORT, () => {
    console.log(`[*] Mendengarkan UDP dari Python di port ${UDP_LISTEN_PORT}`);
});

// 3. CONNECTION TO C2 AND THE DYNAMIC RADAR COORDINATE LISTENER
const c2Server = new WebSocketServer({ port: 9001 });
let activeC2Client = null;
console.log(`[*] C2 Link Server siap mendengarkan di port 9001`);
c2Server.on('connection', (ws) => {
    console.log(`[+] C2 Frontend berhasil terhubung!`);
    activeC2Client = ws;

    // Listen for the Location Updates coming FROM the C2 (Point 2 of your task list)
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            if (data.type === "UPDATE_RADAR_LOCATION" && data.lat !== undefined && data.lon !== undefined) {
                RADAR_LAT = parseFloat(data.lat);
                RADAR_LON = parseFloat(data.lon);
                console.log(`\n[C2-LINK] Lokasi Radar Diperbarui: Lat ${RADAR_LAT}, Lon ${RADAR_LON}`);
            }
        } catch (err) {
            console.error("[C2-LINK] Gagal membaca pesan dari C2:", err);
        }
    });

    ws.on('close', () => {
        console.log(`[-] C2 Frontend terputus.`);
        activeC2Client = null;
    });
});

// 4. WEBSOCKET FOR SEND TO C2 dataLink.js
let latestTargets = [];
let activeC2TrackIds = [];

const wss = new WebSocketServer({ port: WS_PORT });
console.log(`[*] WebSocket Server siap memancarkan data di port ${WS_PORT}`);

wss.on('connection', (ws) => {
    ws.on('message', (message) => {
        try {
            const cmd = JSON.parse(message);

            if (cmd.type === "FORWARD_TO_C2") {
                activeC2TrackIds = cmd.selected_ids || [];
                console.log(`\n[C2-LINK] Subscription Updated: Forwarding ${activeC2TrackIds.length} tracks to C2 continuously.`);
            }
        } catch (err) { 
            console.error("Gagal memproses perintah:", err); 
        }
    });
});