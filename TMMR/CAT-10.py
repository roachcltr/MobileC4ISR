#!/usr/bin/env python3
"""
cat010_dummy_sender.py
=======================
Generator dummy target ASTERIX Cat.010 (TMMR_TrackMessage) untuk testing
web console radar Leonardo TMMR, mengacu ke:
  CA09170SPE002_IRS_TMMR_rev_B.pdf - Table 18/19/20/21/22
 
Transport: UDP
  Sesuai Table 18 IRS (IF-002 Network Parameters): TMMR_TrackMessage
  dikirim sebagai datagram UDP (satu pesan ASTERIX = satu UDP datagram).
  Dokumen aslinya pakai multicast 239.0.0.1:50003, tapi untuk testing ini
  dikirim unicast ke --host/--port yang Anda tentukan (default sesuai
  request awal: 172.16.10.167:8001).
 
Fitur:
  - 5 (default) target dummy dikirim TERUS-MENERUS tiap 2 detik (sesuai
    "Synchronism: Track update rate is 2sec" di IRS), masing-masing punya
    STATE kinematik sendiri (posisi, heading, kecepatan, ketinggian) yang
    diupdate tiap tick -> track-nya benar-benar "bergerak" di console,
    bukan posisi acak baru tiap pesan.
  - Dua profil gerak: JET (cepat, ~180-260 m/s, altitude tinggi, belokan
    halus) dan DRONE (lambat, ~8-30 m/s, altitude rendah, lebih lincah).
  - Posisi polar (azimuth) target DIBATASI KETAT pada sektor 315-45 deg
    True North (90 deg total). Kalau target "mau" keluar sektor (atau
    keluar batas jarak), targetnya dipantulkan balik ke dalam sektor -
    mensimulasikan keterbatasan FoV hardware radar asli sambil tetap
    kelihatan terbang/melaju secara realistis di dalam area yang terlihat.
 
PENTING SOAL SUMBER DATA FIELD (baca sebelum dipakai ke sistem nyata):
  Field-field berikut PERSIS sesuai IRS (Table 19/20/21/22), termasuk
  urutan FRN dan FSPEC:
    - Struktur pesan CAT/LEN, FSPEC per track, urutan FRN 1-28
    - I010/170 Track Status (bit-level, Table 21)
    - SP - Special Purpose Field (bit-level, Table 22, custom Leonardo)
  FSPEC yang dipakai = F5 F1 11 B4 (varian TANPA I010/041 WGS-84, karena
  yang dibutuhkan cuma posisi polar I010/040).
 
  Field berikut TIDAK dirinci bit-level di IRS ini (dokumen mengasumsikan
  pembaca mengacu ke standar publik EUROCONTROL ASTERIX Cat.010), jadi
  encoding di bawah pakai konvensi standar Cat.010 / asumsi masuk akal
  (satuan meter mengikuti konvensi dokumen ini yang serba metric):
    I010/010 SAC/SIC              -> default SAC=0, SIC=1 (ikut pola default
                                      I253/010 di dokumen yang sama)
    I010/000 Message Type         -> 1 = Target Report (konvensi standar)
    I010/020 Target Report Descr. -> 1 oktet, TYP=PSR, SIM=1 (ditandai SIMULATED!)
    I010/140 Time of Day          -> LSB 1/128s dari midnight UTC (konvensi
                                      yang sama dipakai I253/070 di dokumen ini)
    I010/040 Measured Pos. Polar  -> RHO uint16 LSB=2m, THETA uint16
                                      LSB=360/65536 deg (LSB theta = standar
                                      ASTERIX baku di semua kategori)
    I010/200 Track Vel. Polar     -> Speed uint16 LSB=0.1 m/s, Heading uint16
                                      LSB=360/65536 deg
    I010/202 Track Vel. Cartesian -> Vx,Vy int16 LSB=0.25 m/s (standar Cat.010)
    I010/161 Track Number         -> uint16 polos, tetap sama tiap tick per target
    I010/091 Measured Height      -> int16 LSB=1 m
    I010/500 Std Dev of Position  -> 2x uint16: SigmaRange(LSB=1m),
                                      SigmaAzimuth(LSB=360/65536 deg)
    I010/131 Amplitude Primary    -> int8, dB (SNR, sesuai footnote IRS)
    I010/210 Calculated Accel.    -> Ax,Ay int8 LSB=0.25 m/s^2 (standar Cat.010)
 
  SP Special Purpose Field (Table 22): urutan sub-field & ukuran diikuti
  persis, KECUALI 'Reserved' yang di dokumen tertulis 9 oktet -- angka itu
  tidak konsisten dengan LEN=68 yang dideklarasikan tetap. Reserved dipakai
  5 oktet di sini supaya total SP field == 68 oktet (match dgn LEN=68).
 
  --> Kalau setelah dites di web console field tertentu tidak terbaca
      benar, kemungkinan besar LSB/scale di atas yang perlu disesuaikan
      dengan parser console Anda. Semua konstanta LSB ada di
      "KONSTANTA ENCODING" di bawah biar gampang diubah.
"""
 
import argparse
import math
import random
import socket
import struct
import time
 
# ============================== KONSTANTA ENCODING ==============================
SAC_DEFAULT = 0
SIC_DEFAULT = 1
 
RHO_LSB_M = 2.0                  # I010/040 RHO -> asumsi meter (bukan NM)
THETA_LSB_DEG = 360.0 / 65536.0  # I010/040 & /200 THETA/Heading -> standar ASTERIX
 
SPEED_LSB_MS = 0.1               # I010/200 speed
VXY_LSB_MS = 0.25                # I010/202 Vx/Vy -> standar Cat.010
 
HEIGHT_LSB_M = 1.0               # I010/091
 
SIGMA_RANGE_LSB_M = 1.0          # I010/500
SIGMA_AZ_LSB_DEG = THETA_LSB_DEG # I010/500
 
ACC_LSB_MS2 = 0.25               # I010/210 -> standar Cat.010
 
FSPEC_BYTES = bytes.fromhex("F5F111B4")  # tanpa I010/041 (lihat docstring)
 
TARGET_CLASS = {
    "UNDETERMINED": 1,
    "DRONE": 2,
    "AIRPLANE": 3,
    "HELICOPTER": 4,
    "MAN": 5,
    "VEHICLE": 6,
    "ROTARY_DRONE": 7,
}
 
# ============================== HELPER ENCODING ==============================
 
def u8(v):  return struct.pack(">B", v & 0xFF)
def i8(v):  return struct.pack(">b", max(-128, min(127, int(round(v)))))
def u16(v): return struct.pack(">H", v & 0xFFFF)
def i16(v): return struct.pack(">h", max(-32768, min(32767, int(round(v)))))
def u32(v): return struct.pack(">I", v & 0xFFFFFFFF)
def f32(v): return struct.pack(">f", float(v))
 
 
def encode_time_of_day():
    """I010/140 - 3 octets, LSB = 1/128s, seconds since midnight UTC."""
    now = time.time()
    dt = time.gmtime(now)
    frac = now % 1.0
    seconds_since_midnight = dt.tm_hour * 3600 + dt.tm_min * 60 + dt.tm_sec + frac
    ticks = int(round(seconds_since_midnight * 128)) & 0xFFFFFF
    return ticks.to_bytes(3, "big")
 
 
def encode_theta(deg):
    deg = deg % 360.0
    return u16(int(round(deg / THETA_LSB_DEG)) & 0xFFFF)
 
 
def random_azimuth_in_sector(lo_deg, hi_deg):
    """Random azimuth di sektor [lo,hi], mendukung wraparound lewat 0/360."""
    if lo_deg <= hi_deg:
        return random.uniform(lo_deg, hi_deg)
    span_a = 360.0 - lo_deg
    span_b = hi_deg
    total = span_a + span_b
    r = random.uniform(0, total)
    return lo_deg + r if r < span_a else r - span_a
 
 
# ============================== FIELD BUILDERS (per data item) ==============================
 
def build_i010_010(sac=SAC_DEFAULT, sic=SIC_DEFAULT):
    return u8(sac) + u8(sic)
 
 
def build_i010_000(msg_type=1):
    return u8(msg_type)
 
 
def build_i010_020(simulated=True):
    """1 oktet: TYP=001 (single PSR), SIM=1 kalau dummy/simulated, FX=0."""
    typ, sim, rab = 0b001, (1 if simulated else 0), 0
    return u8((typ << 5) | (sim << 4) | (rab << 3))
 
 
def build_i010_140():
    return encode_time_of_day()
 
 
def build_i010_040(rho_m, theta_deg):
    rho = max(0, min(65535, int(round(rho_m / RHO_LSB_M))))
    return u16(rho) + encode_theta(theta_deg)
 
 
def build_i010_200(speed_ms, heading_deg):
    spd = max(0, min(65535, int(round(speed_ms / SPEED_LSB_MS))))
    return u16(spd) + encode_theta(heading_deg)
 
 
def build_i010_202(vx_ms, vy_ms):
    return i16(vx_ms / VXY_LSB_MS) + i16(vy_ms / VXY_LSB_MS)
 
 
def build_i010_161(track_number):
    return u16(track_number)
 
 
def build_i010_170(cnf=0, tre=0, cst=0, mah=0, tcc=0, sth=0):
    byte = (cnf << 7) | (tre << 6) | (cst << 4) | (mah << 3) | (tcc << 2) | (sth << 1)
    return u8(byte)
 
 
def build_i010_091(height_m):
    return i16(height_m / HEIGHT_LSB_M)
 
 
def build_i010_500(sigma_range_m, sigma_az_deg):
    sr = max(0, min(65535, int(round(sigma_range_m / SIGMA_RANGE_LSB_M))))
    sa = max(0, min(65535, int(round(sigma_az_deg / SIGMA_AZ_LSB_DEG))))
    return u16(sr) + u16(sa)
 
 
def build_i010_131(amplitude_db):
    return i8(amplitude_db)
 
 
def build_i010_210(ax_ms2, ay_ms2):
    return i8(ax_ms2 / ACC_LSB_MS2) + i8(ay_ms2 / ACC_LSB_MS2)
 
 
def build_sp(target_class, rcs_db, var_xyz, var_vxyz, vx, vy, vz,
             assoc_xyz, last_plt_sec, last_plt_usec,
             conf_kin, conf_udop, cnt_kin, cnt_udop):
    """Table 22 - total HARUS 68 oktet. Reserved dipakai 5 oktet (bukan 9
    seperti tertulis di dok) supaya total pas dgn LEN=68 yang dideklarasikan tetap.
    Return: (bytes, rows) - rows dipakai untuk cetak sub-tabel ala Table 22."""
    rows = []
 
    def add(item, desc, raw, decoded):
        rows.append({"item": item, "desc": desc, "bytes": raw, "decoded": decoded})
 
    body = bytearray()
 
    b = u8(68);                       body += b; add("LEN", "Panjang SP (fixed)", b, "68 oktet")
    b = u8(TARGET_CLASS[target_class]);body += b; add("Target Class", "Klasifikasi target", b, f"{target_class} ({TARGET_CLASS[target_class]})")
    b = i8(rcs_db);                   body += b; add("RCS", "Radar Cross Section", b, f"{rcs_db:.1f} dB/m2")
 
    for label, v in zip(("Track_Variance_X", "Track_Variance_Y", "Track_Variance_Z"), var_xyz):
        b = f32(v); body += b; add(label, "Varians posisi", b, f"{v:.3f} m2")
    for label, v in zip(("Track_Variance_Vx", "Track_Variance_Vy", "Track_Variance_Vz"), var_vxyz):
        b = f32(v); body += b; add(label, "Varians kecepatan", b, f"{v:.3f} m2")
 
    for label, v in zip(("Vx", "Vy", "Vz"), (vx, vy, vz)):
        b = f32(v); body += b; add(label, "Kecepatan kartesian", b, f"{v:.2f} m/s")
 
    for label, v in zip(("Associated Plot X", "Associated Plot Y", "Associated Plot Z"), assoc_xyz):
        b = f32(v); body += b; add(label, "Posisi plot (radar frame)", b, f"{v:.1f} m")
 
    b = u32(last_plt_sec);  body += b; add("Last_Plt_Time_Of_Val Sec", "Waktu validitas plot (s)", b, f"{last_plt_sec}")
    b = u32(last_plt_usec); body += b; add("Last_Plt_Time_Of_Val Usec", "Waktu validitas plot (us)", b, f"{last_plt_usec}")
 
    b = u8(conf_kin);  body += b; add("Class Conf Kinematics", "Confidence klasifikasi kinematik", b, f"{conf_kin}%")
    b = u8(conf_udop); body += b; add("Class Conf uDoppler", "Confidence klasifikasi uDoppler", b, f"{conf_udop}%")
    b = u8(cnt_kin);   body += b; add("Class Counter Kinematics", "Counter klasifikasi kinematik", b, f"{cnt_kin}")
    b = u8(cnt_udop);  body += b; add("Class Counter uDoppler", "Counter klasifikasi uDoppler", b, f"{cnt_udop}")
 
    b = bytes(5); body += b; add("Reserved", "Padding (5 oktet, koreksi dari 9)", b, "-")
 
    assert len(body) == 68, f"SP field length mismatch: {len(body)}"
    return bytes(body), rows
 
 
# ============================== TARGET KINEMATIC MODEL ==============================
 
class Target:
    """Satu target dummy dengan state kinematik yang berjalan tiap tick.
    Posisi disimpan di koordinat kartesian lokal (x=East, y=North, meter,
    radar di origin), dikonversi ke polar (rho,theta) saat encoding.
    Target 'memantul' di batas sektor azimuth & batas jarak, sehingga
    selalu berada dalam sektor yang diminta tapi tetap terlihat melaju."""
 
    def __init__(self, track_number, kind, az_lo, az_hi, rho_min=800, rho_max=7500):
        self.track_number = track_number
        self.kind = kind  # "JET" atau "DRONE"
        self.az_lo, self.az_hi = az_lo, az_hi
        self.rho_min, self.rho_max = rho_min, rho_max
 
        if kind == "JET":
            self.speed = random.uniform(180, 260)          # m/s (~350-500 knot)
            self.speed_bounds = (150, 270)
            self.height = random.uniform(3000, 8000)         # m
            self.height_bounds = (2500, 9000)
            self.max_turn_rate = 2.0                          # deg/s, belokan halus
            self.speed_jitter = 4.0
            self.target_class = "AIRPLANE"
            self.rcs_db = random.uniform(5, 20)
        else:  # DRONE
            self.speed = random.uniform(8, 25)               # m/s
            self.speed_bounds = (5, 30)
            self.height = random.uniform(50, 400)             # m
            self.height_bounds = (20, 600)
            self.max_turn_rate = 15.0                          # deg/s, lebih lincah
            self.speed_jitter = 1.5
            self.target_class = random.choice(["DRONE", "ROTARY_DRONE"])
            self.rcs_db = random.uniform(-15, 5)
 
        theta0 = random_azimuth_in_sector(az_lo, az_hi)
        rho0 = random.uniform(rho_min, rho_max)
        self.x = rho0 * math.sin(math.radians(theta0))
        self.y = rho0 * math.cos(math.radians(theta0))
        self.heading = random.uniform(0, 360)
        self.turn_rate = random.uniform(-self.max_turn_rate, self.max_turn_rate)
        self.vz = random.uniform(-1, 1)
 
    def _phi_bounds(self):
        if self.az_lo <= self.az_hi:
            return self.az_lo, self.az_hi
        return self.az_lo - 360.0, self.az_hi
 
    def _to_phi(self, theta):
        if self.az_lo <= self.az_hi:
            return theta
        return theta - 360.0 if theta > 180.0 else theta
 
    def _bounce_sector_and_range(self):
        rho = math.hypot(self.x, self.y)
        if rho == 0:
            return
        theta = math.degrees(math.atan2(self.x, self.y)) % 360.0
        phi_lo, phi_hi = self._phi_bounds()
        phi = self._to_phi(theta)
 
        vx = self.speed * math.sin(math.radians(self.heading))
        vy = self.speed * math.cos(math.radians(self.heading))
 
        if phi < phi_lo or phi > phi_hi:
            boundary_deg = self.az_lo if phi < phi_lo else self.az_hi
            rx, ry = math.sin(math.radians(boundary_deg)), math.cos(math.radians(boundary_deg))
            self.x, self.y = rho * rx, rho * ry
            dot = vx * rx + vy * ry
            vx, vy = 2 * dot * rx - vx, 2 * dot * ry - vy
            self.heading = math.degrees(math.atan2(vx, vy)) % 360.0
 
        rho = math.hypot(self.x, self.y)
        if rho > self.rho_max or rho < self.rho_min:
            bound = self.rho_max if rho > self.rho_max else self.rho_min
            ux, uy = self.x / rho, self.y / rho
            self.x, self.y = ux * bound, uy * bound
            vx = self.speed * math.sin(math.radians(self.heading))
            vy = self.speed * math.cos(math.radians(self.heading))
            v_rad = vx * ux + vy * uy
            vx, vy = vx - 2 * v_rad * ux, vy - 2 * v_rad * uy
            self.heading = math.degrees(math.atan2(vx, vy)) % 360.0
 
    def update(self, dt):
        """Majukan simulasi dt detik, kembalikan kinematik terkini untuk encoding."""
        self.turn_rate += random.uniform(-0.6, 0.6)
        self.turn_rate = max(-self.max_turn_rate, min(self.max_turn_rate, self.turn_rate))
        self.heading = (self.heading + self.turn_rate * dt) % 360.0
 
        self.speed += random.uniform(-self.speed_jitter, self.speed_jitter) * dt
        self.speed = max(self.speed_bounds[0], min(self.speed_bounds[1], self.speed))
 
        vx = self.speed * math.sin(math.radians(self.heading))
        vy = self.speed * math.cos(math.radians(self.heading))
        self.x += vx * dt
        self.y += vy * dt
 
        self.vz += random.uniform(-0.3, 0.3) * dt
        self.vz = max(-5.0, min(5.0, self.vz))
        self.height += self.vz * dt
        if self.height < self.height_bounds[0]:
            self.height = self.height_bounds[0]; self.vz = abs(self.vz)
        elif self.height > self.height_bounds[1]:
            self.height = self.height_bounds[1]; self.vz = -abs(self.vz)
 
        self._bounce_sector_and_range()
 
        rho = math.hypot(self.x, self.y)
        theta = math.degrees(math.atan2(self.x, self.y)) % 360.0
        vx = self.speed * math.sin(math.radians(self.heading))
        vy = self.speed * math.cos(math.radians(self.heading))
        return {
            "rho": rho, "theta": theta, "height": self.height,
            "speed": self.speed, "heading": self.heading,
            "vx": vx, "vy": vy, "vz": self.vz,
        }
 
 
# ============================== TRACK / MESSAGE BUILDER ==============================
 
def build_track_record(target: "Target", dt):
    """Bangun satu Local Track record + kumpulkan metadata tiap FRN (untuk
    dicetak sebagai tabel ala IRS: FRN | Data Item | Panjang | Hex | Nilai)."""
    st = target.update(dt)
    now = time.time()
 
    rows = []
 
    def add(frn, item_id, desc, raw, decoded):
        rows.append({"frn": frn, "item": item_id, "desc": desc,
                      "bytes": raw, "decoded": decoded})
 
    b = build_i010_010()
    add(1, "I010/010", "Data Source Identifier", b, f"SAC={SAC_DEFAULT} SIC={SIC_DEFAULT}")
 
    b = build_i010_000(1)
    add(2, "I010/000", "Message Type", b, "1 = Target Report")
 
    b = build_i010_020(simulated=True)
    add(3, "I010/020", "Target Report Descriptor", b, "TYP=PSR(1) SIM=1(simulated) RAB=0")
 
    b = build_i010_140()
    tod_s = int.from_bytes(b, "big") / 128.0
    add(4, "I010/140", "Time of Day", b, f"{tod_s:.3f} s sejak 00:00 UTC")
 
    b = build_i010_040(st["rho"], st["theta"])
    add(6, "I010/040", "Measured Position in Polar Co-ordinates", b,
        f"RHO={st['rho']:.1f} m  THETA={st['theta']:.2f} deg")
 
    b = build_i010_200(st["speed"], st["heading"])
    add(8, "I010/200", "Calculated Track Velocity in Polar Co-ordinates", b,
        f"Speed={st['speed']:.1f} m/s  Heading={st['heading']:.2f} deg")
 
    b = build_i010_202(st["vx"], st["vy"])
    add(9, "I010/202", "Calculated Track Velocity in Cartesian Coord.", b,
        f"Vx={st['vx']:.2f} m/s  Vy={st['vy']:.2f} m/s")
 
    b = build_i010_161(target.track_number)
    add(10, "I010/161", "Track Number", b, f"{target.track_number}")
 
    b = build_i010_170(cnf=0, sth=0)
    add(11, "I010/170", "Track Status", b, "CNF=0 TRE=0 CST=00 MAH=0 TCC=0 STH=0 FX=0")
 
    b = build_i010_091(st["height"])
    add(18, "I010/091", "Measured Height", b, f"{st['height']:.1f} m")
 
    sigma_range, sigma_az = 10.0, 0.5
    b = build_i010_500(sigma_range, sigma_az)
    add(22, "I010/500", "Standard Deviation of Position", b,
        f"SigmaRange={sigma_range:.1f} m  SigmaAz={sigma_az:.2f} deg")
 
    amp = random.uniform(5, 30)
    b = build_i010_131(amp)
    add(24, "I010/131", "Amplitude of Primary Plot", b, f"{amp:.1f} dB")
 
    b = build_i010_210(0.0, 0.0)
    add(25, "I010/210", "Calculated Acceleration", b, "Ax=0.00 Ay=0.00 m/s^2")
 
    sp_bytes, sp_rows = build_sp(
        target_class=target.target_class,
        rcs_db=target.rcs_db,
        var_xyz=(1.0, 1.0, 1.0),
        var_vxyz=(0.1, 0.1, 0.1),
        vx=st["vx"], vy=st["vy"], vz=st["vz"],
        assoc_xyz=(target.x, target.y, st["height"]),
        last_plt_sec=int(now),
        last_plt_usec=int((now % 1.0) * 1e6),
        conf_kin=random.randint(60, 95),
        conf_udop=random.randint(60, 95),
        cnt_kin=random.randint(1, 10),
        cnt_udop=random.randint(1, 10),
    )
    add(27, "SP", "Special Purpose Field", sp_bytes, "lihat sub-tabel SP di bawah")
 
    fields = b"".join(r["bytes"] for r in rows)
    record = FSPEC_BYTES + fields
    return record, st, rows, sp_rows
 
 
def build_message(targets, dt):
    records, per_target = [], []
    for t in targets:
        rec, st, rows, sp_rows = build_track_record(t, dt)
        records.append(rec)
        per_target.append({"target": t, "st": st, "rows": rows, "sp_rows": sp_rows})
 
    body = b"".join(records)
    total_len = 1 + 2 + len(body)
    msg = u8(10) + u16(total_len) + body
    assert len(msg) == total_len
    return msg, per_target
 
 
# ============================== CETAK TABEL ALA IRS ==============================
 
def _hex(b):
    return b.hex(" ").upper()
 
 
def _hex_short(b, max_bytes=8):
    """Hex ringkas untuk field panjang (mis. SP 68 oktet) supaya tabel tidak berantakan."""
    if len(b) <= max_bytes:
        return _hex(b)
    return _hex(b[:max_bytes]) + f" ... ({len(b)} oktet)"
 
 
def print_irs_table(seq_no, msg, per_target, host, port, sent=True):
    cat_b, len_b = msg[0:1], msg[1:3]
    print()
    print("=" * 100)
    print(f" PESAN #{seq_no}  |  {time.strftime('%Y-%m-%d %H:%M:%S')} UTC-local  |  "
          f"{len(msg)} oktet  |  {len(per_target)} track")
    print("=" * 100)
    print(f" CAT (Message Category) : {_hex(cat_b):<10} = {cat_b[0]}")
    print(f" LEN (Message Length)   : {_hex(len_b):<10} = {int.from_bytes(len_b,'big')} oktet (termasuk CAT+LEN)")
 
    for i, pt in enumerate(per_target, start=1):
        t, rows, sp_rows = pt["target"], pt["rows"], pt["sp_rows"]
        print("-" * 100)
        print(f" Track {i}/{len(per_target)}  -  {t.kind} track_number={t.track_number}")
        print(f" FSPEC : {_hex(FSPEC_BYTES)}")
        print(f" {'FRN':<4}{'Data Item':<10}{'Panjang':<9}{'Hex':<29} {'Nilai'}")
        print(f" {'-'*3:<4}{'-'*9:<10}{'-'*7:<9}{'-'*27:<29} {'-'*30}")
        for r in rows:
            print(f" {str(r['frn']):<4}{r['item']:<10}{str(len(r['bytes'])):<9}"
                  f"{_hex_short(r['bytes']).ljust(29)} {r['decoded']}")
 
        print(f"    sub-tabel SP (Table 22, {len(sp_rows)} sub-field, total "
              f"{sum(len(r['bytes']) for r in sp_rows)} oktet):")
        print(f"    {'Sub-field':<26}{'Panjang':<9}{'Hex':<24} {'Nilai'}")
        print(f"    {'-'*24:<26}{'-'*7:<9}{'-'*22:<24} {'-'*30}")
        for r in sp_rows:
            print(f"    {r['item']:<26}{str(len(r['bytes'])):<9}{_hex(r['bytes']).ljust(24)} {r['decoded']}")
 
    print("-" * 100)
    if sent:
        print(f" -> dikirim UDP ke {host}:{port}")
    else:
        print(" -> DRY-RUN, tidak dikirim")
 
 
def print_compact(seq_no, msg, per_target, host, port, sent=True):
    print(f"[{time.strftime('%H:%M:%S')}] Pesan #{seq_no}: {len(msg)} oktet, {len(per_target)} target")
    for pt in per_target:
        t, st = pt["target"], pt["st"]
        print(f"    {t.kind:5s} track {t.track_number}: az={st['theta']:6.2f} deg  "
              f"rng={st['rho']:7.1f} m  alt={st['height']:6.0f} m  "
              f"spd={st['speed']:5.1f} m/s  hdg={st['heading']:6.2f} deg")
    if sent:
        print(f"    -> dikirim UDP ke {host}:{port}")
 
 
# ============================== MAIN ==============================
 
def main():
    ap = argparse.ArgumentParser(description="Kirim dummy ASTERIX Cat.010 TMMR_TrackMessage via UDP, terus-menerus")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8010)
    ap.add_argument("--count", type=int, default=10, help="jumlah target dummy")
    ap.add_argument("--jets", type=int, default=4, help="berapa dari --count yang jadi JET (sisanya DRONE)")
    ap.add_argument("--az-min", type=float, default=315.0, help="batas azimuth bawah (deg)")
    ap.add_argument("--az-max", type=float, default=45.0, help="batas azimuth atas (deg)")
    ap.add_argument("--repeat", type=int, default=0, help="jumlah pesan dikirim (0 = terus-menerus/default)")
    ap.add_argument("--interval", type=float, default=2.0, help="jeda antar pesan (detik), sesuai IRS: 2s")
    ap.add_argument("--seed", type=int, default=None, help="random seed (buat hasil yang reproducible)")
    ap.add_argument("--dry-run", action="store_true", help="hanya cetak, tidak kirim UDP")
    ap.add_argument("--compact", action="store_true", help="cetak ringkasan 1 baris/target (bukan tabel IRS lengkap)")
    args = ap.parse_args()
 
    if args.seed is not None:
        random.seed(args.seed)
 
    n_jets = max(0, min(args.count, args.jets))
    kinds = ["JET"] * n_jets + ["DRONE"] * (args.count - n_jets)
    targets = [Target(1001 + i, kinds[i], args.az_min, args.az_max) for i in range(args.count)]
 
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    sent = 0
    try:
        while True:
            msg, per_target = build_message(targets, args.interval)
 
            if not args.dry_run:
                sock.sendto(msg, (args.host, args.port))
 
            printer = print_compact if args.compact else print_irs_table
            printer(sent + 1, msg, per_target, args.host, args.port, sent=not args.dry_run)
 
            sent += 1
            if args.repeat != 0 and sent >= args.repeat:
                break
            time.sleep(args.interval)
    except KeyboardInterrupt:
        print("\nDihentikan oleh user.")
    finally:
        sock.close()
 
 
if __name__ == "__main__":
    main()
