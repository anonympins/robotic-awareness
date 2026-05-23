import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3000;

// Sert les fichiers statiques (HTML, JS, Modèles 3D)
app.use(express.static(path.join(__dirname, 'public')));

// Sert la bibliothèque G-NEURO (test.js) située à la racine
app.get('/test.js', (req, res) => {
    res.sendFile(path.join(__dirname, 'test.js'));
});

// Route pour récupérer la config du robot
app.get('/config', (req, res) => {
    const configPath = path.join(__dirname, 'robot_config-imported.json');
    if (fs.existsSync(configPath)) {
        res.sendFile(configPath);
    } else {
        console.error(`[Erreur] Fichier de configuration introuvable : ${configPath}`);
        res.status(404).json({ error: "Fichier de configuration manquant" });
    }
});

app.listen(port, () => console.log(`Serveur G-NEURO 3D actif sur http://localhost:${port}`));