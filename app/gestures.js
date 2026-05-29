/**
 * Implémentation de la pipeline de traitement d'image
 */

function processFrame(buffer, width, height) {
    const grayscale = new Uint8Array(width * height);
    
    // 1. Conversion en niveaux de gris
    for (let i = 0; i < buffer.length; i += 4) {
        // Formule de luminance : 0.299R + 0.587G + 0.114B
        // On force l'entier pour le remplissage de l'histogramme
        grayscale[i / 4] = Math.floor(0.299 * buffer[i] + 0.587 * buffer[i + 1] + 0.114 * buffer[i + 2]);
    }

    // 2. Calcul du seuil d'Otsu
    const threshold = computeOtsuThreshold(grayscale);

    // 3. Application du seuil binaire et préparation du retour RGBA
    const output = Buffer.alloc(buffer.length);
    for (let i = 0; i < grayscale.length; i++) {
        const val = grayscale[i] > threshold ? 255 : 0;
        const idx = i * 4;
        output[idx] = val;     // R
        output[idx + 1] = val; // G
        output[idx + 2] = val; // B
        output[idx + 3] = 255; // A
    }

    return output;
}

function computeOtsuThreshold(data) {
    const histogram = new Array(256).fill(0);
    for (let i = 0; i < data.length; i++) histogram[data[i]]++;

    const total = data.length;
    let sum = 0;
    let sumB = 0;
    let wB = 0;
    let wF = 0;
    let varMax = 0;
    let threshold = 0;
    let sumAll = 0;

    // Un seul passage pour calculer la somme totale
    for (let i = 0; i < 256; i++) sumAll += i * histogram[i];

    for (let i = 0; i < 255; i++) {
        wB += histogram[i];
        if (wB === 0) continue;
        wF = total - wB;
        if (wF === 0) break;

        sumB += i * histogram[i];
        let mB = sumB / wB;
        let mF = (sumAll - sumB) / wF;

        let varBetween = wB * wF * Math.pow(mB - mF, 2);
        if (varBetween > varMax) {
            varMax = varBetween;
            threshold = i;
        }
    }

    // AMÉLIORATION : Gestion des environnements sombres
    // Si la variance est quasi nulle, Otsu échoue.
    if (varMax < 0.1) {
        const avg = Math.floor(sumAll / total);
        // Si c'est sombre, on met un seuil très bas pour essayer de voir quelque chose
        // Sinon on prend la moyenne
        return avg > 0 ? avg : 10;
    }

    return threshold;
}

module.exports = { processFrame };