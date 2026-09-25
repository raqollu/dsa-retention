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
let progress = normalizeProgress(loadProgress());
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
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(iso, days) {
  const d = parseDate(iso);
  d.setDate(d.getDate() + days);
  return localISO(d);
}

function formatDate(iso, withYear = false) {
  const options = withYear
    ? { day: "numeric", month: "short", year: "numeric" }
    : { day: "numeric", month: "short" };
  return new Intl.DateTimeFormat("en-IN", options).format(parseDate(iso));
}

function daysBetween(a, b) {
  return Math.round((parseDate(b) - parseDate(a)) / 86400000);
}

function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem("dsa-retention-progress")) || {
      reviews: {},
      customAlgorithms: []
    };
  } catch {
    return { reviews: {}, customAlgorithms: [] };
  }
}

function normalizeProgress(raw) {
  return {
    reviews: raw.reviews || {},
    customAlgorithms: raw.customAlgorithms || [],
    deletedAlgorithms: raw.deletedAlgorithms || [],
    deletedReviews: raw.deletedReviews || [],
    extraReviews: raw.extraReviews || []
  };
}

function saveProgress() {
  localStorage.setItem("dsa-retention-progress", JSON.stringify(progress));
}

function reviewKey(algorithmId, reviewId) {
  return `${algorithmId}:${reviewId}`;
}

function reviewRecord(review) {
  const direct = progress.reviews[review.key];
  if (direct) return direct;

  // Backward compatibility with the original one-problem-per-stage D0 key.
  if (review.stage === "D0" && review.problemIndex === 0) {
    return progress.reviews[`${review.algorithm.id}:D0`] || null;
  }
  return null;
}

function isReviewDeleted(key) {
  return progress.deletedReviews.includes(key);
}

function allAlgorithms() {
  const deleted = new Set(progress.deletedAlgorithms);
  return [...baseData.algorithms, ...(progress.customAlgorithms || [])]
    .filter(a => !deleted.has(a.id));
}

function normalizeAlgorithm(a) {
  return {
    confidence: { concept: 3, implementation: 3, recognition: 3, ...(a.confidence || {}) },
    weaknesses: a.weaknesses || [],
    mentalModel: a.mentalModel || "",
    problems: a.problems || {},
    ...a
  };
}

function reviewsForAlgorithm(a) {
  const reviews = [];

  for (const offset of REVIEW_OFFSETS) {
    const stage = STAGE_LABELS[offset];
    const raw = a.problems?.[stage];
    const problems = Array.isArray(raw) ? raw : [raw || null];

    problems.forEach((problem, problemIndex) => {
      const suffix = problems.length > 1
        ? `${stage}:${problem?.id || problemIndex + 1}`
        : stage;
      const key = reviewKey(a.id, suffix);

      if (isReviewDeleted(key)) return;

      const review = {
        algorithm: a,
        offset,
        stage,
        problemIndex,
        reviewId: suffix,
        key,
        due: addDays(a.learnedOn, offset),
        problem
      };
      review.record = reviewRecord(review);
      reviews.push(review);
    });
  }

  (progress.extraReviews || [])
    .filter(extra => extra.algorithmId === a.id)
    .forEach(extra => {
      const key = reviewKey(a.id, `EXTRA:${extra.id}`);
      if (isReviewDeleted(key)) return;

      const review = {
        algorithm: a,
        offset: null,
        stage: "Redo",
        problemIndex: null,
        reviewId: `EXTRA:${extra.id}`,
        key,
        due: extra.due,
        problem: extra.problem || null,
        isExtra: true,
        sourceKey: extra.sourceKey || null
      };
      review.record = progress.reviews[key] || null;
      reviews.push(review);
    });

  return reviews;
}

function render() {
  const today = localISO();
  renderedDay = today;

  $("todayLabel").textContent = new Intl.DateTimeFormat("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short"
  }).format(new Date());

  const algorithms = allAlgorithms().map(normalizeAlgorithm);
  const reviews = algorithms.flatMap(reviewsForAlgorithm);
  const due = reviews.filter(r => !r.record && (includeOverdue ? r.due <= today : r.due === today));
  const upcoming = reviews
    .filter(r => !r.record && r.due > today)
    .sort((a, b) => a.due.localeCompare(b.due));

  const completed = reviews.filter(r => r.record).length;

  $("dueCount").textContent = due.length;
  $("activeCount").textContent = algorithms.length;
  $("streakCount").textContent = completed;
  $("showOverdueBtn").textContent = includeOverdue ? "Only today" : "Include overdue";
  $("todayTabCount").textContent = due.length;
  $("upcomingTabCount").textContent = upcoming.length;
  $("memoryTabCount").textContent = algorithms.length;

  renderToday(due, today);
  renderUpcoming(upcoming.slice(0, 10));
  renderAlgorithms(algorithms);
}

function refreshIfDayChanged() {
  if (localISO() !== renderedDay) render();
}

function setActiveTab(tabName, updateHash = true) {
  const validTabs = new Set(["today", "upcoming", "memory"]);
  const nextTab = validTabs.has(tabName) ? tabName : "today";

  document.querySelectorAll(".tab-button").forEach(button => {
    const active = button.dataset.tab === nextTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });

  document.querySelectorAll(".tab-panel").forEach(panel => {
    const active = panel.dataset.panel === nextTab;
    panel.classList.toggle("active", active);
    panel.hidden = !active;
  });

  if (updateHash) {
    history.replaceState(null, "", `#${nextTab}`);
  }
}

function tabFromHash() {
  return window.location.hash.replace("#", "") || "today";
}

function renderToday(items, today) {
  const root = $("todayList");
  root.innerHTML = "";

  if (!items.length) {
    root.innerHTML = `<div class="empty">Nothing due. The queue is clear.</div>`;
    return;
  }

  items.sort((a, b) => a.due.localeCompare(b.due) || a.stage.localeCompare(b.stage));

  for (const item of items) {
    const card = document.createElement("article");
    card.className = "review-card";
    const isOverdue = item.due < today;
    const title = item.problem?.title || `${item.stage} review problem not populated yet`;

    card.innerHTML = `
      <div>
        <div class="review-meta">
          <span class="badge">${item.stage}</span>
          ${isOverdue
            ? `<span class="badge overdue">${Math.abs(daysBetween(item.due, today))}d overdue</span>`
            : `<span class="badge">due today</span>`}
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
    const reviews = reviewsForAlgorithm(a);
    const scheduledReviews = reviews.filter(r => !r.isExtra);
    const completed = scheduledReviews.filter(r => r.record).length;
    const total = scheduledReviews.length;
    const pct = total ? Math.round((completed / total) * 100) : 0;
    const next = reviews
      .filter(r => !r.record)
      .sort((x, y) => x.due.localeCompare(y.due))[0];

    const card = document.createElement("button");
    card.className = "algorithm-card";
    card.innerHTML = `
      <div class="algorithm-top">
        <div>
          <p class="eyebrow">LEARNED ${formatDate(a.learnedOn, true).toUpperCase()}</p>
          <h3>${escapeHTML(a.name)}</h3>
        </div>
        <span class="badge">${completed}/${total}</span>
      </div>
      <div class="progress"><span style="width:${pct}%"></span></div>
      <div class="algorithm-foot">
        <span>Concept ${a.confidence.concept}/5 · Impl ${a.confidence.implementation}/5 · Recognition ${a.confidence.recognition}/5</span>
        <span>${next ? `Next ${next.stage}` : "Maintenance"}</span>
      </div>`;

    card.addEventListener("click", () => openAlgorithm(a));
    root.appendChild(card);
  });
}

function openReview(item) {
  activeReview = item;
  $("reviewStage").textContent = `${item.stage} · ${formatDate(item.due, true)}`;
  $("reviewTitle").textContent = item.problem?.title || "Review slot";
  $("reviewPrompt").textContent =
    item.problem?.focus || "Solve without looking at notes. Explain your invariant before coding.";

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
  const weaknessHTML = a.weaknesses.length
    ? a.weaknesses.map(w => `<li>${escapeHTML(w)}</li>`).join("")
    : "<li>None recorded yet</li>";

  const history = reviews.map(r => {
    const title = r.problem?.title || "Problem slot not populated";
    const status = r.record
      ? `${OUTCOME_LABELS[r.record.outcome]} · ${formatDate(r.record.completedOn, true)}`
      : (r.due < localISO() ? "Due" : formatDate(r.due, true));

    return `
      <div class="history-row">
        <span class="badge">${r.stage}</span>
        <div>
          <strong>${escapeHTML(title)}</strong>
          <div class="history-status">${escapeHTML(r.problem?.focus || "Review")}</div>
        </div>
        <div class="history-actions">
          <span class="history-status">${status}</span>
          ${r.record ? `<button class="history-link review-again-btn" type="button" data-review-id="${escapeHTML(r.reviewId)}">Review today</button>` : ""}
          <button class="danger-link delete-review-btn" type="button" data-review-id="${escapeHTML(r.reviewId)}">Delete</button>
        </div>
      </div>`;
  }).join("");

  $("algorithmDetails").innerHTML = `
    <div class="detail-header">
      <p class="eyebrow">LEARNED ${formatDate(a.learnedOn, true).toUpperCase()}</p>
      <h2>${escapeHTML(a.name)}</h2>
    </div>
    <div class="mental-model"><strong>Mental model</strong><br>${escapeHTML(a.mentalModel || "Not recorded yet")}</div>
    <div class="confidence">
      <div><strong>${a.confidence.concept}/5</strong><span class="muted small">Concept</span></div>
      <div><strong>${a.confidence.implementation}/5</strong><span class="muted small">Implementation</span></div>
      <div><strong>${a.confidence.recognition}/5</strong><span class="muted small">Recognition</span></div>
    </div>
    <h3>Weaknesses</h3>
    <ul class="small muted">${weaknessHTML}</ul>
    <div class="review-history"><h3>Review path</h3>${history}</div>
    <div class="danger-zone">
      <div>
        <strong>Delete algorithm</strong>
        <p class="muted small">Removes this algorithm and all of its review entries from this browser.</p>
      </div>
      <button class="danger-button" id="deleteAlgorithmBtn" type="button">Delete algorithm</button>
    </div>`;

  $("algorithmDetails").querySelectorAll(".review-again-btn").forEach(button => {
    button.addEventListener("click", () => {
      const review = reviews.find(r => r.reviewId === button.dataset.reviewId);
      if (review) reviewAgainToday(a, review);
    });
  });

  $("algorithmDetails").querySelectorAll(".delete-review-btn").forEach(button => {
    button.addEventListener("click", () => {
      const review = reviews.find(r => r.reviewId === button.dataset.reviewId);
      if (review) deleteReview(a, review);
    });
  });

  $("deleteAlgorithmBtn").addEventListener("click", () => deleteAlgorithm(a));
  $("algorithmDialog").showModal();
}

function reviewAgainToday(a, review) {
  const sourceKey = review.sourceKey || review.key;
  const today = localISO();

  const alreadyQueued = (progress.extraReviews || []).some(extra => {
    const extraKey = reviewKey(a.id, `EXTRA:${extra.id}`);
    return extra.algorithmId === a.id &&
      extra.sourceKey === sourceKey &&
      extra.due === today &&
      !progress.reviews[extraKey];
  });

  if (alreadyQueued) {
    window.alert("This question is already in today's review queue.");
    return;
  }

  progress.extraReviews.push({
    id: Date.now().toString(36),
    algorithmId: a.id,
    sourceKey,
    due: today,
    problem: review.problem || null
  });

  saveProgress();
  $("algorithmDialog").close();
  render();
}

function deleteReview(a, review) {
  const problemTitle = review.problem?.title || review.stage + " review";
  if (!window.confirm(`Delete "${problemTitle}" from ${a.name}?`)) return;

  if (review.isExtra) {
    progress.extraReviews = progress.extraReviews.filter(extra =>
      reviewKey(a.id, `EXTRA:${extra.id}`) !== review.key
    );
  } else if (!progress.deletedReviews.includes(review.key)) {
    progress.deletedReviews.push(review.key);
  }

  delete progress.reviews[review.key];
  saveProgress();
  $("algorithmDialog").close();
  render();
}

function deleteAlgorithm(a) {
  if (!window.confirm(`Delete ${a.name} and all of its reviews from this dashboard?`)) return;

  if (!progress.deletedAlgorithms.includes(a.id)) {
    progress.deletedAlgorithms.push(a.id);
  }

  progress.customAlgorithms = progress.customAlgorithms.filter(item => item.id !== a.id);
  progress.deletedReviews = progress.deletedReviews.filter(key => !key.startsWith(a.id + ":"));
  progress.extraReviews = progress.extraReviews.filter(extra => extra.algorithmId !== a.id);

  Object.keys(progress.reviews).forEach(key => {
    if (key.startsWith(a.id + ":")) delete progress.reviews[key];
  });

  saveProgress();
  $("algorithmDialog").close();
  render();
}

function escapeHTML(str = "") {
  return String(str).replace(/[&<>'"]/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;"
  }[c]));
}

document.querySelectorAll(".tab-button").forEach(button => {
  button.addEventListener("click", () => setActiveTab(button.dataset.tab));
});

window.addEventListener("hashchange", () => setActiveTab(tabFromHash(), false));

$("showOverdueBtn").addEventListener("click", () => {
  includeOverdue = !includeOverdue;
  render();
});

$("reviewCloseBtn").addEventListener("click", () => $("reviewDialog").close());
$("addCloseBtn").addEventListener("click", () => $("addDialog").close());
$("algorithmCloseBtn").addEventListener("click", () => $("algorithmDialog").close());

[$("reviewDialog"), $("algorithmDialog"), $("addDialog")].forEach(dialog => {
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
});

$("revealAlgorithmBtn").addEventListener("click", () => {
  const el = $("algorithmReveal");
  el.hidden = !el.hidden;
  $("revealAlgorithmBtn").textContent = el.hidden ? "Reveal" : "Hide";
});

$("reviewForm").addEventListener("submit", e => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  const outcome = fd.get("outcome");

  if (!activeReview || !outcome) return;

  progress.reviews[activeReview.key] = {
    outcome,
    completedOn: localISO()
  };

  saveProgress();
  $("reviewDialog").close();
  render();
});

$("addAlgorithmBtn").addEventListener("click", () => {
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

  const id =
    name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") +
    "-" +
    Date.now().toString(36);

  progress.customAlgorithms.push({
    id,
    name,
    learnedOn,
    mentalModel,
    confidence: { concept: 3, implementation: 3, recognition: 2 },
    weaknesses: [],
    problems: {}
  });

  saveProgress();
  $("addDialog").close();
  render();
});

$("exportBtn").addEventListener("click", () => {
  const payload = JSON.stringify(progress, null, 2);
  const blob = new Blob([payload], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "dsa-retention-progress.json";
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
});

async function boot() {
  try {
    const res = await fetch("data/algorithms.json", { cache: "no-store" });
    baseData = await res.json();
  } catch (err) {
    console.error("Could not load algorithm data", err);
    baseData = { algorithms: [] };
  }

  render();
  setActiveTab(tabFromHash(), false);

  setInterval(refreshIfDayChanged, 60_000);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshIfDayChanged();
  });
  window.addEventListener("focus", refreshIfDayChanged);
}

boot();
