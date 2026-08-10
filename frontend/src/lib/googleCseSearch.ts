import type { MediaSearchItem } from "./api";

const GOOGLE_CSE_ID = "b26f26aa1ed1341d4";
const CSE_ELEMENT_NAME = "jkhouse-party-media";
export const PARTY_MEDIA_CSE_HOST_ID = "jkhouse-cse-host";
const SEARCH_TIMEOUT_MS = 20_000;

type GoogleCseImage = {
  url?: string;
  height?: number;
  width?: number;
};

type GoogleCseResult = {
  title?: string;
  titleNoFormatting?: string;
  url?: string;
  visibleUrl?: string;
  contextUrl?: string;
  fileFormat?: string;
  image?: GoogleCseImage;
  thumbnailImage?: GoogleCseImage;
};

type PendingSearch = {
  generation: number;
  resolve: (items: MediaSearchItem[]) => void;
  reject: (error: Error) => void;
  timeoutId: number;
};

declare global {
  interface Window {
    __gcse?: {
      parsetags?: string;
      callback?: () => void;
      searchCallbacks?: {
        image?: {
          ready?: (
            gname: string,
            query: string,
            promos: unknown,
            results: GoogleCseResult[] | null,
            div: HTMLElement,
          ) => boolean | void;
        };
        web?: {
          ready?: (
            gname: string,
            query: string,
            promos: unknown,
            results: GoogleCseResult[] | null,
            div: HTMLElement,
          ) => boolean | void;
        };
      };
    };
    google?: {
      search?: {
        cse?: {
          element?: {
            render: (config: {
              div: string;
              tag: string;
              gname?: string;
              attributes?: Record<string, string | boolean | number>;
            }) => void;
            getElement: (gname: string) => {
              execute: (query: string) => void;
              clearAllResults?: () => void;
            } | null;
          };
        };
      };
    };
  }
}

let scriptLoadPromise: Promise<void> | null = null;
let searchGeneration = 0;
let pendingSearch: PendingSearch | null = null;
let gcseConfigured = false;
let searchElementReady = false;

function getHostElement() {
  return document.getElementById(PARTY_MEDIA_CSE_HOST_ID);
}

export function releasePartyMediaSearchState() {
  document.body.classList.remove("gsc-overflow-hidden");
  document.documentElement.classList.remove("gsc-overflow-hidden");
  document.body.style.overflow = "";
  document.body.style.position = "";
  document.body.style.top = "";
  document.body.style.width = "";
  document.body.style.paddingRight = "";
  document.documentElement.style.overflow = "";

  document.querySelectorAll(".gsc-results-wrapper-overlay, .gsc-modal-background-image").forEach((element) => {
    element.remove();
  });

  window.google?.search?.cse?.element?.getElement(CSE_ELEMENT_NAME)?.clearAllResults?.();
}

export function resetPartyMediaSearchElement() {
  if (pendingSearch) {
    failPendingSearch("Search cancelled");
  }

  releasePartyMediaSearchState();
  searchElementReady = false;

  const host = getHostElement();
  if (host) {
    host.innerHTML = "";
  }
}

function isGifResult(result: GoogleCseResult) {
  const link = (result.url || result.image?.url || "").toLowerCase();
  const format = (result.fileFormat || "").toLowerCase();
  return format.includes("gif") || /\.gif(\?|$)/i.test(link);
}

function toMediaSearchItem(result: GoogleCseResult): MediaSearchItem | null {
  const pageUrl = (result.url || "").trim();
  const imageUrl = (result.image?.url || "").trim();
  const isGif = isGifResult(result);
  const link = (isGif && imageUrl) || pageUrl || imageUrl;
  if (!link) {
    return null;
  }

  const thumbnail = isGif ? link : (result.thumbnailImage?.url || imageUrl || link).trim();
  const title = (result.titleNoFormatting || result.title || result.visibleUrl || "Image").trim();
  const context = (result.contextUrl || result.visibleUrl || "").trim();
  const mime = (result.fileFormat || "").trim().toLowerCase();

  return {
    title,
    link,
    thumbnail,
    context,
    mime: isGif ? "image/gif" : mime ? `image/${mime}` : "image/*",
  };
}

function mapResults(results: GoogleCseResult[] | null | undefined) {
  return (results ?? [])
    .map(toMediaSearchItem)
    .filter((item): item is MediaSearchItem => item !== null);
}

function finishPendingSearch(results: GoogleCseResult[] | null | undefined) {
  if (!pendingSearch) {
    return true;
  }

  const current = pendingSearch;
  pendingSearch = null;
  window.clearTimeout(current.timeoutId);
  current.resolve(mapResults(results));
  return true;
}

function failPendingSearch(message: string) {
  if (!pendingSearch) {
    return;
  }

  const current = pendingSearch;
  pendingSearch = null;
  window.clearTimeout(current.timeoutId);
  current.reject(new Error(message));
}

function handleResultsReady(gname: string, results: GoogleCseResult[] | null) {
  if (gname !== CSE_ELEMENT_NAME || !pendingSearch) {
    return false;
  }

  return finishPendingSearch(results);
}

function renderSearchElement() {
  if (!getHostElement()) {
    return;
  }

  window.google?.search?.cse?.element?.render({
    div: PARTY_MEDIA_CSE_HOST_ID,
    tag: "searchresults-only",
    gname: CSE_ELEMENT_NAME,
    attributes: {
      enableImageSearch: true,
      defaultToImageSearch: true,
      disableWebSearch: false,
      imageSearchResultSetSize: 40,
      imageSearchLayout: "classic",
      safeSearch: "active",
      autoSearchOnLoad: false,
    },
  });
}

function configureGcse() {
  if (gcseConfigured) {
    return;
  }

  window.__gcse = window.__gcse || {};
  window.__gcse.parsetags = "explicit";
  window.__gcse.searchCallbacks = {
    image: {
      ready: (gname, _query, _promos, results) => handleResultsReady(gname, results),
    },
    web: {
      ready: (gname, _query, _promos, results) => handleResultsReady(gname, results),
    },
  };
  window.__gcse.callback = () => {
    renderSearchElement();
  };

  gcseConfigured = true;
}

function loadGoogleCseScript() {
  if (scriptLoadPromise) {
    return scriptLoadPromise;
  }

  configureGcse();

  const existing = document.querySelector(`script[src*="cse.google.com/cse.js"]`) as HTMLScriptElement | null;
  if (existing) {
    if (window.google?.search?.cse?.element) {
      scriptLoadPromise = Promise.resolve();
      return scriptLoadPromise;
    }

    scriptLoadPromise = new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Failed to load Google search")), { once: true });
    });
    return scriptLoadPromise;
  }

  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `https://cse.google.com/cse.js?cx=${GOOGLE_CSE_ID}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google search"));
    document.head.appendChild(script);
  });

  return scriptLoadPromise;
}

async function ensureInitialized() {
  if (!getHostElement()) {
    throw new Error("Media search is not available");
  }

  await loadGoogleCseScript();

  if (searchElementReady && window.google?.search?.cse?.element?.getElement(CSE_ELEMENT_NAME)) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const tryInit = (attempt = 0) => {
      if (window.google?.search?.cse?.element?.getElement(CSE_ELEMENT_NAME)) {
        searchElementReady = true;
        resolve();
        return;
      }

      if (window.google?.search?.cse?.element) {
        renderSearchElement();
      }

      if (window.google?.search?.cse?.element?.getElement(CSE_ELEMENT_NAME)) {
        searchElementReady = true;
        resolve();
        return;
      }

      if (attempt >= 50) {
        reject(new Error("Google search did not initialize"));
        return;
      }

      window.setTimeout(() => tryInit(attempt + 1), 100);
    };

    tryInit();
  });
}

export async function searchPartyMedia(query: string): Promise<MediaSearchItem[]> {
  const trimmedQuery = query.trim();
  if (!trimmedQuery) {
    return [];
  }

  await ensureInitialized();

  const element = window.google?.search?.cse?.element?.getElement(CSE_ELEMENT_NAME);
  if (!element) {
    throw new Error("Google search is not ready");
  }

  if (pendingSearch) {
    failPendingSearch("Search replaced");
  }

  const generation = ++searchGeneration;

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      if (pendingSearch?.generation === generation) {
        pendingSearch = null;
        reject(new Error("Search timed out"));
      }
    }, SEARCH_TIMEOUT_MS);

    pendingSearch = {
      generation,
      resolve,
      reject,
      timeoutId,
    };

    element.clearAllResults?.();
    element.execute(trimmedQuery);
  });
}

export function isGifMediaItem(item: MediaSearchItem) {
  return item.mime === "image/gif" || /\.gif(\?|$)/i.test(item.link);
}
