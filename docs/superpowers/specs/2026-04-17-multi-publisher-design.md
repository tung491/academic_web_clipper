# Multi-Publisher Support — Design Spec

## Overview

Refactor the Academic Web Clipper Chrome extension to support 7 academic publishers via a URL-based router and per-publisher content scripts. Each publisher gets its own extraction script sharing a common interface and helper module.

## Supported Publishers

| Publisher | URL Pattern | Content Script |
|-----------|------------|----------------|
| IEEE Xplore | `ieeexplore.ieee.org` | `content/ieee.js` |
| arXiv (HTML) | `arxiv.org/html/` | `content/arxiv.js` |
| Springer | `link.springer.com` | `content/springer.js` |
| ACM Digital Library | `dl.acm.org` | `content/acm.js` |
| ScienceDirect | `sciencedirect.com` | `content/sciencedirect.js` |
| MDPI | `mdpi.com` | `content/mdpi.js` |
| HAL Science | `hal.science` | `content/hal.js` |

## Architecture

### Publisher Registry (Service Worker)

The service worker maintains a publisher registry — an array of `{ name, pattern, script }` objects:

```javascript
const PUBLISHERS = [
  { name: 'IEEE Xplore',    pattern: /ieeexplore\.ieee\.org/,    script: 'content/ieee.js' },
  { name: 'arXiv',          pattern: /arxiv\.org\/html\//,        script: 'content/arxiv.js' },
  { name: 'Springer',       pattern: /link\.springer\.com/,       script: 'content/springer.js' },
  { name: 'ACM DL',         pattern: /dl\.acm\.org/,              script: 'content/acm.js' },
  { name: 'ScienceDirect',  pattern: /sciencedirect\.com/,        script: 'content/sciencedirect.js' },
  { name: 'MDPI',           pattern: /mdpi\.com/,                 script: 'content/mdpi.js' },
  { name: 'HAL Science',   pattern: /hal\.science/,              script: 'content/hal.js' },
];
```

On a clip request, the service worker matches `tab.url` against these patterns and injects the corresponding content script. If no pattern matches, it sends an error to the popup: "Unsupported page. Navigate to a paper on a supported publisher site."

For arXiv specifically: if the URL matches `arxiv.org/abs/` (abstract page) but not `arxiv.org/html/` (full text), the popup shows: "Open the HTML version of this arXiv paper to clip it." This is handled in the popup's detection logic, not the service worker.

The `PUBLISHERS` registry is the single source of truth for URL patterns. The popup imports or duplicates the pattern list — see the Popup section for sync details.

### Data Flow

```
User clicks icon → Popup detects supported publisher from tab URL
→ Sends "clip" message to service worker
→ Service worker matches URL against PUBLISHERS registry
→ Injects ['content/shared.js', 'content/{publisher}.js'] into tab
→ Content script extracts { metadata, sections, figures }
→ Sends extractionResult to service worker
→ Service worker converts to markdown, creates zip, downloads
```

The downstream pipeline (markdown conversion, zip creation, download) is unchanged. All publisher scripts produce the same data shape.

### Content Script Interface

Every publisher content script follows this structure:

```javascript
// content/{publisher}.js
// Injected after content/shared.js

(async function extractPaper() {
  try {
    const metadata = extractMetadata();
    const sections = extractSections();
    const figures = await extractFigures();
    sendExtractionResult({ metadata, sections, figures });
  } catch (err) {
    sendExtractionError(err.message);
  }
})();

function extractMetadata() { /* returns { title, authors, doi, date, venue, keywords, abstract } */ }
function extractSections() { /* returns [{ heading, content: [{ type, text/figureId }] }] */ }
async function extractFigures() { /* returns [{ id, url, filename, caption, dataUrl }] */ }
```

### Shared Helpers (`content/shared.js`)

Injected before the publisher script via `chrome.scripting.executeScript({ files: ['content/shared.js', 'content/{publisher}.js'] })`.

Contains:

- `sendExtractionResult(data)` — wraps `chrome.runtime.sendMessage({ type: 'extractionResult', data })`
- `sendExtractionError(message)` — wraps `chrome.runtime.sendMessage({ type: 'extractionResult', error: message })`. The service worker distinguishes success from error by checking `extractionData.error`: if truthy, it sends `sendProgress('error', extractionData.error)` to the popup; otherwise it proceeds with `extractionData.metadata`/`sections`/`figures`. This is the existing V1 pattern, unchanged.
- `fetchAndConvertToPng(url)` — creates an Image, draws onto canvas, returns `canvas.toDataURL('image/png')`. For cross-origin images where CORS headers are not set (tainted canvas), falls back to fetching via `fetch()` with `credentials: 'include'` and returning the raw data URL via `FileReader.readAsDataURL()`. This fallback preserves the original format but avoids the canvas security error.

Note: `content/shared.js` is injected via `chrome.scripting.executeScript` and does NOT need to be listed in `web_accessible_resources`. Only resources accessed from web page context (not extension context) require that declaration.

## Publisher Extraction Details

### IEEE Xplore (`ieeexplore.ieee.org`)

Already implemented. Refactored to use `shared.js` helpers.

- Metadata: `.document-title`, `.authors-info`, meta tags
- Sections: `.section_2`, `.document-ft-section-container`
- Figures: `img[src*="mediastore"]`, replace `-small` with `-large`

### arXiv HTML (`arxiv.org/html/...`)

- Metadata: `h1.ltx_title`, `.ltx_authors .ltx_personname`, meta tags for DOI/date. Venue from `.ltx_classification` or meta tags.
- Sections: `.ltx_section` elements with `.ltx_title` headings. Nested subsections via `.ltx_subsection`.
- Figures: `.ltx_figure img` with `figcaption.ltx_caption`. Images are standard `<img>` tags with relative URLs.

### Springer (`link.springer.com`)

- Metadata: `h1.c-article-title`, `[data-test="author-name"]`, `.c-article-info-details` for date/venue, DOI from meta tags.
- Sections: `.c-article-section` with `h2`/`h3` headings.
- Figures: `figure img`, standard `<figcaption>` elements. Images may be lazy-loaded via `data-src`.

### ACM Digital Library (`dl.acm.org`)

- Metadata: `h1.citation__title`, `.author-name`, `.issue-item__detail` for venue/date, DOI from URL or meta tags.
- Sections: `.article__section` with heading elements.
- Figures: `figure.figure img`, `figcaption`. Images often served from `dl.acm.org/cms/attachment/...`.

### ScienceDirect (`sciencedirect.com`)

- Metadata: `h1.title-text` or `span.title-text`, `.author`, `.publication-title-link` for venue, DOI from meta tags.
- Sections: sections identified by `h2`/`h3` within `.Body` or `#body`. Paragraphs in `.section-paragraph` or `p` tags.
- Figures: `.figure img` or `img.imgLazyJSB`, lazy-loaded. Captions in `.captions` or `figcaption`. Equations rendered as images with class `.mathml-image`.

### MDPI (`mdpi.com`)

- Metadata: `h1.title`, `.art-authors .sciprofiles-link`, `.journal-name` for venue, DOI from meta tags.
- Sections: `.html-body` content, paragraphs in `.html-p`, grouped by `h2`/`h4` headings with class `.html-h2`, `.html-h4`.
- Figures: `.html-fig img`, captions in `.html-fig_description`.

### HAL Science (`hal.science`)

- Metadata: `h1.title` or `.paper-title`, `.authors-list a` for authors, DOI from meta tags or `.paper-doi`, date from `.submission-date` or meta tags. Venue from `.journal-title` or `.conference-title`.
- Sections: `.paper-content` area, sections grouped by `h2`/`h3` headings.
- Figures: `figure img` with `figcaption`. Standard HTML5 figure elements. Images served from `hal.science` or external URLs.

## Changes to Existing Files

### `manifest.json`

Expand host permissions:

```json
"host_permissions": [
  "*://ieeexplore.ieee.org/*",
  "*://arxiv.org/*",
  "*://link.springer.com/*",
  "*://dl.acm.org/*",
  "*://www.sciencedirect.com/*",
  "*://www.mdpi.com/*",
  "*://hal.science/*"
]
```

### `background/service-worker.js`

- Add `PUBLISHERS` registry array
- Replace hardcoded `ieeexplore.ieee.org` check with registry lookup
- Change `injectAndWaitForResult(tabId)` to accept a `scriptPath` parameter
- Inject two files: `['content/shared.js', scriptPath]`

### `popup/popup.js`

- Replace hardcoded IEEE URL check with publisher-agnostic pattern matching. To keep the popup and service worker in sync, define the pattern list in a shared module `content/publishers.js` that both can reference. However, since the popup cannot import ES modules and the service worker uses `"type": "module"`, the pragmatic approach is to maintain a parallel list in `popup.js` with a code comment referencing the service worker's `PUBLISHERS` array as the authoritative source.

```javascript
// Keep in sync with PUBLISHERS in background/service-worker.js
const SUPPORTED_PATTERNS = [
  /ieeexplore\.ieee\.org/,
  /arxiv\.org\/html\//,
  /link\.springer\.com/,
  /dl\.acm\.org/,
  /sciencedirect\.com/,
  /mdpi\.com/,
  /hal\.science/,
];
const isSupported = SUPPORTED_PATTERNS.some(p => p.test(tab.url));
```

- Detect arXiv abstract pages (`arxiv.org/abs/`) separately and show a specific message: "Open the HTML version of this arXiv paper to clip it."

### `content/ieee.js`

- Remove `fetchAndConvertToPng` (moved to `shared.js`)
- Remove `chrome.runtime.sendMessage` wrappers (use `sendExtractionResult`/`sendExtractionError` from `shared.js`)

## File Structure

```
content/
├── shared.js           # Shared helpers (messaging, image conversion)
├── ieee.js             # IEEE Xplore (refactored)
├── arxiv.js            # arXiv HTML full-text
├── springer.js         # Springer Link
├── acm.js              # ACM Digital Library
├── sciencedirect.js    # ScienceDirect
├── mdpi.js             # MDPI
└── hal.js              # HAL Science
```

Modified:
- `manifest.json`
- `background/service-worker.js`
- `popup/popup.js`
- `popup/popup.html`
- `content/ieee.js`

Unchanged:
- `lib/markdown.js`
- `lib/zip.js`
- `options/`
- `popup/popup.css`

## Testing

- Unit tests for `lib/markdown.js` — unchanged, already publisher-agnostic
- Manual integration testing per publisher with one real paper each
- Each publisher script independently testable by loading extension and visiting a paper

### Test URLs

| Publisher | Test URL |
|-----------|----------|
| IEEE | `https://ieeexplore.ieee.org/abstract/document/9398576` |
| arXiv | `https://arxiv.org/html/2301.00234` |
| Springer | `https://link.springer.com/article/10.1007/s00521-023-08362-1` |
| ACM | `https://dl.acm.org/doi/10.1145/3544548.3581388` |
| ScienceDirect | `https://www.sciencedirect.com/science/article/pii/S0925231223000012` |
| MDPI | `https://www.mdpi.com/2076-3417/13/1/1` |
| HAL | `https://hal.science/hal-03000000` |

## Future Enhancements (Out of Scope)

- Auto-detect arXiv abstract page and redirect to HTML version
- Support for additional publishers (Wiley, Taylor & Francis, Nature)
- Publisher-specific settings or selector overrides
