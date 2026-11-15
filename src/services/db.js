// Zaman aşımı ve otomatik yeniden deneme (retry) korumalı GitHub Gist veritabanı servisi

import { GITHUB_DB, getGithubToken } from '../config/defaults.js';
import { safeJsonParse } from './pricing.js';

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    if (typeof AbortController === 'undefined') {
        return fetch(url, options);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

async function fetchWithRetry(url, options = {}, maxRetries = 2, timeoutMs = 10000) {
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const res = await fetchWithTimeout(url, options, timeoutMs);
            if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429)) {
                return res;
            }
            lastError = new Error(`HTTP ${res.status}`);
        } catch (err) {
            lastError = err;
        }
        if (attempt < maxRetries) {
            await new Promise((resolve) => setTimeout(resolve, 350 * (attempt + 1)));
        }
    }
    throw lastError || new Error('Ağ isteği başarısız');
}

export async function fetchGithubDb() {
    const token = getGithubToken();
    if (!GITHUB_DB.gistId || !token) return null;

    const res = await fetchWithRetry(
        `https://api.github.com/gists/${GITHUB_DB.gistId}`,
        {
            method: 'GET',
            cache: 'no-store',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json'
            }
        },
        2,
        10000
    );
    if (!res.ok) return null;

    const gist = await res.json();
    const file = gist && gist.files ? gist.files[GITHUB_DB.fileName] : null;
    if (!file) return null;

    let rawText = file.content || '';
    if (file.truncated && file.raw_url) {
        const rawRes = await fetchWithRetry(file.raw_url, { cache: 'no-store' }, 2, 10000);
        if (!rawRes.ok) return null;
        rawText = await rawRes.text();
    }
    return safeJsonParse(rawText, null);
}

export async function pushGithubDb(dbPayload) {
    const token = getGithubToken();
    if (!GITHUB_DB.gistId || !token) return false;

    try {
        const body = JSON.stringify({
            description: 'KONGORU Teknik Servis Veritabanı',
            files: {
                [GITHUB_DB.fileName]: {
                    content: JSON.stringify(dbPayload)
                }
            }
        });
        const fetchOpts = {
            method: 'PATCH',
            headers: {
                Authorization: `Bearer ${token}`,
                Accept: 'application/vnd.github+json',
                'Content-Type': 'application/json'
            },
            body
        };
        if (body.length < 60000) fetchOpts.keepalive = true;

        const res = await fetchWithRetry(
            `https://api.github.com/gists/${GITHUB_DB.gistId}`,
            fetchOpts,
            2,
            12000
        );
        return Boolean(res && res.ok);
    } catch (e) {
        return false;
    }
}
