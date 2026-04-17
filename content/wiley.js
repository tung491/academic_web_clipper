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

  var abstractEl =
    document.querySelector('.article-section--abstract .article-section__content p') ||
    document.querySelector('#abstract .article-section__content p');
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
    document.querySelector('.article-section--abstract .article-section__content p') ||
    document.querySelector('#abstract .article-section__content p');
  if (abstractEl) {
    sections.push({
      heading: 'Abstract',
      content: [{ type: 'paragraph', text: abstractEl.textContent.trim() }]
    });
  }

  // Body sections
  document.querySelectorAll('.article-section__content').forEach(function(sectionEl) {
    // Skip abstract (already handled)
    if (sectionEl.closest('.article-section--abstract') || sectionEl.closest('#abstract')) return;

    var parent = sectionEl.closest('section') || sectionEl.parentElement;
    var headingEl = parent?.querySelector('h2, h3, .article-section__title');
    var heading = headingEl?.textContent?.trim() || 'Untitled Section';

    var content = [];
    sectionEl.querySelectorAll('p').forEach(function(p) {
      var text = p.textContent.trim();
      if (text && text.length > 10) content.push({ type: 'paragraph', text: text });
    });

    sectionEl.querySelectorAll('figure').forEach(function(fig) {
      var img = fig.querySelector('img');
      if (img) {
        var src = img.getAttribute('data-src') || img.src;
        if (src) content.push({ type: 'figure', figureId: new URL(src, location.href).href });
      }
    });

    if (content.length > 0) sections.push({ heading: heading, content: content });
  });

  // References
  var refEls = document.querySelectorAll('.citation__body, .references__item, #references-section li');
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
  var figEls = document.querySelectorAll('figure img, .figure__image img');

  for (var img of figEls) {
    var src = img.getAttribute('data-src') || img.src;
    if (!src) continue;

    var url = new URL(src, location.href).href;
    if (seen.has(url)) continue;
    seen.add(url);

    img.scrollIntoView({ behavior: 'instant', block: 'center' });
    await new Promise(function(r) { setTimeout(r, 300); });

    // Re-read after scroll (lazy loading)
    var actualSrc = img.src || img.getAttribute('data-src');
    var actualUrl = actualSrc ? new URL(actualSrc, location.href).href : url;

    var container = img.closest('figure');
    var captionEl = container?.querySelector('figcaption');
    var caption = captionEl?.textContent?.trim() || '';

    var index = figures.length + 1;
    figures.push({ id: url, url: actualUrl, filename: 'fig' + index + '.png', caption: caption });
  }

  window.scrollTo(0, 0);
  return figures;
}
