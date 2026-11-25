"use strict";

/* ============================================================
   SPENDSMART — app.js
   Full application logic for the Attendly-layout dashboard
   ============================================================ */

const API = "/api";

const categories = {
    expense: ["Food","Transport","Shopping","Education","Entertainment","Health","Bills","Other"],
    income:  ["Salary","Allowance","Freelance","Scholarship","Gift","Other"]
};

const icons = {
    Food:"🍜", Transport:"🚌", Shopping:"🛍️", Education:"📚",
    Entertainment:"🎧", Health:"🌿", Bills:"🧾", Other:"✳",
    Salary:"💼", Allowance:"💸", Freelance:"💻", Scholarship:"🎓", Gift:"🎁"
};

// Powder Blue palette for donut chart
const palette = ["#759BB8","#91B1C8","#BBD0DF","#527A96","#6689A5","#DCEAF2","#EAF2F7","#344657"];

let authToken   = localStorage.getItem("spendsmart-token") || "";
let currentUser = null;
let transactions = [];
let budgets      = {};
let settings     = { name: "Student", currency: "INR" };
let goals        = [];
let selectedMonth   = new Date().toISOString().slice(0, 7);
let calendarMonth   = new Date().toISOString().slice(0, 7);
let toastTimer;

const $ = id => document.getElementById(id);

// ── Formatting helpers ──────────────────────────────────────
const money = n => new Intl.NumberFormat("en-IN", {
    style: "currency", currency: settings.currency, maximumFractionDigits: 0
}).format(Number(n) || 0);

const monthName = m => new Date(m + "-02").toLocaleDateString("en-IN", { month: "long", year: "numeric" });

const esc = s => String(s ?? "").replace(/[&<>"']/g, c =>
    ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

const fmtDate = d => new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
    day: "2-digit", month: "short", year: "numeric"
});

// ── Data helpers ────────────────────────────────────────────
function monthRows() {
    return transactions.filter(t => String(t.date).slice(0, 7) === selectedMonth);
}

function totals(rows) {
    return rows.reduce((a, t) => { a[t.type] += Number(t.amount); return a; },
        { income: 0, expense: 0 });
}

// ── Validation ──────────────────────────────────────────────
function isValidDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return false;
    const d = new Date(value + "T00:00:00.000Z");
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function showFieldError(id, msg) {
    const f = $(id);
    f.setCustomValidity(msg);
    f.reportValidity();
    f.addEventListener("input",  () => f.setCustomValidity(""), { once: true });
    f.addEventListener("change", () => f.setCustomValidity(""), { once: true });
}

function validateTransactionForm() {
    const title  = $("titleInput").value.trim();
    const amount = Number($("amountInput").value.trim());
    const type   = $("transactionType").value;
    const cat    = $("transactionCategory").value;
    const date   = $("dateInput").value;
    const note   = $("noteInput").value.trim();

    if (title.length < 2 || title.length > 70)
        return showFieldError("titleInput", "Title must be 2–70 characters."), false;
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000)
        return showFieldError("amountInput", "Amount must be > 0 and < 1 billion."), false;
    if (!["income","expense"].includes(type) || !categories[type].includes(cat))
        return notify("Please select a valid type and category."), false;
    if (!isValidDate(date))
        return showFieldError("dateInput", "Please select a valid date."), false;
    if (note.length > 180)
        return showFieldError("noteInput", "Note cannot exceed 180 characters."), false;
    return true;
}

// ── API ─────────────────────────────────────────────────────
async function api(path, options = {}) {
    const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
    if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
    const res  = await fetch(API + path, { ...options, headers });
    const body = await res.json().catch(() => ({}));
    if (res.status === 401 && !path.startsWith("/auth/")) {
        authToken = ""; currentUser = null;
        localStorage.removeItem("spendsmart-token");
        openAuthModal("login");
        throw new Error(body.message || "Session expired.");
    }
    if (!res.ok) throw new Error(body.message || "Request failed");
    return body.data;
}

// ── Toast ───────────────────────────────────────────────────
function notify(message) {
    const t = $("toast");
    t.textContent = message;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("show"), 2600);
}

// ── Auth modal ──────────────────────────────────────────────
function openAuthModal(mode = "login") {
    switchAuthTab(mode);
    const d = $("authDialog");
    if (d && !d.open) d.showModal();
}
function closeAuthModal() { const d = $("authDialog"); if (d?.open) d.close(); }

function switchAuthTab(mode) {
    const isLogin = mode === "login";
    $("tabLoginBtn").classList.toggle("active", isLogin);
    $("tabSignupBtn").classList.toggle("active", !isLogin);
    $("loginForm").style.display  = isLogin  ? "grid" : "none";
    $("signupForm").style.display = !isLogin ? "grid" : "none";
    $("authModalTitle").textContent = isLogin
        ? "Sign in to your account"
        : "Create your SpendSmart account";
    ["loginError","signupError"].forEach(id => {
        $(id).style.display = "none"; $(id).textContent = "";
    });
}

function showAuthenticatedUI() {
    const lb = $("logoutBtn");
    if (lb) lb.style.display = "inline-flex";
    if (currentUser) {
        const initial = (currentUser.name || "S").trim()[0].toUpperCase();
        $("avatar").textContent        = initial;
        $("avatar").title              = `${currentUser.name} (${currentUser.email})`;
        if ($("topbarUserName")) $("topbarUserName").textContent = currentUser.name;
    }
}

function logout() {
    authToken = ""; currentUser = null;
    localStorage.removeItem("spendsmart-token");
    transactions = []; goals = []; budgets = {};
    render();
    const lb = $("logoutBtn"); if (lb) lb.style.display = "none";
    $("avatar").textContent = "S";
    $("greeting").textContent = "Financial Overview";
    openAuthModal("login");
    notify("Signed out successfully");
}

// ── Init ────────────────────────────────────────────────────
async function init() {
    if (!authToken) { openAuthModal("login"); return; }
    try {
        currentUser = await api("/auth/me");
        showAuthenticatedUI();

        const [tx, bg, st, gl] = await Promise.all([
            api("/transactions"),
            api("/budgets"),
            api("/settings"),
            api("/goals").catch(() => null)
        ]);

        transactions = tx || [];
        budgets      = bg || {};
        settings     = st || settings;
        if (currentUser?.name) settings.name = currentUser.name;
        if (gl && Array.isArray(gl) && gl.length) { goals = gl; saveGoalsLocal(); }

        // Header date
        $("todayLabel").textContent = new Date().toLocaleDateString("en-IN", {
            weekday: "long", day: "numeric", month: "long", year: "numeric"
        });

        // Greeting
        const hour = new Date().getHours();
        const tod  = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
        const greetLine = $("greetingLine");
        if (greetLine) greetLine.textContent = `${tod}, ${settings.name || "there"} 👋`;

        $("monthPicker").value = selectedMonth;
        if ($("displayName")) $("displayName").value = settings.name || "";
        if ($("currency"))    $("currency").value    = settings.currency || "INR";

        // Load saved goals
        try {
            const sg = JSON.parse(localStorage.getItem("spendsmart-goals") || "[]");
            if (!goals.length && Array.isArray(sg)) goals = sg;
        } catch {}

        populateCategories();
        render();
        detectPageSection();

    } catch (e) {
        if (e.message?.includes("log in") || e.message?.includes("expired")) {
            openAuthModal("login");
        } else { notify(e.message); }
    }
}

function populateCategories() {
    const sel = $("transactionCategory");
    if (sel) sel.innerHTML = categories.expense.map(c => `<option value="${c}">${c}</option>`).join("");

    const catOptions = '<option value="">All categories</option>' +
        [...new Set([...categories.expense, ...categories.income])]
            .map(c => `<option>${c}</option>`).join("");

    ["categoryFilter", "categoryFilter2"].forEach(id => {
        const cf = $(id);
        if (cf) cf.innerHTML = catOptions;
    });
}

const pageMeta = {
    dashboard:    { title: "Money Overview",      sub: "Track, manage and improve your personal finances." },
    transactions: { title: "Transactions",        sub: "Every rupee has a story. Keep track of yours." },
    budgets:      { title: "Monthly Budgets",     sub: "Set a limit, stay aware, and keep your goals in reach." },
    analytics:    { title: "Your Money Story",    sub: "Small patterns can lead to smarter decisions." },
    goals:        { title: "Savings Goals",       sub: "Give your next milestone a name, a target and a little momentum." },
    calendar:     { title: "Expense Calendar",    sub: "See which days carried the most spending." },
    alerts:       { title: "Smart Budget Alerts", sub: "Automatic reminders based on your spending and monthly limits." },
    settings:     { title: "Preferences",         sub: "Choose how SpendSmart greets you and displays amounts." }
};

// ── Page section routing (same-tab SPA hash navigation) ───────
function navigateTo(section) {
    const target = section || "dashboard";
    const nextHash = `#${target}`;
    if (location.hash !== nextHash) {
        location.hash = nextHash;
    } else {
        detectPageSection();
    }
}

function detectPageSection() {
    const hash = location.hash.replace("#", "") || "dashboard";
    const dashEl = $("page-dashboard");
    const pages = document.querySelectorAll(".page-section");

    pages.forEach(p => { p.style.display = "none"; });

    document.querySelectorAll(".nav-link").forEach(link => {
        link.classList.toggle("active", (link.getAttribute("data-section") || "dashboard") === hash);
    });

    const meta = pageMeta[hash] || pageMeta.dashboard;
    if ($("greeting")) $("greeting").textContent = meta.title;
    const subEl = document.querySelector(".topbar-sub");
    if (subEl) subEl.textContent = meta.sub;

    if (hash === "dashboard") {
        if (dashEl) dashEl.style.display = "";
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
    }

    const page = $(`page-${hash}`);
    if (!page) {
        if (dashEl) dashEl.style.display = "";
        return;
    }

    if (dashEl) dashEl.style.display = "none";
    page.style.display = "block";
    window.scrollTo({ top: 0, behavior: "instant" });

    // Render the relevant section
    const rows = monthRows();
    if (hash === "transactions") renderTransactionsTable(rows);
    if (hash === "analytics")    renderAnalytics(rows, totals(rows));
    if (hash === "budgets")      renderBudgets(rows);
    if (hash === "goals")        renderGoals();
    if (hash === "calendar")     renderCalendar();
    if (hash === "alerts")       renderSmartAlerts(rows);
}

// ── Render (main dashboard) ──────────────────────────────────
function render() {
    const rows = monthRows();
    const sum  = totals(rows);
    const bal  = sum.income - sum.expense;
    const rate = sum.income ? Math.round(bal / sum.income * 100) : 0;

    $("balance").textContent     = money(bal);
    $("income").textContent      = money(sum.income);
    $("expenses").textContent    = money(sum.expense);
    $("savingsRate").textContent = rate + "%";
    $("savingsLabel").textContent =
        rate >= 20 ? "Great saving habit" :
        rate >= 0  ? "Keep building"      : "Spending above income";

    renderTransactionsTable(rows);
    renderDonut(rows, sum.expense);
    renderInsightDash(rows, sum);
    renderAnalytics(rows, sum);
    renderBudgets(rows);
    renderGoals();
    renderCalendar();
    renderSmartAlerts(rows);
    renderTrend();
}

// ── Transaction table (dashboard) ───────────────────────────
function renderTransactionsTable(allRows) {
    const q    = $("searchInput")?.value.toLowerCase() || "";
    const type = $("typeFilter")?.value  || "";
    const cat  = $("categoryFilter")?.value || "";

    const rows = allRows.filter(t =>
        (!type || t.type === type) &&
        (!cat  || t.category === cat) &&
        (!q    || `${t.title} ${t.category} ${t.note || ""}`.toLowerCase().includes(q))
    ).sort((a, b) => b.date.localeCompare(a.date));

    const tbody = $("transactionRows");
    if (!tbody) return;

    tbody.innerHTML = rows.length
        ? rows.map(t => `
            <tr>
              <td>
                <div class="td-desc">
                  <div class="cat-ico">${icons[t.category] || "✳"}</div>
                  <div>
                    <div class="td-name">${esc(t.title)}</div>
                    ${t.recurring ? '<div class="td-note">↻ Recurring</div>' : ""}
                    ${t.note ? `<div class="td-note">${esc(t.note)}</div>` : ""}
                  </div>
                </div>
              </td>
              <td>${esc(t.category)}</td>
              <td>${fmtDate(t.date)}</td>
              <td><span class="type-pill ${t.type === "income" ? "type-income" : "type-expense"}">${t.type}</span></td>
              <td class="cell-right">
                <span class="${t.type === "income" ? "amount-pos" : "amount-neg"}">
                  ${t.type === "income" ? "+" : "−"}${money(t.amount)}
                </span>
              </td>
              <td>
                <div class="row-actions">
                  <button class="icon-btn" title="Edit"   data-edit="${esc(t.id)}">✎</button>
                  <button class="icon-btn" title="Delete" data-delete="${esc(t.id)}">×</button>
                </div>
              </td>
            </tr>`)
            .join("")
        : `<tr><td colspan="6" class="empty-cell">No transactions match your filters.</td></tr>`;

    const cnt = $("transactionCount");
    if (cnt) cnt.textContent = `${rows.length} transaction${rows.length === 1 ? "" : "s"}`;

    const tbody2 = $("transactionRows2");
    if (tbody2) {
        const q2    = $("searchInput2")?.value.toLowerCase() || "";
        const type2 = $("typeFilter2")?.value  || "";
        const cat2  = $("categoryFilter2")?.value || "";
        const rows2 = allRows
            .filter(t =>
                (!type2 || t.type === type2) &&
                (!cat2  || t.category === cat2) &&
                (!q2    || `${t.title} ${t.category} ${t.note || ""}`.toLowerCase().includes(q2))
            )
            .sort((a, b) => b.date.localeCompare(a.date));
        tbody2.innerHTML = rows2.length
            ? rows2.map(t => `
                <tr>
                  <td>
                    <div class="td-desc">
                      <div class="cat-ico">${icons[t.category] || "✳"}</div>
                      <div>
                        <div class="td-name">${esc(t.title)}</div>
                        ${t.recurring ? '<div class="td-note">↻ Recurring</div>' : ""}
                        ${t.note ? `<div class="td-note">${esc(t.note)}</div>` : ""}
                      </div>
                    </div>
                  </td>
                  <td>${esc(t.category)}</td>
                  <td>${fmtDate(t.date)}</td>
                  <td><span class="type-pill ${t.type === "income" ? "type-income" : "type-expense"}">${t.type}</span></td>
                  <td class="cell-right">
                    <span class="${t.type === "income" ? "amount-pos" : "amount-neg"}">
                      ${t.type === "income" ? "+" : "−"}${money(t.amount)}
                    </span>
                  </td>
                  <td>
                    <div class="row-actions">
                      <button class="icon-btn" title="Edit"   data-edit="${esc(t.id)}">✎</button>
                      <button class="icon-btn" title="Delete" data-delete="${esc(t.id)}">×</button>
                    </div>
                  </td>
                </tr>`)
                .join("")
            : `<tr><td colspan="6" class="empty-cell">No transactions found.</td></tr>`;
    }
}

// ── Donut chart ──────────────────────────────────────────────
function renderDonut(rows, total) {
    const sums = {};
    rows.filter(t => t.type === "expense")
        .forEach(t => { sums[t.category] = (sums[t.category] || 0) + Number(t.amount); });

    const entries = Object.entries(sums).sort((a, b) => b[1] - a[1]);
    let pos = 0;
    const parts = entries.map(([, v], i) => {
        const start = pos;
        pos += total ? v / total * 100 : 0;
        return `${palette[i % palette.length]} ${start}% ${pos}%`;
    });

    const donut = $("donut");
    if (donut) donut.style.background = entries.length
        ? `conic-gradient(${parts.join(",")})`
        : "#eef2e4";

    const dt = $("donutTotal");
    if (dt) dt.textContent = money(total);

    const smb = $("spendingMonthBadge");
    if (smb) smb.textContent = monthName(selectedMonth).toUpperCase();

    const legend = $("categoryLegend");
    if (!legend) return;
    legend.innerHTML = entries.length
        ? entries.slice(0, 6).map(([k, v], i) => `
            <div class="legend-item">
              <span class="legend-dot" style="background:${palette[i % palette.length]}"></span>
              <span class="legend-label">${esc(k)}</span>
              <span class="legend-pct">${Math.round(v / total * 100)}%</span>
            </div>`)
            .join("")
        : `<span class="empty-label">Add expenses to see your breakdown.</span>`;

    // Banner
    const banner = $("donutBannerText");
    if (banner) {
        const rate = total > 0 ? Math.round(total / (total + 1) * 100) : 0; // placeholder message
        banner.textContent = total > 0
            ? "Great job! Keep tracking your spending."
            : "Add expenses to see your spending breakdown.";
    }
}

// ── Dashboard insight panel ──────────────────────────────────
function renderInsightDash(rows, sum) {
    const titleEl = $("insightTitleDash");
    const textEl  = $("insightDash");
    const wrap    = $("insightProgressWrap");
    const fill    = $("insightProgressFill");
    const pctEl   = $("insightProgressPct");

    if (!titleEl) return;

    if (!rows.length) {
        titleEl.textContent = "Tracking your flow.";
        textEl.textContent  = "Start adding transactions to get a smart summary here.";
        if (wrap) wrap.style.visibility = "hidden";
        return;
    }

    const rate = sum.income ? Math.round((sum.income - sum.expense) / sum.income * 100) : 0;
    const pct  = Math.min(100, Math.max(0, rate));

    if (rate >= 20) {
        titleEl.textContent = "Wonderful! 🎉";
        textEl.textContent  = `Your savings rate is ${rate}% — above the 20% benchmark. Great discipline!`;
    } else if (rate >= 0) {
        titleEl.textContent = "Keep It Up!";
        textEl.textContent  = `You're saving ${rate}% of your income. Push past 20% for financial freedom.`;
    } else {
        titleEl.textContent = "Watch Your Spending";
        textEl.textContent  = `Expenses exceed income by ${money(sum.expense - sum.income)} this month. Review your top categories.`;
    }

    if (wrap) {
        wrap.style.visibility = "visible";
        if (fill) fill.style.width = pct + "%";
        if (pctEl) pctEl.textContent = rate + "%";
    }
}

// ── Analytics ───────────────────────────────────────────────
function renderAnalytics(rows, sum) {
    const max = Math.max(sum.income, sum.expense, 1);
    const ib  = $("incomeBar");  if (ib)  ib.style.height  = (sum.income  / max * 100) + "%";
    const eb  = $("expenseBar"); if (eb)  eb.style.height  = (sum.expense / max * 100) + "%";
    const ibv = $("incomeBarValue");  if (ibv)  ibv.textContent  = money(sum.income);
    const ebv = $("expenseBarValue"); if (ebv)  ebv.textContent  = money(sum.expense);

    const exp = rows.filter(t => t.type === "expense").reduce((a, t) => {
        a[t.category] = (a[t.category] || 0) + Number(t.amount); return a;
    }, {});
    const top = Object.entries(exp).sort((a, b) => b[1] - a[1])[0];

    const it = $("insightTitle"); const ig = $("insight");
    if (!it || !ig) return;

    if (!rows.length) {
        it.textContent = "Your insights are taking shape.";
        ig.textContent = "Add a few transactions and SpendSmart will highlight a useful pattern.";
    } else if (sum.income === 0 && sum.expense > 0) {
        it.textContent = "Keep an eye on cash flow.";
        ig.textContent = `You recorded ${money(sum.expense)} in expenses but no income for ${monthName(selectedMonth)}.`;
    } else if (top) {
        it.textContent = `${top[0]} is your top expense.`;
        ig.textContent = `You spent ${money(top[1])} on ${top[0].toLowerCase()} — ${Math.round(top[1] / Math.max(sum.expense,1) * 100)}% of expenses this month.`;
    } else {
        it.textContent = "A positive start.";
        ig.textContent = "Income recorded with no expenses yet. Keep logging activity.";
    }
}

// ── Budgets ─────────────────────────────────────────────────
function renderBudgets(rows) {
    const expenses = {};
    rows.filter(t => t.type === "expense").forEach(t => {
        expenses[t.category] = (expenses[t.category] || 0) + Number(t.amount);
    });

    const keys  = [...new Set([...Object.keys(budgets), ...Object.keys(expenses)])];
    const spent = Object.values(expenses).reduce((a, b) => a + b, 0);
    const limit = Object.values(budgets).reduce((a, b) => a + Number(b), 0);
    const used  = keys.filter(k => Number(budgets[k]) > 0).reduce((a, k) => a + (expenses[k] || 0), 0);

    const bs = $("budgetSummary");
    if (bs) bs.innerHTML = `
        <div class="summary-tile"><span>Total monthly limits</span><b>${money(limit)}</b></div>
        <div class="summary-tile"><span>Spent this month</span><b>${money(spent)}</b></div>
        <div class="summary-tile"><span>Budget remaining</span><b>${money(limit - used)}</b></div>`;

    const bl = $("budgetList");
    if (!bl) return;
    bl.innerHTML = keys.map(k => {
        const lim = Number(budgets[k] || 0);
        const v   = expenses[k] || 0;
        const p   = lim ? Math.min(v / lim * 100, 100) : 0;
        const over = lim && v > lim;
        return `<article class="budget-card">
            <div class="budget-top">
                <span class="cat-ico">${icons[k] || "✳"}</span>
                <span class="budget-title">${esc(k)}</span>
                <span class="budget-numbers"><b>${money(v)}</b> / ${lim ? money(lim) : "No limit"}</span>
            </div>
            <div class="progress-track">
                <div class="progress-fill ${over ? "over" : ""}" style="width:${p}%"></div>
            </div>
            <div class="budget-caption">
                <span>${!lim ? "Set a limit" : over ? `Over by ${money(v - lim)}` : `${Math.round(p)}% used`}</span>
                <span>${lim ? money(Math.max(0, lim - v)) + " left" : "—"}</span>
            </div>
        </article>`;
    }).join("") || `<div class="empty-state">No budgets configured yet.</div>`;
}

// ── Goals ────────────────────────────────────────────────────
function saveGoalsLocal() {
    try { localStorage.setItem("spendsmart-goals", JSON.stringify(goals)); } catch {}
}

function renderGoals() {
    const host = $("goalsList");
    if (!host) return;
    host.innerHTML = goals.length
        ? goals.map((g, i) => {
            const pct = Math.min(100, Math.round(Number(g.saved) / Math.max(1, Number(g.target)) * 100));
            return `<article class="goal-card panel">
                <div class="goal-card-top">
                    <span class="goal-mark">✳</span>
                    <button class="icon-btn" data-goal-delete="${i}" title="Delete">×</button>
                </div>
                <h3>${esc(g.name)}</h3>
                <div class="goal-amount">
                    <b>${money(g.saved)}</b><span>of ${money(g.target)}</span>
                </div>
                <div class="progress-track">
                    <div class="progress-fill" style="width:${pct}%"></div>
                </div>
                <div class="goal-foot">
                    <span>${pct}% complete</span>
                    <button class="text-action" data-goal-add="${i}">＋ Add savings</button>
                </div>
            </article>`;
        }).join("")
        : `<div class="empty-state">No savings goals yet. Create one above.</div>`;
}

async function addGoal() {
    const name   = $("goalName").value.trim();
    const target = Number($("goalTarget").value);
    const saved  = Number($("goalSaved").value || 0);
    if (!name || !Number.isFinite(target) || target <= 0 || saved < 0 || saved > target)
        return notify("Enter a goal name and valid amounts.");
    try {
        const res = await api("/goals", { method: "POST", body: JSON.stringify({ name, target, saved }) });
        goals.push(res);
    } catch { goals.push({ id: "local_" + Date.now(), name, target, saved }); }
    saveGoalsLocal();
    $("goalName").value = ""; $("goalTarget").value = ""; $("goalSaved").value = "0";
    renderGoals();
    notify("Savings goal created");
}

// ── Calendar ─────────────────────────────────────────────────
function renderCalendar() {
    const host = $("expenseCalendar");
    if (!host) return;
    const [year, month] = calendarMonth.split("-").map(Number);
    const first = new Date(year, month - 1, 1);
    const days  = new Date(year, month, 0).getDate();
    const offset = (first.getDay() + 6) % 7;
    const cm = $("calendarMonth");
    if (cm) cm.textContent = first.toLocaleDateString("en-IN", { month: "long", year: "numeric" });

    const sums = {};
    transactions.filter(t => t.type === "expense" && String(t.date).slice(0, 7) === calendarMonth)
        .forEach(t => { const d = Number(String(t.date).slice(8, 10)); sums[d] = (sums[d] || 0) + Number(t.amount); });
    const max = Math.max(1, ...Object.values(sums));

    let html = Array(offset).fill('<div class="calendar-empty"></div>').join("");
    for (let d = 1; d <= days; d++) {
        const v = sums[d] || 0;
        const lv = v ? Math.max(1, Math.ceil(v / max * 4)) : 0;
        html += `<div class="calendar-day ${v ? `spend-level-${lv}` : ""}" title="${v ? money(v) + " spent" : "No expenses"}">
            <span>${d}</span>${v ? `<small>${money(v)}</small>` : ""}
        </div>`;
    }
    host.innerHTML = html;
}

// ── Alerts ───────────────────────────────────────────────────
function renderSmartAlerts(rows) {
    const host = $("smartAlerts");
    if (!host) return;

    const spent = {};
    rows.filter(t => t.type === "expense").forEach(t => {
        spent[t.category] = (spent[t.category] || 0) + Number(t.amount);
    });

    const alerts = [];
    for (const [cat, raw] of Object.entries(budgets)) {
        const limit = Number(raw) || 0;
        const value = spent[cat] || 0;
        if (!limit) continue;
        const pct = value / limit * 100;
        if (pct >= 100) alerts.push({ level:"danger",  title:`${cat} budget exceeded`, msg:`Spent ${money(value-limit)} above your ${money(limit)} limit.` });
        else if (pct >= 80) alerts.push({ level:"warning", title:`${cat} budget nearly used`, msg:`${Math.round(pct)}% used. ${money(limit-value)} remains.` });
    }

    const unbudgeted = Object.keys(spent).filter(c => !Number(budgets[c] || 0));
    if (unbudgeted.length) alerts.push({ level:"info", title:"Some categories have no limits", msg:`Set budgets for: ${unbudgeted.join(", ")}.` });
    if (!alerts.length) alerts.push({ level:"success", title:"You're within all limits", msg:"No budget warnings this month. Keep tracking to stay on course." });

    host.innerHTML = alerts.map(a => `
        <article class="alert-card ${a.level}">
            <span class="alert-symbol">${a.level==="danger"?"!":a.level==="warning"?"⚑":a.level==="success"?"✓":"i"}</span>
            <div><b>${esc(a.title)}</b><p>${esc(a.msg)}</p></div>
        </article>`).join("");
}

// ── Trend chart ──────────────────────────────────────────────
function renderTrend() {
    const host = $("trendChart");
    if (!host) return;
    const now = new Date(selectedMonth + "-01T00:00:00");
    const months = [];
    for (let i = 5; i >= 0; i--) {
        const d   = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = d.toISOString().slice(0, 7);
        const sum = totals(transactions.filter(t => String(t.date).slice(0, 7) === key));
        months.push({ label: d.toLocaleDateString("en-IN", { month: "short" }), net: sum.income - sum.expense });
    }
    const max = Math.max(1, ...months.map(m => Math.abs(m.net)));
    host.innerHTML = months.map(m => `
        <div class="trend-column">
            <div class="trend-value">${money(m.net)}</div>
            <div class="trend-track">
                <div class="trend-bar ${m.net < 0 ? "negative" : "positive"}" style="height:${Math.max(4, Math.abs(m.net)/max*100)}%"></div>
            </div>
            <span>${m.label}</span>
        </div>`).join("");
}

// ── Theme ────────────────────────────────────────────────────
function toggleTheme() {
    const dark = document.body.classList.toggle("dark-theme");
    localStorage.setItem("spendsmart-theme", dark ? "dark" : "light");
    const btn = $("themeToggle");
    if (btn) btn.textContent = dark ? "☀" : "☾";
}
function initTheme() {
    const dark = localStorage.getItem("spendsmart-theme") === "dark";
    document.body.classList.toggle("dark-theme", dark);
    const btn = $("themeToggle");
    if (btn) btn.textContent = dark ? "☀" : "☾";
}

// ── Transactions CRUD ────────────────────────────────────────
function openTransaction(item) {
    $("transactionForm").reset();
    $("transactionId").value = item?.id || "";
    $("dialogTitle").textContent = item ? "Edit transaction" : "Add transaction";
    $("titleInput").value  = item?.title    || "";
    $("amountInput").value = item?.amount   || "";
    $("transactionType").value     = item?.type    || "expense";
    $("transactionCategory").value = item?.category || "Food";
    $("dateInput").value  = item?.date || new Date().toISOString().slice(0, 10);
    $("noteInput").value  = item?.note || "";
    $("recurringInput").checked = !!item?.recurring;
    syncCategoryOptions();
    $("transactionDialog").showModal();
}

function syncCategoryOptions() {
    const type = $("transactionType").value;
    const old  = $("transactionCategory").value;
    $("transactionCategory").innerHTML = categories[type]
        .map(c => `<option value="${c}">${c}</option>`).join("");
    $("transactionCategory").value = categories[type].includes(old) ? old : categories[type][0];
}

async function saveTransaction(e) {
    e.preventDefault();
    if (!validateTransactionForm()) return;
    const id = $("transactionId").value;
    const payload = {
        title:     $("titleInput").value.trim(),
        amount:    Number($("amountInput").value),
        type:      $("transactionType").value,
        category:  $("transactionCategory").value,
        date:      $("dateInput").value,
        note:      $("noteInput").value.trim(),
        recurring: $("recurringInput").checked
    };
    try {
        await api(id ? `/transactions/${encodeURIComponent(id)}` : "/transactions",
            { method: id ? "PUT" : "POST", body: JSON.stringify(payload) });
        $("transactionDialog").close();
        await refresh();
        notify(id ? "Transaction updated" : "Transaction added");
    } catch (e) { notify(e.message); }
}

async function refresh() {
    transactions = await api("/transactions");
    budgets      = await api("/budgets");
    render();
}

async function deleteTransaction(id) {
    if (!confirm("Delete this transaction? This cannot be undone.")) return;
    try {
        await api(`/transactions/${encodeURIComponent(id)}`, { method: "DELETE" });
        await refresh();
        notify("Transaction deleted");
    } catch (e) { notify(e.message); }
}

// ── Budget editor ────────────────────────────────────────────
function openBudgetEditor() {
    const keys = [...new Set([...Object.keys(budgets), ...categories.expense])];
    $("budgetInputs").innerHTML = keys.map(k => `
        <label class="field-label">${esc(k)}
            <input type="number" min="0" step="1" data-budget="${esc(k)}" value="${Number(budgets[k] || 0)}" class="form-control">
        </label>`).join("");
    $("budgetDialog").showModal();
}

async function saveBudgets(e) {
    e.preventDefault();
    const next = {};
    document.querySelectorAll("[data-budget]").forEach(el => { next[el.dataset.budget] = Number(el.value); });
    try {
        budgets = await api("/budgets", { method: "PUT", body: JSON.stringify(next) });
        $("budgetDialog").close();
        render();
        notify("Monthly budgets saved");
    } catch (e) { notify(e.message); }
}

// ── Settings ─────────────────────────────────────────────────
async function saveSettings(e) {
    e.preventDefault();
    try {
        settings = await api("/settings", {
            method: "PUT",
            body: JSON.stringify({ name: $("displayName").value, currency: $("currency").value })
        });
        render();
        notify("Preferences saved");
    } catch (e) { notify(e.message); }
}

// ── CSV Export ───────────────────────────────────────────────
function exportCSV() {
    const rows = monthRows();
    if (!rows.length) return notify("No transactions to export for this month");
    const lines = [
        ["Title","Amount","Type","Category","Date","Note","Recurring"],
        ...rows.map(t => [t.title, t.amount, t.type, t.category, t.date, t.note || "", t.recurring ? "Yes" : "No"])
    ];
    const csv = lines.map(r => r.map(v => `"${String(v).replace(/"/g,'""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href     = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `spendsmart-${selectedMonth}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
}

// ================================================================
//  EVENT LISTENERS
// ================================================================

// Nav links → navigate in the same tab
document.querySelectorAll(".nav-link").forEach(a => {
    a.addEventListener("click", e => {
        e.preventDefault();
        const section = a.getAttribute("data-section") || "dashboard";
        navigateTo(section);
    });
});

// Browser Back / Forward support
window.addEventListener("hashchange", detectPageSection);

// Month picker
$("monthPicker")?.addEventListener("change", e => {
    selectedMonth = e.target.value || new Date().toISOString().slice(0, 7);
    calendarMonth = selectedMonth;
    render();
});

// Search & filters
["searchInput","typeFilter","categoryFilter","searchInput2","typeFilter2","categoryFilter2"].forEach(id => {
    const el = $(id); if (!el) return;
    el.addEventListener(id.startsWith("searchInput") ? "input" : "change", () => {
        renderTransactionsTable(monthRows());
    });
});

// Add transaction
$("addBtn")?.addEventListener("click", () => openTransaction());
$("addBtn2")?.addEventListener("click", () => openTransaction());

// Transaction form
$("transactionForm")?.addEventListener("submit", saveTransaction);
$("transactionType")?.addEventListener("change", syncCategoryOptions);
$("closeDialog")?.addEventListener("click", () => $("transactionDialog").close());
$("cancelDialog")?.addEventListener("click", () => $("transactionDialog").close());

// Budget
$("editBudgetsBtn")?.addEventListener("click", openBudgetEditor);
$("budgetForm")?.addEventListener("submit", saveBudgets);
$("closeBudgetDialog")?.addEventListener("click", () => $("budgetDialog").close());
$("cancelBudgetDialog")?.addEventListener("click", () => $("budgetDialog").close());

// Table row actions (edit / delete)
["transactionRows", "transactionRows2"].forEach(id => {
    $(id)?.addEventListener("click", e => {
        const edit = e.target.closest("[data-edit]");
        const del  = e.target.closest("[data-delete]");
        if (edit) { const item = transactions.find(t => t.id === edit.dataset.edit); if (item) openTransaction(item); }
        if (del)  deleteTransaction(del.dataset.delete);
    });
});

// Export
$("exportBtn")?.addEventListener("click", exportCSV);
$("exportBtn2")?.addEventListener("click", exportCSV);

// Settings
$("settingsForm")?.addEventListener("submit", saveSettings);

// Theme
$("themeToggle")?.addEventListener("click", toggleTheme);

// Logout
$("logoutBtn")?.addEventListener("click", logout);

// Goals
$("addGoalBtn")?.addEventListener("click", addGoal);
$("goalsList")?.addEventListener("click", async e => {
    const del = e.target.closest("[data-goal-delete]");
    const add = e.target.closest("[data-goal-add]");
    if (del) {
        const i = Number(del.dataset.goalDelete); const item = goals[i];
        if (item?.id && !String(item.id).startsWith("local_")) {
            try { await api(`/goals/${item.id}`, { method: "DELETE" }); } catch {}
        }
        goals.splice(i, 1); saveGoalsLocal(); renderGoals(); notify("Goal deleted");
    }
    if (add) {
        const i = Number(add.dataset.goalAdd);
        const amount = Number(prompt("How much did you save?"));
        if (Number.isFinite(amount) && amount > 0) {
            goals[i].saved = Math.min(Number(goals[i].target), Number(goals[i].saved) + amount);
            if (goals[i].id && !String(goals[i].id).startsWith("local_")) {
                try { await api(`/goals/${goals[i].id}`, { method: "PUT", body: JSON.stringify({ saved: goals[i].saved }) }); } catch {}
            }
            saveGoalsLocal(); renderGoals(); notify("Savings progress updated");
        }
    }
});

// Calendar nav
$("calendarPrev")?.addEventListener("click", () => {
    const d = new Date(calendarMonth + "-01T00:00:00");
    d.setMonth(d.getMonth() - 1);
    calendarMonth = d.toISOString().slice(0, 7);
    renderCalendar();
});
$("calendarNext")?.addEventListener("click", () => {
    const d = new Date(calendarMonth + "-01T00:00:00");
    d.setMonth(d.getMonth() + 1);
    calendarMonth = d.toISOString().slice(0, 7);
    renderCalendar();
});

// Quick Actions (same-tab navigation)
$("qaAddTransaction")?.addEventListener("click", () => openTransaction());
$("qaViewBudgets")?.addEventListener("click",    () => navigateTo("budgets"));
$("qaAddGoal")?.addEventListener("click",        () => navigateTo("goals"));

// Auth
$("tabLoginBtn")?.addEventListener("click",  () => switchAuthTab("login"));
$("tabSignupBtn")?.addEventListener("click", () => switchAuthTab("signup"));
$("switchToSignup")?.addEventListener("click", e => { e.preventDefault(); switchAuthTab("signup"); });
$("switchToLogin")?.addEventListener("click",  e => { e.preventDefault(); switchAuthTab("login"); });

$("loginForm")?.addEventListener("submit", async e => {
    e.preventDefault();
    const errBox = $("loginError"); errBox.style.display = "none";
    const btn = $("loginSubmitBtn"); btn.disabled = true; btn.textContent = "Signing in…";
    try {
        const res = await api("/auth/login", {
            method: "POST",
            body: JSON.stringify({ email: $("loginEmail").value.trim(), password: $("loginPassword").value })
        });
        authToken = res.token; currentUser = res.user;
        localStorage.setItem("spendsmart-token", authToken);
        closeAuthModal();
        notify(`Welcome back, ${currentUser.name}!`);
        await init();
    } catch (err) {
        errBox.textContent = err.message; errBox.style.display = "block";
    } finally { btn.disabled = false; btn.textContent = "Sign in"; }
});

$("signupForm")?.addEventListener("submit", async e => {
    e.preventDefault();
    const errBox = $("signupError"); errBox.style.display = "none";
    const pw = $("signupPassword").value, cpw = $("signupConfirmPassword").value;
    if (pw !== cpw) { errBox.textContent = "Passwords do not match."; errBox.style.display = "block"; return; }
    const btn = $("signupSubmitBtn"); btn.disabled = true; btn.textContent = "Creating account…";
    try {
        const res = await api("/auth/register", {
            method: "POST",
            body: JSON.stringify({ name: $("signupName").value.trim(), email: $("signupEmail").value.trim(), password: pw, confirmPassword: cpw })
        });
        authToken = res.token; currentUser = res.user;
        localStorage.setItem("spendsmart-token", authToken);
        closeAuthModal();
        notify("Account created! Welcome to SpendSmart.");
        await init();
    } catch (err) {
        errBox.textContent = err.message; errBox.style.display = "block";
    } finally { btn.disabled = false; btn.textContent = "Create account"; }
});

// Change password
$("showChangePwBtn")?.addEventListener("click", () => {
    const p = $("changePasswordPanel");
    const v = p.style.display !== "none";
    p.style.display = v ? "none" : "block";
    if (!v) p.scrollIntoView({ behavior: "smooth", block: "start" });
});
$("cancelChangePwBtn")?.addEventListener("click", () => {
    $("changePasswordPanel").style.display = "none";
    $("changePasswordForm").reset();
    $("changePwError").style.display = "none";
    $("changePwSuccess").style.display = "none";
});
$("changePasswordForm")?.addEventListener("submit", async e => {
    e.preventDefault();
    const errBox = $("changePwError"); const ok = $("changePwSuccess");
    errBox.style.display = "none"; ok.style.display = "none";
    const np = $("newPassword").value, cnp = $("confirmNewPassword").value;
    if (np !== cnp) { errBox.textContent = "New passwords do not match."; errBox.style.display = "block"; return; }
    const btn = $("changePwSubmitBtn"); btn.disabled = true; btn.textContent = "Updating…";
    try {
        await api("/auth/change-password", {
            method: "PUT",
            body: JSON.stringify({ currentPassword: $("currentPassword").value.trim(), newPassword: np, confirmNewPassword: cnp })
        });
        $("changePasswordForm").reset();
        ok.textContent = "✓ Password changed successfully!"; ok.style.display = "block";
        setTimeout(() => { $("changePasswordPanel").style.display = "none"; ok.style.display = "none"; }, 2500);
    } catch (err) {
        errBox.textContent = err.message || "Failed to change password."; errBox.style.display = "block";
    } finally { btn.disabled = false; btn.textContent = "Update password"; }
});

// Eye toggle for password fields
document.querySelectorAll("[data-toggle-pass]").forEach(btn => {
    btn.addEventListener("click", () => {
        const inp = $(btn.dataset.togglePass); if (!inp) return;
        const isPass = inp.type === "password";
        inp.type = isPass ? "text" : "password";
        btn.textContent = isPass ? "🙈" : "👁";
    });
});

// ================================================================
//  START
// ================================================================
initTheme();
detectPageSection();
init();
