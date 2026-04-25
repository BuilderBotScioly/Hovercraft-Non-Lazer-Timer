const STORAGE_KEY = "game-tournaments-v3-state";
const CHANNEL_NAME = "game-tournaments-v3-sync";

const defaultState = {
  tournamentName: "",
  players: [],
  games: [],
  scores: {},
  slideIndex: 0
};

const state = loadState();
const syncChannel = "BroadcastChannel" in window ? new BroadcastChannel(CHANNEL_NAME) : null;

const params = new URLSearchParams(window.location.search);
const isDisplayOnly = params.get("view") === "display";

const el = {
  presenterView: document.getElementById("presenterView"),
  displayView: document.getElementById("displayView"),
  tournamentName: document.getElementById("tournamentName"),
  playerNameInput: document.getElementById("playerNameInput"),
  addPlayerBtn: document.getElementById("addPlayerBtn"),
  playersList: document.getElementById("playersList"),
  gameNameInput: document.getElementById("gameNameInput"),
  gameRulesInput: document.getElementById("gameRulesInput"),
  addGameBtn: document.getElementById("addGameBtn"),
  gamesList: document.getElementById("gamesList"),
  scoreEditor: document.getElementById("scoreEditor"),
  prevSlideBtn: document.getElementById("prevSlideBtn"),
  nextSlideBtn: document.getElementById("nextSlideBtn"),
  slideIndicator: document.getElementById("slideIndicator"),
  slidePreview: document.getElementById("slidePreview"),
  openDisplayBtn: document.getElementById("openDisplayBtn"),
  copyDisplayLinkBtn: document.getElementById("copyDisplayLinkBtn"),
  resetAllBtn: document.getElementById("resetAllBtn"),
  displayTitle: document.getElementById("displayTitle"),
  displaySubtitle: document.getElementById("displaySubtitle"),
  displayBody: document.getElementById("displayBody")
};

init();

function init() {
  if (isDisplayOnly) {
    document.title = "Game Tournaments v3 - Display";
    el.presenterView.classList.add("hidden");
    el.displayView.classList.remove("hidden");
    renderDisplay();
  } else {
    attachPresenterEvents();
    renderPresenter();
  }

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      Object.assign(state, JSON.parse(event.newValue));
      renderPresenter();
      renderDisplay();
    } catch {
      // no-op
    }
  });

  if (syncChannel) {
    syncChannel.onmessage = () => {
      const latest = loadState();
      Object.assign(state, latest);
      renderPresenter();
      renderDisplay();
    };
  }
}

function attachPresenterEvents() {
  el.tournamentName.addEventListener("input", () => {
    state.tournamentName = el.tournamentName.value.trim();
    persistAndRender();
  });

  el.addPlayerBtn.addEventListener("click", () => {
    const name = el.playerNameInput.value.trim();
    if (!name) return;
    state.players.push({ id: uid(), name });
    el.playerNameInput.value = "";
    persistAndRender();
  });

  el.addGameBtn.addEventListener("click", () => {
    const name = el.gameNameInput.value.trim();
    if (!name) return;
    const rules = el.gameRulesInput.value.trim();
    const gameId = uid();

    state.games.push({ id: gameId, name, rules });
    state.scores[gameId] = state.scores[gameId] || {};

    el.gameNameInput.value = "";
    el.gameRulesInput.value = "";
    persistAndRender();
  });

  el.prevSlideBtn.addEventListener("click", () => moveSlide(-1));
  el.nextSlideBtn.addEventListener("click", () => moveSlide(1));

  el.openDisplayBtn.addEventListener("click", () => {
    window.open(getDisplayUrl(), "_blank", "noopener,noreferrer");
  });

  el.copyDisplayLinkBtn.addEventListener("click", async () => {
    const link = getDisplayUrl();
    try {
      await navigator.clipboard.writeText(link);
      el.copyDisplayLinkBtn.textContent = "Copied!";
      setTimeout(() => (el.copyDisplayLinkBtn.textContent = "Copy Display Link"), 1300);
    } catch {
      alert(`Copy failed. Use this link:\n${link}`);
    }
  });

  el.resetAllBtn.addEventListener("click", () => {
    if (!confirm("Clear all players, games, and scores?")) return;
    Object.assign(state, structuredClone(defaultState));
    persistAndRender();
  });
}

function renderPresenter() {
  if (isDisplayOnly) return;
  el.tournamentName.value = state.tournamentName;

  el.playersList.innerHTML = state.players
    .map((player) => `<li class="tag"><span>${escapeHtml(player.name)}</span>${removeButton("player", player.id)}</li>`)
    .join("");

  el.gamesList.innerHTML = state.games
    .map(
      (game) =>
        `<li class="game-item"><div><strong>${escapeHtml(game.name)}</strong><div class="muted">${escapeHtml(game.rules || "No rules yet")}</div></div>${removeButton("game", game.id)}</li>`
    )
    .join("");

  el.scoreEditor.innerHTML = buildScoreEditor();
  el.slidePreview.innerHTML = buildSlideMarkup(getSlides()[state.slideIndex] || emptySlide());

  const slides = getSlides();
  const index = Math.min(state.slideIndex + 1, slides.length || 1);
  el.slideIndicator.textContent = `${index} / ${slides.length || 1}`;

  bindRemoveEvents();
  bindScoreEvents();
}

function renderDisplay() {
  const slides = getSlides();
  const current = slides[state.slideIndex] || emptySlide();

  el.displayTitle.textContent = state.tournamentName || "Game Tournaments v3";
  el.displaySubtitle.textContent = `${current.title} (${Math.min(state.slideIndex + 1, slides.length || 1)}/${slides.length || 1})`;
  el.displayBody.innerHTML = buildSlideMarkup(current);
}

function getSlides() {
  if (!state.games.length) {
    return [
      {
        title: "Setup",
        html: `<p>Add players and games from the presenter screen to begin.</p>`
      }
    ];
  }

  const slides = [];
  for (const game of state.games) {
    slides.push({
      title: `${game.name} Rules`,
      html: `<h3>${escapeHtml(game.name)}</h3><p>${escapeHtml(game.rules || "No rules entered yet.")}</p>`
    });

    slides.push({
      title: `${game.name} Scores`,
      html: scoreTableForGame(game.id)
    });

    slides.push({
      title: "Overall Standings",
      html: overallStandingsTable()
    });
  }

  return slides;
}

function buildScoreEditor() {
  if (!state.games.length || !state.players.length) {
    return `<p class="muted">Add at least one player and one game to edit scores.</p>`;
  }

  return state.games
    .map((game) => {
      const rows = state.players
        .map((player) => {
          const value = getScore(game.id, player.id);
          return `<tr>
            <td>${escapeHtml(player.name)}</td>
            <td><input class="score-input" type="number" step="1" data-game-id="${game.id}" data-player-id="${player.id}" value="${value}" /></td>
          </tr>`;
        })
        .join("");

      return `<div class="card" style="padding:10px; margin-bottom:10px;">
        <h3>${escapeHtml(game.name)}</h3>
        <table class="score-table"><thead><tr><th>Player</th><th>Score</th></tr></thead><tbody>${rows}</tbody></table>
      </div>`;
    })
    .join("");
}

function scoreTableForGame(gameId) {
  if (!state.players.length) {
    return `<p>No players added yet.</p>`;
  }
  const sorted = [...state.players].sort((a, b) => getScore(gameId, b.id) - getScore(gameId, a.id));
  const rows = sorted
    .map((player, idx) => `<tr><td>${idx + 1}</td><td>${escapeHtml(player.name)}</td><td>${getScore(gameId, player.id)}</td></tr>`)
    .join("");

  return `<table><thead><tr><th>#</th><th>Player</th><th>Score</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function overallStandingsTable() {
  if (!state.players.length) return `<p>No players added yet.</p>`;

  const ranked = state.players
    .map((player) => ({
      name: player.name,
      total: state.games.reduce((sum, game) => sum + getScore(game.id, player.id), 0)
    }))
    .sort((a, b) => b.total - a.total);

  const rows = ranked
    .map((entry, idx) => `<tr><td>${idx + 1}</td><td>${escapeHtml(entry.name)}</td><td>${entry.total}</td></tr>`)
    .join("");

  return `<table><thead><tr><th>#</th><th>Player</th><th>Total Score</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function moveSlide(direction) {
  const max = Math.max(getSlides().length - 1, 0);
  state.slideIndex = Math.max(0, Math.min(max, state.slideIndex + direction));
  persistAndRender();
}

function bindRemoveEvents() {
  document.querySelectorAll("[data-remove-kind]").forEach((button) => {
    button.addEventListener("click", () => {
      const kind = button.dataset.removeKind;
      const id = button.dataset.removeId;
      if (kind === "player") {
        state.players = state.players.filter((player) => player.id !== id);
        Object.keys(state.scores).forEach((gameId) => {
          delete state.scores[gameId][id];
        });
      }
      if (kind === "game") {
        state.games = state.games.filter((game) => game.id !== id);
        delete state.scores[id];
      }
      state.slideIndex = 0;
      persistAndRender();
    });
  });
}

function bindScoreEvents() {
  document.querySelectorAll(".score-input").forEach((input) => {
    input.addEventListener("input", () => {
      const gameId = input.dataset.gameId;
      const playerId = input.dataset.playerId;
      const parsed = Number.parseInt(input.value, 10);
      if (!state.scores[gameId]) state.scores[gameId] = {};
      state.scores[gameId][playerId] = Number.isFinite(parsed) ? parsed : 0;
      persistAndRender(false);
      renderPresenter();
      renderDisplay();
    });
  });
}

function persistAndRender(shouldRenderPresenter = true) {
  saveState();
  if (shouldRenderPresenter) renderPresenter();
  renderDisplay();
  if (syncChannel) syncChannel.postMessage({ type: "sync" });
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(defaultState);
    const parsed = JSON.parse(raw);
    return {
      tournamentName: parsed.tournamentName || "",
      players: Array.isArray(parsed.players) ? parsed.players : [],
      games: Array.isArray(parsed.games) ? parsed.games : [],
      scores: parsed.scores && typeof parsed.scores === "object" ? parsed.scores : {},
      slideIndex: Number.isInteger(parsed.slideIndex) ? parsed.slideIndex : 0
    };
  } catch {
    return structuredClone(defaultState);
  }
}

function getScore(gameId, playerId) {
  return Number(state.scores?.[gameId]?.[playerId] || 0);
}

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function removeButton(kind, id) {
  return `<button data-remove-kind="${kind}" data-remove-id="${id}" class="danger">Remove</button>`;
}

function buildSlideMarkup(slide) {
  return `<div><h2>${escapeHtml(slide.title)}</h2><div>${slide.html}</div></div>`;
}

function emptySlide() {
  return { title: "No slides", html: "<p>Create a game to generate slides.</p>" };
}

function getDisplayUrl() {
  const url = new URL(window.location.href);
  url.searchParams.set("view", "display");
  return url.toString();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
