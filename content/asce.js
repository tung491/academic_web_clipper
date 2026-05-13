// content/asce.js
// ASCE Library (Atypon Literatum) extraction. Injected after content/shared.js.
//
// DOM shape (verified on ascelibrary.org full-text pages):
//   <h1 property="name">…title…</h1>
//   <div class="contributors">
//     <span property="author"><a><span property="givenName">…</span> <span property="familyName">…</span></a></span>, …
//   </div>
//   <section id="abstract"><h2>Abstract</h2><div role="paragraph">…</div></section>
//   <section id="bodymatter">
//     <section id="sec-1"><h2>…</h2><div role="paragraph">…</div><div class="figure-wrap">…</div>…</section>
//     <section id="sec-2"><h2>…</h2>
//       <section id="sec-2-1"><h3>…</h3><div role="paragraph">…</div>…</section>
//       …
//     </section>
//     …
//   </section>
// Figures: <div class="figure-wrap"><figure class="graphic"><img src="…"><figcaption>…</figcaption></figure></div>
// Tables:  <div class="figure-wrap"><figure class="table"><figcaption>…</figcaption><div class="table-wrap"><table>…</table></div></figure></div>

var SKIP_HEADING_RE = /^\s*(data availability|acknowledgment|reference|bibliography|supplemental|conflict|appendix|funding|notes?|nomenclature|disclosure|author contribution)/i;

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
    document.querySelector('h1[property="name"]')?.textContent?.trim() ||
    document.querySelector('h1.citation__title, h1.article__title')?.textContent?.trim() ||
    document.querySelector('meta[name="citation_title"]')?.content ||
    'Untitled';

  // Authors from schema.org markup → "Given Family"; fall back to meta (which is "Family, Given").
  var authors = [];
  document.querySelectorAll('span[property="author"], [typeof="Person"]').forEach(function(el) {
    var given = el.querySelector('[property="givenName"]')?.textContent?.trim();
    var family = el.querySelector('[property="familyName"]')?.textContent?.trim();
    var name = [given, family].filter(Boolean).join(' ');
    if (name && !authors.includes(name)) authors.push(name);
  });
  if (authors.length === 0) {
    document.querySelectorAll('.author-name span, .loa__author-name, .contrib-author a').forEach(function(el) {
      var t = el.textContent.trim();
      if (t && !authors.includes(t)) authors.push(t);
    });
  }
  if (authors.length === 0) {
    authors = [...document.querySelectorAll('meta[name="citation_author"]')]
      .map(function(el) { return el.content.trim(); })
      .filter(Boolean);
  }

  // Abstract — iterate all paragraph divs (not just the first <div>).
  var abstract = '';
  var abstractSec = document.querySelector('section#abstract, section[property="abstract"]');
  if (!abstractSec) {
    document.querySelectorAll('section').forEach(function(sec) {
      var h = sec.querySelector('h2');
      if (h && /^abstract$/i.test(h.textContent.trim())) abstractSec = sec;
    });
  }
  if (abstractSec) {
    var paras = abstractSec.querySelectorAll('div[role="paragraph"], p');
    if (paras.length === 0) paras = abstractSec.querySelectorAll(':scope > div');
    abstract = [...paras]
      .map(function(p) { return p.textContent.trim(); })
      .filter(Boolean)
      .join('\n\n');
  }

  var doi = document.querySelector('meta[name="citation_doi"]')?.content || '';
  var date = document.querySelector('meta[name="citation_publication_date"]')?.content || '';
  var venue = document.querySelector('meta[name="citation_journal_title"]')?.content || '';

  var keywords = [];
  // Visible keyword chips, when present
  document.querySelectorAll('.article__keyword, .abstractKeywords a, .kwd-group .kwd').forEach(function(el) {
    var kw = el.textContent.trim();
    if (kw && !keywords.includes(kw)) keywords.push(kw);
  });
  // Fallback to <meta name="keywords"> (comma-separated)
  if (keywords.length === 0) {
    var kwMeta = document.querySelector('meta[name="keywords"]')?.content || '';
    kwMeta.split(',').forEach(function(kw) {
      var t = kw.trim();
      if (t && !keywords.includes(t)) keywords.push(t);
    });
  }

  return { title: title, authors: authors, doi: doi, date: date, venue: venue, keywords: keywords, abstract: abstract };
}

function extractSections() {
  var sections = [];

  // 1) Abstract first (independent of bodymatter)
  var abstractSec = document.querySelector('section#abstract, section[property="abstract"]');
  if (abstractSec) {
    var aparas = abstractSec.querySelectorAll('div[role="paragraph"], p');
    if (aparas.length === 0) aparas = abstractSec.querySelectorAll(':scope > div');
    var atext = [...aparas].map(function(p) { return p.textContent.trim(); }).filter(Boolean).join('\n\n');
    if (atext) {
      sections.push({ heading: 'Abstract', content: [{ type: 'paragraph', text: atext }] });
    }
  }

  // 2) Body — walk EVERY <section> inside #bodymatter (handles arbitrary H3/H4 nesting).
  //    For each section we only emit content from direct, non-section children; nested
  //    sections are visited in their own iteration so nothing is duplicated.
  var body = document.querySelector('section#bodymatter') || document.querySelector('div.core-container');
  if (!body) return sections;

  body.querySelectorAll('section').forEach(function(sec) {
    // Heading must be a DIRECT child (otherwise we'd inherit a descendant's H3 as our own).
    var heading = '';
    for (var i = 0; i < sec.children.length; i++) {
      var c = sec.children[i];
      if (c.tagName === 'H2' || c.tagName === 'H3' || c.tagName === 'H4') {
        heading = c.textContent.trim();
        break;
      }
    }
    if (!heading) return;
    if (SKIP_HEADING_RE.test(heading)) return;

    var content = [];
    [...sec.children].forEach(function(child) {
      if (child.tagName === 'SECTION') return; // handled by its own iteration
      if (child.tagName === 'H2' || child.tagName === 'H3' || child.tagName === 'H4') return;
      processBlock(child, content);
    });

    if (content.length > 0 || heading) {
      sections.push({ heading: heading, content: content });
    }
  });

  return sections;
}

function processBlock(el, content) {
  // Figure (image) — caption is rendered by lib/markdown.js from figures[].caption,
  // so we only push the figure reference here.
  var graphic = el.matches?.('figure.graphic') ? el : el.querySelector?.('figure.graphic');
  if (graphic) {
    var img = graphic.querySelector('img');
    if (img) {
      var src = img.getAttribute('data-src') || img.getAttribute('src') || img.src;
      if (src) {
        var url = src.startsWith('http') ? src : new URL(src, location.href).href;
        content.push({ type: 'figure', figureId: url });
      }
    }
    return;
  }

  // Table — Atypon wraps tables in <figure class="table"> with a sibling <div class="table-wrap">.
  var tableFig = el.matches?.('figure.table') ? el : el.querySelector?.('figure.table');
  if (tableFig) {
    var tcap = tableFig.querySelector('figcaption')?.textContent?.trim();
    if (tcap) content.push({ type: 'paragraph', text: tcap });
    var tableEl = tableFig.querySelector('table');
    if (tableEl) {
      var tt = extractTableAsText(tableEl);
      if (tt) content.push({ type: 'paragraph', text: tt });
    }
    return;
  }

  // Bare table
  var bareTable = el.matches?.('table') ? el : el.querySelector?.(':scope > table');
  if (bareTable) {
    var bt = extractTableAsText(bareTable);
    if (bt) content.push({ type: 'paragraph', text: bt });
    return;
  }

  // Paragraph (Atypon uses div[role="paragraph"]; some pages still use <p>)
  if (el.matches?.('div[role="paragraph"], p')) {
    var text = el.textContent.trim();
    if (text) content.push({ type: 'paragraph', text: text });
    return;
  }

  // Wrapper that contains paragraphs / figures / tables — recurse into its descendants
  var innerParas = el.querySelectorAll?.('div[role="paragraph"], p');
  var innerFigs = el.querySelectorAll?.('figure.graphic, figure.table');
  if ((innerParas && innerParas.length) || (innerFigs && innerFigs.length)) {
    // Process figures/tables/paragraphs in document order
    var blocks = [...el.querySelectorAll('div[role="paragraph"], p, figure.graphic, figure.table')];
    blocks.forEach(function(b) { processBlock(b, content); });
    return;
  }

  // Last resort — short, meaningful text node
  var fallback = el.textContent?.trim();
  if (fallback && fallback.length > 10) {
    content.push({ type: 'paragraph', text: fallback });
  }
}

async function extractFigures() {
  var figures = [];
  var seen = new Set();
  // Only graphic figures — figure.table has no <img>, so this naturally excludes tables.
  var figEls = document.querySelectorAll('figure.graphic img, figure:not(.table) img');

  for (var img of figEls) {
    var src = img.getAttribute('data-src') || img.src;
    if (!src) continue;

    var url = src.startsWith('http') ? src : new URL(src, location.href).href;
    if (seen.has(url)) continue;
    if (/icon|logo|spinner|banner/i.test(url)) continue;
    // Skip images outside the article body (header logos, related-article thumbs, etc.)
    if (!img.closest('section#abstract, section#bodymatter, div.core-container')) continue;
    seen.add(url);

    img.scrollIntoView({ behavior: 'instant', block: 'center' });
    await new Promise(function(r) { setTimeout(r, 300); });

    var actualSrc = img.src || img.getAttribute('data-src');
    var actualUrl = actualSrc ? (actualSrc.startsWith('http') ? actualSrc : new URL(actualSrc, location.href).href) : url;

    var container = img.closest('figure');
    var captionEl = container?.querySelector('figcaption');
    var caption = captionEl?.textContent?.trim() || '';

    var index = figures.length + 1;
    figures.push({ id: url, url: actualUrl, filename: 'fig' + index + '.png', caption: caption });
  }

  window.scrollTo(0, 0);
  return figures;
}

function extractTableAsText(table) {
  var rows = [];
  table.querySelectorAll('tr').forEach(function(tr) {
    var cells = [];
    tr.querySelectorAll('th, td').forEach(function(cell) {
      cells.push(cell.textContent.trim().replace(/\s+/g, ' '));
    });
    rows.push(cells.join(' | '));
  });
  return rows.join('\n');
}
