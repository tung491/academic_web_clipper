# Academic Web Clipper — Chrome Extension Design Spec

## Overview

A Chrome extension that clips the full content of academic papers from IEEE Xplore into Obsidian-compatible markdown files, with figures saved to a local images folder. Triggered by clicking the extension icon while on an IEEE paper page.

## Requirements

- Clip full paper content: metadata, abstract, all body sections, figures, references
- Output Obsidian-style markdown with `![[image.png]]` wikilink syntax
- Save files relative to Chrome's Downloads directory with a configurable path prefix
- Support per-clip path override
- Requires institutional access (user is already logged in when browsing)
- IEEE Xplore only (V1 scope)

## Architecture

### Components

1. **Manifest (V3)** — declares permissions, content scripts, popup, service worker
2. **Content Script (`content/ieee.js`)** — injected into IEEE Xplore pages; extracts paper metadata, full text sections, and image URLs from the live DOM
3. **Popup (`popup/`)** — triggered by clicking the extension icon; shows paper title, save path field, and "Clip" button
4. **Background Service Worker (`background/service-worker.js`)** — orchestrates clipping: receives extracted data from the content script, converts to Obsidian markdown, downloads images via `chrome.downloads` API, saves the `.md` file
5. **Markdown Converter (`lib/markdown.js`)** — converts structured DOM data into Obsidian-flavored markdown

### Data Flow

```
User clicks extension icon
  → Popup sends message to content script
  → Content script extracts DOM data (text, metadata, image URLs)
  → Sends structured data to background service worker
  → Service worker converts to markdown via lib/markdown.js
  → Service worker downloads images via chrome.downloads API
  → Service worker saves .md file via chrome.downloads API
  → Files saved to: {downloads_dir}/{configured_prefix}/{paper-title}/
      ├── {paper-title}.md
      └── images/
          ├── fig1.png
          ├── fig2.png
          └── ...
```

## Content Extraction (IEEE Xplore DOM)

### Metadata

Extracted from the page DOM and meta tags:

| Field      | Source                                          |
|------------|-------------------------------------------------|
| Title      | `h1.document-title` or `<meta>` tags            |
| Authors    | Authors section with affiliation data           |
| Abstract   | Abstract section div                            |
| Keywords   | Keyword groups (IEEE, Author, INSPEC)           |
| DOI        | Document metadata section                       |
| Date       | Publication date from metadata                  |
| Venue      | Journal name/volume/issue or conference name/location |

### Full Text Body

- Section divs with headings (Introduction, Related Work, etc.)
- Paragraph content within each section
- Equations captured as images with alt text (MathJax/image-rendered)
- References/bibliography section

### Figures

- `<img>` tags within figure containers
- Full-resolution image URLs (not thumbnails)
- Captions paired with each figure

### Markdown Output Format

```markdown
---
title: "Paper Title Here"
authors: [Author A, Author B]
doi: "10.1109/XXXX"
date: 2021-04-08
venue: "IEEE Internet of Things Journal, vol. 8, no. 16"
keywords: [keyword1, keyword2]
---

## Abstract
The abstract text here...

## I. Introduction
Body text here...

![[images/fig1.png]]
*Figure 1: Caption text here*

## II. Related Work
...

## References
1. Reference one...
```

## Extension UI & UX

### Popup — On IEEE Paper Page

- Displays detected paper title
- "Save path" text field — pre-filled with configured default (e.g., `Papers/`), editable per clip
- "Clip" button — starts extraction and download
- Progress indicator — "Extracting... Downloading images... Done!"
- Link to settings page

### Popup — On Non-IEEE Page

- Message: "Navigate to an IEEE Xplore paper to clip it"

### Settings Page (options.html)

- Default save path prefix (relative to Chrome Downloads directory)

### Extension Icon Badge

- Green check after successful clip
- Red exclamation on error

## Error Handling

| Scenario                        | Behavior                                                                 |
|---------------------------------|--------------------------------------------------------------------------|
| No institutional access / paywall | Detect paywall banner; warn user; clip whatever is available (abstract) |
| Image download failure          | Log failure; save markdown with placeholder `![[images/fig_missing.png]]` |
| Equations (MathJax)             | Capture as images; LaTeX extraction is a future enhancement              |
| No figures on page              | Skip images folder; save only the `.md` file                            |
| Duplicate clip (same DOI/title) | Append timestamp suffix to folder name                                  |

## Permissions (manifest.json)

- `activeTab` — access the current IEEE page DOM
- `downloads` — save files via `chrome.downloads` API
- `storage` — persist user settings
- Host permission: `*://ieeexplore.ieee.org/*`

## Tech Stack

- Vanilla JavaScript (no frameworks)
- Chrome Extension Manifest V3
- HTML/CSS for popup and options page

## Project Structure

```
academic_web_clipper/
├── manifest.json
├── popup/
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── options/
│   ├── options.html
│   ├── options.js
│   └── options.css
├── content/
│   └── ieee.js
├── background/
│   └── service-worker.js
├── lib/
│   └── markdown.js
├── icons/
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md
```

## Testing

- Manual testing against target IEEE paper: https://ieeexplore.ieee.org/abstract/document/9398576
- Load as unpacked extension in Chrome
- Verify: metadata accuracy, full text completeness, image downloads, markdown formatting in Obsidian

## Future Enhancements (Out of Scope for V1)

- Support for additional publishers (arXiv, Springer, ACM, ScienceDirect)
- LaTeX equation extraction from MathJax
- Batch clipping from search results
- Plugin/parser system for extensibility
