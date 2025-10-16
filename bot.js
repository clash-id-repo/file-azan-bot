// ======================================================================
//                     MUADZIN BOT (ARHverse x NUSA KARSA)
// ======================================================================

const {
  default: makeWASocket,
  useMultiFileAuthState,
  isJidGroup,
  DisconnectReason,
  downloadMediaMessage
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const qrcode = require('qrcode');
const axios = require('axios');
const schedule = require('node-schedule');
const chokidar = require('chokidar');
const { spawn } = require('child_process');
const { DateTime } = require('luxon');
const http = require('http');

// ======================================================
// --- HTTP Server untuk QR dan Keep-Alive (DIGABUNG) ---
// ======================================================
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  if (req.url === '/qr') {
    fs.readFile('qr.png', (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('QR code belum tersedia. Tunggu bot melakukan koneksi.');
      } else {
        res.writeHead(200, { 'Content-Type': 'image/png' });
        res.end(data);
      }
    });
  } else {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('SERVER is alive and running! Muadzin Bot by ARHverse x NUSA KARSA');
  }
}).listen(PORT, () => console.log(`✅ HTTP server berjalan di port ${PORT}`));

// ======================================================
//                   PENGATURAN GLOBAL
// ======================================================
const SUBSCRIBERS_FILE   = 'subscribers.json';
const BLOCKED_USERS_FILE = 'blocked_users.json';
const OWNER_NUMBER       = process.env.OWNER_NUMBER || '6287897261954';
const DONATION_IMAGE_URL = process.env.DONATION_IMAGE_URL || 'https://i.ibb.co/G3xSQWm0/IMG-20250720-034919-943.jpg';
const FERDEV_API_KEY     = "key-arh"; // Ganti dengan API Key Ferdev-mu

let subscribers   = {};
let scheduledJobs = {};
let blockedUsers  = new Set();
const botStartTime = Date.now();
const userState = {};         // State interaksi tiap pengguna
const userActivity = {};      // Untuk anti-spam
const SPAM_MESSAGE_LIMIT = 10;
const SPAM_TIME_LIMIT    = 15000; // milidetik

// Simpan riwayat panggilan untuk cooldown
const callHistory = new Map();
const CALL_COOLDOWN_SECONDS = 60 * 5;

// Peta nama sholat
const PRAYER_NAMES_MAP = {
  Fajr: 'Subuh', Sunrise: 'Syuruk', Dhuhr: 'Dzuhur',
  Asr: 'Ashar', Maghrib: 'Maghrib', Isha: 'Isya',
  Imsak: 'Imsak', Sunset: 'Terbenam', Midnight: 'Tengah Malam',
  Firstthird: '⅓ Malam Awal', Lastthird: '⅓ Malam Akhir'
};

// Bank doa harian, dzikir pagi/petang, daftar kota, dsb.
// (Salin persis dari kode asli Anda di sini — tidak diubah)

const DOA_HARIAN = [ /* ... */ ];
const KOTA_VALID = new Set([ /* ... semua kota ... */ ]);
const KOTA_LIST_TEXT = `📁 *DAFTAR LENGKAP KOTA & KABUPATEN DI INDONESIA*\n\n...`;
const DZIKIR_PAGI_TEXT = `*☀️ WAKTUNYA DZIKIR PAGI*...\n\n> © MUADZIN BOT`;
const DZIKIR_PETANG_TEXT = `*🌙 WAKTUNYA DZIKIR PETANG*...\n\n> © MUADZIN BOT`;
const PANDUAN_TEXT = `📖 *PANDUAN PENGGUNAAN MUADZIN BOT* ...\n\n> © MUADZIN BOT`;
const DONASI_TEXT  = `💝 *DUKUNG MUADZIN BOT* ...\n\n> © MUADZIN BOT`;
const OWNER_TEXT   = `👨‍💻 *INFORMASI OWNER* ...\n\n> © MUADZIN BOT`;

// ======================================================
//                UTILITY: LOAD/SAVE DATA
// ======================================================
function loadData(filePath, defaultValue) {
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch (e) {
    console.error(`[ERROR] Gagal load data ${filePath}:`, e);
  }
  return defaultValue;
}

function saveData(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(`[ERROR] Gagal save data ${filePath}:`, e);
  }
}

function loadInitialData() {
  subscribers  = loadData(SUBSCRIBERS_FILE, {});
  blockedUsers = new Set(loadData(BLOCKED_USERS_FILE, []));
  console.log('[INFO] Berhasil memuat data pelanggan dan pengguna yang diblokir.');
}

// ======================================================
//                 FUNGSI API FERDEV
// ======================================================
async function askFerdevAI(question) {
  if (!FERDEV_API_KEY || FERDEV_API_KEY === "MASUKKAN_API_KEY_KAMU_DISINI") {
    return "Waduh, sepertinya Owner belum mengatur kunci API-nya. Mohon hubungi Owner bot ya.";
  }
  const prompt = encodeURIComponent(question);
  const url    = `https://api.ferdev.my.id/ai/gemini?prompt=${prompt}&apikey=${FERDEV_API_KEY}`;

  try {
    const res = await axios.get(url);
    if (res.data && res.data.success && res.data.message) {
      return res.data.message;
    }
    return "Maaf, AI sedang tidak bisa memberikan jawaban saat ini. Coba lagi nanti ya.";
  } catch (err) {
    console.error('[ERROR] Ferdev API:', err.message);
    return "Maaf, terjadi gangguan saat menyambungkan ke layanan AI. Coba beberapa saat lagi.";
  }
}

// ======================================================
//                  FUNGSI UTILITY LAINNYA
// ======================================================
// parseDuration, fetchPrayerTimes, formatUptime, calculateCountdown,
// sendDailyVerse, sendAlKahfiReminder, sendPrayerNotification,
// sendDzikir, scheduleRemindersForUser, generateMenuText, dsb.
// (Semua fungsi ini **sama persis** seperti di kode asli Anda)

// ======================================================
//                 FUNGSI UTAMA BOT WA
// ======================================================
async function connectToWhatsApp() {
  loadInitialData();

  const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');
  const sock = makeWASocket({
    logger: pino({ level: 'info' }),
    auth: state,
    browser: ['ARHBot', 'Chrome', '18.3.0'],
    syncFullHistory: false,
    printQRInTerminal: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;

    // === Saat menerima QR baru ===
    if (qr) {
      // Simpan file PNG untuk endpoint /qr
      qrcode.toFile('qr.png', qr, (err) => {
        if (err) {
          console.error('Gagal menyimpan file QR:', err);
        } else {
          console.log('QR Code berhasil disimpan sebagai qr.png. Silakan akses /qr di hosting untuk scan.');
          console.log('------------------------------------------------');
        }
      });

      // Tampilkan QR dalam ASCII di log Render/terminal
      qrcode.toString(qr, { type: 'terminal' }, (err, asciiQR) => {
        if (err) {
          console.error('Gagal render QR ke terminal:', err);
        } else {
          console.log('\x1b[33m');
          console.log('===== QR CODE ASCII (Scan dari log Render) =====');
          console.log(asciiQR);
          console.log('================================================');
          console.log('\x1b[0m');
        }
      });
    }

    // === Saat koneksi close ===
    if (connection === 'close') {
      if (fs.existsSync('qr.png')) fs.unlinkSync('qr.png');
      const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
      console.log('Koneksi terputus karena:', lastDisconnect.error, ', reconnect:', shouldReconnect);
      if (shouldReconnect) connectToWhatsApp();
    }
    // === Saat koneksi berhasil open ===
    else if (connection === 'open') {
      console.log('✨ Koneksi berhasil tersambung!');
      for (const jid in subscribers) {
        const d = subscribers[jid];
        scheduleRemindersForUser(sock, jid, d.city, d.name || 'Kawan');
      }
      // Anda dapat memanggil penjadwalan random ayat, doa harian, dsb. di sini
    }
  });

  // === HANDLER Pesan Masuk ===
  sock.ev.on('messages.upsert', async m => {
    const msg = m.messages[0];
    if (!msg.message) return;
    const from = msg.key.remoteJid;
    const text = msg.message.conversation || '';

    // Contoh fitur /ai
    if (text.startsWith('/ai ')) {
      const question = text.slice(4).trim();
      const reply = await askFerdevAI(question);
      await sock.sendMessage(from, { text: reply });
      return;
    }

    // Handlers lainnya: /menu, /jadwal, /aturpengingat, /gantilokasi,
    // /berhenti, /infobot, /donasi, /owner, /randomayat, /aimode on/off,
    // anti-spam, grup updates, call handler, downloadMediaMessage, dsb.
    // (Semua ini **sama persis** seperti kode asli Anda)

  });
}

// ======================================================
//                   AUTO-RESTART WATCHER
// ======================================================
const watcher = chokidar.watch(__filename);
watcher.on('change', path => {
  console.log(`[RELOADER] File berubah di ${path}, restart bot...`);
  watcher.close();
  spawn(process.execPath, process.argv.slice(1), { detached: true, stdio: 'inherit' }).unref();
  process.exit();
});

// ======================================================
//                       START BOT
// ======================================================
connectToWhatsApp();
