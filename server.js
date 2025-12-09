const express = require('express');
const puppeteer = require('puppeteer');

const app = express();
const PORT = 3000;

// Leggiamo la password dalle impostazioni di Easypanel
const API_SECRET = process.env.API_SECRET || "password_di_test";

// Aumentiamo il limite per ricevere HTML molto grandi (fino a 50MB)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/', (req, res) => {
    res.send('Il servizio PDF è attivo! Usa POST /generate-pdf per convertire.');
});

app.post('/generate-pdf', async (req, res) => {
    // 1. Controllo Sicurezza (Token)
    const authHeader = req.headers['authorization'];
    if (!authHeader || authHeader !== `Bearer ${API_SECRET}`) {
        return res.status(401).json({ error: 'Accesso Negato: Token errato' });
    }

    const { html } = req.body;
    if (!html) {
        return res.status(400).send('Errore: Manca il codice HTML nel body');
    }

    try {
        console.log("Inizio generazione PDF...");
        
       // 2. Avvio Chrome (impostazioni ottimizzate per Docker)
        const browser = await puppeteer.launch({
            headless: true,
            // QUESTA È LA RIGA CHE MANCAVA:
            executablePath: '/usr/bin/google-chrome-stable', 
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ]
        });

        const page = await browser.newPage();
        
        // 3. Caricamento HTML
        await page.setContent(html, { 
            waitUntil: 'networkidle0', // Aspetta che non ci siano più connessioni di rete (es. immagini caricate)
            timeout: 60000 // Timeout aumentato a 60 secondi
        });

        // 4. Stampa PDF
        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true, // Stampa i colori di sfondo
            margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
        });

        await browser.close();
        console.log("PDF generato con successo.");

        // 5. Invio Risposta
        res.set({
            'Content-Type': 'application/pdf',
            'Content-Length': pdf.length,
        });
        res.send(pdf);

    } catch (e) {
        console.error("Errore:", e);
        res.status(500).send('Errore interno: ' + e.message);
    }
});


app.listen(PORT, () => console.log(`Server PDF avviato sulla porta ${PORT}`));
