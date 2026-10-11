/**
 * fulltab.js
 * Controller for LESCO Bill Calculator Studio Workspace
 * Zero-Inline, Modular, 100% Offline, Chrome Storage Persisted.
 */

(function () {
  'use strict';

  var dom = {
    // Top actions
    btnExportCsv: document.getElementById('btn-export-csv'),
    btnExportJson: document.getElementById('btn-export-json'),
    btnStudioPrint: document.getElementById('btn-studio-print'),

    // Tabs
    tabBtnDomestic: document.getElementById('stab-btn-domestic'),
    tabBtnCommercial: document.getElementById('stab-btn-commercial'),
    tabBtnAgricultural: document.getElementById('stab-btn-agricultural'),
    tabBtns: document.querySelectorAll('.tariff-tab-btn'),

    // Meter helper
    meterPrev: document.getElementById('meter-prev'),
    meterCurr: document.getElementById('meter-curr'),
    meterDiffVal: document.getElementById('meter-diff-val'),
    btnApplyMeterDiff: document.getElementById('btn-apply-meter-diff'),

    // Presets
    presetChips: document.querySelectorAll('.preset-chip'),
    presetsSection: document.getElementById('studio-presets-section'),

    // Fields
    inputUnits: document.getElementById('sinput-units'),
    inputAgriPeak: document.getElementById('sinput-agri-peak'),
    inputAgriOffpeak: document.getElementById('sinput-agri-offpeak'),
    selectPhase: document.getElementById('sselect-phase'),
    selectDomCat: document.getElementById('sselect-dom-cat'),
    selectComLoad: document.getElementById('sselect-com-load'),
    selectAgriLoad: document.getElementById('sselect-agri-load'),
    inputFpa: document.getElementById('sinput-fpa'),

    // Containers
    fieldUnitsContainer: document.getElementById('sfield-units-container'),
    fieldAgriContainer: document.getElementById('sfield-agri-container'),
    fieldDomCatContainer: document.getElementById('sfield-dom-cat-container'),
    fieldComLoadContainer: document.getElementById('sfield-com-load-container'),
    fieldAgriLoadContainer: document.getElementById('sfield-agri-load-container'),

    // Note banner
    noteBanner: document.getElementById('snote-banner'),
    noteIcon: document.getElementById('snote-icon'),
    noteText: document.getElementById('snote-text'),

    // Calculate & Reset
    btnCalculate: document.getElementById('sbtn-calculate'),
    btnReset: document.getElementById('sbtn-reset'),

    // Comparison tool
    btnCmpProtected: document.getElementById('btn-cmp-protected'),
    btnCmpPhase: document.getElementById('btn-cmp-phase'),
    cmpResultCard: document.getElementById('cmp-result-card'),
    cmpTitle: document.getElementById('cmp-title'),
    cmpLblA: document.getElementById('cmp-lbl-a'),
    cmpValA: document.getElementById('cmp-val-a'),
    cmpLblB: document.getElementById('cmp-lbl-b'),
    cmpValB: document.getElementById('cmp-val-b'),
    cmpDiffVal: document.getElementById('cmp-diff-val'),

    // Hero Total
    resTotalAmount: document.getElementById('sres-total-amount'),
    resCategoryBadge: document.getElementById('sres-category-badge'),
    resStatUnits: document.getElementById('sres-stat-units'),
    resStatAvg: document.getElementById('sres-stat-avg'),
    resDueDate: document.getElementById('sres-due-date'),
    resDueVal: document.getElementById('sres-due-val'),
    resLateDate: document.getElementById('sres-late-date'),
    resLateVal: document.getElementById('sres-late-val'),
    btnCopySummary: document.getElementById('sbtn-copy-summary'),
    btnAddHistory: document.getElementById('sbtn-add-history'),

    // Cost Breakdown Progress Bar
    segEnergy: document.getElementById('seg-energy'),
    segTaxes: document.getElementById('seg-taxes'),
    segSurcharges: document.getElementById('seg-surcharges'),
    segFixed: document.getElementById('seg-fixed'),
    pctEnergy: document.getElementById('pct-energy'),
    pctTaxes: document.getElementById('pct-taxes'),
    pctSurcharges: document.getElementById('pct-surcharges'),
    pctFixed: document.getElementById('pct-fixed'),

    // Slabs & Ledger
    slabTableBody: document.getElementById('sslab-table-body'),
    ledgerContainer: document.getElementById('sledger-container'),

    // History
    historyContainer: document.getElementById('history-items-container'),
    btnClearHistoryLog: document.getElementById('btn-clear-history-log'),

    // Toast
    toast: document.getElementById('studio-toast')
  };

  var currentTariff = 'domestic';
  var lastCalculation = null;
  var calculationHistory = [];
  var toastTimer = null;

  /**
   * Display Studio Toast Notification
   */
  function showToast(message, duration) {
    if (!dom.toast) return;
    dom.toast.textContent = message;
    dom.toast.classList.remove('hidden');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      dom.toast.classList.add('hidden');
    }, duration || 2500);
  }

  /**
   * Set active tariff category
   */
  function setTariff(tariff, skipSave) {
    currentTariff = tariff;

    // Tabs update
    for (var i = 0; i < dom.tabBtns.length; i++) {
      var btn = dom.tabBtns[i];
      var isActive = btn.getAttribute('data-tariff') === tariff;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    }

    // Toggle fields
    if (tariff === 'domestic') {
      dom.fieldUnitsContainer.classList.remove('hidden');
      dom.fieldAgriContainer.classList.add('hidden');
      dom.fieldDomCatContainer.classList.remove('hidden');
      dom.fieldComLoadContainer.classList.add('hidden');
      dom.fieldAgriLoadContainer.classList.add('hidden');
      dom.presetsSection.classList.remove('hidden');
    } else if (tariff === 'commercial') {
      dom.fieldUnitsContainer.classList.remove('hidden');
      dom.fieldAgriContainer.classList.add('hidden');
      dom.fieldDomCatContainer.classList.add('hidden');
      dom.fieldComLoadContainer.classList.remove('hidden');
      dom.fieldAgriLoadContainer.classList.add('hidden');
      dom.presetsSection.classList.add('hidden');
    } else if (tariff === 'agricultural') {
      dom.fieldUnitsContainer.classList.add('hidden');
      dom.fieldAgriContainer.classList.remove('hidden');
      dom.fieldDomCatContainer.classList.add('hidden');
      dom.fieldComLoadContainer.classList.add('hidden');
      dom.fieldAgriLoadContainer.classList.remove('hidden');
      dom.presetsSection.classList.add('hidden');
    }

    updateEligibilityNote();
    if (!skipSave) saveState();
  }

  /**
   * Update Lifeline / Protected Consumer note in studio
   */
  function updateEligibilityNote() {
    if (currentTariff !== 'domestic') {
      dom.noteBanner.classList.add('hidden');
      return;
    }

    var units = parseInt(dom.inputUnits.value, 10) || 0;
    var chosen = dom.selectDomCat.value;
    var info = window.LescoCalcCore.getDomesticEligibility(units, chosen);

    if (info.type === 'none') {
      dom.noteBanner.classList.add('hidden');
      return;
    }

    dom.noteBanner.className = 'studio-note-banner ' + (info.type === 'lifeline' ? 'life' : (info.type === 'protected' ? 'prot' : 'unprot'));
    dom.noteIcon.textContent = info.icon;
    dom.noteText.textContent = info.message;
    dom.noteBanner.classList.remove('hidden');

    if (units > 200 && dom.selectDomCat.value !== 'unprotected') {
      dom.selectDomCat.value = 'unprotected';
    }
  }

  /**
   * Compute meter reading difference
   */
  function updateMeterDiff() {
    var prev = parseFloat(dom.meterPrev.value) || 0;
    var curr = parseFloat(dom.meterCurr.value) || 0;
    var diff = Math.max(0, curr - prev);
    dom.meterDiffVal.textContent = diff;
  }

  function applyMeterDiff() {
    var prev = parseFloat(dom.meterPrev.value) || 0;
    var curr = parseFloat(dom.meterCurr.value) || 0;
    var diff = Math.max(0, curr - prev);
    if (diff <= 0) {
      showToast('Current reading must be greater than previous reading');
      return;
    }
    dom.inputUnits.value = diff;
    updateEligibilityNote();
    runCalculation();
    showToast('Applied ' + diff + ' units from meter calculation');
  }

  /**
   * Execute bill calculation
   */
  function runCalculation(silent) {
    var units = parseFloat(dom.inputUnits.value) || 0;
    var peak = parseFloat(dom.inputAgriPeak.value) || 0;
    var offpeak = parseFloat(dom.inputAgriOffpeak.value) || 0;
    var phase = dom.selectPhase.value;
    var domCat = dom.selectDomCat.value;
    var comLoad = dom.selectComLoad.value;
    var agriLoad = dom.selectAgriLoad.value;
    var fpa = parseFloat(dom.inputFpa.value) || 0;

    if (currentTariff === 'agricultural') {
      if ((peak + offpeak) <= 0) {
        if (!silent) {
          highlightError(dom.inputAgriPeak);
          highlightError(dom.inputAgriOffpeak);
          showToast('Please enter peak or off-peak hours (kWh)');
        }
        return;
      }
    } else {
      if (units <= 0) {
        if (!silent) {
          highlightError(dom.inputUnits);
          showToast('Please enter units consumed (kWh)');
        }
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
      if (!silent) showToast(result.error || 'Calculation error');
      return;
    }

    lastCalculation = result;
    renderResults(result);
    saveState();
  }

  function highlightError(el) {
    if (!el) return;
    el.classList.add('input-error');
    el.focus();
    setTimeout(function () {
      el.classList.remove('input-error');
    }, 1500);
  }

  /**
   * Render results into Studio cards
   */
  function renderResults(res) {
    // Hero Card
    dom.resTotalAmount.textContent = window.LescoCalcCore.formatPKR(res.totalPayable);
    dom.resCategoryBadge.textContent = res.categoryName + ' (' + (res.phase === 'three' ? 'Three Phase' : 'Single Phase') + ')';
    dom.resStatUnits.textContent = res.units;
    dom.resStatAvg.textContent = window.LescoCalcCore.formatDecimal(res.avgRate, 2);

    dom.resDueDate.textContent = res.dueDate;
    dom.resDueVal.textContent = 'Rs ' + window.LescoCalcCore.formatPKR(res.totalPayable);
    dom.resLateDate.textContent = res.lateDate;
    dom.resLateVal.textContent = 'Rs ' + window.LescoCalcCore.formatPKR(res.lateAmount);

    // Cost Breakdown Progress Bar
    var total = res.totalPayable || 1;
    var energyCost = res.energyCharges || 0;
    var taxesCost = (res.electricityDuty || 0) + (res.gstAmount || 0);
    var surchargesCost = Math.max(0, (res.fpaAmount || 0)) + (res.njSurcharge || 0) + (res.fcSurcharge || 0);
    var fixedCost = (res.fixedCharges || 0) + (res.meterRent || 0) + (res.tvFee || 0);

    var pEnergy = Math.max(0, Math.round((energyCost / total) * 100));
    var pTaxes = Math.max(0, Math.round((taxesCost / total) * 100));
    var pSurcharges = Math.max(0, Math.round((surchargesCost / total) * 100));
    var pFixed = Math.max(0, 100 - (pEnergy + pTaxes + pSurcharges));

    dom.segEnergy.style.width = pEnergy + '%';
    dom.segTaxes.style.width = pTaxes + '%';
    dom.segSurcharges.style.width = pSurcharges + '%';
    dom.segFixed.style.width = pFixed + '%';

    dom.pctEnergy.textContent = pEnergy;
    dom.pctTaxes.textContent = pTaxes;
    dom.pctSurcharges.textContent = pSurcharges;
    dom.pctFixed.textContent = pFixed;

    // Slabs Table
    dom.slabTableBody.innerHTML = '';
    if (res.slabRows && res.slabRows.length > 0) {
      for (var s = 0; s < res.slabRows.length; s++) {
        var slab = res.slabRows[s];
        if (slab.used <= 0) continue;
        var tr = document.createElement('tr');
        tr.innerHTML = '<td><strong>' + escapeHTML(slab.label) + '</strong></td>' +
          '<td class="text-right">' + slab.used + '</td>' +
          '<td class="text-right">Rs ' + window.LescoCalcCore.formatDecimal(slab.rate, 2) + '</td>' +
          '<td class="text-right">Rs ' + window.LescoCalcCore.formatPKR(slab.amount) + '</td>';
        dom.slabTableBody.appendChild(tr);
      }
    } else {
      dom.slabTableBody.innerHTML = '<tr><td colspan="4" class="text-center">No slab breakdown for selected tariff.</td></tr>';
    }

    // Itemized Ledger
    dom.ledgerContainer.innerHTML = '';
    for (var i = 0; i < res.breakdownItems.length; i++) {
      var item = res.breakdownItems[i];
      var div = document.createElement('div');
      var cls = ['ledger-item'];
      if (item.isDivider) cls.push('divider');
      if (item.isTotal) cls.push('total');
      div.className = cls.join(' ');

      var amtCls = 'ledger-amount' + (item.isNegative ? ' negative' : '');
      var noteText = item.note ? ('<span class="ledger-secondary">' + escapeHTML(item.note) + '</span>') : '';

      div.innerHTML = '<div class="ledger-left">' +
        '<span class="ledger-icon" aria-hidden="true">' + item.icon + '</span>' +
        '<div class="ledger-titles">' +
          '<span class="ledger-primary">' + escapeHTML(item.label) + '</span>' +
          noteText +
        '</div>' +
      '</div>' +
      '<div class="' + amtCls + '">Rs ' + window.LescoCalcCore.formatPKR(item.amount) + '</div>';

      dom.ledgerContainer.appendChild(div);
    }
  }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Scenario Comparison: Protected vs Unprotected
   */
  function compareProtectedVsUnprotected() {
    var units = parseFloat(dom.inputUnits.value) || 0;
    if (units <= 0) {
      showToast('Enter units consumed first to run comparison');
      return;
    }

    var phase = dom.selectPhase.value;
    var fpa = parseFloat(dom.inputFpa.value) || 0;

    var resProt = window.LescoCalcCore.calculateBill({
      tariff: 'domestic',
      units: units,
      domCategory: 'protected',
      phase: phase,
      fpa: fpa
    });

    var resUnprot = window.LescoCalcCore.calculateBill({
      tariff: 'domestic',
      units: units,
      domCategory: 'unprotected',
      phase: phase,
      fpa: fpa
    });

    var diff = Math.abs(resUnprot.totalPayable - resProt.totalPayable);

    dom.cmpTitle.textContent = 'Domestic Comparison: Protected vs Unprotected (' + units + ' kWh)';
    dom.cmpLblA.textContent = 'Protected Rate';
    dom.cmpValA.textContent = 'Rs ' + window.LescoCalcCore.formatPKR(resProt.totalPayable);
    dom.cmpLblB.textContent = 'Unprotected Rate';
    dom.cmpValB.textContent = 'Rs ' + window.LescoCalcCore.formatPKR(resUnprot.totalPayable);
    dom.cmpDiffVal.textContent = 'Rs ' + window.LescoCalcCore.formatPKR(diff) + ' extra';

    dom.cmpResultCard.classList.remove('hidden');
    showToast('Comparison generated');
  }

  /**
   * Scenario Comparison: Single vs Three Phase
   */
  function compareSingleVsThreePhase() {
    var units = parseFloat(dom.inputUnits.value) || 0;
    var peak = parseFloat(dom.inputAgriPeak.value) || 0;
    var offpeak = parseFloat(dom.inputAgriOffpeak.value) || 0;
    var totalUnits = (currentTariff === 'agricultural') ? (peak + offpeak) : units;

    if (totalUnits <= 0) {
      showToast('Enter units consumed first to run comparison');
      return;
    }

    var fpa = parseFloat(dom.inputFpa.value) || 0;

    var resSingle = window.LescoCalcCore.calculateBill({
      tariff: currentTariff,
      units: units,
      agriPeak: peak,
      agriOffpeak: offpeak,
      phase: 'single',
      domCategory: dom.selectDomCat.value,
      comLoad: dom.selectComLoad.value,
      agriLoad: dom.selectAgriLoad.value,
      fpa: fpa
    });

    var resThree = window.LescoCalcCore.calculateBill({
      tariff: currentTariff,
      units: units,
      agriPeak: peak,
      agriOffpeak: offpeak,
      phase: 'three',
      domCategory: dom.selectDomCat.value,
      comLoad: dom.selectComLoad.value,
      agriLoad: dom.selectAgriLoad.value,
      fpa: fpa
    });

    var diff = Math.abs(resThree.totalPayable - resSingle.totalPayable);

    dom.cmpTitle.textContent = 'Phase Comparison: Single Phase vs Three Phase';
    dom.cmpLblA.textContent = 'Single Phase';
    dom.cmpValA.textContent = 'Rs ' + window.LescoCalcCore.formatPKR(resSingle.totalPayable);
    dom.cmpLblB.textContent = 'Three Phase';
    dom.cmpValB.textContent = 'Rs ' + window.LescoCalcCore.formatPKR(resThree.totalPayable);
    dom.cmpDiffVal.textContent = 'Rs ' + window.LescoCalcCore.formatPKR(diff) + ' diff';

    dom.cmpResultCard.classList.remove('hidden');
    showToast('Comparison generated');
  }

  /**
   * Save current calculation to history log
   */
  function saveToHistory() {
    if (!lastCalculation) {
      showToast('Calculate a bill first before saving to history');
      return;
    }

    var entry = {
      id: 'calc_' + Date.now(),
      timestamp: new Date().toISOString(),
      tariff: lastCalculation.tariff,
      categoryName: lastCalculation.categoryName,
      phase: lastCalculation.phase,
      units: lastCalculation.units,
      totalPayable: lastCalculation.totalPayable,
      lateAmount: lastCalculation.lateAmount,
      avgRate: lastCalculation.avgRate,
      fpaAmount: lastCalculation.fpaAmount,
      energyCharges: lastCalculation.energyCharges,
      njSurcharge: lastCalculation.njSurcharge,
      fcSurcharge: lastCalculation.fcSurcharge,
      electricityDuty: lastCalculation.electricityDuty,
      gstAmount: lastCalculation.gstAmount,
      fixedCharges: lastCalculation.fixedCharges,
      tvFee: lastCalculation.tvFee,
      meterRent: lastCalculation.meterRent,
      inputs: {
        units: dom.inputUnits.value,
        agriPeak: dom.inputAgriPeak.value,
        agriOffpeak: dom.inputAgriOffpeak.value,
        phase: dom.selectPhase.value,
        domCategory: dom.selectDomCat.value,
        comLoad: dom.selectComLoad.value,
        agriLoad: dom.selectAgriLoad.value,
        fpa: dom.inputFpa.value
      }
    };

    calculationHistory.unshift(entry);
    if (calculationHistory.length > 20) {
      calculationHistory = calculationHistory.slice(0, 20);
    }

    persistHistory();
    renderHistory();
    showToast('✓ Saved to Calculation History Log');
  }

  function persistHistory() {
    if (chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ lescoCalculationHistory: calculationHistory });
    }
  }

  function renderHistory() {
    dom.historyContainer.innerHTML = '';
    if (!calculationHistory || calculationHistory.length === 0) {
      dom.historyContainer.innerHTML = '<div class="history-empty">No calculations saved yet. Click "Save to History" on any calculation.</div>';
      return;
    }

    for (var i = 0; i < calculationHistory.length; i++) {
      var item = calculationHistory[i];
      var div = document.createElement('div');
      div.className = 'history-card';
      var timeStr = item.timestamp ? new Date(item.timestamp).toLocaleString('en-PK', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Saved';

      div.innerHTML = '<div class="history-card-left">' +
        '<span class="history-title">' + escapeHTML(item.categoryName) + ' (' + item.units + ' kWh)</span>' +
        '<span class="history-meta">' + timeStr + ' · Avg Rs ' + window.LescoCalcCore.formatDecimal(item.avgRate, 2) + '/kWh</span>' +
      '</div>' +
      '<div class="history-card-right">' +
        '<strong class="history-cost">Rs ' + window.LescoCalcCore.formatPKR(item.totalPayable) + '</strong>' +
        '<div class="history-actions">' +
          '<button type="button" class="btn-history-load" data-id="' + item.id + '" title="Restore inputs">Load</button>' +
          '<button type="button" class="btn-history-del" data-id="' + item.id + '" title="Delete this entry">✕</button>' +
        '</div>' +
      '</div>';

      dom.historyContainer.appendChild(div);
    }

    // Attach load and delete events
    var loadBtns = dom.historyContainer.querySelectorAll('.btn-history-load');
    for (var l = 0; l < loadBtns.length; l++) {
      loadBtns[l].addEventListener('click', function () {
        var id = this.getAttribute('data-id');
        loadHistoryEntry(id);
      });
    }

    var delBtns = dom.historyContainer.querySelectorAll('.btn-history-del');
    for (var d = 0; d < delBtns.length; d++) {
      delBtns[d].addEventListener('click', function () {
        var id = this.getAttribute('data-id');
        deleteHistoryEntry(id);
      });
    }
  }

  function loadHistoryEntry(id) {
    for (var i = 0; i < calculationHistory.length; i++) {
      if (calculationHistory[i].id === id) {
        var entry = calculationHistory[i];
        setTariff(entry.tariff, true);
        if (entry.inputs) {
          if (entry.inputs.units) dom.inputUnits.value = entry.inputs.units;
          if (entry.inputs.agriPeak) dom.inputAgriPeak.value = entry.inputs.agriPeak;
          if (entry.inputs.agriOffpeak) dom.inputAgriOffpeak.value = entry.inputs.agriOffpeak;
          if (entry.inputs.phase) dom.selectPhase.value = entry.inputs.phase;
          if (entry.inputs.domCategory) dom.selectDomCat.value = entry.inputs.domCategory;
          if (entry.inputs.comLoad) dom.selectComLoad.value = entry.inputs.comLoad;
          if (entry.inputs.agriLoad) dom.selectAgriLoad.value = entry.inputs.agriLoad;
          if (entry.inputs.fpa) dom.inputFpa.value = entry.inputs.fpa;
        }
        updateEligibilityNote();
        runCalculation();
        showToast('Restored calculation from history');
        break;
      }
    }
  }

  function deleteHistoryEntry(id) {
    calculationHistory = calculationHistory.filter(function (it) {
      return it.id !== id;
    });
    persistHistory();
    renderHistory();
    showToast('Entry removed from history');
  }

  function clearAllHistory() {
    if (calculationHistory.length === 0) return;
    calculationHistory = [];
    persistHistory();
    renderHistory();
    showToast('Calculation history cleared');
  }

  /**
   * Export CSV file
   */
  function exportCSVFile() {
    var list = (calculationHistory && calculationHistory.length > 0) ? calculationHistory : (lastCalculation ? [lastCalculation] : []);
    if (list.length === 0) {
      showToast('No calculations available to export');
      return;
    }
    var csvContent = window.LescoCalcCore.exportCSV(list);
    var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    downloadBlob(blob, 'lesco-bill-calculations.csv');
    showToast('✓ Exported CSV successfully');
  }

  /**
   * Export JSON file
   */
  function exportJSONFile() {
    var data = {
      exportedAt: new Date().toISOString(),
      currentCalculation: lastCalculation,
      history: calculationHistory
    };
    var jsonStr = JSON.stringify(data, null, 2);
    var blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    downloadBlob(blob, 'lesco-bill-calculations.json');
    showToast('✓ Exported JSON successfully');
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
  }

  /**
   * Copy Summary
   */
  function copySummary() {
    if (!lastCalculation) {
      showToast('Calculate bill first before copying summary');
      return;
    }
    var summary = window.LescoCalcCore.generateSummaryText(lastCalculation);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(summary).then(function () {
        showToast('✓ Bill summary copied to clipboard!');
      }).catch(function () {
        fallbackCopy(summary);
      });
    } else {
      fallbackCopy(summary);
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
      showToast('✓ Bill summary copied to clipboard!');
    } catch (e) {
      showToast('Failed to copy');
    }
    document.body.removeChild(ta);
  }

  /**
   * Reset form
   */
  function resetForm() {
    dom.inputUnits.value = '';
    dom.inputAgriPeak.value = '';
    dom.inputAgriOffpeak.value = '';
    dom.inputFpa.value = '0.00';
    dom.selectPhase.value = 'single';
    dom.selectDomCat.value = 'protected';
    dom.selectComLoad.value = 'under5';
    dom.selectAgriLoad.value = 'under5';
    dom.meterPrev.value = '';
    dom.meterCurr.value = '';
    dom.meterDiffVal.textContent = '0';
    dom.cmpResultCard.classList.add('hidden');

    updateEligibilityNote();
    saveState();
    showToast('Form inputs reset');

    if (currentTariff === 'agricultural') {
      dom.inputAgriPeak.focus();
    } else {
      dom.inputUnits.focus();
    }
  }

  /**
   * Persist studio state
   */
  function saveState() {
    if (!chrome.storage || !chrome.storage.local) return;
    var state = {
      activeTab: currentTariff,
      units: dom.inputUnits.value,
      agriPeak: dom.inputAgriPeak.value,
      agriOffpeak: dom.inputAgriOffpeak.value,
      phase: dom.selectPhase.value,
      domCategory: dom.selectDomCat.value,
      comLoad: dom.selectComLoad.value,
      agriLoad: dom.selectAgriLoad.value,
      fpa: dom.inputFpa.value
    };
    chrome.storage.local.set({ lescoStudioState: state, lescoPopupState: state });
  }

  /**
   * Load studio state and pending context menu inputs
   */
  function loadState() {
    if (!chrome.storage || !chrome.storage.local) return;

    chrome.storage.local.get(['lescoStudioState', 'lescoPopupState', 'lescoCalculationHistory', 'pendingUnits'], function (data) {
      var state = data.lescoStudioState || data.lescoPopupState || {};

      if (Array.isArray(data.lescoCalculationHistory)) {
        calculationHistory = data.lescoCalculationHistory;
        renderHistory();
      }

      if (state.activeTab) {
        setTariff(state.activeTab, true);
      } else {
        setTariff('domestic', true);
      }

      if (state.phase) dom.selectPhase.value = state.phase;
      if (state.domCategory) dom.selectDomCat.value = state.domCategory;
      if (state.comLoad) dom.selectComLoad.value = state.comLoad;
      if (state.agriLoad) dom.selectAgriLoad.value = state.agriLoad;
      if (state.fpa !== undefined && state.fpa !== '') dom.inputFpa.value = state.fpa;

      if (state.units) dom.inputUnits.value = state.units;
      if (state.agriPeak) dom.inputAgriPeak.value = state.agriPeak;
      if (state.agriOffpeak) dom.inputAgriOffpeak.value = state.agriOffpeak;

      // Handle context-menu forwarded units
      if (data.pendingUnits) {
        dom.inputUnits.value = data.pendingUnits;
        setTariff('domestic', true);
        chrome.storage.local.remove('pendingUnits');
        runCalculation();
        showToast('Loaded ' + data.pendingUnits + ' units from context menu');
        return;
      }

      updateEligibilityNote();

      if (dom.inputUnits.value && parseFloat(dom.inputUnits.value) > 0) {
        runCalculation(true);
      } else {
        // Run with default 200 units as a visual showcase
        dom.inputUnits.value = '200';
        runCalculation(true);
      }
    });
  }

  /**
   * Event Listeners Registration (Zero inline code)
   */
  function bindEvents() {
    // Top actions
    dom.btnExportCsv.addEventListener('click', exportCSVFile);
    dom.btnExportJson.addEventListener('click', exportJSONFile);
    dom.btnStudioPrint.addEventListener('click', function () {
      window.print();
    });

    // Tariff Tabs
    for (var i = 0; i < dom.tabBtns.length; i++) {
      dom.tabBtns[i].addEventListener('click', function () {
        var tariff = this.getAttribute('data-tariff');
        setTariff(tariff);
      });
    }

    // Presets
    for (var p = 0; p < dom.presetChips.length; p++) {
      dom.presetChips[p].addEventListener('click', function () {
        var u = this.getAttribute('data-units');
        dom.inputUnits.value = u;
        updateEligibilityNote();
        runCalculation();
      });
    }

    // Meter helper
    dom.meterPrev.addEventListener('input', updateMeterDiff);
    dom.meterCurr.addEventListener('input', updateMeterDiff);
    dom.btnApplyMeterDiff.addEventListener('click', applyMeterDiff);

    // Domestic category change & input changes
    dom.inputUnits.addEventListener('input', updateEligibilityNote);
    dom.selectDomCat.addEventListener('change', updateEligibilityNote);

    // Enter key triggers
    var inputs = [dom.inputUnits, dom.inputAgriPeak, dom.inputAgriOffpeak, dom.inputFpa];
    for (var k = 0; k < inputs.length; k++) {
      inputs[k].addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
          e.preventDefault();
          runCalculation();
        }
      });
    }

    // Primary action buttons
    dom.btnCalculate.addEventListener('click', function () {
      runCalculation();
    });
    dom.btnReset.addEventListener('click', resetForm);

    // Scenario comparisons
    dom.btnCmpProtected.addEventListener('click', compareProtectedVsUnprotected);
    dom.btnCmpPhase.addEventListener('click', compareSingleVsThreePhase);

    // Hero buttons
    dom.btnCopySummary.addEventListener('click', copySummary);
    dom.btnAddHistory.addEventListener('click', saveToHistory);

    // Clear history
    dom.btnClearHistoryLog.addEventListener('click', clearAllHistory);
  }

  // Init
  document.addEventListener('DOMContentLoaded', function () {
    bindEvents();
    loadState();
  });

})();
