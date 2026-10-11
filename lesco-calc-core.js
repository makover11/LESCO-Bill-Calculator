/**
 * lesco-calc-core.js
 * Core Calculation Engine for LESCO Bill Calculator
 * Lahore Electric Supply Company - Official NEPRA Tariffs & Slab Engine
 * Self-contained, zero-dependency, works in Browser and Node.js.
 */

(function (global) {
  'use strict';

  var LESCO_RATES = {
    domestic: {
      lifeline: [
        { f: 1, t: 50, r: 3.95 },
        { f: 51, t: 100, r: 7.74 }
      ],
      protected: [
        { f: 1, t: 100, r: 10.54 },
        { f: 101, t: 200, r: 13.01 }
      ],
      unprotected: [
        { f: 1, t: 100, r: 22.44 },
        { f: 101, t: 200, r: 28.91 },
        { f: 201, t: 300, r: 33.10 },
        { f: 301, t: 400, r: 37.99 },
        { f: 401, t: 500, r: 40.20 },
        { f: 501, t: 600, r: 41.62 },
        { f: 601, t: 700, r: 42.76 },
        { f: 701, t: 1e9, r: 47.69 }
      ]
    },
    commercial: {
      under5: 38.82,
      above5: 40.26
    },
    agricultural: {
      under5: { peak: 37.25, offpeak: 30.10 },
      above5: { peak: 46.80, offpeak: 38.54 }
    }
  };

  var TAX_CONSTANTS = {
    NJ_SURCHARGE_PER_UNIT: 0.10,
    FC_SURCHARGE_RATE: 0.233, // 23.3% of Energy Charges
    ELECTRICITY_DUTY_RATE: 0.015, // 1.5% of Sub-Total
    TV_FEE_DOMESTIC: 35,
    GST_STANDARD_RATE: 0.17, // 17% for Domestic & Commercial
    GST_AGRICULTURAL_RATE: 0.05, // 5% for Agricultural
    LATE_PAYMENT_SURCHARGE_RATE: 0.10 // 10%
  };

  /**
   * Calculate progressive slabs for domestic tariffs
   */
  function calculateSlabs(units, slabs) {
    var rows = [];
    var remaining = Math.max(0, units);
    for (var i = 0; i < slabs.length; i++) {
      if (remaining <= 0) break;
      var s = slabs[i];
      var slabCapacity = (s.t >= 1e9) ? remaining : (s.t - s.f + 1);
      var usedInSlab = Math.min(remaining, slabCapacity);
      var label = (s.t >= 1e9) ? (s.f + '+ units') : (s.f + '–' + s.t + ' units');
      rows.push({
        label: label,
        from: s.f,
        to: (s.t >= 1e9) ? 'above' : s.t,
        used: usedInSlab,
        rate: s.r,
        amount: usedInSlab * s.r
      });
      remaining -= usedInSlab;
    }
    return rows;
  }

  /**
   * Format numbers to Pakistani Rupee currency
   */
  function formatPKR(n) {
    if (isNaN(n) || n === null || n === undefined) return '0';
    return Math.round(n).toLocaleString('en-PK');
  }

  /**
   * Format numbers to 2 decimal places
   */
  function formatDecimal(n, decimals) {
    if (isNaN(n) || n === null || n === undefined) return '0.00';
    var d = (typeof decimals === 'number') ? decimals : 2;
    return parseFloat(n).toFixed(d);
  }

  /**
   * Compute standard due dates (+15 days and +30 days)
   */
  function getDueDates(baseDate) {
    var date = baseDate ? new Date(baseDate) : new Date();
    var due = new Date(date.getTime() + (15 * 86400000));
    var late = new Date(date.getTime() + (30 * 86400000));
    var options = { day: 'numeric', month: 'short', year: 'numeric' };
    return {
      dueDateFormatted: due.toLocaleDateString('en-PK', options),
      lateDateFormatted: late.toLocaleDateString('en-PK', options),
      dueTimestamp: due.toISOString().split('T')[0],
      lateTimestamp: late.toISOString().split('T')[0]
    };
  }

  /**
   * Determine Domestic consumer category eligibility and advice
   */
  function getDomesticEligibility(units, chosenCategory) {
    var u = parseInt(units, 10) || 0;
    if (u <= 0) {
      return {
        type: 'none',
        category: chosenCategory || 'protected',
        badge: '',
        message: 'Enter units to verify lifeline / protected eligibility.'
      };
    }
    if (u <= 100) {
      return {
        type: 'lifeline',
        category: (chosenCategory === 'unprotected') ? 'unprotected' : 'lifeline',
        badge: 'Lifeline Eligible',
        icon: '✅',
        message: 'Lifeline Eligible (≤100 units). Highly subsidized tariff applies from Rs 3.95/unit.'
      };
    }
    if (u <= 200) {
      return {
        type: 'protected',
        category: (chosenCategory === 'unprotected') ? 'unprotected' : 'protected',
        badge: 'Protected Consumer',
        icon: '🛡️',
        message: 'Protected Consumer (≤200 units). Subsidized rates (Rs 10.54–13.01) if consecutive 6-month avg ≤ 200.'
      };
    }
    return {
      type: 'unprotected',
      category: 'unprotected',
      badge: 'Unprotected Consumer',
      icon: '⚠️',
      message: 'Unprotected Consumer (>200 units). Higher non-subsidized slabs apply from unit 1.'
    };
  }

  /**
   * Core Bill Calculation Function
   * @param {Object} params - Input parameters:
   *   - tariff: 'domestic' | 'commercial' | 'agricultural'
   *   - units: Number (for domestic or commercial)
   *   - agriPeak: Number (for agricultural)
   *   - agriOffpeak: Number (for agricultural)
   *   - phase: 'single' | 'three'
   *   - domCategory: 'protected' | 'unprotected'
   *   - comLoad: 'under5' | 'above5'
   *   - agriLoad: 'under5' | 'above5'
   *   - fpa: Number (Fuel Price Adjustment, default 0)
   */
  function calculateBill(params) {
    params = params || {};
    var tariff = params.tariff || 'domestic';
    var phase = params.phase || 'single';
    var fpa = parseFloat(params.fpa) || 0;

    var units = 0;
    var energyCharges = 0;
    var slabRows = [];
    var categoryName = '';
    var fixedCharges = 0;
    var tvFee = 0;
    var meterRent = 0;
    var gstRate = TAX_CONSTANTS.GST_STANDARD_RATE;

    if (tariff === 'domestic') {
      units = parseFloat(params.units) || 0;
      if (units <= 0) {
        return { success: false, error: 'Please enter valid units consumed (kWh).' };
      }

      var domCat = params.domCategory || 'protected';
      if (units > 200) {
        domCat = 'unprotected';
      } else if (units <= 100 && domCat === 'protected') {
        domCat = 'lifeline';
      }

      if (domCat === 'lifeline') {
        categoryName = 'Domestic (Lifeline)';
        slabRows = calculateSlabs(units, LESCO_RATES.domestic.lifeline);
      } else if (domCat === 'protected') {
        categoryName = 'Domestic (Protected)';
        slabRows = calculateSlabs(units, LESCO_RATES.domestic.protected);
      } else {
        categoryName = 'Domestic (Unprotected)';
        if (units > 700) {
          var flatRate = LESCO_RATES.domestic.unprotected[7].r;
          energyCharges = units * flatRate;
          slabRows = [{
            label: 'Total Units (Flat Rate >700)',
            from: 1,
            to: units,
            used: units,
            rate: flatRate,
            amount: energyCharges
          }];
        } else {
          slabRows = calculateSlabs(units, LESCO_RATES.domestic.unprotected);
        }
      }

      if (energyCharges === 0) {
        for (var i = 0; i < slabRows.length; i++) {
          energyCharges += slabRows[i].amount;
        }
      }

      fixedCharges = 0;
      tvFee = TAX_CONSTANTS.TV_FEE_DOMESTIC;
      meterRent = (phase === 'three') ? 35 : 10;
      gstRate = TAX_CONSTANTS.GST_STANDARD_RATE;

    } else if (tariff === 'commercial') {
      units = parseFloat(params.units) || 0;
      if (units <= 0) {
        return { success: false, error: 'Please enter valid commercial units consumed.' };
      }

      var comLoad = params.comLoad || 'under5';
      var rate = (comLoad === 'above5') ? LESCO_RATES.commercial.above5 : LESCO_RATES.commercial.under5;
      energyCharges = units * rate;
      var loadLabel = (comLoad === 'above5') ? '≥ 5 kW' : '< 5 kW';

      slabRows = [{
        label: 'Commercial Flat Rate (' + loadLabel + ')',
        from: 1,
        to: units,
        used: units,
        rate: rate,
        amount: energyCharges
      }];

      categoryName = 'Commercial (' + loadLabel + ')';
      fixedCharges = (comLoad === 'above5' || phase === 'three') ? 800 : 400;
      tvFee = 0;
      meterRent = (phase === 'three') ? 50 : 20;
      gstRate = TAX_CONSTANTS.GST_STANDARD_RATE;

    } else if (tariff === 'agricultural') {
      var peakUnits = parseFloat(params.agriPeak) || 0;
      var offpeakUnits = parseFloat(params.agriOffpeak) || 0;
      units = peakUnits + offpeakUnits;

      if (units <= 0) {
        return { success: false, error: 'Please enter peak or off-peak units consumed.' };
      }

      var agriLoad = params.agriLoad || 'under5';
      var agriRates = (agriLoad === 'above5') ? LESCO_RATES.agricultural.above5 : LESCO_RATES.agricultural.under5;
      var agriLoadLabel = (agriLoad === 'above5') ? '≥ 5 kW' : '< 5 kW';

      var peakCost = peakUnits * agriRates.peak;
      var offpeakCost = offpeakUnits * agriRates.offpeak;
      energyCharges = peakCost + offpeakCost;

      if (peakUnits > 0) {
        slabRows.push({
          label: 'Peak Hours (' + agriLoadLabel + ')',
          from: 1,
          to: peakUnits,
          used: peakUnits,
          rate: agriRates.peak,
          amount: peakCost
        });
      }
      if (offpeakUnits > 0) {
        slabRows.push({
          label: 'Off-Peak Hours (' + agriLoadLabel + ')',
          from: 1,
          to: offpeakUnits,
          used: offpeakUnits,
          rate: agriRates.offpeak,
          amount: offpeakCost
        });
      }

      categoryName = 'Agricultural (' + agriLoadLabel + ')';
      fixedCharges = 200;
      tvFee = 0;
      meterRent = (phase === 'three') ? 35 : 10;
      gstRate = TAX_CONSTANTS.GST_AGRICULTURAL_RATE;
    } else {
      return { success: false, error: 'Unknown tariff type: ' + tariff };
    }

    // Surcharges & Taxes
    var fpaAmount = fpa * units;
    var njSurcharge = units * TAX_CONSTANTS.NJ_SURCHARGE_PER_UNIT;
    var fcSurcharge = energyCharges * TAX_CONSTANTS.FC_SURCHARGE_RATE;
    var subTotal = energyCharges + fpaAmount + fixedCharges + njSurcharge;
    var electricityDuty = subTotal * TAX_CONSTANTS.ELECTRICITY_DUTY_RATE;
    var gstBase = energyCharges + fpaAmount + fixedCharges + electricityDuty + fcSurcharge + tvFee;
    var gstAmount = gstBase * gstRate;
    var totalPayable = subTotal + electricityDuty + fcSurcharge + gstAmount + tvFee + meterRent;
    var lateAmount = totalPayable * (1 + TAX_CONSTANTS.LATE_PAYMENT_SURCHARGE_RATE);
    var avgRate = units > 0 ? (totalPayable / units) : 0;

    var dates = getDueDates();

    // Itemized breakdown list
    var breakdownItems = [
      { id: 'energy', icon: '⚡', label: 'Energy Charges', note: 'Base energy tariff slab calculation', amount: energyCharges },
      { id: 'fpa', icon: '⛽', label: 'Fuel Price Adjustment (FPA)', note: units + ' kWh × Rs ' + formatDecimal(fpa, 2) + '/unit', amount: fpaAmount, isNegative: (fpa < 0) },
      { id: 'fixed', icon: '🔌', label: 'Fixed Connection Charges', note: (tariff === 'domestic') ? 'No fixed charges' : 'Monthly load capacity tariff', amount: fixedCharges },
      { id: 'nj', icon: '💧', label: 'Neelum-Jhelum (NJ) Surcharge', note: 'Rs 0.10/unit × ' + units + ' kWh', amount: njSurcharge },
      { id: 'fc', icon: '📈', label: 'Financing Cost (FC) Surcharge', note: '23.3% of base energy charges', amount: fcSurcharge },
      { id: 'sub', icon: '➕', label: 'Sub-Total (Pre-Duty)', note: 'Energy + FPA + Fixed + NJ', amount: subTotal, isDivider: true },
      { id: 'ed', icon: '🏛️', label: 'Electricity Duty (ED)', note: '1.5% of sub-total', amount: electricityDuty },
      { id: 'gst', icon: '🧾', label: 'General Sales Tax (GST ' + Math.round(gstRate * 100) + '%)', note: 'Statutory sales tax on taxable base', amount: gstAmount }
    ];

    if (tvFee > 0) {
      breakdownItems.push({ id: 'tv', icon: '📺', label: 'TV Licence Fee', note: 'Statutory monthly fee', amount: tvFee });
    }

    breakdownItems.push({ id: 'meter', icon: '📏', label: 'Meter Rent', note: (phase === 'three' ? 'Three Phase' : 'Single Phase') + ' monthly rental', amount: meterRent });
    breakdownItems.push({ id: 'total', icon: '💰', label: 'TOTAL ESTIMATED BILL', note: 'Payable within due date', amount: totalPayable, isTotal: true });

    return {
      success: true,
      timestamp: new Date().toISOString(),
      tariff: tariff,
      categoryName: categoryName,
      phase: phase,
      units: units,
      fpaRate: fpa,
      energyCharges: energyCharges,
      slabRows: slabRows,
      fpaAmount: fpaAmount,
      fixedCharges: fixedCharges,
      njSurcharge: njSurcharge,
      fcSurcharge: fcSurcharge,
      subTotal: subTotal,
      electricityDuty: electricityDuty,
      gstRate: gstRate,
      gstAmount: gstAmount,
      tvFee: tvFee,
      meterRent: meterRent,
      totalPayable: totalPayable,
      lateAmount: lateAmount,
      avgRate: avgRate,
      dueDate: dates.dueDateFormatted,
      lateDate: dates.lateDateFormatted,
      breakdownItems: breakdownItems
    };
  }

  /**
   * Generate formatted plain-text summary suitable for clipboard copy or sharing
   */
  function generateSummaryText(res) {
    if (!res || !res.success) return 'No valid calculation results to display.';
    var lines = [
      '========================================',
      '⚡ LESCO ELECTRICITY BILL ESTIMATE',
      '========================================',
      'Tariff: ' + res.categoryName + ' (' + (res.phase === 'three' ? 'Three Phase' : 'Single Phase') + ')',
      'Units Consumed: ' + res.units + ' kWh',
      'Estimated Bill: Rs ' + formatPKR(res.totalPayable),
      'Average Unit Rate: Rs ' + formatDecimal(res.avgRate, 2) + ' / kWh',
      '',
      '📅 DUE DATES & AMOUNTS:',
      '• Within Due Date (' + res.dueDate + '): Rs ' + formatPKR(res.totalPayable),
      '• After Due Date (' + res.lateDate + '): Rs ' + formatPKR(res.lateAmount) + ' (+10% late surcharge)',
      '',
      '📋 ITEMIZED BREAKDOWN:',
      '• Base Energy Charges: Rs ' + formatPKR(res.energyCharges),
      '• Fuel Price Adj (FPA): Rs ' + formatPKR(res.fpaAmount),
      '• Fixed Charges: Rs ' + formatPKR(res.fixedCharges),
      '• NJ Surcharge (Rs 0.10/u): Rs ' + formatPKR(res.njSurcharge),
      '• FC Surcharge (23.3%): Rs ' + formatPKR(res.fcSurcharge),
      '• Electricity Duty (1.5%): Rs ' + formatPKR(res.electricityDuty),
      '• GST (' + Math.round(res.gstRate * 100) + '%): Rs ' + formatPKR(res.gstAmount),
      (res.tvFee > 0 ? ('• TV Licence Fee: Rs ' + formatPKR(res.tvFee)) : null),
      '• Meter Rent: Rs ' + formatPKR(res.meterRent),
      '----------------------------------------',
      'TOTAL ESTIMATED PAYABLE: Rs ' + formatPKR(res.totalPayable),
      '========================================',
      'Calculated via LESCO Bill Calculator Extension'
    ];
    return lines.filter(function (l) { return l !== null; }).join('\n');
  }

  /**
   * Export array of calculation records to CSV
   */
  function exportCSV(records) {
    if (!Array.isArray(records) || records.length === 0) return '';
    var headers = ['Date', 'Tariff', 'Phase', 'Units (kWh)', 'Energy Charges (Rs)', 'FPA (Rs)', 'Fixed (Rs)', 'Taxes & Surcharges (Rs)', 'Total Bill (Rs)', 'Late Bill (Rs)', 'Avg Rate (Rs/unit)'];
    var rows = [headers.join(',')];

    for (var i = 0; i < records.length; i++) {
      var r = records[i];
      var taxes = (r.njSurcharge || 0) + (r.fcSurcharge || 0) + (r.electricityDuty || 0) + (r.gstAmount || 0) + (r.tvFee || 0) + (r.meterRent || 0);
      var row = [
        '"' + (r.timestamp ? r.timestamp.replace('T', ' ').substring(0, 19) : '') + '"',
        '"' + (r.categoryName || r.tariff || '') + '"',
        '"' + (r.phase === 'three' ? 'Three Phase' : 'Single Phase') + '"',
        r.units || 0,
        Math.round(r.energyCharges || 0),
        Math.round(r.fpaAmount || 0),
        Math.round(r.fixedCharges || 0),
        Math.round(taxes),
        Math.round(r.totalPayable || 0),
        Math.round(r.lateAmount || 0),
        formatDecimal(r.avgRate || 0, 2)
      ];
      rows.push(row.join(','));
    }
    return rows.join('\r\n');
  }

  var engine = {
    RATES: LESCO_RATES,
    TAX_CONSTANTS: TAX_CONSTANTS,
    calculateSlabs: calculateSlabs,
    calculateBill: calculateBill,
    getDomesticEligibility: getDomesticEligibility,
    formatPKR: formatPKR,
    formatDecimal: formatDecimal,
    getDueDates: getDueDates,
    generateSummaryText: generateSummaryText,
    exportCSV: exportCSV
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = engine;
  }
  global.LescoCalcCore = engine;

})(typeof window !== 'undefined' ? window : globalThis);
