# Multi-Publisher Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Academic Web Clipper to support 7 publishers (IEEE, arXiv, Springer, ACM, ScienceDirect, MDPI, HAL) via a URL-based router and per-publisher content scripts.

**Architecture:** Each publisher gets its own content script sharing a common `shared.js` helper module. The service worker matches tab URLs against a publisher registry and injects the correct script pair. All downstream code (markdown, zip, download) is unchanged.

**Tech Stack:** Vanilla JavaScript, Chrome Extension Manifest V3

**Spec:** `docs/superpowers/specs/2026-04-17-multi-publisher-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `content/shared.js` | Create | Shared helpers: messaging, image fetch/convert |
| `content/ieee.js` | Modify | Refactor to use shared.js helpers |
| `content/arxiv.js` | Create | arXiv HTML full-text extraction |
| `content/springer.js` | Create | Springer Link extraction |
| `content/acm.js` | Create | ACM Digital Library extraction |
| `content/sciencedirect.js` | Create | ScienceDirect extraction |
| `content/mdpi.js` | Create | MDPI extraction |
| `content/hal.js` | Create | HAL Science extraction |
| `background/service-worker.js` | Modify | Add publisher registry + URL router |
| `popup/popup.js` | Modify | Publisher-agnostic URL detection |
| `manifest.json` | Modify | Expand host permissions |

---

## Task 1: Shared Helpers Module + Refactor IEEE

Extract shared code from `ieee.js` into `shared.js`, then refactor `ieee.js` to use it.

**Files:**
- Create: `content/shared.js`
- Modify: `content/ieee.js`

- [ ] **Step 1: Create `content/shared.js`**

```javascript
// content/shared.js
// Shared helpers injected before publisher-specific content scripts.

function sendExtractionResult(data) {
  chrome.runtime.sendMessage({ type: 'extractionResult', data });
}

function sendExtractionError(message) {
  chrome.runtime.sendMessage({ type: 'extractionResult', error: message });
}

function fetchAndConvertToPng(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (e) {
        // Canvas tainted by CORS — fall back to raw fetch with cookies
        fetchAsDataUrl(url).then(resolve).catch(reject);
      }
    };
    img.onerror = () => {
      // Image element failed (CORS rejection) — fall back to fetch with cookies
      fetchAsDataUrl(url).then(resolve).catch(reject);
    };
    img.src = url;
  });
}

function fetchAsDataUrl(url) {
  return fetch(url, { credentials: 'include' })
    .then(r => r.blob())
    .then(blob => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    }));
}
```

- [ ] **Step 2: Refactor `content/ieee.js` — remove duplicated helpers, use shared functions**

Replace the IIFE wrapper and remove `fetchAndConvertToPng`:

```javascript
// content/ieee.js
// IEEE Xplore extraction. Injected after content/shared.js.

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

// extractMetadata(), extractSections(), extractFigures() stay the same
// but remove the fetchAndConvertToPng function (now in shared.js)
```

Specifically: keep all extraction functions as-is, only remove:
- The `chrome.runtime.sendMessage` calls in the IIFE (replace with `sendExtractionResult`/`sendExtractionError`)
- The `fetchAndConvertToPng` function definition (lines 168-183 of current file)

- [ ] **Step 3: Verify ieee.js still has no syntax errors**

Run: `node --check content/shared.js && node --check content/ieee.js && echo "OK"`

- [ ] **Step 4: Commit**

```bash
git add content/shared.js content/ieee.js
git commit -m "refactor: extract shared helpers, refactor IEEE to use them"
```

---

## Task 2: Service Worker — Publisher Registry + URL Router

**Files:**
- Modify: `background/service-worker.js`

- [ ] **Step 1: Add publisher registry and update URL matching**

Replace the hardcoded IEEE check with a registry lookup. Update `injectAndWaitForResult` to accept a script path.

At the top of the file (after imports), add:

```javascript
const PUBLISHERS = [
  { name: 'IEEE Xplore',    pattern: /ieeexplore\.ieee\.org/,    script: 'content/ieee.js' },
  { name: 'arXiv',          pattern: /arxiv\.org\/html\//,        script: 'content/arxiv.js' },
  { name: 'Springer',       pattern: /link\.springer\.com/,       script: 'content/springer.js' },
  { name: 'ACM DL',         pattern: /dl\.acm\.org/,              script: 'content/acm.js' },
  { name: 'ScienceDirect',  pattern: /sciencedirect\.com/,        script: 'content/sciencedirect.js' },
  { name: 'MDPI',           pattern: /mdpi\.com/,                 script: 'content/mdpi.js' },
  { name: 'HAL Science',    pattern: /hal\.science/,              script: 'content/hal.js' },
];
```

In `handleClip`, replace:
```javascript
// OLD:
if (!tab || !tab.url.includes('ieeexplore.ieee.org')) {
  sendProgress('error', 'Not on an IEEE Xplore page');
  return;
}
const extractionData = await injectAndWaitForResult(tab.id);

// NEW:
const publisher = PUBLISHERS.find(p => p.pattern.test(tab?.url || ''));
if (!publisher) {
  sendProgress('error', 'Not on a supported publisher page');
  return;
}
const extractionData = await injectAndWaitForResult(tab.id, publisher.script);
```

Update `injectAndWaitForResult` signature and injection:
```javascript
function injectAndWaitForResult(tabId, scriptPath) {
  // ... same Promise structure ...
  chrome.scripting.executeScript({
    target: { tabId },
    files: ['content/shared.js', scriptPath]  // inject shared.js first
  }).catch(err => {
    // ... same error handling ...
  });
}
```

- [ ] **Step 2: Verify syntax**

Run: `node --check background/service-worker.js && echo "OK"`

- [ ] **Step 3: Commit**

```bash
git add background/service-worker.js
git commit -m "feat: add publisher registry and URL-based script router"
```

---

## Task 3: Popup — Publisher-Agnostic Detection

**Files:**
- Modify: `popup/popup.js`

- [ ] **Step 1: Update `popup/popup.html` — rename IDs and update message**

In `popup/popup.html`:
- Rename `id="ieee-view"` to `id="supported-view"`
- Rename `id="non-ieee-view"` to `id="unsupported-view"`
- Change the unsupported message: `<p>Navigate to a supported academic paper to clip it.</p>`

- [ ] **Step 2: Rewrite `popup/popup.js` — publisher-agnostic detection**

Replace the entire file. Key changes: rename `ieeeView`/`nonIeeeView` to `supportedView`/`unsupportedView`, add `SUPPORTED_PATTERNS` array, add arXiv abstract detection:

```javascript
// popup/popup.js

const supportedView = document.getElementById('supported-view');
const unsupportedView = document.getElementById('unsupported-view');
const paperTitle = document.getElementById('paper-title');
const savePathInput = document.getElementById('save-path');
const clipBtn = document.getElementById('clip-btn');
const progressDiv = document.getElementById('progress');
const progressText = document.getElementById('progress-text');
const resultDiv = document.getElementById('result');
const settingsLink = document.getElementById('settings-link');

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

const ARXIV_ABSTRACT = /arxiv\.org\/abs\//;

chrome.storage.sync.get(['defaultSavePath'], (result) => {
  savePathInput.value = result.defaultSavePath || 'Papers';
});

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (tab && tab.url && SUPPORTED_PATTERNS.some(p => p.test(tab.url))) {
    supportedView.style.display = 'block';
    paperTitle.textContent = tab.title.replace(/\s*[\|\-–—].*$/, '').trim() || 'Academic Paper';
  } else if (tab && tab.url && ARXIV_ABSTRACT.test(tab.url)) {
    unsupportedView.style.display = 'block';
    unsupportedView.querySelector('p').textContent = 'Open the HTML version of this arXiv paper to clip it.';
  } else {
    unsupportedView.style.display = 'block';
  }
});

clipBtn.addEventListener('click', () => {
  clipBtn.disabled = true;
  progressDiv.style.display = 'block';
  resultDiv.style.display = 'none';
  progressText.textContent = 'Starting...';
  const savePath = savePathInput.value.trim();
  chrome.runtime.sendMessage({ type: 'clip', savePath });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== 'progress') return;
  const { stage, detail } = message;
  if (stage === 'extracting') {
    progressText.textContent = 'Extracting paper content...';
  } else if (stage === 'downloading') {
    progressText.textContent = 'Downloading images...';
  } else if (stage === 'done') {
    progressDiv.style.display = 'none';
    resultDiv.style.display = 'block';
    resultDiv.className = 'success';
    resultDiv.textContent = `✓ ${detail}`;
    clipBtn.disabled = false;
  } else if (stage === 'error') {
    progressDiv.style.display = 'none';
    resultDiv.style.display = 'block';
    resultDiv.className = 'error';
    resultDiv.textContent = `✗ Error: ${detail}`;
    clipBtn.disabled = false;
  }
});

settingsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
```

- [ ] **Step 3: Commit**

```bash
git add popup/popup.js popup/popup.html
git commit -m "feat: publisher-agnostic popup with renamed IDs"
```

---

## Task 4: Manifest — Expand Host Permissions

**Files:**
- Modify: `manifest.json`

- [ ] **Step 1: Update host permissions and description**

Replace the `host_permissions` array:

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

Update description:
```json
"description": "Clip academic papers to Obsidian-compatible markdown"
```

- [ ] **Step 2: Commit**

```bash
git add manifest.json
git commit -m "feat: expand host permissions for all 7 publishers"
```

---

## Task 5: arXiv Content Script

**Files:**
- Create: `content/arxiv.js`

- [ ] **Step 1: Create `content/arxiv.js`**

```javascript
// content/arxiv.js
// arXiv HTML full-text extraction. Injected after content/shared.js.

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

function extractMetadata() {
  const title = document.querySelector('h1.ltx_title')?.textContent?.replace('Title:', '').trim()
    || document.querySelector('meta[name="citation_title"]')?.content
    || 'Untitled';

  const authorEls = document.querySelectorAll('.ltx_authors .ltx_personname, meta[name="citation_author"]');
  const authors = [...authorEls].map(el => (el.content || el.textContent).trim()).filter(Boolean);

  const abstract = document.querySelector('.ltx_abstract .ltx_p')?.textContent?.trim() || '';

  const doi = document.querySelector('meta[name="citation_doi"]')?.content
    || document.querySelector('a[href*="doi.org"]')?.textContent?.trim() || '';

  const date = document.querySelector('meta[name="citation_date"]')?.content
    || document.querySelector('meta[name="citation_publication_date"]')?.content || '';

  const venue = document.querySelector('meta[name="citation_journal_title"]')?.content || 'arXiv';

  const keywords = [];
  document.querySelectorAll('.ltx_classification .ltx_text').forEach(el => {
    const kw = el.textContent.trim();
    if (kw && !keywords.includes(kw)) keywords.push(kw);
  });

  return { title, authors, doi, date, venue, keywords, abstract };
}

function extractSections() {
  const sections = [];

  const abstractEl = document.querySelector('.ltx_abstract .ltx_p');
  if (abstractEl) {
    sections.push({
      heading: 'Abstract',
      content: [{ type: 'paragraph', text: abstractEl.textContent.trim() }]
    });
  }

  document.querySelectorAll('.ltx_section, .ltx_subsection').forEach(sectionEl => {
    const headingEl = sectionEl.querySelector(':scope > .ltx_title');
    const heading = headingEl?.textContent?.trim() || 'Untitled Section';

    const content = [];
    sectionEl.querySelectorAll(':scope > .ltx_para .ltx_p, :scope > .ltx_para > p').forEach(p => {
      const text = p.textContent.trim();
      if (text) content.push({ type: 'paragraph', text });
    });

    sectionEl.querySelectorAll(':scope .ltx_figure').forEach(fig => {
      const img = fig.querySelector('img');
      if (img) {
        content.push({ type: 'figure', figureId: img.src || fig.id });
      }
    });

    if (content.length > 0) sections.push({ heading, content });
  });

  const refSection = document.querySelector('.ltx_bibliography');
  if (refSection) {
    const refs = refSection.querySelectorAll('.ltx_bibitem');
    if (refs.length > 0) {
      const refContent = [...refs].map((ref, i) => ({
        type: 'paragraph',
        text: `${i + 1}. ${ref.textContent.trim()}`
      }));
      sections.push({ heading: 'References', content: refContent });
    }
  }

  return sections;
}

async function extractFigures() {
  const figures = [];
  const figEls = document.querySelectorAll('.ltx_figure img');

  for (const img of figEls) {
    const src = img.src;
    if (!src) continue;

    img.scrollIntoView({ behavior: 'instant', block: 'center' });
    await new Promise(r => setTimeout(r, 200));

    const figureContainer = img.closest('.ltx_figure');
    const captionEl = figureContainer?.querySelector('.ltx_caption');
    const caption = captionEl?.textContent?.trim() || '';

    const index = figures.length + 1;
    const filename = `fig${index}.png`;
    const url = src.startsWith('http') ? src : new URL(src, window.location.origin).href;

    let dataUrl = null;
    try {
      dataUrl = await fetchAndConvertToPng(url);
    } catch (err) { /* skip */ }

    if (dataUrl) {
      figures.push({ id: src, url, filename, caption, dataUrl });
    }
  }

  window.scrollTo(0, 0);
  return figures;
}
```

- [ ] **Step 2: Commit**

```bash
git add content/arxiv.js
git commit -m "feat: add arXiv HTML content extraction script"
```

---

## Task 6: Springer Content Script

**Files:**
- Create: `content/springer.js`

- [ ] **Step 1: Create `content/springer.js`**

```javascript
// content/springer.js
// Springer Link extraction. Injected after content/shared.js.

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

function extractMetadata() {
  const title = document.querySelector('h1.c-article-title, h1.ArticleTitle')?.textContent?.trim()
    || document.querySelector('meta[name="citation_title"]')?.content || 'Untitled';

  const authorEls = document.querySelectorAll('[data-test="author-name"], .c-article-author-list a, meta[name="citation_author"]');
  const authors = [...authorEls].map(el => (el.content || el.textContent).trim()).filter(Boolean);

  const abstract = document.querySelector('#Abs1-content p, .c-article-section__content p')?.textContent?.trim() || '';

  const doi = document.querySelector('meta[name="citation_doi"]')?.content
    || document.querySelector('.c-bibliographic-information__value')?.textContent?.trim() || '';

  const date = document.querySelector('meta[name="citation_publication_date"]')?.content
    || document.querySelector('time')?.getAttribute('datetime') || '';

  const venue = document.querySelector('meta[name="citation_journal_title"]')?.content
    || document.querySelector('.c-article-info-details a')?.textContent?.trim() || '';

  const keywords = [];
  document.querySelectorAll('.c-article-subject-list__subject').forEach(el => {
    const kw = el.textContent.trim();
    if (kw && !keywords.includes(kw)) keywords.push(kw);
  });

  return { title, authors, doi, date, venue, keywords, abstract };
}

function extractSections() {
  const sections = [];

  const abstractEl = document.querySelector('#Abs1-content p');
  if (abstractEl) {
    sections.push({
      heading: 'Abstract',
      content: [{ type: 'paragraph', text: abstractEl.textContent.trim() }]
    });
  }

  document.querySelectorAll('.c-article-section').forEach(sectionEl => {
    const headingEl = sectionEl.querySelector('h2, h3');
    const heading = headingEl?.textContent?.trim() || 'Untitled Section';

    const content = [];
    sectionEl.querySelectorAll(':scope > .c-article-section__content p, :scope > p').forEach(p => {
      const text = p.textContent.trim();
      if (text) content.push({ type: 'paragraph', text });
    });

    sectionEl.querySelectorAll('figure').forEach(fig => {
      const img = fig.querySelector('img');
      if (img) {
        content.push({ type: 'figure', figureId: img.src || img.dataset.src || fig.id });
      }
    });

    if (content.length > 0) sections.push({ heading, content });
  });

  const refEls = document.querySelectorAll('#Bib1 .c-article-references__item, .c-article-references li');
  if (refEls.length > 0) {
    const refContent = [...refEls].map((ref, i) => ({
      type: 'paragraph',
      text: `${i + 1}. ${ref.textContent.trim()}`
    }));
    sections.push({ heading: 'References', content: refContent });
  }

  return sections;
}

async function extractFigures() {
  const figures = [];
  const figEls = document.querySelectorAll('figure img');

  for (const img of figEls) {
    const src = img.src || img.dataset.src;
    if (!src) continue;

    img.scrollIntoView({ behavior: 'instant', block: 'center' });
    await new Promise(r => setTimeout(r, 300));

    const actualSrc = img.src || img.dataset.src;
    if (!actualSrc) continue;

    const figureContainer = img.closest('figure');
    const captionEl = figureContainer?.querySelector('figcaption');
    const caption = captionEl?.textContent?.trim() || '';

    const index = figures.length + 1;
    const filename = `fig${index}.png`;
    const url = actualSrc.startsWith('http') ? actualSrc : new URL(actualSrc, window.location.origin).href;

    let dataUrl = null;
    try {
      dataUrl = await fetchAndConvertToPng(url);
    } catch (err) { /* skip */ }

    if (dataUrl) {
      figures.push({ id: actualSrc, url, filename, caption, dataUrl });
    }
  }

  window.scrollTo(0, 0);
  return figures;
}
```

- [ ] **Step 2: Commit**

```bash
git add content/springer.js
git commit -m "feat: add Springer Link content extraction script"
```

---

## Task 7: ACM Digital Library Content Script

**Files:**
- Create: `content/acm.js`

- [ ] **Step 1: Create `content/acm.js`**

```javascript
// content/acm.js
// ACM Digital Library extraction. Injected after content/shared.js.

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

function extractMetadata() {
  const title = document.querySelector('h1.citation__title, h1.article__title')?.textContent?.trim()
    || document.querySelector('meta[name="citation_title"]')?.content || 'Untitled';

  const authorEls = document.querySelectorAll('.author-name span, .loa__author-name, meta[name="citation_author"]');
  const authors = [...authorEls].map(el => (el.content || el.textContent).trim()).filter(Boolean);

  const abstract = document.querySelector('.article__abstract p, .abstractSection p')?.textContent?.trim() || '';

  const doi = document.querySelector('meta[name="citation_doi"]')?.content
    || window.location.pathname.replace('/doi/', '') || '';

  const date = document.querySelector('meta[name="citation_publication_date"]')?.content
    || document.querySelector('.issue-item__detail .dot-separator time')?.textContent?.trim() || '';

  const venue = document.querySelector('meta[name="citation_journal_title"]')?.content
    || document.querySelector('meta[name="citation_conference_title"]')?.content
    || document.querySelector('.issue-item__detail a')?.textContent?.trim() || '';

  const keywords = [];
  document.querySelectorAll('.tags-widget__content a, .article__keyword').forEach(el => {
    const kw = el.textContent.trim();
    if (kw && !keywords.includes(kw)) keywords.push(kw);
  });

  return { title, authors, doi, date, venue, keywords, abstract };
}

function extractSections() {
  const sections = [];

  const abstractEl = document.querySelector('.article__abstract p, .abstractSection p');
  if (abstractEl) {
    sections.push({
      heading: 'Abstract',
      content: [{ type: 'paragraph', text: abstractEl.textContent.trim() }]
    });
  }

  document.querySelectorAll('.article__section').forEach(sectionEl => {
    const headingEl = sectionEl.querySelector('h2, h3, .section__title');
    const heading = headingEl?.textContent?.trim() || 'Untitled Section';

    const content = [];
    sectionEl.querySelectorAll('p').forEach(p => {
      const text = p.textContent.trim();
      if (text) content.push({ type: 'paragraph', text });
    });

    sectionEl.querySelectorAll('figure').forEach(fig => {
      const img = fig.querySelector('img');
      if (img) {
        content.push({ type: 'figure', figureId: img.src || fig.id });
      }
    });

    if (content.length > 0) sections.push({ heading, content });
  });

  const refEls = document.querySelectorAll('.references__item, .article__references li');
  if (refEls.length > 0) {
    const refContent = [...refEls].map((ref, i) => ({
      type: 'paragraph',
      text: `${i + 1}. ${ref.textContent.trim()}`
    }));
    sections.push({ heading: 'References', content: refContent });
  }

  return sections;
}

async function extractFigures() {
  const figures = [];
  const figEls = document.querySelectorAll('figure.figure img, .article__inline-figure img');

  for (const img of figEls) {
    const src = img.src || img.dataset.src;
    if (!src) continue;

    img.scrollIntoView({ behavior: 'instant', block: 'center' });
    await new Promise(r => setTimeout(r, 300));

    const figureContainer = img.closest('figure');
    const captionEl = figureContainer?.querySelector('figcaption');
    const caption = captionEl?.textContent?.trim() || '';

    const index = figures.length + 1;
    const filename = `fig${index}.png`;
    const url = src.startsWith('http') ? src : new URL(src, window.location.origin).href;

    let dataUrl = null;
    try {
      dataUrl = await fetchAndConvertToPng(url);
    } catch (err) { /* skip */ }

    if (dataUrl) {
      figures.push({ id: src, url, filename, caption, dataUrl });
    }
  }

  window.scrollTo(0, 0);
  return figures;
}
```

- [ ] **Step 2: Commit**

```bash
git add content/acm.js
git commit -m "feat: add ACM Digital Library content extraction script"
```

---

## Task 8: ScienceDirect Content Script

**Files:**
- Create: `content/sciencedirect.js`

- [ ] **Step 1: Create `content/sciencedirect.js`**

```javascript
// content/sciencedirect.js
// ScienceDirect extraction. Injected after content/shared.js.

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

function extractMetadata() {
  const title = document.querySelector('h1.title-text span.title-text, h1.title-text')?.textContent?.trim()
    || document.querySelector('meta[name="citation_title"]')?.content || 'Untitled';

  const authorEls = document.querySelectorAll('.author span.text, .AuthorGroups .author, meta[name="citation_author"]');
  const authors = [...authorEls].map(el => (el.content || el.textContent).trim()).filter(Boolean);

  const abstract = document.querySelector('.abstract.author .u-font-serif p, #abstracts p')?.textContent?.trim() || '';

  const doi = document.querySelector('meta[name="citation_doi"]')?.content
    || document.querySelector('a.doi')?.textContent?.trim() || '';

  const date = document.querySelector('meta[name="citation_publication_date"]')?.content || '';

  const venue = document.querySelector('meta[name="citation_journal_title"]')?.content
    || document.querySelector('.publication-title-link')?.textContent?.trim() || '';

  const keywords = [];
  document.querySelectorAll('.keyword span').forEach(el => {
    const kw = el.textContent.trim();
    if (kw && !keywords.includes(kw)) keywords.push(kw);
  });

  return { title, authors, doi, date, venue, keywords, abstract };
}

function extractSections() {
  const sections = [];

  const abstractEl = document.querySelector('.abstract.author .u-font-serif p, #abstracts p');
  if (abstractEl) {
    sections.push({
      heading: 'Abstract',
      content: [{ type: 'paragraph', text: abstractEl.textContent.trim() }]
    });
  }

  const bodyEl = document.querySelector('#body, .Body');
  if (bodyEl) {
    let currentHeading = 'Introduction';
    let currentContent = [];

    bodyEl.querySelectorAll('h2, h3, p, .section-paragraph, figure').forEach(el => {
      if (el.tagName === 'H2' || el.tagName === 'H3') {
        if (currentContent.length > 0) {
          sections.push({ heading: currentHeading, content: currentContent });
          currentContent = [];
        }
        currentHeading = el.textContent.trim();
      } else if (el.tagName === 'FIGURE') {
        const img = el.querySelector('img');
        if (img) {
          currentContent.push({ type: 'figure', figureId: img.src || img.dataset.src || el.id });
        }
      } else {
        const text = el.textContent.trim();
        if (text) currentContent.push({ type: 'paragraph', text });
      }
    });

    if (currentContent.length > 0) {
      sections.push({ heading: currentHeading, content: currentContent });
    }
  }

  const refEls = document.querySelectorAll('.reference .contribution, .bib-reference');
  if (refEls.length > 0) {
    const refContent = [...refEls].map((ref, i) => ({
      type: 'paragraph',
      text: `${i + 1}. ${ref.textContent.trim()}`
    }));
    sections.push({ heading: 'References', content: refContent });
  }

  return sections;
}

async function extractFigures() {
  const figures = [];
  const figEls = document.querySelectorAll('figure img, .figure img, img.imgLazyJSB');

  for (const img of figEls) {
    img.scrollIntoView({ behavior: 'instant', block: 'center' });
    await new Promise(r => setTimeout(r, 500));

    const src = img.src || img.dataset.src;
    if (!src || src.includes('clear.gif') || src.includes('1x1')) continue;

    const figureContainer = img.closest('figure') || img.closest('.figure');
    const captionEl = figureContainer?.querySelector('figcaption, .captions');
    const caption = captionEl?.textContent?.trim() || '';

    const index = figures.length + 1;
    const filename = `fig${index}.png`;
    const url = src.startsWith('http') ? src : new URL(src, window.location.origin).href;

    let dataUrl = null;
    try {
      dataUrl = await fetchAndConvertToPng(url);
    } catch (err) { /* skip */ }

    if (dataUrl) {
      figures.push({ id: src, url, filename, caption, dataUrl });
    }
  }

  window.scrollTo(0, 0);
  return figures;
}
```

- [ ] **Step 2: Commit**

```bash
git add content/sciencedirect.js
git commit -m "feat: add ScienceDirect content extraction script"
```

---

## Task 9: MDPI Content Script

**Files:**
- Create: `content/mdpi.js`

- [ ] **Step 1: Create `content/mdpi.js`**

```javascript
// content/mdpi.js
// MDPI extraction. Injected after content/shared.js.

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

function extractMetadata() {
  const title = document.querySelector('h1.title, .article-title')?.textContent?.trim()
    || document.querySelector('meta[name="citation_title"]')?.content || 'Untitled';

  const authorEls = document.querySelectorAll('.art-authors .sciprofiles-link, .art-authors a[href*="author"], meta[name="citation_author"]');
  const authors = [...authorEls].map(el => (el.content || el.textContent).trim()).filter(Boolean);

  const abstract = document.querySelector('.art-abstract p, .art-abstract .html-p')?.textContent?.trim() || '';

  const doi = document.querySelector('meta[name="citation_doi"]')?.content || '';

  const date = document.querySelector('meta[name="citation_publication_date"]')?.content || '';

  const venue = document.querySelector('meta[name="citation_journal_title"]')?.content
    || document.querySelector('.journal-name')?.textContent?.trim() || '';

  const keywords = [];
  document.querySelectorAll('.art-keyword, .keyword-group a').forEach(el => {
    const kw = el.textContent.trim().replace(/;$/, '');
    if (kw && !keywords.includes(kw)) keywords.push(kw);
  });

  return { title, authors, doi, date, venue, keywords, abstract };
}

function extractSections() {
  const sections = [];

  const abstractEl = document.querySelector('.art-abstract p, .art-abstract .html-p');
  if (abstractEl) {
    sections.push({
      heading: 'Abstract',
      content: [{ type: 'paragraph', text: abstractEl.textContent.trim() }]
    });
  }

  const bodyEl = document.querySelector('.html-body');
  if (bodyEl) {
    let currentHeading = 'Introduction';
    let currentContent = [];

    bodyEl.querySelectorAll('.html-h2, .html-h4, .html-p, .html-fig').forEach(el => {
      if (el.classList.contains('html-h2') || el.classList.contains('html-h4')) {
        if (currentContent.length > 0) {
          sections.push({ heading: currentHeading, content: currentContent });
          currentContent = [];
        }
        currentHeading = el.textContent.trim();
      } else if (el.classList.contains('html-fig')) {
        const img = el.querySelector('img');
        if (img) {
          currentContent.push({ type: 'figure', figureId: img.src || el.id });
        }
      } else {
        const text = el.textContent.trim();
        if (text) currentContent.push({ type: 'paragraph', text });
      }
    });

    if (currentContent.length > 0) {
      sections.push({ heading: currentHeading, content: currentContent });
    }
  }

  const refEls = document.querySelectorAll('.html-bib-entry, .article-bibliography li');
  if (refEls.length > 0) {
    const refContent = [...refEls].map((ref, i) => ({
      type: 'paragraph',
      text: `${i + 1}. ${ref.textContent.trim()}`
    }));
    sections.push({ heading: 'References', content: refContent });
  }

  return sections;
}

async function extractFigures() {
  const figures = [];
  const figEls = document.querySelectorAll('.html-fig img, .html-body figure img');

  for (const img of figEls) {
    const src = img.src || img.dataset.src;
    if (!src) continue;

    img.scrollIntoView({ behavior: 'instant', block: 'center' });
    await new Promise(r => setTimeout(r, 300));

    const figureContainer = img.closest('.html-fig') || img.closest('figure');
    const captionEl = figureContainer?.querySelector('.html-fig_description, figcaption');
    const caption = captionEl?.textContent?.trim() || '';

    const index = figures.length + 1;
    const filename = `fig${index}.png`;
    const url = src.startsWith('http') ? src : new URL(src, window.location.origin).href;

    let dataUrl = null;
    try {
      dataUrl = await fetchAndConvertToPng(url);
    } catch (err) { /* skip */ }

    if (dataUrl) {
      figures.push({ id: src, url, filename, caption, dataUrl });
    }
  }

  window.scrollTo(0, 0);
  return figures;
}
```

- [ ] **Step 2: Commit**

```bash
git add content/mdpi.js
git commit -m "feat: add MDPI content extraction script"
```

---

## Task 10: HAL Science Content Script

**Files:**
- Create: `content/hal.js`

- [ ] **Step 1: Create `content/hal.js`**

```javascript
// content/hal.js
// HAL Science extraction. Injected after content/shared.js.

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

function extractMetadata() {
  const title = document.querySelector('h1.title, .paper-title')?.textContent?.trim()
    || document.querySelector('meta[name="citation_title"]')?.content || 'Untitled';

  const authorEls = document.querySelectorAll('.authors-list a, meta[name="citation_author"], .contrib-author');
  const authors = [...authorEls].map(el => (el.content || el.textContent).trim()).filter(Boolean);

  const abstract = document.querySelector('.abstract p, .paper-abstract p, #abstract')?.textContent?.trim() || '';

  const doi = document.querySelector('meta[name="citation_doi"]')?.content
    || document.querySelector('.paper-doi a')?.textContent?.trim() || '';

  const date = document.querySelector('meta[name="citation_publication_date"]')?.content
    || document.querySelector('meta[name="citation_date"]')?.content || '';

  const venue = document.querySelector('meta[name="citation_journal_title"]')?.content
    || document.querySelector('meta[name="citation_conference_title"]')?.content
    || document.querySelector('.journal-title, .conference-title')?.textContent?.trim() || '';

  const keywords = [];
  document.querySelectorAll('.keywords a, .paper-keywords a, meta[name="citation_keywords"]').forEach(el => {
    const kw = (el.content || el.textContent).trim();
    if (kw && !keywords.includes(kw)) keywords.push(kw);
  });

  return { title, authors, doi, date, venue, keywords, abstract };
}

function extractSections() {
  const sections = [];

  const abstractEl = document.querySelector('.abstract p, .paper-abstract p, #abstract');
  if (abstractEl) {
    sections.push({
      heading: 'Abstract',
      content: [{ type: 'paragraph', text: abstractEl.textContent.trim() }]
    });
  }

  const bodyEl = document.querySelector('.paper-content, .article-body, main');
  if (bodyEl) {
    let currentHeading = 'Introduction';
    let currentContent = [];

    bodyEl.querySelectorAll('h2, h3, p, figure').forEach(el => {
      if (el.tagName === 'H2' || el.tagName === 'H3') {
        if (currentContent.length > 0) {
          sections.push({ heading: currentHeading, content: currentContent });
          currentContent = [];
        }
        currentHeading = el.textContent.trim();
      } else if (el.tagName === 'FIGURE') {
        const img = el.querySelector('img');
        if (img) {
          currentContent.push({ type: 'figure', figureId: img.src || el.id });
        }
      } else {
        const text = el.textContent.trim();
        if (text) currentContent.push({ type: 'paragraph', text });
      }
    });

    if (currentContent.length > 0) {
      sections.push({ heading: currentHeading, content: currentContent });
    }
  }

  const refEls = document.querySelectorAll('.references li, .bibliography li');
  if (refEls.length > 0) {
    const refContent = [...refEls].map((ref, i) => ({
      type: 'paragraph',
      text: `${i + 1}. ${ref.textContent.trim()}`
    }));
    sections.push({ heading: 'References', content: refContent });
  }

  return sections;
}

async function extractFigures() {
  const figures = [];
  const figEls = document.querySelectorAll('figure img, .paper-content img');

  for (const img of figEls) {
    const src = img.src || img.dataset.src;
    if (!src || src.includes('icon') || src.includes('logo')) continue;

    img.scrollIntoView({ behavior: 'instant', block: 'center' });
    await new Promise(r => setTimeout(r, 300));

    const figureContainer = img.closest('figure');
    const captionEl = figureContainer?.querySelector('figcaption');
    const caption = captionEl?.textContent?.trim() || '';

    const index = figures.length + 1;
    const filename = `fig${index}.png`;
    const url = src.startsWith('http') ? src : new URL(src, window.location.origin).href;

    let dataUrl = null;
    try {
      dataUrl = await fetchAndConvertToPng(url);
    } catch (err) { /* skip */ }

    if (dataUrl) {
      figures.push({ id: src, url, filename, caption, dataUrl });
    }
  }

  window.scrollTo(0, 0);
  return figures;
}
```

- [ ] **Step 2: Commit**

```bash
git add content/hal.js
git commit -m "feat: add HAL Science content extraction script"
```

---

## Task 11: Integration Testing

**Files:** None — manual testing.

- [ ] **Step 1: Reload extension**

Go to `chrome://extensions/`, click reload on Academic Web Clipper.

- [ ] **Step 2: Test each publisher**

Test each publisher with a real paper URL. For each:
1. Navigate to the paper page
2. Click extension icon — verify popup shows paper title
3. Click "Clip Paper" — verify progress and successful zip download
4. Open zip — verify `.md` file has frontmatter, sections, figure wikilinks
5. Verify `images/` folder contains PNG figures

| Publisher | Test URL |
|-----------|----------|
| IEEE | `https://ieeexplore.ieee.org/abstract/document/9398576` |
| arXiv | `https://arxiv.org/html/2301.00234` |
| Springer | `https://link.springer.com/article/10.1007/s00521-023-08362-1` |
| ACM | `https://dl.acm.org/doi/10.1145/3544548.3581388` |
| ScienceDirect | `https://www.sciencedirect.com/science/article/pii/S0925231223000012` |
| MDPI | `https://www.mdpi.com/2076-3417/13/1/1` |
| HAL | `https://hal.science/hal-03000000` |

- [ ] **Step 3: Test unsupported page**

Navigate to any non-academic page → verify "Navigate to a supported academic paper" message.

- [ ] **Step 4: Test arXiv abstract page**

Navigate to `https://arxiv.org/abs/2301.00234` → verify "Open the HTML version" message.

- [ ] **Step 5: Fix any issues found during testing**

Iterate on selectors as needed.

- [ ] **Step 6: Commit fixes**

```bash
git add -A
git commit -m "fix: refine selectors from integration testing"
```
