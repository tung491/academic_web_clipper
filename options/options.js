// options/options.js

const pathInput = document.getElementById('default-path');
const saveBtn = document.getElementById('save-btn');
const statusDiv = document.getElementById('status');

// Load saved settings
chrome.storage.sync.get(['defaultSavePath'], (result) => {
  pathInput.value = result.defaultSavePath || 'Papers';
});

// Save settings
saveBtn.addEventListener('click', () => {
  const path = pathInput.value.trim();
  chrome.storage.sync.set({ defaultSavePath: path }, () => {
    statusDiv.textContent = 'Settings saved.';
    statusDiv.style.display = 'block';
    setTimeout(() => { statusDiv.style.display = 'none'; }, 2000);
  });
});
