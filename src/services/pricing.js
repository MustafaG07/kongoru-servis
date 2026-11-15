// Fiyat hesaplama, anahtar üretimi ve güvenli biçimlendirme yardımcıları

export function makeSlug(str) {
    return String(str || '').replace(/\s+/g, '-').replace(/[^\w-]/g, '');
}

export function safeJsonParse(raw, fallback) {
    try {
        return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
        return fallback;
    }
}

export function getSlugItemBase(device, group, quality) {
    return `${makeSlug(device)}-${makeSlug(`${group}_${quality}`)}`;
}

export function calculatePrice(usdCost, laborCost, rate, vatRate, roundingMode) {
    const safeUsd = Math.max(0, parseFloat(usdCost) || 0);
    const safeLabor = Math.max(0, parseFloat(laborCost) || 0);
    const safeRate = Math.max(0, parseFloat(rate) || 0);
    const safeVat = Math.max(0, parseFloat(vatRate) || 0);

    const hasPrice = (safeUsd > 0 && safeRate > 0) || safeLabor > 0;
    if (!hasPrice) {
        return {
            hasPrice: false,
            tlPart: 0,
            rawTotal: 0,
            vatAmount: 0,
            withTax: 0,
            finalPrice: 0
        };
    }

    const tlPart = safeUsd * safeRate;
    const rawTotal = tlPart + safeLabor;
    const vatAmount = rawTotal * (safeVat / 100);
    const withTax = Math.round((rawTotal + vatAmount) * 100) / 100;

    let finalPrice = withTax;
    if (roundingMode === 'ceil100') {
        finalPrice = Math.ceil(withTax / 100) * 100;
    } else if (roundingMode === 'ceil10') {
        finalPrice = Math.ceil(withTax / 10) * 10;
    }

    return {
        hasPrice: true,
        tlPart: Math.round(tlPart * 100) / 100,
        rawTotal: Math.round(rawTotal * 100) / 100,
        vatAmount: Math.round(vatAmount * 100) / 100,
        withTax,
        finalPrice
    };
}

export function formatTry(num) {
    return Number(num || 0).toLocaleString('tr-TR', { maximumFractionDigits: 2 }) + ' ₺';
}

export function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
