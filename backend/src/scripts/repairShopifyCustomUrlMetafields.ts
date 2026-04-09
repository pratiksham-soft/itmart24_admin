import "../config/env";
import fs from "fs";
import path from "path";
import axios, { AxiosResponse } from "axios";
import { execFile } from "child_process";
import { promisify } from "util";
import { setProductMetafields } from "../services/shopifyMetafields";

const EXPORTS_DIR = path.join(__dirname, "../../exports");
const APPLY_CHANGES = process.argv.includes("--apply");
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith("--limit="));
const REPORT_ARG = process.argv.find((arg) => arg.startsWith("--report="));
const CONCURRENCY_ARG = process.argv.find((arg) =>
  arg.startsWith("--concurrency=")
);
const PRODUCT_LIMIT = LIMIT_ARG ? Number(LIMIT_ARG.split("=")[1]) : null;
const WORKER_CONCURRENCY = CONCURRENCY_ARG
  ? Math.max(1, Number(CONCURRENCY_ARG.split("=")[1]) || 1)
  : 3;
const execFileAsync = promisify(execFile);

const REQUEST_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
  Accept:
    "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
};

const GENERIC_TOKENS = new Set([
  "ai",
  "app",
  "apps",
  "tool",
  "tools",
  "platform",
  "software",
  "service",
  "services",
  "system",
  "systems",
  "solution",
  "solutions",
  "suite",
  "cloud",
  "online",
  "digital",
  "official",
]);

const EXCLUDED_SEARCH_DOMAINS = new Set([
  "bing.com",
  "duckduckgo.com",
  "html.duckduckgo.com",
  "facebook.com",
  "instagram.com",
  "linkedin.com",
  "youtube.com",
  "youtu.be",
  "x.com",
  "twitter.com",
  "pinterest.com",
  "reddit.com",
  "tiktok.com",
  "amazon.com",
  "aws.amazon.com",
  "g2.com",
  "capterra.com",
  "sourceforge.net",
  "trustpilot.com",
  "wikipedia.org",
]);

type ReportJson = {
  generatedAt?: string;
  rows?: ReportRow[];
};

type ReportRow = {
  productId: number;
  graphqlId: string;
  title: string;
  vendor?: string;
  metafieldUrl?: string | null;
  normalizedMetafieldUrl?: string | null;
  urlStatus?: "working" | "unreachable";
  finalUrl?: string | null;
  officialWebsiteAssessment?:
    | "likely_official_website"
    | "shopify_storefront_url"
    | "social_or_marketplace_url"
    | "invalid_url"
    | "unclear";
  landingType?: "home_page" | "product_page" | "other_page" | "unreachable";
};

type SearchResult = {
  title: string;
  snippet: string;
  url: string;
  domain: string;
};

type ProbeResult = {
  requestedUrl: string;
  finalUrl: string;
  finalDomain: string;
  httpStatus: number | null;
  pageTitle: string;
  heading: string;
  landingType: "home_page" | "product_page" | "other_page" | "unreachable";
  reachable: boolean;
  titleMatches: number;
  vendorMatches: number;
  pathMatches: number;
};

type ResolvedUrl = {
  chosenUrl: string;
  officialDomain: string;
  sourceMethod:
    | "existing_homepage"
    | "existing_domain_homepage"
    | "site_search_product_page"
    | "web_search_product_page"
    | "site_search_homepage"
    | "web_search_homepage"
    | "fallback_homepage"
    | "keep_current";
  selectionReason: string;
  chosenProbe: ProbeResult | null;
};

type RepairRow = {
  productId: number;
  graphqlId: string;
  title: string;
  vendor: string;
  oldUrl: string | null;
  newUrl: string | null;
  changed: boolean;
  sourceMethod: ResolvedUrl["sourceMethod"] | "unresolved";
  officialDomain: string;
  urlStatusBefore: string;
  assessmentBefore: string;
  landingTypeBefore: string;
  chosenLandingType: string;
  chosenHttpStatus: number | null;
  applied: boolean;
  applyError: string | null;
  selectionReason: string;
};

const normalizeWhitespace = (value: string) =>
  value.replace(/\s+/g, " ").trim();

const csvEscape = (value: string | number | boolean | null | undefined) => {
  const stringValue =
    value === null || value === undefined ? "" : String(value);
  return `"${stringValue.replace(/"/g, '""')}"`;
};

const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

const normalizeKey = (value: string | null | undefined) =>
  typeof value === "string"
    ? normalizeWhitespace(value)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
    : "";

const tokenize = (value: string | null | undefined) =>
  normalizeKey(value)
    .split(" ")
    .filter((token) => token.length >= 3 && !GENERIC_TOKENS.has(token));

const toUniqueList = (values: string[]) => {
  const seen = new Set<string>();
  const result: string[] = [];

  values.forEach((value) => {
    const normalized = normalizeKey(value);
    if (!normalized || seen.has(normalized)) {
      return;
    }

    seen.add(normalized);
    result.push(normalizeWhitespace(value));
  });

  return result;
};

const stripHtml = (value: string) =>
  normalizeWhitespace(
    value
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
  );

const sanitizeUrl = (value: string) => {
  try {
    const parsed = new URL(value.trim());
    [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "fbclid",
      "gclid",
      "ref",
      "ref_src",
      "mc_cid",
      "mc_eid",
      "msockid",
    ].forEach((key) => parsed.searchParams.delete(key));
    const search = parsed.searchParams.toString();
    return `${parsed.origin}${parsed.pathname}${search ? `?${search}` : ""}`;
  } catch {
    return value.trim();
  }
};

const isLikelyHttpUrl = (value: string | null | undefined) => {
  if (!value) {
    return false;
  }

  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
};

const getHostname = (value: string | null | undefined) => {
  if (!value) {
    return "";
  }

  try {
    return new URL(value).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

const getPathname = (value: string | null | undefined) => {
  if (!value) {
    return "";
  }

  try {
    return new URL(value).pathname || "/";
  } catch {
    return "";
  }
};

const areRelatedDomains = (left: string, right: string) =>
  Boolean(
    left &&
      right &&
      (left === right ||
        left.endsWith(`.${right}`) ||
        right.endsWith(`.${left}`))
  );

const isHomePagePath = (pathname: string) => {
  const normalized = (pathname || "/").trim().toLowerCase();
  return (
    normalized === "/" ||
    normalized === "" ||
    normalized === "/home" ||
    normalized === "/index.html" ||
    normalized === "/index.htm"
  );
};

const countMatches = (tokens: string[], haystack: string) =>
  tokens.filter((token) => haystack.includes(token)).length;

const domainLooksRelevant = (domain: string, row: ReportRow) => {
  if (!domain) {
    return false;
  }

  const spaced = normalizeKey(domain.replace(/[.-]+/g, " "));
  const compact = domain.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const titleTokens = tokenize(extractCoreProductName(row.title));
  const vendorTokens = tokenize(row.vendor);

  return [...titleTokens, ...vendorTokens].some(
    (token) => spaced.includes(token) || compact.includes(token)
  );
};

const buildDomainGuesses = (row: ReportRow) => {
  const rawNames = [
    extractCoreProductName(row.title),
    row.vendor ?? "",
  ];
  const names = toUniqueList(
    rawNames
      .map((value) => value.toLowerCase().replace(/[^a-z0-9]+/g, ""))
      .filter((value) => value.length >= 4)
  ).slice(0, 3);

  const guesses: string[] = [];
  const tlds = [".com", ".ai", ".io", ".app", ".dev", ".studio"];
  names.forEach((name) => {
    tlds.forEach((tld) => {
      guesses.push(`https://${name}${tld}/`);
    });
  });

  return guesses;
};

const extractCoreProductName = (value: string) => {
  const trimmed = normalizeWhitespace(value);
  const candidates = [
    trimmed.split(":")[0],
    trimmed.split("(")[0],
    trimmed.split(" - ")[0],
    trimmed.replace(/\s+by\s+[^()]+$/i, ""),
  ]
    .map((item) =>
      normalizeWhitespace(item).replace(/\s+by\s+[A-Za-z0-9 .&-]+$/i, "")
    )
    .filter((item) => item.length >= 3);

  return candidates.sort((left, right) => left.length - right.length)[0] ?? trimmed;
};

const buildSearchNameVariants = (value: string) =>
  toUniqueList(
    [
      extractCoreProductName(value),
      normalizeWhitespace(value).split(":")[0] ?? extractCoreProductName(value),
      extractCoreProductName(value).replace(/[()]/g, " "),
      extractCoreProductName(value).replace(/[^\p{L}\p{N}\s.+-]+/gu, " "),
    ]
      .map((item) => normalizeWhitespace(item))
      .filter((item) => item.length >= 3)
  ).slice(0, 4);

const decodeDuckDuckGoUrl = (href: string) => {
  const directMatch = href.match(/uddg=([^&]+)/i);
  if (directMatch?.[1]) {
    return decodeURIComponent(directMatch[1]);
  }

  if (href.startsWith("http://") || href.startsWith("https://")) {
    return href;
  }

  return "";
};

const decodeBingUrl = (href: string) => {
  if (!href) {
    return "";
  }

  const normalizedHref = href.startsWith("/") ? `https://www.bing.com${href}` : href;
  if (normalizedHref.startsWith("http://") || normalizedHref.startsWith("https://")) {
    const encodedMatch = normalizedHref.match(/[?&]u=([^&]+)/i);
    const encoded = encodedMatch?.[1] ? decodeURIComponent(encodedMatch[1]) : "";

    if (encoded.startsWith("a1")) {
      try {
        return sanitizeUrl(Buffer.from(encoded.slice(2), "base64").toString("utf8"));
      } catch {
        return sanitizeUrl(normalizedHref);
      }
    }

    return sanitizeUrl(normalizedHref);
  }

  return "";
};

const normalizeSearchResults = (results: SearchResult[]) =>
  results.filter(
    (result) =>
      result.url &&
      result.domain &&
      !EXCLUDED_SEARCH_DOMAINS.has(result.domain)
  );

const isRetryableError = (error: any) => {
  const status = error?.response?.status;
  const message =
    typeof error?.message === "string"
      ? error.message.toLowerCase()
      : "";

  if (status === 429 || status === 502 || status === 503 || status === 504) {
    return true;
  }

  return (
    message.includes("timeout") ||
    message.includes("socket hang up") ||
    message.includes("econnreset") ||
    message.includes("econnaborted") ||
    message.includes("throttled")
  );
};

const withRetries = async <T>(
  label: string,
  fn: () => Promise<T>,
  maxAttempts = 3
): Promise<T> => {
  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;

      if (!isRetryableError(error) || attempt === maxAttempts) {
        throw error;
      }

      const delayMs = attempt * 1500;
      console.warn(
        `[retry] ${label} failed on attempt ${attempt}/${maxAttempts}. Retrying in ${delayMs}ms...`
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
};

const fetchHtmlViaPowerShell = async (url: string) => {
  const escapedUrl = url.replace(/'/g, "''");
  const command =
    `$ProgressPreference='SilentlyContinue';` +
    `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;` +
    `$r = Invoke-WebRequest -UseBasicParsing -Uri '${escapedUrl}';` +
    `Write-Output $r.Content`;
  const powershellPath =
    process.env.ComSpec?.toLowerCase().includes("system32")
      ? "powershell.exe"
      : "C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
  const { stdout } = await execFileAsync(
    powershellPath,
    ["-NoLogo", "-NoProfile", "-Command", command],
    {
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
      timeout: 15000,
    }
  );

  return String(stdout ?? "");
};

const searchDuckDuckGo = async (query: string) => {
  const response = await withRetries(
    `DuckDuckGo search ${query}`,
    () =>
      axios.get("https://html.duckduckgo.com/html/", {
        timeout: 9000,
        params: { q: query },
        headers: REQUEST_HEADERS,
        validateStatus: (status) => status >= 200 && status < 400,
      }),
    2
  );

  const html = String(response.data ?? "");
  const resultMatches =
    html.match(/<div class="result[\s\S]*?<\/div>\s*<\/div>/gi) ?? [];

  return normalizeSearchResults(
    resultMatches
      .slice(0, 10)
      .map((chunk) => {
        const title =
          chunk.match(/class="result__a"[\s\S]*?>([\s\S]*?)<\/a>/i)?.[1] ?? "";
        const href =
          chunk.match(/class="result__a"[^>]+href="([^"]+)"/i)?.[1] ?? "";
        const snippet =
          chunk.match(/class="result__snippet"[\s\S]*?>([\s\S]*?)<\/a>/i)?.[1] ??
          chunk.match(/class="result__snippet"[\s\S]*?>([\s\S]*?)<\/div>/i)?.[1] ??
          "";
        const url = decodeDuckDuckGoUrl(href);

        return {
          title: stripHtml(title),
          snippet: stripHtml(snippet),
          url,
          domain: getHostname(url),
        };
      })
  );
};

const searchBing = async (query: string) => {
  const searchUrl = `https://www.bing.com/search?q=${encodeURIComponent(query)}&setlang=en-US`;
  let html = "";

  try {
    html = await fetchHtmlViaPowerShell(searchUrl);
  } catch {
    const response = await withRetries(
      `Bing search ${query}`,
      () =>
        axios.get("https://www.bing.com/search", {
          timeout: 9000,
          params: { q: query, setlang: "en-US" },
          headers: REQUEST_HEADERS,
          validateStatus: (status) => status >= 200 && status < 400,
        }),
      2
    );
    html = String(response.data ?? "");
  }

  const chunkMatches =
    html.match(
      /<li class="b_algo"[\s\S]*?(?=<li class="b_algo"|<li class="b_ans"|<nav role="navigation"|<\/ol>)/gi
    ) ?? [];

  return normalizeSearchResults(
    chunkMatches
      .slice(0, 10)
      .map((chunk) => {
        const href =
          chunk.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"/i)?.[1] ??
          chunk.match(/<a[^>]+href="([^"]+)"[^>]*h="ID=SERP/i)?.[1] ??
          "";
        const title =
          chunk.match(/<h2[^>]*>\s*<a[^>]*>([\s\S]*?)<\/a>/i)?.[1] ?? "";
        const snippet =
          chunk.match(/<div class="b_caption"[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ??
          chunk.match(/<p[^>]*>([\s\S]*?)<\/p>/i)?.[1] ??
          "";
        const url = decodeBingUrl(href);

        return {
          title: stripHtml(title),
          snippet: stripHtml(snippet),
          url,
          domain: getHostname(url),
        };
      })
  );
};

const searchCache = new Map<string, SearchResult[]>();

const searchWeb = async (query: string) => {
  if (searchCache.has(query)) {
    return searchCache.get(query) ?? [];
  }

  const settled = await Promise.allSettled([
    searchDuckDuckGo(query),
    searchBing(query),
  ]);

  const results = Array.from(
    new Map(
      settled
        .flatMap((item) => (item.status === "fulfilled" ? item.value : []))
        .map((result) => [result.url, result])
    ).values()
  );

  searchCache.set(query, results);
  return results;
};

const scoreSearchResult = ({
  row,
  result,
  preferredDomain,
}: {
  row: ReportRow;
  result: SearchResult;
  preferredDomain: string;
}) => {
  let score = 0;
  const haystack = normalizeKey(
    [result.title, result.snippet, result.domain, result.url].join(" ")
  );
  const titleTokens = tokenize(row.title);
  const vendorTokens = tokenize(row.vendor);
  const coreTokens = tokenize(extractCoreProductName(row.title));

  score += countMatches(titleTokens, haystack) * 5;
  score += countMatches(vendorTokens, haystack) * 6;
  score += countMatches(coreTokens, haystack) * 8;

  if (preferredDomain && areRelatedDomains(result.domain, preferredDomain)) {
    score += 25;
  }

  vendorTokens.forEach((token) => {
    if (result.domain.includes(token)) {
      score += 8;
    }
  });

  if (getPathname(result.url) && !isHomePagePath(getPathname(result.url))) {
    score += 4;
  }

  if (result.url.toLowerCase().includes("pricing")) {
    score -= 1;
  }

  return score;
};

const probeCache = new Map<string, ProbeResult>();

const extractTagText = (html: string, tagName: string) => {
  const match = html.match(
    new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "i")
  );
  return match?.[1] ? stripHtml(match[1]) : "";
};

const getFinalResponseUrl = (
  response: AxiosResponse,
  fallbackUrl: string
) => {
  const request = response.request as
    | {
        res?: { responseUrl?: string };
        _redirectable?: { _currentUrl?: string };
      }
    | undefined;

  return (
    request?.res?.responseUrl ||
    request?._redirectable?._currentUrl ||
    fallbackUrl
  );
};

const probeUrl = async (row: ReportRow, url: string): Promise<ProbeResult> => {
  const normalizedUrl = sanitizeUrl(url);
  if (probeCache.has(normalizedUrl)) {
    return probeCache.get(normalizedUrl)!;
  }

  try {
    const response = await withRetries(
      `Probe ${row.productId} ${normalizedUrl}`,
      () =>
        axios.get<string>(normalizedUrl, {
          timeout: 9000,
          maxRedirects: 5,
          responseType: "text",
          headers: REQUEST_HEADERS,
          validateStatus: () => true,
          transformResponse: [
            (data) => (typeof data === "string" ? data : String(data ?? "")),
          ],
        }),
      2
    );

    const html = typeof response.data === "string" ? response.data : "";
    const finalUrl = sanitizeUrl(getFinalResponseUrl(response, normalizedUrl));
    const pageTitle = extractTagText(html, "title");
    const heading = extractTagText(html, "h1");
    const haystack = normalizeKey(
      [
        pageTitle,
        heading,
        getPathname(finalUrl).replace(/[-_/]+/g, " "),
        getHostname(finalUrl).replace(/[.-]+/g, " "),
      ].join(" ")
    );
    const titleTokens = tokenize(row.title);
    const vendorTokens = tokenize(row.vendor);
    const coreTokens = tokenize(extractCoreProductName(row.title));
    const titleMatches = countMatches(
      Array.from(new Set([...titleTokens, ...coreTokens])),
      haystack
    );
    const vendorMatches = countMatches(vendorTokens, haystack);
    const pathMatches = countMatches(
      Array.from(new Set([...titleTokens, ...coreTokens])),
      normalizeKey(getPathname(finalUrl).replace(/[-_/]+/g, " "))
    );
    const reachable = response.status >= 200 && response.status < 400;

    let landingType: ProbeResult["landingType"] = "unreachable";
    if (reachable) {
      if (
        !isHomePagePath(getPathname(finalUrl)) &&
        (titleMatches >= 1 || vendorMatches >= 1 || pathMatches >= 1)
      ) {
        landingType = "product_page";
      } else if (isHomePagePath(getPathname(finalUrl))) {
        landingType = "home_page";
      } else {
        landingType = "other_page";
      }
    }

    const result: ProbeResult = {
      requestedUrl: normalizedUrl,
      finalUrl,
      finalDomain: getHostname(finalUrl),
      httpStatus: response.status ?? null,
      pageTitle,
      heading,
      landingType,
      reachable,
      titleMatches,
      vendorMatches,
      pathMatches,
    };

    probeCache.set(normalizedUrl, result);
    return result;
  } catch {
    const result: ProbeResult = {
      requestedUrl: normalizedUrl,
      finalUrl: normalizedUrl,
      finalDomain: getHostname(normalizedUrl),
      httpStatus: null,
      pageTitle: "",
      heading: "",
      landingType: "unreachable",
      reachable: false,
      titleMatches: 0,
      vendorMatches: 0,
      pathMatches: 0,
    };
    probeCache.set(normalizedUrl, result);
    return result;
  }
};

const pickBestOfficialDomain = ({
  row,
  preferredDomain,
  searchResults,
}: {
  row: ReportRow;
  preferredDomain: string;
  searchResults: SearchResult[];
}) => {
  if (
    preferredDomain &&
    row.officialWebsiteAssessment === "likely_official_website"
  ) {
    return preferredDomain;
  }

  const domainScores = new Map<string, number>();
  searchResults.forEach((result) => {
    const score = scoreSearchResult({ row, result, preferredDomain });
    domainScores.set(
      result.domain,
      Math.max(domainScores.get(result.domain) ?? Number.NEGATIVE_INFINITY, score)
    );
  });

  const sorted = Array.from(domainScores.entries()).sort(
    (left, right) => right[1] - left[1]
  );

  return sorted[0]?.[0] ?? preferredDomain;
};

const resolveReplacementForRow = async (
  row: ReportRow
): Promise<ResolvedUrl> => {
  const currentUrl = row.normalizedMetafieldUrl || row.metafieldUrl || "";
  const preferredDomain = getHostname(currentUrl || row.finalUrl || "");
  const trustedCurrentDomain =
    preferredDomain &&
    (row.officialWebsiteAssessment === "likely_official_website" ||
      domainLooksRelevant(preferredDomain, row))
      ? preferredDomain
      : "";
  const currentProbe =
    isLikelyHttpUrl(currentUrl) ? await probeUrl(row, currentUrl) : null;

  if (
    currentProbe &&
    currentProbe.reachable &&
    currentProbe.landingType === "home_page" &&
    trustedCurrentDomain
  ) {
    return {
      chosenUrl: currentProbe.finalUrl,
      officialDomain: currentProbe.finalDomain,
      sourceMethod: "existing_homepage",
      selectionReason: "Current metafield already resolves to an official-looking homepage",
      chosenProbe: currentProbe,
    };
  }

  if (
    trustedCurrentDomain &&
    row.officialWebsiteAssessment === "likely_official_website" &&
    row.urlStatus === "unreachable"
  ) {
    const fallbackHomepage = sanitizeUrl(`https://${trustedCurrentDomain}/`);
    const fallbackProbe = await probeUrl(row, fallbackHomepage);

    return {
      chosenUrl: fallbackHomepage,
      officialDomain: trustedCurrentDomain,
      sourceMethod: "fallback_homepage",
      selectionReason:
        "Trusted the current official domain and fell back directly to its homepage",
      chosenProbe: fallbackProbe,
    };
  }

  const searchNameVariants = buildSearchNameVariants(row.title);
  const queries = toUniqueList(
    [
      ...searchNameVariants.flatMap((nameVariant) => [
        [nameVariant, row.vendor].filter(Boolean).join(" "),
        nameVariant,
        trustedCurrentDomain ? `${nameVariant} site:${trustedCurrentDomain}` : "",
        trustedCurrentDomain
          ? `${row.vendor} ${nameVariant} site:${trustedCurrentDomain}`
          : "",
      ]),
      row.vendor ? `${row.vendor} official site` : "",
    ].filter(Boolean)
  ).slice(0, 6);

  const searchResultsMap = new Map<string, SearchResult>();
  for (const query of queries) {
    const results = await searchWeb(query);
    results.forEach((result) => {
      if (!searchResultsMap.has(result.url)) {
        searchResultsMap.set(result.url, result);
      }
    });
  }

  const searchResults = Array.from(searchResultsMap.values()).sort(
    (left, right) =>
      scoreSearchResult({ row, result: right, preferredDomain: trustedCurrentDomain }) -
      scoreSearchResult({ row, result: left, preferredDomain: trustedCurrentDomain })
  );

  let officialDomain = pickBestOfficialDomain({
    row,
    preferredDomain: trustedCurrentDomain,
    searchResults,
  });

  if (!officialDomain) {
    for (const guessUrl of buildDomainGuesses(row)) {
      const guessProbe = await probeUrl(row, guessUrl);
      if (guessProbe.finalDomain && domainLooksRelevant(guessProbe.finalDomain, row)) {
        officialDomain = guessProbe.finalDomain;
        break;
      }
    }
  }

  const domainScopedResults = searchResults.filter((result) =>
    officialDomain ? areRelatedDomains(result.domain, officialDomain) : true
  );

  const candidateUrls = toUniqueList([
    ...(currentUrl ? [currentUrl] : []),
    ...domainScopedResults.map((result) => result.url),
    ...(officialDomain ? [`https://${officialDomain}/`] : []),
  ]).slice(0, 8);

  const candidateProbes: Array<{ url: string; probe: ProbeResult }> = [];
  for (const candidateUrl of candidateUrls) {
    if (!isLikelyHttpUrl(candidateUrl)) {
      continue;
    }

    const probe = await probeUrl(row, candidateUrl);
    if (
      officialDomain &&
      probe.finalDomain &&
      !areRelatedDomains(probe.finalDomain, officialDomain)
    ) {
      continue;
    }

    candidateProbes.push({ url: candidateUrl, probe });
  }

  const productPageCandidate = candidateProbes
    .filter(
      (entry) =>
        entry.probe.reachable &&
        entry.probe.landingType === "product_page"
    )
    .sort(
      (left, right) =>
        right.probe.titleMatches +
        right.probe.vendorMatches +
        right.probe.pathMatches -
        (left.probe.titleMatches +
          left.probe.vendorMatches +
          left.probe.pathMatches)
    )[0];

  if (productPageCandidate) {
    return {
      chosenUrl: productPageCandidate.probe.finalUrl,
      officialDomain: officialDomain || productPageCandidate.probe.finalDomain,
      sourceMethod:
        trustedCurrentDomain && officialDomain === trustedCurrentDomain
          ? "site_search_product_page"
          : "web_search_product_page",
      selectionReason: "Found a reachable official product page",
      chosenProbe: productPageCandidate.probe,
    };
  }

  const reachableHomepageCandidate = candidateProbes.find(
    (entry) =>
      entry.probe.reachable && entry.probe.landingType === "home_page"
  );

  if (reachableHomepageCandidate) {
    return {
      chosenUrl: reachableHomepageCandidate.probe.finalUrl,
      officialDomain:
        officialDomain || reachableHomepageCandidate.probe.finalDomain,
      sourceMethod:
        currentProbe &&
        sanitizeUrl(currentProbe.finalUrl) ===
          sanitizeUrl(reachableHomepageCandidate.probe.finalUrl)
          ? "existing_domain_homepage"
          : trustedCurrentDomain && officialDomain === trustedCurrentDomain
            ? "site_search_homepage"
            : "web_search_homepage",
      selectionReason:
        "Used the official website homepage because a confident product page was not available",
      chosenProbe: reachableHomepageCandidate.probe,
    };
  }

  if (officialDomain) {
    const fallbackHomepage = sanitizeUrl(`https://${officialDomain}/`);
    const fallbackProbe = await probeUrl(row, fallbackHomepage);

    return {
      chosenUrl: fallbackHomepage,
      officialDomain,
      sourceMethod: "fallback_homepage",
      selectionReason:
        "Fell back to the official domain homepage because no better confirmed product page was available",
      chosenProbe: fallbackProbe,
    };
  }

  return {
    chosenUrl: currentUrl,
    officialDomain: trustedCurrentDomain,
    sourceMethod: "keep_current",
    selectionReason:
      "Could not confidently improve the current URL from search results",
    chosenProbe: currentProbe,
  };
};

const mapWithConcurrency = async <T, R>(
  values: T[],
  concurrency: number,
  mapper: (value: T, index: number) => Promise<R>
) => {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  const worker = async () => {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      if (currentIndex >= values.length) {
        return;
      }

      results[currentIndex] = await mapper(values[currentIndex], currentIndex);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, () =>
      worker()
    )
  );

  return results;
};

const findLatestReportPath = () => {
  const candidates = fs
    .readdirSync(EXPORTS_DIR)
    .filter((name) => /^shopify-product-custom-url-report-.*\.json$/i.test(name))
    .sort((left, right) => right.localeCompare(left));

  if (!candidates[0]) {
    throw new Error("No custom URL report JSON file was found in backend/exports.");
  }

  return path.join(EXPORTS_DIR, candidates[0]);
};

const loadTargetRows = () => {
  const reportPath = REPORT_ARG
    ? path.resolve(process.cwd(), REPORT_ARG.split("=")[1])
    : findLatestReportPath();
  const payload = JSON.parse(fs.readFileSync(reportPath, "utf8")) as ReportJson;
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const targets = rows.filter(
    (row) =>
      row.urlStatus === "unreachable" ||
      row.officialWebsiteAssessment === "unclear"
  );
  const uniqueByProductId = Array.from(
    new Map(targets.map((row) => [row.productId, row])).values()
  );

  return {
    reportPath,
    rows:
      PRODUCT_LIMIT && PRODUCT_LIMIT > 0
        ? uniqueByProductId.slice(0, PRODUCT_LIMIT)
        : uniqueByProductId,
  };
};

const applyResolvedUrl = async ({
  productId,
  url,
}: {
  productId: number;
  url: string;
}) => {
  await withRetries(`Update custom.custom for ${productId}`, () =>
    setProductMetafields({
      shopifyProductId: productId,
      affiliateUrl: url,
    }),
  3);
};

const writeRepairReport = async ({
  sourceReportPath,
  repairs,
}: {
  sourceReportPath: string;
  repairs: RepairRow[];
}) => {
  await fs.promises.mkdir(EXPORTS_DIR, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const baseName = `shopify-product-custom-url-repair-${timestamp}${
    APPLY_CHANGES ? "-applied" : "-dry-run"
  }`;
  const jsonPath = path.join(EXPORTS_DIR, `${baseName}.json`);
  const csvPath = path.join(EXPORTS_DIR, `${baseName}.csv`);

  const summary = {
    generatedAt: new Date().toISOString(),
    applyChanges: APPLY_CHANGES,
    sourceReportPath,
    targetCount: repairs.length,
    changedCount: repairs.filter((row) => row.changed).length,
    unchangedCount: repairs.filter((row) => !row.changed).length,
    appliedCount: repairs.filter((row) => row.applied).length,
    applyErrorCount: repairs.filter((row) => row.applyError).length,
    sourceMethodBreakdown: repairs.reduce<Record<string, number>>(
      (accumulator, row) => {
        accumulator[row.sourceMethod] =
          (accumulator[row.sourceMethod] ?? 0) + 1;
        return accumulator;
      },
      {}
    ),
    repairs,
  };

  await fs.promises.writeFile(jsonPath, JSON.stringify(summary, null, 2), "utf8");

  const csvLines = [
    [
      "product_id",
      "graphql_id",
      "title",
      "vendor",
      "old_url",
      "new_url",
      "changed",
      "source_method",
      "official_domain",
      "url_status_before",
      "assessment_before",
      "landing_type_before",
      "chosen_landing_type",
      "chosen_http_status",
      "applied",
      "apply_error",
      "selection_reason",
    ]
      .map((value) => csvEscape(value))
      .join(","),
    ...repairs.map((row) =>
      [
        row.productId,
        row.graphqlId,
        row.title,
        row.vendor,
        row.oldUrl,
        row.newUrl,
        row.changed,
        row.sourceMethod,
        row.officialDomain,
        row.urlStatusBefore,
        row.assessmentBefore,
        row.landingTypeBefore,
        row.chosenLandingType,
        row.chosenHttpStatus,
        row.applied,
        row.applyError,
        row.selectionReason,
      ]
        .map((value) => csvEscape(value))
        .join(",")
    ),
  ].join("\n");

  await fs.promises.writeFile(csvPath, csvLines, "utf8");
  return { jsonPath, csvPath };
};

const main = async () => {
  const { reportPath, rows } = loadTargetRows();

  console.log(`Source report: ${reportPath}`);
  console.log(
    `Loaded ${rows.length} unique products where URL was unreachable or unclear.`
  );

  const resolvedRows = await mapWithConcurrency(
    rows,
    WORKER_CONCURRENCY,
    async (row, index) => {
      console.log(
        `[${index + 1}/${rows.length}] Resolving ${row.productId}: ${row.title}`
      );

      const resolved = await resolveReplacementForRow(row);
      const oldUrl = sanitizeUrl(row.normalizedMetafieldUrl || row.metafieldUrl || "");
      const newUrl = sanitizeUrl(resolved.chosenUrl || oldUrl);
      const changed = Boolean(newUrl && oldUrl && newUrl !== oldUrl);
      let applied = false;
      let applyError: string | null = null;

      if (APPLY_CHANGES && changed && newUrl) {
        try {
          await applyResolvedUrl({ productId: row.productId, url: newUrl });
          applied = true;
        } catch (error: any) {
          applyError =
            typeof error?.message === "string"
              ? normalizeWhitespace(error.message)
              : "Failed to update Shopify metafield";
        }
      }

      return {
        productId: row.productId,
        graphqlId: row.graphqlId,
        title: row.title,
        vendor: row.vendor ?? "",
        oldUrl: oldUrl || null,
        newUrl: newUrl || null,
        changed,
        sourceMethod: resolved.sourceMethod,
        officialDomain: resolved.officialDomain,
        urlStatusBefore: row.urlStatus ?? "",
        assessmentBefore: row.officialWebsiteAssessment ?? "",
        landingTypeBefore: row.landingType ?? "",
        chosenLandingType: resolved.chosenProbe?.landingType ?? "",
        chosenHttpStatus: resolved.chosenProbe?.httpStatus ?? null,
        applied,
        applyError,
        selectionReason: resolved.selectionReason,
      } satisfies RepairRow;
    }
  );

  const reportPaths = await writeRepairReport({
    sourceReportPath: reportPath,
    repairs: resolvedRows,
  });

  console.log(`Repair JSON report: ${reportPaths.jsonPath}`);
  console.log(`Repair CSV report: ${reportPaths.csvPath}`);
};

main().catch((error) => {
  console.error(
    "Failed to repair Shopify custom URL metafields:",
    error?.message ?? error
  );
  process.exitCode = 1;
});
