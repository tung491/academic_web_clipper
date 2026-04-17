// content/wiley.js
// Wiley Online Library extraction. Injected after content/shared.js.

(async function extractPaper() {
  try {
    var metadata = extractMetadata();
    var sections = extractSections();
    var figures = await extractFigures();
    sendExtractionResult({ metadata: metadata, sections: sections, figures: figures });
  } catch (err) {
    sendExtractionError(err.message);
  }
})();

function extractMetadata() {
  var title =
    document.querySelector('.citation__title')?.textContent?.trim() ||
    document.querySelector('meta[name="citation_title"]')?.content || 'Untitled';

  var authorEls = document.querySelectorAll('.loa-authors-trunc .author-name span, .loa-authors .author-name span');
  var authors = [...authorEls].map(function(el) { return el.textContent.trim(); }).filter(Boolean);
  if (authors.length === 0) {
    authors = [...document.querySelectorAll('meta[name="citation_author"]')]
      .map(function(el) { return el.content.trim(); }).filter(Boolean);
  }

  // Abstract — try multiple selectors since Wiley varies by journal
  var abstractEl =
    document.querySelector('#abstract .article-section__content p') ||
    document.querySelector('[class*="abstract"] .article-section__content p') ||
    document.querySelector('.article-section__content p');
  var abstract = abstractEl?.textContent?.trim() || '';

  var doi = document.querySelector('meta[name="citation_doi"]')?.content || '';
  var date = document.querySelector('meta[name="citation_publication_date"]')?.content || '';
  var venue = document.querySelector('meta[name="citation_journal_title"]')?.content || '';

  var keywords = [];
  document.querySelectorAll('.article-keywords__list a, .kwd-group .kwd').forEach(function(el) {
    var kw = el.textContent.trim();
    if (kw && !keywords.includes(kw)) keywords.push(kw);
  });

  return { title: title, authors: authors, doi: doi, date: date, venue: venue, keywords: keywords, abstract: abstract };
}

function extractSections() {
  var sections = [];

  // Abstract
  var abstractEl =
    document.querySelector('#abstract .article-section__content p') ||
    document.querySelector('[class*="abstract"] .article-section__content p') ||
    document.querySelector('.article-section__content p');
  if (abstractEl) {
    sections.push({
      heading: 'Abstract',
      content: [{ type: 'paragraph', text: abstractEl.textContent.trim() }]
    });
  }

  // Body sections — iterate all .article-section__content
  var seenAbstract = false;
  document.querySelectorAll('.article-section__content').forEach(function(sectionEl) {
    // Skip the first one if it's the abstract we already captured
    if (!seenAbstract) {
      seenAbstract = true;
      var isAbstract = sectionEl.closest('#abstract') || sectionEl.closest('[class*="abstract"]');
      if (isAbstract || sectionEl === abstractEl?.closest('.article-section__content')) return;
    }

    var parent = sectionEl.closest('section') || sectionEl.parentElement;
    var headingEl = parent?.querySelector('h2, h3, .article-section__title');
    var heading = headingEl?.textContent?.trim() || 'Untitled Section';

    // Skip reference and supporting info sections
    if (/references|bibliography|supporting info|acknowledgment/i.test(heading)) return;

    var content = [];
    sectionEl.querySelectorAll('p').forEach(function(p) {
      var text = p.textContent.trim();
      if (text && text.length > 10) content.push({ type: 'paragraph', text: text });
    });

    // Figures within this section
    sectionEl.querySelectorAll('figure').forEach(function(fig) {
      var img = fig.querySelector('img.figure__image, picture img, img');
      if (img && img.src && img.src.includes('cms/asset')) {
        content.push({ type: 'figure', figureId: img.src });
      }
    });

    if (content.length > 0) sections.push({ heading: heading, content: content });
  });

  // Also capture inline figures that are in their own sections
  document.querySelectorAll('section.article-section__inline-figure').forEach(function(sec) {
    var fig = sec.querySelector('figure');
    if (!fig) return;
    var img = fig.querySelector('img.figure__image, picture img, img');
    if (img && img.src && img.src.includes('cms/asset')) {
      // Find which section this figure belongs to
      var prevSection = sec.previousElementSibling;
      while (prevSection && !prevSection.querySelector('.article-section__content')) {
        prevSection = prevSection.previousElementSibling;
      }
      // Figure will be matched by ID in extractFigures
    }
  });

  // References
  var refEls = document.querySelectorAll('#references-section li, .citation__body');
  if (refEls.length > 0) {
    var refContent = [...refEls].map(function(ref, i) {
      return { type: 'paragraph', text: (i + 1) + '. ' + ref.textContent.trim() };
    });
    sections.push({ heading: 'References', content: refContent });
  }

  return sections;
}

async function extractFigures() {
  var figures = [];
  var seen = new Set();

  // Wiley uses figure > picture > img or figure > img.figure__image
  var figureEls = document.querySelectorAll('figure.figure');

  for (var fig of figureEls) {
    var img = fig.querySelector('img.figure__image') || fig.querySelector('picture img') || fig.querySelector('img');
    if (!img) continue;

    var src = img.src;
    if (!src || !src.includes('cms/asset')) continue;
    if (seen.has(src)) continue;
    seen.add(src);

    img.scrollIntoView({ behavior: 'instant', block: 'center' });
    await new Promise(function(r) { setTimeout(r, 300); });

    var captionEl = fig.querySelector('figcaption, .figure__caption');
    var caption = captionEl?.textContent?.trim() || '';

    var index = figures.length + 1;
    figures.push({ id: src, url: src, filename: 'fig' + index + '.png', caption: caption });
  }

  window.scrollTo(0, 0);
  return figures;
}
