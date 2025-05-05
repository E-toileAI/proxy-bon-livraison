import express from 'express';
import fetch from 'node-fetch';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import multer from 'multer';

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());

// ✅ Route 1 : API GPT ou Make - envoie JSON { nomProjet, references[] }
app.post('/generate-bdl', async (req, res) => {
  const { nomProjet, references } = req.body;

  try {
    const response = await fetch('https://script.google.com/macros/s/AKfycbwk5dqQ9pHJSeHOfDR1XhjA0ZcFGJCUoNpDFjSDzRtn06h1ngeLDvfMQcnZOR0lpGBQ/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nomProjet, references })
    });

    const data = await response.json();
    res.json({ url: data.url });
  } catch (error) {
    console.error('❌ Erreur API Google Script :', error);
    res.status(500).json({ error: 'Erreur lors de la génération du bon de livraison' });
  }
});

// ✅ Route 2 : envoi de PDF brut (option avancée pour la suite)
app.post('/generate-bdl-from-pdf', upload.single('pdf'), async (req, res) => {
  const nomProjet = req.body.nomProjet || 'Projet sans nom';

  if (!req.file) {
    return res.status(400).json({ error: 'Aucun fichier PDF fourni.' });
  }

  const filePath = req.file.path;

  try {
    const fileBuffer = fs.readFileSync(filePath);
    const pdfDoc = await PDFDocument.load(fileBuffer);

    let fullText = '';
    for (const page of pdfDoc.getPages()) {
      const { items } = await page.getTextContent();
      fullText += items.map(i => i.str).join(' ') + ' ';
    }

    // Parsing rudimentaire (à améliorer selon structure du PDF réel)
    const lignes = fullText.split(/(?=T\w{6})/g);
    const references = [];

    for (const ligne of lignes) {
      const codeMatch = ligne.match(/T\w{6}/);
      const couleurMatch = ligne.match(/20SELCT2|XBLACK|AC0\.\d{3}/);
      const qtesMatch = ligne.match(/\d{1,3}[\.,]\d{1,2}/g);

      if (codeMatch && qtesMatch?.length >= 2) {
        references.push({
          code: codeMatch[0],
          couleur: couleurMatch?.[0] || 'Non trouvée',
          qteCond: Number(qtesMatch[0].replace(',', '.')),
          qteCdCons: Number(qtesMatch[1].replace(',', '.'))
        });
      }
    }

    const response = await fetch('https://script.google.com/macros/s/AKfycbwk5dqQ9pHJSeHOfDR1XhjA0ZcFGJCUoNpDFjSDzRtn06h1ngeLDvfMQcnZOR0lpGBQ/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nomProjet, references })
    });

    const data = await response.json();
    res.json({ url: data.url });
  } catch (error) {
    console.error('❌ Erreur traitement PDF :', error);
    res.status(500).json({ error: 'Erreur lors du traitement du PDF' });
  } finally {
    fs.unlinkSync(filePath);
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ Proxy listening on port ${port}`);
});