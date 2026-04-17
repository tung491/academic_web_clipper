// content/sciencedirect.js
// Injected on-demand by the service worker into ScienceDirect paper pages.

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
  // Title
  const title =
    document.querySelector('h1.title-text span.title-text')?.textContent?.trim() ||
    document.querySelector('h1.title-text')?.textContent?.trim() ||
    document.querySelector('meta[name="citation_title"]')?.content?.trim() ||
    'Untitled';

  // Authors
  const authorElements = document.querySelectorAll('.author span.text');
  let authors = [...authorElements].map(el => el.textContent.trim()).filter(Boolean);
  if (authors.length === 0) {
    authors = [...document.querySelectorAll('meta[name="citation_author"]')]
      .map(el => el.content.trim())
      .filter(Boolean);
  }

  // Abstract
  const abstractEl =
    document.querySelector('.abstract.author .u-font-serif p') ||
    document.querySelector('#abstracts p');
  const abstract = abstractEl?.textContent?.trim() || '';

  // DOI
  const doi = document.querySelector('meta[name="citation_doi"]')?.content?.trim() || '';

  // Date
  const date =
    document.querySelector('meta[name="citation_publication_date"]')?.content?.trim() || '';

  // Venue
  const venue =
    document.querySelector('meta[name="citation_journal_title"]')?.content?.trim() ||
    document.querySelector('.publication-title-link')?.textContent?.trim() ||
    '';

  // Keywords
  const keywordEls = document.querySelectorAll('.keyword span');
  const keywords = [...keywordEls].map(el => el.textContent.trim()).filter(Boolean);

  return { title, authors, abstract, doi, date, venue, keywords };
}

function extractSections() {
  const sections = [];

  // Abstract as the first section
  const abstractEl =
    document.querySelector('.abstract.author .u-font-serif p') ||
    document.querySelector('#abstracts p');
  if (abstractEl) {
    sections.push({
      heading: 'Abstract',
      content: [{ type: 'paragraph', text: abstractEl.textContent.trim() }]
    });
  }

  // Body — ScienceDirect uses #body or .Body as the article body container.
  // Walk direct children collecting h2/h3 headings and p paragraphs.
  const bodyEl = document.querySelector('#body, .Body');
  if (bodyEl) {
    let currentHeading = 'Introduction';
    let currentContent = [];

    const flush = () => {
      if (currentContent.length > 0) {
        sections.push({ heading: currentHeading, content: currentContent });
      }
      currentContent = [];
    };

    // Recursively walk all descendant nodes in DOM order
    const walker = document.createTreeWalker(
      bodyEl,
      NodeFilter.SHOW_ELEMENT,
      null
    );

    let node = walker.nextNode();
    while (node) {
      const tag = node.tagName;

      if (tag === 'H2' || tag === 'H3') {
        flush();
        currentHeading = node.textContent.trim() || 'Untitled Section';
      } else if (tag === 'P') {
        const text = node.textContent.trim();
        if (text) {
          currentContent.push({ type: 'paragraph', text });
        }
      } else if (tag === 'FIGURE') {
        // Note figure reference by src of its image child
        const img = node.querySelector('img');
        const src = img?.getAttribute('data-src') || img?.src || '';
        if (src) {
          currentContent.push({ type: 'figure', figureId: src });
        }
        // Skip TreeWalker into this subtree — we've handled it
        node = walker.nextSibling() || walker.nextNode();
        continue;
      }

      node = walker.nextNode();
    }

    flush();
  }

  // References section
  const refEls = document.querySelectorAll(
    '.reference .contribution, .bib-reference'
  );
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

  // Collect candidate figure images: figures in .figure wrappers or lazy-load class
  const imgEls = document.querySelectorAll('.figure img, img.imgLazyJSB');

  // Deduplicate by resolved URL so .figure img and imgLazyJSB don't double-count
  const seen = new Set();

  for (const img of imgEls) {
    // Prefer the lazy-load data-src over the already-loaded src
    const rawSrc = img.getAttribute('data-src') || img.src || '';
    if (!rawSrc) continue;

    // Resolve relative URLs
    const url = new URL(rawSrc, location.href).href;

    // Skip transparent placeholder GIFs (clear.gif, 1x1 pixels, etc.)
    if (/clear\.gif|1x1|blank\.gif/i.test(url)) continue;

    // Deduplicate
    if (seen.has(url)) continue;
    seen.add(url);

    // Scroll into view to trigger lazy loading, then wait for the image to decode
    img.scrollIntoView({ behavior: 'instant', block: 'center' });
    await new Promise(r => setTimeout(r, 500));

    // Caption: prefer .captions inside the enclosing .figure, fall back to figcaption
    const container = img.closest('.figure') || img.closest('figure') || img.parentElement;
    const captionEl =
      container?.querySelector('.captions') ||
      container?.querySelector('figcaption');
    let caption = captionEl?.textContent?.trim() || '';

    const index = figures.length + 1;
    const filename = `fig${index}.png`;

    let dataUrl = null;
    try {
      dataUrl = await fetchAndConvertToPng(url);
    } catch (err) {
      // Unable to fetch/convert this figure — skip it
    }

    if (dataUrl) {
      figures.push({ id: url, url, filename, caption, dataUrl });
    }
  }

  // Scroll back to top
  window.scrollTo(0, 0);
  return figures;
}
