// options/options.js

const pathInput = document.getElementById('default-path');
const useSaveAsCheckbox = document.getElementById('use-save-as');
const saveBtn = document.getElementById('save-btn');
const statusDiv = document.getElementById('status');

// Load saved settings
chrome.storage.sync.get(['defaultSavePath', 'useSaveAs'], (result) => {
  pathInput.value = result.defaultSavePath || 'Papers';
  useSaveAsCheckbox.checked = result.useSaveAs || false;
});

// Save settings
saveBtn.addEventListener('click', () => {
  const path = pathInput.value.trim();
  const useSaveAs = useSaveAsCheckbox.checked;
  chrome.storage.sync.set({ defaultSavePath: path, useSaveAs }, () => {
    statusDiv.textContent = 'Settings saved.';
    statusDiv.style.display = 'block';
    setTimeout(() => { statusDiv.style.display = 'none'; }, 2000);
  });
});
