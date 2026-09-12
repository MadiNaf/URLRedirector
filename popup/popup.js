/**
 * Popup Logic for URL Redirector Chrome Extension
 */

const STORAGE_KEY = 'url_redirector_apps';
const HISTORY_KEY = 'url_redirector_history';
const THEME_KEY = 'url_redirector_theme';

// State
let applications = [];
let historyList = [];

// DOM Elements
const tabBtns = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');

const activeList = document.getElementById('active-list');
const activeEmptyState = document.getElementById('active-empty-state');
const allAppsList = document.getElementById('all-apps-list');
const allEmptyState = document.getElementById('all-empty-state');
const historyListContainer = document.getElementById('history-list');
const historyEmptyState = document.getElementById('history-empty-state');

const tabActiveBadge = document.getElementById('tab-active-badge');
const tabAllBadge = document.getElementById('tab-all-badge');
const tabHistoryBadge = document.getElementById('tab-history-badge');
const globalStatusChip = document.getElementById('global-status-chip');
const activeCountLabel = document.getElementById('active-count-label');

const searchAppsInput = document.getElementById('search-apps-input');
const searchHistoryInput = document.getElementById('search-history-input');
const btnClearHistory = document.getElementById('btn-clear-history');
const btnExportApps = document.getElementById('btn-export-apps');
const btnImportApps = document.getElementById('btn-import-apps');
const importFileInput = document.getElementById('import-file-input');
const themeToggle = document.getElementById('theme-toggle');
const themeLabel = document.getElementById('theme-label');
const themeIconContainer = document.getElementById('theme-icon-container');

const addAppForm = document.getElementById('add-app-form');
const appNameInput = document.getElementById('app-name');
const appSourceInput = document.getElementById('app-source');
const appTargetInput = document.getElementById('app-target');

const editModal = document.getElementById('edit-modal');
const editAppForm = document.getElementById('edit-app-form');
const editAppIdInput = document.getElementById('edit-app-id');
const editAppNameInput = document.getElementById('edit-app-name');
const editAppSourceInput = document.getElementById('edit-app-source');
const editAppTargetInput = document.getElementById('edit-app-target');
const closeModalBtn = document.getElementById('close-modal-btn');
const cancelModalBtn = document.getElementById('cancel-modal-btn');

const toast = document.getElementById('toast');
const toastMessage = document.getElementById('toast-message');

// Initialize Extension Popup
document.addEventListener('DOMContentLoaded', async () => {
  await initTheme();
  setupTabListeners();
  setupFormListeners();
  setupSearchListeners();
  setupPresets();
  setupHistoryListeners();
  setupSettingsListeners();
  await loadState();
});

/**
 * Storage Helpers
 */
function getStorageData(key, isLocalOnly = false) {
  return new Promise((resolve) => {
    if (!isLocalOnly && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get([key], (res) => {
        if (chrome.runtime.lastError || !res[key]) {
          chrome.storage.local.get([key], (localRes) => {
            resolve(localRes[key] || []);
          });
        } else {
          resolve(res[key] || []);
        }
      });
    } else if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([key], (res) => {
        resolve(res[key] || []);
      });
    } else {
      resolve([]);
    }
  });
}

function saveStorageData(key, data, isLocalOnly = false) {
  return new Promise((resolve) => {
    const payload = { [key]: data };
    if (!isLocalOnly && chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.set(payload, () => {
        if (chrome.runtime.lastError) {
          chrome.storage.local.set(payload, () => resolve());
        } else {
          resolve();
        }
      });
    } else if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set(payload, () => resolve());
    } else {
      resolve();
    }
  });
}

async function loadState() {
  applications = await getStorageData(STORAGE_KEY);
  historyList = await getStorageData(HISTORY_KEY, true);
  render();
}

async function saveApplications() {
  await saveStorageData(STORAGE_KEY, applications);
  if (chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ type: 'REFRESH_RULES' });
  }
  render();
}

async function saveHistory() {
  await saveStorageData(HISTORY_KEY, historyList, true);
  render();
}

/**
 * Render Main View
 */
function render() {
  const activeApps = applications.filter((app) => app.enabled);
  const appSearchQuery = (searchAppsInput.value || '').trim().toLowerCase();
  const historySearchQuery = (searchHistoryInput.value || '').trim().toLowerCase();

  // Update Badges & Counters
  tabActiveBadge.textContent = activeApps.length;
  tabAllBadge.textContent = applications.length;
  tabHistoryBadge.textContent = historyList.length;

  if (activeApps.length > 0) {
    globalStatusChip.classList.add('active');
    activeCountLabel.textContent = `${activeApps.length} Active`;
  } else {
    globalStatusChip.classList.remove('active');
    activeCountLabel.textContent = '0 Active';
  }

  // Render Lists
  renderActiveApps(activeApps);
  renderAllApps(appSearchQuery);
  renderHistoryList(historySearchQuery);
}

function sortAppsByName(appsToSort) {
  if (!Array.isArray(appsToSort)) return [];

  const sortedApps = [...appsToSort].sort((a, b) => {
    const nameA = (a && a.name ? a.name : (a && a.sourceUrl ? a.sourceUrl : '')).trim();
    const nameB = (b && b.name ? b.name : (b && b.sourceUrl ? b.sourceUrl : '')).trim();
    return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
  });
  return sortedApps;
}

function renderActiveApps(activeApps) {
  activeList.innerHTML = '';
  const sortedActiveApps = sortAppsByName(activeApps);

  if (sortedActiveApps.length === 0) {
    activeEmptyState.style.display = 'flex';
  } else {
    activeEmptyState.style.display = 'none';
    sortedActiveApps.forEach((app) => {
      const card = createActiveCardElement(app);
      activeList.appendChild(card);
    });
  }
}

function renderAllApps(filterQuery) {
  allAppsList.innerHTML = '';
  const query = (filterQuery || '').trim().toLowerCase();
  const filteredApps = applications.filter((app) => {
    if (!app) return false;
    const name = (app.name || '').toLowerCase();
    const source = (app.sourceUrl || '').toLowerCase();
    const target = (app.targetUrl || '').toLowerCase();
    return name.includes(query) || source.includes(query) || target.includes(query);
  });

  const sortedApps = sortAppsByName(filteredApps);

  if (sortedApps.length === 0) {
    allEmptyState.style.display = 'flex';
  } else {
    allEmptyState.style.display = 'none';
    sortedApps.forEach((app) => {
      const card = createAllCardElement(app);
      allAppsList.appendChild(card);
    });
  }
}

function renderHistoryList(filterQuery) {
  historyListContainer.innerHTML = '';
  const filteredHistory = historyList.filter((item) =>
    (item.appName && item.appName.toLowerCase().includes(filterQuery)) ||
    (item.originalUrl && item.originalUrl.toLowerCase().includes(filterQuery)) ||
    (item.redirectedUrl && item.redirectedUrl.toLowerCase().includes(filterQuery))
  );

  if (filteredHistory.length === 0) {
    historyEmptyState.style.display = 'flex';
  } else {
    historyEmptyState.style.display = 'none';
    filteredHistory.forEach((item) => {
      const card = createHistoryCardElement(item);
      historyListContainer.appendChild(card);
    });
  }
}

/**
 * Card Creators
 */
function createActiveCardElement(app) {
  const card = document.createElement('div');
  card.className = 'app-card';

  card.innerHTML = `
    <div class="card-top">
      <div class="app-title">
        <span class="active-dot"></span>
        ${escapeHtml(app.name)}
      </div>
      <label class="switch" title="Disable redirection">
        <input type="checkbox" checked data-id="${app.id}" class="toggle-active-btn">
        <span class="slider"></span>
      </label>
    </div>
    <div class="url-flow">
      <div class="url-node">
        <span class="node-tag source">FROM</span>
        <span class="url-text" title="${escapeHtml(app.sourceUrl)}">${escapeHtml(app.sourceUrl)}</span>
      </div>
      <div class="flow-arrow">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="7 13 12 18 17 13"></polyline>
          <line x1="12" y1="6" x2="12" y2="18"></line>
        </svg>
      </div>
      <div class="url-node">
        <span class="node-tag target">TO</span>
        <span class="url-text" title="${escapeHtml(app.targetUrl)}">${escapeHtml(app.targetUrl)}</span>
      </div>
    </div>
  `;

  const toggle = card.querySelector('.toggle-active-btn');
  toggle.addEventListener('change', (e) => {
    toggleAppStatus(app.id, e.target.checked);
  });

  return card;
}

function createAllCardElement(app) {
  const card = document.createElement('div');
  card.className = `app-card ${app.enabled ? '' : 'disabled'}`;

  card.innerHTML = `
    <div class="card-top">
      <div class="app-title">
        ${app.enabled ? '<span class="active-dot"></span>' : ''}
        ${escapeHtml(app.name)}
      </div>
      <label class="switch" title="${app.enabled ? 'Disable' : 'Enable'} redirection">
        <input type="checkbox" ${app.enabled ? 'checked' : ''} data-id="${app.id}" class="toggle-app-btn">
        <span class="slider"></span>
      </label>
    </div>
    <div class="url-flow">
      <div class="url-node">
        <span class="node-tag source">SRC</span>
        <span class="url-text">${escapeHtml(app.sourceUrl)}</span>
      </div>
      <div class="url-node">
        <span class="node-tag target">TGT</span>
        <span class="url-text">${escapeHtml(app.targetUrl)}</span>
      </div>
    </div>
    <div class="card-actions">
      <button type="button" class="btn-action edit-app-btn" data-id="${app.id}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
        </svg>
        Edit
      </button>
      <button type="button" class="btn-action delete delete-app-btn" data-id="${app.id}">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
        Remove
      </button>
    </div>
  `;

  const toggle = card.querySelector('.toggle-app-btn');
  toggle.addEventListener('change', (e) => {
    toggleAppStatus(app.id, e.target.checked);
  });

  const editBtn = card.querySelector('.edit-app-btn');
  editBtn.addEventListener('click', () => {
    openEditModal(app);
  });

  const deleteBtn = card.querySelector('.delete-app-btn');
  deleteBtn.addEventListener('click', () => {
    removeApp(app.id);
  });

  return card;
}

function createHistoryCardElement(item) {
  const card = document.createElement('div');
  card.className = 'history-card';

  const formattedTime = formatTimestamp(item.timestamp);

  card.innerHTML = `
    <div class="history-meta">
      <span class="history-time">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
        ${formattedTime}
      </span>
      <span class="history-app-badge">${escapeHtml(item.appName || 'App Rule')}</span>
    </div>
    <div class="url-flow">
      <div class="url-node">
        <span class="node-tag source">ORIGINAL</span>
        <span class="url-text" title="${escapeHtml(item.originalUrl)}">${escapeHtml(item.originalUrl)}</span>
      </div>
      <div class="flow-arrow">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="7 13 12 18 17 13"></polyline>
          <line x1="12" y1="6" x2="12" y2="18"></line>
        </svg>
      </div>
      <div class="url-node">
        <span class="node-tag target">TARGET</span>
        <span class="url-text" title="${escapeHtml(item.redirectedUrl)}">${escapeHtml(item.redirectedUrl)}</span>
      </div>
    </div>
    <div class="card-actions">
      <button type="button" class="btn-action copy-url-btn" title="Copy original URL">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
        </svg>
        Copy URL
      </button>
      <button type="button" class="btn-action delete delete-history-btn" title="Delete entry">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"></polyline>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
        Remove
      </button>
    </div>
  `;

  // Copy button
  const copyBtn = card.querySelector('.copy-url-btn');
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(item.originalUrl).then(() => {
      showToast('Copied original URL');
    });
  });

  // Delete button
  const deleteBtn = card.querySelector('.delete-history-btn');
  deleteBtn.addEventListener('click', () => {
    removeHistoryItem(item.id);
  });

  return card;
}

/**
 * App Actions
 */
async function toggleAppStatus(id, enabled) {
  const index = applications.findIndex((a) => a.id === id);
  if (index !== -1) {
    applications[index].enabled = enabled;
    await saveApplications();
    showToast(enabled ? 'Redirection enabled' : 'Redirection disabled');
  }
}

async function removeApp(id) {
  const app = applications.find((a) => a.id === id);
  if (confirm(`Remove application "${app ? app.name : ''}"?`)) {
    applications = applications.filter((a) => a.id !== id);
    await saveApplications();
    showToast('Application removed');
  }
}

async function removeHistoryItem(id) {
  historyList = historyList.filter((item) => item.id !== id);
  await saveHistory();
  showToast('History entry removed');
}

async function clearAllHistory() {
  if (historyList.length === 0) return;
  if (confirm('Are you sure you want to clear all intercepted history?')) {
    historyList = [];
    await saveHistory();
    showToast('History cleared');
  }
}

function openEditModal(app) {
  editAppIdInput.value = app.id;
  editAppNameInput.value = app.name;
  editAppSourceInput.value = app.sourceUrl;
  editAppTargetInput.value = app.targetUrl;
  editModal.classList.remove('hidden');
}

function closeEditModal() {
  editModal.classList.add('hidden');
}

/**
 * Event Listeners Setup
 */
function setupTabListeners() {
  tabBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetTab = btn.getAttribute('data-tab');

      tabBtns.forEach((b) => b.classList.remove('active'));
      tabContents.forEach((c) => c.classList.remove('active'));

      btn.classList.add('active');
      document.getElementById(targetTab).classList.add('active');
    });
  });

  const linkGotoImport = document.getElementById('link-goto-import');
  if (linkGotoImport) {
    linkGotoImport.addEventListener('click', () => {
      const settingsTabBtn = document.getElementById('btn-tab-settings');
      if (settingsTabBtn) {
        settingsTabBtn.click();
      }
    });
  }
}

function setupFormListeners() {
  addAppForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = appNameInput.value.trim();
    let sourceUrl = appSourceInput.value.trim();
    let targetUrl = appTargetInput.value.trim();

    if (!name || !sourceUrl || !targetUrl) {
      showToast('Please fill in all fields');
      return;
    }

    if (!/^https?:\/\//i.test(sourceUrl)) {
      sourceUrl = 'https://' + sourceUrl;
    }
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'http://' + targetUrl;
    }

    const newApp = {
      id: 'app_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
      name: name,
      sourceUrl: sourceUrl,
      targetUrl: targetUrl,
      enabled: true,
      createdAt: Date.now()
    };

    applications.push(newApp);
    await saveApplications();

    addAppForm.reset();
    showToast(`Added "${name}"`);
    document.getElementById('btn-tab-active').click();
  });

  editAppForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = editAppIdInput.value;
    const name = editAppNameInput.value.trim();
    let sourceUrl = editAppSourceInput.value.trim();
    let targetUrl = editAppTargetInput.value.trim();

    if (!/^https?:\/\//i.test(sourceUrl)) {
      sourceUrl = 'https://' + sourceUrl;
    }
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'http://' + targetUrl;
    }

    const index = applications.findIndex((a) => a.id === id);
    if (index !== -1) {
      applications[index].name = name;
      applications[index].sourceUrl = sourceUrl;
      applications[index].targetUrl = targetUrl;

      await saveApplications();
      closeEditModal();
      showToast(`Updated "${name}"`);
    }
  });

  closeModalBtn.addEventListener('click', closeEditModal);
  cancelModalBtn.addEventListener('click', closeEditModal);

  editModal.addEventListener('click', (e) => {
    if (e.target === editModal) {
      closeEditModal();
    }
  });
}

function setupSearchListeners() {
  searchAppsInput.addEventListener('input', () => {
    const filterQuery = (searchAppsInput.value || '').trim().toLowerCase();
    renderAllApps(filterQuery);
  });

  searchHistoryInput.addEventListener('input', () => {
    const filterQuery = (searchHistoryInput.value || '').trim().toLowerCase();
    renderHistoryList(filterQuery);
  });
}

function setupHistoryListeners() {
  btnClearHistory.addEventListener('click', clearAllHistory);
}

/**
 * Theme Management
 */
async function initTheme() {
  let savedTheme = 'dark';
  try {
    if (chrome.storage && chrome.storage.local) {
      const res = await new Promise((resolve) => {
        chrome.storage.local.get([THEME_KEY], resolve);
      });
      if (res && res[THEME_KEY]) {
        savedTheme = res[THEME_KEY];
      }
    }
  } catch (err) {
    console.error('URL Redirector: Failed to load theme preference', err);
  }
  applyTheme(savedTheme);
}

const MOON_ICON_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
</svg>`;

const SUN_ICON_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="5"></circle>
  <line x1="12" y1="1" x2="12" y2="3"></line>
  <line x1="12" y1="21" x2="12" y2="23"></line>
  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
  <line x1="1" y1="12" x2="3" y2="12"></line>
  <line x1="21" y1="12" x2="23" y2="12"></line>
  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
</svg>`;

function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    if (themeToggle) themeToggle.checked = false;
    if (themeLabel) themeLabel.textContent = 'Light mode';
    if (themeIconContainer) themeIconContainer.innerHTML = SUN_ICON_SVG;
  } else {
    document.documentElement.removeAttribute('data-theme');
    if (themeToggle) themeToggle.checked = true;
    if (themeLabel) themeLabel.textContent = 'Dark Mode';
    if (themeIconContainer) themeIconContainer.innerHTML = MOON_ICON_SVG;
  }
}

function setupSettingsListeners() {
  btnExportApps.addEventListener('click', exportApplications);
  btnImportApps.addEventListener('click', () => importFileInput.click());
  importFileInput.addEventListener('change', importApplications);

  if (themeToggle) {
    themeToggle.addEventListener('change', async (e) => {
      const newTheme = e.target.checked ? 'dark' : 'light';
      applyTheme(newTheme);
      try {
        if (chrome.storage && chrome.storage.local) {
          await new Promise((resolve) => {
            chrome.storage.local.set({ [THEME_KEY]: newTheme }, resolve);
          });
        }
      } catch (err) {
        console.error('URL Redirector: Failed to save theme preference', err);
      }
      showToast(`Theme switched to ${newTheme === 'dark' ? 'Dark' : 'Light'} mode`);
    });
  }
}

function exportApplications() {
  if (applications.length === 0) {
    showToast('No applications to export');
    return;
  }

  const dataStr = JSON.stringify(applications, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const timestamp = new Date().toISOString().slice(0, 10);
  const filename = `localbridge_export_${timestamp}.json`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();

  URL.revokeObjectURL(url);
  showToast(`Exported ${applications.length} application(s)`);
}

/**
 * Normalize a URL for comparison: trim, lowercase, ensure protocol
 */
function normalizeUrl(url) {
  let normalized = (url || '').trim().toLowerCase();
  if (!/^https?:\/\//i.test(normalized)) {
    normalized = 'https://' + normalized;
  }
  // Remove trailing slash for consistent comparison
  normalized = normalized.replace(/\/+$/, '');
  return normalized;
}

/**
 * Import applications from a JSON file, skipping duplicates by sourceUrl + targetUrl
 */
async function importApplications(e) {
  const file = e.target.files[0];
  if (!file) return;

  // Reset input so the same file can be re-imported if needed
  importFileInput.value = '';

  try {
    const text = await file.text();
    let importedData;

    try {
      importedData = JSON.parse(text);
    } catch (parseErr) {
      showToast('Invalid JSON file');
      return;
    }

    if (!Array.isArray(importedData)) {
      showToast('Invalid format: expected an array');
      return;
    }

    // Build a set of existing normalized sourceUrl+targetUrl pairs for fast lookup
    const existingKeys = new Set(
      applications.map((app) =>
        normalizeUrl(app.sourceUrl) + '||' + normalizeUrl(app.targetUrl)
      )
    );

    let imported = 0;
    let skipped = 0;

    for (const item of importedData) {
      // Validate required fields
      if (!item || !item.sourceUrl || !item.targetUrl) {
        skipped++;
        continue;
      }

      const key = normalizeUrl(item.sourceUrl) + '||' + normalizeUrl(item.targetUrl);

      if (existingKeys.has(key)) {
        skipped++;
        continue;
      }

      // Normalize URLs with protocol
      let sourceUrl = item.sourceUrl.trim();
      let targetUrl = item.targetUrl.trim();
      if (!/^https?:\/\//i.test(sourceUrl)) sourceUrl = 'https://' + sourceUrl;
      if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'http://' + targetUrl;

      // Create a fresh app entry
      const newApp = {
        id: 'app_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
        name: item.name || 'Imported App',
        sourceUrl: sourceUrl,
        targetUrl: targetUrl,
        enabled: true,
        createdAt: Date.now()
      };

      applications.push(newApp);
      existingKeys.add(key);
      imported++;
    }

    if (imported > 0) {
      await saveApplications();
    }

    showToast(`Imported ${imported} app(s), ${skipped} skipped`);
  } catch (err) {
    console.error('URL Redirector: Import error:', err);
    showToast('Failed to import file');
  }
}

function setupPresets() {
  const presetBtns = document.querySelectorAll('.chip-btn');
  presetBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetVal = btn.getAttribute('data-target');
      appTargetInput.value = targetVal;
    });
  });
}

function formatTimestamp(ts) {
  if (!ts) return '';
  const date = new Date(ts);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const mins = String(date.getMinutes()).padStart(2, '0');
  const secs = String(date.getSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${mins}:${secs}`;
}

function showToast(msg) {
  toastMessage.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => {
    toast.classList.add('hidden');
  }, 2200);
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
