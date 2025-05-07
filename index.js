import express from 'express';
import fetch from 'node-fetch';
import { PDFDocument } from 'pdf-lib';
import fs from 'fs';
import multer from 'multer';

const app = express();
const upload = multer({ dest: 'uploads/' });

app.use(express.json());

// ✅ Route pour traiter les PDF bruts
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
    const references = [];

    // 🔄 Parcourir chaque page
    for (const [index, page] of pdfDoc.getPages().entries()) {
      console.log(`📄 Lecture de la page ${index + 1}`);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map(item => item.str).join(' ');
      fullText += pageText + ' ';
    }

    console.log("📝 Texte extrait : ", fullText);

    // 🧩 Extraction des références
    const lignes = fullText.split(/(?=T[A-Z]*\d{4,6})/g); 
    for (const ligne of lignes) {
      const codeMatch = ligne.match(/T[A-Z]*\d{4,6}/);
      const couleurMatch = ligne.match(/20SELCT2|XBLACK|AC0\.\d{3}|SANS|XGREY|MF|20SELCT2A/);
      const qtesMatch = ligne.match(/\d{1,3}[,.]\d{1,2}/g);

      if (codeMatch && qtesMatch?.length >= 2) {
        // Vérification des quantités : toujours prendre la valeur non-gras (plus petite)
        const qteCond = Number(qtesMatch[0].replace(',', '.'));
        const qteCdCons = Number(qtesMatch[1].replace(',', '.'));

        // Priorité aux valeurs non-gras si plusieurs colonnes numériques
        const finalQteCdCons = qteCond > qteCdCons ? qteCdCons : qteCond;

        references.push({
          code: codeMatch[0],
          couleur: couleurMatch?.[0] || 'Non trouvée',
          qteCond: qteCond,
          qteCdCons: finalQteCdCons
        });
      }
    }

    console.log("✅ Références extraites :", references);

    // 📤 Envoi des données pour la génération du bon de livraison
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
