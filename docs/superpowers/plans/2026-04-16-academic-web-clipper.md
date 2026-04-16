# Academic Web Clipper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome extension that clips IEEE Xplore academic papers into Obsidian-compatible markdown with images.

**Architecture:** Pure Chrome Extension (Manifest V3, vanilla JS). Popup triggers clipping, background service worker orchestrates by injecting a content script on-demand via `chrome.scripting.executeScript`, content script extracts DOM data and sends results back via messaging, service worker converts to markdown and saves via `chrome.downloads` API.

**Tech Stack:** Vanilla JavaScript, Chrome Extension Manifest V3, HTML/CSS

**Spec:** `docs/superpowers/specs/2026-04-16-academic-web-clipper-design.md`

---

## File Structure

| File | Responsibility |
|------|----------------|
| `manifest.json` | Extension manifest — permissions, service worker, popup, icons |
| `lib/markdown.js` | Converts structured extraction data into Obsidian-flavored markdown string |
| `content/ieee.js` | Injected into IEEE Xplore page — extracts metadata, sections, figure URLs from DOM |
| `background/service-worker.js` | Orchestrates clipping: receives messages, injects content script, calls markdown converter, triggers downloads |
| `popup/popup.html` | Popup UI markup — title display, save path field, clip button, progress indicator |
| `popup/popup.js` | Popup logic — detects IEEE page, sends clip message, displays progress |
| `popup/popup.css` | Popup styling |
| `options/options.html` | Settings page markup — default save path field |
| `options/options.js` | Settings logic — load/save default path to chrome.storage |
| `options/options.css` | Settings styling |
| `icons/icon16.png` | Extension icon 16x16 |
| `icons/icon48.png` | Extension icon 48x48 |
| `icons/icon128.png` | Extension icon 128x128 |
| `tests/markdown.test.js` | Unit tests for lib/markdown.js |

---

## Task 1: Project Scaffolding — Manifest + Icons

**Files:**
- Create: `manifest.json`
- Create: `icons/icon16.png`, `icons/icon48.png`, `icons/icon128.png`

- [ ] **Step 1: Create `manifest.json`**

```json
{
  "manifest_version": 3,
  "name": "Academic Web Clipper",
  "version": "1.0.0",
  "description": "Clip IEEE Xplore papers to Obsidian-compatible markdown",
  "permissions": [
    "activeTab",
    "scripting",
    "downloads",
    "storage"
  ],
  "host_permissions": [
    "*://ieeexplore.ieee.org/*"
  ],
  "action": {
    "default_popup": "popup/popup.html",
    "default_icon": {
      "16": "icons/icon16.png",
      "48": "icons/icon48.png",
      "128": "icons/icon128.png"
    }
  },
  "background": {
    "service_worker": "background/service-worker.js",
    "type": "module"
  },
  "options_page": "options/options.html",
  "icons": {
    "16": "icons/icon16.png",
    "48": "icons/icon48.png",
    "128": "icons/icon128.png"
  }
}
```

- [ ] **Step 2: Create placeholder icons**

Generate simple colored square PNG icons at 16x16, 48x48, 128x128. Use a simple canvas-based script or any available tool. These are placeholders — the icon should be a recognizable solid color (e.g., teal `#0097a7`).

- [ ] **Step 3: Load extension in Chrome and verify**

1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the project directory
4. Verify: extension appears with icon, no errors in the console

- [ ] **Step 4: Commit**

```bash
git add manifest.json icons/
git commit -m "feat: scaffold manifest.json and placeholder icons"
```

---

## Task 2: Markdown Converter (`lib/markdown.js`)

This is a pure function with no Chrome API dependencies — ideal for TDD.

**Files:**
- Create: `lib/markdown.js`
- Create: `tests/markdown.test.js`
- Create: `package.json` (for test runner)

- [ ] **Step 1: Initialize test infrastructure**

Create minimal `package.json`:

```json
{
  "name": "academic-web-clipper",
  "private": true,
  "scripts": {
    "test": "node --test tests/"
  }
}
```

Uses Node.js built-in test runner (no dependencies needed).

- [ ] **Step 2: Write failing test — YAML frontmatter generation**

Create `tests/markdown.test.js`:

```javascript
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toMarkdown } from '../lib/markdown.js';

describe('toMarkdown', () => {
  const sampleData = {
    metadata: {
      title: 'Test Paper Title',
      authors: ['Alice Smith', 'Bob Jones'],
      doi: '10.1109/TEST.2021.001',
      date: '2021-04-08',
      venue: 'IEEE Transactions on Testing, vol. 1, no. 1',
      keywords: ['testing', 'markdown']
    },
    sections: [],
    figures: []
  };

  it('generates YAML frontmatter with all metadata fields', () => {
    const md = toMarkdown(sampleData);
    assert.ok(md.startsWith('---\n'));
    assert.ok(md.includes('title: "Test Paper Title"'));
    assert.ok(md.includes('authors: [Alice Smith, Bob Jones]'));
    assert.ok(md.includes('doi: "10.1109/TEST.2021.001"'));
    assert.ok(md.includes('date: 2021-04-08'));
    assert.ok(md.includes('venue: "IEEE Transactions on Testing, vol. 1, no. 1"'));
    assert.ok(md.includes('keywords: [testing, markdown]'));
    assert.ok(md.includes('\n---\n'));
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `lib/markdown.js` does not exist

- [ ] **Step 4: Implement frontmatter generation**

Create `lib/markdown.js`:

```javascript
/**
 * Converts structured paper data into Obsidian-flavored markdown.
 * @param {{ metadata, sections, figures }} data
 * @returns {string} Markdown string
 */
export function toMarkdown(data) {
  const { metadata, sections, figures } = data;
  let md = '';

  // YAML frontmatter
  md += '---\n';
  md += `title: "${metadata.title || 'Untitled'}"\n`;
  if (metadata.authors?.length) md += `authors: [${metadata.authors.join(', ')}]\n`;
  if (metadata.doi) md += `doi: "${metadata.doi}"\n`;
  if (metadata.date) md += `date: ${metadata.date}\n`;
  if (metadata.venue) md += `venue: "${metadata.venue}"\n`;
  if (metadata.keywords?.length) md += `keywords: [${metadata.keywords.join(', ')}]\n`;
  md += '---\n\n';

  // Sections
  for (const section of sections) {
    md += `## ${section.heading}\n`;
    for (const block of section.content) {
      if (block.type === 'paragraph') {
        md += `${block.text}\n\n`;
      } else if (block.type === 'figure') {
        const fig = figures.find(f => f.id === block.figureId);
        if (fig) {
          if (fig.failed) {
            md += `![[fig_missing.png]]\n`;
            md += `<!-- Image download failed for: ${fig.filename} -->\n`;
          } else {
            md += `![[${fig.filename}]]\n`;
          }
          if (fig.caption) {
            md += `*${fig.caption}*\n\n`;
          }
        }
      }
    }
  }

  return md;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS

- [ ] **Step 6: Write failing test — sections with text and figures**

Add to `tests/markdown.test.js`:

```javascript
  it('renders sections with headings and paragraphs', () => {
    const data = {
      metadata: sampleData.metadata,
      sections: [
        {
          heading: 'I. Introduction',
          content: [
            { type: 'paragraph', text: 'This paper introduces testing.' },
            { type: 'paragraph', text: 'We propose a new approach.' }
          ]
        },
        {
          heading: 'II. Related Work',
          content: [
            { type: 'paragraph', text: 'Prior work includes...' }
          ]
        }
      ],
      figures: []
    };
    const md = toMarkdown(data);
    assert.ok(md.includes('## I. Introduction'));
    assert.ok(md.includes('This paper introduces testing.'));
    assert.ok(md.includes('## II. Related Work'));
  });

  it('renders figure wikilinks with captions', () => {
    const data = {
      metadata: sampleData.metadata,
      sections: [
        {
          heading: 'I. Introduction',
          content: [
            { type: 'paragraph', text: 'See the figure below.' },
            { type: 'figure', figureId: 'fig1' }
          ]
        }
      ],
      figures: [
        { id: 'fig1', filename: 'fig1.png', caption: 'Figure 1: System architecture' }
      ]
    };
    const md = toMarkdown(data);
    assert.ok(md.includes('![[fig1.png]]'));
    assert.ok(md.includes('*Figure 1: System architecture*'));
  });
```

- [ ] **Step 7: Run tests to verify they pass** (implementation already handles these)

Run: `npm test`
Expected: PASS (all 3 tests)

- [ ] **Step 8: Write failing test — empty sections and missing figures**

```javascript
  it('handles sections with no content gracefully', () => {
    const data = {
      metadata: sampleData.metadata,
      sections: [{ heading: 'III. Empty Section', content: [] }],
      figures: []
    };
    const md = toMarkdown(data);
    assert.ok(md.includes('## III. Empty Section'));
  });

  it('skips figure block when figure data is missing', () => {
    const data = {
      metadata: sampleData.metadata,
      sections: [
        {
          heading: 'I. Intro',
          content: [{ type: 'figure', figureId: 'nonexistent' }]
        }
      ],
      figures: []
    };
    const md = toMarkdown(data);
    assert.ok(!md.includes('![['));
  });

  it('handles missing/null metadata fields gracefully', () => {
    const data = {
      metadata: {
        title: 'Partial Paper',
        authors: [],
        doi: '',
        date: '',
        venue: '',
        keywords: []
      },
      sections: [],
      figures: []
    };
    const md = toMarkdown(data);
    assert.ok(md.includes('title: "Partial Paper"'));
    assert.ok(!md.includes('authors:'));
    assert.ok(!md.includes('doi:'));
    assert.ok(!md.includes('venue:'));
    assert.ok(!md.includes('keywords:'));
  });
```

- [ ] **Step 9: Run tests**

Run: `npm test`
Expected: PASS (all 6 tests)

- [ ] **Step 10: Commit**

```bash
git add package.json lib/markdown.js tests/markdown.test.js
git commit -m "feat: add markdown converter with Obsidian frontmatter and wikilinks"
```

---

## Task 3: Content Script — IEEE Xplore DOM Extraction (`content/ieee.js`)

**Files:**
- Create: `content/ieee.js`

The content script is injected on-demand and runs in the page context. It extracts structured data and sends it back via `chrome.runtime.sendMessage`. Since it runs in a browser DOM context, unit testing requires HTML snapshots (covered in Task 7). For now, we build and manually test.

- [ ] **Step 1: Create `content/ieee.js` — metadata extraction**

```javascript
// content/ieee.js
// Injected on-demand by the service worker into IEEE Xplore paper pages.

(async function extractPaper() {
  try {
    const metadata = extractMetadata();
    const paywalled = detectPaywall();
    const sections = extractSections();
    const figures = paywalled ? [] : await extractFigures();

    chrome.runtime.sendMessage({
      type: 'extractionResult',
      data: { metadata, sections, figures, paywalled }
    });
  } catch (err) {
    chrome.runtime.sendMessage({
      type: 'extractionResult',
      error: err.message
    });
  }
})();

function extractMetadata() {
  const title = document.querySelector('.document-title')?.textContent?.trim()
    || document.querySelector('meta[property="og:title"]')?.content
    || 'Untitled';

  const authorElements = document.querySelectorAll('.authors-info .author-name, .authors-info span[id^="author"]');
  const authors = [...authorElements].map(el => el.textContent.trim()).filter(Boolean);

  const abstractEl = document.querySelector('.abstract-text .u-mb-1, .abstract-desktop-div div[xplmathjax]');
  const abstract = abstractEl?.textContent?.trim() || '';

  const doiEl = document.querySelector('.stats-document-abstract-doi a, a[href*="doi.org"]');
  const doi = doiEl?.textContent?.trim() || '';

  const dateEl = document.querySelector('.doc-abstract-pubdate, .stats-document-abstract-publishedIn .document-banner-date');
  const date = dateEl?.textContent?.replace('Date of Publication:', '').trim() || '';

  const venueEl = document.querySelector('.stats-document-abstract-publishedIn a, .document-banner-conference-title');
  const venue = venueEl?.textContent?.trim() || '';

  const keywordSections = document.querySelectorAll('.stats-keywords-section .stats-keywords');
  const keywords = [];
  keywordSections.forEach(section => {
    section.querySelectorAll('a').forEach(a => {
      const kw = a.textContent.trim();
      if (kw && !keywords.includes(kw)) keywords.push(kw);
    });
  });

  return { title, authors, doi, date, venue, keywords, abstract };
}
```

- [ ] **Step 2: Add paywall detection**

Append to `content/ieee.js`:

```javascript
function detectPaywall() {
  // IEEE Xplore shows a login/access banner when full text is unavailable
  const accessBanner = document.querySelector('.access-banner, .login-banner, .document-banner-access');
  const noFullText = !document.querySelector('.section--body, .article-text .section');
  return !!(accessBanner || noFullText);
}
```

- [ ] **Step 3: Add section extraction**

Append to `content/ieee.js`:

```javascript
function extractSections() {
  const sections = [];

  // Abstract as first section
  const abstractEl = document.querySelector('.abstract-text .u-mb-1, .abstract-desktop-div div[xplmathjax]');
  if (abstractEl) {
    sections.push({
      heading: 'Abstract',
      content: [{ type: 'paragraph', text: abstractEl.textContent.trim() }]
    });
  }

  // Body sections
  const sectionEls = document.querySelectorAll('.section--body, .article-text .section');
  sectionEls.forEach(sectionEl => {
    const headingEl = sectionEl.querySelector('h2, h3, .section-title');
    const heading = headingEl?.textContent?.trim() || 'Untitled Section';

    const content = [];
    const paragraphs = sectionEl.querySelectorAll('p, .paragraph, div[xplmathjax]');
    paragraphs.forEach(p => {
      const text = p.textContent.trim();
      if (text) {
        content.push({ type: 'paragraph', text });
      }
    });

    // Inline figure references within this section
    const figEls = sectionEl.querySelectorAll('figure, .figuregroup');
    figEls.forEach(fig => {
      const img = fig.querySelector('img');
      if (img) {
        const figId = img.getAttribute('data-media-id') || img.src || fig.id;
        content.push({ type: 'figure', figureId: figId });
      }
    });

    if (heading || content.length > 0) {
      sections.push({ heading, content });
    }
  });

  // References section
  const refEls = document.querySelectorAll('.reference-container .reference-item, ol.references li');
  if (refEls.length > 0) {
    const refContent = [...refEls].map((ref, i) => ({
      type: 'paragraph',
      text: `${i + 1}. ${ref.textContent.trim()}`
    }));
    sections.push({ heading: 'References', content: refContent });
  }

  return sections;
}
```

- [ ] **Step 4: Add figure extraction with lazy-load handling**

Append to `content/ieee.js`:

```javascript
async function extractFigures() {
  const figures = [];
  const figEls = document.querySelectorAll('figure img, .figuregroup img');

  for (const img of figEls) {
    // Scroll into view to trigger lazy loading
    img.scrollIntoView({ behavior: 'instant', block: 'center' });

    // Wait for src to populate (poll up to 3 seconds)
    const src = await waitForSrc(img, 3000);
    if (!src) continue;

    const figId = img.getAttribute('data-media-id') || src;
    const figureContainer = img.closest('figure') || img.closest('.figuregroup');
    const captionEl = figureContainer?.querySelector('figcaption, .figcaption, .caption');
    const caption = captionEl?.textContent?.trim() || '';

    const index = figures.length + 1;
    const filename = `fig${index}.png`;

    figures.push({
      id: figId,
      url: src.startsWith('http') ? src : new URL(src, window.location.origin).href,
      filename,
      caption
    });
  }

  // Scroll back to top
  window.scrollTo(0, 0);
  return figures;
}

function waitForSrc(img, timeoutMs) {
  return new Promise(resolve => {
    if (img.src && !img.src.includes('blank') && img.naturalWidth > 0) {
      return resolve(img.src);
    }
    const interval = 100;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += interval;
      if (img.src && !img.src.includes('blank') && img.naturalWidth > 0) {
        clearInterval(timer);
        resolve(img.src);
      } else if (elapsed >= timeoutMs) {
        clearInterval(timer);
        resolve(img.src || null);
      }
    }, interval);
  });
}
```

- [ ] **Step 5: Commit**

```bash
git add content/ieee.js
git commit -m "feat: add IEEE Xplore content extraction script"
```

---

## Task 4: Background Service Worker (`background/service-worker.js`)

**Files:**
- Create: `background/service-worker.js`

- [ ] **Step 1: Create service worker — message listener + orchestration**

```javascript
// background/service-worker.js
import { toMarkdown } from '../lib/markdown.js';

// Listen for clip requests from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'clip') {
    handleClip(message.savePath);
  }
  if (message.type === 'extractionResult') {
    // Handled via pendingExtraction promise
  }
});

let pendingExtraction = null;

async function handleClip(savePath) {
  try {
    // Notify popup: extracting
    sendProgress('extracting');

    // Get active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab || !tab.url.includes('ieeexplore.ieee.org')) {
      sendProgress('error', 'Not on an IEEE Xplore page');
      return;
    }

    // Set up listener for extraction result before injecting
    const extractionData = await injectAndWaitForResult(tab.id);

    if (extractionData.error) {
      sendProgress('error', extractionData.error);
      return;
    }

    const { metadata, sections, figures, paywalled } = extractionData;

    if (paywalled) {
      sendProgress('downloading', 'Paywall detected — clipping abstract only');
    }

    // Convert to markdown (before downloading, so we can add placeholders for failures)
    // We'll generate markdown after downloads to mark failed images

    // Build folder name with timestamp
    const timestamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13);
    const safeName = sanitizeFilename(metadata.title);
    const folderName = `${safeName}_${timestamp}`;
    const basePath = savePath ? `${savePath}/${folderName}` : folderName;

    // Notify popup: downloading
    sendProgress('downloading');

    // Download images, tracking failures
    let imageCount = 0;
    const failedFigures = [];
    for (const fig of figures) {
      try {
        await downloadFile(fig.url, `${basePath}/images/${fig.filename}`);
        imageCount++;
      } catch (err) {
        console.warn(`Failed to download ${fig.filename}:`, err);
        failedFigures.push(fig.id);
      }
    }

    // Mark failed figures so markdown converter can add placeholders
    const figuresWithStatus = figures.map(f => ({
      ...f,
      failed: failedFigures.includes(f.id)
    }));

    // Convert to markdown
    const markdown = toMarkdown({ metadata, sections, figures: figuresWithStatus });

    // Save markdown file
    const mdBlob = new Blob([markdown], { type: 'text/markdown' });
    const mdUrl = URL.createObjectURL(mdBlob);
    await downloadFile(mdUrl, `${basePath}/${safeName}.md`);
    URL.revokeObjectURL(mdUrl);

    // Notify popup: done
    sendProgress('done', `Clipped "${metadata.title}" with ${imageCount} images`);

    // Badge
    chrome.action.setBadgeText({ text: '✓' });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);

  } catch (err) {
    sendProgress('error', err.message);
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#F44336' });
    setTimeout(() => chrome.action.setBadgeText({ text: '' }), 3000);
  }
}

function injectAndWaitForResult(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.runtime.onMessage.removeListener(listener);
      reject(new Error('Extraction timed out after 30s'));
    }, 30000);

    function listener(message, sender) {
      if (message.type === 'extractionResult' && sender.tab?.id === tabId) {
        clearTimeout(timeout);
        chrome.runtime.onMessage.removeListener(listener);
        resolve(message.data || { error: message.error });
      }
    }

    chrome.runtime.onMessage.addListener(listener);

    chrome.scripting.executeScript({
      target: { tabId },
      files: ['content/ieee.js']
    }).catch(err => {
      clearTimeout(timeout);
      chrome.runtime.onMessage.removeListener(listener);
      reject(err);
    });
  });
}

function downloadFile(url, filename) {
  return new Promise((resolve, reject) => {
    chrome.downloads.download({ url, filename, saveAs: false }, (downloadId) => {
      if (chrome.runtime.lastError) {
        return reject(new Error(chrome.runtime.lastError.message));
      }
      // Wait for download to actually complete or fail
      function onChange(delta) {
        if (delta.id !== downloadId) return;
        if (delta.state?.current === 'complete') {
          chrome.downloads.onChanged.removeListener(onChange);
          resolve(downloadId);
        } else if (delta.state?.current === 'interrupted' || delta.error) {
          chrome.downloads.onChanged.removeListener(onChange);
          reject(new Error(delta.error?.current || 'Download failed'));
        }
      }
      chrome.downloads.onChanged.addListener(onChange);
    });
  });
}

function sendProgress(stage, detail) {
  chrome.runtime.sendMessage({ type: 'progress', stage, detail }).catch(() => {
    // Popup may be closed, ignore
  });
}

function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 100);
}
```

- [ ] **Step 2: Verify no syntax errors**

Run: `node --check background/service-worker.js`
Expected: No output (clean parse). Note: Chrome API calls won't resolve in Node, but syntax should be valid.

- [ ] **Step 3: Commit**

```bash
git add background/service-worker.js
git commit -m "feat: add background service worker for clip orchestration"
```

---

## Task 5: Popup UI (`popup/`)

**Files:**
- Create: `popup/popup.html`
- Create: `popup/popup.js`
- Create: `popup/popup.css`

- [ ] **Step 1: Create `popup/popup.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="stylesheet" href="popup.css">
</head>
<body>
  <div id="app">
    <div id="ieee-view" style="display:none;">
      <h2 id="paper-title">Detecting paper...</h2>
      <label for="save-path">Save path:</label>
      <input type="text" id="save-path" placeholder="Papers/">
      <button id="clip-btn">Clip Paper</button>
      <div id="progress" style="display:none;">
        <span id="progress-text"></span>
      </div>
      <div id="result" style="display:none;"></div>
    </div>
    <div id="non-ieee-view" style="display:none;">
      <p>Navigate to an IEEE Xplore paper to clip it.</p>
    </div>
    <div class="footer">
      <a href="#" id="settings-link">Settings</a>
    </div>
  </div>
  <script src="popup.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `popup/popup.js`**

```javascript
// popup/popup.js

const ieeeView = document.getElementById('ieee-view');
const nonIeeeView = document.getElementById('non-ieee-view');
const paperTitle = document.getElementById('paper-title');
const savePathInput = document.getElementById('save-path');
const clipBtn = document.getElementById('clip-btn');
const progressDiv = document.getElementById('progress');
const progressText = document.getElementById('progress-text');
const resultDiv = document.getElementById('result');
const settingsLink = document.getElementById('settings-link');

// Load default save path from storage
chrome.storage.sync.get(['defaultSavePath'], (result) => {
  savePathInput.value = result.defaultSavePath || 'Papers';
});

// Check if current tab is IEEE Xplore
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (tab && tab.url && tab.url.includes('ieeexplore.ieee.org/abstract/document')) {
    ieeeView.style.display = 'block';
    paperTitle.textContent = tab.title.replace(' | IEEE Xplore', '').trim() || 'IEEE Paper';
  } else {
    nonIeeeView.style.display = 'block';
  }
});

// Clip button click
clipBtn.addEventListener('click', () => {
  clipBtn.disabled = true;
  progressDiv.style.display = 'block';
  resultDiv.style.display = 'none';
  progressText.textContent = 'Starting...';

  const savePath = savePathInput.value.trim();
  chrome.runtime.sendMessage({ type: 'clip', savePath });
});

// Listen for progress updates from service worker
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

// Settings link
settingsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
```

- [ ] **Step 3: Create `popup/popup.css`**

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  width: 320px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  font-size: 14px;
  color: #1a1a1a;
  padding: 16px;
}

#app {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

h2 {
  font-size: 15px;
  font-weight: 600;
  line-height: 1.3;
  margin-bottom: 8px;
}

label {
  font-size: 12px;
  color: #666;
  display: block;
  margin-bottom: 4px;
}

input[type="text"] {
  width: 100%;
  padding: 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 13px;
  margin-bottom: 8px;
}

button {
  width: 100%;
  padding: 10px;
  background: #0097a7;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
}

button:hover {
  background: #00838f;
}

button:disabled {
  background: #b0bec5;
  cursor: not-allowed;
}

#progress {
  text-align: center;
  padding: 8px;
  color: #666;
  font-size: 13px;
}

.success {
  background: #e8f5e9;
  color: #2e7d32;
  padding: 8px;
  border-radius: 4px;
  font-size: 13px;
}

.error {
  background: #ffebee;
  color: #c62828;
  padding: 8px;
  border-radius: 4px;
  font-size: 13px;
}

.footer {
  text-align: center;
  padding-top: 8px;
  border-top: 1px solid #eee;
}

.footer a {
  font-size: 12px;
  color: #0097a7;
  text-decoration: none;
}

.footer a:hover {
  text-decoration: underline;
}

#non-ieee-view p {
  text-align: center;
  color: #666;
  padding: 20px 0;
}
```

- [ ] **Step 4: Load extension, open an IEEE paper page, click icon, verify popup renders**

Verify: popup shows paper title, save path field, clip button, settings link.
On a non-IEEE page: popup shows "Navigate to an IEEE Xplore paper" message.

- [ ] **Step 5: Commit**

```bash
git add popup/
git commit -m "feat: add popup UI with clip button and progress display"
```

---

## Task 6: Options Page (`options/`)

**Files:**
- Create: `options/options.html`
- Create: `options/options.js`
- Create: `options/options.css`

- [ ] **Step 1: Create `options/options.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Academic Web Clipper — Settings</title>
  <link rel="stylesheet" href="options.css">
</head>
<body>
  <div id="app">
    <h1>Academic Web Clipper Settings</h1>
    <label for="default-path">Default save path (relative to Downloads):</label>
    <input type="text" id="default-path" placeholder="Papers">
    <p class="hint">Files are saved within Chrome's Downloads directory. To save directly to your Obsidian vault, set Chrome's download location to your vault path or create a symlink.</p>
    <button id="save-btn">Save</button>
    <div id="status" style="display:none;"></div>
  </div>
  <script src="options.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `options/options.js`**

```javascript
// options/options.js

const pathInput = document.getElementById('default-path');
const saveBtn = document.getElementById('save-btn');
const statusDiv = document.getElementById('status');

// Load saved settings
chrome.storage.sync.get(['defaultSavePath'], (result) => {
  pathInput.value = result.defaultSavePath || 'Papers';
});

// Save settings
saveBtn.addEventListener('click', () => {
  const path = pathInput.value.trim();
  chrome.storage.sync.set({ defaultSavePath: path }, () => {
    statusDiv.textContent = 'Settings saved.';
    statusDiv.style.display = 'block';
    setTimeout(() => { statusDiv.style.display = 'none'; }, 2000);
  });
});
```

- [ ] **Step 3: Create `options/options.css`**

```css
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  max-width: 480px;
  margin: 40px auto;
  padding: 0 20px;
  color: #1a1a1a;
}

h1 {
  font-size: 20px;
  margin-bottom: 20px;
}

label {
  font-size: 14px;
  display: block;
  margin-bottom: 6px;
}

input[type="text"] {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
  margin-bottom: 8px;
}

.hint {
  font-size: 12px;
  color: #888;
  margin-bottom: 16px;
}

button {
  padding: 10px 24px;
  background: #0097a7;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  cursor: pointer;
}

button:hover {
  background: #00838f;
}

#status {
  margin-top: 12px;
  color: #2e7d32;
  font-size: 13px;
}
```

- [ ] **Step 4: Reload extension, open settings via popup link, verify save/load**

1. Click extension icon → click "Settings"
2. Change default path → click Save → verify "Settings saved" appears
3. Close and reopen settings → verify path persisted

- [ ] **Step 5: Commit**

```bash
git add options/
git commit -m "feat: add options page for default save path"
```

---

## Task 7: End-to-End Integration Test

**Files:** None created — this is manual testing against the real IEEE page.

- [ ] **Step 1: Reload extension with all files**

Go to `chrome://extensions/`, click reload on Academic Web Clipper.

- [ ] **Step 2: Navigate to test paper**

Open: `https://ieeexplore.ieee.org/abstract/document/9398576`
(Must be logged in via institutional access)

- [ ] **Step 3: Click extension icon and clip**

1. Verify popup shows the paper title
2. Verify save path is pre-filled
3. Click "Clip Paper"
4. Watch progress: "Extracting..." → "Downloading images..." → "Done!"

- [ ] **Step 4: Verify output files**

Check Downloads directory for:
```
Papers/
  {paper-title}_{timestamp}/
    {paper-title}.md
    images/
      fig1.png
      fig2.png
      ...
```

- [ ] **Step 5: Verify markdown content**

Open the `.md` file and verify:
- YAML frontmatter has title, authors, doi, date, venue, keywords
- Abstract section present
- Body sections with correct headings
- Figure wikilinks `![[fig1.png]]` with captions
- References section

- [ ] **Step 6: Open in Obsidian**

Drop the clipped folder into an Obsidian vault and verify:
- Frontmatter renders as properties
- Images display inline
- Overall formatting looks correct

- [ ] **Step 7: Test error cases**

1. Click extension on a non-IEEE page → verify "Navigate to IEEE" message
2. If possible, test without institutional access → verify paywall warning

- [ ] **Step 8: Fix any issues found during testing**

Iterate on content selectors and edge cases as needed.

- [ ] **Step 9: Commit any fixes**

```bash
git add -A
git commit -m "fix: refine selectors and edge cases from integration testing"
```

---

## Task 8: Final Cleanup

**Files:**
- Modify: any files needing cleanup

- [ ] **Step 1: Remove `console.log` debug statements** (if any added during testing)

- [ ] **Step 2: Verify all files are committed**

Run: `git status`
Expected: clean working tree

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: final cleanup for v1.0.0"
```
