// src/utils/chordFetchers.js
// Fetch and parse chord sheets via the backend proxy (avoids CORS)

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";
const CV_SUPABASE_URL = import.meta.env.VITE_CHORDVAULT_SUPABASE_URL || "";
const CV_SUPABASE_KEY = import.meta.env.VITE_CHORDVAULT_SUPABASE_KEY || "";
export const CHORDVAULT_APP_URL = import.meta.env.VITE_CHORDVAULT_APP_URL || "https://chordvault-ten.vercel.app";

async function proxyFetch(url) {
  const res = await fetch(`${API_BASE_URL}/api/fetch-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`Proxy fetch failed for ${url}: ${res.status}`);
  return res.text();
}

// --- ChordVault library search (first priority) ---
// Strip featured artist credits and band attributions to get the core song title
function extractCoreTitle(songTitle) {
  return songTitle
    .split(/\/\//)[0]                        // drop "// The Belonging Co" style credits
    .replace(/\s*\(feat\.?.+?\)/i, "")       // drop "(Feat. David Dennis)"
    .replace(/\s*\[feat\.?.+?\]/i, "")       // drop "[Feat. ...]"
    .trim();
}

export async function fetchFromChordVault(songTitle) {
  if (!CV_SUPABASE_URL || !CV_SUPABASE_KEY) {
    console.warn("[ChordVault] Supabase env vars not set — check VITE_CHORDVAULT_SUPABASE_URL / VITE_CHORDVAULT_SUPABASE_KEY and restart Vite");
    return null;
  }
  if (!songTitle?.trim()) return null;

  const coreTitle = extractCoreTitle(songTitle);
  const encoded = encodeURIComponent(`*${coreTitle}*`);
  const url = `${CV_SUPABASE_URL}/rest/v1/songs?title=ilike.${encoded}&select=id,title,artist,original_key,raw_content&limit=5&order=title.asc`;

  console.log("[ChordVault] searching:", coreTitle, "(from:", songTitle, ")");
  const res = await fetch(url, {
    headers: {
      apikey: CV_SUPABASE_KEY,
      Authorization: `Bearer ${CV_SUPABASE_KEY}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.warn("[ChordVault] API error", res.status, body);
    return null;
  }

  const songs = await res.json();
  console.log("[ChordVault] results:", songs);

  if (!Array.isArray(songs) || songs.length === 0) return null;
  return songs
    .filter((s) => s.raw_content)
    .map((s) => ({
      source: "ChordVault",
      text: s.raw_content,
      key: s.original_key || "",
      title: s.title,
      url: `${CHORDVAULT_APP_URL}/songs/${s.id}`,
    }));
}

// Web-only sources (used as fallback when song not in ChordVault)
export async function fetchWebChordSheets({ songTitle, artist }) {
  const [ug, wt, pnw] = await Promise.allSettled([
    fetchUltimateGuitar(songTitle, artist),
    fetchWorshipTogether(songTitle, artist),
    fetchPnwChords(songTitle, artist),
  ]);
  const results = [];
  if (ug.status === "fulfilled" && ug.value) results.push({ source: "Ultimate Guitar", ...ug.value });
  if (wt.status === "fulfilled" && wt.value) results.push({ source: "WorshipTogether", ...wt.value });
  if (pnw.status === "fulfilled" && pnw.value) results.push({ source: "pnwchords", ...pnw.value });
  return results;
}

// Decode HTML entities from data-content attribute
function decodeDataContent(raw) {
  return raw
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

// Strip UG format markers: [ch], [/ch], [tab], [/tab]
function stripUgMarkers(content) {
  return content
    .replace(/\[ch\]/g, "")
    .replace(/\[\/ch\]/g, "")
    .replace(/\[tab\]/g, "")
    .replace(/\[\/tab\]/g, "");
}

// --- Ultimate Guitar ---
// UG embeds page data as JSON in data-content attribute of .js-store div
async function fetchUltimateGuitar(songTitle, artist) {
  const query = encodeURIComponent(`${songTitle} ${artist || ""}`.trim());
  const searchUrl = `https://www.ultimate-guitar.com/search.php?search_type=title&value=${query}`;
  const searchHtml = await proxyFetch(searchUrl);

  // Primary: js-store data-content attribute
  const storeMatch = searchHtml.match(/class="js-store"[^>]*data-content="([^"]+)"/);
  if (storeMatch) {
    try {
      const searchData = JSON.parse(decodeDataContent(storeMatch[1]));
      const results = searchData?.store?.page?.data?.results;
      if (Array.isArray(results)) {
        const chordResult = results.find(
          (r) => r.type === "Chords" || r.type === "chords"
        );
        if (chordResult?.tab_url) {
          const tabUrl = chordResult.tab_url;
          const tabHtml = await proxyFetch(tabUrl);
          const tabStoreMatch = tabHtml.match(/class="js-store"[^>]*data-content="([^"]+)"/);
          if (tabStoreMatch) {
            const tabData = JSON.parse(decodeDataContent(tabStoreMatch[1]));
            const content = tabData?.store?.page?.data?.tab_view?.wiki_tab?.content;
            if (content) {
              return {
                text: stripUgMarkers(content),
                url: tabUrl,
                key: chordResult.key_label || "",
              };
            }
          }
        }
      }
    } catch {}
  }

  // Fallback: old-style href match
  const hrefMatch = searchHtml.match(
    /href="(https:\/\/tabs\.ultimate-guitar\.com\/tab\/[^"]+-chords-\d+)/
  );
  if (!hrefMatch) return null;
  const tabUrl = hrefMatch[1];
  const tabHtml = await proxyFetch(tabUrl);

  const tabStoreMatch = tabHtml.match(/class="js-store"[^>]*data-content="([^"]+)"/);
  if (tabStoreMatch) {
    try {
      const tabData = JSON.parse(decodeDataContent(tabStoreMatch[1]));
      const content = tabData?.store?.page?.data?.tab_view?.wiki_tab?.content;
      if (content) return { text: stripUgMarkers(content), url: tabUrl };
    } catch {}
  }

  // Last resort: raw <pre>
  const preMatch = tabHtml.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
  if (preMatch) return { text: decodeHtml(preMatch[1]), url: tabUrl };

  return null;
}

// --- WorshipTogether ---
async function fetchWorshipTogether(songTitle, artist) {
  const query = encodeURIComponent(`${songTitle} ${artist || ""}`.trim());
  const searchUrl = `https://www.worshiptogether.com/songs/?q=${query}`;
  const searchHtml = await proxyFetch(searchUrl);

  // Find song page link
  const match = searchHtml.match(/href="(\/songs\/[^"?#]+)"/);
  if (!match) return null;
  const songUrl = `https://www.worshiptogether.com${match[1]}`;
  const songHtml = await proxyFetch(songUrl);

  // Try various content selectors
  const selectors = [
    /<pre[^>]*>([\s\S]*?)<\/pre>/,
    /<div[^>]*class="[^"]*song-chords[^"]*"[^>]*>([\s\S]*?)<\/div>/,
    /<div[^>]*class="[^"]*chord-sheet[^"]*"[^>]*>([\s\S]*?)<\/div>/,
    /<div[^>]*class="[^"]*chords[^"]*"[^>]*>([\s\S]*?)<\/div>/,
  ];
  for (const re of selectors) {
    const m = songHtml.match(re);
    if (m) return { text: decodeHtml(m[1]), url: songUrl };
  }
  return null;
}

// --- pnwchords ---
async function fetchPnwChords(songTitle, artist) {
  const query = encodeURIComponent(`${songTitle} ${artist || ""}`.trim());
  const searchUrl = `https://pnwchords.com/?s=${query}`;
  const searchHtml = await proxyFetch(searchUrl);

  const match = searchHtml.match(/href="(https:\/\/pnwchords\.com\/[^"?#]+)"/);
  if (!match) return null;
  const songUrl = match[1];
  const songHtml = await proxyFetch(songUrl);

  const selectors = [
    /<pre[^>]*>([\s\S]*?)<\/pre>/,
    /<div[^>]*class="[^"]*thecontent[^"]*"[^>]*>([\s\S]*?)<\/div>/,
    /<div[^>]*class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/,
    /<article[^>]*>([\s\S]*?)<\/article>/,
  ];
  for (const re of selectors) {
    const m = songHtml.match(re);
    if (m) return { text: decodeHtml(m[1]), url: songUrl };
  }
  return null;
}

function decodeHtml(html) {
  const stripped = html.replace(/<[^>]+>/g, "");
  const txt = document.createElement("textarea");
  txt.innerHTML = stripped;
  return txt.value.trim();
}
