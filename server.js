const express = require('express');
const puppeteer = require('puppeteer');
const https = require('https');
const http = require('http');
const app = express();
const PORT = 3000;

const API_SECRET = process.env.API_SECRET || "password_di_test";

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.get('/', (req, res) => {
    res.send('Il servizio PDF è attivo! Usa POST /generate-pdf o POST /linkedin-carousel');
});

// === EXISTING: HTML to PDF ===
app.post('/generate-pdf', async (req, res) => {
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
        const browser = await puppeteer.launch({
            headless: true,
            executablePath: '/usr/bin/google-chrome-stable',
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
        });
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0', timeout: 60000 });
        const pdf = await page.pdf({
            format: 'A4',
            printBackground: true,
            margin: { top: '20px', right: '20px', bottom: '20px', left: '20px' }
        });
        await browser.close();
        console.log("PDF generato con successo.");
        res.set({ 'Content-Type': 'application/pdf', 'Content-Length': pdf.length });
        res.send(pdf);
    } catch (e) {
        console.error("Errore:", e);
        res.status(500).send('Errore interno: ' + e.message);
    }
});

// === NEW: LinkedIn Multi-Image Carousel ===
function downloadImage(url) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        client.get(url, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                return downloadImage(response.headers.location).then(resolve).catch(reject);
            }
            const chunks = [];
            response.on('data', chunk => chunks.push(chunk));
            response.on('end', () => resolve(Buffer.concat(chunks)));
            response.on('error', reject);
        }).on('error', reject);
    });
}

function liRequest(method, url, headers, body) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const options = {
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            method: method,
            headers: headers
        };
        const req = https.request(options, (res) => {
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const raw = Buffer.concat(chunks).toString();
                resolve({
                    statusCode: res.statusCode,
                    headers: res.headers,
                    body: raw
                });
            });
        });
        req.on('error', reject);
        if (body) req.write(body);
        req.end();
    });
}

app.post('/linkedin-carousel', async (req, res) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || authHeader !== `Bearer ${API_SECRET}`) {
        return res.status(401).json({ error: 'Accesso Negato: Token errato' });
    }

    const { image_urls, caption, linkedin_token, person_urn } = req.body;

    if (!image_urls || !Array.isArray(image_urls) || image_urls.length < 2) {
        return res.status(400).json({ error: 'Servono almeno 2 image_urls' });
    }
    if (!caption) return res.status(400).json({ error: 'Manca caption' });
    if (!linkedin_token) return res.status(400).json({ error: 'Manca linkedin_token' });
    if (!person_urn) return res.status(400).json({ error: 'Manca person_urn' });

    const LI_VERSION = '202602';
    const liHeaders = {
        'Authorization': 'Bearer ' + linkedin_token,
        'Content-Type': 'application/json',
        'LinkedIn-Version': LI_VERSION,
        'X-Restli-Protocol-Version': '2.0.0'
    };

    try {
        console.log(`LinkedIn carousel: ${image_urls.length} images`);
        const imageUrns = [];

        for (let i = 0; i < image_urls.length; i++) {
            console.log(`  Image ${i + 1}: downloading...`);
            const imgBuffer = await downloadImage(image_urls[i]);
            console.log(`  Image ${i + 1}: ${imgBuffer.length} bytes downloaded`);

            const initResp = await liRequest('POST',
                'https://api.linkedin.com/rest/images?action=initializeUpload',
                liHeaders,
                JSON.stringify({ initializeUploadRequest: { owner: person_urn } })
            );
            const initData = JSON.parse(initResp.body);
            const uploadUrl = initData.value.uploadUrl;
            const imageUrn = initData.value.image;
            console.log(`  Image ${i + 1}: URN ${imageUrn}`);

            const uploadResp = await liRequest('PUT', uploadUrl, {
                'Authorization': 'Bearer ' + linkedin_token,
                'Content-Type': 'application/octet-stream',
                'Content-Length': imgBuffer.length
            }, imgBuffer);
            console.log(`  Image ${i + 1}: uploaded (${uploadResp.statusCode})`);

            imageUrns.push(imageUrn);
        }

        console.log('  Waiting 5s for processing...');
        await new Promise(r => setTimeout(r, 5000));

        const postBody = JSON.stringify({
            author: person_urn,
            commentary: caption,
            visibility: 'PUBLIC',
            distribution: {
                feedDistribution: 'MAIN_FEED',
                targetEntities: [],
                thirdPartyDistributionChannels: []
            },
            content: {
                multiImage: {
                    images: imageUrns.map(urn => ({ id: urn, altText: 'Carousel image' }))
                }
            },
            lifecycleState: 'PUBLISHED',
            isReshareDisabledByAuthor: false
        });

        const postResp = await liRequest('POST',
            'https://api.linkedin.com/rest/posts',
            liHeaders,
            postBody
        );

        const postUrn = postResp.headers['x-restli-id'] || null;
        console.log(`  Post created: ${postUrn} (${postResp.statusCode})`);

        res.json({
            success: postResp.statusCode === 201,
            post_urn: postUrn,
            images_uploaded: imageUrns.length,
            status_code: postResp.statusCode
        });

    } catch (e) {
        console.error("LinkedIn carousel error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => console.log(`Server avviato sulla porta ${PORT}`));
