// content/ieee.js
// Injected on-demand by the service worker into IEEE Xplore paper pages.

(async function extractPaper() {
  try {
    const metadata = extractMetadata();
    const paywalled = detectPaywall();
    const sections = extractSections();
    const figures = paywalled ? [] : await extractFigures();

    chrome.runtime.sendMessage({
      type: 'extractionResult',
      data: { metadata, sections, figures, paywalled }
    });
  } catch (err) {
    chrome.runtime.sendMessage({
      type: 'extractionResult',
      error: err.message
    });
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

function detectPaywall() {
  const accessBanner = document.querySelector('.access-banner, .login-banner, .document-banner-access');
  const noFullText = !document.querySelector('.section--body, .article-text .section');
  return !!(accessBanner || noFullText);
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

  // Body sections
  const sectionEls = document.querySelectorAll('.section--body, .article-text .section');
  sectionEls.forEach(sectionEl => {
    const headingEl = sectionEl.querySelector('h2, h3, .section-title');
    const heading = headingEl?.textContent?.trim() || 'Untitled Section';

    const content = [];
    const paragraphs = sectionEl.querySelectorAll('p, .paragraph, div[xplmathjax]');
    paragraphs.forEach(p => {
      const text = p.textContent.trim();
      if (text) {
        content.push({ type: 'paragraph', text });
      }
    });

    // Inline figure references within this section
    const figEls = sectionEl.querySelectorAll('figure, .figuregroup');
    figEls.forEach(fig => {
      const img = fig.querySelector('img');
      if (img) {
        const figId = img.getAttribute('data-media-id') || img.src || fig.id;
        content.push({ type: 'figure', figureId: figId });
      }
    });

    if (heading || content.length > 0) {
      sections.push({ heading, content });
    }
  });

  // References section
  const refEls = document.querySelectorAll('.reference-container .reference-item, ol.references li');
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
  const figEls = document.querySelectorAll('figure img, .figuregroup img');

  for (const img of figEls) {
    // Scroll into view to trigger lazy loading
    img.scrollIntoView({ behavior: 'instant', block: 'center' });

    // Wait for src to populate (poll up to 3 seconds)
    const src = await waitForSrc(img, 3000);
    if (!src) continue;

    const figId = img.getAttribute('data-media-id') || src;
    const figureContainer = img.closest('figure') || img.closest('.figuregroup');
    const captionEl = figureContainer?.querySelector('figcaption, .figcaption, .caption');
    const caption = captionEl?.textContent?.trim() || '';

    const index = figures.length + 1;
    const filename = `fig${index}.png`;

    figures.push({
      id: figId,
      url: src.startsWith('http') ? src : new URL(src, window.location.origin).href,
      filename,
      caption
    });
  }

  // Scroll back to top
  window.scrollTo(0, 0);
  return figures;
}

function waitForSrc(img, timeoutMs) {
  return new Promise(resolve => {
    if (img.src && !img.src.includes('blank') && img.naturalWidth > 0) {
      return resolve(img.src);
    }
    const interval = 100;
    let elapsed = 0;
    const timer = setInterval(() => {
      elapsed += interval;
      if (img.src && !img.src.includes('blank') && img.naturalWidth > 0) {
        clearInterval(timer);
        resolve(img.src);
      } else if (elapsed >= timeoutMs) {
        clearInterval(timer);
        resolve(img.src || null);
      }
    }, interval);
  });
}
