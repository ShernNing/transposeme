// src/utils/chordFetchers.js
// Fetch and parse chord sheets via the backend proxy (avoids CORS and public proxy risks)

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "";

async function proxyFetch(url) {
  const res = await fetch(`${API_BASE_URL}/api/fetch-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!res.ok) throw new Error(`Proxy fetch failed for ${url}: ${res.status}`);
  return res.text();
}

export async function fetchAllChordSheets({ songTitle, artist }) {
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

// --- Ultimate Guitar ---
async function fetchUltimateGuitar(songTitle, artist) {
  const query = encodeURIComponent(`${songTitle} ${artist || ""}`.trim());
  const searchUrl = `https://www.ultimate-guitar.com/search.php?search_type=title&value=${query}`;
  const searchHtml = await proxyFetch(searchUrl);
  const match = searchHtml.match(/href="(https:\/\/tabs\.ultimate-guitar\.com\/tab\/[^"]+-chords-\d+)/);
  if (!match) return null;
  const tabUrl = match[1];
  const tabHtml = await proxyFetch(tabUrl);
  const preMatch = tabHtml.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
  if (preMatch) return { text: decodeHtml(preMatch[1]), url: tabUrl };
  const jsonMatch = tabHtml.match(/window\.UGAPP=([^<;]+);/);
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      const content = data?.store?.page?.data?.tab_view?.wiki_tab?.content;
      if (content) return { text: content, url: tabUrl };
    } catch {}
  }
  return null;
}

// --- WorshipTogether ---
async function fetchWorshipTogether(songTitle, artist) {
  const query = encodeURIComponent(`${songTitle} ${artist || ""}`.trim());
  const searchUrl = `https://www.worshiptogether.com/songs/?q=${query}`;
  const searchHtml = await proxyFetch(searchUrl);
  const match = searchHtml.match(/href="(\/songs\/[^"]+)"/);
  if (!match) return null;
  const songUrl = `https://www.worshiptogether.com${match[1]}`;
  const songHtml = await proxyFetch(songUrl);
  const preMatch = songHtml.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
  if (preMatch) return { text: decodeHtml(preMatch[1]), url: songUrl };
  const divMatch = songHtml.match(/<div class="song-chords">([\s\S]*?)<\/div>/);
  if (divMatch) return { text: decodeHtml(divMatch[1]), url: songUrl };
  return null;
}

// --- pnwchords ---
async function fetchPnwChords(songTitle, artist) {
  const query = encodeURIComponent(`${songTitle} ${artist || ""}`.trim());
  const searchUrl = `https://pnwchords.com/?s=${query}`;
  const searchHtml = await proxyFetch(searchUrl);
  const match = searchHtml.match(/href="(https:\/\/pnwchords\.com\/[^"]+)"/);
  if (!match) return null;
  const songUrl = match[1];
  const songHtml = await proxyFetch(songUrl);
  const preMatch = songHtml.match(/<pre[^>]*>([\s\S]*?)<\/pre>/);
  if (preMatch) return { text: decodeHtml(preMatch[1]), url: songUrl };
  const divMatch = songHtml.match(/<div class="thecontent">([\s\S]*?)<\/div>/);
  if (divMatch) return { text: decodeHtml(divMatch[1]), url: songUrl };
  return null;
}

function decodeHtml(html) {
  // Strip HTML tags, then decode entities via textarea trick
  const stripped = html.replace(/<[^>]+>/g, "");
  const txt = document.createElement("textarea");
  txt.innerHTML = stripped;
  return txt.value.trim();
}
