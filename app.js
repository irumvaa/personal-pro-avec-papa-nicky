(function () {
  "use strict";

  const state = {
    config: null,
    summary: [],   // [{month, revenue, cogs, operating_expenses, receivables, notes, ...derived}]
    expenses: [],  // [{month, category, amount}]
    products: [],  // [{month, product, revenue, profit}]
    selectedIndex: -1,
    chart: null,
  };

  function num(v) {
    const n = parseFloat(String(v).replace(/[, ]/g, ""));
    return isNaN(n) ? 0 : n;
  }

  function fmtFBU(n) {
    return Math.round(n).toLocaleString("en-US") + " FBU";
  }
  function fmtUSD(n, rate) {
    const sign = n < 0 ? "-" : "";
    return sign + "$" + Math.round(Math.abs(n) / rate).toLocaleString("en-US");
  }
  function dualUsd(n) {
    const r = state.config.exchangeRates;
    return `${fmtUSD(n, r.bankRateFbuPerUsd)} bank / ${fmtUSD(n, r.blackMarketRateFbuPerUsd)} black market`;
  }
  function pct(n, digits = 1) {
    return (n >= 0 ? "+" : "") + n.toFixed(digits) + "%";
  }

  function fetchText(url) {
    return fetch(url, { cache: "no-store" }).then((r) => {
      if (!r.ok) throw new Error("Could not load " + url);
      return r.text();
    });
  }

  function parseCsv(text) {
    const result = Papa.parse(text, { header: true, skipEmptyLines: true });
    return result.data;
  }

  function loadAll() {
    return Promise.all([
      fetchText("data/config.json").then((t) => JSON.parse(t)),
      fetchText("data/summary.csv").then(parseCsv),
      fetchText("data/expenses.csv").then(parseCsv),
      fetchText("data/products.csv").then(parseCsv),
    ]).then(([config, summaryRaw, expensesRaw, productsRaw]) => {
      state.config = config;

      state.summary = summaryRaw
        .filter((r) => r.month && r.month.trim())
        .map((r) => {
          const revenue = num(r.revenue);
          const cogs = num(r.cogs);
          const opex = num(r.operating_expenses);
          const grossProfit = revenue - cogs;
          const netProfit = grossProfit - opex;
          return {
            month: r.month.trim(),
            revenue,
            cogs,
            operating_expenses: opex,
            receivables: num(r.receivables),
            notes: r.notes || "",
            grossProfit,
            grossMargin: revenue ? (grossProfit / revenue) * 100 : 0,
            netProfit,
            netMargin: revenue ? (netProfit / revenue) * 100 : 0,
          };
        });

      // cumulative net profit for investment recovery
      let cum = 0;
      state.summary.forEach((row) => {
        cum += row.netProfit;
        row.cumulativeNetProfit = cum;
      });

      state.expenses = expensesRaw
        .filter((r) => r.month && r.category)
        .map((r) => ({ month: r.month.trim(), category: r.category.trim(), amount: num(r.amount) }));

      state.products = productsRaw
        .filter((r) => r.month && r.product)
        .map((r) => ({
          month: r.month.trim(),
          product: r.product.trim(),
          revenue: num(r.revenue),
          profit: num(r.profit),
        }));
    });
  }

  function isDemoMonth(m) {
    return /demo/i.test(m);
  }

  function populateHeader() {
    document.getElementById("businessName").textContent = state.config.businessName;
    const rate = state.config.exchangeRates;
    document.getElementById("footerNote").textContent =
      `Figures in Burundian Francs (FBU). USD estimates use a bank rate of ${rate.bankRateFbuPerUsd.toLocaleString("en-US")} FBU/$ and a black market rate of ${rate.blackMarketRateFbuPerUsd.toLocaleString("en-US")} FBU/$.`;

    const anyDemo = state.summary.some((r) => isDemoMonth(r.month));
    document.getElementById("demoBanner").classList.toggle("show", anyDemo);
  }

  function populateMonthSelect() {
    const sel = document.getElementById("monthSelect");
    sel.innerHTML = "";
    state.summary.forEach((row, i) => {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = row.month;
      sel.appendChild(opt);
    });
    state.selectedIndex = state.summary.length - 1;
    sel.value = state.selectedIndex;
    sel.addEventListener("change", () => {
      state.selectedIndex = parseInt(sel.value, 10);
      renderAll();
    });
  }

  function updateEditLink() {
    const base = state.config.githubEditBaseUrl || "";
    document.getElementById("editLink").href = base ? base + "summary.csv" : "#";
  }

  function renderKpis() {
    const row = state.summary[state.selectedIndex];
    const prev = state.selectedIndex > 0 ? state.summary[state.selectedIndex - 1] : null;
    const kpiRow = document.getElementById("kpiRow");
    kpiRow.innerHTML = "";

    function kpiCard(label, valueFbu, deltaPctVsPrev, warn) {
      const div = document.createElement("div");
      div.className = "kpi" + (warn ? " warn" : "");
      let deltaHtml = "";
      if (deltaPctVsPrev !== null && isFinite(deltaPctVsPrev)) {
        const cls = deltaPctVsPrev >= 0 ? "up" : "down";
        deltaHtml = `<div class="delta ${cls}">${pct(deltaPctVsPrev)} vs previous month</div>`;
      }
      div.innerHTML = `
        <div class="label">${label}</div>
        <div class="value">${fmtFBU(valueFbu)}</div>
        <div class="usd">${dualUsd(valueFbu)}</div>
        ${deltaHtml}
      `;
      kpiRow.appendChild(div);
    }

    const revDelta = prev && prev.revenue ? ((row.revenue - prev.revenue) / prev.revenue) * 100 : null;
    const gpDelta = prev && prev.grossProfit ? ((row.grossProfit - prev.grossProfit) / Math.abs(prev.grossProfit)) * 100 : null;
    const npDelta = prev && prev.netProfit ? ((row.netProfit - prev.netProfit) / Math.abs(prev.netProfit)) * 100 : null;

    kpiCard("Revenue", row.revenue, revDelta);
    kpiCard(`Gross profit (${row.grossMargin.toFixed(1)}% margin)`, row.grossProfit, gpDelta);
    kpiCard(`Net profit (${row.netMargin.toFixed(1)}% margin)`, row.netProfit, npDelta, row.netProfit < 0);
    kpiCard("Outstanding receivables", row.receivables, null, row.receivables > 0);
  }

  function renderTrendChart() {
    const labels = state.summary.map((r) => r.month);
    const revenue = state.summary.map((r) => r.revenue);
    const expenses = state.summary.map((r) => r.cogs + r.operating_expenses);
    const netProfit = state.summary.map((r) => r.netProfit);

    const ctx = document.getElementById("trendChart").getContext("2d");
    if (state.chart) state.chart.destroy();
    state.chart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          { label: "Revenue", data: revenue, borderColor: "#1F4B3D", backgroundColor: "#1F4B3D", tension: 0.25, pointRadius: 3 },
          { label: "Total expenses", data: expenses, borderColor: "#A64B3B", backgroundColor: "#A64B3B", tension: 0.25, pointRadius: 3 },
          { label: "Net profit", data: netProfit, borderColor: "#B87E1F", backgroundColor: "#B87E1F", tension: 0.25, pointRadius: 3 },
        ],
      },
      options: {
        responsive: true,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { position: "bottom", labels: { font: { family: "Inter" }, boxWidth: 12 } },
          tooltip: {
            callbacks: {
              label: (item) => `${item.dataset.label}: ${fmtFBU(item.parsed.y)}`,
            },
          },
        },
        scales: {
          y: {
            ticks: {
              callback: (v) => (v / 1000000).toFixed(1) + "M",
              font: { family: "IBM Plex Mono", size: 11 },
            },
            grid: { color: "#DDDACA" },
          },
          x: { ticks: { font: { family: "Inter", size: 11 } }, grid: { display: false } },
        },
      },
    });
  }

  function renderRecovery() {
    const row = state.summary[state.selectedIndex];
    const invested = state.config.investment.totalInitialInvestmentFbu;
    const recovered = Math.max(0, row.cumulativeNetProfit);
    const pctVal = invested > 0 ? Math.min(100, (recovered / invested) * 100) : 0;
    const remaining = Math.max(0, invested - recovered);

    document.getElementById("recoveryPct").textContent = pctVal.toFixed(1) + "%";
    document.getElementById("recoveryBarFill").style.width = pctVal + "%";
    document.getElementById("recoveryInvested").textContent = fmtFBU(invested);
    document.getElementById("recoveryRecovered").textContent = fmtFBU(recovered);
    document.getElementById("recoveryRemaining").textContent = fmtFBU(remaining);

    // ETA based on average net profit across months up to selection
    const monthsSoFar = state.summary.slice(0, state.selectedIndex + 1);
    const avgNet = monthsSoFar.reduce((a, r) => a + r.netProfit, 0) / monthsSoFar.length;
    const etaEl = document.getElementById("recoveryEta");
    if (remaining <= 0) {
      etaEl.textContent = "Investment fully recovered as of this month.";
    } else if (avgNet > 0) {
      const months = Math.ceil(remaining / avgNet);
      etaEl.textContent = `At the average net profit so far (${fmtFBU(avgNet)}/month), about ${months} more month${months === 1 ? "" : "s"} to fully recover the investment.`;
    } else {
      etaEl.textContent = "Average net profit so far is zero or negative, so payback can't be projected yet.";
    }
  }

  function renderProducts() {
    const month = state.summary[state.selectedIndex].month;
    document.getElementById("productsTitle").textContent = `Top products — ${month}`;
    const rows = state.products.filter((p) => p.month === month).sort((a, b) => b.profit - a.profit).slice(0, 8);
    const tbody = document.querySelector("#productsTable tbody");
    tbody.innerHTML = "";
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No products logged for this month yet.</td></tr>`;
      return;
    }
    rows.forEach((p, i) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td class="rank">${i + 1}</td>
        <td>${p.product}</td>
        <td class="num">${p.revenue ? fmtFBU(p.revenue) : "-"}</td>
        <td class="num">${fmtFBU(p.profit)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderExpenses() {
    const row = state.summary[state.selectedIndex];
    const month = row.month;
    document.getElementById("expenseTitle").textContent = `Expense breakdown — ${month}`;
    const rows = state.expenses.filter((e) => e.month === month).sort((a, b) => b.amount - a.amount);
    const list = document.getElementById("expenseList");
    list.innerHTML = "";

    if (rows.length === 0) {
      list.innerHTML = `<div class="empty-state">No expense categories logged for this month yet.</div>`;
    } else {
      const max = Math.max(...rows.map((r) => r.amount), 1);
      rows.forEach((r) => {
        const div = document.createElement("div");
        div.className = "expense-row";
        div.innerHTML = `
          <div class="cat">${r.category}</div>
          <div class="expense-bar-track"><div class="expense-bar-fill" style="width:${(r.amount / max) * 100}%"></div></div>
          <div class="amt">${fmtFBU(r.amount)}</div>
        `;
        list.appendChild(div);
      });
    }

    const sum = rows.reduce((a, r) => a + r.amount, 0);
    const warnEl = document.getElementById("reconcileWarning");
    if (rows.length > 0 && Math.abs(sum - row.operating_expenses) > 1) {
      warnEl.style.display = "block";
      warnEl.textContent = `Heads up: these categories add up to ${fmtFBU(sum)}, but summary.csv lists operating expenses as ${fmtFBU(row.operating_expenses)} for this month. Worth checking for a typo.`;
    } else {
      warnEl.style.display = "none";
    }
  }

  function renderHistory() {
    const tbody = document.querySelector("#historyTable tbody");
    tbody.innerHTML = "";
    state.summary.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${r.month}</td>
        <td class="num">${fmtFBU(r.revenue)}</td>
        <td class="num">${fmtFBU(r.grossProfit)}</td>
        <td class="num">${r.grossMargin.toFixed(1)}%</td>
        <td class="num">${fmtFBU(r.netProfit)}</td>
        <td class="num">${r.netMargin.toFixed(1)}%</td>
        <td class="num">${fmtFBU(r.receivables)}</td>
      `;
      tbody.appendChild(tr);
    });
  }

  function renderAll() {
    renderKpis();
    renderTrendChart();
    renderRecovery();
    renderProducts();
    renderExpenses();
    renderHistory();
  }

  document.getElementById("historyToggle").addEventListener("click", (e) => {
    const wrap = document.getElementById("historyTableWrap");
    const showing = wrap.classList.toggle("show");
    e.target.textContent = showing ? "Hide all months" : "Show all months";
  });

  loadAll()
    .then(() => {
      if (state.summary.length === 0) {
        document.querySelector(".wrap").innerHTML =
          '<div class="empty-state">No monthly data yet. Add a row to data/summary.csv to get started (see README.md).</div>';
        return;
      }
      populateHeader();
      populateMonthSelect();
      updateEditLink();
      renderAll();
    })
    .catch((err) => {
      console.error(err);
      document.querySelector(".wrap").innerHTML =
        `<div class="empty-state">Could not load the dashboard data. ${err.message}</div>`;
    });
})();
