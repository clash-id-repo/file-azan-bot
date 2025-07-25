const { 
    default: makeWASocket, 
    useMultiFileAuthState,
    isJidGroup,
    DisconnectReason,
    downloadMediaMessage
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs =require('fs');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const schedule = require('node-schedule');
// --- PENAMBAHAN UNTUK AUTO-RESTART ---
const chokidar = require('chokidar');
const { spawn } = require('child_process');

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

// --- INFORMASI PENTING & TEKS MENU ---
const OWNER_NUMBER = process.env.OWNER_NUMBER || '6287897261954'; 
const DONATION_IMAGE_URL = process.env.DONATION_IMAGE_URL || 'https://i.ibb.co/G3xSQWm0/IMG-20250720-034919-943.jpg';

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

    const now = new Date();
    const hour = now.getHours();
    
    // 1. Menentukan sapaan berdasarkan waktu
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

    // 2. Membuat format tanggal lengkap
    const fullDate = new Intl.DateTimeFormat('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        timeZone: 'Asia/Jakarta'
    }).format(now);

    // 3. Menggabungkan sapaan pembuka
    const openingGreeting = isGroup
        ? `Assalamualaikum semuanya! ${timeOfDayGreeting} ${timeOfDayEmoji}`
        : `Assalamualaikum, *${userName}*! ${timeOfDayGreeting} ${timeOfDayEmoji}`;
    
    // Menggunakan doa yang dipilih secara acak
    const openingWish = `Semoga di hari ${fullDate} ini, ${randomWish}`;
    const openingAction = "Berikut adalah daftar perintah yang bisa kamu gunakan:";

    const finalOpening = `${openingGreeting}\n\n${openingWish}\n\n${openingAction}`;

    // 4. Menyiapkan info waktu server
    const serverTime = new Intl.DateTimeFormat('id-ID', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
        timeZone: 'Asia/Jakarta', hour12: false
    }).format(now);
    const timeZoneString = `GMT+07:00 (WIB)`;
    
    // 5. Mengembalikan seluruh teks menu
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
        
        // --- VALIDASI KETAT DIMULAI DI SINI ---

        // Cek 1: Pastikan API memberikan respons sukses.
        if (!response.data || response.data.code !== 200) {
            console.log(`[VALIDASI GAGAL] API tidak merespons dengan baik untuk kota: ${city}`);
            return null; 
        }

        // Cek 2: Pastikan ada objek 'data' dan 'meta' di dalam respons.
        const responseData = response.data.data;
        if (!responseData || !responseData.meta || !responseData.timings) {
            console.log(`[VALIDASI GAGAL] Respons API tidak lengkap untuk kota: ${city}`);
            return null;
        }

        // Cek 3: Pastikan zona waktu adalah zona waktu valid di Indonesia.
        const validTimezones = ['Asia/Jakarta', 'Asia/Pontianak', 'Asia/Makassar', 'Asia/Jayapura'];
        if (!validTimezones.includes(responseData.meta.timezone)) {
            console.log(`[VALIDASI GAGAL] Zona waktu tidak valid (${responseData.meta.timezone}) untuk kota: ${city}`);
            return null;
        }

        // Jika semua Cek lolos, kota dianggap valid.
        return responseData;

    } catch (error) {
        // Jika API mengembalikan error (misal: 404 Not Found untuk kota aneh),
        // blok ini akan menangkapnya dan mengembalikan null.
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
    const now = new Date();
    const prayerOrder = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
    let nextPrayerName = null;
    let nextPrayerTime = null;

    for (const prayerName of prayerOrder) {
        const prayerTimeStr = timings[prayerName];
        if (!prayerTimeStr) continue;
        
        const [hour, minute] = prayerTimeStr.split(':');
        const prayerDate = new Date();
        prayerDate.setHours(parseInt(hour), parseInt(minute), 0, 0);

        if (prayerDate > now) {
            nextPrayerName = prayerName;
            nextPrayerTime = prayerDate;
            break;
        }
    }

    if (!nextPrayerName) {
        nextPrayerName = 'Fajr';
        const [hour, minute] = timings.Fajr.split(':');
        nextPrayerTime = new Date();
        nextPrayerTime.setDate(nextPrayerTime.getDate() + 1);
        nextPrayerTime.setHours(parseInt(hour), parseInt(minute), 0, 0);
    }

    const diff = nextPrayerTime.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

    const translatedPrayerName = PRAYER_NAMES_MAP[nextPrayerName] || nextPrayerName;
    return `⏳ *${hours} jam ${minutes} menit* lagi menuju sholat *${translatedPrayerName}*`;
}

async function sendDailyVerse(sock, jid, isScheduled = false) {
    try {
        if (!isScheduled) {
            await sock.sendMessage(jid, { text: "📖 Tunggu sebentar, sedang mencari ayat untukmu..." });
        }
        const randomAyat = Math.floor(Math.random() * 6236) + 1;
        
        // PERUBAHAN 1: Menambahkan 'en.transliteration' ke dalam panggilan API
        const response = await axios.get(`https://api.alquran.cloud/v1/ayah/${randomAyat}/editions/quran-uthmani,id.indonesian,ar.alafasy,en.transliteration`);
        const data = response.data.data;

        // Mengambil semua data yang kita butuhkan
        const arabicData = data.find(d => d.edition.identifier === 'quran-uthmani');
        const indonesianData = data.find(d => d.edition.identifier === 'id.indonesian');
        const audioData = data.find(d => d.edition.identifier === 'ar.alafasy');
        const transliterationData = data.find(d => d.edition.identifier === 'en.transliteration');

        // Memastikan semua data berhasil didapatkan
        if (!arabicData || !indonesianData || !audioData || !transliterationData) {
             throw new Error("Data dari API tidak lengkap (mungkin transliterasi gagal didapat).");
        }

        const arabicText = arabicData.text;
        const translationText = indonesianData.text;
        const transliterationText = transliterationData.text; // Data baru
        const surahName = arabicData.surah.name;
        const surahNumber = arabicData.surah.number;
        const ayatNumber = arabicData.numberInSurah;
        const audioUrl = audioData.audio;

        // PERUBAHAN 2: Menyusun ulang format pesan untuk menyertakan teks Latin
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
        
        // PERUBAHAN 1: Menambahkan 'en.transliteration' ke dalam panggilan API
        const response = await axios.get(`https://api.alquran.cloud/v1/ayah/${surah}:${ayat}/editions/quran-uthmani,id.indonesian,ar.alafasy,en.transliteration`);
        const data = response.data.data;

        // Mengambil semua data yang kita butuhkan
        const arabicData = data.find(d => d.edition.identifier === 'quran-uthmani');
        const indonesianData = data.find(d => d.edition.identifier === 'id.indonesian');
        const audioData = data.find(d => d.edition.identifier === 'ar.alafasy');
        const transliterationData = data.find(d => d.edition.identifier === 'en.transliteration');

        // Memastikan semua data berhasil didapatkan
        if (!arabicData || !indonesianData || !audioData || !transliterationData) {
             throw new Error("Data Al-Kahfi dari API tidak lengkap.");
        }

        const arabicText = arabicData.text;
        const translationText = indonesianData.text;
        const transliterationText = transliterationData.text; // Data baru
        const audioUrl = audioData.audio;

        // PERUBAHAN 2: Menyusun ulang format pesan untuk menyertakan teks Latin
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
        // Perubahan 1: Ubah 'silent' menjadi 'info' agar kode bisa muncul
        logger: pino({ level: 'info' }), 
        auth: state,
        browser: ['ARHBot', 'Chrome', '18.3.0'],
        syncFullHistory: false,
        // Perubahan 2: Tambahkan baris ini untuk meminta pairing code
        pairingCode: true
    });


    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('group-participants.update', async (update) => {
        const { id, participants, action } = update;
        const myJid = sock.user.id.split(':')[0] + '@s.whatsapp.net';
        
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
        }
    });
    

    sock.ev.on('messages.upsert', async m => {
        const msg = m.messages[0];
        
        if (msg.key && msg.key.remoteJid !== 'status@broadcast') {
            await sock.readMessages([msg.key]);
        }
        
        if (!msg.message || msg.key.fromMe) return;

        const from = msg.key.remoteJid;
        
        try {
            if (blockedUsers.has(from)) return;
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
                }
                return;
            }

            const body = msg.message?.conversation || msg.message?.extendedTextMessage?.text || msg.message?.imageMessage?.caption || msg.message?.videoMessage?.caption || "";
            if (!body && !(msg.message.imageMessage || msg.message.videoMessage)) return;

            const isGroup = isJidGroup(from);
            const userName = msg.pushName || "Kawan";

                        // --- PENANGANAN STATE INTERAKTIF ---
            if (userState[from]) {
                const state = userState[from];
                const userInput = body.trim(); // Contoh input: "kota pekanbaru"

                // --- TAHAP 1: SANITASI INPUT KOTA ---
                let sanitizedCity = userInput.toLowerCase(); // -> "kota pekanbaru"
                const prefixesToRemove = ['kota ', 'kabupaten ', 'kab ', 'kotamadya ', 'kota adm. '];
                
                for (const prefix of prefixesToRemove) {
                    if (sanitizedCity.startsWith(prefix)) {
                        sanitizedCity = sanitizedCity.replace(prefix, '').trim(); // -> "pekanbaru"
                        break;
                    }
                }
                // --- AKHIR TAHAP SANITASI ---

                // Cek jika pengguna mengetik perintah '/kota'
                if (sanitizedCity === '/kota') {
                    await sock.sendMessage(from, { text: KOTA_LIST_TEXT });
                    return; 
                }
                
                // --- TAHAP 2: VALIDASI TERHADAP BANK KOTA ---
                if (!KOTA_VALID.has(sanitizedCity)) {
                    const fallbackMessage = `Maaf, kota *"${userInput}"* tidak kami kenali atau tidak ada dalam daftar di server kami 😔\n\nPastikan ejaan sudah benar dan merupakan kota/kabupaten di Indonesia.\n\nKetik \`/kota\` untuk melihat beberapa contoh kota yang didukung.\n\n> © MUADZIN BOT`;
                    await sock.sendMessage(from, { text: fallbackMessage });
                    return; 
                }
                // --- AKHIR TAHAP VALIDASI ---

                // --- TAHAP 3: FORMATTING NAMA KOTA ---
                // Mengubah "pekanbaru" menjadi "Pekanbaru"
                const finalCityName = sanitizedCity.charAt(0).toUpperCase() + sanitizedCity.slice(1);
                // --- AKHIR TAHAP FORMATTING ---

                await sock.sendMessage(from, { text: `Mencari data untuk *${finalCityName}*...` });
                const validCityData = await fetchPrayerTimes(finalCityName);

                if (validCityData) {
                    const subscriberName = isGroup ? (await sock.groupMetadata(from)).subject : userName;
                    
                    // SIMPAN NAMA KOTA YANG SUDAH BERSIH DAN DIFORMAT
                    subscribers[from] = { city: finalCityName, name: subscriberName };
                    saveData(SUBSCRIBERS_FILE, subscribers);
                    
                    if (state === 'awaiting_city_subscribe') {
                        const successMessage = `✅ Alhamdulillah, langganan pengingat berhasil diaktifkan!\n\n${isGroup ? 'Grup ini' : 'Kamu'} akan menerima pengingat waktu sholat untuk wilayah *${finalCityName}*.\n\nSenang sekali bisa menjadi teman pengingat sholatmu, semoga niat baikmu untuk sholat tepat waktu ini dicatat sebagai amal kebaikan oleh Allah SWT. InsyaAllah, aku akan tepati janji untuk selalu mengingatkanmu 😊🙏\n\n_Jika ingin mengganti lokasi, kamu bisa menggunakan perintah \`/gantilokasi\`_\n\n> © MUADZIN BOT`;
                        await sock.sendMessage(from, { text: successMessage }, { quoted: msg });
                        
                        // --- NOTIFIKASI KE OWNER (SUBSCRIBE) ---
                        try {
                            const totalSubscribers = Object.keys(subscribers).length;
                            const ownerJid = `${OWNER_NUMBER}@s.whatsapp.net`;
                            const notifMessage = `🔔 *LANGGANAN BARU*\n\nAlhamdulillah ada user yang baru saja berlangganan, berikut detail nya:\n\n> 👤 *Nama:* ${subscriberName}\n> 📞 *Nomor:* ${from.split('@')[0]}\n> 🏙️ *Kota:* ${finalCityName}\n> 📊 *Total Pelanggan Saat Ini:* ${totalSubscribers}\n\n> © MUADZIN BOT`;
                            await sock.sendMessage(ownerJid, { text: notifMessage });
                        } catch (e) {
                            console.error("[OWNER NOTIF ERROR] Gagal mengirim notifikasi subscribe ke owner:", e);
                        }
                        // --- AKHIR NOTIFIKASI ---
            
                    } else if (state === 'awaiting_city_change_location') {
                        const successMessage = `✅ Lokasi berhasil diubah! Pengingat sekarang diatur untuk kota *${finalCityName}*.\n\n> © MUADZIN BOT`;
                        await sock.sendMessage(from, { text: successMessage }, { quoted: msg });
                    }
                    
                    await scheduleRemindersForUser(sock, from, finalCityName, subscriberName);
                    delete userState[from];
                } else {
                    await sock.sendMessage(from, { text: `Maaf, Terjadi sedikit kendala saat mengambil data untuk kota *${finalCityName}*. Coba beberapa saat lagi ya.` });
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

            const lowerBody = body.trim().toLowerCase();
            const command = lowerBody.split(' ')[0];
            const args = body.trim().split(' ').slice(1);
            const cityArg = args.join(' ');

            switch (command) {
                case '/aturpengingat':
                    // PERBAIKAN: Cek jika user sudah berlangganan
                    if (subscribers[from]) {
                        await sock.sendMessage(from, { text: `🔔 *Kamu Sudah Berlangganan*\n\nPengingat sudah aktif untuk kota *${subscribers[from].city}*.\n\n- Untuk mengubah lokasi, gunakan perintah \`/gantilokasi\`.\n- Untuk berhenti menerima pengingat, gunakan perintah \`/berhenti\`.\n\n> © MUADZIN BOT` }, { quoted: msg });
                    } else {
                        // PERBAIKAN: Menambahkan saran /kota saat meminta input
                        userState[from] = 'awaiting_city_subscribe';
                        await sock.sendMessage(from, { text: "Silakan ketik nama kota yang kamu inginkan untuk mengatur pengingat waktu Sholat.\n\nContoh: `Pekanbaru`\n\n_Untuk melihat daftar kota yang didukung, ketik */kota*_\n\n> © MUADZIN BOT" }, { quoted: msg });
                    }
                    break;

                case '/gantilokasi':
                    if (!subscribers[from]) {
                        await sock.sendMessage(from, { text: "Maaf, kamu belum berlangganan pengingat.\n\nSilakan atur pengingat dulu dengan perintah `/aturpengingat`.\n\n> © MUADZIN BOT" }, { quoted: msg });
                        return;
                    }
                    // PERBAIKAN: Menambahkan saran /kota saat meminta input
                    userState[from] = 'awaiting_city_change_location';
                    await sock.sendMessage(from, { text: `📍 Lokasi saat ini: *${subscribers[from].city}*.\n\nSilakan ketik nama kota baru untuk mengubah lokasi pengingat.\n\n_Ketik \`/kota\` untuk melihat contoh nama kota._\n\n> © MUADZIN BOT` }, { quoted: msg });
                    break;
                
                                case '/berhenti':
                case '/unsubscribe': // Alias
                    if (subscribers[from]) {
                        // Langkah 1: Ambil data user yang mau berhenti SEBELUM dihapus
                        const unsubscriberData = subscribers[from]; 
                        
                        // Langkah 2: Hapus data dari database
                        delete subscribers[from];
                        saveData(SUBSCRIBERS_FILE, subscribers);
                        
                        // Langkah 3: Batalkan semua jadwal yang berjalan untuk user tersebut
                        if (scheduledJobs[from]) {
                            scheduledJobs[from].forEach(job => job.cancel());
                            delete scheduledJobs[from];
                        }
                        
                        // Langkah 4: Kirim pesan konfirmasi ke user yang berhenti
                        await sock.sendMessage(from, { text: "✅ Langganan berhasil diberhentikan.\n\nTerima kasih banyak telah menjadi bagian dari perjalanan Muadzin Bot.\nSemoga Allah SWT senantiasa memudahkanmu dalam menjaga konsistensi dalam melaksanakan sholat tepat waktu. Jika nanti berubah pikiran, aku akan selalu ada di sini untuk membantu mengingatkanmu kembali. Sampai jumpa lagi! 👋😊\n\n> © MUADZIN BOT" }, { quoted: msg });
                        
                        // Langkah 5: Kirim notifikasi ke owner (sekarang sudah aman)
                        try {
                            const totalSubscribers = Object.keys(subscribers).length;
                            const ownerJid = `${OWNER_NUMBER}@s.whatsapp.net`;
                            // Menggunakan 'unsubscriberData' yang sudah kita simpan di awal
                            const notifMessage = `🔕 *BERHENTI LANGGANAN*\n\nBaru saja ada user yang berhenti langganan, berikut detailnya:\n\n> 👤 *Nama:* ${unsubscriberData.name}\n> 📞 *Nomor:* ${from.split('@')[0]}\n> 🏙️ *Kota Terdaftar:* ${unsubscriberData.city}\n> 📊 *Total Pelanggan Saat Ini:* ${totalSubscribers}\n\n> © MUADZIN BOT`;
                            await sock.sendMessage(ownerJid, { text: notifMessage });
                        } catch (e) {
                            console.error("[OWNER NOTIF ERROR] Gagal mengirim notifikasi unsubscribe ke owner:", e);
                        }
                        
                    } else {
                        await sock.sendMessage(from, { text: "Maaf, kamu belum berlangganan pengingat.\n\nUntuk memulai dan menerima notifikasi waktu sholat, silakan ketik perintah `/aturpengingat`\n\n> © MUADZIN BOT" }, { quoted: msg });
                    }
                    break;

                                                case '/jadwal':
                    const targetCity = cityArg || (subscribers[from] ? subscribers[from].city : null);
                    if (!targetCity) {
                        await sock.sendMessage(from, { text: "Ketikkan nama kota yang ingin kamu cek jadwal nya atau atur pengingat terlebih dahulu.\n\n*Panduan:*\n- Cek jadwal kota lain: `/jadwal Nama Kota`\n- Lihat daftar nama kota: `/kota`\n- Atur jadwal pengingat otomatis: `/aturpengingat`\n\n> © MUADZIN BOT" }, { quoted: msg });
                        return;
                    }

                    // --- PRA-VALIDASI UNTUK /JADWAL ---
                    if (cityArg) {
                        const normalizedCity = cityArg.toLowerCase();
                        if (!KOTA_VALID.has(normalizedCity)) {
                            const fallbackMessage = `Maaf, kota *"${targetCity}"* tidak kami kenali atau tidak ada dalam daftar kota server kami 😔\n\nPastikan ejaan sudah benar dan merupakan kota/kabupaten di Indonesia.\n\nKetik \`/kota\` untuk melihat beberapa contoh kota yang didukung.\n\n> © MUADZIN BOT`;
                            await sock.sendMessage(from, { text: fallbackMessage });
                            return; 
                        }
                    }
                    // --- AKHIR DARI PRA-VALIDASI ---

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
                        
                        // PERUBAHAN DI SINI: Kondisi "if (cityArg)" dihapus
                        scheduleMessage += `\n\n*PANDUAN*\n- Cek jadwal kota lain: \`/jadwal Nama Kota\`\n- Lihat daftar lengkap kota: \`/kota\``;
                        
                        scheduleMessage += `\n\n> © MUADZIN BOT`;
                        await sock.sendMessage(from, { text: scheduleMessage }, { quoted: msg });
                    } else {
                        await sock.sendMessage(from, { text: `Maaf, terjadi kendala saat mengambil data untuk kota *${targetCity}*. Coba periksa lagi ejaannya atau lihat daftar di \`/kota\`\n\n> © MUADZIN BOT` });
                    }
                    break;


                // ... (Sisa case seperti /testnotif, /broadcast, dll tetap sama)
                case '/testnotif':
                    if (!subscribers[from]) {
                        await sock.sendMessage(from, { text: "Kamu atau grup ini harus subscribe dulu untuk menggunakan fitur tes ini. Ketik `/aturpengingat`" });
                        return;
                    }
                    let prayerToTest = args[0]?.toLowerCase();
                    if (prayerToTest === 'subuh') prayerToTest = 'fajr';
                    else if (prayerToTest === 'dzuhur') prayerToTest = 'dhuhr';
                    else if (prayerToTest === 'ashar') prayerToTest = 'asr';
                    
                    const validPrayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
                    if (!prayerToTest || !validPrayers.includes(prayerToTest)) {
                        await sock.sendMessage(from, { text: `Gunakan format: \`/testnotif <nama_sholat>\`\nContoh: \`/testnotif ashar\`\n\nPilihan: subuh, dzuhur, ashar, maghrib, isha` });
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
                    break;
                case '/testdzikir':
                    const ownerJidTest = `${OWNER_NUMBER}@s.whatsapp.net`;
                    if (from !== ownerJidTest) {
                        await sock.sendMessage(from, { text: `Maaf, perintah ini hanya untuk Owner.` });
                        return;
                    }
                    const dzikirType = args[0]?.toLowerCase();
                    if (dzikirType === 'pagi' || dzikirType === 'petang') {
                        await sock.sendMessage(from, { text: `OK, menjalankan tes Dzikir *${dzikirType.toUpperCase()}*...` });
                        await sendDzikir(sock, from, dzikirType);
                    } else {
                        await sock.sendMessage(from, { text: `Gunakan format: \`/testdzikir <pagi/petang>\`\nContoh: \`/testdzikir pagi\`` });
                    }
                    break;
                case '/testalkahfi':
                    const ownerJidKahfi = `${OWNER_NUMBER}@s.whatsapp.net`;
                    if (from !== ownerJidKahfi) {
                        await sock.sendMessage(from, { text: `Maaf, perintah ini hanya untuk Owner.` });
                        return;
                    }
                    await sock.sendMessage(from, { text: `OK, menjalankan tes pengingat Al-Kahfi...` });
                    await sendAlKahfiReminder(sock, from);
                    break;
                                case '/testdoa':
                    await sock.sendMessage(from, { text: "OK, menjalankan tes kirim Doa & Harapan Harian..." });

                    // Memastikan Bank Doa sudah ada dan tidak kosong
                    if (typeof DOA_HARIAN !== 'undefined' && DOA_HARIAN.length > 0) {
                        // Mengambil satu pesan acak dari bank doa
                        const randomWish = DOA_HARIAN[Math.floor(Math.random() * DOA_HARIAN.length)];
                        
                        // Membungkus pesan dengan format yang sama seperti pengiriman terjadwal
                        const messageToSend = `*✨ PESAN KEBAIKAN UNTUKMU ✨*\n\n_${randomWish}_\n\n> © MUADZIN BOT`;

                        // Mengirim pesan tes hanya ke nomor Anda
                        await sock.sendMessage(from, { text: messageToSend });
                    } else {
                        await sock.sendMessage(from, { text: "Maaf, 'Bank Doa' (DOA_HARIAN) sepertinya belum didefinisikan di kodemu." });
                    }
                    break;    
                case '/broadcast':
                    const ownerJid = `${OWNER_NUMBER}@s.whatsapp.net`;
                    if (from !== ownerJid) {
                        await sock.sendMessage(from, { text: `Maaf, perintah ini hanya untuk Owner.` });
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
                    } 
                    else {
                        if (replied && replied.conversation) {
                            broadcastMessageContent = replied.conversation;
                        }
                    }

                    if (!broadcastMessageContent && !mediaBuffer) {
                        await sock.sendMessage(from, { text: `Gunakan format:\n1. \`/broadcast <pesan>\`\n2. Reply pesan teks, lalu ketik \`/broadcast\`\n3. Kirim gambar/video dengan caption \`/broadcast <pesan>\`` });
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
                    break;
                case '/infobot':
                    const latency = Date.now() - (msg.messageTimestamp * 1000);
                    const uptime = formatUptime(botStartTime);
                    const infoText = `*🤖 INFORMASI BOT*\n\n` +
                                     `*Nama Bot:* Muadzin Bot\n` +
                                     `*Deskripsi:* Asisten pengingat waktu sholat untuk membantumu mengingat waktu sholat.\n` +
                                     `*Status:* Online\n` +
                                     `*Aktif Sejak:* ${uptime}\n` +
                                     `*Kecepatan Respon:* ${latency} ms\n` +
                                     `*Total Pengguna:* ${totalPersonalUsers} orang\n` +
                                     `*Total Grup:* ${totalGroupUsers} grup\n\n` +
                                     `> © MUADZIN BOT`;
                    await sock.sendMessage(from, { text: infoText });
                    break;
                case '/kota':
                    await sock.sendMessage(from, { text: KOTA_LIST_TEXT });
                    break;
                case '/panduan':
                    await sock.sendMessage(from, { text: PANDUAN_TEXT });
                    break;
                case '/donasi':
                    try {
                        await sock.sendMessage(from, { 
                            image: { url: DONATION_IMAGE_URL },
                            caption: DONASI_TEXT
                        });
                    } catch (e) {
                        console.error("[ERROR] Gagal mengirim gambar donasi:", e.message);
                        await sock.sendMessage(from, { text: "Maaf, gagal memuat gambar donasi saat ini, silakan ulang kembali. Berikut informasinya:\n\n" + DONASI_TEXT });
                    }
                    break;
                case '/owner':
                    await sock.sendMessage(from, { text: OWNER_TEXT });
                    break;
                case '/randomayat':
                    await sendDailyVerse(sock, from, false);
                    break;
                case '/menu':
                case '/help':
                    await sock.sendMessage(from, { text: generateMenuText(userName, totalPersonalUsers, totalGroupUsers, isGroup) });
                    break;
                default:
                    if (command.startsWith('/')) {
                        await sock.sendMessage(from, { text: `Maaf, aku belum mengerti perintah *${command}*\n\nCoba ketik */menu* untuk melihat semua hal yang bisa aku bantu ya, *${userName}*.\n\n> © MUADZIN BOT` });
                    } else if (!isGroup) {
                        const welcomeStickerPath = './stickers/assalamualaikum.webp';
                        if (fs.existsSync(welcomeStickerPath)) {
                            await sock.sendMessage(from, { sticker: { url: welcomeStickerPath } });
                        }
                        
                        const now = new Date();
    const hour = now.getHours();
                        // 1. Menentukan sapaan berdasarkan waktu
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

// Memilih satu doa secara acak
const randomWish = dynamicWishes[Math.floor(Math.random() * dynamicWishes.length)];

                        const welcomeMessageText = `Ahlan wa Sahlan *${userName}*! ${timeOfDayGreeting} ${timeOfDayEmoji}

Aku Muadzin Bot, asisten pengingat waktu sholat mu ✨

Untuk memulai, silakan gunakan salah satu perintah berikut:  
- \`/menu\` - untuk melihat semua fitur yang bisa kamu gunakan  
- \`/panduan\` - jika kamu memerlukan bantuan atau penjelasan

_${randomWish}_

> © MUADZIN BOT`
;
                        await sock.sendMessage(from, { 
                            text: welcomeMessageText,
                        });
                    }
                    break;
            }

        } catch (error) {
            console.error("[ERROR] Gagal memproses pesan:", error);
        } finally {
            await sock.sendPresenceUpdate('paused', from);
        }
    });

    sock.ev.on('connection.update', async (update) => {
        const { connection, lastDisconnect } = update;
        
        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus:', lastDisconnect.error, ', menyambungkan kembali:', shouldReconnect);
            if (shouldReconnect) {
                connectToWhatsApp();
            }
        } else if (connection === 'open') {
            console.log('Berhasil terhubung ke WhatsApp! Bot siap digunakan.');
            
            // Mengatur semua jadwal setelah koneksi berhasil
            for (const jid in subscribers) {
                const subscriberData = subscribers[jid];
                await scheduleRemindersForUser(sock, jid, subscriberData.city, subscriberData.name || 'Kawan');
            }
            
                        // --- JADWAL BARU: MENGIRIM AYAT ACAK 2X SEHARI (12:40 & 18:40) ---
            // Aturan: Berjalan pada menit ke-40, saat jam 12 dan 18.
            const verseRule = '40 12,18 * * *'; 
            schedule.scheduleJob(verseRule, async () => {
                console.log(`[INFO] Mengirim Random Ayat berkala ke semua pelanggan...`);
                for (const jid in subscribers) {
                    try {
                        // Memanggil fungsi yang sudah ada untuk mengirim ayat
                        await sendDailyVerse(sock, jid, true);
                        // Beri jeda sedikit antar pesan
                        await new Promise(resolve => setTimeout(resolve, 500)); 
                    } catch (e) {
                        console.error(`[RANDOM AYAT ERROR] Gagal mengirim ke ${jid}:`, e.message);
                    }
                }
            });

            
            // --- JADWAL BARU: MENGIRIM DOA & HARAPAN BAIK SETIAP 8 JAM ---
            // Aturan: Berjalan setiap 8 jam 
            const wishRule = '0 9,20 * * *';
            schedule.scheduleJob(wishRule, async () => {
                console.log(`[INFO] Mengirim Doa & Harapan Harian berkala ke semua pelanggan...`);
                
                // Ambil satu pesan random dari bank doa
                const randomWish = DOA_HARIAN[Math.floor(Math.random() * DOA_HARIAN.length)];
                const messageToSend = `*✨ PESAN KEBAIKAN UNTUKMU ✨*\n\n_${randomWish}_\n\n> © MUADZIN BOT`;

                for (const jid in subscribers) {
                    try {
                        await sock.sendMessage(jid, { text: messageToSend });
                        // Beri jeda sedikit antar pesan agar tidak dianggap spam
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
                }
            });

            const alKahfiRule = new schedule.RecurrenceRule();
            alKahfiRule.dayOfWeek = 5; // 5 = Jumat
            alKahfiRule.hour = 8;
            alKahfiRule.minute = 0;
            alKahfiRule.tz = 'Asia/Jakarta';
            schedule.scheduleJob(alKahfiRule, async () => {
                console.log("[INFO] Mengirim pengingat Al-Kahfi ke semua pelanggan...");
                for (const jid in subscribers) {
                    await sendAlKahfiReminder(sock, jid);
                }
            });
        }
    });
}

// Memulai koneksi bot
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
