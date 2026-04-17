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

  const authorElements = document.querySelectorAll('[data-test="author-name"]');
  let authors;
  if (authorElements.length > 0) {
    authors = [...authorElements].map(el => el.textContent.trim()).filter(Boolean);
  } else {
    authors = [...document.querySelectorAll('meta[name="citation_author"]')]
      .map(el => el.content.trim()).filter(Boolean);
  }

  const abstract = document.querySelector('#Abs1-content p')?.textContent?.trim() || '';
  const doi = document.querySelector('meta[name="citation_doi"]')?.content?.trim() || '';
  const date = document.querySelector('meta[name="citation_publication_date"]')?.content?.trim()
    || document.querySelector('time[datetime]')?.getAttribute('datetime')?.trim() || '';
  const venue = document.querySelector('meta[name="citation_journal_title"]')?.content?.trim() || '';

  const keywords = [...document.querySelectorAll('.c-article-subject-list__subject')]
    .map(el => el.textContent.trim()).filter(Boolean);

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
    if (sectionEl.id === 'Abs1' || sectionEl.id === 'Abs1-section') return;

    const headingEl = sectionEl.querySelector('h2, h3');
    const heading = headingEl?.textContent?.trim() || 'Untitled Section';

    const content = [];
    sectionEl.querySelectorAll(':scope > .c-article-section__content p, :scope > p').forEach(p => {
      const text = p.textContent.trim();
      if (text) content.push({ type: 'paragraph', text });
    });

    // Only match figures within article body (not sidebar reading companion)
    sectionEl.querySelectorAll('.c-article-section__figure').forEach(figDiv => {
      const img = figDiv.querySelector('picture img, img');
      if (img) {
        const src = img.getAttribute('data-src') || img.src;
        if (src) content.push({ type: 'figure', figureId: normalizeUrl(src) });
      }
    });

    if (content.length > 0) sections.push({ heading, content });
  });

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
  const seen = new Set();

  // Only target figures inside article sections, not the reading companion sidebar
  const figDivs = document.querySelectorAll('.c-article-section__figure');

  for (const figDiv of figDivs) {
    const img = figDiv.querySelector('picture img, img');
    if (!img) continue;

    const src = img.getAttribute('data-src') || img.src;
    if (!src) continue;

    const url = normalizeUrl(src);
    if (seen.has(url)) continue;
    seen.add(url);

    // Scroll to trigger lazy loading
    img.scrollIntoView({ behavior: 'instant', block: 'center' });
    await new Promise(r => setTimeout(r, 300));

    // Re-read src after scroll (lazy load may have populated it)
    const actualSrc = img.src || img.getAttribute('data-src');
    const actualUrl = normalizeUrl(actualSrc || src);

    const captionEl = figDiv.querySelector('.c-article-section__figure-description, figcaption, b.c-article-section__figure-caption');
    const caption = captionEl?.textContent?.trim() || '';

    const index = figures.length + 1;
    const filename = `fig${index}.png`;

    let dataUrl = null;
    try {
      dataUrl = await fetchAndConvertToPng(actualUrl);
    } catch (err) {
      // skip
    }

    if (dataUrl) {
      figures.push({ id: url, url: actualUrl, filename, caption, dataUrl });
    }
  }

  window.scrollTo(0, 0);
  return figures;
}

function normalizeUrl(src) {
  if (src.startsWith('//')) return 'https:' + src;
  if (src.startsWith('http')) return src;
  return new URL(src, location.href).href;
}
