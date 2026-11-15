// Cihazları marka bazında yeni nesilden eski nesile sıralayan algoritma

export function getDeviceSortScore(rawName, brand = '') {
    const original = String(rawName || '').trim();
    const lowerOrig = original.toLocaleLowerCase('tr-TR');
    const lowerBrand = String(brand || '').toLocaleLowerCase('tr-TR');

    // 1. Apple Axxxx model kodlarını yakala (örn: A3459, A2759) ve metinden temizle
    const appleCodes = [...original.matchAll(/\bA(\d{4})\b/gi)].map((m) => parseInt(m[1], 10));
    const maxAppleCode = appleCodes.length ? Math.max(...appleCodes) : 0;

    // 2. Ekran boyutu (11", 12.9 vb.) yakala
    let screenSize = 0;
    const screenMatch = lowerOrig.match(/\b(12\.9|13|11|10\.\d|10\.5|9\.7|8\.3|7\.9)\b/);
    if (screenMatch) screenSize = parseFloat(screenMatch[1]);

    // 3. Fabrika SKU / model kodlarını ve ağ etiketlerini temizle
    const cleaned = lowerOrig
        .replace(/📱/g, ' ')
        .replace(/\ba\d{4}\b/gi, ' ')
        .replace(/\bsm-[a-z0-9-]+\b/gi, ' ')
        .replace(/\b(?:cph|rmx|vog|ane|mar|pot|aqm|hey\d?)[-\w]*\b/gi, ' ')
        .replace(/\b[a-z]\d{3,4}[a-z]{0,2}\b/gi, ' ')
        .replace(/\b\d{6,}[a-z0-9]*\b/gi, ' ')
        .replace(/\b[a-z]\d{4,}[a-z0-9]*\b/gi, ' ')
        .replace(/\b(?:4g|5g|lte|nfc)\b/gi, ' ')
        .replace(/\b(?:12\.9|11|10\.9|10\.5|10\.2)\s*(?:inç|inc|inch|")/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    // 4. Varyant / alt model seviyesi (aynı nesil içinde üst model -> alt model)
    let tierScore = 40;
    if (/\bultra\b/.test(cleaned)) tierScore = 90;
    else if (/\bpro\s*max\b/.test(cleaned)) tierScore = 80;
    else if (/\bpro\s*(?:\+|plus)\b/.test(cleaned)) tierScore = 75;
    else if (/\bpro\b/.test(cleaned)) tierScore = 70;
    else if (/\bplus\b|\+/.test(cleaned)) tierScore = 60;
    else if (/\bmax\b/.test(cleaned)) tierScore = 55;
    else if (/\bmini\b/.test(cleaned)) tierScore = 50;
    else if (/\b(?:fe|fan\s*edition)\b/.test(cleaned)) tierScore = 45;
    else if (/\blite\b/.test(cleaned)) tierScore = 30;

    // --- A) iPhone Sıralama Mantığı ---
    if (lowerBrand === 'iphone' || /\biphone\b/.test(cleaned)) {
        const isActualIphone = /\biphone\b/.test(cleaned);
        if (!isActualIphone) {
            return { familyRank: 10, genScore: 0, tierScore, subScore: maxAppleCode };
        }
        let genScore = 0;
        if (/\bse\b/.test(cleaned)) {
            if (/4\.\s*nesil|\b4th\b|\bse\s*4\b|\b2025\b/.test(cleaned)) genScore = 15.5;
            else if (/3\.\s*nesil|\b3rd\b|\bse\s*3\b|\b2022\b/.test(cleaned)) genScore = 13.5;
            else if (/2\.\s*nesil|\b2nd\b|\bse\s*2\b|\b2020\b/.test(cleaned)) genScore = 9.5;
            else genScore = 6.2;
        } else if (/\bxs\s*max\b/.test(cleaned)) {
            genScore = 10.6;
            tierScore = 80;
        } else if (/\bxs\b/.test(cleaned)) {
            genScore = 10.6;
            tierScore = 70;
        } else if (/\bxr\b/.test(cleaned)) {
            genScore = 10.4;
            tierScore = 50;
        } else if (/\biphone\s+x\b/.test(cleaned)) {
            genScore = 10.2;
            tierScore = 60;
        } else {
            const numMatch = cleaned.match(/\biphone\s+(\d{1,2})(s|e|c)?\b/);
            if (numMatch) {
                const baseNum = parseInt(numMatch[1], 10);
                const suffix = numMatch[2] || '';
                genScore = baseNum + (suffix === 's' ? 0.5 : 0);
                if (suffix === 'e' && tierScore === 40) tierScore = 45;
                if (suffix === 'c' && tierScore === 40) tierScore = 30;
            } else if (/\biphone\s+air\b/.test(cleaned)) {
                genScore = 17;
                tierScore = 35;
            }
        }
        return { familyRank: 100, genScore, tierScore, subScore: screenSize };
    }

    // --- B) iPad Sıralama Mantığı ---
    if (lowerBrand === 'ipad' || /\bipad\b|\bair\s*m\d\b|\bair\s*\d\b/.test(cleaned)) {
        let genScore = 0;
        const familyRank = 100;
        const mChip = cleaned.match(/\bm(\d)\b/);
        const genMatch = cleaned.match(/\b(\d{1,2})\s*(?:\.\s*nesil|nesil|th|st|nd|rd)\b/);

        if (/\bpro\b/.test(cleaned)) {
            tierScore = 85;
            if (mChip) genScore = 80 + parseInt(mChip[1], 10) * 4;
            else if (genMatch) {
                const g = parseInt(genMatch[1], 10);
                genScore = screenSize >= 12 ? (72 + g * 2) : (76 + g * 2);
            } else genScore = 75;
        } else if (/\bair\b/.test(cleaned)) {
            tierScore = 70;
            if (mChip) genScore = 80 + parseInt(mChip[1], 10) * 4 - 1;
            else {
                const airNum = cleaned.match(/\bair\s*(\d{1,2})\b/);
                const g = airNum ? parseInt(airNum[1], 10) : (genMatch ? parseInt(genMatch[1], 10) : 1);
                genScore = 65 + g * 3;
            }
        } else if (/\bmini\b/.test(cleaned)) {
            tierScore = 60;
            const miniNum = cleaned.match(/\bmini\s*(\d{1,2})\b/);
            const g = miniNum ? parseInt(miniNum[1], 10) : (genMatch ? parseInt(genMatch[1], 10) : 1);
            genScore = 60 + g * 3;
        } else {
            tierScore = 50;
            const padNum = cleaned.match(/\bipad\s*(\d{1,2})\b/);
            const g = padNum ? parseInt(padNum[1], 10) : (genMatch ? parseInt(genMatch[1], 10) : 1);
            genScore = 55 + g * 1.5;
        }
        return { familyRank, genScore, tierScore, subScore: maxAppleCode || screenSize };
    }

    // --- C) Samsung & Samsung Tablet Sıralama Mantığı ---
    if (lowerBrand.includes('samsung') || /\bgalaxy\b|\bsamsung\b|^s\d{2}\b/.test(cleaned)) {
        let familyRank = 100;
        let genScore = 0;

        const zMatch = cleaned.match(/\bz\s*(?:fold|flip)\s*(\d{1,2})\b/);
        const sMatch = cleaned.match(/\bs(\d{1,2})\b/);
        const noteMatch = cleaned.match(/\bnote\s*(\d{1,2})\b/);
        const aMatch = cleaned.match(/\ba(\d{2,3})(s)?\b/);
        const mMatch = cleaned.match(/\bm(\d{2,3})(s)?\b/);

        if (zMatch) {
            familyRank = 410;
            genScore = 20 + parseInt(zMatch[1], 10);
        } else if (sMatch) {
            familyRank = 400;
            genScore = parseInt(sMatch[1], 10);
        } else if (noteMatch) {
            familyRank = 350;
            genScore = parseInt(noteMatch[1], 10);
        } else if (aMatch) {
            familyRank = 250;
            genScore = parseInt(aMatch[1], 10) + (aMatch[2] === 's' ? 0.5 : 0);
        } else if (mMatch) {
            familyRank = 200;
            genScore = parseInt(mMatch[1], 10) + (mMatch[2] === 's' ? 0.5 : 0);
        } else {
            const anyNum = cleaned.match(/\b(\d{1,3})\b/);
            genScore = anyNum ? parseInt(anyNum[1], 10) : 0;
        }
        return { familyRank, genScore, tierScore, subScore: 0 };
    }

    // --- D) Xiaomi / Redmi / Poco & Diğer Tüm Markalar ---
    let familyRank = 200;
    if (/\bpoco\b/.test(cleaned)) familyRank = 240;
    else if (/\bredmi\b/.test(cleaned)) familyRank = 210;
    else if (/\bmi\b|\bxiaomi\b|^\d{1,2}t\b/.test(cleaned)) familyRank = 280;

    if (/\b\d{1,2}t\s*pro\b/.test(cleaned)) tierScore = 72;
    else if (/\b\d{1,2}t\b/.test(cleaned) && tierScore === 40) tierScore = 65;

    const yearMatch = cleaned.match(/\b(20[1-3]\d)\b/);
    const yearVal = yearMatch ? parseInt(yearMatch[1], 10) : 0;
    const withoutYear = cleaned.replace(/\b20[1-3]\d\b/g, ' ');
    const modelNums = [...withoutYear.matchAll(/\b(\d{1,3})(?:s|t|e|l|c|x)?\b/gi)]
        .map((m) => parseInt(m[1], 10))
        .filter((n) => Number.isFinite(n));

    const genScore = modelNums.length ? modelNums[0] : (yearVal ? yearVal - 2000 : 0);
    return { familyRank, genScore, tierScore, subScore: yearVal };
}

export function compareDevicesByGeneration(nameA, nameB, brand = '') {
    const a = getDeviceSortScore(nameA, brand);
    const b = getDeviceSortScore(nameB, brand);
    if (b.familyRank !== a.familyRank) return b.familyRank - a.familyRank;
    if (b.genScore !== a.genScore) return b.genScore - a.genScore;
    if (b.tierScore !== a.tierScore) return b.tierScore - a.tierScore;
    if (b.subScore !== a.subScore) return b.subScore - a.subScore;
    return String(nameA).localeCompare(String(nameB), 'tr-TR', { numeric: true, sensitivity: 'base' });
}

export function sortDevicesForBrand(brand, deviceList) {
    if (!Array.isArray(deviceList)) return [];
    return [...deviceList].sort((a, b) => compareDevicesByGeneration(a, b, brand));
}
