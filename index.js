import express from 'express';
import fetch from 'node-fetch';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import multer from 'multer';

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());

// Fonction utilitaire pour extraire le texte de toutes les pages du PDF
async function extractTextFromPdf(filePath) {
  const fileBuffer = fs.readFileSync(filePath);
  const pdfDoc = await PDFDocument.load(fileBuffer);
  let fullText = '';
  for (const page of pdfDoc.getPages()) {
    const { items } = await page.getTextContent();
    fullText += items.map(i => i.str).join(' ') + ' ';
  }
  return fullText;
}

// Fonction pour parser les données utiles (code, couleur, quantités)
function parseReferencesFromText(text) {
  const lignes = text.split(/(?=T\w{6})/g); // Split sur chaque début de code article
  const refs = [];

  for (const ligne of lignes) {
    const codeMatch = ligne.match(/T\w{6}/);
    const couleurMatch = ligne.match(/20SELCT2|XBLACK|AC0\.\d{3}/);
    const qtesMatch = ligne.match(/\d{1,3}[\.,]\d{1,2}/g); // toutes les quantités

    if (codeMatch && qtesMatch?.length >= 2) {
      refs.push({
        code: codeMatch[0],
        couleur: couleurMatch?.[0] || 'Non trouvée',
        qteCond: Number(qtesMatch[0].replace(',', '.')),
        qteCdCons: Number(qtesMatch[1].replace(',', '.'))
      });
    }
  }

  return refs;
}

// Route d'upload + parsing PDF
app.post('/generate-bdl', upload.single('pdf'), async (req, res) => {
  const nomProjet = req.body.nomProjet || 'Projet sans nom';
  const filePath = req.file.path;

  try {
    const text = await extractTextFromPdf(filePath);
    const references = parseReferencesFromText(text);

    const response = await fetch('https://script.google.com/macros/s/AKfycbwk5dqQ9pHJSeHOfDR1XhjA0ZcFGJCUoNpDFjSDzRtn06h1ngeLDvfMQcnZOR0lpGBQ/exec', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nomProjet, references })
    });

    const data = await response.json();
    res.json({ url: data.url });
  } catch (error) {
    console.error('❌ Erreur traitement PDF :', error);
    res.status(500).json({ error: 'Échec du traitement PDF' });
  } finally {
    fs.unlinkSync(filePath); // Nettoyage du fichier temporaire
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`✅ Proxy listening on port ${port}`);
});
