import type {
  DevicesByBrand,
  FinanceConfig,
  ItemPricePair,
  ServiceGroupsMap,
} from '../types/index.ts';
import { calculatePrice } from './pricing.ts';

export type SearchResultKind = 'device' | 'group' | 'item';

export interface SearchDocument {
  id: string;
  kind: SearchResultKind;
  brand: string;
  device: string;
  group: string;
  quality: string;
  hasPrice: boolean;
  finalPrice: number;
  deviceOrderIndex: number;
  brandNorm: string;
  deviceNorm: string;
  brandDeviceTokens: string[];
  groupNorm: string;
  groupTokens: string[];
  qualityNorm: string;
  qualityTokens: string[];
  allTokens: string[];
  allCompact: string;
}

export interface SearchResultMatch {
  doc: SearchDocument;
  score: number;
  matchedTokens: string[];
}

export interface BuildSearchIndexInput {
  categories: readonly string[];
  devicesMap: DevicesByBrand;
  serviceGroups: ServiceGroupsMap;
  financeConfig: FinanceConfig;
  readItemPrice: (brand: string, device: string, group: string, quality: string) => ItemPricePair;
}

export interface RunCatalogSearchOptions {
  query: string;
  index: readonly SearchDocument[];
  includeUnpriced: boolean;
  activeBrand?: string;
  activeDevice?: string;
  limit?: number;
}

export interface HighlightSegment {
  text: string;
  highlighted: boolean;
}

const TR_CHAR_MAP: Record<string, string> = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
  â: 'a',
  ê: 'e',
  î: 'i',
  ô: 'o',
  û: 'u',
};

const QUERY_SYNONYMS: Record<string, readonly string[][]> = {
  ip: [['iphone']],
  iph: [['iphone']],
  pm: [['pro', 'max']],
  promax: [['pro', 'max']],
  orj: [['orijinal']],
  org: [['orijinal']],
  orjinal: [['orijinal']],
  orginal: [['orijinal']],
  orjnal: [['orijinal']],
  cikma: [['cikma']],
  pil: [['batarya']],
  bat: [['batarya']],
  sarj: [['soket']],
  charge: [['soket']],
  kasa: [['arka', 'kapak']],
  kapak: [['arka', 'kapak']],
  oncam: [['on', 'cam']],
  cam: [['on', 'cam']],
  touch: [['dokunmatik']],
  mikrofon: [['ahize']],
  hoparlor: [['ahize']],
  degisim: [['degisimi']],
  yuksel: [['yukseltilmis']],
};

const TIER_WORDS = new Set([
  'pm',
  'pro',
  'max',
  'plus',
  'ultra',
  'mini',
  'air',
  'fe',
  'lite',
  'pro+',
  'edge',
]);

const QUERY_STOP_WORDS = new Set([
  'fiyat',
  'fiyati',
  'ucret',
  'ucreti',
  'tamir',
  'tamiri',
  'icin',
  'ne',
  'kadar',
  'tl',
]);

export function normalizeSearchText(raw: string): string {
  const trLower = String(raw || '').toLocaleLowerCase('tr-TR');
  let mapped = '';
  for (let i = 0; i < trLower.length; i += 1) {
    const ch = trLower[i];
    mapped += TR_CHAR_MAP[ch] ?? ch;
  }
  return mapped
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function splitDocumentTokens(raw: string): string[] {
  const norm = normalizeSearchText(raw);
  if (!norm) return [];
  const baseTokens = norm.split(' ').filter(Boolean);
  const out: string[] = [];
  const seen = new Set<string>();

  const push = (t: string): void => {
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  };

  for (const tok of baseTokens) {
    push(tok);
    const alphaNumMatch = tok.match(/^([a-z]{2,})(\d+)([a-z]*)$/);
    if (alphaNumMatch) {
      push(alphaNumMatch[1]);
      push(alphaNumMatch[2]);
      if (alphaNumMatch[3]) push(alphaNumMatch[3]);
    }
    const numSuffixMatch = tok.match(/^(\d+)([a-z]+)$/);
    if (numSuffixMatch) {
      push(numSuffixMatch[1]);
      push(numSuffixMatch[2]);
    }
  }
  return out;
}

interface QueryTokenGroup {
  raw: string;
  isNumeric: boolean;
  alternatives: string[][];
}

function isPureNumeric(tok: string): boolean {
  return /^\d+$/.test(tok);
}

function expandSingleToken(tok: string): string[][] {
  const alts: string[][] = [[tok]];

  if (QUERY_SYNONYMS[tok]) {
    for (const seq of QUERY_SYNONYMS[tok]) {
      alts.push([...seq]);
    }
  }

  const numTier = tok.match(/^(\d+)([a-z]+)$/);
  if (numTier && TIER_WORDS.has(numTier[2])) {
    const suffixAlts = numTier[2] === 'pm' ? ['pro', 'max'] : [numTier[2]];
    alts.push([numTier[1], ...suffixAlts]);
  }

  const wordNum = tok.match(/^([a-z]{2,})(\d+)([a-z]*)$/);
  if (wordNum) {
    const brandPart = QUERY_SYNONYMS[wordNum[1]] ? QUERY_SYNONYMS[wordNum[1]][0] : [wordNum[1]];
    const tail = wordNum[3];
    const tailParts = tail
      ? tail === 'pm' || tail === 'promax'
        ? ['pro', 'max']
        : [tail]
      : [];
    alts.push([...brandPart, wordNum[2], ...tailParts]);
  }

  return alts;
}

function buildQueryGroups(query: string): { groups: QueryTokenGroup[]; compactQuery: string } {
  const norm = normalizeSearchText(query);
  if (!norm) return { groups: [], compactQuery: '' };

  const rawTokens = norm.split(' ').filter(Boolean);
  const meaningful = rawTokens.filter((t) => !QUERY_STOP_WORDS.has(t));
  const filteredTokens = meaningful.length > 0 ? meaningful : rawTokens;
  const dedupedTokens: string[] = [];
  const seen = new Set<string>();
  for (const tok of filteredTokens) {
    if (!seen.has(tok)) {
      seen.add(tok);
      dedupedTokens.push(tok);
    }
  }

  const groups: QueryTokenGroup[] = dedupedTokens.map((tok) => ({
    raw: tok,
    isNumeric: isPureNumeric(tok),
    alternatives: expandSingleToken(tok),
  }));

  return {
    groups,
    compactQuery: norm.replace(/\s+/g, ''),
  };
}

export function damerauDistance(a: string, b: string, maxDist: number): number {
  const lenA = a.length;
  const lenB = b.length;
  if (a === b) return 0;
  if (Math.abs(lenA - lenB) > maxDist) return maxDist + 1;
  if (lenA === 0) return lenB;
  if (lenB === 0) return lenA;

  const dp: number[][] = Array.from({ length: lenA + 1 }, () => new Array<number>(lenB + 1).fill(0));
  for (let i = 0; i <= lenA; i += 1) dp[i][0] = i;
  for (let j = 0; j <= lenB; j += 1) dp[0][j] = j;

  for (let i = 1; i <= lenA; i += 1) {
    let rowMin = maxDist + 1;
    for (let j = 1; j <= lenB; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, dp[i - 2][j - 2] + 1);
      }
      dp[i][j] = best;
      if (best < rowMin) rowMin = best;
    }
    if (rowMin > maxDist && i + 1 < lenA) {
      if (rowMin > maxDist + 1) return maxDist + 1;
    }
  }

  return dp[lenA][lenB];
}

function scoreSingleTokenPair(qt: string, ct: string): number {
  if (qt === ct) return 1.0;

  if (isPureNumeric(qt)) {
    if (ct.startsWith(qt) && /^[a-z]/.test(ct.slice(qt.length))) {
      return 0.88;
    }
    return 0;
  }

  if (ct.startsWith(qt)) {
    const lenRatio = qt.length / ct.length;
    return 0.82 + lenRatio * 0.14;
  }

  if (qt.length >= 3 && ct.includes(qt)) {
    return 0.78;
  }

  if (qt.length >= 4 && ct.length >= 3 && qt.startsWith(ct)) {
    return 0.72;
  }

  if (qt.length >= 4 && !isPureNumeric(ct)) {
    const maxDist =
      Math.max(qt.length, ct.length) >= 7 && Math.min(qt.length, ct.length) >= 5 && qt[0] === ct[0]
        ? 2
        : 1;
    const dist = damerauDistance(qt, ct, maxDist);
    if (dist <= 1) return 0.75;
    if (dist === 2 && maxDist === 2) return 0.61;
  }

  return 0;
}

function scoreSequenceAgainstTokens(seq: readonly string[], tokens: readonly string[]): number {
  if (!tokens.length || !seq.length) return 0;
  let total = 0;
  for (const qt of seq) {
    let best = 0;
    for (const ct of tokens) {
      const s = scoreSingleTokenPair(qt, ct);
      if (s > best) best = s;
      if (best === 1.0) break;
    }
    if (best <= 0) return 0;
    total += best;
  }
  return total / seq.length;
}

function scoreGroupAgainstField(group: QueryTokenGroup, fieldTokens: readonly string[]): number {
  let best = 0;
  for (const seq of group.alternatives) {
    const s = scoreSequenceAgainstTokens(seq, fieldTokens);
    if (s > best) best = s;
    if (best >= 0.99) break;
  }
  return best;
}

export function buildSearchIndex(input: BuildSearchIndexInput): SearchDocument[] {
  const { categories, devicesMap, serviceGroups, financeConfig, readItemPrice } = input;
  const docs: SearchDocument[] = [];
  const groupEntries = Object.entries(serviceGroups);
  let deviceOrderIndex = 0;

  for (const brand of categories) {
    const brandNorm = normalizeSearchText(brand);
    const brandTokens = splitDocumentTokens(brand);
    const devices = devicesMap[brand] || [];

    for (const device of devices) {
      const orderIdx = deviceOrderIndex;
      deviceOrderIndex += 1;
      const deviceNorm = normalizeSearchText(device);
      const deviceTokens = splitDocumentTokens(device);
      const brandDeviceTokens = Array.from(new Set([...brandTokens, ...deviceTokens]));
      const baseCompact = `${brandNorm}${deviceNorm}`.replace(/\s+/g, '');

      let deviceHasAnyPrice = false;
      const groupDocsForDevice: SearchDocument[] = [];

      for (const [groupName, qualities] of groupEntries) {
        const groupNorm = normalizeSearchText(groupName);
        const groupTokens = splitDocumentTokens(groupName);
        const groupAllTokens = Array.from(new Set([...brandDeviceTokens, ...groupTokens]));
        const groupCompact = `${baseCompact}${groupNorm.replace(/\s+/g, '')}`;

        let groupHasPrice = false;
        let groupMinPrice = 0;

        for (const qualName of qualities) {
          const pair = readItemPrice(brand, device, groupName, qualName);
          const calc = calculatePrice(
            pair.usd,
            pair.labor,
            financeConfig.rate,
            financeConfig.vatRate,
            financeConfig.roundingMode,
          );
          if (calc.hasPrice) {
            deviceHasAnyPrice = true;
            groupHasPrice = true;
            if (groupMinPrice === 0 || calc.finalPrice < groupMinPrice) {
              groupMinPrice = calc.finalPrice;
            }
          }

          const qualNorm = normalizeSearchText(qualName);
          const qualTokens = splitDocumentTokens(qualName);
          const itemAllTokens = Array.from(new Set([...groupAllTokens, ...qualTokens]));

          docs.push({
            id: `item:${brand}|${device}|${groupName}|${qualName}`,
            kind: 'item',
            brand,
            device,
            group: groupName,
            quality: qualName,
            hasPrice: calc.hasPrice,
            finalPrice: calc.finalPrice,
            deviceOrderIndex: orderIdx,
            brandNorm,
            deviceNorm,
            brandDeviceTokens,
            groupNorm,
            groupTokens,
            qualityNorm: qualNorm,
            qualityTokens: qualTokens,
            allTokens: itemAllTokens,
            allCompact: `${groupCompact}${qualNorm.replace(/\s+/g, '')}`,
          });
        }

        groupDocsForDevice.push({
          id: `group:${brand}|${device}|${groupName}`,
          kind: 'group',
          brand,
          device,
          group: groupName,
          quality: '',
          hasPrice: groupHasPrice,
          finalPrice: groupMinPrice,
          deviceOrderIndex: orderIdx,
          brandNorm,
          deviceNorm,
          brandDeviceTokens,
          groupNorm,
          groupTokens,
          qualityNorm: '',
          qualityTokens: [],
          allTokens: groupAllTokens,
          allCompact: groupCompact,
        });
      }

      docs.push({
        id: `device:${brand}|${device}`,
        kind: 'device',
        brand,
        device,
        group: '',
        quality: '',
        hasPrice: deviceHasAnyPrice,
        finalPrice: 0,
        deviceOrderIndex: orderIdx,
        brandNorm,
        deviceNorm,
        brandDeviceTokens,
        groupNorm: '',
        groupTokens: [],
        qualityNorm: '',
        qualityTokens: [],
        allTokens: brandDeviceTokens,
        allCompact: baseCompact,
      });

      for (const gDoc of groupDocsForDevice) {
        docs.push(gDoc);
      }
    }
  }

  return docs;
}

export function searchCatalog(options: RunCatalogSearchOptions): SearchResultMatch[] {
  const {
    query,
    index,
    includeUnpriced,
    activeBrand = '',
    activeDevice = '',
    limit = 32,
  } = options;

  const { groups, compactQuery } = buildQueryGroups(query);
  if (!groups.length) return [];

  const totalTokens = groups.length;
  const exactMatches: SearchResultMatch[] = [];
  const fallbackMatches: SearchResultMatch[] = [];

  for (const doc of index) {
    if (!includeUnpriced && doc.kind !== 'device' && !doc.hasPrice) {
      continue;
    }

    let matchedCount = 0;
    let tokenScoreSum = 0;
    let deviceHits = 0;
    let groupHits = 0;
    let qualityHits = 0;
    let numericMismatch = false;
    const matchedTokens: string[] = [];

    for (const qGroup of groups) {
      const devScore = scoreGroupAgainstField(qGroup, doc.brandDeviceTokens);
      const grpScore = doc.groupTokens.length ? scoreGroupAgainstField(qGroup, doc.groupTokens) : 0;
      const qualScore = doc.qualityTokens.length ? scoreGroupAgainstField(qGroup, doc.qualityTokens) : 0;

      let priceScore = 0;
      if (
        qGroup.isNumeric &&
        qGroup.raw.length >= 3 &&
        Number(qGroup.raw) >= 100 &&
        doc.kind === 'item' &&
        doc.hasPrice
      ) {
        const roundedPrice = String(Math.round(doc.finalPrice));
        if (roundedPrice === qGroup.raw) {
          priceScore = 0.96;
        } else if (roundedPrice.startsWith(qGroup.raw)) {
          priceScore = 0.78;
        }
      }

      const best = Math.max(devScore, grpScore, qualScore, priceScore);
      if (best <= 0) {
        if (qGroup.isNumeric && qGroup.raw.length <= 4) {
          numericMismatch = true;
          break;
        }
        continue;
      }
      matchedCount += 1;
      tokenScoreSum += best;
      matchedTokens.push(qGroup.raw);
      if (devScore >= best * 0.9 && devScore > 0) deviceHits += 1;
      if (grpScore >= best * 0.9 && grpScore > 0) groupHits += 1;
      if (qualScore >= best * 0.9 && qualScore > 0) qualityHits += 1;
    }

    if (numericMismatch) {
      continue;
    }

    const isExactAll = matchedCount === totalTokens;
    const isGroupFallback =
      !isExactAll &&
      totalTokens >= 4 &&
      matchedCount >= totalTokens - 1 &&
      doc.kind !== 'device' &&
      groupHits > 0 &&
      deviceHits > 0;

    if (!isExactAll && !isGroupFallback) {
      continue;
    }

    const avgQuality = tokenScoreSum / totalTokens;
    let finalScore = (matchedCount / totalTokens) * 100 + avgQuality * 45 + (isExactAll ? 120 : 20);

    if (compactQuery.length >= 4 && doc.allCompact.includes(compactQuery)) {
      finalScore += 28;
    }

    const hasServiceIntent = groupHits > 0 || qualityHits > 0;
    if (!hasServiceIntent) {
      if (doc.kind === 'device') {
        finalScore += 48;
        const coveredDeviceTokens = doc.brandDeviceTokens.length
          ? matchedCount / doc.brandDeviceTokens.length
          : 0;
        finalScore += Math.min(1, coveredDeviceTokens) * 20;
      } else if (doc.kind === 'group') {
        finalScore += 8;
      }
    } else if (qualityHits > 0) {
      if (doc.kind === 'item') {
        finalScore += 54;
        if (groupHits > 0) finalScore += 14;
        if (deviceHits > 0) finalScore += 18;
      } else if (doc.kind === 'group') {
        finalScore += 20;
      }
    } else {
      if (doc.kind === 'group') {
        finalScore += 44;
        if (deviceHits > 0) finalScore += 16;
      } else if (doc.kind === 'item') {
        finalScore += 24;
      }
    }

    if (activeBrand && activeDevice && doc.brand === activeBrand && doc.device === activeDevice) {
      finalScore += 12;
    }

    if (doc.hasPrice) {
      finalScore += 8;
    }

    finalScore -= doc.deviceOrderIndex * 0.001;

    const matchObj: SearchResultMatch = {
      doc,
      score: finalScore,
      matchedTokens,
    };
    if (isExactAll) exactMatches.push(matchObj);
    else fallbackMatches.push(matchObj);
  }

  const resultList = exactMatches.length > 0 ? exactMatches : fallbackMatches;
  resultList.sort((a, b) => b.score - a.score);
  return resultList.slice(0, limit);
}

export function getHighlightSegments(text: string, rawQuery: string): HighlightSegment[] {
  const cleanText = String(text || '');
  const queryNorm = normalizeSearchText(rawQuery);
  if (!queryNorm) return [{ text: cleanText, highlighted: false }];

  const words = Array.from(new Set(queryNorm.split(' ').filter((w) => w.length >= 2)));
  if (!words.length) return [{ text: cleanText, highlighted: false }];

  const chars = Array.from(cleanText);
  const highlightedMask = new Array<boolean>(chars.length).fill(false);

  const foldedOffsetToSrcIdx: number[] = [];
  let joinedFolded = '';
  for (let idx = 0; idx < chars.length; idx += 1) {
    const low = chars[idx].toLocaleLowerCase('tr-TR');
    const rep = TR_CHAR_MAP[low] ?? low;
    const clean = rep.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (let m = 0; m < clean.length; m += 1) {
      joinedFolded += clean[m];
      foldedOffsetToSrcIdx.push(idx);
    }
  }

  for (const qWord of words) {
    let searchFrom = 0;
    while (searchFrom < joinedFolded.length) {
      const idx = joinedFolded.indexOf(qWord, searchFrom);
      if (idx === -1) break;
      for (let k = idx; k < idx + qWord.length && k < foldedOffsetToSrcIdx.length; k += 1) {
        highlightedMask[foldedOffsetToSrcIdx[k]] = true;
      }
      searchFrom = idx + qWord.length;
    }
  }

  const segments: HighlightSegment[] = [];
  let i = 0;
  while (i < chars.length) {
    const isMark = highlightedMask[i];
    let j = i + 1;
    while (j < chars.length && highlightedMask[j] === isMark) {
      j += 1;
    }
    segments.push({ text: chars.slice(i, j).join(''), highlighted: isMark });
    i = j;
  }
  return segments;
}

export function highlightMatchedText(
  text: string,
  rawQuery: string,
  escapeFn: (val: unknown) => string,
): string {
  return getHighlightSegments(text, rawQuery)
    .map((seg) =>
      seg.highlighted ? `<mark class="search-hit-mark">${escapeFn(seg.text)}</mark>` : escapeFn(seg.text),
    )
    .join('');
}
