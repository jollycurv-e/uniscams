/* ========================================================
   UI & RENDERING LAYER (ui.js)
   ======================================================== */

// Initialize variables
let container;
let loadingScreen;
let loadingText;

/* HELPER: Ensure DOM elements are initialized */
function initUI() {
    if (!container) container = document.getElementById("players");
    if (!loadingScreen) loadingScreen = document.getElementById("loading-screen");
    if (!loadingText) loadingText = document.getElementById("loading-text");
}

function serverLabelForImage(img) {
    const registry = window.SERVER_REGISTRY || [];
    const match = registry.find(server => server.img === img);
    return match ? match.label : "Source server";
}

function renderServerBadge(tag, fallbackLabel = "Source server") {
    if (!tag?.img) return "";

    const label = tag.label || serverLabelForImage(tag.img) || fallbackLabel;
    const image = `<img src="${tag.img}" class="server-badge" alt="${label} source badge">`;

    if (tag.link) {
        return `
            <a
                href="${tag.link}"
                target="_blank"
                rel="noopener"
                class="server-badge-link"
                aria-label="Open ${label} source list"
            >
                ${image}
            </a>
        `;
    }

    return `<span class="server-badge-static" aria-label="${label} source">${image}</span>`;
}

function updateSummaryMetrics() {
    const mainsEl = document.getElementById("summary-mains");
    const altsEl = document.getElementById("summary-alts");
    const serversEl = document.getElementById("summary-servers");
    if (!mainsEl || !altsEl || !serversEl) return;

    const unlinkedCount = (window.unlinked || []).length;
    let altCount = 0;

    Object.values(altMap || {}).forEach(arr => {
        if (Array.isArray(arr)) altCount += arr.length;
    });
    Object.values(manualAlts || {}).forEach(arr => {
        if (Array.isArray(arr)) altCount += arr.length;
    });
    (window.unlinked || []).forEach(entry => {
        if (Array.isArray(entry.alts)) altCount += entry.alts.length;
    });

    const serverCount = new Set([
        ...Object.values(serverTags || {}).map(t => t.img).filter(Boolean),
        ...(window.unlinked || []).flatMap(e => (e.tags || []).map(t => t.img).filter(Boolean))
    ]).size;

    mainsEl.textContent = String((uuids || []).length + unlinkedCount);
    altsEl.textContent = String(altCount);
    serversEl.textContent = String(serverCount);
}

/* UPDATE RETRY BANNER */
function showRetryBanner() {
    let el = document.getElementById("retry-banner");

    if (failedPlayers.size === 0) {
        if (el) el.remove();
        return;
    }

    if (!el) {
        el = document.createElement("div");
        el.id = "retry-banner";

        // Bound to global handler in app.js
        el.onclick = retryFailedPlayers;

        document.body.appendChild(el);
    }

    el.innerText = `Retry ${failedPlayers.size} failed players`;
}

/* RENDER MAIN PLAYER CARDS AND TABS */
function renderPlayers() {
    initUI();

    if (!container) return;

    container.innerHTML = "";

    for (const mainUuid of uuids) {
        const main = players.get(mainUuid);

        if (!main) continue;

        const card = document.createElement("div");
        card.className = "player";
        card.dataset.uuid = mainUuid;

        const head = `https://mc-heads.net/head/${mainUuid}.png`;

        /* =========================
           SERVER BADGES
           ========================= */

        const serverTag = serverTags[mainUuid];

        const serverBadgeHTML = renderServerBadge(serverTag, "Source server");

        /* =========================
           USERNAME HISTORY
           ========================= */

        const usernames = main.usernames || [];

        let usernameHistoryHTML = "";

        if (usernames.length) {
            usernameHistoryHTML = `
                <details class="section">
                    <summary>Username History (${usernames.length})</summary>

                    <div class="alt-entry">
                        ${usernames.map(entry => {

                            const raw =
                                entry.changed_at ??
                                entry.changedAt ??
                                entry.timestamp ??
                                entry.time ??
                                null;

                            let dateStr = "";

                            if (raw) {
                                const d = new Date(raw);

                                if (!isNaN(d)) {
                                    dateStr = d.toLocaleDateString(undefined, {
                                        year: "numeric",
                                        month: "short",
                                        day: "numeric"
                                    });
                                }
                            }

                            return `
                                <div class="alt-row alt-row-between">
                                    <div>${entry.username}</div>

                                    ${
                                        dateStr
                                            ? `<div class="uuid">${dateStr}</div>`
                                            : ""
                                    }
                                </div>
                            `;
                        }).join("")}
                    </div>
                </details>
            `;
        }

        /* =========================
           LINKED ALTS
           ========================= */

        const alts = altMap[mainUuid] || [];

        let knownAltHTML = "";

        if (alts.length) {
            knownAltHTML = `
                <details class="section">
                    <summary>Alts (${alts.length})</summary>

                    <div class="alt-entry">
                        ${alts.map(altUuid => {

                            const altProfile = players.get(altUuid);

                            const altHead =
                                `https://mc-heads.net/head/${altUuid}.png`;

                            if (!altProfile) {
                                return `
                                    <div class="alt-row">
                                        <span class="uuid">
                                            Loading: ${altUuid}
                                        </span>
                                    </div>
                                `;
                            }

                            return `
                                <div class="alt-row">
                                    <img
                                        src="${altHead}"
                                        class="alt-head"
                                        alt="${altProfile.username} Minecraft head"
                                    >

                                    <div>
                                        <div>${altProfile.username}</div>
                                        <div class="uuid">${altProfile.uuid}</div>
                                    </div>
                                </div>
                            `;
                        }).join("")}
                    </div>
                </details>
            `;
        }

        /* =========================
           MANUAL ALTS
           ========================= */

        const manuals = manualAlts[mainUuid] || [];

        let manualAltHTML = "";

        if (manuals.length) {
            manualAltHTML = `
                <details class="section">
                    <summary>Manual Alts (${manuals.length})</summary>

                    <div class="alt-entry">
                        ${manuals.map(name => `
                            <div class="alt-row">${name}</div>
                        `).join("")}
                    </div>
                </details>
            `;
        }

        /* =========================
           DISCORD ACCOUNTS
           ========================= */

        const discordIds = discordLinks[mainUuid] || [];

        let discordHTML = "";

        if (discordIds.length) {
            discordHTML = `
                <details class="section">
                    <summary>Discord Accounts (${discordIds.length})</summary>

                    <div class="alt-entry">
                        ${discordIds.map(id => {

                            const dUser = getDiscordUser(id);

                            const avatar =
                                dUser ? getDiscordAvatar(dUser) : "";

                            const displayName = dUser
                                ? (dUser.global_name || dUser.username || id)
                                : id;

                            const username = dUser?.username || "";

                            return `
                                <div class="discord-card">

                                    ${
                                        avatar
                                            ? `
                                                <img
                                                    class="discord-avatar"
                                                    src="${avatar}"
                                                    width="40"
                                                    height="40"
                                                >
                                            `
                                            : `
                                                <div class="discord-avatar"></div>
                                            `
                                    }

                                    <div class="discord-info">
                                        <a
                                            href="https://discord.com/users/${id}"
                                            target="_blank"
                                        >
                                            ${displayName}
                                            ${
                                                username &&
                                                username !== displayName
                                                    ? ` (@${username})`
                                                    : ""
                                            }
                                        </a>

                                        <span class="discord-id">${id}</span>
                                    </div>
                                </div>
                            `;
                        }).join("")}
                    </div>
                </details>
            `;
        }

        /* =========================
           CARD HTML
           ========================= */

        card.innerHTML = `
            <div class="player-header">

                <img
                    src="${head}"
                    class="player-head"
                    alt="${main.username} Minecraft head"
                >

                <div class="player-title">
                    <div class="username">${main.username}</div>
                    <div class="uuid">${main.uuid}</div>
                </div>

                ${serverBadgeHTML}
            </div>

            ${knownAltHTML}
            ${manualAltHTML}
            ${discordHTML}
            ${usernameHistoryHTML}
        `;

        container.appendChild(card);
    }

    renderUnlinkedPlayers();
    renderFailedPlayers();

    // Update the "X players listed" count line above the list
    const countEl = document.getElementById("player-count");
    if (countEl) {
        const total = (uuids || []).length + (window.unlinked || []).length;
        const failed = failedPlayers.size;
        const serverCount = new Set([
            ...Object.values(serverTags || {}).map(t => t.img).filter(Boolean),
            ...(window.unlinked || []).flatMap(e => (e.tags || []).map(t => t.img).filter(Boolean))
        ]).size;
        const baseText = `${total} known scammers across ${serverCount} server${serverCount !== 1 ? "s" : ""}`;
        countEl.textContent = failed > 0
            ? `${baseText}  •  ${failed} failed to load`
            : baseText;
    }

    updateSummaryMetrics();
}

/* ========================================================
   RENDER UNLINKED / AMBIGUOUS PROFILES
   ======================================================== */

function renderUnlinkedPlayers() {
    initUI();

    const unlinkedDataArray = window.unlinked || [];

    if (!container || !unlinkedDataArray.length) return;

    for (const entry of unlinkedDataArray) {

        const card = document.createElement("div");

        card.className = "player unlinked-profile";

        const displayName = entry.name || "Unknown Player";

        const discordIds = entry.discordLinks || [];

        const note = entry.note || "";

        /* =========================
           TAGS / BADGES
           ========================= */

        const tags = entry.tags || [];

        const tagHTML = tags.length
            ? `<div class="unlinked-badges">${tags.map(tag => renderServerBadge(tag, "Source server")).join("")}</div>`
            : "";

        /* =========================
           UNLINKED ALTS
           ========================= */

        const unlinkedAlts = entry.alts || [];

        let unlinkedAltHTML = "";

        if (unlinkedAlts.length) {
            unlinkedAltHTML = `
                <details class="section">
                    <summary>Possible Alts (${unlinkedAlts.length})</summary>

                    <div class="alt-entry">
                        ${unlinkedAlts.map(alt => `
							<div class="alt-row">
								${
									typeof alt === "string"
										? alt
										: (alt.name || alt.username || alt.uuid || "Unknown Alt")
								}
							</div>
						`).join("")}
                    </div>
                </details>
            `;
        }

        /* =========================
           DISCORD ACCOUNT
           ========================= */

        let discordHTML = "";

        if (discordIds.length) {

            discordHTML = `
                <details class="section">
                    <summary>Discord Accounts (${discordIds.length})</summary>

                    <div class="alt-entry">
                        ${discordIds.map(id => {

                            const dUser = getDiscordUser(id);

                            const avatar =
                                dUser ? getDiscordAvatar(dUser) : "";

                            const displayName = dUser
                                ? (dUser.global_name || dUser.username || id)
                                : id;

                            const username = dUser?.username || "";

                            return `
                                <div class="discord-card">

                                    ${
                                        avatar
                                            ? `
                                                <img
                                                    class="discord-avatar"
                                                    src="${avatar}"
                                                    width="40"
                                                    height="40"
                                                >
                                            `
                                            : `
                                                <div class="discord-avatar"></div>
                                            `
                                    }

                                    <div class="discord-info">
                                        <a
                                            href="https://discord.com/users/${id}"
                                            target="_blank"
                                        >
                                            ${displayName}
                                            ${
                                                username &&
                                                username !== displayName
                                                    ? ` (@${username})`
                                                    : ""
                                            }
                                        </a>

                                        <span class="discord-id">${id}</span>
                                    </div>
                                </div>
                            `;
                        }).join("")}
                    </div>
                </details>
            `;
        }

        /* =========================
           METADATA
           ========================= */

        let metadataHTML = `
            <details class="section">
                <summary>Unlinked Metadata</summary>

                <div class="alt-entry">

                    ${
                        note
                            ? `
                                <div class="alt-row">
                                    <div>
                                        <div>Note</div>
                                        <div class="uuid">${note}</div>
                                    </div>
                                </div>
                            `
                            : ""
                    }

                </div>
            </details>
        `;

        /* =========================
           FINAL CARD
           ========================= */

        card.innerHTML = `
            <div class="player-header">

                <div class="unknown-head">?</div>

                <div class="player-title">
                    <div class="username">${displayName}</div>

                    <div class="uuid">
                        No confirmed Minecraft main account
                    </div>
                </div>

                ${tagHTML}
            </div>

            ${unlinkedAltHTML}
            ${discordHTML}
            ${metadataHTML}
        `;

        container.appendChild(card);
    }
}

/* ========================================================
   RENDER ARCHIVES TAB
   ======================================================== */

function renderArchives() {
    const archiveGrid = document.getElementById("archive-grid");
    if (!archiveGrid) return;

    // Already rendered
    if (archiveGrid.children.length > 0) return;

    const registry = window.SERVER_REGISTRY || [];

    registry.forEach(server => {
        const archivePath = `./archives/${server.shortName}_scammer_list.zip`;

        const card = document.createElement("div");
        card.className = "archive-card archive-checking";

        card.innerHTML = `
            <img
                src="${server.img}"
                class="archive-server-img"
                alt="${server.label}"
            >
            <div class="archive-label">${server.label}</div>
            <span class="archive-na-badge">Checking...</span>
        `;

        archiveGrid.appendChild(card);

        // Probe whether the archive file actually exists
        fetch(archivePath, { method: "HEAD", cache: "no-store" })
            .then(res => {
                card.classList.remove("archive-checking");
                const badge = card.querySelector(".archive-na-badge");
                if (res.ok) {
                    if (badge) badge.remove();
                    const btn = document.createElement("a");
                    btn.className = "archive-dl-btn";
                    btn.href = archivePath;
                    btn.download = "";
                    btn.textContent = "Download ZIP";
                    card.appendChild(btn);
                } else {
                    card.classList.add("archive-unavailable");
                    if (badge) badge.textContent = "Not yet available";
                }
            })
            .catch(() => {
                card.classList.remove("archive-checking");
                card.classList.add("archive-unavailable");
                const badge = card.querySelector(".archive-na-badge");
                if (badge) badge.textContent = "Not yet available";
            });
    });
}

/* ========================================================
   RENDER PLACEHOLDER CARDS FOR FAILED PLAYERS
   ======================================================== */
function renderFailedPlayers() {
    initUI();

    if (!container) return;

    if (!failedPlayers || failedPlayers.size === 0) return;

    for (const uuid of failedPlayers) {
        // Don't double-render if a card already exists (e.g. after retry)
        if (container.querySelector(`[data-uuid="${uuid}"]`)) continue;

        const card = document.createElement("div");
        card.className = "player failed-profile";
        card.dataset.uuid = uuid;

        card.innerHTML = `
            <div class="player-header">
                <div class="unknown-head">?</div>

                <div class="player-title">
                    <div class="username">Failed to load</div>
                    <div class="uuid">${uuid}</div>
                </div>
            </div>
        `;

        container.appendChild(card);
    }
}
