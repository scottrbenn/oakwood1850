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
    ["Built", "1850s"],
    ["Architectural style", "Greek Revival influences"],
    ["NRHP reference No.", "01000820"],
    ["Added to NRHP", "August 2, 2001"]
  ]
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
    ".mw-editsection, sup.reference, .navbox, .ambox, .hatnote, .noprint, .mw-empty-elt, script, style, " +
    "#coordinates, .geo, .geo-dec, .geo-dms, .geo-nondefault, .geo-default, .geo-multi-punct"
  ).forEach((el) => el.remove());
}

function renderFactsTable(container, caption, rows) {
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
  container.appendChild(table);
}

function renderFallbackFacts() {
  renderFactsTable($("infobox-content"), "Oakwood", FALLBACK.facts);
}

function renderFallbackContent() {
  $("lead-extract").innerHTML = `<p>${FALLBACK.extract}</p>`;
  $("tagline").textContent = FALLBACK.description;
  renderFallbackFacts();
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

function renderArticle(parse) {
  const doc = new DOMParser().parseFromString(parse.text, "text/html");
  const root = doc.querySelector(".mw-parser-output") || doc.body;
  stripNoise(root);

  const infobox = root.querySelector(".infobox");
  let factsRows = [];
  if (infobox) {
    absolutizeWikiUrls(infobox);
    infobox.querySelectorAll("tr").forEach((tr) => {
      const th = tr.querySelector("th");
      const td = tr.querySelector("td");
      if (th && td && !td.querySelector("img") && !/coordinat/i.test(th.textContent.trim())) {
        factsRows.push([th.textContent.trim(), td.innerHTML.trim()]);
      }
    });
    infobox.remove();
  }
  if (factsRows.length) {
    renderFactsTable($("infobox-content"), "Oakwood", factsRows);
  } else {
    renderFallbackFacts();
  }

  absolutizeWikiUrls(root);

  // Split lead (before first heading) from the rest of the body, and drop
  // link-only / meta sections entirely (we present our own links & gallery).
  // Recent MediaWiki output wraps each heading as
  // <div class="mw-heading mw-heading2"><h2>...</h2></div> instead of a bare
  // <h2>, so we need to look inside these wrapper divs too.
  const SKIP_SECTIONS = /^(see also|references|external links|notes|further reading|gallery|bibliography|sources)$/;
  const headingIn = (node) => {
    if (node.nodeType !== 1) return null;
    if (/^H[1-6]$/.test(node.tagName)) return node;
    if (node.classList.contains("mw-heading")) return node.querySelector("h1,h2,h3,h4,h5,h6");
    return null;
  };
  const lead = document.createElement("div");
  const rest = document.createElement("div");
  let inLead = true;
  let skipping = false;
  Array.from(root.childNodes).forEach((node) => {
    const headingEl = headingIn(node);
    if (headingEl) {
      inLead = false;
      skipping = SKIP_SECTIONS.test(headingEl.textContent.trim().toLowerCase());
      if (skipping) return;
    } else if (skipping) {
      return;
    }
    (inLead && node.nodeType === 1 && node.tagName === "P" ? lead : rest).appendChild(node.cloneNode(true));
  });

  $("lead-extract").innerHTML = lead.innerHTML || "";
  $("full-content").innerHTML = rest.innerHTML || "";

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
