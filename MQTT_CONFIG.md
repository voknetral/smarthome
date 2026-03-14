# MQTT Configuration Guide

Dokumen ini menjelaskan lokasi konfigurasi MQTT di seluruh komponen sistem NusaHome.

## Ringkasan Konfigurasi Saat Ini

| Komponen      | Broker                      | Port  | File Konfigurasi                |
|---------------|-----------------------------|----|----------------------------------|
| Backend       | `mqtt.pantau-rumah.my.id`   | 443  | `app/.env`                       |
| Pico W        | `192.168.1.26`              | 1883 | `pico/config.py`                 |
| Dashboard     | `192.168.1.26`              | 1883 | `dashboard/src/config.js`        |

> ⚠️ **Catatan:** Konfigurasi di atas tidak konsisten. Pastikan semua komponen mengarah ke broker yang sama agar sistem dapat berkomunikasi dengan benar.

---

## Lokasi File Konfigurasi

### 1. Backend (API & MQTT Listener)

**File Utama:**
- [`app/.env`](app/.env) - Konfigurasi via environment variables (prioritas tertinggi)
- [`app/core/config.py`](app/core/config.py) - Nilai default jika `.env` tidak diatur

**Variabel:**
```env
MQTT_BROKER=mqtt.pantau-rumah.my.id
MQTT_PORT=443
```

**Service Terkait:**
- `mqtt_service.py` - Mendengarkan data dari sensor
- `mqtt_manager.py` - Mengirim perintah ke Pico/Relay

**Catatan:** Kedua service ini juga mengecek tabel `app_settings` di database (key: `mqtt_config`). Jika ada nilai di database, maka akan digunakan sebagai override.

---

### 2. Pico W (Firmware / MCU)

**File Utama:**
- [`pico/config.py`](pico/config.py)

**Variabel:**
```python
MQTT_BROKER = "192.168.1.26"
MQTT_PORT = 1883
```

**Catatan:** Setelah mengubah file ini, Anda harus mengupload ulang ke Pico W.

---

### 3. Dashboard (Frontend)

**File Utama:**
- [`dashboard/src/config.js`](dashboard/src/config.js)

**Variabel:**
```javascript
host: "192.168.1.26",
port: 1883,
useSSL: false,
```

**Override:**
- Environment variables (`.env` di folder `dashboard/`)
- LocalStorage browser (diatur melalui UI Settings di Dashboard)

---

## Cara Menyinkronkan Semua Komponen

Untuk memastikan semua komponen terhubung ke broker yang sama:

1. **Tentukan broker target** (contoh: `mqtt.pantau-rumah.my.id`)
2. **Update semua file:**
   - `app/.env` → `MQTT_BROKER` dan `MQTT_PORT`
   - `pico/config.py` → `MQTT_BROKER` dan `MQTT_PORT`
   - `dashboard/src/config.js` → `host` dan `port`
3. **Restart/reload:**
   - Restart backend service
   - Upload ulang `config.py` ke Pico
   - Refresh browser atau hapus localStorage

---

## Port Umum MQTT

| Protokol      | Port | Keterangan                    |
|---------------|------|-------------------------------|
| TCP           | 1883 | Standar, tanpa enkripsi        |
| TLS/SSL       | 8883 | Enkripsi SSL                   |
| WebSocket     | 9001 | Untuk browser                  |
| WSS           | 443 atau 8884 | WebSocket + SSL (Browser produksi) |

**Penting:** Dashboard (browser) hanya bisa menggunakan protokol **WebSocket** atau **WSS**, bukan TCP langsung.
