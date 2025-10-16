const { 
    default: makeWASocket, 
    useMultiFileAuthState,
    isJidGroup,
    DisconnectReason,
    downloadMediaMessage
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs =require('fs');
const qrcode = require('qrcode');
const axios = require('axios');
const schedule = require('node-schedule');
// --- PENAMBAHAN UNTUK AUTO-RESTART ---
const chokidar = require('chokidar');
const { spawn } = require('child_process');
const { DateTime } = require('luxon');
const http = require('http'); // <-- Pastikan ini ada di atas


// ======================================================
// --- HTTP Server untuk QR dan Keep-Alive (DIGABUNG) ---
// ======================================================
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
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
});

server.listen(PORT, () => console.log(`✅ HTTP server berjalan di port ${PORT}`));

// --- PENGATURAN & VARIABEL GLOBAL ---
const SUBSCRIBERS_FILE = 'subscribers.json';
const BLOCKED_USERS_FILE = 'blocked_users.json';
let subscribers = {}; 
let scheduledJobs = {};
const botStartTime = Date.now();

// --- STATE MANAGEMENT UNTUK INTERAKSI ---
const userState = {}; // Menyimpan state pengguna untuk interaksi

// --- PENGATURAN ANTI-SPAM ---
const SPAM_MESSAGE_LIMIT = 10; 
const SPAM_TIME_LIMIT = 15000; // 15 detik
const userActivity = {}; 
let blockedUsers = new Set();

// Letakkan ini di luar (di atas) fungsi connectToWhatsApp
// untuk menyimpan riwayat panggilan
const callHistory = new Map();
const CALL_COOLDOWN_SECONDS = 60 * 5; // Cooldown 5 menit


// --- INFORMASI PENTING & TEKS MENU ---
const OWNER_NUMBER = process.env.OWNER_NUMBER || '6287897261954'; 
const DONATION_IMAGE_URL = process.env.DONATION_IMAGE_URL || 'https://i.ibb.co/G3xSQWm0/IMG-20250720-034919-943.jpg'; 


// ======================================================
// BAGIAN INISIALISASI AI & PENGGUNA PREMIUM
// ======================================================
require('dotenv').config(); // Membaca file .env
const { GoogleGenerativeAI } = require("@google/generative-ai");

// ======================================================
// PENGATURAN & KONFIGURASI BOT
// ======================================================

const FERDEV_API_KEY = "key-arh"; // Ganti dengan API Key Ferdev-mu

// ======================================================
// KONSTITUSI / SYSTEM PROMPT UNTUK AI "AZALEA"
// ======================================================

const AI_CONSTITUTION = `
-- [PERAN UTAMA & IDENTITAS] --
Anda adalah sebuah AI di dalam "Muadzin Bot". Identitas Anda adalah asisten Islami yang Cerdas, Bijaksana, Empati, Sopan, dan Sangat Akurat. Anda berasal dari Indonesia dan sepenuhnya memahami konteks budaya, bahasa, dan nuansa lokal maupun internasional.

-- [ATURAN PERILAKU & KEAMANAN (NON-NEGOTIABLE)] --
1.  **Bukan Profesional Bersertifikat:** Anda DILARANG KERAS memberikan nasihat medis, hukum, atau finansial yang bersifat mutlak. Selalu akhiri jawaban pada topik-topik ini dengan kalimat untuk berkonsultasi dengan profesional di bidangnya.
2.  **Tetap dalam Peran:** Jangan pernah menyebut diri Anda sebagai "model bahasa besar". Anda adalah Azalea anak dari NUSA KARSA.

-- [DOMAIN PENGETAHUAN & KEAHLIAN] --
1.  **KEAHLIAN UTAMA (ISLAM):** Anda adalah seorang ahli dalam ilmu-ilmu keislaman. Jawaban Anda harus akurat, berbasis data, dan netral.
    -   **Sumber:** Rujuk pada Al-Qur'an, Hadits (utamakan yang shahih), dan pandangan ulama-ulama terkemuka.
    -   **Fiqh:** Saat ada perbedaan pendapat (khilafiyah), jelaskan pandangan dari mazhab-mazhab utama secara objektif.
2.  **KEAHLIAN SEKUNDER (PENGETAHUAN UMUM):** Anda juga memiliki pengetahuan ensiklopedis tentang topik umum lainnya dan sangat ahli dalam semua bidang yang ditanyakan tanpa ada sedikitpun keraguan.
3.  **KEAHLIAN SPESIAL (KESADARAN DIRI BOT):** Anda tahu persis semua fitur yang ada di dalam Muadzin Bot. Jika pertanyaan pengguna bisa dijawab oleh sebuah perintah, arahkan mereka dengan ramah. Gunakan pengetahuan ini:
    -   \`/menu\`: Menampilkan semua daftar perintah yang tersedia.
    -   \`/jadwal\`: Mengecek jadwal sholat untuk kota tertentu.
    -   \`/aturpengingat\`: Memulai proses berlangganan pengingat sholat.
    -   \`/gantilokasi\`: Mengubah kota untuk langganan pengingat.
    -   \`/berhenti\`: Berhenti berlangganan pengingat sholat.
    -   \`/infobot\`: Menampilkan informasi teknis dan statistik tentang bot.
    -   \`/donasi\`: Menunjukkan cara berdonasi untuk mendukung bot.
    -   \`/owner\`: Menampilkan kontak pemilik bot.
    -   \`/randomayat\`: Mengirimkan satu ayat Al-Qur'an secara acak.
    -   \`/ai\`: (Fitur Premium) Bertanya langsung ke AI jika mode obrolan sedang nonaktif.
    -   \`/aimode on/off\`: (Fitur Premium) Mengaktifkan atau menonaktifkan mode obrolan langsung dengan AI.

-- [GAYA BAHASA & FORMAT JAWABAN] --
-   **Bahasa:** Gunakan Bahasa Indonesia yang sopan, dan mudah dipahami gunakan kata Kamu bukan anda.
-   **Sapaan:** Awali jawaban dengan sapaan dinamis yang hangat dan relevan.
-   **Struktur:** Format jawaban agar sangat mudah dibaca. Gunakan **teks tebal**, *teks miring*, dan daftar poin.
-   **Penutup:** Akhiri jawaban dengan positif dan signature bot "> © MUADZIN BOT".

-- [TUGAS] --
Dengan mematuhi SEMUA aturan di atas secara ketat, jawablah pertanyaan pengguna berikut ini:
`;

// ======================================================
// FUNGSI UTAMA UNTUK BERTANYA KE AI (DENGAN KONSTITUSI)
// ======================================================

/**
 * Mengirim pertanyaan ke API Gemini dari Ferdev dengan Konstitusi AI.
 * @param {string} userQuestion Pertanyaan dari pengguna.
 * @returns {Promise<string>} Jawaban dari AI atau pesan error.
 */
async function askGemini(userQuestion) {
    if (!FERDEV_API_KEY || FERDEV_API_KEY === "MASUKKAN_API_KEY_KAMU_DISINI") {
        console.error("Error: API Key Ferdev belum diatur!");
        return "Waduh, sepertinya Owner belum mengatur kunci API-nya. Mohon hubungi Owner bot ya.";
    }

    // Menggabungkan Konstitusi dengan pertanyaan pengguna
    const finalPrompt = `${AI_CONSTITUTION}\nPertanyaan: "${userQuestion}"`;

    const encodedPrompt = encodeURIComponent(finalPrompt);
    const url = `https://api.ferdev.my.id/ai/gemini?prompt=${encodedPrompt}&apikey=${FERDEV_API_KEY}`;

    try {
        const response = await axios.get(url);

        if (response.data && response.data.success === true && response.data.message) {
            return response.data.message;
        } else {
            console.error("API merespons dengan data yang tidak valid:", response.data);
            return "Maaf, AI sedang tidak bisa memberikan jawaban saat ini. Coba lagi nanti ya. (Pesan error: respons tidak valid)";
        }
    } catch (error) {
        console.error("Terjadi error saat memanggil Ferdev API:", error.message);
        return "Maaf, terjadi gangguan saat menyambungkan ke layanan AI. Mungkin servernya sedang sibuk atau offline. Coba beberapa saat lagi.";
    }
}

// ======================================================
// MANAJEMEN DATA PENGGUNA & GRUP
// ======================================================

// Path untuk file database
const usersFilePath = './users.json';
const groupsFilePath = './groups.json';

// Variabel untuk menyimpan data
let users = {};
let groups = {};

// Fungsi untuk memuat semua data dari file .json
function loadAllData() {
    try {
        if (fs.existsSync(usersFilePath)) {
            users = JSON.parse(fs.readFileSync(usersFilePath));
        } else {
            console.log(`File ${usersFilePath} tidak ditemukan, akan dibuat saat ada data baru.`);
        }
        if (fs.existsSync(groupsFilePath)) {
            groups = JSON.parse(fs.readFileSync(groupsFilePath));
        } else {
            console.log(`File ${groupsFilePath} tidak ditemukan, akan dibuat saat ada data baru.`);
        }
        console.log('[INFO] Berhasil memuat data pengguna dan grup premium.');
    } catch (error) {
        console.error("Gagal memuat file data .json:", error);
    }
}

// Fungsi untuk menyimpan data pengguna
function saveUsers() {
    fs.writeFileSync(usersFilePath, JSON.stringify(users, null, 2));
}

// Fungsi untuk menyimpan data grup
function saveGroups() {
    fs.writeFileSync(groupsFilePath, JSON.stringify(groups, null, 2));
}

// Panggil fungsi ini satu kali saat bot pertama kali dijalankan
loadAllData();


/**
 * Mem-parsing string durasi (misal: "30m", "2j", "7h") dan mengembalikan tanggal kedaluwarsa.
 * @param {string} durationString String durasi dari argumen pengguna.
 * @returns {{expiryDate: Date, durationText: string} | null} Objek berisi tanggal kedaluwarsa dan teks deskriptif, atau null jika formatnya salah.
 */
function parseDuration(durationString) {
    if (!durationString) return null;
    const durationRegex = /^(\d+)([mjh])$/; // m untuk menit, j untuk jam, h untuk hari
    const match = durationString.toLowerCase().match(durationRegex);

    if (!match) {
        return null; // Format tidak valid
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];
    const expiryDate = new Date();
    let durationText = '';

    switch (unit) {
        case 'm':
            expiryDate.setMinutes(expiryDate.getMinutes() + value);
            durationText = `${value} menit`;
            break;
        case 'j':
            expiryDate.setHours(expiryDate.getHours() + value);
            durationText = `${value} jam`;
            break;
        case 'h':
            expiryDate.setDate(expiryDate.getDate() + value);
            durationText = `${value} hari`;
            break;
        default:
            return null; // Seharusnya tidak terjadi karena regex
    }

    return { expiryDate, durationText };
}



const PRAYER_NAMES_MAP = {
    Fajr: 'Subuh',
    Sunrise: 'Syuruk',
    Dhuhr: 'Dzuhur',
    Asr: 'Ashar',
    Maghrib: 'Maghrib',
    Isha: 'Isya',
    Imsak: 'Imsak',
    Sunset: 'Terbenam',
    Midnight: 'Tengah Malam',
    Firstthird: '⅓ Malam Awal',
    Lastthird: '⅓ Malam Akhir'
};

// --- BANK DOA & HARAPAN BAIK (100 PESAN PENYEMANGAT) ---
const DOA_HARIAN = [
    // Semangat & Motivasi
    "Jangan takut melangkah hari ini. Setiap langkahmu, sekecil apa pun, adalah bagian dari perjalanan hebat. Semoga Allah SWT mudahkan. Semangat! 🔥",
    "Jika kamu merasa lelah, ingatlah bahwa istirahat adalah bagian dari perjuangan. Pejamkan matamu sejenak, berdoa, lalu lanjutkan dengan kekuatan baru. Kamu bisa! 💪",
    "Kegagalan hari ini adalah pelajaran untuk kemenangan esok hari. Jangan menyerah, terus perbaiki diri. Kamu lebih kuat dari yang kamu kira! 🚀",
    "Waktu terus berjalan. Manfaatkan setiap detiknya untuk hal yang mendekatkanmu pada-Nya dan pada impianmu. Waktumu berharga! ⏳",
    "Semangat kerjanya! Niatkan setiap usahamu sebagai ibadah, maka lelahmu akan menjadi pahala yang tak terhingga. Bismillah! 💼",
    "Cita-citamu besar? Bagus! Iringi dengan doa yang besar dan usaha yang tak kalah besar. Allah SWT Maha Mendengar. 🎯",
    "Hari esok masih misteri. Hari kemarin adalah kenangan. Hari ini adalah anugerah. Lakukan yang terbaik di hari ini! 🎁",
    "Setiap ujian yang datang tidak pernah melebihi batas kemampuanmu. Allah SWT tahu kamu kuat. Hadapi dengan sabar dan sholat. 🙏",
    "Jangan biarkan keraguan menghentikanmu. Ucapkan 'Bismillah', lalu langkahkan kakimu. Allah SWT akan membuka jalan bagi mereka yang berusaha. ✨",
    "Ingat, kamu tidak harus menjadi hebat untuk memulai, tapi kamu harus memulai untuk menjadi hebat. Langkah pertama hari ini adalah kuncinya. 🔑",
    "Energi pagimu menentukan sisa harimu. Buka hari dengan doa dan optimisme, insyaAllah hasilnya akan luar biasa. Kamu siap? 🔥",
    "Saat kamu merasa ingin menyerah, ingat kembali alasan mengapa kamu memulai. Tujuanmu lebih besar dari rintanganmu saat ini. Terus maju! 🚶‍♂️🚶‍♀️",
    "Kesalahan bukan akhir dari segalanya, melainkan guru terbaik. Belajar, bangkit, dan jadilah versi dirimu yang lebih baik hari ini. 🌱",
    "Fokus pada kemajuan, bukan kesempurnaan. Setiap progres, sekecil apapun, layak untuk dirayakan. Kamu sudah melakukan yang terbaik! 🏆",
    "Dunia mungkin tidak selalu adil, tapi usaha dan doa tidak pernah sia-sia di mata Allah SWT. Teruslah berjuang dengan cara yang baik. 💖",
    "Ubah 'aku tidak bisa' menjadi 'aku akan coba'. Kekuatan pikiran dan doa bisa memindahkan gunung. Yakinlah! ⛰️",
    "Untuk setiap pintu yang tertutup, percayalah Allah SWT telah menyiapkan pintu lain yang lebih baik untukmu. Jangan berhenti mencari. 🚪",
    "Jangan menunggu motivasi datang, ciptakan motivasimu sendiri. Mulai dari hal kecil, selesaikan, dan rasakan kepuasannya. Lanjutkan! ✨",
    "Jadilah produktif, bukan hanya sibuk. Tentukan prioritasmu hari ini dan fokuslah pada hal yang benar-benar penting. Kamu pasti bisa! ✅",
    "Kekuatan terbesar ada setelah kamu berhasil melewati kelemahan terbesarmu. Hadapi tantangan hari ini, kamu akan jadi lebih kuat. 💪",

    // Syukur & Refleksi
    "Pernahkah kamu berhenti sejenak hanya untuk bersyukur atas nafas hari ini? Alhamdulillah... Semoga sisa harimu dipenuhi ketenangan. 🙏",
    "Rezeki bukan hanya soal materi, tapi juga teman yang baik dan hati yang damai. Semoga hari ini kita dikelilingi oleh keduanya. Aamiin. 🌿",
    "Jangan bandingkan dirimu dengan orang lain. Bunga mawar dan matahari tidak bisa dibandingkan, keduanya indah dengan caranya sendiri. Begitu juga kamu. 🌷",
    "Saat semua terasa berat, coba lihat ke atas. Ada Allah SWT yang Maha Besar. Masalahmu tidak ada apa-apanya bagi-Nya. Mintalah pertolongan. ✨",
    "Lihat sekelilingmu. Ada begitu banyak nikmat kecil yang sering terlupakan. Udara yang kita hirup, air yang kita minum. Alhamdulillah 'ala kulli haal. 💨",
    "Jangan menunggu bahagia untuk bersyukur, tapi bersyukurlah, maka kebahagiaan akan datang menghampirimu. Kuncinya adalah syukur. 😊",
    "Ucapkanlah 'Alhamdulillah' setidaknya 5 kali sekarang. Rasakan getaran syukurnya di dalam hati. Nikmat mana lagi yang kau dustakan? 💖",
    "Terkadang Allah SWT menahan sesuatu darimu bukan untuk menghukum, tapi untuk melindungimu. Ucapkan Alhamdulillah atas apa yang tidak kamu miliki. 🙏",
    "Hidup ini singkat. Jangan habiskan dengan keluhan. Habiskan dengan syukur, doa, dan usaha untuk menjadi lebih baik. ⏳",
    "Setiap pagi adalah halaman baru dalam buku kehidupanmu. Tulislah cerita yang indah hari ini, dimulai dengan rasa syukur. 📖",
    "Sudahkah kamu berterima kasih pada dirimu sendiri hari ini? Terima kasih telah bertahan, berjuang, dan tidak menyerah. Kamu hebat! 🤗",
    "Melihat ke atas untuk motivasi, melihat ke bawah untuk bersyukur. Keseimbangan ini akan membuat hatimu selalu damai. ⚖️",
    "Nikmat sehat adalah mahkota di kepala orang sehat yang hanya bisa dilihat oleh orang sakit. Syukuri sehatmu hari ini. 💚",
    "Jangan terlalu khawatirkan masa depan hingga lupa mensyukuri hari ini. Hari ini adalah anugerah nyata yang ada di tanganmu. ✨",
    "Semakin banyak kamu bersyukur, semakin banyak hal yang akan datang untuk kamu syukuri. Jadikan syukur sebagai kebiasaanmu. 🌿",
    "Saat kamu merasa tidak punya apa-apa, ingatlah kamu punya Allah SWT. Dan itu sudah lebih dari cukup. Alhamdulillah. ❤️",
    "Mungkin doamu belum terkabul, tapi lihatlah berapa banyak nikmat yang Allah SWT berikan tanpa kamu minta. Dia Maha Tahu yang terbaik. 🙏",
    "Harta yang paling berharga adalah keluarga yang hangat dan teman yang tulus. Syukuri kehadiran mereka dalam hidupmu. 👨‍👩‍👧‍👦",
    "Kesulitan adalah cara Allah SWT memberitahu bahwa kamu sedang dirindukan dalam sujud dan doamu. Dekati Dia. ✨",
    "Satu tarikan nafas adalah anugerah. Gunakan ia untuk berdzikir, memuji nama-Nya. Subhanallah, Walhamdulillah, Walaa Ilaha Illallah, Wallahu Akbar. 💨",

    // Ketenangan & Kebaikan
    "Satu kebaikan kecil hari ini bisa menjadi alasan senyum orang lain. Sudahkah kamu berbagi kebaikan hari ini? Yuk, tebar senyum! 😄",
    "Apapun yang sedang kamu hadapi, ingatlah: 'Laa tahzan, innallaha ma'ana' (Jangan bersedih, sesungguhnya Allah SWT beserta kita). Kamu tidak sendirian. ❤️",
    "Tersenyumlah! Senyummu adalah sedekah termudah, obat terbaik untuk dirimu sendiri, dan cahaya bagi orang di sekitarmu. Coba sekarang! 😊",
    "Jika ada yang menyakitimu, balaslah dengan doa. Mendoakan kebaikan untuk orang lain adalah cara terbaik membersihkan hati. 💖",
    "Sudahkah kamu memaafkan seseorang hari ini? Memaafkan membebaskan dua jiwa: jiwamu dan jiwa orang itu. Hati yang lapang adalah sumber kebahagiaan. 🤗",
    "Semoga hari ini, kita lebih banyak mendengar daripada berbicara, lebih banyak memberi daripada meminta, dan lebih banyak bersyukur daripada mengeluh. Aamiin. 🌿",
    "Jadilah seperti akar, tak terlihat namun menjadi sumber kekuatan bagi pohon untuk tumbuh tinggi. Ikhlaslah dalam setiap kebaikan. 🌳",
    "Semoga kita dijauhkan dari sifat sombong dan iri hati. Semoga hati kita selalu bersih dan dipenuhi kasih sayang. Aamiin. 🕊️",
    "Kebaikan itu menular. Mulailah dari dirimu, dan lihat bagaimana energi positif itu menyebar ke sekelilingmu. ✨",
    "Jadilah pribadi yang pemaaf. Dendam itu berat, hanya akan membebani langkahmu. Memaafkan itu ringan dan melapangkan. 🎈",
    "Saat kamu merasa sendirian, ingatlah Allah SWT sedang memberimu kesempatan untuk berbicara hanya dengan-Nya. Manfaatkan momen itu. 🌙",
    "Ketenangan sejati bukan saat tidak ada masalah, tapi saat hatimu tetap terhubung dengan Allah SWT di tengah badai masalah. 🙏",
    "Jangan biarkan perlakuan buruk orang lain merusak kedamaian hatimu. Balas dengan diam, doa, dan kebaikan. Kamu lebih mulia. ✨",
    "Menjadi orang baik tidak menjamin semua orang akan menyukaimu, tapi itu menjamin Allah SWT akan menyukaimu. Dan itu yang terpenting. ❤️",
    "Hati yang tenang adalah istana termewah. Jagalah ia dari pikiran negatif dan prasangka buruk. Hiasi dengan dzikir. 👑",
    "Bantu orang lain tanpa pamrih, maka Allah SWT akan membantumu dari arah yang tak terduga. Tangan di atas lebih baik dari tangan di bawah. 🤝",
    "Hindari perdebatan yang tidak perlu. Mengalah bukan berarti kalah, terkadang itu adalah kemenangan untuk kedamaian hatimu. 🤫",
    "Bicara yang baik atau diam. Lisanmu mencerminkan hatimu. Semoga lisan kita selalu basah karena dzikir dan kata-kata yang menyejukkan. 💬",
    "Setiap jiwa butuh ketenangan. Temukan ketenanganmu dalam sholat, dalam Al-Qur'an, dan dalam mengingat-Nya. 💖",
    "Sebarkan salam. 'Assalamualaikum' bukan hanya sapaan, tapi doa. Semoga keselamatan, rahmat, dan berkah-Nya menyertaimu. 🙏",

    // Rezeki & Kemudahan
    "Semoga makanan yang kamu nikmati hari ini menjadi sumber energi untuk beribadah dan berbuat baik. Jangan lupa Bismillah. 🍽️",
    "Semoga setiap tetes keringat yang jatuh dalam usahamu mencari rezeki halal, menjadi saksi perjuanganmu di hadapan-Nya kelak. Aamiin. 💧",
    "Satu sedekah kecil di pagi hari bisa menolak bala dan membuka pintu rezeki. Sudahkah kamu bersedekah hari ini? 💸",
    "Semoga Allah SWT selalu menuntun langkah kita ke tempat-tempat yang baik, bertemu orang-orang yang baik, dan melakukan hal-hal yang baik. 🚶‍♂️🚶‍♀️",
    "Ya Allah, cukupkan kebutuhan kami, lapangkan rezeki kami, dan berkahi setiap apa yang kami miliki. Aamiin Ya Rabbal Alamin. ✨",
    "Pintu rezeki bukan hanya dari bekerja, tapi juga dari bakti pada orang tua, dari silaturahmi, dan dari sedekah. Mari kita buka semua pintunya. 🚪",
    "Jangan khawatirkan rezekimu. Ia sudah diatur dan tidak akan pernah tertukar. Khawatirkan amalanmu, karena itu bekalmu. 🙏",
    "Jika Allah SWT menahan rezekimu, mungkin Dia ingin memberimu yang lebih baik di waktu yang tepat. Teruslah berprasangka baik dan berusaha. ✨",
    "Kunci rezeki yang paling ampuh adalah sholat tepat waktu dan istighfar. Mari kita amalkan keduanya hari ini. 🔑",
    "Ya Allah, kami memohon kepada-Mu ilmu yang bermanfaat, rezeki yang baik, dan amal yang diterima. Aamiin. 🤲",
    "Rezeki yang paling nikmat adalah saat ia menjadi jalan untuk kita lebih banyak beribadah dan membantu sesama. Semoga rezeki kita berkah. 🌿",
    "Jangan hanya mengejar dunia, nanti kamu lelah. Libatkan Allah SWT, maka dunia yang akan mengejarmu. Bismillah. 🚀",
    "Setiap makhluk hidup di bumi sudah dijamin rezekinya. Tugas kita hanya menjemputnya dengan cara yang halal dan diridhai-Nya. 🐾",
    "Mengeluh tidak akan menambah rezekimu, tapi bersyukur akan mengundangnya datang. Yuk, ganti keluhan dengan Alhamdulillah. 😊",
    "Kadang kemudahan datang setelah kita memudahkan urusan orang lain. Mari saling membantu hari ini. 🤝",
    "Ya Allah, jauhkan kami dari hutang yang memberatkan dan rezeki yang haram. Berikan kami kecukupan dan keberkahan. Aamiin. 🙏",

    // Pengingat Ibadah
    "Jangan lupa istighfar. Mungkin ada pintu rezeki yang tertahan karena dosa kecil yang tak kita sadari. Astaghfirullahaladzim...",
    "Sebuah pengingat lembut: Sudahkah kamu mendoakan kedua orang tuamu hari ini? Mereka adalah sumber keberkahan terbesarmu. 🤲",
    "Satu ayat Al-Qur'an yang dibaca dengan tulus bisa menenangkan hati yang paling gelisah. Sudahkah kamu menyapa Kalam-Nya hari ini? 📖",
    "Ingat, sholat bukan hanya kewajiban, tapi kebutuhan. Itu adalah waktu istirahatmu bersama Sang Pencipta. Nikmatilah setiap gerakannya. 🙏",
    "Pengingat sholat Dhuha: Dua rakaat di pagi hari sebagai tanda syukur, insyaAllah membuka pintu-pintu rezeki. Sudahkah kamu? 😊",
    "Berbaktilah kepada orang tua selagi mereka ada. Ridha Allah SWT terletak pada ridha mereka. Sudahkah kamu menelepon mereka hari ini? 📞",
    "Jangan biarkan kesibukan dunia melupakanmu dari tujuan akhirmu: Surga. Mari seimbangkan dunia dan akhirat kita. ⚖️",
    "Mari kita perbanyak shalawat hari ini. Semoga kita semua mendapatkan syafaat dari Rasulullah SAW di hari akhir kelak. Allahumma shalli 'ala sayyidina Muhammad. ❤️",
    "Saat adzan berkumandang, tinggalkan sejenak urusan duniamu. Panggilan itu lebih penting dari panggilan mana pun. Yuk, siapkan diri. 🙏",
    "Al-Kahfi di hari Jumat adalah cahaya di antara dua Jumat. Jangan lupa membacanya atau mendengarkannya nanti ya. ✨"
];



// --- BANK KOTA UNTUK VALIDASI (VERSI LENGKAP SELURUH INDONESIA) ---
const KOTA_VALID = new Set([
    // Sumatra
    'aceh besar', 'aceh barat', 'aceh barat daya', 'aceh jaya', 'aceh selatan', 'aceh singkil', 'aceh tamiang', 'aceh tengah', 'aceh tenggara', 'aceh timur', 'aceh utara',
    'nias', 'nias selatan', 'nias utara', 'nias barat', 'mandailing natal', 'tapanuli selatan', 'tapanuli tengah', 'tapanuli utara', 'toba samosir', 'samosir', 'labuhanbatu', 'labuhanbatu selatan', 'labuhanbatu utara',
    'asahan', 'simalungun', 'dairi', 'karo', 'deli serdang', 'langkat', 'serdang bedagai', 'batu bara', 'padang lawas', 'padang lawas utara', 'pakpak bharat', 'humbang hasundutan',
    'kepulauan mentawai', 'pesisir selatan', 'solok', 'sijunjung', 'tanah datar', 'padang pariaman', 'agam', 'lima puluh kota', 'pasaman', 'pasaman barat', 'dharmasraya',
    'kampar', 'indragiri hulu', 'bengkalis', 'indragiri hilir', 'pelalawan', 'rokan hulu', 'rokan hilir', 'siak', 'kepulauan meranti',
    'kerinci', 'merangin', 'sarolangun', 'batanghari', 'muaro jambi', 'tanjung jabung timur', 'tanjung jabung barat', 'tebo', 'bungo',
    'oku', 'ogan komering ulu', 'ogan komering ilir', 'muara enim', 'lahat', 'musi rawas', 'musi banyuasin', 'banyuasin', 'oku selatan', 'oku timur', 'ogan ilir', 'empat lawang', 'penukal abab lematang ilir', 'musi rawas utara',
    'bengkulu selatan', 'rejang lebong', 'bengkulu utara', 'kaur', 'seluma', 'muko muko', 'lebong', 'kepahiang', 'bengkulu tengah',
    'lampung barat', 'tanggamus', 'lampung selatan', 'lampung timur', 'lampung tengah', 'lampung utara', 'way kanan', 'tulang bawang', 'pesawaran', 'pringsewu', 'mesuji', 'tulang bawang barat', 'pesisir barat',
    'bangka', 'belitung', 'bangka barat', 'bangka tengah', 'bangka selatan', 'belitung timur',
    'karimun', 'bintan', 'natuna', 'lingga', 'kepulauan anambas',
    'banda aceh', 'sabang', 'lhokseumawe', 'langsa', 'subulussalam',
    'medan', 'pematangsiantar', 'sibolga', 'tanjungbalai', 'binjai', 'tebing tinggi', 'padangsidimpuan', 'gunungsitoli',
    'padang', 'solok', 'sawah lunto', 'padang panjang', 'bukittinggi', 'payakumbuh', 'pariaman',
    'pekanbaru', 'dumai',
    'jambi', 'sungai penuh',
    'palembang', 'prabumulih', 'pagar alam', 'lubuklinggau',
    'bengkulu',
    'bandar lampung', 'metro',
    'pangkal pinang',
    'batam', 'tanjung pinang',

    // Jawa
    'kepulauan seribu', 'jakarta pusat', 'jakarta utara', 'jakarta barat', 'jakarta selatan', 'jakarta timur',
    'bogor', 'sukabumi', 'cianjur', 'bandung', 'garut', 'tasikmalaya', 'ciamis', 'kuningan', 'cirebon', 'majalengka', 'sumedang', 'indramayu', 'subang', 'purwakarta', 'karawang', 'bekasi', 'bandung barat', 'pangandaran',
    'cilacap', 'banyumas', 'purbalingga', 'banjarnegara', 'kebumen', 'purworejo', 'wonosobo', 'magelang', 'boyolali', 'klaten', 'sukoharjo', 'wonogiri', 'karanganyar', 'sragen', 'grobogan', 'blora', 'rembang', 'pati', 'kudus', 'jepara', 'demak', 'semarang', 'temanggung', 'kendal', 'batang', 'pekalongan', 'pemalang', 'tegal', 'brebes',
    'kulon progo', 'bantul', 'gunung kidul', 'sleman',
    'pacitan', 'ponorogo', 'trenggalek', 'tulungagung', 'blitar', 'kediri', 'malang', 'lumajang', 'jember', 'banyuwangi', 'bondowoso', 'situbondo', 'probolinggo', 'pasuruan', 'sidoarjo', 'mojokerto', 'jombang', 'nganjuk', 'madiun', 'magetan', 'ngawi', 'bojonegoro', 'tuban', 'lamongan', 'gresik', 'bangkalan', 'sampang', 'pamekasan', 'sumenep',
    'bogor', 'sukabumi', 'bandung', 'cirebon', 'bekasi', 'depok', 'cimahi', 'tasikmalaya', 'banjar',
    'magelang', 'surakarta', 'solo', 'salatiga', 'semarang', 'pekalongan', 'tegal',
    'yogyakarta',
    'kediri', 'blitar', 'malang', 'probolinggo', 'pasuruan', 'mojokerto', 'madiun', 'surabaya', 'batu',
    'pandeglang', 'lebak', 'tangerang', 'serang',
    'tangerang', 'cilegon', 'serang', 'tangerang selatan',

    // Kalimantan
    'sambas', 'bengkayang', 'landak', 'mempawah', 'sanggau', 'ketapang', 'sintang', 'kapuas hulu', 'sekadau', 'melawi', 'kayong utara', 'kubu raya',
    'kotawaringin barat', 'kotawaringin timur', 'kapuas', 'barito selatan', 'barito utara', 'sukamarau', 'lamandau', 'seruyan', 'katingan', 'pulang pisau', 'gunung mas', 'barito timur', 'murung raya',
    'tanah laut', 'kotabaru', 'banjar', 'barito kuala', 'tapin', 'hulu sungai selatan', 'hulu sungai tengah', 'hulu sungai utara', 'tabalong', 'tanah bumbu', 'balangan',
    'paser', 'kutai barat', 'kutai kartanegara', 'kutai timur', 'berau', 'penajam paser utara', 'mahakam hulu',
    'malinau', 'bulungan', 'tana tidung', 'nunukan',
    'pontianak', 'singkawang',
    'palangkaraya', 'palangka raya',
    'banjarmasin', 'banjarbaru',
    'samarinda', 'balikpapan', 'bontang',
    'tarakan',

    // Nusa Tenggara & Bali
    'jembrana', 'tabanan', 'badung', 'gianyar', 'klungkung', 'bangli', 'karangasem', 'buleleng',
    'lombok barat', 'lombok tengah', 'lombok timur', 'sumbawa', 'dompu', 'bima', 'sumbawa barat', 'lombok utara',
    'sumba barat', 'sumba timur', 'kupang', 'timor tengah selatan', 'timor tengah utara', 'belu', 'alor', 'lembata', 'flores timur', 'sikka', 'ende', 'ngada', 'manggarai', 'rote ndao', 'manggarai barat', 'sumba tengah', 'sumba barat daya', 'nagekeo', 'manggarai timur', 'sabu raijua', 'malaka',
    'denpasar',
    'mataram', 'bima',
    'kupang',

    // Sulawesi
    'kepulauan selayar', 'bulukumba', 'bantaeng', 'jeneponto', 'takalar', 'gowa', 'sinjai', 'maros', 'pangkajene dan kepulauan', 'barru', 'bone', 'soppeng', 'wajo', 'sidenreng rappang', 'pinrang', 'enrekang', 'luwu', 'tana toraja', 'luwu utara', 'luwu timur', 'toraja utara',
    'donggala', 'poso', 'morowali', 'banggai', 'buol', 'toli-toli', 'parigi moutong', 'tojo una-una', 'sigi', 'banggai kepulauan', 'morowali utara', 'banggai laut',
    'bolaang mongondow', 'minahasa', 'kepulauan sangihe', 'kepulauan talaud', 'minahasa selatan', 'minahasa utara', 'minahasa tenggara', 'bolaang mongondow utara', 'kepulauan siau tagulandang biaro', 'bolaang mongondow timur', 'bolaang mongondow selatan',
    'konawe', 'muna', 'buton', 'kolaka', 'konawe selatan', 'bombana', 'wakatobi', 'kolaka utara', 'buton utara', 'konawe utara', 'kolaka timur', 'konawe kepulauan', 'muna barat', 'buton tengah', 'buton selatan',
    'boalemo', 'gorontalo', 'pohuwato', 'bone bolango', 'gorontalo utara',
    'majene', 'polewali mandar', 'mamasa', 'mamuju', 'pasangkayu', 'mamuju tengah',
    'makassar', 'parepare', 'palopo',
    'palu',
    'manado', 'bitung', 'tomohon', 'kotamobagu',
    'kendari', 'baubau',
    'gorontalo',

    // Maluku & Papua
    'maluku tenggara barat', 'maluku tenggara', 'maluku tengah', 'buru', 'kepulauan aru', 'seram bagian barat', 'seram bagian timur', 'kepulauan tanimbar', 'buru selatan',
    'halmahera barat', 'halmahera tengah', 'kepulauan sula', 'halmahera selatan', 'halmahera utara', 'halmahera timur', 'pulau morotai', 'pulau taliabu',
    'fakfak', 'kaimana', 'teluk wondama', 'teluk bintuni', 'manokwari', 'sorong selatan', 'sorong', 'raja ampat', 'tambrauw', 'maybrat', 'manokwari selatan', 'pegunungan arfak',
    'merauke', 'jayawijaya', 'jayapura', 'nabire', 'kepulauan yapen', 'biak numfor', 'paniai', 'puncak jaya', 'mimiika', 'boven digoel', 'mapi', 'asmat', 'yahukimo', 'pegunungan bintang', 'tolikara', 'sarmi', 'keerom', 'waropen', 'supiori', 'mamberamo raya', 'nduga', 'lanny jaya', 'mamberamo tengah', 'yalimo', 'puncak', 'dogiyai', 'intan jaya', 'deiyai',
    'ambon', 'tual',
    'ternate', 'tidore kepulauan',
    'sorong',
    'jayapura'
]);


const KOTA_LIST_TEXT = `📁 *DAFTAR LENGKAP KOTA & KABUPATEN DI INDONESIA*

Gunakan nama kota atau kabupaten dari daftar di bawah ini untuk hasil yang akurat.

*📈 SUMATRA*
> *Aceh:* Banda Aceh, Sabang, Lhokseumawe, Langsa, Subulussalam, Aceh Selatan, Aceh Tenggara, Aceh Timur, Aceh Tengah, Aceh Barat, Aceh Besar, Pidie, Aceh Utara, Simeulue, Aceh Singkil, Bireuen, Aceh Barat Daya, Gayo Lues, Aceh Tamiang, Nagan Raya, Aceh Jaya, Bener Meriah, Pidie Jaya.
> *Sumatera Utara (Sumut):* Medan, Pematangsiantar, Sibolga, Tanjungbalai, Binjai, Tebing Tinggi, Padangsidimpuan, Gunungsitoli, Asahan, Dairi, Deli Serdang, Humbang Hasundutan, Karo, Labuhanbatu, Langkat, Mandailing Natal, Nias, Nias Selatan, Pakpak Bharat, Samosir, Serdang Bedagai, Simalungun, Tapanuli Selatan, Tapanuli Tengah, Tapanuli Utara, Toba, Batubara, Labuhanbatu Selatan, Labuhanbatu Utara, Nias Barat, Nias Utara, Padang Lawas, Padang Lawas Utara.
> *Sumatera Barat (Sumbar):* Padang, Solok, Sawahlunto, Padang Panjang, Bukittinggi, Payakumbuh, Pariaman, Agam, Dharmasraya, Kepulauan Mentawai, Lima Puluh Kota, Padang Pariaman, Pasaman, Pasaman Barat, Pesisir Selatan, Sijunjung, Solok, Solok Selatan, Tanah Datar.
> *Riau:* Pekanbaru, Dumai, Bengkalis, Indragiri Hilir, Indragiri Hulu, Kampar, Kepulauan Meranti, Kuantan Singingi, Pelalawan, Rokan Hilir, Rokan Hulu, Siak.
> *Kepulauan Riau (Kepri):* Batam, Tanjungpinang, Bintan, Karimun, Kepulauan Anambas, Lingga, Natuna.
> *Jambi:* Jambi, Sungai Penuh, Batanghari, Bungo, Kerinci, Merangin, Muaro Jambi, Sarolangun, Tanjung Jabung Barat, Tanjung Jabung Timur, Tebo.
> *Bengkulu:* Bengkulu, Bengkulu Selatan, Bengkulu Tengah, Bengkulu Utara, Kaur, Kepahiang, Lebong, Mukomuko, Rejang Lebong, Seluma.
> *Sumatera Selatan (Sumsel):* Palembang, Pagar Alam, Lubuklinggau, Prabumulih, Banyuasin, Empat Lawang, Lahat, Muara Enim, Musi Banyuasin, Musi Rawas, Ogan Ilir, Ogan Komering Ilir, Ogan Komering Ulu (OKU), OKU Selatan, OKU Timur, Penukal Abab Lematang Ilir, Musi Rawas Utara.
> *Kepulauan Bangka Belitung (Babel):* Pangkalpinang, Bangka, Bangka Barat, Bangka Selatan, Bangka Tengah, Belitung, Belitung Timur.
> *Lampung:* Bandar Lampung, Metro, Lampung Barat, Lampung Selatan, Lampung Tengah, Lampung Timur, Lampung Utara, Mesuji, Pesawaran, Pesisir Barat, Pringsewu, Tanggamus, Tulang Bawang, Tulang Bawang Barat, Way Kanan.

*🔹 JAWA*
> *DKI Jakarta:* Jakarta Barat, Jakarta Pusat, Jakarta Selatan, Jakarta Timur, Jakarta Utara, Kepulauan Seribu.
> *Banten:* Serang, Cilegon, Tangerang, Tangerang Selatan, Lebak, Pandeglang.
> *Jawa Barat (Jabar):* Bandung, Banjar, Bekasi, Bogor, Cimahi, Cirebon, Depok, Sukabumi, Tasikmalaya, Bandung Barat, Ciamis, Cianjur, Garut, Indramayu, Karawang, Kuningan, Majalengka, Pangandaran, Purwakarta, Subang, Sumedang.
> *Jawa Tengah (Jateng):* Semarang, Magelang, Pekalongan, Salatiga, Surakarta (Solo), Tegal, Banjarnegara, Banyumas, Batang, Blora, Boyolali, Brebes, Cilacap, Demak, Grobogan, Jepara, Karanganyar, Kebumen, Kendal, Klaten, Kudus, Pati, Pemalang, Purbalingga, Purworejo, Rembang, Sragen, Sukoharjo, Temanggung, Wonogiri, Wonosobo.
> *DI Yogyakarta (DIY):* Yogyakarta, Bantul, Gunungkidul, Kulon Progo, Sleman.
> *Jawa Timur (Jatim):* Surabaya, Batu, Blitar, Kediri, Madiun, Malang, Mojokerto, Pasuruan, Probolinggo, Bangkalan, Banyuwangi, Bondowoso, Bojonegoro, Gresik, Jember, Jombang, Lamongan, Lumajang, Magetan, Nganjuk, Ngawi, Pacitan, Pamekasan, Ponorogo, Sampang, Sidoarjo, Situbondo, Sumenep, Trenggalek, Tuban, Tulungagung.

*🌳 KALIMANTAN*
> *Kalimantan Barat (Kalbar):* Pontianak, Singkawang, Bengkayang, Kapuas Hulu, Kayong Utara, Ketapang, Kubu Raya, Landak, Melawi, Mempawah, Sambas, Sanggau, Sekadau, Sintang.
> *Kalimantan Tengah (Kalteng):* Palangka Raya, Barito Selatan, Barito Timur, Barito Utara, Gunung Mas, Kapuas, Katingan, Kotawaringin Barat, Kotawaringin Timur, Lamandau, Murung Raya, Pulang Pisau, Sukamara, Seruyan.
> *Kalimantan Selatan (Kalsel):* Banjarmasin, Banjarbaru, Balangan, Banjar, Barito Kuala, Hulu Sungai Selatan, Hulu Sungai Tengah, Hulu Sungai Utara, Kotabaru, Tabalong, Tanah Bumbu, Tanah Laut, Tapin.
> *Kalimantan Timur (Kaltim):* Balikpapan, Bontang, Samarinda, Berau, Kutai Barat, Kutai Kartanegara, Kutai Timur, Mahakam Ulu, Paser, Penajam Paser Utara.
> *Kalimantan Utara (Kaltara):* Tarakan, Bulungan, Malinau, Nunukan, Tana Tidung.

*🌬️ SULAWESI*
> *Gorontalo:* Gorontalo, Boalemo, Bone Bolango, Gorontalo Utara, Pohuwato.
> *Sulawesi Selatan (Sulsel):* Makassar, Palopo, Parepare, Bantaeng, Barru, Bone, Bulukumba, Enrekang, Gowa, Jeneponto, Kepulauan Selayar, Luwu, Luwu Timur, Luwu Utara, Maros, Pangkajene dan Kepulauan, Pinrang, Sidenreng Rappang, Sinjai, Soppeng, Takalar, Tana Toraja, Toraja Utara, Wajo.
> *Sulawesi Tenggara (Sultra):* Kendari, Baubau, Bombana, Buton, Buton Selatan, Buton Tengah, Buton Utara, Kolaka, Kolaka Timur, Kolaka Utara, Konawe, Konawe Kepulauan, Konawe Selatan, Konawe Utara, Muna, Muna Barat, Wakatobi.
> *Sulawesi Tengah (Sulteng):* Palu, Banggai, Banggai Kepulauan, Banggai Laut, Buol, Donggala, Morowali, Morowali Utara, Parigi Moutong, Poso, Sigi, Tojo Una-Una, Toli-Toli.
> *Sulawesi Utara (Sulut):* Manado, Bitung, Kotamobagu, Tomohon, Bolaang Mongondow (Bolmong), Bolmong Selatan, Bolmong Timur, Bolmong Utara, Kepulauan Sangihe, Kepulauan Siau Tagulandang Biaro, Kepulauan Talaud, Minahasa, Minahasa Selatan, Minahasa Tenggara, Minahasa Utara.
> *Sulawesi Barat (Sulbar):* Mamuju, Majene, Mamasa, Mamuju Tengah, Pasangkayu, Polewali Mandar.

*🌿 BALI & NUSA TENGGARA*
> *Bali:* Denpasar, Badung, Bangli, Buleleng, Gianyar, Jembrana, Karangasem, Klungkung, Tabanan.
> *Nusa Tenggara Barat (NTB):* Mataram, Bima, Dompu, Lombok Barat, Lombok Tengah, Lombok Timur, Lombok Utara, Sumbawa, Sumbawa Barat.
> *Nusa Tenggara Timur (NTT):* Kupang, Alor, Belu, Ende, Flores Timur, Lembata, Malaka, Manggarai, Manggarai Barat, Manggarai Timur, Nagekeo, Ngada, Rote Ndao, Sabu Raijua, Sikka, Sumba Barat, Sumba Barat Daya, Sumba Tengah, Sumba Timur, Timor Tengah Selatan, Timor Tengah Utara.

*📍 MALUKU & PAPUA*
> *Maluku:* Ambon, Tual, Buru, Buru Selatan, Kepulauan Aru, Kepulauan Tanimbar, Maluku Barat Daya, Maluku Tengah, Maluku Tenggara, Seram Bagian Barat, Seram Bagian Timur.
> *Maluku Utara:* Ternate, Tidore Kepulauan, Halmahera Barat, Halmahera Tengah, Halmahera Timur, Halmahera Selatan, Halmahera Utara, Kepulauan Sula, Pulau Morotai, Pulau Taliabu.
> *Papua:* Jayapura, Asmat, Biak Numfor, Boven Digoel, Deiyai, Dogiyai, Intan Jaya, Keerom, Kepulauan Yapen, Lanny Jaya, Mamberamo Raya, Mamberamo Tengah, Mappi, Merauke, Mimika, Nabire, Nduga, Paniai, Pegunungan Bintang, Puncak, Puncak Jaya, Sarmi, Supiori, Tolikara, Waropen, Yahukimo, Yalimo.
> *Papua Barat:* Manokwari, Sorong, Fakfak, Kaimana, Manokwari Selatan, Maybrat, Pegunungan Arfak, Raja Ampat, Sorong Selatan, Tambrauw, Teluk Bintuni, Teluk Wondama.
> *Papua Tengah:* Nabire, Deiyai, Dogiyai, Intan Jaya, Mimika, Paniai, Puncak, Puncak Jaya.
> *Papua Pegunungan:* Jayawijaya, Lanny Jaya, Mamberamo Tengah, Nduga, Pegunungan Bintang, Tolikara, Yahukimo, Yalimo.
> *Papua Selatan:* Merauke, Asmat, Boven Digoel, Mappi.
> *Papua Barat Daya:* Sorong, Maybrat, Raja Ampat, Sorong Selatan, Tambrauw.

ℹ️ *Catatan:* Kamu bebas mencoba nama daerah lainnya, termasuk kecamatan atau kabupaten kecil.


> © MUADZIN BOT`;




const DZIKIR_PAGI_TEXT = `*☀️ WAKTUNYA DZIKIR PAGI*

*ِبِسْمِ اللَّهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ*

Bismillahilladzi laa yadhurru ma'asmihi syai'un fil ardhi wa laa fis samaa'i wa huwas samii'ul 'aliim. (3x)

*Artinya:*
_"Dengan nama Allah SWT yang bila disebut, segala sesuatu di bumi dan langit tidak akan berbahaya, Dia-lah Yang Maha Mendengar lagi Maha Mengetahui."_

_Barangsiapa yang mengucapkan dzikir tersebut sebanyak tiga kali di pagi hari, maka tidak akan ada bahaya yang tiba-tiba memudaratkannya._
— (HR. Abu Daud no. 5088, 5089, Tirmidzi no. 3388, dan Ibnu Majah no. 3869)

Jangan lupakan dzikir pagimu agar senantiasa dilindungi Allah SWT SWT. 🙏\n\n> © MUADZIN BOT`;

const DZIKIR_PETANG_TEXT = `*🌙 WAKTUNYA DZIKIR PETANG*

*أَعُوذُ بِكَلِمَاتِ ٱللّٰهِ ٱلتَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ*

A'udzu bikalimaatillahit taammaati min syarri maa khalaq. (3x)

*Artinya:*
"_Aku berlindung dengan kalimat-kalimat Allah SWT yang sempurna dari kejahatan makhluk yang diciptakan-Nya._"

Keutamaan mengucapkan Dzikir tersebut sebanyak tiga kali di petang hari maka akan mendapatkan Perlindungan dari segala bahaya, gangguan, dan makhluk jahat.
Rasulullah ﷺ bersabda:

"Barangsiapa yang singgah di suatu tempat lalu membaca:
‘A'ūdzu bikalimātillāhit-tāmāti min sharri mā khalaq’,
maka tidak ada sesuatu pun yang akan membahayakannya hingga ia pergi dari tempat itu."
— (HR. Muslim, no. 2708)

Semoga kita semua selalu dalam lindungan-Nya. 🙏\n\n> © MUADZIN BOT`;


const PANDUAN_TEXT = `📖 *PANDUAN PENGGUNAAN MUADZIN BOT* 

1️⃣ *Melihat Jadwal Sholat*
Ketik \`/jadwal\` untuk melihat jadwal sholat di kota yang telah kamu atur.
Untuk melihat jadwal di kota lain, ketik \`/jadwal Nama Kota\`.
> Contoh: \`/jadwal Pekanbaru\`

Ketik perintah \`/kota\` untuk melihat Daftar Kota yang ada.

2️⃣ *Berlangganan Pengingat Lengkap*
Dengan berlangganan, kamu akan otomatis mendapatkan:
- Pengingat waktu Sholat
- Ayat Al-Qur'an harian secara berkala
- Pengingat Dzikir Pagi & Petang
- Pengingat Al-Kahfi pada hari Jum'at 
Ketik perintah \`/aturpengingat\` lalu ikuti instruksinya.

3️⃣ *Random Ayat Al-Qur'an*
Dapatkan paket lengkap ayat Al Qur'an (Teks Arab, Arti & Murottal) kapan saja. 
Ketik perintah \`/randomayat\`

4️⃣ *Info & Bantuan*
Gunakan perintah \`/infobot\`, \`/kota\`, \`/donasi\`, atau \`/owner\` untuk informasi lebih lanjut.

💫 *SUKA BOT INI?*
Silakan share bot ini kesemua kenalan kamu agar mendapatkan manfaatnya juga dan Dukung bot ini dengan berdonasi melalui perintah \`/donasi\`.\n\n> © MUADZIN BOT`;

const DONASI_TEXT = `💝 *DUKUNG MUADZIN BOT*

Terima kasih sudah berdonasi untuk mendukung bot ini! Setiap dukungan darimu sangat berarti agar bot bisa terus aktif dan dikembangkan dengan fitur-fitur baru.

Kamu bisa memberikan donasi melalui QRIS di atas dengan menggunakan dompet digital atau Mobile Banking yang kamu miliki.

Terima kasih banyak atas kebaikanmu, semoga Allah SWT SWT melipat gandakan rezekimu! ✨\n\n> © MUADZIN BOT`;

const OWNER_TEXT = `👨‍💻 *INFORMASI OWNER* 

Bot ini dibuat dan dikelola oleh ARH [@arhverse] x NUSA KARSA [nusakarsa.id]. Jika kamu menemukan bug, punya saran, atau butuh bantuan, silakan hubungi owner.

💬 *WhatsApp:* wa.me/${OWNER_NUMBER}

Mohon untuk tidak melakukan spam atau panggilan telepon ya. Terima kasih!\n\n> © MUADZIN BOT`;

const generateMenuText = (userName, totalPersonal, totalGroup, isGroup = false) => {
    // --- DAFTAR DOA DINAMIS ---
    const dynamicWishes = [
          "Allah SWT selalu melimpahkan rahmat dan berkah-Nya di setiap langkahmu hari ini. 🤲",
  "menjadi awal yang penuh kemudahan dan keberkahan dari Allah SWT. 🤲",
  "Allah SWT mengisi pagimu dengan ketenangan dan hati yang penuh syukur. 🤲",
  "Allah SWT melindungimu dari segala mara bahaya dan menjadikan harimu penuh kebaikan. 🤲",
  "setiap doamu dikabulkan dan setiap usahamu diberi keberhasilan oleh Allah SWT. 🤲",
  "Allah SWT memberimu kekuatan dan kesabaran dalam menjalani hari yang baru ini. 🤲",
  "Allah SWT limpahkan kebahagiaan dan kedamaian dalam hatimu hari ini. 🤲",
  "segala urusanmu hari ini dimudahkan dan diberkahi oleh Allah SWT. 🤲",
  "cahaya iman dan taqwa menerangi langkahmu sepanjang hari ini. 🤲",
  "Allah SWT mengampuni dosa-dosamu dan menerima amal ibadahmu hari ini. 🤲",
  "hatimu selalu dipenuhi dengan rasa syukur dan cinta kepada Allah SWT. 🤲",
  "Allah SWT jadikan pagimu ini sebagai awal kesuksesan dan kebahagiaan. 🤲",
  "setiap nafas yang kau hirup hari ini membawa berkah dan rahmat Allah SWT. 🤲",
  "Allah SWT menuntunmu pada jalan yang lurus dan penuh keberkahan. 🤲",
  "harimu dipenuhi dengan kebaikan yang mengalir dari rahmat Allah SWT. 🤲",
  "Allah SWT bukakan pintu rezeki yang halal dan berkah untukmu hari ini. 🤲",
  "setiap langkahmu hari ini mendapat ridha dan kasih sayang Allah SWT. 🤲",
  "Allah SWT jauhkanmu dari segala kesulitan dan ujian yang berat hari ini. 🤲",
  "Allah SWT jadikan pagimu penuh dengan dzikir dan pengingat kebaikan. 🤲",
  "keberkahan dan ampunan Allah SWT selalu menyertai setiap aktivitasmu hari ini. 🤲",
        "semua urusanmu dilancarkan dan penuh berkah. 🤲",
        "hatimu dipenuhi ketenangan dan kebahagiaan. 🤲",
        "langkahmu selalu dalam lindungan-Nya. 🤲",
        "hari ini membawa rezeki yang tak terduga untukmu. 🤲",
        "setiap lelahmu menjadi lillah dan bernilai ibadah. 🤲",
        "kamu dan keluarga senantiasa diberi kesehatan. 🤲",
        "ilmu yang kamu pelajari hari ini menjadi manfaat dunia dan akhirat. 🤲",
        "senyummu hari ini menjadi pembuka pintu rezeki. 🤲",
        "setiap doamu hari ini diijabah oleh-Nya. 🤲"
    ];
    // Memilih satu doa secara acak
    const randomWish = dynamicWishes[Math.floor(Math.random() * dynamicWishes.length)];

    // Menggunakan Luxon untuk mendapatkan waktu di zona WIB
    const nowInJakarta = DateTime.now().setZone('Asia/Jakarta');
    const hour = nowInJakarta.hour; 
    
    let timeOfDayGreeting = "";
    let timeOfDayEmoji = "";

    if (hour >= 4 && hour < 10) {
        timeOfDayGreeting = "Selamat pagi";
        timeOfDayEmoji = "☀️";
    } else if (hour >= 10 && hour < 15) {
        timeOfDayGreeting = "Selamat siang";
        timeOfDayEmoji = "🌤️";
    } else if (hour >= 15 && hour < 18) {
        timeOfDayGreeting = "Selamat sore";
        timeOfDayEmoji = "🌇";
    } else {
        timeOfDayGreeting = "Selamat malam";
        timeOfDayEmoji = "🌙";
    }

    const fullDate = nowInJakarta.setLocale('id').toFormat('cccc, dd MMMM yyyy');
    
    const openingGreeting = isGroup
        ? `Assalamualaikum semuanya! ${timeOfDayGreeting} ${timeOfDayEmoji}`
        : `Assalamualaikum, *${userName}*! ${timeOfDayGreeting} ${timeOfDayEmoji}`;
    
    const openingWish = `Semoga di hari ${fullDate} ini, ${randomWish}`;
    const openingAction = "Berikut adalah daftar perintah yang bisa kamu gunakan:";
    const finalOpening = `${openingGreeting}\n\n${openingWish}\n\n${openingAction}`;

    const serverTime = nowInJakarta.toFormat('HH:mm:ss');
    const timeZoneString = `GMT+07:00 (WIB)`;
    
    return (
        `${finalOpening}\n\n` +
        "*📖 MENU UTAMA*\n" +
        " `/aturpengingat` - Berlangganan pengingat waktu Sholat\n" +
        " `/gantilokasi` - Ubah lokasi pengingat\n" +
        " `/berhenti` - Berhenti langganan pengingat\n" +
        " `/jadwal` - Cek jadwal waktu Sholat\n" +
        " `/randomayat` - Random Ayat Al Qur'an\n\n" +
        "*ℹ️ BANTUAN & INFO*\n" +
        " `/infobot` - Lihat status dan info bot\n" +
        " `/kota` - Lihat daftar kota\n" +
        " `/panduan` - Informasi & Cara penggunaan bot\n" +
        " `/donasi` - Dukung pengembangan bot\n" +
        " `/owner` - Hubungi pemilik bot\n\n\n" +
        `> Server Time: ${serverTime} ${timeZoneString}\n` +
        "> © MUADZIN BOT"
    );
};



// --- FUNGSI-FUNGSI UTILITAS ---

function loadData(filePath, defaultValue) {
    try {
        if (fs.existsSync(filePath)) {
            const data = fs.readFileSync(filePath, 'utf-8');
            return JSON.parse(data);
        }
    } catch (error) { console.error(`[ERROR] Gagal memuat file ${filePath}:`, error); }
    return defaultValue;
}

function saveData(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    } catch (error) { console.error(`[ERROR] Gagal menyimpan file ${filePath}:`, error); }
}

function loadInitialData() {
    subscribers = loadData(SUBSCRIBERS_FILE, {});
    const blockedArray = loadData(BLOCKED_USERS_FILE, []);
    blockedUsers = new Set(blockedArray);
    console.log('[INFO] Berhasil memuat data pelanggan dan pengguna yang diblokir.');
}

async function fetchPrayerTimes(city, date = new Date()) {
    const formattedDate = `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`;
    try {
        const response = await axios.get(`http://api.aladhan.com/v1/timingsByCity/${formattedDate}`, {
            params: { 
                city: city, 
                country: "Indonesia", 
                method: 11 // Kemenag RI
            }
        });
        
        if (!response.data || response.data.code !== 200) {
            console.log(`[VALIDASI GAGAL] API tidak merespons dengan baik untuk kota: ${city}`);
            return null; 
        }

        const responseData = response.data.data;
        if (!responseData || !responseData.meta || !responseData.timings) {
            console.log(`[VALIDASI GAGAL] Respons API tidak lengkap untuk kota: ${city}`);
            return null;
        }

        const validTimezones = ['Asia/Jakarta', 'Asia/Pontianak', 'Asia/Makassar', 'Asia/Jayapura'];
        if (!validTimezones.includes(responseData.meta.timezone)) {
            console.log(`[VALIDASI GAGAL] Zona waktu tidak valid (${responseData.meta.timezone}) untuk kota: ${city}`);
            return null;
        }

        return responseData;

    } catch (error) {
        console.log(`[API ERROR] Panggilan API gagal untuk kota: "${city}". Pesan: ${error.message}`);
        return null;
    }
}

function formatUptime(startTime) {
    const now = Date.now();
    let seconds = Math.floor((now - startTime) / 1000);
    let days = Math.floor(seconds / (24 * 3600));
    seconds %= (24 * 3600);
    let hours = Math.floor(seconds / 3600);
    seconds %= 3600;
    let minutes = Math.floor(seconds / 60);
    seconds %= 60;
    return `${days} hari, ${hours} jam, ${minutes} menit, ${seconds} detik`;
}


function calculateCountdown(timings) {
    const nowInJakarta = DateTime.now().setZone('Asia/Jakarta');
    const prayerOrder = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
    let nextPrayerName = null;
    let nextPrayerTime = null;

    for (const prayerName of prayerOrder) {
        const prayerTimeStr = timings[prayerName];
        if (!prayerTimeStr) continue;

        const [hour, minute] = prayerTimeStr.split(':');
        let prayerDateTime = nowInJakarta.set({ hour: parseInt(hour), minute: parseInt(minute), second: 0, millisecond: 0 });

        if (prayerDateTime > nowInJakarta) {
            nextPrayerName = prayerName;
            nextPrayerTime = prayerDateTime;
            break;
        }
    }

    if (!nextPrayerName) {
        nextPrayerName = 'Fajr';
        const [hour, minute] = timings.Fajr.split(':');
        nextPrayerTime = nowInJakarta.plus({ days: 1 }).set({ hour: parseInt(hour), minute: parseInt(minute), second: 0, millisecond: 0 });
    }

    const diff = nextPrayerTime.diff(nowInJakarta, ['hours', 'minutes']).toObject();
    const hours = Math.floor(diff.hours);
    const minutes = Math.floor(diff.minutes);
    
    const translatedPrayerName = PRAYER_NAMES_MAP[nextPrayerName] || nextPrayerName;
    return `⏳ *${hours} jam ${minutes} menit* lagi menuju sholat *${translatedPrayerName}*`;
}


async function sendDailyVerse(sock, jid, isScheduled = false) {
    try {
        if (!isScheduled) {
            await sock.sendMessage(jid, { text: "📖 Tunggu sebentar, sedang mencari ayat untukmu..." });
        }
        const randomAyat = Math.floor(Math.random() * 6236) + 1;
        
        const response = await axios.get(`https://api.alquran.cloud/v1/ayah/${randomAyat}/editions/quran-uthmani,id.indonesian,ar.alafasy,en.transliteration`);
        const data = response.data.data;

        const arabicData = data.find(d => d.edition.identifier === 'quran-uthmani');
        const indonesianData = data.find(d => d.edition.identifier === 'id.indonesian');
        const audioData = data.find(d => d.edition.identifier === 'ar.alafasy');
        const transliterationData = data.find(d => d.edition.identifier === 'en.transliteration');

        if (!arabicData || !indonesianData || !audioData || !transliterationData) {
             throw new Error("Data dari API tidak lengkap (mungkin transliterasi gagal didapat).");
        }

        const arabicText = arabicData.text;
        const translationText = indonesianData.text;
        const transliterationText = transliterationData.text;
        const surahName = arabicData.surah.name;
        const surahNumber = arabicData.surah.number;
        const ayatNumber = arabicData.numberInSurah;
        const audioUrl = audioData.audio;

        const message = `*✨ AYAT AL-QUR'AN UNTUKMU HARI INI*\n\n` +
                        `*${surahName} (${surahNumber}:${ayatNumber})*\n\n` +
                        `*${arabicText}*\n\n` +
                        `*Bacaan Latin:*\n` +
                        `_${transliterationText}_\n\n` +
                        `*Artinya:*\n` +
                        `_"${translationText}"_\n\n` +
                        `Semoga menjadi pengingat yang bermanfaat 😊✨\n\n> © MUADZIN BOT`;

        await sock.sendMessage(jid, { text: message });
        await sock.sendMessage(jid, { 
            audio: { url: audioUrl },
            ptt: true,
            mimetype: 'audio/mpeg'
        });

        const stickerPath = './stickers/bacaquran.webp';
        if (fs.existsSync(stickerPath)) {
            await sock.sendMessage(jid, { sticker: { url: stickerPath } });
        }
    } catch (error) {
        console.error("[ERROR] Gagal mengirim paket ayat harian:", error.message);
        if (!isScheduled) {
            await sock.sendMessage(jid, { text: "Maaf, sepertinya ada kendala saat mengambil ayat harian. Silakan coba ulangi kembali ya." });
        }
    }
}


async function sendAlKahfiReminder(sock, jid) {
    try {
        const surah = 18;
        const ayat = Math.floor(Math.random() * 110) + 1; 
        
        const response = await axios.get(`https://api.alquran.cloud/v1/ayah/${surah}:${ayat}/editions/quran-uthmani,id.indonesian,ar.alafasy,en.transliteration`);
        const data = response.data.data;

        const arabicData = data.find(d => d.edition.identifier === 'quran-uthmani');
        const indonesianData = data.find(d => d.edition.identifier === 'id.indonesian');
        const audioData = data.find(d => d.edition.identifier === 'ar.alafasy');
        const transliterationData = data.find(d => d.edition.identifier === 'en.transliteration');

        if (!arabicData || !indonesianData || !audioData || !transliterationData) {
             throw new Error("Data Al-Kahfi dari API tidak lengkap.");
        }

        const arabicText = arabicData.text;
        const translationText = indonesianData.text;
        const transliterationText = transliterationData.text; 
        const audioUrl = audioData.audio;

        const message = `*✨ JUM'AT MUBARAK - WAKTUNYA AL-KAHFI*\n\n` +
                        `_Dari Abu Sa’id Al-Khudri radhiyallahu ‘anhu, Nabi shallallahu ‘alaihi wa sallam bersabda:_\n` +
                        `_"Barangsiapa membaca surat Al-Kahfi pada hari Jum’at, maka ia akan disinari oleh cahaya di antara dua Jum’at."_\n\n` +
                        `Berikut adalah salah satu ayatnya (QS. Al-Kahfi: *${ayat}*):\n\n` +
                        `${arabicText}\n\n` +
                        `*Bacaan Latin:*\n` +
                        `_${transliterationText}_\n\n` +
                        `*Artinya:*\n` +
                        `_"${translationText}"_\n\n\n> © MUADZIN BOT`;

        await sock.sendMessage(jid, { text: message });
        await sock.sendMessage(jid, { 
            audio: { url: audioUrl },
            ptt: true,
            mimetype: 'audio/mpeg'
        });

        const stickerPath = './stickers/alkahfi.webp';
        if (fs.existsSync(stickerPath)) {
            await sock.sendMessage(jid, { sticker: { url: stickerPath } });
        }
    } catch (error) {
        console.error("[ERROR] Gagal mengirim pengingat Al-Kahfi:", error.message);
    }
}



async function sendPrayerNotification(sock, jid, prayer, time, city, userName, timings) {
    try {
        const isGroup = isJidGroup(jid);
        const greeting = isGroup ? `Assalamualaikum semuanya! 🙏` : `Assalamualaikum *${userName}*! 🙏`;
        const translatedPrayerName = PRAYER_NAMES_MAP[prayer] || prayer;
        const countdownMessage = calculateCountdown(timings);

        const message = `*🕌 WAKTU SHOLAT TELAH TIBA 🕌*\n\n` +
                        `${greeting}\nSaat ini pukul *${time}* telah masuk waktu sholat *${translatedPrayerName.toUpperCase()}*\n` +
                        `untuk wilayah ${city} dan sekitarnya.\n\n${countdownMessage}`;
        
        await sock.sendMessage(jid, { text: message });

        const stickerPath = `./stickers/${prayer.toLowerCase()}.webp`;
        if (fs.existsSync(stickerPath)) {
            await sock.sendMessage(jid, { sticker: { url: stickerPath } });
        }

        try {
            console.log(`[AZAN] Mengirim audio Azan ke ${jid} untuk sholat ${prayer}.`);
            
            const fajrAzanUrl = 'https://ia804603.us.archive.org/7/items/adhan_fajr_mansour_zahrani/adhan_fajr_mansour_zahrani.mp3';
            const regularAzanUrl = 'https://cdn.aladhan.com/audio/adhans/a1.mp3';
            const azanAudioUrl = (prayer === 'Fajr') ? fajrAzanUrl : regularAzanUrl;
            
            await sock.sendMessage(jid, {
                audio: { url: azanAudioUrl },
                ptt: true,
                mimetype: 'audio/mpeg'
            });

        } catch (audioError) {
            console.error(`[ERROR] Gagal mengirim audio Azan ke ${jid}:`, audioError);
        }

        const closingMessage = `Selamat menunaikan ibadah sholat *${translatedPrayerName.toUpperCase()}* 😊✨\n\n> © MUADZIN BOT`;
        await sock.sendMessage(jid, { text: closingMessage });
    } catch (error) {
        console.error(`[ERROR] Gagal mengirim notifikasi lengkap untuk ${prayer} ke ${jid}:`, error);
    }
}

async function sendDzikir(sock, jid, type) {
    try {
        const isPagi = type.toLowerCase() === 'pagi';
        const text = isPagi ? DZIKIR_PAGI_TEXT : DZIKIR_PETANG_TEXT;
        const stickerPath = isPagi ? './stickers/dzikirpagi.webp' : './stickers/dzikirpetang.webp';

        await sock.sendMessage(jid, { text: text });
        if (fs.existsSync(stickerPath)) {
            await sock.sendMessage(jid, { sticker: { url: stickerPath } });
        }
    } catch (error) {
        console.error(`[ERROR] Gagal mengirim dzikir ${type}:`, error.message);
    }
}


async function scheduleRemindersForUser(sock, jid, city, userName) {
    if (scheduledJobs[jid]) scheduledJobs[jid].forEach(job => job.cancel());
    scheduledJobs[jid] = [];

    const prayerData = await fetchPrayerTimes(city);
    if (!prayerData || !prayerData.timings) return;
    const timings = prayerData.timings;

    console.log(`[JADWAL] Mengatur alarm untuk ${jid} di kota ${city}`);
    for (const [prayer, time] of Object.entries(timings)) {
        if (['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'].includes(prayer)) {
            const [hour, minute] = time.split(':');
            const rule = new schedule.RecurrenceRule();
            rule.hour = parseInt(hour);
            rule.minute = parseInt(minute);
            rule.tz = 'Asia/Jakarta';

            const job = schedule.scheduleJob(rule, async () => {
                const currentSubscriber = subscribers[jid];
                const currentUserName = currentSubscriber ? currentSubscriber.name : 'Kawan';
                const freshPrayerData = await fetchPrayerTimes(city);
                if(freshPrayerData && freshPrayerData.timings) {
                    await sendPrayerNotification(sock, jid, prayer, time, city, currentUserName, freshPrayerData.timings);
                }
            });
            if (job) scheduledJobs[jid].push(job);
        }
    }
}



// --- FUNGSI UTAMA BOT ---
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

    // ====================================================================
    // SEMUA EVENT LISTENER DIMULAI DI SINI, DI DALAM FUNGSI
    // ====================================================================

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('------------------------------------------------');
            console.log('    QR DITERIMA! SILAKAN AKSES URL RENDER ANDA    ');
            console.log('------------------------------------------------');
            qrcode.toFile('qr.png', qr, (err) => {
                if (err) {
                    console.error('Gagal menyimpan file QR:', err);
                } else {
                    console.log('QR Code berhasil disimpan sebagai qr.png. Buka alamat web bot Anda + /qr untuk scan.');
                    console.log('------------------------------------------------');
                }
            });
        }

        if (connection === 'close') {
            if (fs.existsSync('qr.png')) {
                fs.unlinkSync('qr.png');
            }
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus karena:', lastDisconnect.error, ', menyambungkan kembali:', shouldReconnect);

            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            botJid = sock.user.id; // <-- TAMBAHKAN INI UNTUK MENYIMPAN ID BOT
            console.log('✨ Koneksi berhasil tersambung!');
            for (const jid in subscribers) {
                const subscriberData = subscribers[jid];
                scheduleRemindersForUser(sock, jid, subscriberData.city, subscriberData.name || 'Kawan');
            }

            const verseSchedule = new schedule.RecurrenceRule();
            verseSchedule.tz = 'Asia/Jakarta';
            verseSchedule.hour = [12, 18];
            verseSchedule.minute = 40;
            schedule.scheduleJob(verseSchedule, async () => {
                console.log(`[INFO] Mengirim Random Ayat berkala (WIB) ke semua pelanggan...`);
                for (const jid in subscribers) {
                    try {
                        await sendDailyVerse(sock, jid, true);
                        await new Promise(resolve => setTimeout(resolve, 500));
                    } catch (e) {
                        console.error(`[RANDOM AYAT ERROR] Gagal mengirim ke ${jid}:`, e.message);
                    }
                }
            });

            const wishSchedule = new schedule.RecurrenceRule();
            wishSchedule.tz = 'Asia/Jakarta';
            wishSchedule.hour = [9, 20];
            wishSchedule.minute = 0;
            schedule.scheduleJob(wishSchedule, async () => {
                console.log(`[INFO] Mengirim Doa & Harapan Harian (WIB) ke semua pelanggan...`);
                const randomWish = DOA_HARIAN[Math.floor(Math.random() * DOA_HARIAN.length)];
                const messageToSend = `*✨ PESAN KEBAIKAN UNTUKMU ✨*\n\n_${randomWish}_\n\n> © MUADZIN BOT`;
                for (const jid in subscribers) {
                    try {
                        await sock.sendMessage(jid, { text: messageToSend });
                        await new Promise(resolve => setTimeout(resolve, 500));
                    } catch (e) {
                        console.error(`[DOA HARIAN ERROR] Gagal mengirim ke ${jid}:`, e.message);
                    }
                }
            });

            const dzikirPagiRule = new schedule.RecurrenceRule();
            dzikirPagiRule.hour = 7;
            dzikirPagiRule.minute = 0;
            dzikirPagiRule.tz = 'Asia/Jakarta';
            schedule.scheduleJob(dzikirPagiRule, async () => {
                console.log("[INFO] Mengirim Dzikir Pagi ke semua pelanggan...");
                for (const jid in subscribers) {
                    await sendDzikir(sock, jid, 'pagi');
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            });

            const dzikirPetangRule = new schedule.RecurrenceRule();
            dzikirPetangRule.hour = 16;
            dzikirPetangRule.minute = 0;
            dzikirPetangRule.tz = 'Asia/Jakarta';
            schedule.scheduleJob(dzikirPetangRule, async () => {
                console.log("[INFO] Mengirim Dzikir Petang ke semua pelanggan...");
                for (const jid in subscribers) {
                    await sendDzikir(sock, jid, 'petang');
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            });

            const alKahfiRule = new schedule.RecurrenceRule();
            alKahfiRule.dayOfWeek = 5;
            alKahfiRule.hour = 8;
            alKahfiRule.minute = 0;
            alKahfiRule.tz = 'Asia/Jakarta';
            schedule.scheduleJob(alKahfiRule, async () => {
                console.log("[INFO] Mengirim pengingat Al-Kahfi ke semua pelanggan...");
                for (const jid in subscribers) {
                    await sendAlKahfiReminder(sock, jid);
                    await new Promise(resolve => setTimeout(resolve, 500));
                }
            });
        }
    });

    sock.ev.on('group-participants.update', async (update) => {
        const { id, participants, action } = update;
        const myJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';

        try {
            if (action === 'add' && participants.includes(myJid)) {
                console.log(`[GROUP] Diundang ke grup baru: ${id}`);
                const welcomeStickerPath = './stickers/assalamualaikum.webp';
                if (fs.existsSync(welcomeStickerPath)) {
                    await sock.sendMessage(id, { sticker: { url: welcomeStickerPath } });
                }
                let totalPersonal = 0;
                let totalGroup = 0;
                for (const jid of Object.keys(subscribers)) {
                    isJidGroup(jid) ? totalGroup++ : totalPersonal++;
                }
                await sock.sendMessage(id, { text: generateMenuText("Semua", totalPersonal, totalGroup, true) });
                return;
            }

            const metadata = await sock.groupMetadata(id);
            const groupName = metadata.subject;

            for (const memberJid of participants) {
                if (memberJid === myJid) continue;
                const memberNumber = memberJid.split('@')[0];
                if (action === 'add') {
                    console.log(`[GROUP] Anggota baru @${memberNumber} masuk ke grup '${groupName}'`);
                    const welcomeText = `✨ Ahlan wa Sahlan!\n\nSelamat datang di grup *${groupName}*, @${memberNumber}! Semoga betah dan jangan lupa untuk membaca deskripsi grup ya.\n\n> © MUADZIN BOT`;
                    await sock.sendMessage(id, { text: welcomeText, mentions: [memberJid] });
                } else if (action === 'remove') {
                    console.log(`[GROUP] Anggota @${memberNumber} keluar dari grup '${groupName}'`);
                    const goodbyeText = `👋 Selamat tinggal, @${memberNumber}. Sampai jumpa di lain kesempatan!\n\n> © MUADZIN BOT`;
                    await sock.sendMessage(id, { text: goodbyeText, mentions: [memberJid] });
                } else if (action === 'promote') {
                    const promoteText = `🎉 Selamat kepada @${memberNumber} yang telah diangkat menjadi admin baru!\n\n> © MUADZIN BOT`;
                    await sock.sendMessage(id, { text: promoteText, mentions: [memberJid] });
                } else if (action === 'demote') {
                    const demoteText = `😔 @${memberNumber} sekarang sudah tidak menjadi admin lagi\n\n> © MUADZIN BOT.`;
                    await sock.sendMessage(id, { text: demoteText, mentions: [memberJid] });
                }
            }
        } catch (e) {
            console.error('[GROUP UPDATE ERROR]', e);
        }
    });

    // [BAGIAN YANG DIPERBAIKI] Menggunakan handler panggilan yang kamu berikan
    sock.ev.on('call', async (calls) => {
        for (const call of calls) {
            // Hanya proses panggilan masuk baru
            if (call.status === 'offer') {
                const callerJid = call.from;
                const callId = call.id;
                const callType = call.isVideo ? 'Video' : 'Suara';
                const now = Math.floor(Date.now() / 1000);

                try {
                    // --- 1. Logika Anti-Spam ---
                    if (callHistory.has(callerJid)) {
                        const lastCallTime = callHistory.get(callerJid);
                        if (now - lastCallTime < CALL_COOLDOWN_SECONDS) {
                            // Jika masih dalam masa cooldown, tolak saja tanpa kirim pesan
                            console.log(`[CALL] Menolak panggilan spam dari ${callerJid}`);
                            await sock.rejectCall(callId, callerJid);
                            continue; // Lanjut ke panggilan berikutnya jika ada
                        }
                    }

                    // Update waktu panggilan terakhir
                    callHistory.set(callerJid, now);

                    // --- 2. Tolak Panggilan ---
                    console.log(`[CALL] Menolak panggilan ${callType} dari ${callerJid}`);
                    await sock.rejectCall(callId, callerJid);

                    // --- 3. Kirim Notifikasi ke Owner ---
                    const ownerJid = `${OWNER_NUMBER}@s.whatsapp.net`;
                    const notifMessage = `🔔 *Panggilan Ditolak*\n\nBot baru saja menolak panggilan masuk.\n\n> 📞 *Dari:* @${callerJid.split('@')[0]}\n> 🎥 *Jenis:* Panggilan ${callType}\n> ⏰ *Waktu:* ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;
                    
                    await sock.sendMessage(ownerJid, { 
                        text: notifMessage,
                        mentions: [callerJid] // Mention nomor penelepon
                    });

                    // --- 4. Kirim Pesan Profesional ke Penelepon ---
                    const botJid = sock.user.id;
                    await sock.sendMessage(callerJid, 
                        { 
                            text: 'Mohon maaf, saya adalah asisten otomatis dan tidak dapat menerima panggilan. Silakan sampaikan keperluan Kamu melalui chat teks.\n\nKetik */menu* untuk melihat daftar perintah.\n\n> © MUADZIN BOT' 
                        },
                        {
                            // Menggunakan header minimalis yang sudah terbukti berhasil
                            quoted: {
                                key: {
                                    remoteJid: callerJid,
                                    id: 'ARHBOT_CALL_REJECT',
                                    fromMe: true,
                                    participant: botJid
                                },
                                message: {
                                    "extendedTextMessage": {
                                        "text": "Panggilan Tidak Dapat Diterima"
                                    }
                                }
                            }
                        }
                    );

                } catch (e) {
                    console.error('[CALL HANDLER ERROR]', e);
                }
            }
        }
    });


    sock.ev.on('messages.upsert', async m => {
        let reactionEmoji = '';
        const msg = m.messages[0];
        const from = msg.key.remoteJid;

        try {
            if (msg.key && msg.key.remoteJid !== 'status@broadcast') {
                await sock.readMessages([msg.key]);
            }
            if (!msg.message || msg.key.fromMe) return;
            if (blockedUsers.has(from)) {
                reactionEmoji = '🚫';
                return;
            }

            const now = Date.now();
            if (!userActivity[from]) userActivity[from] = { timestamps: [] };
            userActivity[from].timestamps.push(now);
            userActivity[from].timestamps = userActivity[from].timestamps.filter(ts => now - ts < SPAM_TIME_LIMIT);

            if (userActivity[from].timestamps.length > SPAM_MESSAGE_LIMIT) {
                if (!blockedUsers.has(from)) {
                    await sock.sendMessage(from, { text: "Maaf, kamu terdeteksi melakukan spam. Nomor Kamu diblokir. Silakan hubungi owner untuk membuka blokir.\n\n> © MUADZIN BOT" });
                    await sock.updateBlockStatus(from, "block");
                    blockedUsers.add(from);
                    saveData(BLOCKED_USERS_FILE, Array.from(blockedUsers));
                    reactionEmoji = '🚫';
                }
                return;
            }

            const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || msg.message?.videoMessage?.caption || "";
            if (!body && !(msg.message.imageMessage || msg.message.videoMessage)) return;

            const isGroup = isJidGroup(from);
            const userName = msg.pushName || "Kawan";

            if (userState[from]) {
                const state = userState[from];
                const userInput = body.trim();
                let sanitizedCity = userInput.toLowerCase();
                const prefixesToRemove = ['kota ', 'kabupaten ', 'kab ', 'kotamadya ', 'kota adm. '];
                for (const prefix of prefixesToRemove) {
                    if (sanitizedCity.startsWith(prefix)) {
                        sanitizedCity = sanitizedCity.replace(prefix, '').trim();
                        break;
                    }
                }
                if (sanitizedCity === '/kota') {
                    await sock.sendMessage(from, { text: KOTA_LIST_TEXT });
                    reactionEmoji = '📖';
                    return;
                }
                if (!KOTA_VALID.has(sanitizedCity)) {
                    const fallbackMessage = `Maaf, kota *"${userInput}"* tidak kami kenali atau tidak ada dalam daftar di server kami 😔\n\nPastikan ejaan sudah benar dan merupakan kota/kabupaten di Indonesia.\n\nKetik \`/kota\` untuk melihat beberapa contoh kota yang didukung.\n\n> © MUADZIN BOT`;
                    await sock.sendMessage(from, { text: fallbackMessage });
                    reactionEmoji = '❓';
                    return;
                }
                const finalCityName = sanitizedCity.charAt(0).toUpperCase() + sanitizedCity.slice(1);
                await sock.sendMessage(from, { text: `Mencari data untuk *${finalCityName}*...` });
                const validCityData = await fetchPrayerTimes(finalCityName);
                if (validCityData) {
                    const subscriberName = isGroup ? (await sock.groupMetadata(from)).subject : userName;
                    subscribers[from] = { city: finalCityName, name: subscriberName };
                    saveData(SUBSCRIBERS_FILE, subscribers);
                    if (state === 'awaiting_city_subscribe') {
                        const successMessage = `✅ Alhamdulillah, langganan pengingat berhasil diaktifkan!\n\n${isGroup ? 'Grup ini' : 'Kamu'} akan menerima pengingat waktu sholat untuk wilayah *${finalCityName}*.\n\nSenang sekali bisa menjadi teman pengingat sholatmu, semoga niat baikmu untuk sholat tepat waktu ini dicatat sebagai amal kebaikan oleh Allah SWT. InsyaAllah, aku akan tepati janji untuk selalu mengingatkanmu 😊🙏\n\n_Jika ingin mengganti lokasi, kamu bisa menggunakan perintah \`/gantilokasi\`_\n\n> © MUADZIN BOT`;
                        await sock.sendMessage(from, { text: successMessage }, { quoted: msg });
                        try {
                            const totalSubscribers = Object.keys(subscribers).length;
                            const ownerJid = `${OWNER_NUMBER}@s.whatsapp.net`;
                            const notifMessage = `🔔 *LANGGANAN BARU*\n\nAlhamdulillah ada user yang baru saja berlangganan, berikut detail nya:\n\n> 👤 *Nama:* ${subscriberName}\n> 📞 *Nomor:* ${from.split('@')[0]}\n> 🏙️ *Kota:* ${finalCityName}\n> 📊 *Total Pelanggan Saat Ini:* ${totalSubscribers}\n\n> © MUADZIN BOT`;
                            await sock.sendMessage(ownerJid, { text: notifMessage });
                        } catch (e) {
                            console.error("[OWNER NOTIF ERROR] Gagal mengirim notifikasi subscribe ke owner:", e);
                        }
                    } else if (state === 'awaiting_city_change_location') {
                        const successMessage = `✅ Lokasi berhasil diubah! Pengingat sekarang diatur untuk kota *${finalCityName}*.\n\n> © MUADZIN BOT`;
                        await sock.sendMessage(from, { text: successMessage }, { quoted: msg });
                    }
                    await scheduleRemindersForUser(sock, from, finalCityName, subscriberName);
                    delete userState[from];
                    reactionEmoji = '✅';
                } else {
                    await sock.sendMessage(from, { text: `Maaf, Terjadi sedikit kendala saat mengambil data untuk kota *${finalCityName}*. Coba beberapa saat lagi ya.` });
                    reactionEmoji = '❌';
                }
                return;
            }

            if (isGroup && !body.trim().startsWith('/')) {
                return;
            }

            await sock.sendPresenceUpdate('composing', from);
            let totalPersonalUsers = 0;
            let totalGroupUsers = 0;
            for (const jid of Object.keys(subscribers)) {
                if (isJidGroup(jid)) {
                    totalGroupUsers++;
                } else {
                    totalPersonalUsers++;
                }
            }
            


// ====================================================================
// [GERBANG LOGIKA] CEK MODE AI SEBELUM MEMPROSES PERINTAH
// ====================================================================
const userData = users[from];
const isPremium = userData && userData.isPremium && new Date(userData.premiumExpiry) > new Date();
const aiModeIsOn = isPremium && userData.aiMode === 'on';

// Jika pesan di chat pribadi, BUKAN perintah, dan mode AI sedang ON
if (!isGroup && !body.startsWith('/') && aiModeIsOn) {
    // Maka semua teks biasa akan langsung dijawab oleh AI
    await sock.sendPresenceUpdate('composing', from);
    
    const questionFromChat = body;
    const answerFromChat = await askGemini(questionFromChat);
    const finalAnswerFromChat = `*🤖 AI Mode:*\n\n${answerFromChat}`;

    await sock.sendMessage(from, { text: finalAnswerFromChat }, { quoted: msg });
    reactionEmoji = '🧠';
    return; // PENTING: Hentikan proses agar tidak lanjut ke switch-case dan pesan welcome
}
// ====================================================================



            const lowerBody = body.trim().toLowerCase();
            const command = lowerBody.split(' ')[0];
            const args = body.trim().split(' ').slice(1);
            const cityArg = args.join(' ');

            switch (command) {
                case '/aturpengingat':
                    if (subscribers[from]) {
                        await sock.sendMessage(from, { text: `🔔 *Kamu Sudah Berlangganan*\n\nPengingat sudah aktif untuk kota *${subscribers[from].city}*.\n\n- Untuk mengubah lokasi, gunakan perintah \`/gantilokasi\`.\n- Untuk berhenti menerima pengingat, gunakan perintah \`/berhenti\`.\n\n> © MUADZIN BOT` }, { quoted: msg });
                    } else {
                        userState[from] = 'awaiting_city_subscribe';
                        await sock.sendMessage(from, { text: "Silakan ketik nama kota yang kamu inginkan untuk mengatur pengingat waktu Sholat.\n\nContoh: `Pekanbaru`\n\n_Untuk melihat daftar kota yang didukung, ketik */kota*_\n\n> © MUADZIN BOT" }, { quoted: msg });
                    }
                    reactionEmoji = '⚙️';
                    break;
                case '/gantilokasi':
                    if (!subscribers[from]) {
                        await sock.sendMessage(from, { text: "Maaf, kamu belum berlangganan pengingat.\n\nSilakan atur pengingat dulu dengan perintah `/aturpengingat`.\n\n> © MUADZIN BOT" }, { quoted: msg });
                        reactionEmoji = '🤔';
                        return;
                    }
                    userState[from] = 'awaiting_city_change_location';
                    await sock.sendMessage(from, { text: `📍 Lokasi saat ini: *${subscribers[from].city}*.\n\nSilakan ketik nama kota baru untuk mengubah lokasi pengingat.\n\n_Ketik \`/kota\` untuk melihat contoh nama kota._\n\n> © MUADZIN BOT` }, { quoted: msg });
                    reactionEmoji = '⚙️';
                    break;
                case '/berhenti':
                case '/unsubscribe':
                    if (subscribers[from]) {
                        const unsubscriberData = subscribers[from];
                        delete subscribers[from];
                        saveData(SUBSCRIBERS_FILE, subscribers);
                        if (scheduledJobs[from]) {
                            scheduledJobs[from].forEach(job => job.cancel());
                            delete scheduledJobs[from];
                        }
                        await sock.sendMessage(from, { text: "✅ Langganan berhasil diberhentikan.\n\nTerima kasih banyak telah menjadi bagian dari perjalanan Muadzin Bot.\nSemoga Allah SWT senantiasa memudahkanmu dalam menjaga konsistensi dalam melaksanakan sholat tepat waktu. Jika nanti berubah pikiran, aku akan selalu ada di sini untuk membantu mengingatkanmu kembali. Sampai jumpa lagi! 👋😊\n\n> © MUADZIN BOT" }, { quoted: msg });
                        try {
                            const totalSubscribers = Object.keys(subscribers).length;
                            const ownerJid = `${OWNER_NUMBER}@s.whatsapp.net`;
                            const notifMessage = `🔕 *BERHENTI LANGGANAN*\n\nBaru saja ada user yang berhenti langganan, berikut detailnya:\n\n> 👤 *Nama:* ${unsubscriberData.name}\n> 📞 *Nomor:* ${from.split('@')[0]}\n> 🏙️ *Kota Terdaftar:* ${unsubscriberData.city}\n> 📊 *Total Pelanggan Saat Ini:* ${totalSubscribers}\n\n> © MUADZIN BOT`;
                            await sock.sendMessage(ownerJid, { text: notifMessage });
                        } catch (e) {
                            console.error("[OWNER NOTIF ERROR] Gagal mengirim notifikasi unsubscribe ke owner:", e);
                        }
                    } else {
                        await sock.sendMessage(from, { text: "Maaf, kamu belum berlangganan pengingat.\n\nUntuk memulai dan menerima notifikasi waktu sholat, silakan ketik perintah `/aturpengingat`\n\n> © MUADZIN BOT" }, { quoted: msg });
                    }
                    reactionEmoji = '😢';
                    break;
                case '/jadwal':
                    const targetCity = cityArg || (subscribers[from] ? subscribers[from].city : null);
                    if (!targetCity) {
                        await sock.sendMessage(from, { text: "Ketikkan nama kota yang ingin kamu cek jadwal nya atau atur pengingat terlebih dahulu.\n\n*Panduan:*\n- Cek jadwal kota lain: `/jadwal Nama Kota`\n- Lihat daftar nama kota: `/kota`\n- Atur jadwal pengingat otomatis: `/aturpengingat`\n\n> © MUADZIN BOT" }, { quoted: msg });
                        reactionEmoji = '🤔';
                        return;
                    }
                    if (cityArg) {
                        const normalizedCity = cityArg.toLowerCase();
                        if (!KOTA_VALID.has(normalizedCity)) {
                            const fallbackMessage = `Maaf, kota *"${targetCity}"* tidak kami kenali atau tidak ada dalam daftar kota server kami 😔\n\nPastikan ejaan sudah benar dan merupakan kota/kabupaten di Indonesia.\n\nKetik \`/kota\` untuk melihat beberapa contoh kota yang didukung.\n\n> © MUADZIN BOT`;
                            await sock.sendMessage(from, { text: fallbackMessage });
                            reactionEmoji = '❓';
                            return;
                        }
                    }
                    await sock.sendMessage(from, { text: `Mencari jadwal untuk *${targetCity}*...` });
                    const prayerDataToday = await fetchPrayerTimes(targetCity, new Date());
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    const prayerDataTomorrow = await fetchPrayerTimes(targetCity, tomorrow);
                    if (prayerDataToday && prayerDataToday.timings) {
                        const timingsToday = prayerDataToday.timings;
                        const gregorianDate = prayerDataToday.date.gregorian.date;
                        const hijriDate = `${prayerDataToday.date.hijri.day} ${prayerDataToday.date.hijri.month.en} ${prayerDataToday.date.hijri.year}`;
                        const now = new Date();
                        const serverTime = new Intl.DateTimeFormat('id-ID', {
                            hour: '2-digit', minute: '2-digit', second: '2-digit',
                            timeZone: 'Asia/Jakarta', hour12: false
                        }).format(now);
                        const timeZoneString = `GMT+07:00 (WIB)`;
                        let scheduleMessage = `*🕌 JADWAL SHOLAT*\n\nJadwal untuk *${targetCity}*\n`;
                        scheduleMessage += `*${prayerDataToday.date.gregorian.weekday.en}, ${gregorianDate.split('-').reverse().join('-')} | ${hijriDate}*\n`;
                        scheduleMessage += `*${serverTime} ${timeZoneString}*\n\n`;
                        scheduleMessage += `*Hari ini*\n`;
                        scheduleMessage += `> Imsak: *${timingsToday.Imsak}*\n`;
                        scheduleMessage += `> Subuh: *${timingsToday.Fajr}*\n`;
                        scheduleMessage += `> Syuruk (Matahari terbit): *${timingsToday.Sunrise}*\n`;
                        scheduleMessage += `> Dzuhur: *${timingsToday.Dhuhr}*\n`;
                        scheduleMessage += `> Ashar: *${timingsToday.Asr}*\n`;
                        scheduleMessage += `> Ghurub (Matahari terbenam): *${timingsToday.Sunset}*\n`;
                        scheduleMessage += `> Maghrib: *${timingsToday.Maghrib}*\n`;
                        scheduleMessage += `> Isya: *${timingsToday.Isha}*\n`;
                        scheduleMessage += `> Tahajud (⅓ Malam Awal): *${timingsToday.Firstthird}*\n`;
                        scheduleMessage += `> Tengah Malam: *${timingsToday.Midnight}*\n`;
                        scheduleMessage += `> Tahajud (⅓ Malam Akhir): *${timingsToday.Lastthird}*\n`;
                        if (prayerDataTomorrow && prayerDataTomorrow.timings) {
                            const timingsTomorrow = prayerDataTomorrow.timings;
                            scheduleMessage += `\n*Besok*\n`;
                            scheduleMessage += `> Imsak: *${timingsTomorrow.Imsak}*\n`;
                            scheduleMessage += `> Subuh: *${timingsTomorrow.Fajr}*\n`;
                            scheduleMessage += `> Syuruk (Matahari terbit): *${timingsTomorrow.Sunrise}*\n`;
                            scheduleMessage += `> Dzuhur: *${timingsTomorrow.Dhuhr}*\n`;
                            scheduleMessage += `> Ashar: *${timingsTomorrow.Asr}*\n`;
                            scheduleMessage += `> Ghurub (Matahari terbenam): *${timingsTomorrow.Sunset}*\n`;
                            scheduleMessage += `> Maghrib: *${timingsTomorrow.Maghrib}*\n`;
                            scheduleMessage += `> Isya: *${timingsTomorrow.Isha}*\n`;
                            scheduleMessage += `> Tahajud (⅓ Malam Awal): *${timingsTomorrow.Firstthird}*\n`;
                            scheduleMessage += `> Tengah Malam: *${timingsTomorrow.Midnight}*\n`;
                            scheduleMessage += `> Tahajud (⅓ Malam Akhir): *${timingsTomorrow.Lastthird}*\n`;
                        }
                        scheduleMessage += `\n${calculateCountdown(timingsToday)}`;
                        scheduleMessage += `\n\n*PANDUAN*\n- Cek jadwal kota lain: \`/jadwal Nama Kota\`\n- Lihat daftar lengkap kota: \`/kota\``;
                        scheduleMessage += `\n\n> © MUADZIN BOT`;
                        await sock.sendMessage(from, { text: scheduleMessage }, { quoted: msg });
                        reactionEmoji = '🕌';
                    } else {
                        await sock.sendMessage(from, { text: `Maaf, terjadi kendala saat mengambil data untuk kota *${targetCity}*. Coba periksa lagi ejaannya atau lihat daftar di \`/kota\`\n\n> © MUADZIN BOT` });
                        reactionEmoji = '❌';
                    }
                    break;
                case '/testnotif':
                    if (!subscribers[from]) {
                        await sock.sendMessage(from, { text: "Kamu atau grup ini harus subscribe dulu untuk menggunakan fitur tes ini. Ketik `/aturpengingat`" });
                        reactionEmoji = '🤔';
                        return;
                    }
                    let prayerToTest = args[0]?.toLowerCase();
                    if (prayerToTest === 'subuh') prayerToTest = 'fajr';
                    else if (prayerToTest === 'dzuhur') prayerToTest = 'dhuhr';
                    else if (prayerToTest === 'ashar') prayerToTest = 'asr';
                    const validPrayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
                    if (!prayerToTest || !validPrayers.includes(prayerToTest)) {
                        await sock.sendMessage(from, { text: `Gunakan format: \`/testnotif <nama_sholat>\`\nContoh: \`/testnotif ashar\`\n\nPilihan: subuh, dzuhur, ashar, maghrib, isha` });
                        reactionEmoji = '❓';
                        return;
                    }
                    const userCity = subscribers[from].city;
                    const testPrayerData = await fetchPrayerTimes(userCity);
                    if (testPrayerData && testPrayerData.timings) {
                        const testTimings = testPrayerData.timings;
                        const prayerNameAPI = prayerToTest.charAt(0).toUpperCase() + prayerToTest.slice(1);
                        const prayerTime = testTimings[prayerNameAPI];
                        const subscriberName = subscribers[from].name || 'Kawan';
                        await sock.sendMessage(from, { text: `OK, menjalankan tes notifikasi untuk sholat *${PRAYER_NAMES_MAP[prayerNameAPI].toUpperCase()}*...` });
                        await sendPrayerNotification(sock, from, prayerNameAPI, prayerTime, userCity, subscriberName, testTimings);
                    } else {
                        await sock.sendMessage(from, { text: "Gagal mendapatkan data jadwal untuk tes." });
                    }
                    reactionEmoji = '🧪';
                    break;
                case '/testdzikir':
                    const ownerJidTest = `${OWNER_NUMBER}@s.whatsapp.net`;
                    if (from !== ownerJidTest) {
                        await sock.sendMessage(from, { text: `Maaf, perintah ini hanya untuk Owner.` });
                        reactionEmoji = '🔒';
                        return;
                    }
                    const dzikirType = args[0]?.toLowerCase();
                    if (dzikirType === 'pagi' || dzikirType === 'petang') {
                        await sock.sendMessage(from, { text: `OK, menjalankan tes Dzikir *${dzikirType.toUpperCase()}*...` });
                        await sendDzikir(sock, from, dzikirType);
                    } else {
                        await sock.sendMessage(from, { text: `Gunakan format: \`/testdzikir <pagi/petang>\`\nContoh: \`/testdzikir pagi\`` });
                    }
                    reactionEmoji = '🧪';
                    break;
                case '/testalkahfi':
                    const ownerJidKahfi = `${OWNER_NUMBER}@s.whatsapp.net`;
                    if (from !== ownerJidKahfi) {
                        await sock.sendMessage(from, { text: `Maaf, perintah ini hanya untuk Owner.` });
                        reactionEmoji = '🔒';
                        return;
                    }
                    await sock.sendMessage(from, { text: `OK, menjalankan tes pengingat Al-Kahfi...` });
                    await sendAlKahfiReminder(sock, from);
                    reactionEmoji = '🧪';
                    break;
                case '/testdoa':
                    await sock.sendMessage(from, { text: "OK, menjalankan tes kirim Doa & Harapan Harian..." });
                    if (typeof DOA_HARIAN !== 'undefined' && DOA_HARIAN.length > 0) {
                        const randomWish = DOA_HARIAN[Math.floor(Math.random() * DOA_HARIAN.length)];
                        const messageToSend = `*✨ PESAN KEBAIKAN UNTUKMU ✨*\n\n_${randomWish}_\n\n> © MUADZIN BOT`;
                        await sock.sendMessage(from, { text: messageToSend });
                    } else {
                        await sock.sendMessage(from, { text: "Maaf, 'Bank Doa' (DOA_HARIAN) sepertinya belum didefinisikan di kodemu." });
                    }
                    reactionEmoji = '🧪';
                    break;
                case '/broadcast':
                    const ownerJid = `${OWNER_NUMBER}@s.whatsapp.net`;
                    if (from !== ownerJid) {
                        await sock.sendMessage(from, { text: `Maaf, perintah ini hanya untuk Owner.` });
                        reactionEmoji = '🔒';
                        return;
                    }
                    const replied = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                    const isMediaMsg = msg.message.imageMessage || msg.message.videoMessage;
                    let broadcastMessageContent = args.join(' ');
                    let mediaBuffer = null;
                    let mediaType = null;
                    if (isMediaMsg && lowerBody.startsWith('/broadcast')) {
                        mediaType = msg.message.imageMessage ? 'image' : 'video';
                        mediaBuffer = await downloadMediaMessage(msg, 'buffer', {}, { logger: pino({ level: 'silent' }) });
                        broadcastMessageContent = body.substring('/broadcast'.length).trim();
                    } else {
                        if (replied && replied.conversation) {
                            broadcastMessageContent = replied.conversation;
                        }
                    }
                    if (!broadcastMessageContent && !mediaBuffer) {
                        await sock.sendMessage(from, { text: `Gunakan format:\n1. \`/broadcast <pesan>\`\n2. Reply pesan teks, lalu ketik \`/broadcast\`\n3. Kirim gambar/video dengan caption \`/broadcast <pesan>\`` });
                        reactionEmoji = '❓';
                        return;
                    }
                    const subscriberJids = Object.keys(subscribers);
                    await sock.sendMessage(from, { text: `📢 Memulai broadcast ke *${subscriberJids.length}* pelanggan...` });
                    const broadcastStickerPath = './stickers/broadcast.webp';
                    for (const jid of subscriberJids) {
                        try {
                            if (fs.existsSync(broadcastStickerPath)) {
                                await sock.sendMessage(jid, { sticker: { url: broadcastStickerPath } });
                            }
                            let finalMessage = {};
                            const formattedCaption = `📢 *BROADCAST*\n\n${broadcastMessageContent}\n\n> Admin ARH`;
                            if (mediaBuffer && mediaType) {
                                finalMessage[mediaType] = mediaBuffer;
                                finalMessage.caption = formattedCaption;
                            } else {
                                finalMessage = { text: formattedCaption };
                            }
                            await sock.sendMessage(jid, finalMessage);
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        } catch (e) {
                            console.error(`[BROADCAST ERROR] Gagal mengirim ke ${jid}:`, e.message);
                        }
                    }
                    await sock.sendMessage(from, { text: `✅ Broadcast selesai!` });
                    reactionEmoji = '📢';
                    break;
                case '/unblock':
                    const ownerJidUnblock = `${OWNER_NUMBER}@s.whatsapp.net`;
                    if (from !== ownerJidUnblock) {
                        await sock.sendMessage(from, { text: `Maaf, perintah ini hanya untuk Owner.` });
                        reactionEmoji = '🔒';
                        return;
                    }
                    const numberToUnblock = args[0];
                    if (!numberToUnblock) {
                        await sock.sendMessage(from, { text: `Gunakan format yang benar:\n\`/unblock <nomor_wa>\`\n\nContoh: \`/unblock 6281234567890\`` });
                        reactionEmoji = '❓';
                        return;
                    }
                    const cleanedNumber = numberToUnblock.replace(/\D/g, '');
                    const targetJid = `${cleanedNumber}@s.whatsapp.net`;
                    if (!blockedUsers.has(targetJid)) {
                        await sock.sendMessage(from, { text: `Nomor *${cleanedNumber}* tidak ditemukan dalam daftar blokir bot.` });
                        reactionEmoji = '🤔';
                        return;
                    }
                    try {
                        await sock.updateBlockStatus(targetJid, "unblock");
                        blockedUsers.delete(targetJid);
                        saveData(BLOCKED_USERS_FILE, Array.from(blockedUsers));
                        await sock.sendMessage(from, { text: `✅ Berhasil! Nomor *${cleanedNumber}* telah dibuka blokirnya.` });
                        await sock.sendMessage(targetJid, { text: `Alhamdulillah, blokir kamu telah dibuka oleh Owner. Sekarang kamu bisa menggunakan bot ini lagi.\n\nMohon gunakan dengan bijak ya. Ketik \`/menu\` untuk memulai.` });
                        reactionEmoji = '✅';
                    } catch (error) {
                        console.error(`[UNBLOCK ERROR] Gagal membuka blokir ${targetJid}:`, error);
                        await sock.sendMessage(from, { text: `Terjadi kesalahan teknis saat mencoba membuka blokir. Silakan cek log konsol.` });
                        reactionEmoji = '❌';
                    }
                    break;
                            case '/infobot':
                try {
                    // --- 1. Siapkan data untuk header kutipan ---
                    const namaDiHeader = "MUADZIN BOT";
                    const deskripsiDiHeader = "Asisten Pengingat Waktu Sholat";
                    // GANTI URL INI dengan link gambar profil bot kamu
                    const FOTO_PROFIL_URL = 'https://i.ibb.co/S4y5XCsT/1000243812-removebg-preview.png';
                    const sourceUrl = "https://github.com/clash-id-repo/file-azan-bot";
                    const idUnikPesan = 'ARH_INFOBOT_QUOTED_FINAL';

                    // --- 2. Siapkan data untuk teks informasi utama ---
                    const latency = Date.now() - (msg.messageTimestamp * 1000);
                    const uptime = formatUptime(botStartTime); // Pastikan fungsi ini ada
                    const infoText = `*🤖 INFORMASI BOT*\n\n` +
                                     `*Nama Bot:* Muadzin Bot\n` +
                                     `*Deskripsi:* Asisten pengingat waktu sholat untuk membantumu mengingat waktu sholat.\n` +
                                     `*Status:* Online\n` +
                                     `*Aktif Sejak:* ${uptime}\n` +
                                     `*Kecepatan Respon:* ${latency} ms\n` +
                                     `*Total Pengguna:* ${totalPersonalUsers} orang\n` +
                                     `*Total Grup:* ${totalGroupUsers} grup\n\n` +
                                     `> © MUADZIN BOT`;

                    // --- 3. Mengirim pesan dengan format gabungan ---
                    await sock.sendMessage(from,
                        {
                            // Pesan utama berisi statistik bot
                            text: infoText
                        },
                        {
                            // Menggunakan format kutipan (quoted reply)
                            quoted: {
                                key: {
                                    remoteJid: from,
                                    id: idUnikPesan,
                                    fromMe: true
                                },
                                // Pesan yang dikutip adalah pesan teks kosong...
                                message: {
                                    "extendedTextMessage": {
                                        "text": "Muadzin Bot - Asisten pengingat waktu sholat otomatis ✅", // Teks ini tidak akan terlihat
                                        // ...tapi ditempeli pratinjau link (AdReply)
                                        "contextInfo": {
                                            "externalAdReply": {
                                                "title": namaDiHeader,
                                                "body": deskripsiDiHeader,
                                                "previewType": "PHOTO",
                                                "renderLargerThumbnail": true,
                                                "showAdAttribution": false,
                                                "thumbnailUrl": FOTO_PROFIL_URL,
                                                "sourceUrl": sourceUrl
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    );
                    reactionEmoji = 'ℹ️';

                } catch (e) {
                    console.error('[INFOBOT QUOTE ERROR]', e);
                    await sock.sendMessage(from, { text: 'Waduh, gagal menampilkan info bot. Cek log konsol.' });
                    reactionEmoji = '❌';
                }
                break;


                case '/kota':
                    await sock.sendMessage(from, { text: KOTA_LIST_TEXT });
                    reactionEmoji = '📖';
                    break;
                case '/panduan':
                    await sock.sendMessage(from, { text: PANDUAN_TEXT });
                    reactionEmoji = '📖';
                    break;
                case '/donasi':
                    try {
                        await sock.sendMessage(from, {
                            image: { url: DONATION_IMAGE_URL },
                            caption: DONASI_TEXT
                        });
                        reactionEmoji = '❤️';
                    } catch (e) {
                        console.error("[ERROR] Gagal mengirim gambar donasi:", e.message);
                        await sock.sendMessage(from, { text: "Maaf, gagal memuat gambar donasi saat ini, silakan ulang kembali. Berikut informasinya:\n\n" + DONASI_TEXT });
                        reactionEmoji = '❌';
                    }
                    break;
                case '/owner':
                    await sock.sendMessage(from, { text: OWNER_TEXT });
                    reactionEmoji = '👨‍💻';
                    break;
                case '/randomayat':
                    await sendDailyVerse(sock, from, false);
                    reactionEmoji = '💫';
                    break;
                    
                        case '/addpremium': {
                if (from !== `${OWNER_NUMBER}@s.whatsapp.net`) return; // Hanya Owner

                const [targetNumber, durationStr] = args;
                const durationData = parseDuration(durationStr);

                if (!targetNumber || !durationData) {
                    await sock.sendMessage(from, { text: "Format salah.\nGunakan: `/addpremium <nomor_wa> <durasi>`\n\n*Contoh Durasi:*\n- `30m` untuk 30 menit\n- `2j` untuk 2 jam\n- `7h` untuk 7 hari" });
                    return;
                }

                const targetJid = `${targetNumber.replace(/\D/g, '')}@s.whatsapp.net`;
                
                if (!users[targetJid]) users[targetJid] = {}; // Inisialisasi jika user baru
                
                users[targetJid].isPremium = true;
                users[targetJid].premiumExpiry = durationData.expiryDate.toISOString();
                users[targetJid].aiMode = 'off'; // Default mode AI adalah off
                
                saveUsers(); // Simpan perubahan

                await sock.sendMessage(from, { text: `✅ Berhasil! Akses premium untuk @${targetJid.split('@')[0]} telah aktif selama *${durationData.durationText}*.`, mentions: [targetJid] });
                await sock.sendMessage(targetJid, { text: `🎉 Alhamdulillah! Akunmu telah di-upgrade ke *Premium* selama *${durationData.durationText}*.\n\nKamu kini bisa menggunakan fitur eksklusif:\n- \`/ai <pertanyaan>\` untuk bertanya apa saja.\n- \`/aimode on\` untuk mengobrol langsung dengan AI.` });
                reactionEmoji = '✅';
                break;
            }

            
            case '/infoidgrup': {
                if (!isGroup) {
                    await sock.sendMessage(from, { text: "Perintah ini hanya bisa dijalankan di dalam grup." });
                    return;
                }
                try {
                    const groupMetadata = await sock.groupMetadata(from);
                    const groupName = groupMetadata.subject;
                    const groupId = from;

                    const infoText = `*✨ Informasi ID Grup Terdeteksi*\n\n- *Nama Grup:*\n${groupName}\n\n- *ID Grup:*\n${groupId}\n\nSalin ID Grup di atas untuk mendaftarkan premium.`;

                    // Kirim info detail ke chat pribadi Owner
                    await sock.sendMessage(`${OWNER_NUMBER}@s.whatsapp.net`, { text: infoText });

                    // Kirim konfirmasi singkat ke grup
                    await sock.sendMessage(from, { text: "✅ Informasi detail grup ini telah dikirim ke chat pribadi Owner." });

                } catch (error) {
                    console.error("Error pada /infogrup:", error);
                    await sock.sendMessage(from, { text: "Gagal mendapatkan info grup. Pastikan bot adalah anggota grup ini." });
                }
                break;
            }

            // PERINTAH 2: Untuk dijalankan di chat pribadi Owner
                        case '/addpremiumgrup':
            case '/premiumgrup': {
                if (from !== `${OWNER_NUMBER}@s.whatsapp.net`) {
                    await sock.sendMessage(from, { text: "Perintah ini hanya bisa digunakan oleh Owner di chat pribadi." });
                    return;
                }

                const [targetGroupId, durationStr] = args;
                const durationData = parseDuration(durationStr);

                if (!targetGroupId || !targetGroupId.endsWith('@g.us') || !durationData) {
                    await sock.sendMessage(from, { text: "Format perintah salah.\nGunakan: `/addpremiumgrup <ID_Grup> <Durasi>`\n\n*Contoh Durasi:*\n- `30m` (30 menit)\n- `2j` (2 jam)\n- `7h` (7 hari)\n\n*Cara mendapatkan ID Grup:*\n1. Masuk ke grup target.\n2. Ketik perintah `/infoidgrup`." });
                    return;
                }

                try {
                    if (!groups[targetGroupId]) groups[targetGroupId] = {}; 
                    
                    groups[targetGroupId].isPremium = true;
                    groups[targetGroupId].premiumExpiry = durationData.expiryDate.toISOString();
                    
                    saveGroups(); // Simpan perubahan

                    const groupMetadata = await sock.groupMetadata(targetGroupId);
                    const groupName = groupMetadata.subject;

                    await sock.sendMessage(from, { text: `✅ Berhasil! Grup *${groupName}* sekarang memiliki akses premium selama *${durationData.durationText}*.` });
                    await sock.sendMessage(targetGroupId, { text: `🎉 Alhamdulillah! Grup ini telah di-upgrade ke *Premium* selama *${durationData.durationText}* oleh Owner.\n\nSemua anggota sekarang bisa menggunakan fitur premium. Selamat menikmati! ✨` });
                } catch (error) {
                    console.error("Error pada /addpremiumgrup:", error);
                    await sock.sendMessage(from, { text: `Gagal memberikan premium. Pastikan ID Grup sudah benar dan bot masih menjadi anggota grup tersebut.` });
                }
                reactionEmoji = '✅';
                break;
            }

            case '/deletepremium':
            case '/delprem': {
                if (from !== `${OWNER_NUMBER}@s.whatsapp.net`) return; // Hanya Owner

                const [targetNumber] = args;
                if (!targetNumber) {
                    await sock.sendMessage(from, { text: "Format salah.\nGunakan: `/deletepremium <nomor_wa>`\nContoh: `/deletepremium 6281234567890`" });
                    return;
                }

                const targetJid = `${targetNumber.replace(/\D/g, '')}@s.whatsapp.net`;

                if (!users[targetJid] || !users[targetJid].isPremium) {
                    await sock.sendMessage(from, { text: `Pengguna @${targetJid.split('@')[0]} tidak memiliki status premium.`, mentions: [targetJid] });
                    return;
                }
                
                delete users[targetJid].isPremium;
                delete users[targetJid].premiumExpiry;
                
                saveUsers(); // Simpan perubahan

                await sock.sendMessage(from, { text: `✅ Berhasil! Akses premium untuk @${targetJid.split('@')[0]} telah dihapus.`, mentions: [targetJid] });
                await sock.sendMessage(targetJid, { text: `😔 Akses premium-mu telah berakhir. Terima kasih telah mencoba fitur premium kami. Kamu tidak bisa lagi menggunakan \`/ai\` dan \`/aimode\`.` });
                reactionEmoji = '🗑️';
                break;
            }

            case '/deletepremiumgroup':
            case '/delpremgrup': {
                if (from !== `${OWNER_NUMBER}@s.whatsapp.net`) {
                    await sock.sendMessage(from, { text: "Perintah ini hanya bisa digunakan oleh Owner di chat pribadi." });
                    return;
                }

                const [targetGroupId] = args;
                if (!targetGroupId || !targetGroupId.endsWith('@g.us')) {
                    await sock.sendMessage(from, { text: "Format perintah salah.\nGunakan: `/deletepremiumgroup <ID_Grup>`\n\n*Cara mendapatkan ID Grup:*\nKetik perintah `/infoidgrup` di grup target." });
                    return;
                }

                if (!groups[targetGroupId] || !groups[targetGroupId].isPremium) {
                    await sock.sendMessage(from, { text: `Grup tersebut tidak memiliki status premium.` });
                    return;
                }

                try {
                    delete groups[targetGroupId].isPremium;
                    delete groups[targetGroupId].premiumExpiry;

                    saveGroups(); // Simpan perubahan

                    const groupMetadata = await sock.groupMetadata(targetGroupId);
                    const groupName = groupMetadata.subject;

                    await sock.sendMessage(from, { text: `✅ Berhasil! Akses premium untuk grup *${groupName}* telah dihapus.` });
                    await sock.sendMessage(targetGroupId, { text: `😔 Akses premium untuk grup ini telah berakhir. Terima kasih telah mencoba fitur premium kami.` });
                } catch (error) {
                    console.error("Error pada /deletepremiumgroup:", error);
                    await sock.sendMessage(from, { text: `Gagal menghapus premium. Pastikan ID Grup sudah benar.` });
                }
                reactionEmoji = '🗑️';
                break;
            }


            case '/ai':
            case '/tanya': {
                const chatId = from; // ID chat (bisa user, bisa grup)
                const senderId = isGroup ? msg.key.participant : from; // ID pengirim asli
                
                // -- LOGIKA PENGECEKAN BARU --
                const groupData = isGroup ? groups[chatId] : null;
                const userData = users[senderId];

                const isGroupPremium = groupData && groupData.isPremium && new Date(groupData.premiumExpiry) > new Date();
                const isUserPremium = userData && userData.isPremium && new Date(userData.premiumExpiry) > new Date();

                // Jika grupnya premium ATAU usernya premium, izinkan.
                if (isGroupPremium || isUserPremium) {
                    // Blok kode ini adalah kode ketika akses diizinkan
                    // (sama seperti yang sudah kamu punya)
                    const question = args.join(' ');
                    if (!question) {
                        await sock.sendMessage(from, { text: "Sertakan pertanyaanmu setelah perintah ya.\nContoh:\n*/ai Jelaskan tentang malam Lailatul Qadar*" });
                        return;
                    }
                    
                    await sock.sendMessage(from, { text: `Oke, aku tanyakan pada AI... 🧠\n\n> *Pertanyaanmu:* ${question}\n\nMohon tunggu sebentar...` });
                    const answer = await askGemini(question);
                    const finalAnswer = `*🤖 Jawaban dari AI untukmu:*\n\n${answer}\n\n`;
                    await sock.sendMessage(from, { text: finalAnswer }, { quoted: msg });
                    reactionEmoji = '✅';

                } else {
                    // Jika grup TIDAK premium DAN user juga TIDAK premium, tolak.
                    await sock.sendMessage(from, { text: `Maaf, fitur ini khusus untuk pengguna atau grup *Premium*.\n\nDengan menjadi premium, kamu bisa bertanya apa saja kepada AI sepuasnya.\n\nHubungi Owner untuk berlangganan ya:\nwa.me/${OWNER_NUMBER}` });
                    reactionEmoji = '🔒';
                    return;
                }
                break;
            }

            // Lakukan hal yang sama untuk /aimode
                        case '/aimode': {
                const chatId = from;
                const senderId = isGroup ? msg.key.participant : from;
                
                const groupData = isGroup ? groups[chatId] : null;
                const userData = users[senderId];

                const isGroupPremium = groupData && groupData.isPremium && new Date(groupData.premiumExpiry) > new Date();
                const isUserPremium = userData && userData.isPremium && new Date(userData.premiumExpiry) > new Date();
                
                if (!isGroupPremium && !isUserPremium) {
                    await sock.sendMessage(from, { text: `Maaf, fitur ini hanya untuk pengguna atau grup *Premium*.` });
                    reactionEmoji = '🔒';
                    return;
                }

                // Perbaikan: Inisialisasi jika user belum ada datanya
                if (!users[senderId]) {
                    users[senderId] = { aiMode: 'off' };
                }

                const mode = args[0]?.toLowerCase();
                if (mode !== 'on' && mode !== 'off') {
                    // PERBAIKAN DI SINI: Gunakan 'users[senderId].aiMode' bukan 'userDataMode.aiMode'
                    const currentMode = users[senderId].aiMode === 'on' ? 'ON (Aktif)' : 'OFF (Nonaktif)';
                    await sock.sendMessage(from, { text: `Mode Obrolan AI kamu saat ini: *${currentMode}*.\n\nGunakan perintah:\n- \`/aimode on\` untuk mengobrol langsung.\n- \`/aimode off\` untuk kembali ke mode perintah biasa.` });
                    return;
                }
                
                // PERBAIKAN DI SINI: Simpan ke 'users[senderId]' bukan 'users[from]'
                users[senderId].aiMode = mode;
                saveUsers();

                if (mode === 'on') {
                    await sock.sendMessage(from, { text: "✅ *Mode Obrolan AI telah diaktifkan.*\n\nSekarang, kamu bisa langsung chat apa saja dan aku akan menjawabnya dengan bantuan AI. Tidak perlu pakai perintah `/ai` lagi." });
                } else {
                    await sock.sendMessage(from, { text: "✅ *Mode Obrolan AI telah dinonaktifkan.*\n\nBot kembali ke mode perintah biasa. Gunakan `/menu` untuk melihat daftar perintah." });
                }
                reactionEmoji = '⚙️';
                break;
            }


                case '/menu':
                case '/help':
                    await sock.sendMessage(from, { text: generateMenuText(userName, totalPersonalUsers, totalGroupUsers, isGroup) });
                    reactionEmoji = '📋';
                    break;
                default:
                // Bagian ini untuk menangani perintah yang tidak dikenali
                if (command.startsWith('/')) {
                    await sock.sendMessage(from, { text: `Maaf, aku belum mengerti perintah *${command}*\n\nCoba ketik */menu* untuk melihat semua hal yang bisa aku bantu ya, *${userName}*.\n\n> © MUADZIN BOT` });
                    reactionEmoji = '❓';
                
                // Bagian ini untuk merespons chat pribadi (bukan grup)
                } else if (!isGroup) {
                    // Kirim stiker sapaan dulu
                    const welcomeStickerPath = './stickers/assalamualaikum.webp';
                    if (fs.existsSync(welcomeStickerPath)) {
                        await sock.sendMessage(from, { sticker: { url: welcomeStickerPath } });
                    }

                    // --- 1. Siapkan data untuk header kutipan (Sama seperti di /infobot) ---
                    const namaDiHeader = "MUADZIN BOT";
                    const deskripsiDiHeader = "Asisten Pengingat Waktu Sholat";
                    // GANTI URL INI jika perlu, dengan link gambar profil bot kamu
                    const FOTO_PROFIL_URL = 'https://i.ibb.co/S4y5XCsT/1000243812-removebg-preview.png';
                    const sourceUrl = "https://github.com/clash-id-repo/file-azan-bot";
                    const idUnikPesan = 'ARH_WELCOME_QUOTED_FINAL';

                    // --- 2. Siapkan teks selamat datang yang dinamis ---
                    const nowInJakarta = DateTime.now().setZone('Asia/Jakarta');
                    const hour = nowInJakarta.hour;
                    let timeOfDayGreeting = "";
                    let timeOfDayEmoji = "";

                    if (hour >= 4 && hour < 10) {
                        timeOfDayGreeting = "Selamat pagi";
                        timeOfDayEmoji = "☀️";
                    } else if (hour >= 10 && hour < 15) {
                        timeOfDayGreeting = "Selamat siang";
                        timeOfDayEmoji = "🌤️";
                    } else if (hour >= 15 && hour < 18) {
                        timeOfDayGreeting = "Selamat sore";
                        timeOfDayEmoji = "🌇";
                    } else {
                        timeOfDayGreeting = "Selamat malam";
                        timeOfDayEmoji = "🌙";
                    }
                    
                    const dynamicWishes = [
                        "Semoga Allah SWT selalu melimpahkan rahmat dan berkah-Nya di setiap langkahmu hari ini. 🤲",
                        "Semoga hari ini menjadi awal yang penuh kemudahan dan keberkahan dari Allah SWT. 🤲",
                        "Semoga Allah SWT mengisi pagimu dengan ketenangan dan hati yang penuh syukur. 🤲",
                        "Semoga Allah SWT melindungimu dari segala mara bahaya dan menjadikan harimu penuh kebaikan. 🤲",
                        "Semoga setiap doamu dikabulkan dan setiap usahamu diberi keberhasilan oleh Allah SWT. 🤲",
                        "Semoga Allah SWT memberimu kekuatan dan kesabaran dalam menjalani hari yang baru ini. 🤲",
                        "Semoga Allah SWT limpahkan kebahagiaan dan kedamaian dalam hatimu hari ini. 🤲",
                        "Semoga segala urusanmu hari ini dimudahkan dan diberkahi oleh Allah SWT. 🤲",
                        "Semoga cahaya iman dan taqwa menerangi langkahmu sepanjang hari ini. 🤲",
                        "Semoga Allah SWT mengampuni dosa-dosamu dan menerima amal ibadahmu hari ini. 🤲",
                        "Semoga hatimu selalu dipenuhi dengan rasa syukur dan cinta kepada Allah SWT. 🤲",
                        "Semoga Allah SWT jadikan pagimu ini sebagai awal kesuksesan dan kebahagiaan. 🤲",
                        "Semoga setiap nafas yang kau hirup hari ini membawa berkah dan rahmat Allah SWT. 🤲",
                        "Semoga Allah SWT menuntunmu pada jalan yang lurus dan penuh keberkahan. 🤲",
                        "Semoga harimu dipenuhi dengan kebaikan yang mengalir dari rahmat Allah SWT. 🤲",
                        "Semoga Allah SWT bukakan pintu rezeki yang halal dan berkah untukmu hari ini. 🤲",
                        "Semoga setiap langkahmu hari ini mendapat ridha dan kasih sayang Allah SWT. 🤲",
                        "Semoga Allah SWT jauhkanmu dari segala kesulitan dan ujian yang berat hari ini. 🤲",
                        "Semoga Allah SWT jadikan pagimu penuh dengan dzikir dan pengingat kebaikan. 🤲",
                        "Semoga keberkahan dan ampunan Allah SWT selalu menyertai setiap aktivitasmu hari ini. 🤲"
                    ];
                    const randomWish = dynamicWishes[Math.floor(Math.random() * dynamicWishes.length)];

                    const welcomeMessageText = `Ahlan wa Sahlan *${userName}*! ${timeOfDayGreeting} ${timeOfDayEmoji}\n\n` +
                                               `Aku Muadzin Bot, asisten pengingat waktu sholat mu ✨\n\n` +
                                               `Untuk memulai, silakan gunakan salah satu perintah berikut:\n` +
                                               `- \`/menu\` - untuk melihat semua fitur yang bisa kamu gunakan\n` +
                                               `- \`/panduan\` - jika kamu memerlukan bantuan atau penjelasan\n\n` +
                                               `_${randomWish}_\n\n` +
                                               `> © MUADZIN BOT`;

                    // --- 3. Mengirim pesan selamat datang DENGAN header profesional ---
                    await sock.sendMessage(from,
                        {
                            text: welcomeMessageText
                        },
                        {
                            quoted: {
                                key: {
                                    remoteJid: from,
                                    id: idUnikPesan,
                                    fromMe: true
                                },
                                message: {
                                    "extendedTextMessage": {
                                        "text": "MUADZIN BOT - Asisten pengingat waktu sholat otomatis ✅", // 
                                        "contextInfo": {
                                            "externalAdReply": {
                                                "title": namaDiHeader,
                                                "body": deskripsiDiHeader,
                                                "previewType": "PHOTO",
                                                "renderLargerThumbnail": true,
                                                "showAdAttribution": false,
                                                "thumbnailUrl": FOTO_PROFIL_URL,
                                                "sourceUrl": sourceUrl
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    );
                    reactionEmoji = '👋';
                }
                break;
            }
        
        } catch (error) {
            console.error("[ERROR] Gagal memproses pesan:", error);
            reactionEmoji = '⚠️';
        } finally {
            if (reactionEmoji) {
                try {
                    await sock.sendMessage(from, {
                        react: {
                            text: reactionEmoji,
                            key: msg.key
                        }
                    });
                } catch (e) {
                    console.error("[REACTION ERROR] Gagal mengirim reaksi akhir:", e);
                }
            }
            if (from) {
                await sock.sendPresenceUpdate('paused', from);
            }
        }
    });
}


// --- Memulai koneksi bot ---
connectToWhatsApp();

// --- KODE AUTO-RESTART ---
const watcher = chokidar.watch(__filename);
watcher.on('change', path => {
    console.log(`[RELOADER] Perubahan terdeteksi pada ${path}. Merestart bot...`);
    watcher.close();
    const newProcess = spawn(process.execPath, process.argv.slice(1), {
        detached: true,
        stdio: 'inherit'
    });
    newProcess.unref();
    process.exit();
});
