const REVIEW_OFFSETS = [0, 1, 5, 7, 15, 25];
const STAGE_LABELS = {0: "D0", 1: "D1", 5: "D5", 7: "D7", 15: "D15", 25: "D25"};
const OUTCOME_LABELS = {
  independent: "Independent",
  hint: "With hint",
  recognition: "Recognition gap",
  implementation: "Implementation gap",
  concept: "Concept gap"
};

let baseData = { algorithms: [] };
let progress = loadProgress();
let includeOverdue = true;
let activeReview = null;
let renderedDay = localISO();

const $ = (id) => document.getElementById(id);

function localISO(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function parseDate(iso) {
  const [y,m,d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(iso, days) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + days);
  return localISO(d);
}
function formatDate(iso, withYear = false) {
  const options = withYear ? {day:"numeric", month:"short", year:"numeric"} : {day:"numeric", month:"short"};
  return new Intl.DateTimeFormat("en-IN", options).format(parseDate(iso));
}
function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}
function loadProgress() {
  try { return JSON.parse(localStorage.getItem("dsa-retention-progress")) || { reviews:{}, customAlgorithms:[] }; }
  catch { return { reviews:{}, customAlgorithms:[] }; }
}
function saveProgress() {
  localStorage.setItem("dsa-retention-progress", JSON.stringify(progress));
}
function reviewKey(algorithmId, offset) { return `${algorithmId}:D${offset}`; }
function reviewRecord(algorithmId, offset) { return progress.reviews[reviewKey(algorithmId, offset)] || null; }
function allAlgorithms() { return [...baseData.algorithms, ...(progress.customAlgorithms || [])]; }

function normalizeAlgorithm(a) {
  const problems = a.problems || {};
  return {
    confidence: { concept: 3, implementation: 3, recognition: 3, ...(a.confidence || {}) },
    weaknesses: a.weaknesses || [],
    mentalModel: a.mentalModel || "",
    problems,
    ...a
  };
}

function reviewsForAlgorithm(a) {
  return REVIEW_OFFSETS.map(offset => ({
    algorithm: a,
    offset,
    stage: STAGE_LABELS[offset],
    due: addDays(a.learnedOn, offset),
    problem: a.problems?.[STAGE_LABELS[offset]] || null,
    record: reviewRecord(a.id, offset)
  }));
}

function render() {
  const today = localISO();
  renderedDay = today;
  $("todayLabel").textContent = new Intl.DateTimeFormat("en-IN", {weekday:"short", day:"numeric", month:"short"}).format(new Date());
  const algorithms = allAlgorithms().map(normalizeAlgorithm);
  const reviews = algorithms.flatMap(reviewsForAlgorithm);
  const due = reviews.filter(r => !r.record && (includeOverdue ? r.due <= today : r.due === today));
  const upcoming = reviews.filter(r => !r.record && r.due > today).sort((a,b) => a.due.localeCompare(b.due));
  const completed = Object.keys(progress.reviews).length;

  $("dueCount").textContent = due.length;
  $("activeCount").textContent = algorithms.length;
  $("streakCount").textContent = completed;
  $("showOverdueBtn").textContent = includeOverdue ? "Only today" : "Include overdue";

  renderToday(due, today);
  renderUpcoming(upcoming.slice(0, 8));
  renderAlgorithms(algorithms);
}

function refreshIfDayChanged() {
  const today = localISO();
  if (today !== renderedDay) render();
}

function renderToday(items, today) {
  const root = $("todayList");
  root.innerHTML = "";
  if (!items.length) {
    root.innerHTML = `<div class="empty">Nothing due. The queue is clear.</div>`;
    return;
  }
  items.sort((a,b) => a.due.localeCompare(b.due));
  for (const item of items) {
    const card = document.createElement("article");
    card.className = "review-card";
    const isOverdue = item.due < today;
    const title = item.problem?.title || `${item.stage} review problem not populated yet`;
    card.innerHTML = `
      <div>
        <div class="review-meta">
          <span class="badge">${item.stage}</span>
          ${isOverdue ? `<span class="badge overdue">${Math.abs(daysBetween(item.due, today))}d overdue</span>` : `<span class="badge">due today</span>`}
        </div>
        <h3>${escapeHTML(title)}</h3>
        <p class="muted small">${escapeHTML(item.problem?.focus || "Recognition + recall review")}</p>
      </div>
      <button class="primary">Start review</button>`;
    card.querySelector("button").addEventListener("click", () => openReview(item));
    root.appendChild(card);
  }
}

function renderUpcoming(items) {
  const root = $("upcomingList");
  root.innerHTML = "";
  if (!items.length) {
    root.innerHTML = `<div class="empty">No upcoming reviews yet.</div>`;
    return;
  }
  items.forEach(item => {
    const row = document.createElement("div");
    row.className = "timeline-row";
    row.innerHTML = `
      <span class="timeline-date">${formatDate(item.due)}</span>
      <span class="timeline-title">${escapeHTML(item.algorithm.name)}</span>
      <span class="badge">${item.stage}</span>`;
    root.appendChild(row);
  });
}

function renderAlgorithms(algorithms) {
  const root = $("algorithmGrid");
  root.innerHTML = "";
  algorithms.forEach(a => {
    const completed = REVIEW_OFFSETS.filter(offset => reviewRecord(a.id, offset)).length;
    const pct = Math.round((completed / REVIEW_OFFSETS.length) * 100);
    const next = reviewsForAlgorithm(a).find(r => !r.record);
    const card = document.createElement("button");
    card.className = "algorithm-card";
    card.innerHTML = `
      <div class="algorithm-top"><div><p class="eyebrow">LEARNED ${formatDate(a.learnedOn, true).toUpperCase()}</p><h3>${escapeHTML(a.name)}</h3></div><span class="badge">${completed}/${REVIEW_OFFSETS.length}</span></div>
      <div class="progress"><span style="width:${pct}%"></span></div>
      <div class="algorithm-foot"><span>Concept ${a.confidence.concept}/5 · Impl ${a.confidence.implementation}/5 · Recognition ${a.confidence.recognition}/5</span><span>${next ? `Next ${next.stage}` : "Maintenance"}</span></div>`;
    card.addEventListener("click", () => openAlgorithm(a));
    root.appendChild(card);
  });
}

function openReview(item) {
  activeReview = item;
  $("reviewStage").textContent = `${item.stage} · ${formatDate(item.due, true)}`;
  $("reviewTitle").textContent = item.problem?.title || "Review slot";
  $("reviewPrompt").textContent = item.problem?.focus || "Solve without looking at notes. Explain your invariant before coding.";
  const link = $("reviewLink");
  if (item.problem?.url) {
    link.href = item.problem.url;
    link.hidden = false;
  } else {
    link.hidden = true;
  }
  $("algorithmReveal").hidden = true;
  $("algorithmReveal").textContent = item.algorithm.name;
  $("revealAlgorithmBtn").textContent = "Reveal";
  $("reviewForm").reset();
  $("reviewDialog").showModal();
}

function openAlgorithm(a) {
  const reviews = reviewsForAlgorithm(a);
  const weaknessHTML = a.weaknesses.length ? a.weaknesses.map(w => `<li>${escapeHTML(w)}</li>`).join("") : "<li>None recorded yet</li>";
  const history = reviews.map(r => {
    const title = r.problem?.title || "Problem slot not populated";
    const status = r.record ? `${OUTCOME_LABELS[r.record.outcome]} · ${formatDate(r.record.completedOn, true)}` : (r.due < localISO() ? "Due" : formatDate(r.due, true));
    return `<div class="history-row"><span class="badge">${r.stage}</span><div><strong>${escapeHTML(title)}</strong><div class="history-status">${escapeHTML(r.problem?.focus || "Review")}</div></div><span class="history-status">${status}</span></div>`;
  }).join("");
  $("algorithmDetails").innerHTML = `
    <div class="detail-header"><p class="eyebrow">LEARNED ${formatDate(a.learnedOn, true).toUpperCase()}</p><h2>${escapeHTML(a.name)}</h2></div>
    <div class="mental-model"><strong>Mental model</strong><br>${escapeHTML(a.mentalModel || "Not recorded yet")}</div>
    <div class="confidence">
      <div><strong>${a.confidence.concept}/5</strong><span class="muted small">Concept</span></div>
      <div><strong>${a.confidence.implementation}/5</strong><span class="muted small">Implementation</span></div>
      <div><strong>${a.confidence.recognition}/5</strong><span class="muted small">Recognition</span></div>
    </div>
    <h3>Weaknesses</h3><ul class="small muted">${weaknessHTML}</ul>
    <div class="review-history"><h3>Review path</h3>${history}</div>`;
  $("algorithmDialog").showModal();
}

function escapeHTML(str = "") {
  return String(str).replace(/[&<>'"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
}

$("showOverdueBtn").addEventListener("click", () => { includeOverdue = !includeOverdue; render(); });
$("revealAlgorithmBtn").addEventListener("click", () => {
  const el = $("algorithmReveal");
  el.hidden = !el.hidden;
  $("revealAlgorithmBtn").textContent = el.hidden ? "Reveal" : "Hide";
});
$("reviewForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const outcome = fd.get("outcome");
  if (!activeReview || !outcome) return;
  progress.reviews[reviewKey(activeReview.algorithm.id, activeReview.offset)] = {
    outcome,
    completedOn: localISO()
  };
  saveProgress();
  $("reviewDialog").close();
  render();
});
$("algorithmCloseBtn").addEventListener("click", () => $("algorithmDialog").close());
$("addAlgorithmBtn").addEventListener("click", () => {
  $("newDate").value = localISO();
  $("addForm").reset();
  $("newDate").value = localISO();
  $("addDialog").showModal();
});
$("addForm").addEventListener("submit", e => {
  e.preventDefault();
  const name = $("newName").value.trim();
  const learnedOn = $("newDate").value;
  const mentalModel = $("newMentalModel").value.trim();
  if (!name || !learnedOn) return;
  const id = name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"") + "-" + Date.now().toString(36);
  progress.customAlgorithms.push({
    id, name, learnedOn, mentalModel,
    confidence:{concept:3,implementation:3,recognition:2},
    weaknesses:[], problems:{}
  });
  saveProgress();
  $("addDialog").close();
  render();
});
$("exportBtn").addEventListener("click", () => {
  const payload = JSON.stringify(progress, null, 2);
  const blob = new Blob([payload], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "dsa-retention-progress.json"; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

async function boot() {
  try {
    const res = await fetch("data/algorithms.json", {cache:"no-store"});
    baseData = await res.json();
  } catch (err) {
    console.error("Could not load algorithm data", err);
    baseData = { algorithms: [] };
  }
  render();

  // Keep the dashboard correct even when it stays open across midnight.
  setInterval(refreshIfDayChanged, 60_000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshIfDayChanged();
  });
  window.addEventListener("focus", refreshIfDayChanged);
}
boot();