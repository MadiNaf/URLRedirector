/**
 * Background Service Worker for URL Redirector
 * Uses Chrome declarativeNetRequest API to redirect configured URLs to target local URLs.
 * Logs intercepted URL history using webRequest listener.
 */

const STORAGE_KEY = 'url_redirector_apps';
const HISTORY_KEY = 'url_redirector_history';
const MAX_HISTORY_ITEMS = 200;

/**
 * Fetch applications from storage
 */
async function getApplications() {
  return new Promise((resolve) => {
    if (chrome.storage && chrome.storage.sync) {
      chrome.storage.sync.get([STORAGE_KEY], (result) => {
        if (chrome.runtime.lastError || !result[STORAGE_KEY]) {
          chrome.storage.local.get([STORAGE_KEY], (localRes) => {
            resolve(localRes[STORAGE_KEY] || []);
          });
        } else {
          resolve(result[STORAGE_KEY] || []);
        }
      });
    } else if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([STORAGE_KEY], (result) => {
        resolve(result[STORAGE_KEY] || []);
      });
    } else {
      resolve([]);
    }
  });
}

/**
 * Fetch history from storage
 */
async function getHistory() {
  return new Promise((resolve) => {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.get([HISTORY_KEY], (result) => {
        resolve(result[HISTORY_KEY] || []);
      });
    } else {
      resolve([]);
    }
  });
}

/**
 * Save a new history entry into storage
 */
async function saveHistoryItem(item) {
  const history = await getHistory();
  // Prepend new history record
  history.unshift(item);
  // Cap at MAX_HISTORY_ITEMS
  const trimmed = history.slice(0, MAX_HISTORY_ITEMS);

  return new Promise((resolve) => {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ [HISTORY_KEY]: trimmed }, () => resolve());
    } else {
      resolve();
    }
  });
}

/**
 * Converts an application config into a declarativeNetRequest rule
 */
function convertAppToRule(app, index) {
  if (!app || !app.sourceUrl || !app.targetUrl) return null;

  const ruleId = index + 1;
  let sourceUrl = app.sourceUrl.trim();
  let targetUrl = app.targetUrl.trim();

  // Ensure protocol presence
  if (!/^https?:\/\//i.test(sourceUrl)) {
    sourceUrl = 'https://' + sourceUrl;
  }
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'http://' + targetUrl;
  }

  try {
    const srcObj = new URL(sourceUrl);
    const tgtObj = new URL(targetUrl);

    // Build subpath-preserving regex pattern
    const hostRegex = srcObj.hostname.replace(/\./g, '\\.');
    const portRegex = srcObj.port ? `:${srcObj.port}` : '(?::\\d+)?';
    const path = srcObj.pathname.replace(/\/$/, '');
    const pathRegex = path ? path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : '';

    // Regex matches exact host + port + path and captures trailing path/query
    const regexFilter = `^https?://(?:www\\.)?${hostRegex}${portRegex}${pathRegex}(.*)$`;

    const tgtPath = tgtObj.pathname.replace(/\/$/, '');
    const targetBase = tgtObj.origin + tgtPath;
    const regexSubstitution = `${targetBase}\\1`;

    return {
      id: ruleId,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: {
          regexSubstitution: regexSubstitution
        }
      },
      condition: {
        regexFilter: regexFilter,
        resourceTypes: [
          'main_frame',
          'sub_frame',
          'stylesheet',
          'script',
          'image',
          'font',
          'object',
          'xmlhttprequest',
          'ping',
          'csp_report',
          'media',
          'websocket',
          'other'
        ]
      }
    };
  } catch (err) {
    console.error('URL Redirector: Failed to convert application rule', app, err);
    return null;
  }
}

/**
 * Sync active applications to Chrome declarativeNetRequest dynamic rules
 */
async function syncDeclarativeRules() {
  try {
    const apps = await getApplications();
    const activeApps = apps.filter((app) => app && app.enabled);

    // Get current rules to remove
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const removeRuleIds = existingRules.map((r) => r.id);

    // Build new dynamic rules
    const addRules = activeApps
      .map((app, idx) => convertAppToRule(app, idx))
      .filter(Boolean);

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: removeRuleIds,
      addRules: addRules
    });

    // Update Extension Badge
    const activeCount = addRules.length;
    if (activeCount > 0) {
      chrome.action.setBadgeText({ text: String(activeCount) });
      chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }

    console.log(`URL Redirector: Synced ${activeCount} active redirection rule(s).`);
  } catch (error) {
    console.error('URL Redirector: Error syncing dynamic rules:', error);
  }
}

/**
 * Listen for redirection events and log history
 */
if (chrome.webRequest && chrome.webRequest.onBeforeRedirect) {
  chrome.webRequest.onBeforeRedirect.addListener(
    async (details) => {
      if (!details || !details.url || !details.redirectUrl) return;

      try {
        const apps = await getApplications();
        const activeApps = apps.filter((app) => app && app.enabled);

        // Find matching application
        const matchedApp = activeApps.find((app) => {
          try {
            let src = app.sourceUrl.trim();
            if (!/^https?:\/\//i.test(src)) src = 'https://' + src;
            const srcObj = new URL(src);
            const detailObj = new URL(details.url);
            return detailObj.hostname.includes(srcObj.hostname);
          } catch (e) {
            return details.url.includes(app.sourceUrl);
          }
        });

        if (matchedApp) {
          await saveHistoryItem({
            id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
            appId: matchedApp.id,
            appName: matchedApp.name,
            originalUrl: details.url,
            redirectedUrl: details.redirectUrl,
            timestamp: Date.now()
          });
        }
      } catch (err) {
        console.error('URL Redirector: Error logging history:', err);
      }
    },
    { urls: ['<all_urls>'] }
  );
}

// Extension Lifecycle Listeners
chrome.runtime.onInstalled.addListener(() => {
  syncDeclarativeRules();
});

chrome.runtime.onStartup.addListener(() => {
  syncDeclarativeRules();
});

if (chrome.storage && chrome.storage.onChanged) {
  chrome.storage.onChanged.addListener((changes) => {
    if (changes[STORAGE_KEY]) {
      syncDeclarativeRules();
    }
  });
}

// Runtime Message Listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'REFRESH_RULES') {
    syncDeclarativeRules().then(() => {
      sendResponse({ status: 'success' });
    });
    return true;
  }
});
