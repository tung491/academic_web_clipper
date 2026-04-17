// content/mdpi.js
// Injected on-demand by the service worker into MDPI paper pages.

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
    document.querySelector('h1.title')?.textContent?.trim() ||
    document.querySelector('.article-title')?.textContent?.trim() ||
    document.querySelector('meta[name="citation_title"]')?.content ||
    'Untitled';

  const authorElements = document.querySelectorAll('.art-authors .sciprofiles-link');
  let authors = [...authorElements].map(el => el.textContent.trim()).filter(Boolean);
  if (authors.length === 0) {
    authors = [...document.querySelectorAll('meta[name="citation_author"]')]
      .map(el => el.content)
      .filter(Boolean);
  }

  const abstractEl =
    document.querySelector('.art-abstract p') ||
    document.querySelector('.art-abstract .html-p');
  const abstract = abstractEl?.textContent?.trim() || '';

  const doi = document.querySelector('meta[name="citation_doi"]')?.content || '';

  const date =
    document.querySelector('meta[name="citation_publication_date"]')?.content || '';

  const venue =
    document.querySelector('meta[name="citation_journal_title"]')?.content ||
    document.querySelector('.journal-name')?.textContent?.trim() ||
    '';

  const keywordEls = document.querySelectorAll('.art-keyword');
  const keywords = [...keywordEls]
    .map(el => el.textContent.trim().replace(/;+$/, '').trim())
    .filter(Boolean);

  return { title, authors, doi, date, venue, keywords, abstract };
}

function extractSections() {
  const sections = [];

  // Abstract as first section
  const abstractEl =
    document.querySelector('.art-abstract p') ||
    document.querySelector('.art-abstract .html-p');
  if (abstractEl) {
    sections.push({
      heading: 'Abstract',
      content: [{ type: 'paragraph', text: abstractEl.textContent.trim() }]
    });
  }

  // Body sections — walk .html-body children, collecting headings and paragraphs
  const bodyEl = document.querySelector('.html-body');
  if (bodyEl) {
    let currentHeading = null;
    let currentContent = [];

    const flush = () => {
      if (currentHeading !== null || currentContent.length > 0) {
        sections.push({
          heading: currentHeading || 'Untitled Section',
          content: currentContent
        });
      }
      currentHeading = null;
      currentContent = [];
    };

    // Walk all relevant descendants in document order
    const walker = document.createTreeWalker(
      bodyEl,
      NodeFilter.SHOW_ELEMENT,
      {
        acceptNode(node) {
          const cls = node.className || '';
          if (
            node.matches('.html-h2, .html-h4, .html-p, .html-fig')
          ) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_SKIP;
        }
      }
    );

    let node;
    while ((node = walker.nextNode())) {
      if (node.matches('.html-h2, .html-h4')) {
        // Start a new section on each heading
        flush();
        currentHeading = node.textContent.trim();
      } else if (node.matches('.html-p')) {
        const text = node.textContent.trim();
        if (text) {
          currentContent.push({ type: 'paragraph', text });
        }
      } else if (node.matches('.html-fig')) {
        // Reference the figure by its id attribute or a generated key
        const figId = node.id || node.querySelector('img')?.src || '';
        currentContent.push({ type: 'figure', figureId: figId });
      }
    }

    // Flush any trailing section
    flush();
  }

  // References section
  const refEls = document.querySelectorAll(
    '.html-bib-entry, .article-bibliography li'
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

  const figEls = document.querySelectorAll('.html-fig');

  for (const figEl of figEls) {
    const img = figEl.querySelector('img');
    if (!img) continue;

    const src = img.src || img.getAttribute('data-src') || '';
    if (!src) continue;

    // Scroll into view to trigger lazy loading
    img.scrollIntoView({ behavior: 'instant', block: 'center' });
    await new Promise(r => setTimeout(r, 300));

    const figId = figEl.id || src;

    const captionEl = figEl.querySelector('.html-fig_description');
    const caption = captionEl?.textContent?.trim() || '';

    const index = figures.length + 1;
    const filename = `fig${index}.png`;

    let dataUrl = null;
    try {
      dataUrl = await fetchAndConvertToPng(src);
    } catch (err) {
      // Skip images that cannot be fetched
    }

    if (dataUrl) {
      figures.push({ id: figId, url: src, filename, caption, dataUrl });
    }
  }

  // Scroll back to top
  window.scrollTo(0, 0);
  return figures;
}
