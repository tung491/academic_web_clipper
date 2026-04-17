// content/acm.js
// Injected on-demand by the service worker into ACM Digital Library paper pages.

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
    document.querySelector('h1.citation__title')?.textContent?.trim() ||
    document.querySelector('h1.article__title')?.textContent?.trim() ||
    document.querySelector('meta[name="citation_title"]')?.content ||
    'Untitled';

  const authorElements = document.querySelectorAll('.author-name span, .loa__author-name');
  let authors = [...authorElements].map(el => el.textContent.trim()).filter(Boolean);
  if (authors.length === 0) {
    authors = [...document.querySelectorAll('meta[name="citation_author"]')]
      .map(el => el.content)
      .filter(Boolean);
  }

  const abstractEl =
    document.querySelector('.article__abstract p') ||
    document.querySelector('.abstractSection p');
  const abstract = abstractEl?.textContent?.trim() || '';

  const doiMeta = document.querySelector('meta[name="citation_doi"]');
  let doi = doiMeta?.content || '';
  if (!doi) {
    // Extract from URL path: dl.acm.org/doi/...
    const match = window.location.pathname.match(/\/doi\/(.+)/);
    if (match) doi = match[1];
  }

  const date =
    document.querySelector('meta[name="citation_publication_date"]')?.content || '';

  const venue =
    document.querySelector('meta[name="citation_journal_title"]')?.content ||
    document.querySelector('meta[name="citation_conference_title"]')?.content ||
    '';

  const keywordEls = document.querySelectorAll('.tags-widget__content a');
  const keywords = [...keywordEls].map(el => el.textContent.trim()).filter(Boolean);

  return { title, authors, doi, date, venue, keywords, abstract };
}

function extractSections() {
  const sections = [];

  // Abstract as first section
  const abstractEl =
    document.querySelector('.article__abstract p') ||
    document.querySelector('.abstractSection p');
  if (abstractEl) {
    sections.push({
      heading: 'Abstract',
      content: [{ type: 'paragraph', text: abstractEl.textContent.trim() }]
    });
  }

  // Body sections
  const sectionEls = document.querySelectorAll('.article__section');
  sectionEls.forEach(sectionEl => {
    const headingEl = sectionEl.querySelector('h2, h3, h4, h5');
    const heading = headingEl?.textContent?.trim() || 'Untitled Section';

    const content = [];
    const paragraphs = sectionEl.querySelectorAll('p');
    paragraphs.forEach(p => {
      const text = p.textContent.trim();
      if (text) content.push({ type: 'paragraph', text });
    });

    // Reference inline figures within this section
    const imgs = sectionEl.querySelectorAll(
      'figure.figure img, .article__inline-figure img'
    );
    imgs.forEach(img => {
      const figId = img.getAttribute('data-figure-id') || img.src;
      content.push({ type: 'figure', figureId: figId });
    });

    if (heading || content.length > 0) {
      sections.push({ heading, content });
    }
  });

  // References section
  const refEls = document.querySelectorAll(
    '.references__item, .article__references li'
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

  const figureEls = document.querySelectorAll(
    'figure.figure img, .article__inline-figure img'
  );

  for (const img of figureEls) {
    const src = img.src || img.getAttribute('data-src') || '';
    if (!src) continue;

    // Scroll into view to trigger lazy loading
    img.scrollIntoView({ behavior: 'instant', block: 'center' });
    await new Promise(r => setTimeout(r, 300));

    const figId = img.getAttribute('data-figure-id') || src;

    // Look for caption in parent <figure> or sibling <figcaption>
    const figureEl = img.closest('figure');
    const captionEl =
      figureEl?.querySelector('figcaption') ||
      img.parentElement?.querySelector('figcaption') ||
      img.parentElement?.nextElementSibling;
    let caption = '';
    if (captionEl) {
      const text = captionEl.textContent?.trim() || '';
      if (text.match(/^fig/i) || text.length < 300) {
        caption = text;
      }
    }

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
