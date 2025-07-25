# Gunakan image Node.js versi 18 yang lengkap
FROM node:18-bullseye

# Install ffmpeg dan dependencies lainnya di dalam server
RUN apt-get update && apt-get install -y \
    ffmpeg \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Tentukan direktori kerja di dalam container
WORKDIR /usr/src/app

# Salin file package.json dan package-lock.json
COPY package*.json ./

# Install semua dependencies Node.js
RUN npm install --omit=dev

# Salin sisa file proyek bot
COPY . .

# Perintah untuk menjalankan bot saat container dimulai
CMD [ "node", "bot.js" ]
