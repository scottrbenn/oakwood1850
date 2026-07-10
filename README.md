# oakwood1850.com

A one-page site for **Oakwood**, the 1850s farmhouse near Harwood, Anne Arundel
County, Maryland, listed on the National Register of Historic Places.

## How it works

This is a static site (`index.html` + `css/style.css` + `js/app.js`) with no
build step and no server-side code. When a visitor loads the page, their
browser calls the public Wikipedia/Wikimedia APIs directly and renders:

- the current lead paragraph and any additional body sections from the
  [Wikipedia article](https://en.wikipedia.org/wiki/Oakwood_(Harwood,_Maryland))
- the infobox (location, coordinates, year built, architectural style, NRHP
  reference number, etc.)
- the article's hero photo (via the REST summary endpoint)
- a location map built from the coordinates in the infobox
- a gallery of every photo in the
  [Wikimedia Commons category](https://commons.wikimedia.org/wiki/Category:Oakwood_(Harwood,_Maryland))
  for the house

Because it fetches live at request time, the page automatically reflects
future edits to the Wikipedia article or new photos added to the Commons
category — no redeploy needed.

If the Wikipedia API can't be reached (offline, API changes, etc.), the page
falls back to a small hard-coded snapshot in `js/app.js` (captured
2026-07-10) so it never shows a broken page.

All Wikipedia text is reused under the
[CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) license, and
attribution is included in the page footer.

## Deploying to oakwood1850.com

Any static host works. The included `CNAME` file is set up for **GitHub
Pages**:

1. Push this repo to GitHub and enable **Settings → Pages → Deploy from a
   branch** (root of `main`).
2. At your domain registrar, point `oakwood1850.com` at GitHub Pages:
   - `A` records for `@` → `185.199.108.153`, `185.199.109.153`,
     `185.199.110.153`, `185.199.111.153`
   - `CNAME` record for `www` → `<your-github-username>.github.io`
3. In GitHub Pages settings, set the custom domain to `oakwood1850.com` and
   enable "Enforce HTTPS" once the certificate provisions.

To use a different static host (Netlify, Vercel, Cloudflare Pages, S3, etc.)
instead, just delete `CNAME` and point the domain's DNS at that host per its
own instructions — no code changes are needed.

## Local preview

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`.
