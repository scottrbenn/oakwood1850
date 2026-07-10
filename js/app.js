/*
 * Pulls all content for this page live from the Wikipedia / Wikimedia APIs
 * at request time, so the site tracks whatever the Wikipedia article says.
 * If the network calls fail (offline, API changes, etc.) it falls back to
 * a small snapshot captured 2026-07-10 so the page still renders something
 * useful.
 */

const WIKI_TITLE = "Oakwood (Harwood, Maryland)";
const WIKI_API = "https://en.wikipedia.org/w/api.php";
const WIKI_REST = "https://en.wikipedia.org/api/rest_v1/page/summary/";
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const COMMONS_CATEGORY = "Category:Oakwood (Harwood, Maryland)";

const FALLBACK = {
  description: "Historic house in Maryland, United States",
  extract:
    "Oakwood is a historic home located near Harwood, Anne Arundel County, Maryland. " +
    "Built in the 1850s, it is a 2½-story, frame vernacular farmhouse with Greek " +
    "Revival&ndash;influenced details, and is a highly intact, mid-19th-century tobacco " +
    "plantation dwelling. It is associated with Sprigg Harwood, a leader in the failed " +
    "initiative to have Maryland leave the Union and align with the Confederate States " +
    "of America. It was added to the National Register of Historic Places in 2001.",
  facts: [
    ["Location", "Near Harwood, Anne Arundel County, Maryland"],
    ["Coordinates", "38°51′26″N 76°37′4″W"],
    ["Built", "1850s"],
    ["Architectural style", "Greek Revival influences"],
    ["NRHP reference No.", "01000820"],
    ["Added to NRHP", "August 2, 2001"]
  ],
  lat: 38.85719,
  lon: -76.61781
};

const $ = (id) => document.getElementById(id);

function showErrorBanner() {
  $("error-banner").hidden = false;
}

function absolutizeWikiUrls(root) {
  root.querySelectorAll("a[href]").forEach((a) => {
    const href = a.getAttribute("href");
    if (!href) return;
    if (href.startsWith("//")) {
      a.setAttribute("href", "https:" + href);
    } else if (href.startsWith("/wiki/")) {
      a.setAttribute("href", "https://en.wikipedia.org" + href);
    } else if (href.startsWith("#")) {
      a.setAttribute("href", "https://en.wikipedia.org/wiki/" + encodeURIComponent(WIKI_TITLE.replace(/ /g, "_")) + href);
    }
    if (a.getAttribute("href")?.startsWith("http")) {
      a.setAttribute("target", "_blank");
      a.setAttribute("rel", "noopener");
    }
  });
  root.querySelectorAll("img[src]").forEach((img) => {
    const src = img.getAttribute("src");
    if (src && src.startsWith("//")) img.setAttribute("src", "https:" + src);
    img.removeAttribute("srcset");
    img.removeAttribute("decoding");
  });
}

function stripNoise(root) {
  root.querySelectorAll(
    ".mw-editsection, sup.reference, .navbox, .ambox, .hatnote, .noprint, .mw-empty-elt, script, style"
  ).forEach((el) => el.remove());
}

function renderFactsTable(container, caption, imgHtml, imgCaption, rows) {
  const table = document.createElement("table");
  const capEl = document.createElement("caption");
  capEl.textContent = caption;
  table.appendChild(capEl);
  const tbody = document.createElement("tbody");
  rows.forEach(([label, value]) => {
    if (!value) return;
    const tr = document.createElement("tr");
    const th = document.createElement("th");
    th.scope = "row";
    th.textContent = label;
    const td = document.createElement("td");
    if (value instanceof Node) {
      td.appendChild(value);
    } else {
      td.innerHTML = value;
    }
    tr.append(th, td);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  container.innerHTML = "";
  if (imgHtml) {
    const wrap = document.createElement("div");
    wrap.innerHTML = imgHtml;
    container.appendChild(wrap);
    if (imgCaption) {
      const cap = document.createElement("p");
      cap.className = "infobox-caption";
      cap.textContent = imgCaption;
      container.appendChild(cap);
    }
  }
  container.appendChild(table);
}

function renderFallbackFacts() {
  renderFactsTable($("infobox-content"), "Oakwood", null, null, FALLBACK.facts);
}

function renderFallbackContent() {
  $("lead-extract").innerHTML = `<p>${FALLBACK.extract}</p>`;
  $("tagline").textContent = FALLBACK.description;
  renderFallbackFacts();
  setupMap(FALLBACK.lat, FALLBACK.lon, "approximate, from published NRHP records");
}

function setupMap(lat, lon, note) {
  if (typeof lat !== "number" || typeof lon !== "number") return;
  const d = 0.006;
  const bbox = [lon - d, lat - d, lon + d, lat + d].join("%2C");
  $("map-iframe").src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat}%2C${lon}`;
  $("coords-caption").textContent = `${lat.toFixed(5)}, ${lon.toFixed(5)} (${note})`;
  $("map-section").hidden = false;
}

async function loadSummary() {
  const res = await fetch(WIKI_REST + encodeURIComponent(WIKI_TITLE.replace(/ /g, "_")), {
    headers: { Accept: "application/json" }
  });
  if (!res.ok) throw new Error("summary fetch failed: " + res.status);
  const data = await res.json();
  if (data.description) $("tagline").textContent = data.description;
  if (data.thumbnail || data.originalimage) {
    const src = (data.originalimage || data.thumbnail).source;
    const media = $("hero-media");
    media.innerHTML = "";
    const img = document.createElement("img");
    img.src = src;
    img.alt = data.title || WIKI_TITLE;
    img.loading = "eager";
    media.appendChild(img);
  }
  return data;
}

async function loadArticleBody() {
  const params = new URLSearchParams({
    action: "parse",
    page: WIKI_TITLE,
    prop: "text|revid",
    format: "json",
    formatversion: "2",
    origin: "*"
  });
  const res = await fetch(`${WIKI_API}?${params.toString()}`);
  if (!res.ok) throw new Error("parse fetch failed: " + res.status);
  const data = await res.json();
  if (data.error) throw new Error(data.error.info || "parse API error");
  return data.parse;
}

function extractGeoFromDoc(doc) {
  const geo = doc.querySelector(".geo, .geo-dec");
  if (!geo) return null;
  const text = geo.textContent.trim();
  const m = text.match(/(-?\d+\.?\d*)[;,\s]+(-?\d+\.?\d*)/);
  if (!m) return null;
  return { lat: parseFloat(m[1]), lon: parseFloat(m[2]) };
}

function renderArticle(parse) {
  const doc = new DOMParser().parseFromString(parse.text, "text/html");
  const root = doc.querySelector(".mw-parser-output") || doc.body;
  stripNoise(root);

  const geo = extractGeoFromDoc(root);

  const infobox = root.querySelector(".infobox");
  let infoboxImgHtml = null;
  let infoboxCaption = null;
  let factsRows = [];
  if (infobox) {
    absolutizeWikiUrls(infobox);
    const img = infobox.querySelector("img");
    if (img) {
      infoboxImgHtml = infobox.querySelector("a img") ? infobox.querySelector("a img").outerHTML : img.outerHTML;
      const capEl = infobox.querySelector(".infobox-caption, .infobox-image + tr td");
      if (capEl) infoboxCaption = capEl.textContent.trim();
    }
    infobox.querySelectorAll("tr").forEach((tr) => {
      const th = tr.querySelector("th");
      const td = tr.querySelector("td");
      if (th && td && !td.querySelector("img")) {
        factsRows.push([th.textContent.trim(), td.innerHTML.trim()]);
      }
    });
    infobox.remove();
  }
  if (factsRows.length) {
    renderFactsTable($("infobox-content"), "Oakwood", infoboxImgHtml, infoboxCaption, factsRows);
  } else {
    renderFallbackFacts();
  }

  absolutizeWikiUrls(root);

  // Split lead (before first h2) from the rest of the body, and drop
  // link-only / meta sections entirely (we present our own links & gallery).
  const SKIP_SECTIONS = /^(see also|references|external links|notes|further reading|gallery|bibliography|sources)$/;
  const lead = document.createElement("div");
  const rest = document.createElement("div");
  let inLead = true;
  let skipping = false;
  Array.from(root.childNodes).forEach((node) => {
    const isHeading = node.nodeType === 1 && /^H[2-6]$/.test(node.tagName);
    if (isHeading) {
      inLead = false;
      skipping = SKIP_SECTIONS.test(node.textContent.trim().toLowerCase());
      if (skipping) return;
    } else if (skipping) {
      return;
    }
    (inLead && node.nodeType === 1 && node.tagName === "P" ? lead : rest).appendChild(node.cloneNode(true));
  });

  $("lead-extract").innerHTML = lead.innerHTML || "";
  $("full-content").innerHTML = rest.innerHTML || "";

  if (geo) setupMap(geo.lat, geo.lon, "from Wikipedia");
  else setupMap(FALLBACK.lat, FALLBACK.lon, "approximate, from published NRHP records");

  if (parse.revid) {
    fetch(
      `${WIKI_API}?${new URLSearchParams({
        action: "query",
        prop: "revisions",
        revids: parse.revid,
        rvprop: "timestamp",
        format: "json",
        formatversion: "2",
        origin: "*"
      })}`
    )
      .then((r) => r.json())
      .then((d) => {
        const ts = d?.query?.pages?.[0]?.revisions?.[0]?.timestamp;
        if (ts) {
          const date = new Date(ts);
          $("last-updated").textContent =
            "Wikipedia article last edited " +
            date.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) +
            ".";
        }
      })
      .catch(() => {});
  }
}

async function loadGallery() {
  const listParams = new URLSearchParams({
    action: "query",
    list: "categorymembers",
    cmtitle: COMMONS_CATEGORY,
    cmtype: "file",
    cmlimit: "24",
    format: "json",
    formatversion: "2",
    origin: "*"
  });
  const listRes = await fetch(`${COMMONS_API}?${listParams}`);
  if (!listRes.ok) throw new Error("commons list failed");
  const listData = await listRes.json();
  const titles = (listData.query?.categorymembers || []).map((m) => m.title);
  if (!titles.length) return;

  const infoParams = new URLSearchParams({
    action: "query",
    titles: titles.join("|"),
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "400",
    format: "json",
    formatversion: "2",
    origin: "*"
  });
  const infoRes = await fetch(`${COMMONS_API}?${infoParams}`);
  if (!infoRes.ok) throw new Error("commons imageinfo failed");
  const infoData = await infoRes.json();
  const pages = infoData.query?.pages || [];

  const gallery = $("gallery");
  gallery.innerHTML = "";
  let count = 0;
  pages.forEach((page) => {
    const info = page.imageinfo && page.imageinfo[0];
    if (!info) return;
    const url = info.thumburl || info.url;
    const artist = info.extmetadata?.Artist?.value?.replace(/<[^>]+>/g, "") || "";
    const desc = info.extmetadata?.ImageDescription?.value?.replace(/<[^>]+>/g, "") || page.title.replace(/^File:/, "");
    const figure = document.createElement("figure");
    figure.innerHTML = `
      <a href="${info.descriptionurl}" target="_blank" rel="noopener">
        <img src="${url}" alt="${desc.replace(/"/g, "&quot;")}" loading="lazy">
      </a>
      <figcaption>${desc}${artist ? " &middot; " + artist : ""}</figcaption>
    `;
    gallery.appendChild(figure);
    count++;
  });
  if (count) $("gallery-section").hidden = false;
}

async function init() {
  let hadFailure = false;

  try {
    await loadSummary();
  } catch (e) {
    console.error(e);
    hadFailure = true;
  }

  try {
    const parse = await loadArticleBody();
    renderArticle(parse);
  } catch (e) {
    console.error(e);
    hadFailure = true;
    renderFallbackContent();
  }

  loadGallery().catch((e) => console.error("gallery load skipped:", e));

  if (hadFailure) showErrorBanner();
}

init();
