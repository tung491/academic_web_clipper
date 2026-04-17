// popup/popup.js

const ieeeView = document.getElementById('ieee-view');
const nonIeeeView = document.getElementById('non-ieee-view');
const paperTitle = document.getElementById('paper-title');
const savePathInput = document.getElementById('save-path');
const clipBtn = document.getElementById('clip-btn');
const progressDiv = document.getElementById('progress');
const progressText = document.getElementById('progress-text');
const resultDiv = document.getElementById('result');
const settingsLink = document.getElementById('settings-link');

// Load default save path from storage
chrome.storage.sync.get(['defaultSavePath'], (result) => {
  savePathInput.value = result.defaultSavePath || 'Papers';
});

// Check if current tab is IEEE Xplore
chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (tab && tab.url && tab.url.includes('ieeexplore.ieee.org/abstract/document')) {
    ieeeView.style.display = 'block';
    paperTitle.textContent = tab.title.replace(/\s*\|.*$/, '').trim() || 'IEEE Paper';
  } else {
    nonIeeeView.style.display = 'block';
  }
});

// Clip button click
clipBtn.addEventListener('click', () => {
  clipBtn.disabled = true;
  progressDiv.style.display = 'block';
  resultDiv.style.display = 'none';
  progressText.textContent = 'Starting...';

  const savePath = savePathInput.value.trim();
  chrome.runtime.sendMessage({ type: 'clip', savePath });
});

// Listen for progress updates from service worker
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

// Settings link
settingsLink.addEventListener('click', (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
