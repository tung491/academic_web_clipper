// content/arxiv.js
// Injected on-demand by the service worker into arXiv HTML full-text pages (arxiv.org/html/...).

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
  // Title: h1.ltx_title may include a "Title:" prefix label
  let title = '';
  const titleEl = document.querySelector('h1.ltx_title');
  if (titleEl) {
    // Clone so we can strip any hidden "Title:" span without mutating the DOM
    const clone = titleEl.cloneNode(true);
    clone.querySelectorAll('.ltx_tag_document').forEach(tag => tag.remove());
    title = clone.textContent.trim().replace(/^Title:\s*/i, '');
  }
  if (!title) {
    title = document.querySelector('meta[name="citation_title"]')?.content?.trim() || 'Untitled';
  }

  // Authors
  const authorEls = document.querySelectorAll('.ltx_authors .ltx_personname');
  let authors = [...authorEls].map(el => el.textContent.trim()).filter(Boolean);
  if (authors.length === 0) {
    authors = [...document.querySelectorAll('meta[name="citation_author"]')]
      .map(el => el.content.trim()).filter(Boolean);
  }

  // Abstract
  const abstractEl = document.querySelector('.ltx_abstract .ltx_p');
  const abstract = abstractEl?.textContent?.trim() || '';

  // DOI
  const doi = document.querySelector('meta[name="citation_doi"]')?.content?.trim() || '';

  // Date
  const date = (
    document.querySelector('meta[name="citation_date"]')?.content ||
    document.querySelector('meta[name="citation_publication_date"]')?.content ||
    ''
  ).trim();

  // Venue
  const venue = (
    document.querySelector('meta[name="citation_journal_title"]')?.content?.trim() ||
    'arXiv'
  );

  // Keywords
  const keywords = [...document.querySelectorAll('.ltx_classification .ltx_text')]
    .map(el => el.textContent.trim()).filter(Boolean);

  return { title, authors, abstract, doi, date, venue, keywords };
}

function extractSections() {
  const sections = [];

  // Abstract as the first section
  const abstractEl = document.querySelector('.ltx_abstract .ltx_p');
  if (abstractEl) {
    sections.push({
      heading: 'Abstract',
      content: [{ type: 'paragraph', text: abstractEl.textContent.trim() }]
    });
  }

  // Body sections
  const sectionEls = document.querySelectorAll('.ltx_section');
  sectionEls.forEach(sectionEl => {
    const headingEl = sectionEl.querySelector('.ltx_title');
    const heading = headingEl?.textContent?.trim() || 'Untitled Section';

    const content = [];

    const paragraphs = sectionEl.querySelectorAll('.ltx_para .ltx_p');
    paragraphs.forEach(p => {
      const text = p.textContent.trim();
      if (text) {
        content.push({ type: 'paragraph', text });
      }
    });

    // Note figure references within the section (resolved in extractFigures)
    const figureImgs = sectionEl.querySelectorAll('.ltx_figure img');
    figureImgs.forEach(img => {
      const src = img.src || img.getAttribute('src') || '';
      if (src) {
        content.push({ type: 'figure', figureId: src });
      }
    });

    if (content.length > 0) {
      sections.push({ heading, content });
    }
  });

  // References section
  const refEls = document.querySelectorAll('.ltx_bibliography .ltx_bibitem');
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

  const figureEls = document.querySelectorAll('.ltx_figure img');

  for (const img of figureEls) {
    const src = img.src || img.getAttribute('src') || '';
    if (!src) continue;

    // Resolve relative URLs against document base
    const absoluteUrl = new URL(src, document.baseURI).href;

    // Caption: closest figcaption.ltx_caption within the figure container
    const container = img.closest('.ltx_figure') || img.parentElement;
    const captionEl = container?.querySelector('figcaption.ltx_caption, .ltx_caption');
    const caption = captionEl?.textContent?.trim() || '';

    const index = figures.length + 1;
    const filename = `fig${index}.png`;

    figures.push({ id: absoluteUrl, url: absoluteUrl, filename, caption });
  }

  window.scrollTo(0, 0);
  return figures;
}
