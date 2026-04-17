// content/ieee.js
// Injected on-demand by the service worker into IEEE Xplore paper pages.

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
  const title = document.querySelector('.document-title')?.textContent?.trim()
    || document.querySelector('meta[property="og:title"]')?.content
    || 'Untitled';

  const authorElements = document.querySelectorAll('.authors-info .author-name, .authors-info span[id^="author"]');
  const authors = [...authorElements].map(el => el.textContent.trim()).filter(Boolean);

  const abstractEl = document.querySelector('.abstract-text .u-mb-1, .abstract-desktop-div div[xplmathjax]');
  const abstract = abstractEl?.textContent?.trim() || '';

  const doiEl = document.querySelector('.stats-document-abstract-doi a, a[href*="doi.org"]');
  const doi = doiEl?.textContent?.trim() || '';

  const dateEl = document.querySelector('.doc-abstract-pubdate, .stats-document-abstract-publishedIn .document-banner-date');
  const date = dateEl?.textContent?.replace('Date of Publication:', '').trim() || '';

  const venueEl = document.querySelector('.stats-document-abstract-publishedIn a, .document-banner-conference-title');
  const venue = venueEl?.textContent?.trim() || '';

  const keywordSections = document.querySelectorAll('.stats-keywords-section .stats-keywords');
  const keywords = [];
  keywordSections.forEach(section => {
    section.querySelectorAll('a').forEach(a => {
      const kw = a.textContent.trim();
      if (kw && !keywords.includes(kw)) keywords.push(kw);
    });
  });

  return { title, authors, doi, date, venue, keywords, abstract };
}

function extractSections() {
  const sections = [];

  // Abstract as first section
  const abstractEl = document.querySelector('.abstract-text .u-mb-1, .abstract-desktop-div div[xplmathjax]');
  if (abstractEl) {
    sections.push({
      heading: 'Abstract',
      content: [{ type: 'paragraph', text: abstractEl.textContent.trim() }]
    });
  }

  // Body sections — IEEE uses .section_2 for full-text sections
  const sectionEls = document.querySelectorAll(
    '.section--body, .article-text .section, .section_2, .document-ft-section-container .section'
  );
  sectionEls.forEach(sectionEl => {
    const headingEl = sectionEl.querySelector('h2, h3, .section-title, .header-title');
    const heading = headingEl?.textContent?.trim() || 'Untitled Section';

    const content = [];
    const paragraphs = sectionEl.querySelectorAll('p, .paragraph, div[xplmathjax]');
    paragraphs.forEach(p => {
      const text = p.textContent.trim();
      if (text) {
        content.push({ type: 'paragraph', text });
      }
    });

    // Find figure images within this section
    const imgs = sectionEl.querySelectorAll('img[src*="mediastore"]');
    imgs.forEach(img => {
      const figId = img.getAttribute('data-media-id') || img.src;
      content.push({ type: 'figure', figureId: figId });
    });

    if (heading || content.length > 0) {
      sections.push({ heading, content });
    }
  });

  // References section
  const refEls = document.querySelectorAll('.reference-container .reference-item, ol.references li, .refs .reference');
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

  // IEEE Xplore uses plain <img> tags with mediastore URLs for figures
  // Filter out logos, icons, and other non-figure images
  const allImgs = document.querySelectorAll('img[src*="mediastore"]');

  for (const img of allImgs) {
    // Skip tiny icons and non-content images
    const src = img.src;
    if (!src || src.includes('icon') || src.includes('logo')) continue;

    // Scroll into view to ensure it's loaded
    img.scrollIntoView({ behavior: 'instant', block: 'center' });
    await new Promise(r => setTimeout(r, 300));

    // Try to get the full-size URL by replacing -small with -large
    const fullSizeUrl = src
      .replace('-small.', '-large.')
      .replace('-small-', '-large-');

    const figId = img.getAttribute('data-media-id') || src;

    // Look for caption near the image
    const parent = img.closest('div') || img.parentElement;
    const captionEl = parent?.querySelector('.figcaption, figcaption, .caption, .fig-caption')
      || parent?.nextElementSibling;
    let caption = '';
    if (captionEl) {
      const text = captionEl.textContent?.trim() || '';
      // Only use as caption if it looks like one (starts with "Fig" or "Figure" or is short)
      if (text.match(/^fig/i) || text.length < 200) {
        caption = text;
      }
    }

    const index = figures.length + 1;
    const filename = `fig${index}.png`;

    // Fetch image and convert to PNG via canvas
    let dataUrl = null;
    for (const url of [fullSizeUrl, src]) {
      try {
        dataUrl = await fetchAndConvertToPng(url);
        if (dataUrl) break;
      } catch (err) {
        // Try next URL
      }
    }

    if (dataUrl) {
      figures.push({ id: figId, url: fullSizeUrl, filename, caption, dataUrl });
    }
  }

  // Scroll back to top
  window.scrollTo(0, 0);
  return figures;
}

