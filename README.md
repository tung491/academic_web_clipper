# Academic Web Clipper

A Chrome extension that clips academic papers from publisher websites into Obsidian-compatible Markdown, bundled with all figures in a single `.zip`.

## Supported Publishers

- IEEE Xplore (`ieeexplore.ieee.org`)
- arXiv HTML (`arxiv.org/html/...`)
- Springer Link (`link.springer.com`)
- ScienceDirect (`sciencedirect.com`)
- MDPI (`mdpi.com`)
- Wiley Online Library (`onlinelibrary.wiley.com`)
- Taylor & Francis Online (`tandfonline.com`)
- ASCE Library (`ascelibrary.org`)
- Emerald Insight (`emerald.com`)

## Install (Chrome / Chromium / Edge / Brave)

This extension is not on the Chrome Web Store. Install it as an unpacked extension.

1. Clone or download this repository to a permanent location:
   ```
   git clone https://github.com/<your-fork>/academic_web_clipper.git
   ```
   Don't delete or move this folder after loading — Chrome reads files from it on every browser start.

2. Open `chrome://extensions` (or `edge://extensions`, `brave://extensions`).

3. Toggle **Developer mode** (top right).

4. Click **Load unpacked** and select the `academic_web_clipper` directory (the one containing `manifest.json`).

5. Pin the extension to the toolbar so the popup is one click away.

To update, `git pull` and click the reload icon on the extension card in `chrome://extensions`.

## Usage

1. Navigate to a paper page on a supported publisher (the full HTML article, not the PDF).
2. Click the extension icon.
3. Set the **Save path** (relative to your Chrome Downloads directory). Defaults to `Papers`.
4. Optionally check **Choose location (Save As)** to pick a destination per clip.
5. Click **Clip Paper**.

The extension downloads a single zip:

```
Paper_Title_20260426T1530.zip
├── Paper_Title.md        # YAML frontmatter + sections, [[wikilink]] figure refs
└── images/
    ├── fig_1.png
    ├── fig_2.png
    └── ...
```

Unzip into your Obsidian vault — the `[[fig_1.png]]` wikilinks resolve automatically.

### Saving directly to your Obsidian vault

Chrome restricts downloads to the Downloads directory tree. Two options:

- Set Chrome's download location to your vault folder (Settings → Downloads).
- Symlink `~/Downloads/Papers` → `<vault>/Papers` and set the save path to `Papers`.

## YAML Frontmatter

Each clipped paper starts with:

```yaml
---
title: "Paper title"
authors: [First Author, Second Author, ...]
inline_author: "Author et al."
doi: "10.xxxx/xxxxx"
date: 2025-04-01
venue: "Journal / Conference name"
keywords: [kw1, kw2, ...]
---
```

`inline_author` is convenient for citations in your notes (e.g. `[[note|Smith et al.]]`).

## How It Differs from Obsidian Web Clipper

[Obsidian Web Clipper](https://obsidian.md/clipper) is a general-purpose article clipper. This extension is purpose-built for academic papers and does several things differently:

| | Academic Web Clipper | Obsidian Web Clipper |
|---|---|---|
| **Scope** | Per-publisher DOM extractors hand-tuned for IEEE, arXiv, Springer, etc. | Generic content extraction (Readability-style) for any web page. |
| **Figures** | Downloads every figure as a real file, bundled in a zip alongside the markdown. Uses `[[fig_1.png]]` wikilinks. | Embeds images as remote URLs or relies on Obsidian's image-download settings; less reliable on paywalled CDNs. |
| **CORS / paywalled images** | Service worker fetches images using extension `host_permissions`, bypassing the browser's CORS restrictions for publisher CDNs (e.g. `ars.els-cdn.com`, `media.springernature.com`). | Browser-context fetch; often blocked by publisher CDNs that disallow cross-origin requests. |
| **Section structure** | Reconstructs publisher-specific section hierarchy (e.g. IEEE `div.section`, arXiv `ltx_section`, T&F numbered sections with table positions preserved). | Flat content extraction; section boundaries can collapse. |
| **Metadata** | Pulls DOI, authors, venue, publication date, keywords from publisher meta tags into structured YAML frontmatter, plus an `inline_author` field for citation use. | Extracts generic Open Graph / page metadata; not academic-aware. |
| **Output** | A single `.zip` saved to Downloads (markdown + `images/` folder). You unzip into your vault. | Saves directly into the vault via Obsidian URI / connector. |
| **Vault integration** | None — file-based; works without Obsidian running. | Tight integration; saves into the active vault directly. |
| **Templates** | Fixed academic template (frontmatter + sections + figures). | User-defined templates with variables. |
| **Highlights / selection clipping** | No — full-paper clip only. | Yes. |

**Use this extension when:** you want full-paper academic clips with reliably downloaded figures and structured metadata, and you don't mind unzipping into your vault.

**Use Obsidian Web Clipper when:** you clip general web articles, want highlight/selection clipping, or want clips to land in your vault without an unzip step.

The two coexist fine — keep Obsidian Web Clipper for blogs and news, use this for papers.

## Settings

Open the extension's options page (right-click icon → Options, or the **Settings** link in the popup) to set:

- **Default save path** — folder under Downloads where clips are saved (default `Papers`).
- **Always open Save As dialog** — prompts for location on every clip.

## Project Layout

```
manifest.json              MV3 manifest with publisher host_permissions
background/service-worker.js   orchestration, image fetching, zip download
content/<publisher>.js     per-publisher DOM extractors
content/shared.js          messaging helpers injected before extractors
lib/markdown.js            data-to-markdown serializer
lib/zip.js                 zero-dep zip builder
popup/                     toolbar popup UI
options/                   settings page
```

## Development

```
npm test                   # node --test on tests/*.test.js
```

After editing source, click the reload icon on the extension card in `chrome://extensions`.

## Permissions Rationale

- `activeTab`, `scripting` — inject the publisher extractor into the current tab on click.
- `downloads` — save the zip.
- `storage` — persist the default save path.
- `host_permissions` for each publisher and its image CDN — allow the service worker to fetch figures without CORS errors.

No data leaves your machine; all extraction and downloading is local.
