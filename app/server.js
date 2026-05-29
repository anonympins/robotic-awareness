const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const gestures = require('./gestures');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.static(path.join(__dirname, 'public')));

wss.on('connection', (ws) => {
    console.log('Client connecté');

    ws.on('message', (message) => {
        try {
            // Le message reçu est un Buffer contenant les données RGBA
            // Format attendu du message : [width (high), width (low), height (high), height (low), ...pixels]
            const width = message.readUInt16BE(0);
            const height = message.readUInt16BE(2);
            const pixelData = message.slice(4);

            // Traitement via la pipeline dans gestures.js
            const processedBuffer = gestures.processFrame(pixelData, width, height);

            // Renvoi du buffer traité au client
            ws.send(processedBuffer);
        } catch (err) {
            console.error('Erreur de traitement:', err);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Serveur démarré sur http://localhost:${PORT}`);
});