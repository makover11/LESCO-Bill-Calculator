/**
 * background.js
 * Manifest V3 Service Worker for LESCO Bill Calculator
 * Clean, lightweight, zero remote dependencies.
 */

// Initialize context menus on install or update
chrome.runtime.onInstalled.addListener(function () {
  // Remove existing menus to avoid duplicate ID errors
  chrome.contextMenus.removeAll(function () {
    // 1. Context menu for selected text (e.g. units or meter reading)
    chrome.contextMenus.create({
      id: 'lesco-calc-selection',
      title: 'Calculate LESCO bill for "%s" units',
      contexts: ['selection']
    });

    // 2. Action to open Full Tab Studio workspace
    chrome.contextMenus.create({
      id: 'lesco-open-studio',
      title: 'Open LESCO Bill Calculator (Studio Mode)',
      contexts: ['action']
    });
  });

  // Set default initial settings if not already present
  chrome.storage.local.get(['activeTab', 'phase', 'fpa'], function (data) {
    var defaults = {};
    if (!data.activeTab) defaults.activeTab = 'domestic';
    if (!data.phase) defaults.phase = 'single';
    if (data.fpa === undefined) defaults.fpa = 0;
    if (Object.keys(defaults).length > 0) {
      chrome.storage.local.set(defaults);
    }
  });
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener(function (info, tab) {
  if (info.menuItemId === 'lesco-calc-selection') {
    var selectedText = (info.selectionText || '').trim();
    // Extract first valid sequence of numbers/digits
    var match = selectedText.match(/\d+(\.\d+)?/);
    var parsedUnits = match ? parseFloat(match[0]) : null;

    if (parsedUnits !== null && !isNaN(parsedUnits) && parsedUnits > 0) {
      chrome.storage.local.set({ pendingUnits: parsedUnits }, function () {
        openFullTab();
      });
    } else {
      openFullTab();
    }
  } else if (info.menuItemId === 'lesco-open-studio') {
    openFullTab();
  }
});

// Open or switch to Full Tab Studio mode
function openFullTab() {
  var studioUrl = chrome.runtime.getURL('fulltab.html');
  chrome.tabs.query({ url: studioUrl }, function (tabs) {
    if (tabs && tabs.length > 0) {
      // Focus existing tab
      chrome.tabs.update(tabs[0].id, { active: true });
      if (tabs[0].windowId) {
        chrome.windows.update(tabs[0].windowId, { focused: true });
      }
    } else {
      // Create new tab
      chrome.tabs.create({ url: studioUrl });
    }
  });
}

// Listen for messages from popup or fulltab if needed
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message && message.action === 'openFullTab') {
    openFullTab();
    sendResponse({ success: true });
  }
  return true;
});
