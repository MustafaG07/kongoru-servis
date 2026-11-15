import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sortDevicesForBrand } from '../src/services/sorting.js';
import { calculatePrice, makeSlug, getSlugItemBase, formatTry, escapeHtml } from '../src/services/pricing.js';
import { fetchGithubDb, pushGithubDb } from '../src/services/db.js';
import { GITHUB_DB, getGithubToken } from '../src/config/defaults.js';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');

function walkFiles(dir) {
    const out = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walkFiles(full));
        else out.push(full);
    }
    return out;
}

async function runTests() {
    // 1. Root index.html must stay completely untouched
    const legacyIndexPath = join(ROOT, 'index.html');
    assert.equal(existsSync(legacyIndexPath), true, 'index.html bulunamadı');
    assert.equal(statSync(legacyIndexPath).size, 77055, 'Eski index.html boyutu değişmiş (77055 bayt olmalı)');

    // 2. Modular source files & workflow must exist
    const requiredFiles = [
        'kongoru-v2.html',
        'package.json',
        'vite.config.js',
        '.gitignore',
        '.github/workflows/deploy.yml',
        'src/styles/main.css',
        'src/config/defaults.js',
        'src/services/sorting.js',
        'src/services/pricing.js',
        'src/services/db.js',
        'src/main.js'
    ];
    for (const rel of requiredFiles) {
        assert.equal(existsSync(join(ROOT, rel)), true, `Eksik dosya: ${rel}`);
    }

    // 3. kongoru-v2.html must link Vite modules and bind every inline handler on window
    const v2Html = readFileSync(join(ROOT, 'kongoru-v2.html'), 'utf8');
    assert.equal(/<style>/.test(v2Html), false, 'kongoru-v2.html içinde satır içi <style> kalmamalı');
    assert.equal(v2Html.includes('./src/styles/main.css'), true, 'CSS bağlantısı eksik');
    assert.equal(v2Html.includes('<script type="module" src="./src/main.js"></script>'), true, 'JS modül bağlantısı eksik');
    assert.equal(v2Html.includes('statPricedCount'), false, 'statPricedCount sayaç alanı kaldırılmış olmalı');
    assert.equal(v2Html.includes('Fiyatlı İşlem'), false, 'Fiyatlı İşlem başlığı kaldırılmış olmalı');

    const mainJs = readFileSync(join(ROOT, 'src/main.js'), 'utf8');
    assert.equal(mainJs.includes('counts.priced'), false, 'Sol listede ve kartlarda priced sayaçları gösterilmemeli');
    assert.equal(mainJs.includes('service-card-count'), false, 'Hizmet kartı sayaç rozeti kaldırılmış olmalı');
    const attrRegex = /\bon[a-z]+\s*=\s*["']([^"']+)["']/g;
    const htmlHandlers = new Set();
    for (const sourceText of [v2Html, mainJs]) {
        let attrMatch;
        while ((attrMatch = attrRegex.exec(sourceText)) !== null) {
            const callRegex = /\b([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/g;
            let callMatch;
            while ((callMatch = callRegex.exec(attrMatch[1])) !== null) {
                if (callMatch[1] !== 'if') htmlHandlers.add(callMatch[1]);
            }
        }
    }
    assert.ok(htmlHandlers.size >= 35, `Beklenenden az inline handler bulundu: ${htmlHandlers.size}`);
    const windowAssignMatch = mainJs.match(/Object\.assign\(window,\s*\{([\s\S]*?)\}\s*\)/);
    assert.ok(windowAssignMatch, 'src/main.js içinde Object.assign(window, ...) bulunamadı');
    const exposedNames = new Set(
        windowAssignMatch[1]
            .split(',')
            .map((s) => s.trim().split(':')[0].trim())
            .filter(Boolean)
    );
    for (const fnName of htmlHandlers) {
        assert.equal(exposedNames.has(fnName), true, `HTML handler window üzerinde tanımlı değil: ${fnName}`);
    }

    // 4. Typography & secret-safety checks across HTML and src/
    const css = readFileSync(join(ROOT, 'src/styles/main.css'), 'utf8');
    const weights = [...css.matchAll(/font-weight\s*:\s*([^;}\s]+)/gi)].map((m) => m[1]);
    assert.ok(weights.length > 0, 'main.css içinde font-weight kuralı bulunamadı');
    for (const w of weights) {
        assert.equal(w, '400', `font-weight 400 dışında değer içeriyor: ${w}`);
    }

    const inspectFiles = [join(ROOT, 'kongoru-v2.html'), ...walkFiles(join(ROOT, 'src'))];
    for (const file of inspectFiles) {
        const content = readFileSync(file, 'utf8');
        assert.equal(/firebase/i.test(content), false, `Firebase referansı bulundu: ${file}`);
        assert.equal(/gh[po]_[A-Za-z0-9]{10,}/.test(content), false, `Ham GitHub token dizgesi bulundu: ${file}`);
    }
    assert.ok(getGithubToken().startsWith('gho_'), 'getGithubToken() çözümlenemedi');

    // 5. Device generation sorting tests (newest -> oldest)
    const sortedIphones = sortDevicesForBrand('iPhone', [
        'iPhone 11',
        'iPhone 16 Pro Max',
        'iPhone 13',
        'iPhone 16',
        'iPhone 15 Pro',
        'iPhone SE (3. Nesil)',
        'iPhone 17 Pro Max'
    ]);
    assert.deepEqual(sortedIphones, [
        'iPhone 17 Pro Max',
        'iPhone 16 Pro Max',
        'iPhone 16',
        'iPhone 15 Pro',
        'iPhone SE (3. Nesil)',
        'iPhone 13',
        'iPhone 11'
    ]);

    const sortedSamsungs = sortDevicesForBrand('Samsung', [
        'Galaxy A52',
        'Galaxy S24 Ultra',
        'Galaxy S23',
        'Galaxy S25 Ultra',
        'Galaxy Z Fold 6',
        'Galaxy A55'
    ]);
    assert.deepEqual(sortedSamsungs, [
        'Galaxy Z Fold 6',
        'Galaxy S25 Ultra',
        'Galaxy S24 Ultra',
        'Galaxy S23',
        'Galaxy A55',
        'Galaxy A52'
    ]);

    const sortedIpads = sortDevicesForBrand('iPad', [
        'iPad Air 4 (A2316)',
        'iPad Pro 13 M4 (A2925)',
        'iPad 9. Nesil',
        'iPad Pro 11 M2'
    ]);
    assert.deepEqual(sortedIpads, [
        'iPad Pro 13 M4 (A2925)',
        'iPad Pro 11 M2',
        'iPad Air 4 (A2316)',
        'iPad 9. Nesil'
    ]);

    // 6. Pricing calculations & helpers
    const calcExact = calculatePrice(10, 500, 35, 20, 'ceil10');
    assert.equal(calcExact.hasPrice, true);
    assert.equal(calcExact.tlPart, 350);
    assert.equal(calcExact.rawTotal, 850);
    assert.equal(calcExact.vatAmount, 170);
    assert.equal(calcExact.withTax, 1020);
    assert.equal(calcExact.finalPrice, 1020);

    const calcCeil100 = calculatePrice(10, 500, 35, 20, 'ceil100');
    assert.equal(calcCeil100.finalPrice, 1100);

    const calcEmpty = calculatePrice(0, 0, 35, 20, 'exact');
    assert.equal(calcEmpty.hasPrice, false);
    assert.equal(calcEmpty.finalPrice, 0);

    assert.equal(makeSlug('iPhone 16 Pro Max'), 'iPhone-16-Pro-Max');
    assert.equal(getSlugItemBase('iPhone 16', 'Ekran', 'Orijinal'), 'iPhone-16-Ekran_Orijinal');
    assert.ok(formatTry(1250).endsWith('₺'));
    assert.equal(escapeHtml('<script>"test"</script>'), '&lt;script&gt;&quot;test&quot;&lt;/script&gt;');

    // 7. Network retry & GitHub Gist DB mocked round-trip
    const originalFetch = globalThis.fetch;
    try {
        let getCalls = 0;
        globalThis.fetch = async (url, opts) => {
            assert.ok(String(url).includes(GITHUB_DB.gistId));
            assert.equal(opts.method, 'GET');
            getCalls += 1;
            if (getCalls === 1) throw new Error('Network reset');
            if (getCalls === 2) return new Response('Service Unavailable', { status: 503 });
            return new Response(JSON.stringify({
                files: {
                    [GITHUB_DB.fileName]: {
                        truncated: false,
                        content: JSON.stringify({ categories: ['iPhone'], devices: { iPhone: ['iPhone 16 Pro'] } })
                    }
                }
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        };
        const fetched = await fetchGithubDb();
        assert.equal(getCalls, 3, 'fetchGithubDb başarısız denemelerde retry yapmalı');
        assert.deepEqual(fetched.categories, ['iPhone']);

        let patchCalls = 0;
        globalThis.fetch = async (_url, opts) => {
            assert.equal(opts.method, 'PATCH');
            patchCalls += 1;
            if (patchCalls === 1) return new Response('Bad Gateway', { status: 502 });
            const parsedBody = JSON.parse(opts.body);
            assert.ok(parsedBody.files[GITHUB_DB.fileName].content.includes('iPhone 16 Pro'));
            return new Response('{}', { status: 200 });
        };
        const pushed = await pushGithubDb({ categories: ['iPhone'], devices: { iPhone: ['iPhone 16 Pro'] } });
        assert.equal(patchCalls, 2, 'pushGithubDb 502 sonrasında retry yapmalı');
        assert.equal(pushed, true);
    } finally {
        globalThis.fetch = originalFetch;
    }

    // 8. Vite dist/ build verification
    const distDir = join(ROOT, 'dist');
    assert.equal(existsSync(distDir), true, 'dist/ klasörü bulunamadı — önce npm run build çalıştırın');
    const distV2Path = join(distDir, 'kongoru-v2.html');
    const distIndexPath = join(distDir, 'index.html');
    assert.equal(existsSync(distV2Path), true, 'dist/kongoru-v2.html bulunamadı');
    assert.equal(existsSync(distIndexPath), true, 'dist/index.html bulunamadı');
    assert.equal(readFileSync(distV2Path, 'utf8'), readFileSync(distIndexPath, 'utf8'), 'dist/index.html ve dist/kongoru-v2.html eşleşmeli');

    const distHtml = readFileSync(distV2Path, 'utf8');
    const assetsDir = join(distDir, 'assets');
    assert.equal(existsSync(assetsDir), true, 'dist/assets/ klasörü bulunamadı');
    const assetFiles = readdirSync(assetsDir);
    assert.ok(assetFiles.some((f) => f.endsWith('.js')), 'dist/assets/ içinde .js paketi yok');
    assert.ok(assetFiles.some((f) => f.endsWith('.css')), 'dist/assets/ içinde .css paketi yok');
    assert.ok(distHtml.includes('./assets/'), 'dist HTML göreli ./assets/ bağlantıları içermeli');

    console.log(`ALL_MODULAR_VITE_VERIFICATIONS_PASSED (handlers=${htmlHandlers.size}, distAssets=${assetFiles.length})`);
}

runTests().catch((err) => {
    console.error('VERIFICATION_FAILED:', err);
    process.exit(1);
});
