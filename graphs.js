/* ========================================================
   GRAPH RENDERING FOR STATS TAB (graphs.js)
   ======================================================== */

function getStatsData() {
    return window.statsData;
}

let tooltip;

/* TOOLTIP SETUP */
function showTip(text, x, y) {
    if (!tooltip) {
        tooltip = document.createElement("div");

        tooltip.style = `
            position: fixed;
            background: rgba(0,0,0,0.85);
            color: white;
            padding: 6px 10px;
            border-radius: 6px;
            font-size: 12px;
            pointer-events: none;
            z-index: 99999;
            transition: opacity 0.1s ease;
        `;

        document.body.appendChild(tooltip);
    }

    tooltip.innerText = text;
    tooltip.style.left = x + "px";
    tooltip.style.top = y + "px";
    tooltip.style.opacity = "1";
}

function hideTip() {
    if (tooltip) {
        tooltip.style.opacity = "0";
    }
}

/* Normalise the inconsistent unlinked discord fields into a flat array of IDs */
function getUnlinkedDiscordIds(entry) {
    if (Array.isArray(entry.discordLinks)) {
        return entry.discordLinks.filter(Boolean);
    }
    if (entry.discordId) {
        return [entry.discordId];
    }
    return [];
}

/* Normalise the inconsistent unlinked alts field into a count */
function getUnlinkedAltCount(entry) {
    return Array.isArray(entry.alts) ? entry.alts.length : 0;
}

function renderStats() {
    const data = getStatsData();

    if (!data) return;

    // Shared data from app.js
    const playerMap = window.players || new Map();
    const unlinked  = window.unlinked || [];

    // Text container
    const textContainer = document.getElementById("statsText");

    if (textContainer) {
        textContainer.innerHTML = "";
    }

    /* ========================================================
       DATA PARSING ENGINE
       ======================================================== */

    let totalLinkedAlts = 0;

    // System detected alts (linked accounts only)
    Object.values(data.altMap).forEach(arr => {
        totalLinkedAlts += arr.length;
    });

    // Manual alts (linked accounts only)
    Object.values(data.manualAlts || {}).forEach(arr => {
        totalLinkedAlts += arr.length;
    });

    // Alts from unlinked entries
    unlinked.forEach(entry => {
        totalLinkedAlts += getUnlinkedAltCount(entry);
    });

    let discordCount = 0;

    Object.values(data.discordLinks).forEach(arr => {
        discordCount += arr.length;
    });

    // Discords from unlinked entries
    unlinked.forEach(entry => {
        discordCount += getUnlinkedDiscordIds(entry).length;
    });

    const absoluteScammers = data.uuids.length + unlinked.length;

    // Stats text
    if (textContainer) {
        textContainer.innerHTML = `
            <p>• <strong>Total:</strong> ${absoluteScammers + totalLinkedAlts}</p>
            <p>• <strong>Mains:</strong> ${absoluteScammers}</p>
            <p>• <strong>Alts:</strong> ${totalLinkedAlts}</p>
            <p>• <strong>Discords:</strong> ${discordCount}</p>
        `;
    }

    /* ========================================================
       ACCOUNT STATS BAR GRAPH
       ======================================================== */

    const statsBars = document.getElementById("statsBars");

    if (!statsBars) return;

    statsBars.innerHTML =
        "<canvas id='canvasStats' width='500' height='290'></canvas>";

    const cStats = document.getElementById("canvasStats");
    const ctxStats = cStats.getContext("2d");

    const metrics = [
        {
            label: "Total",
            val: absoluteScammers + totalLinkedAlts
        },
        {
            label: "Mains",
            val: absoluteScammers
        },
        {
            label: "Alts",
            val: totalLinkedAlts
        },
        {
            label: "Discords",
            val: discordCount
        }
    ];

    let maxMetric = 0;

    metrics.forEach(m => {
        if (m.val > maxMetric) {
            maxMetric = m.val;
        }
    });

    const statsBarW = cStats.width / metrics.length;

    metrics.forEach((m, i) => {

        const h =
            (m.val / (maxMetric || 1)) * 170;

        const x = i * statsBarW + 40;
        const y = 240 - h;

        // Bar
        ctxStats.fillStyle = "#176b5b";

        ctxStats.fillRect(
            x,
            y,
            statsBarW - 80,
            h
        );

        // Value text
        ctxStats.fillStyle = "#1f2520";
        ctxStats.font = "14px system-ui";
        ctxStats.textAlign = "center";

        ctxStats.fillText(
            m.val,
            x + (statsBarW - 80) / 2,
            y - 8
        );

        // Label
        ctxStats.fillStyle = "#6f746b";
        ctxStats.font = "12px system-ui";

        ctxStats.fillText(
            m.label,
            x + (statsBarW - 80) / 2,
            270
        );
    });

    cStats.onmousemove = e => {

        const rect =
            cStats.getBoundingClientRect();

        const idx = Math.floor(
            (e.clientX - rect.left) / statsBarW
        );

        const metric = metrics[idx];

        if (!metric) return;

        showTip(
            `${metric.label}: ${metric.val}`,
            e.clientX + 15,
            e.clientY + 15
        );
    };

    cStats.onmouseout = hideTip;

    /* ========================================================
       USERNAME CHANGE GRAPH
       ======================================================== */

    const usernameBars = document.getElementById("usernameBars");

    if (usernameBars) {

        usernameBars.innerHTML =
            "<canvas id='canvasUsernames' width='500' height='290'></canvas>";

        const cUsernames =
            document.getElementById("canvasUsernames");

        const ctxUsernames =
            cUsernames.getContext("2d");

        const usernameMetrics = {
            "0": 0,
            "1": 0,
            "2-5": 0,
            "6-10": 0,
            "11-20": 0,
            "21-30+": 0
        };

        // Parse username histories for linked players
        playerMap.forEach(player => {

            const history =
                player.usernames || [];

            const changes =
                Math.max(0, history.length - 1);

            if (changes === 0) {
                usernameMetrics["0"]++;
            } else if (changes === 1) {
                usernameMetrics["1"]++;
            } else if (changes >= 2 && changes <= 5) {
                usernameMetrics["2-5"]++;
            } else if (changes >= 6 && changes <= 10) {
                usernameMetrics["6-10"]++;
            } else if (changes >= 11 && changes <= 20) {
                usernameMetrics["11-20"]++;
            } else if (changes >= 21) {
                usernameMetrics["21-30+"]++;
            }
        });

        // Unlinked players have no crafty profile, so 0 known name changes each
        usernameMetrics["0"] += unlinked.length;

        const usernameEntries =
            Object.entries(usernameMetrics).map(
                ([label, val]) => ({
                    label,
                    val
                })
            );

        let maxUsernameMetric = 0;

        usernameEntries.forEach(entry => {

            if (entry.val > maxUsernameMetric) {
                maxUsernameMetric = entry.val;
            }
        });

        const usernameBarW =
            cUsernames.width /
            usernameEntries.length;

        usernameEntries.forEach((m, i) => {

            const h =
                (m.val / (maxUsernameMetric || 1)) * 170;

            const x =
                i * usernameBarW + 20;

            const y =
                240 - h;

            // Bar
            ctxUsernames.fillStyle = "#a15c00";

            ctxUsernames.fillRect(
                x,
                y,
                usernameBarW - 40,
                h
            );

            // Value text
            ctxUsernames.fillStyle = "#1f2520";
            ctxUsernames.font = "14px system-ui";
            ctxUsernames.textAlign = "center";

            ctxUsernames.fillText(
                m.val,
                x + (usernameBarW - 40) / 2,
                y - 8
            );

            // Label text
            ctxUsernames.fillStyle = "#6f746b";
            ctxUsernames.font = "12px system-ui";

            ctxUsernames.fillText(
                m.label,
                x + (usernameBarW - 40) / 2,
                270
            );
        });

        cUsernames.onmousemove = e => {

            const rect =
                cUsernames.getBoundingClientRect();

            const idx = Math.floor(
                (e.clientX - rect.left) /
                usernameBarW
            );

            const metric =
                usernameEntries[idx];

            if (!metric) return;

            showTip(
                `${metric.label}: ${metric.val}`,
                e.clientX + 15,
                e.clientY + 15
            );
        };

        cUsernames.onmouseout = hideTip;
    }

    /* ========================================================
       ALT ASSOCIATION GRAPH
       ======================================================== */

    const altBars = document.getElementById("altBars");

    if (altBars) {

        altBars.innerHTML =
            "<canvas id='canvasAlts' width='500' height='290'></canvas>";

        const cAlts =
            document.getElementById("canvasAlts");

        const ctxAlts =
            cAlts.getContext("2d");

        const altMetrics = {
            "0": 0,
            "1": 0,
            "2": 0,
            "3": 0,
            "4": 0,
            "5+": 0
        };

        // Count alt associations per linked main account
        data.uuids.forEach(uuid => {

            let altCount = 0;

            if (data.altMap[uuid]) {
                altCount += data.altMap[uuid].length;
            }

            if (data.manualAlts &&
                data.manualAlts[uuid]) {
                altCount +=
                    data.manualAlts[uuid].length;
            }

            if (altCount >= 5) {
                altMetrics["5+"]++;
            } else {
                altMetrics[String(altCount)]++;
            }
        });

        // Count alt associations for unlinked entries
        unlinked.forEach(entry => {
            const altCount = getUnlinkedAltCount(entry);
            if (altCount >= 5) {
                altMetrics["5+"]++;
            } else {
                altMetrics[String(altCount)]++;
            }
        });

        const altEntries =
            Object.entries(altMetrics).map(
                ([label, val]) => ({
                    label,
                    val
                })
            );

        let maxAltMetric = 0;

        altEntries.forEach(entry => {

            if (entry.val > maxAltMetric) {
                maxAltMetric = entry.val;
            }
        });

        const altBarW =
            cAlts.width /
            altEntries.length;

        altEntries.forEach((m, i) => {

            const h =
                (m.val / (maxAltMetric || 1)) * 170;

            const x =
                i * altBarW + 20;

            const y =
                240 - h;

            // Bar
            ctxAlts.fillStyle = "#b43d31";

            ctxAlts.fillRect(
                x,
                y,
                altBarW - 40,
                h
            );

            // Value text
            ctxAlts.fillStyle = "#1f2520";
            ctxAlts.font = "14px system-ui";
            ctxAlts.textAlign = "center";

            ctxAlts.fillText(
                m.val,
                x + (altBarW - 40) / 2,
                y - 8
            );

            // Label
            ctxAlts.fillStyle = "#6f746b";
            ctxAlts.font = "12px system-ui";

            ctxAlts.fillText(
                m.label,
                x + (altBarW - 40) / 2,
                270
            );
        });

        cAlts.onmousemove = e => {

            const rect =
                cAlts.getBoundingClientRect();

            const idx = Math.floor(
                (e.clientX - rect.left) /
                altBarW
            );

            const metric =
                altEntries[idx];

            if (!metric) return;

            showTip(
                `${metric.label} alts: ${metric.val}`,
                e.clientX + 15,
                e.clientY + 15
            );
        };

        cAlts.onmouseout = hideTip;
    }

    /* ========================================================
       SERVER DISTRIBUTION GRAPH
       ======================================================== */

    const serverBars = document.getElementById("serverBars");

    if (!serverBars) return;

    serverBars.innerHTML =
        "<canvas id='canvasServers' width='500' height='290'></canvas>";

    const cServers = document.getElementById("canvasServers");
    const ctxServers = cServers.getContext("2d");

    const imgToName = {
        "unez.png": "Uneasy Vanilla",
        "sv.png":   "Simply Vanilla",
        "axn.png":  "Anarchy Network",
        "pv.png":   "Purity Vanilla",
        "rv.png":   "Refined Vanilla"
    };

    const counts = {};

    // Linked players
    Object.entries(data.serverTags).forEach(([uuid, info]) => {

        if (!info.img) return;

        counts[info.img] =
            (counts[info.img] || 0) + 1;
    });

    // Unlinked players — each has a tags array with one or more {img, link} entries
    unlinked.forEach(entry => {
        (entry.tags || []).forEach(tag => {
            if (!tag.img) return;
            counts[tag.img] = (counts[tag.img] || 0) + 1;
        });
    });

    const entries = Object.entries(counts);

    let maxS = 0;

    entries.forEach(([_, v]) => {
        if (v > maxS) {
            maxS = v;
        }
    });

    const padding = 40;
    const gap = 20;

    const usableWidth =
        cServers.width - padding * 2;

    const barW = Math.min(
        120,
        (
            usableWidth -
            (entries.length - 1) * gap
        ) / (entries.length || 1)
    );

    entries.forEach(([imgSrc, v], i) => {

        const h =
            (v / (maxS || 1)) * 170;

        const x =
            padding + i * (barW + gap);

        const y =
            240 - h;

        // Bar
        ctxServers.fillStyle = "#176b5b";

        ctxServers.fillRect(
            x,
            y,
            barW,
            h
        );

        // Value text
        ctxServers.fillStyle = "#1f2520";
        ctxServers.font = "14px system-ui";
        ctxServers.textAlign = "center";

        ctxServers.fillText(
            v,
            x + barW / 2,
            y - 8
        );

        // Server icon
        const img = new Image();

        img.src = imgSrc;

        img.onload = () => {

            const imgX =
                x + barW / 2 - 12;

            ctxServers.drawImage(
                img,
                imgX,
                252,
                24,
                24
            );
        };
    });

    cServers.onmousemove = e => {

        const rect =
            cServers.getBoundingClientRect();

        const mouseX =
            e.clientX - rect.left - padding;

        const idx = Math.floor(
            mouseX / (barW + gap)
        );

        const e2 = entries[idx];

        if (!e2) return;

        showTip(
            `${imgToName[e2[0]] || e2[0]}: ${e2[1]}`,
            e.clientX + 15,
            e.clientY + 15
        );
    };

    cServers.onmouseout = hideTip;
}
