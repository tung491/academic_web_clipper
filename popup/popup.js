// popup/popup.js

const supportedView = document.getElementById('supported-view');
const unsupportedView = document.getElementById('unsupported-view');
const paperTitle = document.getElementById('paper-title');
const savePathInput = document.getElementById('save-path');
const clipBtn = document.getElementById('clip-btn');
const progressDiv = document.getElementById('progress');
const progressText = document.getElementById('progress-text');
const resultDiv = document.getElementById('result');
const settingsLink = document.getElementById('settings-link');

// Keep in sync with PUBLISHERS in background/service-worker.js
const SUPPORTED_PATTERNS = [
  /ieeexplore\.ieee\.org/,
  /arxiv\.org\/html\//,
  /link\.springer\.com/,
  /dl\.acm\.org/,
  /sciencedirect\.com/,
  /mdpi\.com/,
  /hal\.science/,
  /onlinelibrary\.wiley\.com/,
  /tandfonline\.com/,
  /ascelibrary\.org/,
];

const ARXIV_ABSTRACT = /arxiv\.org\/abs\//;

chrome.storage.sync.get(['defaultSavePath'], (result) => {
  savePathInput.value = result.defaultSavePath || 'Papers';
});

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (tab && tab.url && SUPPORTED_PATTERNS.some(p => p.test(tab.url))) {
    supportedView.style.display = 'block';
    paperTitle.textContent = tab.title.replace(/\s*[\|\-–—].*$/, '').trim() || 'Academic Paper';
  } else if (tab && tab.url && ARXIV_ABSTRACT.test(tab.url)) {
    unsupportedView.style.display = 'block';
    unsupportedView.querySelector('p').textContent = 'Open the HTML version of this arXiv paper to clip it.';
  } else {
    unsupportedView.style.display = 'block';
  }
});

clipBtn.addEventListener('click', () => {
  clipBtn.disabled = true;
  progressDiv.style.display = 'block';
  resultDiv.style.display = 'none';
  progressText.textContent = 'Starting...';
  const savePath = savePathInput.value.trim();
  chrome.runtime.sendMessage({ type: 'clip', savePath });
});

chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== 'progress') return;
  const { stage, detail } = message;
  if (stage === 'extracting') {
    progressText.textContent = 'Extracting paper content...';
  } else if (stage === 'downloading') {
    progressText.textContent = 'Downloading images...';
  } else if (stage === 'done') {
    progressDiv.style.display = 'none';
    resultDiv.style.display = 'block';
    resultDiv.className = 'success';
    resultDiv.textContent = `✓ ${detail}`;
    clipBtn.disabled = false;
  } else if (stage === 'error') {
    progressDiv.style.display = 'none';
    resultDiv.style.display = 'block';
    resultDiv.className = 'error';
    resultDiv.textContent = `✗ Error: ${detail}`;
    clipBtn.disabled = false;
  }
});

settingsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
