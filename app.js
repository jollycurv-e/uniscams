/* ========================================================
   APPLICATION ORCHESTRATOR (app.js)
   ======================================================== */

/* DEBUG FLAG — append ?debug to the URL to enable verbose logging */
window.DEBUG = new URLSearchParams(window.location.search).has('debug');
window.enableDebug  = () => { window.DEBUG = true; };
window.disableDebug = () => { window.DEBUG = false; };

const THEME_STORAGE_KEY = "uniscams:theme";

function applyTheme(theme) {
    const resolvedTheme = theme === "light" ? "light" : "dark";
    document.documentElement.dataset.theme = resolvedTheme;

    const toggle = document.getElementById("theme-toggle");
    if (toggle) {
        const nextTheme = resolvedTheme === "dark" ? "light" : "dark";
        toggle.textContent = `${nextTheme[0].toUpperCase()}${nextTheme.slice(1)} theme`;
        toggle.setAttribute("aria-label", `Switch to ${nextTheme} theme`);
    }
}

function initThemeToggle() {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    applyTheme(storedTheme || "dark");

    const toggle = document.getElementById("theme-toggle");
    if (!toggle) return;

    toggle.addEventListener("click", () => {
        const currentTheme = document.documentElement.dataset.theme === "light" ? "light" : "dark";
        const nextTheme = currentTheme === "dark" ? "light" : "dark";
        localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
        applyTheme(nextTheme);
    });
}

/* BOOTSTRAP PIPELINE */
async function loadPlayers() {
    const totalStart = performance.now();
    await loadConfig();

    // Convert alt -> main  INTO  main -> [alts]
    const normalizedAltMap = {};

    for (const [altUuid, mainUuid] of Object.entries(altMap)) {
        if (!normalizedAltMap[mainUuid]) {
            normalizedAltMap[mainUuid] = [];
        }
        normalizedAltMap[mainUuid].push(altUuid);
    }

    altMap = normalizedAltMap;
    await loadDiscordData();

    // ====================================================
    // PRE-FETCH LIVE DISCORD ACCOUNTS
    // ====================================================
    const allDiscordIds = new Set();
    
    // Extract linked IDs
    Object.values(discordLinks).forEach(arr => {
        arr.forEach(id => allDiscordIds.add(id));
    });
    
    // Extract unlinked IDs
    (unlinked || []).forEach(entry => {
        if (Array.isArray(entry.discordLinks)) {
            entry.discordLinks.forEach(id => allDiscordIds.add(id));
        } else if (entry.discordId) {
            allDiscordIds.add(entry.discordId);
        }
    });
    // ====================================================

    // Expose unlinked globally right away for ui.js scope mapping security
    window.unlinked = unlinked || [];

    // Deduplicate profiles to determine total distinct profiles needed.
    const allAltUuids = Object.values(altMap).flat();
    const all = [...new Set([...uuids, ...allAltUuids])];

    let loaded = 0;
    const queue = [...all];
    const retryCounts = new Map();
    const MAX_RETRIES = 3;
    const RATE_LIMITED = window._craftyRateLimited;

    const loadStart = performance.now();

    // Ensure loadingText (and other UI refs) are initialised before the
    // worker loop starts ticking. Previously this happened implicitly via
    // the per-player renderPlayers() call; now that renderPlayers() only
    // runs once after Promise.all we must do it explicitly here.
    initUI();

    // Discord resolution (JAPI) and Crafty player fetching hit separate APIs
    // with separate rate limits — run them in parallel. renderPlayers() only
    // fires once both are done, so Discord usernames are always ready in time.
    if (window.DEBUG) console.log(`[uniscams] starting discord resolution and player load in parallel (${all.length} profiles, ${allDiscordIds.size} discord IDs)`);
    const discordPromise = resolveDiscordUsers([...allDiscordIds]);

    const workers = Array.from({ length: 3 }, async (_, workerIdx) => {
        while (queue.length) {
            const pause = getRateLimitPause();
            if (pause) await pause;

            if (!queue.length) break;
            const uuid = queue.shift();
            const data = await fetchPlayer(uuid);

            if (data === RATE_LIMITED) {
                if (window.DEBUG) console.log(`[uniscams] worker ${workerIdx + 1} rate limited — re-queuing ${uuid} (queue length: ${queue.length + 1})`);
                queue.push(uuid);
                continue;
            }

            if (data) {
                players.set(uuid, data);
                loaded++;
                if (window.DEBUG) console.log(`[uniscams] worker ${workerIdx + 1} loaded: ${data.username} (${uuid}) [${loaded}/${all.length}]`);
            } else {
                const attempts = (retryCounts.get(uuid) || 0) + 1;
                if (attempts < MAX_RETRIES) {
                    retryCounts.set(uuid, attempts);
                    queue.push(uuid);
                    if (window.DEBUG) console.log(`[uniscams] worker ${workerIdx + 1} retry ${attempts}/${MAX_RETRIES - 1}: ${uuid}`);
                } else {
                    failedPlayers.add(uuid);
                    loaded++;
                    if (window.DEBUG) console.log(`[uniscams] worker ${workerIdx + 1} gave up on ${uuid} after ${MAX_RETRIES} attempts`);
                }
            }

            if (typeof loadingText !== 'undefined' && loadingText) {
                loadingText.innerText = `Loading ${loaded}/${all.length}`;
            }

            showRetryBanner();
        }
        if (window.DEBUG) console.log(`[uniscams] worker ${workerIdx + 1} finished`);
    });

    const [discordResult] = await Promise.all([discordPromise, ...workers]);

    const loadMs = performance.now() - loadStart;
    const loadSec = (loadMs / 1000).toFixed(2);
    const success = all.length - failedPlayers.size;
    console.log(
        `[uniscams] loaded ${success}/${all.length} players in ${loadSec}s` +
        ` (${failedPlayers.size} failed)`
    );

    if (window.DEBUG) console.log(`[uniscams] renderPlayers() firing — painting ${players.size} players to DOM`);
    renderPlayers();
    showRetryBanner();

    if (typeof loadingScreen !== 'undefined' && loadingScreen) {
        loadingScreen.style.display = "none";
    }

    if (window.DEBUG) {
        const totalSec = ((performance.now() - totalStart) / 1000).toFixed(2);
        console.log(`[uniscams] total load time: ${totalSec}s (config + discord + crafty + render)`);
        console.log(`[uniscams] ── load report ──────────────────────────────`);
        console.log(`[uniscams]   players : ${success}/${all.length} ok, ${failedPlayers.size} failed  (${loadSec}s)`);
        if (discordResult) {
            console.log(`[uniscams]   discord : ${discordResult.successCount}/${discordResult.total} ok, ${discordResult.failCount} failed  (${discordResult.resolveSec}s)`);
        }
        const lsF = window._lsWriteFailures();
        const lsTotal = lsF.players + lsF.discord;
        console.log(`[uniscams]   localStorage : ${lsTotal === 0 ? "no write failures" : `${lsF.players} player + ${lsF.discord} discord write failures`}`);
        console.log(`[uniscams]   total   : ${totalSec}s`);
        console.log(`[uniscams] ─────────────────────────────────────────────`);
    }

    window.players = players;
    window.uuids = uuids;
    window.statsData = {
        uuids: uuids,
        altMap: altMap,
        manualAlts: manualAlts,
        discordLinks: discordLinks,
        serverTags: serverTags
    };

    if (window.renderStats) window.renderStats();

    setupSearchFilter();

    // Restore search query from URL (e.g. a shared ?q=playername link)
    const initialQuery = new URLSearchParams(window.location.search).get("q");
    if (initialQuery) {
        const searchInput = document.getElementById("player-search");
        if (searchInput) {
            searchInput.value = initialQuery;
            searchInput.dispatchEvent(new Event("input"));
        }
    }
}

/* RETRY PIPELINE LINKED TO RETRY BANNER */
async function retryFailedPlayers() {
    if (failedPlayers.size === 0) return;

    const queue = [...failedPlayers];
    failedPlayers.clear();

    const allAltUuids = Object.values(altMap).flat();
    const allCount = [...new Set([...uuids, ...allAltUuids])].length;
    let loaded = allCount - queue.length;

    const RATE_LIMITED = window._craftyRateLimited;

    if (typeof loadingScreen !== 'undefined' && loadingScreen) {
        loadingScreen.style.display = "block";
    }

    const workers = Array.from({ length: 3 }, async () => {
        const retryCounts = new Map();
        const MAX_RETRIES = 3;
        while (queue.length) {
            const pause = getRateLimitPause();
            if (pause) await pause;

            if (!queue.length) break;
            const uuid = queue.shift();
            const data = await fetchPlayer(uuid);

            if (data === RATE_LIMITED) {
                queue.push(uuid);
                continue;
            }

            if (data) {
                players.set(uuid, data);
                loaded++;
            } else {
                const attempts = (retryCounts.get(uuid) || 0) + 1;
                if (attempts < MAX_RETRIES) {
                    retryCounts.set(uuid, attempts);
                    queue.push(uuid);
                } else {
                    failedPlayers.add(uuid);
                    loaded++;
                }
            }

            if (typeof loadingText !== 'undefined' && loadingText) {
                loadingText.innerText = `Retrying ${loaded}/${allCount}`;
            }
            renderPlayers();
            showRetryBanner();
        }
    });

    await Promise.all(workers);

    if (typeof loadingScreen !== 'undefined' && loadingScreen) {
        loadingScreen.style.display = "none";
    }
    if (window.renderStats) window.renderStats();
}

/* SEARCH HIGHLIGHT ENGINE */
function highlightMatches(el, query) {
    el.querySelectorAll("mark.search-highlight").forEach(mark => {
        mark.replaceWith(mark.textContent);
    });
    el.normalize();

    if (!query) return;

    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);

    for (const node of nodes) {
        const text = node.textContent;
        const lower = text.toLowerCase();
        if (!lower.includes(query)) continue;

        const frag = document.createDocumentFragment();
        let last = 0;
        let idx;

        while ((idx = lower.indexOf(query, last)) !== -1) {
            if (idx > last) {
                frag.appendChild(document.createTextNode(text.slice(last, idx)));
            }
            const mark = document.createElement("mark");
            mark.className = "search-highlight";
            mark.textContent = text.slice(idx, idx + query.length);
            frag.appendChild(mark);
            last = idx + query.length;
        }

        if (last < text.length) {
            frag.appendChild(document.createTextNode(text.slice(last)));
        }

        node.replaceWith(frag);
    }
}

/* LIVE USER INTERACTION SEARCH ENGINE ARCHITECTURE */
function setupSearchFilter() {
    const searchInput = document.getElementById("player-search");
    if (!searchInput) return;

    const copyBtn = document.getElementById("copy-search-btn");

    if (copyBtn) {
        copyBtn.addEventListener("click", () => {
            navigator.clipboard.writeText(window.location.href).then(() => {
                copyBtn.textContent = "Copied!";
                setTimeout(() => { copyBtn.textContent = "Copy search link"; }, 2000);
            });
        });
    }

    searchInput.addEventListener("input", (e) => {
        const query = e.target.value.toLowerCase().trim();
        let visibleCount = 0;

        // Keep address bar in sync so the current search is always shareable
        const params = new URLSearchParams(window.location.search);
        if (query) {
            params.set("q", query);
        } else {
            params.delete("q");
        }
        const newUrl = params.toString()
            ? `${window.location.pathname}?${params}`
            : window.location.pathname;
        history.replaceState(null, "", newUrl);

        // Show/hide the copy button based on whether there's an active search
        if (copyBtn) {
            copyBtn.hidden = !query;
        }

        /* ========================================================
           PART A: FILTER STANDARD PLAYER CARDS (MAIN ACCOUNTS)
           ======================================================== */
        for (const mainUuid of uuids) {
            const card = container.querySelector(`[data-uuid="${mainUuid}"]`);
            if (!card) continue;

            if (query === "") {
                card.style.display = "";
                highlightMatches(card, "");

                const details = card.querySelectorAll("details");
                details.forEach(detail => {
                    detail.open = false;
                });
                
                visibleCount++;
                continue;
            }

            const main = players.get(mainUuid);
            if (!main) {
                card.style.display = "none";
                continue;
            }

            const matchMainName = main.username?.toLowerCase().includes(query);
            const matchMainUuid = main.uuid?.toLowerCase().includes(query);
            const matchHistory = (main.usernames || []).some(h =>
                h.username?.toLowerCase().includes(query)
            );

            const manual = manualAlts[mainUuid] || [];
            const matchManual = manual.some(m =>
                m.toLowerCase().includes(query)
            );

            const alts = altMap[mainUuid] || [];
            let matchKnownAlts = false;

            for (const altUuid of alts) {
                if (altUuid.toLowerCase().includes(query)) {
                    matchKnownAlts = true;
                    break;
                }

                const altProfile = players.get(altUuid);
                if (altProfile && altProfile.username?.toLowerCase().includes(query)) {
                    matchKnownAlts = true;
                    break;
                }
            }

            const discordIds = discordLinks[mainUuid] || [];
            let matchDiscord = false;

            for (const id of discordIds) {
                if (id.includes(query)) {
                    matchDiscord = true;
                    break;
                }

                const dUser = getDiscordUser(id);
                if (dUser) {
                    if (
                        dUser.username?.toLowerCase().includes(query) ||
                        dUser.global_name?.toLowerCase().includes(query)
                    ) {
                        matchDiscord = true;
                        break;
                    }
                }
            }

            const matches =
                matchMainName ||
                matchMainUuid ||
                matchHistory ||
                matchManual ||
                matchKnownAlts ||
                matchDiscord;

            card.style.display = matches ? "" : "none";
            if (matches) {
                highlightMatches(card, query);
                visibleCount++;
            }

            const details = card.querySelectorAll("details");
            details.forEach(detail => {
                detail.open = matches;
            });
        }

        /* ========================================================
           PART B: FILTER UNLINKED PLAYER CARDS (NO MAIN ACCOUNT)
           ======================================================== */
        const unlinkedCards = container.querySelectorAll(".player.unlinked-profile");
        
        unlinkedCards.forEach((card, idx) => {
            const entry = unlinked[idx];
            if (!entry) return;

            if (query === "") {
                card.style.display = "";
                highlightMatches(card, "");
                
                const details = card.querySelectorAll("details");
                details.forEach(detail => {
                    detail.open = false;
                });
                
                visibleCount++;
                return;
            }

            // Match structural criteria fields for unlinked array elements
            const matchName = entry.name?.toLowerCase().includes(query);
            const matchNote = entry.note?.toLowerCase().includes(query);
            
            // Normalize custom discord layout signatures
            let matchDiscord = false;
            const unlinkedDiscordIds = Array.isArray(entry.discordLinks) 
                ? entry.discordLinks.filter(Boolean) 
                : (entry.discordId ? [entry.discordId] : []);

            for (const id of unlinkedDiscordIds) {
                if (id.includes(query)) {
                    matchDiscord = true;
                    break;
                }
                const dUser = getDiscordUser(id);
                if (dUser) {
                    if (
                        dUser.username?.toLowerCase().includes(query) ||
                        dUser.global_name?.toLowerCase().includes(query)
                    ) {
                        matchDiscord = true;
                        break;
                    }
                }
            }

            const matches = matchName || matchNote || matchDiscord;

            card.style.display = matches ? "" : "none";
            if (matches) {
                highlightMatches(card, query);
                visibleCount++;
            }

            const details = card.querySelectorAll("details");
            details.forEach(detail => {
                detail.open = matches;
            });
        });

        /* ========================================================
           PART C: TOGGLE EMPTY STATE RESULTS CONTAINER
           ======================================================== */
        const noResults = document.getElementById("no-results");
        if (noResults) {
            noResults.hidden = visibleCount !== 0;
        }
    });

    const tabsContainer = document.querySelector(".tabs");
    if (tabsContainer) {
        tabsContainer.addEventListener("click", () => {
            setTimeout(() => {
                const listTab = document.getElementById("tab-list");
                if (listTab && listTab.classList.contains("active")) {
                    searchInput.focus();
                }
            }, 50);
        });
    }
}

/* LIFE-CYCLE REFRESH LISTENERS */
window.addEventListener("DOMContentLoaded", () => {
    initThemeToggle();

    const btn = document.getElementById("clear-cache-btn");
    if (btn) {
        btn.addEventListener("click", () => {
            const theme = localStorage.getItem(THEME_STORAGE_KEY);
            localStorage.clear();
            if (theme) localStorage.setItem(THEME_STORAGE_KEY, theme);
            location.reload();
        });
    }

    loadPlayers();
});
