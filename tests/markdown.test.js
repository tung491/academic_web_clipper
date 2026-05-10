import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { toMarkdown } from '../lib/markdown.js';

describe('toMarkdown', () => {
  const sampleData = {
    metadata: {
      title: 'Test Paper Title',
      authors: ['Alice Smith', 'Bob Jones'],
      doi: '10.1109/TEST.2021.001',
      date: '2021-04-08',
      venue: 'IEEE Transactions on Testing, vol. 1, no. 1',
      keywords: ['testing', 'markdown']
    },
    sections: [],
    figures: []
  };

  it('generates YAML frontmatter with all metadata fields', () => {
    const md = toMarkdown(sampleData);
    assert.ok(md.startsWith('---\n'));
    assert.ok(md.includes('title: "Test Paper Title"'));
    assert.ok(md.includes('authors: [Alice Smith, Bob Jones]'));
    assert.ok(md.includes('inline_author: "Smith et al."'));
    assert.ok(md.includes('doi: "10.1109/TEST.2021.001"'));
    assert.ok(md.includes('date: 2021-04-08'));
    assert.ok(md.includes('venue: "IEEE Transactions on Testing, vol. 1, no. 1"'));
    assert.ok(md.includes('keywords: [testing, markdown]'));
    assert.ok(md.includes('\n---\n'));
  });

  it('renders sections with headings and paragraphs', () => {
    const data = {
      metadata: sampleData.metadata,
      sections: [
        {
          heading: 'I. Introduction',
          content: [
            { type: 'paragraph', text: 'This paper introduces testing.' },
            { type: 'paragraph', text: 'We propose a new approach.' }
          ]
        },
        {
          heading: 'II. Related Work',
          content: [
            { type: 'paragraph', text: 'Prior work includes...' }
          ]
        }
      ],
      figures: []
    };
    const md = toMarkdown(data);
    assert.ok(md.includes('## I. Introduction'));
    assert.ok(md.includes('This paper introduces testing.'));
    assert.ok(md.includes('## II. Related Work'));
  });

  it('renders figure wikilinks with captions', () => {
    const data = {
      metadata: sampleData.metadata,
      sections: [
        {
          heading: 'I. Introduction',
          content: [
            { type: 'paragraph', text: 'See the figure below.' },
            { type: 'figure', figureId: 'fig1' }
          ]
        }
      ],
      figures: [
        { id: 'fig1', filename: 'fig1.png', caption: 'Figure 1: System architecture' }
      ]
    };
    const md = toMarkdown(data);
    assert.ok(md.includes('![[images/fig1.png]]'));
    assert.ok(md.includes('*Figure 1: System architecture*'));
  });

  it('uses images/ path for failed figures so the placeholder resolves alongside real images', () => {
    const data = {
      metadata: sampleData.metadata,
      sections: [
        {
          heading: 'I. Intro',
          content: [{ type: 'figure', figureId: 'fig1' }]
        }
      ],
      figures: [
        { id: 'fig1', filename: 'fig1.png', caption: '', failed: true }
      ]
    };
    const md = toMarkdown(data);
    assert.ok(md.includes('![[images/fig_missing.png]]'));
  });

  it('handles sections with no content gracefully', () => {
    const data = {
      metadata: sampleData.metadata,
      sections: [{ heading: 'III. Empty Section', content: [] }],
      figures: []
    };
    const md = toMarkdown(data);
    assert.ok(md.includes('## III. Empty Section'));
  });

  it('skips figure block when figure data is missing', () => {
    const data = {
      metadata: sampleData.metadata,
      sections: [
        {
          heading: 'I. Intro',
          content: [{ type: 'figure', figureId: 'nonexistent' }]
        }
      ],
      figures: []
    };
    const md = toMarkdown(data);
    assert.ok(!md.includes('![['));
  });

  it('formats inline_author as last name for solo author', () => {
    const data = {
      metadata: {
        ...sampleData.metadata,
        authors: ['John Doe']
      },
      sections: [],
      figures: []
    };
    const md = toMarkdown(data);
    assert.ok(md.includes('inline_author: "Doe"'));
    assert.ok(!md.includes('et al.'));
  });

  it('handles missing/null metadata fields gracefully', () => {
    const data = {
      metadata: {
        title: 'Partial Paper',
        authors: [],
        doi: '',
        date: '',
        venue: '',
        keywords: []
      },
      sections: [],
      figures: []
    };
    const md = toMarkdown(data);
    assert.ok(md.includes('title: "Partial Paper"'));
    assert.ok(!md.includes('authors:'));
    assert.ok(!md.includes('inline_author:'));
    assert.ok(!md.includes('doi:'));
    assert.ok(!md.includes('venue:'));
    assert.ok(!md.includes('keywords:'));
  });
});
