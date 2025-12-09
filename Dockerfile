FROM ghcr.io/puppeteer/puppeteer:22.6.0

# --- AGGIUNTA FONDAMENTALE ---
# Diciamo a Puppeteer dove si trova Chrome e di non scaricarne altri
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable
# -----------------------------

USER root
WORKDIR /usr/src/app

COPY package*.json ./

# Usiamo install che è più sicuro qui
RUN npm install

COPY . .

USER pptruser
EXPOSE 3000

CMD ["node", "server.js"]
