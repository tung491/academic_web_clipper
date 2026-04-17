// content/hal.js
// Injected on-demand by the service worker into HAL Science paper pages (hal.science).

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
    document.querySelector('h1.title')?.textContent?.trim() ||
    document.querySelector('.paper-title')?.textContent?.trim() ||
    document.querySelector('meta[name="citation_title"]')?.content?.trim() ||
    'Untitled';

  // Authors
  const authorElements = document.querySelectorAll('.authors-list a');
  let authors = [...authorElements].map(el => el.textContent.trim()).filter(Boolean);
  if (authors.length === 0) {
    authors = [...document.querySelectorAll('meta[name="citation_author"]')]
      .map(el => el.content.trim())
      .filter(Boolean);
  }
  if (authors.length === 0) {
    authors = [...document.querySelectorAll('.contrib-author')]
      .map(el => el.textContent.trim())
      .filter(Boolean);
  }

  // Abstract
  const abstractEl =
    document.querySelector('.abstract p') ||
    document.querySelector('.paper-abstract p') ||
    document.querySelector('#abstract');
  const abstract = abstractEl?.textContent?.trim() || '';

  // DOI
  const doi =
    document.querySelector('meta[name="citation_doi"]')?.content?.trim() ||
    document.querySelector('.paper-doi a')?.textContent?.trim() ||
    '';

  // Date
  const date = (
    document.querySelector('meta[name="citation_publication_date"]')?.content ||
    document.querySelector('meta[name="citation_date"]')?.content ||
    ''
  ).trim();

  // Venue
  const venue =
    document.querySelector('meta[name="citation_journal_title"]')?.content?.trim() ||
    document.querySelector('meta[name="citation_conference_title"]')?.content?.trim() ||
    document.querySelector('.journal-title')?.textContent?.trim() ||
    document.querySelector('.conference-title')?.textContent?.trim() ||
    '';

  // Keywords
  const keywordEls = document.querySelectorAll('.keywords a, .paper-keywords a');
  let keywords = [...keywordEls].map(el => el.textContent.trim()).filter(Boolean);
  if (keywords.length === 0) {
    const kwMeta = document.querySelector('meta[name="citation_keywords"]');
    if (kwMeta) {
      keywords = kwMeta.content.split(/[,;]/).map(k => k.trim()).filter(Boolean);
    }
  }

  return { title, authors, abstract, doi, date, venue, keywords };
}

function extractSections() {
  const sections = [];

  // Abstract as first section
  const abstractEl =
    document.querySelector('.abstract p') ||
    document.querySelector('.paper-abstract p') ||
    document.querySelector('#abstract');
  if (abstractEl) {
    sections.push({
      heading: 'Abstract',
      content: [{ type: 'paragraph', text: abstractEl.textContent.trim() }]
    });
  }

  // Body sections — walk the article container collecting headings and paragraphs
  const bodyContainer =
    document.querySelector('.paper-content') ||
    document.querySelector('.article-body') ||
    document.querySelector('main');

  if (bodyContainer) {
    let currentHeading = 'Introduction';
    let currentContent = [];

    const children = bodyContainer.children;
    for (const child of children) {
      const tag = child.tagName;

      if (tag === 'H2' || tag === 'H3') {
        // Flush the previous section if it has content
        if (currentContent.length > 0) {
          sections.push({ heading: currentHeading, content: currentContent });
        }
        currentHeading = child.textContent.trim() || 'Untitled Section';
        currentContent = [];
      } else if (tag === 'P') {
        const text = child.textContent.trim();
        if (text) {
          currentContent.push({ type: 'paragraph', text });
        }
      } else if (tag === 'FIGURE') {
        const img = child.querySelector('img');
        if (img) {
          const src = img.getAttribute('src') || img.src || '';
          if (src) {
            currentContent.push({ type: 'figure', figureId: src });
          }
        }
      } else {
        // Collect paragraphs nested inside other block elements (div, section, etc.)
        child.querySelectorAll('h2, h3, p, figure').forEach(el => {
          const elTag = el.tagName;
          if (elTag === 'H2' || elTag === 'H3') {
            if (currentContent.length > 0) {
              sections.push({ heading: currentHeading, content: currentContent });
            }
            currentHeading = el.textContent.trim() || 'Untitled Section';
            currentContent = [];
          } else if (elTag === 'P') {
            const text = el.textContent.trim();
            if (text) {
              currentContent.push({ type: 'paragraph', text });
            }
          } else if (elTag === 'FIGURE') {
            const img = el.querySelector('img');
            if (img) {
              const src = img.getAttribute('src') || img.src || '';
              if (src) {
                currentContent.push({ type: 'figure', figureId: src });
              }
            }
          }
        });
      }
    }

    // Flush the last section
    if (currentContent.length > 0) {
      sections.push({ heading: currentHeading, content: currentContent });
    }
  }

  // References section
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

  // Prefer figures inside <figure> elements; fall back to .paper-content img
  const figureEls = document.querySelectorAll('figure img');
  const contentImgs = document.querySelectorAll('.paper-content img');
  // Deduplicate by using a Set of element references
  const imgSet = new Set([...figureEls]);
  if (imgSet.size === 0) {
    contentImgs.forEach(img => imgSet.add(img));
  }

  for (const img of imgSet) {
    const src = img.getAttribute('src') || img.src || '';
    if (!src) continue;

    // Skip non-content images (icons, logos, UI elements)
    if (src.includes('icon') || src.includes('logo') || src.includes('button')) continue;
    // Skip tiny images likely to be decorative (natural dimensions checked after load)
    if (img.naturalWidth > 0 && img.naturalWidth < 30) continue;
    if (img.naturalHeight > 0 && img.naturalHeight < 30) continue;

    // Resolve relative URLs
    const absoluteUrl = new URL(src, document.baseURI).href;

    // Scroll into view to trigger lazy loading
    img.scrollIntoView({ behavior: 'instant', block: 'center' });
    await new Promise(r => setTimeout(r, 300));

    // Look for caption in the enclosing <figure> element
    const figureEl = img.closest('figure');
    const captionEl = figureEl?.querySelector('figcaption');
    const caption = captionEl?.textContent?.trim() || '';

    const index = figures.length + 1;
    const filename = `fig${index}.png`;

    figures.push({ id: absoluteUrl, url: absoluteUrl, filename, caption });
  }

  // Scroll back to top
  window.scrollTo(0, 0);
  return figures;
}
