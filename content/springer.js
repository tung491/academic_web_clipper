// content/springer.js
// Injected on-demand by the service worker into Springer Link paper pages.

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
    || document.querySelector('meta[name="citation_title"]')?.content
    || 'Untitled';

  const authorElements = document.querySelectorAll('[data-test="author-name"]');
  let authors;
  if (authorElements.length > 0) {
    authors = [...authorElements].map(el => el.textContent.trim()).filter(Boolean);
  } else {
    authors = [...document.querySelectorAll('meta[name="citation_author"]')]
      .map(el => el.content.trim())
      .filter(Boolean);
  }

  const abstractEl = document.querySelector('#Abs1-content p');
  const abstract = abstractEl?.textContent?.trim() || '';

  const doi = document.querySelector('meta[name="citation_doi"]')?.content?.trim() || '';

  const date = document.querySelector('meta[name="citation_publication_date"]')?.content?.trim()
    || document.querySelector('time[datetime]')?.getAttribute('datetime')?.trim()
    || '';

  const venue = document.querySelector('meta[name="citation_journal_title"]')?.content?.trim() || '';

  const keywordEls = document.querySelectorAll('.c-article-subject-list__subject');
  const keywords = [...keywordEls].map(el => el.textContent.trim()).filter(Boolean);

  return { title, authors, doi, date, venue, keywords, abstract };
}

function extractSections() {
  const sections = [];

  // Abstract as first section
  const abstractEl = document.querySelector('#Abs1-content p');
  if (abstractEl) {
    sections.push({
      heading: 'Abstract',
      content: [{ type: 'paragraph', text: abstractEl.textContent.trim() }]
    });
  }

  // Body sections — Springer uses .c-article-section
  const sectionEls = document.querySelectorAll('.c-article-section');
  sectionEls.forEach(sectionEl => {
    const headingEl = sectionEl.querySelector('h2, h3');
    const heading = headingEl?.textContent?.trim() || 'Untitled Section';

    // Skip the abstract section (already handled above)
    if (sectionEl.id === 'Abs1' || sectionEl.id === 'Abs1-section') return;

    const content = [];
    const paragraphs = sectionEl.querySelectorAll('p');
    paragraphs.forEach(p => {
      const text = p.textContent.trim();
      if (text) {
        content.push({ type: 'paragraph', text });
      }
    });

    // Reference figure images within this section
    const imgs = sectionEl.querySelectorAll('figure img');
    imgs.forEach(img => {
      const src = img.getAttribute('data-src') || img.src;
      if (src) {
        content.push({ type: 'figure', figureId: src });
      }
    });

    if (heading || content.length > 0) {
      sections.push({ heading, content });
    }
  });

  // References section
  const refEls = document.querySelectorAll('#Bib1 .c-article-references__item');
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

  const figureEls = document.querySelectorAll('figure img');

  for (const img of figureEls) {
    // Resolve URL, preferring lazy-load src
    const src = img.getAttribute('data-src') || img.src;
    if (!src || src.includes('icon') || src.includes('logo')) continue;

    // Resolve relative URLs
    const url = new URL(src, location.href).href;

    // Scroll into view to trigger lazy loading
    img.scrollIntoView({ behavior: 'instant', block: 'center' });
    await new Promise(r => setTimeout(r, 300));

    // Look for caption in the enclosing <figure>
    const figureEl = img.closest('figure');
    const captionEl = figureEl?.querySelector('figcaption');
    const caption = captionEl?.textContent?.trim() || '';

    const index = figures.length + 1;
    const filename = `fig${index}.png`;

    let dataUrl = null;
    try {
      dataUrl = await fetchAndConvertToPng(url);
    } catch (err) {
      // Skip figures that cannot be fetched
    }

    if (dataUrl) {
      figures.push({ id: url, url, filename, caption, dataUrl });
    }
  }

  // Scroll back to top
  window.scrollTo(0, 0);
  return figures;
}
