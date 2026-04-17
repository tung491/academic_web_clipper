// content/mdpi.js
// MDPI extraction. Injected after content/shared.js.

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
    document.querySelector('meta[name="citation_title"]')?.content || 'Untitled';

  const authorElements = document.querySelectorAll('.art-authors .sciprofiles-link');
  let authors = [...authorElements].map(el => el.textContent.trim()).filter(Boolean);
  if (authors.length === 0) {
    authors = [...document.querySelectorAll('meta[name="citation_author"]')]
      .map(el => el.content).filter(Boolean);
  }

  const abstractEl = document.querySelector('.art-abstract p') || document.querySelector('.art-abstract .html-p');
  const abstract = abstractEl?.textContent?.trim() || '';

  const doi = document.querySelector('meta[name="citation_doi"]')?.content || '';
  const date = document.querySelector('meta[name="citation_publication_date"]')?.content || '';
  const venue = document.querySelector('meta[name="citation_journal_title"]')?.content ||
    document.querySelector('.journal-name')?.textContent?.trim() || '';

  const keywords = [...document.querySelectorAll('.art-keyword')]
    .map(el => el.textContent.trim().replace(/;+$/, '').trim()).filter(Boolean);

  return { title, authors, doi, date, venue, keywords, abstract };
}

function extractSections() {
  const sections = [];

  // Abstract
  const abstractEl = document.querySelector('.art-abstract p') || document.querySelector('.art-abstract .html-p');
  if (abstractEl) {
    sections.push({
      heading: 'Abstract',
      content: [{ type: 'paragraph', text: abstractEl.textContent.trim() }]
    });
  }

  // Body — walk .html-body
  const bodyEl = document.querySelector('.html-body');
  if (bodyEl) {
    let currentHeading = null;
    let currentContent = [];

    var flush = function() {
      if (currentHeading !== null || currentContent.length > 0) {
        sections.push({ heading: currentHeading || 'Untitled Section', content: currentContent });
      }
      currentHeading = null;
      currentContent = [];
    };

    var walker = document.createTreeWalker(bodyEl, NodeFilter.SHOW_ELEMENT, {
      acceptNode: function(node) {
        if (node.matches('.html-h2, .html-h4, .html-p, .html-fig_img, .html-table_show, .html-fig_description')) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      }
    });

    var node;
    while ((node = walker.nextNode())) {
      if (node.matches('.html-h2, .html-h4')) {
        flush();
        currentHeading = node.textContent.trim();
      } else if (node.matches('.html-p')) {
        var text = node.textContent.trim();
        if (text) currentContent.push({ type: 'paragraph', text: text });
      } else if (node.matches('.html-fig_img')) {
        // Full-size images are inside .html-img > a.html-img-zoom > img
        var img = node.querySelector('a.html-img-zoom img') || node.querySelector('.html-figpopup img');
        if (img && img.src) {
          currentContent.push({ type: 'figure', figureId: img.src });
        }
      } else if (node.matches('.html-fig_description')) {
        // Caption — attach to previous figure if any
      } else if (node.matches('.html-table_show')) {
        // Extract table as text
        var table = node.querySelector('table');
        if (table) {
          var tableText = extractTableAsText(table);
          if (tableText) currentContent.push({ type: 'paragraph', text: tableText });
        }
      }
    }

    flush();
  }

  // References
  var refEls = document.querySelectorAll('.html-bib-entry, .article-bibliography li');
  if (refEls.length > 0) {
    var refContent = [...refEls].map(function(ref, i) {
      return { type: 'paragraph', text: (i + 1) + '. ' + ref.textContent.trim() };
    });
    sections.push({ heading: 'References', content: refContent });
  }

  return sections;
}

function extractTableAsText(table) {
  var rows = [];
  table.querySelectorAll('tr').forEach(function(tr) {
    var cells = [];
    tr.querySelectorAll('th, td').forEach(function(cell) {
      cells.push(cell.textContent.trim());
    });
    rows.push(cells.join(' | '));
  });
  return rows.join('\n');
}

async function extractFigures() {
  var figures = [];
  var seen = new Set();

  // Full-size PNGs are in: .html-img > a.html-img-zoom > img
  var imgEls = document.querySelectorAll('a.html-img-zoom img');

  for (var img of imgEls) {
    var src = img.src;
    if (!src || seen.has(src)) continue;
    seen.add(src);

    img.scrollIntoView({ behavior: 'instant', block: 'center' });
    await new Promise(function(r) { setTimeout(r, 200); });

    // Caption: find nearest .html-fig_description
    var container = img.closest('.html-fig_show') || img.closest('.html-img')?.parentElement;
    var captionEl = container?.querySelector('.html-fig_description');
    var caption = captionEl?.textContent?.trim() || '';

    var index = figures.length + 1;
    var filename = 'fig' + index + '.png';

    figures.push({ id: src, url: src, filename: filename, caption: caption });
  }

  // Fallback: if no .html-img-zoom images found, try .html-figpopup img (thumbnails)
  if (figures.length === 0) {
    var fallbackImgs = document.querySelectorAll('.html-figpopup img');
    for (var fImg of fallbackImgs) {
      var fSrc = fImg.src;
      if (!fSrc || seen.has(fSrc)) continue;
      seen.add(fSrc);

      var fContainer = fImg.closest('.html-fig_img')?.parentElement;
      var fCaptionEl = fContainer?.querySelector('.html-fig_description');
      var fCaption = fCaptionEl?.textContent?.trim() || '';

      var fIndex = figures.length + 1;
      figures.push({ id: fSrc, url: fSrc, filename: 'fig' + fIndex + '.png', caption: fCaption });
    }
  }

  window.scrollTo(0, 0);
  return figures;
}
