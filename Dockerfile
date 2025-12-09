# Usiamo l'immagine ufficiale di Puppeteer che ha già Chrome installato
FROM ghcr.io/puppeteer/puppeteer:22.6.0

# Usiamo l'utente root temporaneamente per configurare le cartelle
USER root

WORKDIR /usr/src/app

# Copiamo i file del progetto
COPY package*.json ./

# Installiamo le dipendenze
RUN npm install

# Copiamo il resto del codice
COPY . .

# Torniamo all'utente sicuro (non root) fornito dall'immagine
USER pptruser

# Esponiamo la porta
EXPOSE 3000

# Avviamo il server

CMD ["node", "server.js"]
