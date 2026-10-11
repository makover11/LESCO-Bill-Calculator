/**
 * popup.js
 * Controller for LESCO Bill Calculator Popup
 * Strictly Event-Driven, Zero-Inline, Chrome Storage Persisted.
 */

(function () {
  'use strict';

  // DOM Elements cache
  var elements = {
    // Buttons & Tabs
    btnOpenStudio: document.getElementById('btn-open-studio'),
    tabBtnDomestic: document.getElementById('tab-btn-domestic'),
    tabBtnCommercial: document.getElementById('tab-btn-commercial'),
    tabBtnAgricultural: document.getElementById('tab-btn-agricultural'),
    tabBtns: document.querySelectorAll('.tab-btn'),
    presetPills: document.querySelectorAll('.preset-pill'),
    presetsContainer: document.getElementById('presets-container'),

    // Input fields & containers
    inputUnits: document.getElementById('input-units'),
    inputAgriPeak: document.getElementById('input-agri-peak'),
    inputAgriOffpeak: document.getElementById('input-agri-offpeak'),
    selectPhase: document.getElementById('select-phase'),
    selectDomCat: document.getElementById('select-dom-cat'),
    selectComLoad: document.getElementById('select-com-load'),
    selectAgriLoad: document.getElementById('select-agri-load'),
    inputFpa: document.getElementById('input-fpa'),

    // Form containers
    fieldNonAgri: document.getElementById('field-units-container'),
    fieldAgriPeak: document.getElementById('field-agri-peak-container'),
    fieldAgriOffpeak: document.getElementById('field-agri-offpeak-container'),
    fieldDomCat: document.getElementById('field-dom-cat-container'),
    fieldComLoad: document.getElementById('field-com-load-container'),
    fieldAgriLoad: document.getElementById('field-agri-load-container'),

    // Note banner
    noteBanner: document.getElementById('note-banner'),
    noteIcon: document.getElementById('note-icon'),
    noteText: document.getElementById('note-text'),

    // Calculate & Actions
    btnCalculate: document.getElementById('btn-calculate'),
    btnCopySummary: document.getElementById('btn-copy-summary'),
    btnPrintBill: document.getElementById('btn-print-bill'),
    btnReset: document.getElementById('btn-reset'),

    // Results section
    sectionResults: document.getElementById('section-results'),
    resTotalAmount: document.getElementById('res-total-amount'),
    resMetaUnits: document.getElementById('res-meta-units'),
    resMetaCategory: document.getElementById('res-meta-category'),
    resMetaAvg: document.getElementById('res-meta-avg'),
    resDueDate: document.getElementById('res-due-date'),
    resDueAmount: document.getElementById('res-due-amount'),
    resLateDate: document.getElementById('res-late-date'),
    resLateAmount: document.getElementById('res-late-amount'),
    slabContainer: document.getElementById('slab-container'),
    slabTableBody: document.getElementById('slab-table-body'),
    breakdownRows: document.getElementById('breakdown-rows-container'),

    // Toast
    toast: document.getElementById('toast-message')
  };

  var currentTariff = 'domestic';
  var lastCalculationResult = null;
  var toastTimeout = null;

  /**
   * Display temporary toast notification
   */
  function showToast(message, duration) {
    if (!elements.toast) return;
    elements.toast.textContent = message;
    elements.toast.classList.remove('hidden');
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(function () {
      elements.toast.classList.add('hidden');
    }, duration || 2200);
  }

  /**
   * Switch active tariff tab
   */
  function setTariff(tariff, skipSave) {
    currentTariff = tariff;

    // Update tab buttons
    for (var i = 0; i < elements.tabBtns.length; i++) {
      var btn = elements.tabBtns[i];
      var isTarget = btn.getAttribute('data-tariff') === tariff;
      btn.classList.toggle('active', isTarget);
      btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    }

    // Toggle field visibility
    if (tariff === 'domestic') {
      elements.fieldNonAgri.classList.remove('hidden');
      elements.fieldAgriPeak.classList.add('hidden');
      elements.fieldAgriOffpeak.classList.add('hidden');
      elements.fieldDomCat.classList.remove('hidden');
      elements.fieldComLoad.classList.add('hidden');
      elements.fieldAgriLoad.classList.add('hidden');
      elements.presetsContainer.classList.remove('hidden');
    } else if (tariff === 'commercial') {
      elements.fieldNonAgri.classList.remove('hidden');
      elements.fieldAgriPeak.classList.add('hidden');
      elements.fieldAgriOffpeak.classList.add('hidden');
      elements.fieldDomCat.classList.add('hidden');
      elements.fieldComLoad.classList.remove('hidden');
      elements.fieldAgriLoad.classList.add('hidden');
      elements.presetsContainer.classList.add('hidden');
    } else if (tariff === 'agricultural') {
      elements.fieldNonAgri.classList.add('hidden');
      elements.fieldAgriPeak.classList.remove('hidden');
      elements.fieldAgriOffpeak.classList.remove('hidden');
      elements.fieldDomCat.classList.add('hidden');
      elements.fieldComLoad.classList.add('hidden');
      elements.fieldAgriLoad.classList.remove('hidden');
      elements.presetsContainer.classList.add('hidden');
    }

    updateDomesticNote();

    if (!skipSave) {
      saveState();
    }
  }

  /**
   * Update Lifeline / Protected Consumer eligibility note
   */
  function updateDomesticNote() {
    if (!elements.noteBanner) return;

    if (currentTariff !== 'domestic') {
      elements.noteBanner.classList.add('hidden');
      return;
    }

    var units = parseInt(elements.inputUnits.value, 10) || 0;
    var chosenCat = elements.selectDomCat.value;
    var info = window.LescoCalcCore.getDomesticEligibility(units, chosenCat);

    if (info.type === 'none') {
      elements.noteBanner.classList.add('hidden');
      return;
    }

    elements.noteBanner.className = 'note-banner ' + (info.type === 'lifeline' ? 'life' : (info.type === 'protected' ? 'prot' : 'unprot'));
    elements.noteIcon.textContent = info.icon;
    elements.noteText.textContent = info.message;
    elements.noteBanner.classList.remove('hidden');

    if (units > 200 && elements.selectDomCat.value !== 'unprotected') {
      elements.selectDomCat.value = 'unprotected';
    }
  }

  /**
   * Gather parameters and calculate bill
   */
  function runCalculation() {
    var units = parseFloat(elements.inputUnits.value) || 0;
    var peak = parseFloat(elements.inputAgriPeak.value) || 0;
    var offpeak = parseFloat(elements.inputAgriOffpeak.value) || 0;
    var phase = elements.selectPhase.value;
    var domCat = elements.selectDomCat.value;
    var comLoad = elements.selectComLoad.value;
    var agriLoad = elements.selectAgriLoad.value;
    var fpa = parseFloat(elements.inputFpa.value) || 0;

    // Validate inputs
    if (currentTariff === 'agricultural') {
      if ((peak + offpeak) <= 0) {
        highlightError(elements.inputAgriPeak);
        highlightError(elements.inputAgriOffpeak);
        showToast('Please enter peak or off-peak units');
        return;
      }
    } else {
      if (units <= 0) {
        highlightError(elements.inputUnits);
        showToast('Please enter units consumed (kWh)');
        return;
      }
    }

    var result = window.LescoCalcCore.calculateBill({
      tariff: currentTariff,
      units: units,
      agriPeak: peak,
      agriOffpeak: offpeak,
      phase: phase,
      domCategory: domCat,
      comLoad: comLoad,
      agriLoad: agriLoad,
      fpa: fpa
    });

    if (!result.success) {
      showToast(result.error || 'Calculation error');
      return;
    }

    lastCalculationResult = result;
    renderResults(result);
    saveState();
  }

  /**
   * Temporary red glow on input
   */
  function highlightError(inputEl) {
    if (!inputEl) return;
    inputEl.classList.add('input-error');
    inputEl.focus();
    setTimeout(function () {
      inputEl.classList.remove('input-error');
    }, 1600);
  }

  /**
   * Render calculation results to DOM
   */
  function renderResults(res) {
    elements.resTotalAmount.textContent = window.LescoCalcCore.formatPKR(res.totalPayable);
    elements.resMetaUnits.textContent = res.units;
    elements.resMetaCategory.textContent = res.categoryName;
    elements.resMetaAvg.textContent = window.LescoCalcCore.formatDecimal(res.avgRate, 2);

    // Due dates
    elements.resDueDate.textContent = res.dueDate;
    elements.resDueAmount.textContent = 'Rs ' + window.LescoCalcCore.formatPKR(res.totalPayable);
    elements.resLateDate.textContent = res.lateDate;
    elements.resLateAmount.textContent = 'Rs ' + window.LescoCalcCore.formatPKR(res.lateAmount);

    // Slab rows
    elements.slabTableBody.innerHTML = '';
    if (res.slabRows && res.slabRows.length > 0) {
      elements.slabContainer.classList.remove('hidden');
      for (var s = 0; s < res.slabRows.length; s++) {
        var slab = res.slabRows[s];
        if (slab.used <= 0) continue;
        var tr = document.createElement('tr');
        tr.innerHTML = '<td>' + escapeHTML(slab.label) + '</td>' +
          '<td class="text-right">' + slab.used + '</td>' +
          '<td class="text-right">Rs ' + window.LescoCalcCore.formatDecimal(slab.rate, 2) + '</td>' +
          '<td class="text-right">Rs ' + window.LescoCalcCore.formatPKR(slab.amount) + '</td>';
        elements.slabTableBody.appendChild(tr);
      }
    } else {
      elements.slabContainer.classList.add('hidden');
    }

    // Ledger breakdown items
    elements.breakdownRows.innerHTML = '';
    for (var b = 0; b < res.breakdownItems.length; b++) {
      var item = res.breakdownItems[b];
      var div = document.createElement('div');
      var classes = ['ledger-row'];
      if (item.isDivider) classes.push('divider');
      if (item.isTotal) classes.push('total');
      div.className = classes.join(' ');

      var amtClass = 'ledger-amount' + (item.isNegative ? ' negative' : '');
      var noteHtml = item.note ? ('<span class="ledger-sub">' + escapeHTML(item.note) + '</span>') : '';

      div.innerHTML = '<div class="ledger-left">' +
        '<span aria-hidden="true">' + item.icon + '</span>' +
        '<div class="ledger-info">' +
          '<span class="ledger-label">' + escapeHTML(item.label) + '</span>' +
          noteHtml +
        '</div>' +
      '</div>' +
      '<div class="' + amtClass + '">Rs ' + window.LescoCalcCore.formatPKR(item.amount) + '</div>';

      elements.breakdownRows.appendChild(div);
    }

    elements.sectionResults.classList.remove('hidden');
    // Scroll smoothly to results
    elements.sectionResults.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /**
   * Escape HTML to prevent injection
   */
  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Copy plain-text summary to clipboard
   */
  function copySummary() {
    if (!lastCalculationResult) {
      showToast('No active calculation to copy');
      return;
    }
    var text = window.LescoCalcCore.generateSummaryText(lastCalculationResult);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        showToast('✓ Summary copied to clipboard!');
      }).catch(function () {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      showToast('✓ Summary copied to clipboard!');
    } catch (e) {
      showToast('Failed to copy to clipboard');
    }
    document.body.removeChild(ta);
  }

  /**
   * Reset form inputs and results
   */
  function resetForm() {
    elements.inputUnits.value = '';
    elements.inputAgriPeak.value = '';
    elements.inputAgriOffpeak.value = '';
    elements.inputFpa.value = '0.00';
    elements.selectPhase.value = 'single';
    elements.selectDomCat.value = 'protected';
    elements.selectComLoad.value = 'under5';
    elements.selectAgriLoad.value = 'under5';

    elements.sectionResults.classList.add('hidden');
    lastCalculationResult = null;
    updateDomesticNote();
    saveState();
    showToast('Reset completed');

    if (currentTariff === 'agricultural') {
      elements.inputAgriPeak.focus();
    } else {
      elements.inputUnits.focus();
    }
  }

  /**
   * Persist state to chrome.storage.local
   */
  function saveState() {
    if (!chrome.storage || !chrome.storage.local) return;
    var state = {
      activeTab: currentTariff,
      units: elements.inputUnits.value,
      agriPeak: elements.inputAgriPeak.value,
      agriOffpeak: elements.inputAgriOffpeak.value,
      phase: elements.selectPhase.value,
      domCategory: elements.selectDomCat.value,
      comLoad: elements.selectComLoad.value,
      agriLoad: elements.selectAgriLoad.value,
      fpa: elements.inputFpa.value
    };
    chrome.storage.local.set({ lescoPopupState: state });
  }

  /**
   * Load saved state or pending units
   */
  function loadState() {
    if (!chrome.storage || !chrome.storage.local) return;

    chrome.storage.local.get(['lescoPopupState', 'pendingUnits'], function (data) {
      var state = data.lescoPopupState || {};

      if (state.activeTab) {
        setTariff(state.activeTab, true);
      } else {
        setTariff('domestic', true);
      }

      if (state.phase) elements.selectPhase.value = state.phase;
      if (state.domCategory) elements.selectDomCat.value = state.domCategory;
      if (state.comLoad) elements.selectComLoad.value = state.comLoad;
      if (state.agriLoad) elements.selectAgriLoad.value = state.agriLoad;
      if (state.fpa !== undefined && state.fpa !== '') elements.inputFpa.value = state.fpa;

      if (state.units) elements.inputUnits.value = state.units;
      if (state.agriPeak) elements.inputAgriPeak.value = state.agriPeak;
      if (state.agriOffpeak) elements.inputAgriOffpeak.value = state.agriOffpeak;

      // Handle context-menu passed units
      if (data.pendingUnits) {
        elements.inputUnits.value = data.pendingUnits;
        setTariff('domestic', true);
        chrome.storage.local.remove('pendingUnits');
        runCalculation();
        return;
      }

      updateDomesticNote();

      // If units were already filled, auto calculate
      if (elements.inputUnits.value && parseFloat(elements.inputUnits.value) > 0) {
        runCalculation();
      }
    });
  }

  /**
   * Open Studio mode in a new full tab
   */
  function openStudio() {
    saveState();
    if (chrome.runtime && chrome.runtime.getURL) {
      chrome.tabs.create({ url: chrome.runtime.getURL('fulltab.html') });
    } else {
      window.open('fulltab.html', '_blank');
    }
  }

  /**
   * Bind event listeners cleanly (Zero inline code)
   */
  function bindEvents() {
    // Top Studio Button
    elements.btnOpenStudio.addEventListener('click', openStudio);

    // Tab buttons
    for (var i = 0; i < elements.tabBtns.length; i++) {
      elements.tabBtns[i].addEventListener('click', function () {
        var tariff = this.getAttribute('data-tariff');
        setTariff(tariff);
      });
    }

    // Preset pills
    for (var p = 0; p < elements.presetPills.length; p++) {
      elements.presetPills[p].addEventListener('click', function () {
        var units = this.getAttribute('data-units');
        elements.inputUnits.value = units;
        updateDomesticNote();
        runCalculation();
      });
    }

    // Input changes & dynamic notes
    elements.inputUnits.addEventListener('input', updateDomesticNote);
    elements.selectDomCat.addEventListener('change', updateDomesticNote);

    // Input Enter key triggers calculation
    var inputEls = [elements.inputUnits, elements.inputAgriPeak, elements.inputAgriOffpeak, elements.inputFpa];
    for (var k = 0; k < inputEls.length; k++) {
      inputEls[k].addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          runCalculation();
        }
      });
    }

    // Calculate button
    elements.btnCalculate.addEventListener('click', runCalculation);

    // Toolbar actions
    elements.btnCopySummary.addEventListener('click', copySummary);
    elements.btnPrintBill.addEventListener('click', function () {
      window.print();
    });
    elements.btnReset.addEventListener('click', resetForm);
  }

  // Initialize
  document.addEventListener('DOMContentLoaded', function () {
    bindEvents();
    loadState();
  });

})();
