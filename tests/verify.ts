import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GITHUB_DB, STORAGE_KEYS, getGithubToken } from '../src/config/defaults.ts';
import { generateBackupCsv, parseBackupCsvToCatalog } from '../src/services/csvBackup.ts';
import { fetchGithubDb, pushGithubDb } from '../src/services/db.ts';
import {
  calculatePrice,
  escapeHtml,
  formatTry,
  getSlugItemBase,
  makeSlug,
  readItemPriceFromState,
  updateItemPriceInState,
} from '../src/services/pricing.ts';
import {
  buildSearchIndex,
  getHighlightSegments,
  highlightMatchedText,
  searchCatalog,
} from '../src/services/search.ts';
import { sortDevicesForBrand } from '../src/services/sorting.ts';
import { normalizeDevicesToMap, serializeDevicesToList } from '../src/services/storage.ts';

const ROOT = resolve(fileURLToPath(import.meta.url), '..', '..');

function walkFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

async function runTests(): Promise<void> {
  // 1. Required files & shadcn/ui primitives must exist
  const requiredFiles: readonly string[] = [
    'index.html',
    'package.json',
    'tsconfig.json',
    'vite.config.ts',
    'components.json',
    'src/main.tsx',
    'src/App.tsx',
    'src/styles/index.css',
    'src/types/index.ts',
    'src/config/defaults.ts',
    'src/services/db.ts',
    'src/services/pricing.ts',
    'src/services/sorting.ts',
    'src/services/search.ts',
    'src/services/storage.ts',
    'src/services/csvBackup.ts',
    'src/hooks/useKongoruCatalog.ts',
    'src/hooks/useTheme.ts',
    'src/hooks/useMasonryColumns.ts',
    'src/components/ui/dialog.tsx',
    'src/components/ui/alert-dialog.tsx',
    'src/components/ui/command.tsx',
    'src/components/ui/dropdown-menu.tsx',
    'src/components/ui/popover.tsx',
    'src/components/ui/select.tsx',
    'src/components/ui/tabs.tsx',
    'src/components/ui/card.tsx',
    'src/components/ui/badge.tsx',
    'src/components/ui/input.tsx',
    'src/components/ui/button.tsx',
    'src/components/ui/table.tsx',
    'src/components/ui/tooltip.tsx',
    'src/components/ui/sonner.tsx',
    'src/components/ui/scroll-area.tsx',
    'src/components/ui/sheet.tsx',
    'src/components/ui/progress.tsx',
    'src/components/assistant-ui/elements/error-state.tsx',
    'src/features/workbench/CustomerQuotePanel.tsx',
  ];
  for (const rel of requiredFiles) {
    assert.equal(existsSync(join(ROOT, rel)), true, `Eksik dosya: ${rel}`);
  }

  // 2. V2 storage keys & secret safety
  assert.equal(STORAGE_KEYS.categories, 'kongoruGroupCatList');
  assert.equal(STORAGE_KEYS.groups, 'kongoruServiceGroupsMap');
  assert.equal(STORAGE_KEYS.devices, 'kongoruGroupDeviceList');
  assert.equal(STORAGE_KEYS.prices, 'kongoruGroupPrices');
  assert.equal(STORAGE_KEYS.password, 'kongoruAdminPassword');
  assert.equal(STORAGE_KEYS.theme, 'kongoruV2Theme');
  assert.equal(STORAGE_KEYS.dailyBackups, 'kongoruDailyCsvBackups');
  assert.equal(STORAGE_KEYS.lastBackupHash, 'kongoruLastBackupHash');
  assert.equal(STORAGE_KEYS.pendingSync, 'kongoruPendingCloudSync');
  assert.equal(STORAGE_KEYS.uiMode, 'kongoruUiMode');

  const srcFiles = walkFiles(join(ROOT, 'src'));
  for (const file of srcFiles) {
    const content = readFileSync(file, 'utf8');
    assert.equal(/firebase/i.test(content), false, `Firebase referansı bulundu: ${file}`);
    assert.equal(/gh[po]_[A-Za-z0-9]{10,}/.test(content), false, `Ham GitHub token dizgesi bulundu: ${file}`);
  }
  assert.ok(getGithubToken().startsWith('gho_'), 'getGithubToken() çözümlenemedi');

  // 3. V2 storage normalization & price read/write compatibility
  const normalized = normalizeDevicesToMap([
    { category: 'iPhone', name: 'iPhone 16 Pro' },
    { category: 'Samsung', name: 'S24 Ultra' },
  ]);
  assert.deepEqual(normalized, {
    iPhone: ['iPhone 16 Pro'],
    Samsung: ['S24 Ultra'],
  });
  assert.deepEqual(serializeDevicesToList(['iPhone', 'Samsung'], normalized), [
    { name: 'iPhone 16 Pro', category: 'iPhone' },
    { name: 'S24 Ultra', category: 'Samsung' },
  ]);

  let pricesState = updateItemPriceInState({}, 'iPhone', 'iPhone 16 Pro', 'Ekran', 'Orijinal', '120', '1500');
  assert.deepEqual(readItemPriceFromState(pricesState, 'iPhone', 'iPhone 16 Pro', 'Ekran', 'Orijinal'), {
    usd: '120',
    labor: '1500',
  });
  pricesState = updateItemPriceInState(pricesState, 'iPhone', 'iPhone 16 Pro', 'Ekran', 'Orijinal', '', '');
  assert.deepEqual(readItemPriceFromState(pricesState, 'iPhone', 'iPhone 16 Pro', 'Ekran', 'Orijinal'), {
    usd: '',
    labor: '',
  });

  // 4. Device generation sorting
  const sortedIphones = sortDevicesForBrand('iPhone', [
    'iPhone 11',
    'iPhone 16 Pro Max',
    'iPhone 13',
    'iPhone 16',
    'iPhone 15 Pro',
    'iPhone SE (3. Nesil)',
    'iPhone 17 Pro Max',
  ]);
  assert.deepEqual(sortedIphones, [
    'iPhone 17 Pro Max',
    'iPhone 16 Pro Max',
    'iPhone 16',
    'iPhone 15 Pro',
    'iPhone SE (3. Nesil)',
    'iPhone 13',
    'iPhone 11',
  ]);

  // 5. Pricing calculations & helpers
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

  // 6. Smart global catalog search engine
  const testPrices: Record<string, { usd: string; labor: string }> = {
    'iPhone 17 Pro Max|Ekran Değişimi|Orijinal': { usd: '385', labor: '5000' },
    'iPhone 17 Pro Max|Ahize Değişimi|Filmli Ahize': { usd: '15', labor: '1500' },
    'iPhone 16 Pro|Batarya Değişimi|Orijinal': { usd: '40', labor: '1000' },
  };
  const searchIdx = buildSearchIndex({
    categories: ['iPhone', 'Samsung'],
    devicesMap: {
      iPhone: ['iPhone 18 Pro Max', 'iPhone 17 Pro Max', 'iPhone 16 Pro'],
      Samsung: ['Galaxy S24 Ultra'],
    },
    serviceGroups: {
      'Ekran Değişimi': ['Orijinal', 'Revize'],
      'Ahize Değişimi': ['Ahize', 'Filmli Ahize'],
      'Batarya Değişimi': ['Orijinal', 'A Kalite Yükseltilmiş'],
    },
    financeConfig: { rate: 50, vatRate: 18, roundingMode: 'ceil100' },
    readItemPrice: (_b, d, g, q) => testPrices[`${d}|${g}|${q}`] || { usd: '', labor: '' },
  });

  const typoCombined = searchCatalog({
    query: 'iohone 17 pro max ahize değişimi filmi ahize',
    index: searchIdx,
    includeUnpriced: false,
  });
  assert.ok(typoCombined.length > 0);
  assert.equal(typoCombined[0].doc.kind, 'item');
  assert.equal(typoCombined[0].doc.device, 'iPhone 17 Pro Max');
  assert.equal(typoCombined[0].doc.group, 'Ahize Değişimi');
  assert.equal(typoCombined[0].doc.quality, 'Filmli Ahize');
  assert.equal(typoCombined[0].doc.finalPrice, 2700);

  const shorthandRes = searchCatalog({
    query: '17pm orj ekran',
    index: searchIdx,
    includeUnpriced: false,
  });
  assert.ok(shorthandRes.length > 0);
  assert.equal(shorthandRes[0].doc.device, 'iPhone 17 Pro Max');
  assert.equal(shorthandRes[0].doc.group, 'Ekran Değişimi');
  assert.equal(shorthandRes[0].doc.quality, 'Orijinal');

  const pilRes = searchCatalog({
    query: '16 pro pil degisimi',
    index: searchIdx,
    includeUnpriced: false,
  });
  assert.ok(pilRes.length > 0);
  assert.equal(pilRes[0].doc.device, 'iPhone 16 Pro');
  assert.equal(pilRes[0].doc.group, 'Batarya Değişimi');

  const segments = getHighlightSegments('Ahize Değişimi', 'degisim');
  assert.ok(segments.some((s) => s.highlighted && s.text === 'Değişim'));
  const hl = highlightMatchedText('Ahize Değişimi', 'degisim', escapeHtml);
  assert.ok(hl.includes('<mark class="search-hit-mark">Değişim</mark>'));

  // 7. CSV backup export & restore round-trip
  const sampleCatalog = {
    categories: ['iPhone', 'Samsung'],
    devicesMap: {
      iPhone: ['iPhone 16 Pro', 'iPhone 15'],
      Samsung: ['Galaxy S24 Ultra'],
    },
    serviceGroups: {
      'Ekran Değişimi': ['Orijinal', 'Revize'],
    },
    pricesState: {
      dollarRate: '48.5',
      vatRate: '20',
      roundingMode: 'ceil100',
      'iPhone-16-Pro-Ekran-Deiimi_Orijinal-cost': '180',
      'iPhone-16-Pro-Ekran-Deiimi_Orijinal-labor': '2500',
    },
  };
  const csv = generateBackupCsv(sampleCatalog);
  const parsedCsv = parseBackupCsvToCatalog(csv);
  assert.equal(parsedCsv.ok, true);
  assert.ok(parsedCsv.state);
  assert.deepEqual(parsedCsv.state.categories, ['iPhone', 'Samsung']);
  assert.equal(parsedCsv.state.pricesState.dollarRate, '48.5');
  assert.equal(parsedCsv.state.pricesState.vatRate, '20');
  assert.deepEqual(
    readItemPriceFromState(
      parsedCsv.state.pricesState,
      'iPhone',
      'iPhone 16 Pro',
      'Ekran Değişimi',
      'Orijinal',
    ),
    { usd: '180', labor: '2500' },
  );

  // 8. Network retry & GitHub Gist DB mocked round-trip
  const originalFetch = globalThis.fetch;
  try {
    let getCalls = 0;
    globalThis.fetch = async (url: string | URL | Request, opts?: RequestInit): Promise<Response> => {
      assert.ok(String(url).includes(GITHUB_DB.gistId));
      assert.equal(opts?.method, 'GET');
      getCalls += 1;
      if (getCalls === 1) throw new Error('Network reset');
      if (getCalls === 2) return new Response('Service Unavailable', { status: 503 });
      return new Response(
        JSON.stringify({
          files: {
            [GITHUB_DB.fileName]: {
              truncated: false,
              content: JSON.stringify({ categories: ['iPhone'], devices: { iPhone: ['iPhone 16 Pro'] } }),
            },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    };
    const fetched = await fetchGithubDb();
    assert.equal(getCalls, 3);
    assert.deepEqual(fetched?.categories, ['iPhone']);

    let patchCalls = 0;
    globalThis.fetch = async (_url: string | URL | Request, opts?: RequestInit): Promise<Response> => {
      assert.equal(opts?.method, 'PATCH');
      patchCalls += 1;
      if (patchCalls === 1) return new Response('Bad Gateway', { status: 502 });
      return new Response('{}', { status: 200 });
    };
    const pushed = await pushGithubDb({ categories: ['iPhone'], devices: { iPhone: ['iPhone 16 Pro'] } });
    assert.equal(patchCalls, 2);
    assert.equal(pushed, true);
  } finally {
    globalThis.fetch = originalFetch;
  }

  // 9. Vite dist/ build verification
  const distDir = join(ROOT, 'dist');
  assert.equal(existsSync(distDir), true, 'dist/ klasörü bulunamadı — önce npm run build çalıştırın');
  const distIndexPath = join(distDir, 'index.html');
  assert.equal(existsSync(distIndexPath), true, 'dist/index.html bulunamadı');
  const distHtml = readFileSync(distIndexPath, 'utf8');
  const assetsDir = join(distDir, 'assets');
  assert.equal(existsSync(assetsDir), true, 'dist/assets/ klasörü bulunamadı');
  const assetFiles = readdirSync(assetsDir);
  assert.ok(assetFiles.some((f) => f.endsWith('.js')), 'dist/assets/ içinde .js paketi yok');
  assert.ok(assetFiles.some((f) => f.endsWith('.css')), 'dist/assets/ içinde .css paketi yok');
  assert.ok(distHtml.includes('./assets/'), 'dist HTML göreli ./assets/ bağlantıları içermeli');

  console.log(`KONGORU_V3_VERIFICATIONS_PASSED (srcFiles=${srcFiles.length}, distAssets=${assetFiles.length})`);
}

runTests().catch((err: unknown) => {
  console.error('VERIFICATION_FAILED:', err);
  process.exit(1);
});
