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
  const title =
    document.querySelector('h1.title-text span.title-text')?.textContent?.trim() ||
    document.querySelector('h1.title-text')?.textContent?.trim() ||
    document.querySelector('meta[name="citation_title"]')?.content?.trim() ||
    'Untitled';

  const authorElements = document.querySelectorAll('.author span.text');
  let authors = [...authorElements].map(el => el.textContent.trim()).filter(Boolean);
  if (authors.length === 0) {
    authors = [...document.querySelectorAll('meta[name="citation_author"]')]
      .map(el => el.content.trim()).filter(Boolean);
  }

  const abstractEl =
    document.querySelector('[id*="abspara"]') ||
    document.querySelector('.abstract div') ||
    document.querySelector('#abstracts p');
  const abstract = abstractEl?.textContent?.trim() || '';

  const doi = document.querySelector('meta[name="citation_doi"]')?.content?.trim() || '';
  const date = document.querySelector('meta[name="citation_publication_date"]')?.content?.trim() || '';
  const venue =
    document.querySelector('meta[name="citation_journal_title"]')?.content?.trim() ||
    document.querySelector('.publication-title-link')?.textContent?.trim() || '';

  const keywords = [...document.querySelectorAll('.keyword span')]
    .map(el => el.textContent.trim()).filter(Boolean);

  return { title, authors, abstract, doi, date, venue, keywords };
}

function extractSections() {
  const sections = [];

  // Abstract
  const abstractEl =
    document.querySelector('[id*="abspara"]') ||
    document.querySelector('.abstract div') ||
    document.querySelector('#abstracts p');
  if (abstractEl) {
    sections.push({
      heading: 'Abstract',
      content: [{ type: 'paragraph', text: abstractEl.textContent.trim() }]
    });
  }

  // Body — ScienceDirect uses #body or .Body
  // Text content is in <div class="u-margin-s-bottom"> not <p>
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

    const walker = document.createTreeWalker(bodyEl, NodeFilter.SHOW_ELEMENT, null);
    let node = walker.nextNode();

    while (node) {
      const tag = node.tagName;

      if (tag === 'H2' || tag === 'H3') {
        flush();
        currentHeading = node.textContent.trim() || 'Untitled Section';
      } else if (tag === 'DIV' && node.classList.contains('u-margin-s-bottom')) {
        const text = node.textContent.trim();
        if (text && text.length > 10) {
          currentContent.push({ type: 'paragraph', text });
        }
      } else if (tag === 'P') {
        const text = node.textContent.trim();
        if (text && text.length > 10) {
          currentContent.push({ type: 'paragraph', text });
        }
      } else if (tag === 'FIGURE') {
        const img = node.querySelector('img');
        const src = img?.getAttribute('data-src') || img?.src || '';
        if (src && !/clear\.gif|1x1|blank/i.test(src)) {
          currentContent.push({ type: 'figure', figureId: new URL(src, location.href).href });
        }
        node = walker.nextSibling() || walker.nextNode();
        continue;
      }

      node = walker.nextNode();
    }

    flush();
  }

  // References
  const refEls = document.querySelectorAll('.reference .contribution, .bib-reference, [name="bibliography"] li');
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
  const seen = new Set();
  const figEls = document.querySelectorAll('figure img, .figure img, img.imgLazyJSB');

  for (const img of figEls) {
    const rawSrc = img.getAttribute('data-src') || img.src || '';
    if (!rawSrc) continue;

    const url = new URL(rawSrc, location.href).href;
    if (/clear\.gif|1x1|blank\.gif/i.test(url)) continue;
    if (seen.has(url)) continue;
    seen.add(url);

    img.scrollIntoView({ behavior: 'instant', block: 'center' });
    await new Promise(r => setTimeout(r, 500));

    const container = img.closest('.figure') || img.closest('figure') || img.parentElement;
    const captionEl = container?.querySelector('.captions') || container?.querySelector('figcaption');
    const caption = captionEl?.textContent?.trim() || '';

    const index = figures.length + 1;
    const filename = `fig${index}.png`;

    figures.push({ id: url, url, filename, caption });
  }

  window.scrollTo(0, 0);
  return figures;
}
