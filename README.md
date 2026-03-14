# 🏠 NusaHome - Sistem IoT Nusa Home Terintegrasi

**NusaHome** adalah platform IoT full-stack profesional yang dirancang untuk pemantauan real-time dan otomasi rumah pintar yang cerdas. Dibangun khusus untuk Raspberry Pi Pico W, sistem ini menawarkan jembatan mulus antara hardware, API berperforma tinggi, dan dashboard modern yang elegan.

---

## 🏗️ Arsitektur Sistem

- **Hardware**: Raspberry Pi Pico W (MicroPython)
- **Backend**: FastAPI (Python 3.11+) + PostgreSQL
- **Real-time**: Protokol MQTT (Broker HiveMQ)
- **Web/Mobile**: React 19 + Vite + Capacitor 8

---

## 📡 Fitur Hardware (Pico W)

- **Sensor Terintegrasi**: 
  - 🌡️ **DHT22**: Suhu & Kelembaban udara
  - 💨 **MQ-2**: Deteksi asap, gas LPG, dan karbon monoksida (CO)
  - ⚡ **PZEM-004T**: Tegangan, Arus, Daya, Energi (kWh), Power Factor, dan Frekuensi listrik
  - 💡 **BH1750**: Intensitas Cahaya Lingkungan (Lux)
- **Aktuator**: Kontrol Relay 4-Channel dengan mode Manual/Auto.
- **Keamanan**: Fitur *Last Will and Testament* (LWT) untuk deteksi instan jika alat offline.

---

## ⚙️ Panduan Konfigurasi

Sistem ini dirancang agar mudah dikonfigurasi. Berikut adalah file kunci yang dapat Anda ubah untuk menyesuaikan NusaHome dengan jaringan Anda.

### 1. Dashboard (Frontend)
Lokasi: `dashboard/src/config.js`
- **`API_BASE_URL`**: Perbarui ini ke alamat IP server Anda (contoh: `http://192.168.1.7:8000/api`).
- **MQTT Proxy**: Dashboard menggunakan WebSocket (WSS) pada Port `8884` secara default untuk kompabilitas browser.

### 2. Pico W (Firmware)
Lokasi: `pico/config.py`
- **`WIFI_SSID` / `WIFI_PASS`**: Kredensial jaringan WiFi lokal Anda.
- **`MQTT_BROKER`**: Default menggunakan `broker.hivemq.com`. 
- **`TOPIC_***`**: Ubah ini jika Anda ingin mengisolasi lalu lintas data perangkat Anda.
- **`API_BASE_URL`**: Harus mengarah ke backend API untuk sinkronisasi status relay saat booting.

### 3. Backend (API & Otomasi)
Lokasi: `.env` (Buat dari template)
- **`DATABASE_URL`**: String koneksi PostgreSQL.
- **`MQTT_BROKER`**: Harus sama dengan broker yang digunakan di Pico.
- **`SECRET_KEY`**: Digunakan untuk keamanan token JWT.

---

## 🚀 Memulai Cepat (Deployment)

### 📦 Prasyarat
- Python 3.10+
- Node.js 20+
- Database PostgreSQL
- MQTT Broker (Lokal atau Publik)

### 🛠️ Setup Backend
```bash
# 1. Setup Environment
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 2. Inisialisasi Database
python init_db.py

# 3. Jalankan Layanan
./nusahome-api.sh
```

### 💻 Setup Dashboard
```bash
cd dashboard
npm install
# Jalankan Produksi
../nusahome-dashboard.sh
```

---

## 📑 Skema Topik MQTT
| Topik | Kegunaan | Payload |
|-------|---------|---------|
| `nusahome/sensor/dht22` | Data Lingkungan | `{"temp": 28, "hum": 65}` |
| `nusahome/sensor/mq2` | Keamanan Gas | `{"smoke": 12, "lpg": 5, "co": 2}` |
| `nusahome/sensor/pzem004t` | Energi Listrik | `{"voltage": 220, "power": 450, ...}` |
| `nusahome/home/relay/{id}/set`| Kontrol Relay | `ON` atau `OFF` |
| `nusahome/system/picow/status`| Status Alat | `{"status": "READY", "uptime": 3600}` |

---
# smarthome
