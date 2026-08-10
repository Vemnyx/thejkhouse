import type { MediaSearchItem, MediaSearchType } from "./api";

const GOOGLE_CSE_ID = "b26f26aa1ed1341d4";
const CSE_ELEMENT_NAME = "jkhouse-party-media";
const CSE_HOST_ID = "jkhouse-cse-host";
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
  type: MediaSearchType;
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

function isGifResult(result: GoogleCseResult) {
  const link = (result.url || result.image?.url || "").toLowerCase();
  const format = (result.fileFormat || "").toLowerCase();
  return format.includes("gif") || /\.gif(\?|$)/i.test(link);
}

function toMediaSearchItem(result: GoogleCseResult): MediaSearchItem | null {
  const link = (result.url || result.image?.url || "").trim();
  if (!link) {
    return null;
  }

  const thumbnail = (result.thumbnailImage?.url || result.image?.url || link).trim();
  const title = (result.titleNoFormatting || result.title || result.visibleUrl || "Image").trim();
  const context = (result.contextUrl || result.visibleUrl || "").trim();
  const mime = (result.fileFormat || "").trim().toLowerCase();

  return {
    title,
    link,
    thumbnail,
    context,
    mime: mime.includes("gif") || /\.gif(\?|$)/i.test(link) ? "image/gif" : mime ? `image/${mime}` : "image/*",
  };
}

function filterResults(results: GoogleCseResult[] | null | undefined, type: MediaSearchType) {
  const items = (results ?? [])
    .map(toMediaSearchItem)
    .filter((item): item is MediaSearchItem => item !== null);

  if (type === "gif") {
    return items.filter((item) => item.mime === "image/gif" || /\.gif(\?|$)/i.test(item.link));
  }

  return items.filter((item) => item.mime !== "image/gif" && !/\.gif(\?|$)/i.test(item.link));
}

function finishPendingSearch(results: GoogleCseResult[] | null | undefined) {
  if (!pendingSearch) {
    return true;
  }

  const current = pendingSearch;
  pendingSearch = null;
  window.clearTimeout(current.timeoutId);
  current.resolve(filterResults(results, current.type));
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

function ensureHostElement() {
  if (document.getElementById(CSE_HOST_ID)) {
    return;
  }

  const host = document.createElement("div");
  host.id = CSE_HOST_ID;
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = "position:absolute;width:0;height:0;overflow:hidden;opacity:0;pointer-events:none";
  document.body.appendChild(host);
}

function renderSearchElement() {
  ensureHostElement();
  window.google?.search?.cse?.element?.render({
    div: CSE_HOST_ID,
    tag: "searchresults-only",
    gname: CSE_ELEMENT_NAME,
    attributes: {
      enableImageSearch: true,
      defaultToImageSearch: true,
      disableWebSearch: false,
      imageSearchResultSetSize: 12,
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
  await loadGoogleCseScript();

  if (window.google?.search?.cse?.element?.getElement(CSE_ELEMENT_NAME)) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const tryInit = (attempt = 0) => {
      if (window.google?.search?.cse?.element?.getElement(CSE_ELEMENT_NAME)) {
        resolve();
        return;
      }

      if (window.google?.search?.cse?.element) {
        renderSearchElement();
      }

      if (window.google?.search?.cse?.element?.getElement(CSE_ELEMENT_NAME)) {
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

export async function searchPartyMedia(query: string, type: MediaSearchType): Promise<MediaSearchItem[]> {
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
  const searchQuery = type === "gif" ? `${trimmedQuery} gif` : trimmedQuery;

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      if (pendingSearch?.generation === generation) {
        pendingSearch = null;
        reject(new Error("Search timed out"));
      }
    }, SEARCH_TIMEOUT_MS);

    pendingSearch = {
      generation,
      type,
      resolve,
      reject,
      timeoutId,
    };

    element.clearAllResults?.();
    element.execute(searchQuery);
  });
}
