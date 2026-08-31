import { initializeApp }   from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getFirestore, collection, query, orderBy, getDocs, where, limit, getDoc, doc }
                           from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

// ── CONFIG FIREBASE (identique à script.js) ──────────────────────
const firebaseConfig = {
    apiKey:            "AIzaSyDoGmIzJVldQn9GugOX3ip75BCES9h2kIg",
    authDomain:        "quiz-multi-domaines.firebaseapp.com",
    projectId:         "quiz-multi-domaines",
    storageBucket:     "quiz-multi-domaines.firebasestorage.app",
    messagingSenderId: "930782855205",
    appId:             "1:930782855205:web:84b2472e987a64d6c73fcc"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ── MOT DE PASSE ADMIN ───────────────────────────────────────────
// Le mot de passe est stocké dans Firestore : collection "config" > document "admin" > champ "password"
// Il n'est jamais visible dans le code source.

// ── ÉTAT ─────────────────────────────────────────────────────────
let allScores      = [];
let filteredScores = [];
let currentPage    = 1;
const PAGE_SIZE    = 20;

let allAbandons    = [];
let abandonsPage   = 1;
const ABANDONS_PAGE_SIZE = 20;

const NOM_DOMAINES = {
    informatique:     "Informatique",
    droit:            "Droit",
    medecine:         "Médecine",
    capitales_pays:   "Capitales & Pays",
    culture_generale: "Culture générale",
    langues:          "Langues",
    psychologie:      "Psychologie",
    astronomie:       "Astronomie",
    programmation:    "Développement Web",
    reseaux:          "Réseaux & Systèmes",
    capitales:        "Capitales du monde",
    pays:             "Drapeaux du monde",
    francais:         "Langue française",
    anglais:          "Langue anglaise",
    dinosaures:       "Dinosaures & Préhistoire",
};

const DOMAINE_ICONS = {
    informatique:     "computer",
    droit:            "gavel",
    medecine:         "medical_services",
    capitales_pays:   "public",
    culture_generale: "auto_stories",
    langues:          "translate",
    psychologie:      "psychology",
    astronomie:       "rocket_launch",
    dinosaures:       "skull",
};

// ── LOGIN ─────────────────────────────────────────────────────────
document.getElementById('admin-login-btn').addEventListener('click', handleLogin);
document.getElementById('admin-pwd').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
});

document.getElementById('pwd-toggle-btn').addEventListener('click', () => {
    const input = document.getElementById('admin-pwd');
    const icon  = document.getElementById('pwd-toggle-icon');
    if (input.type === 'password') {
        input.type = 'text';
        icon.textContent = 'visibility_off';
    } else {
        input.type = 'password';
        icon.textContent = 'visibility';
    }
});

async function handleLogin() {
    const pwd     = document.getElementById('admin-pwd').value.trim();
    const btn     = document.getElementById('admin-login-btn');
    const errEl   = document.getElementById('login-error');

    if (!pwd) return;

    // Afficher un état de chargement pendant la vérification Firebase
    btn.textContent = 'Vérification…';
    btn.disabled    = true;
    errEl.style.display = 'none';

    try {
        const snap = await getDoc(doc(db, 'config', 'admin'));
        const adminPassword = snap.exists() ? snap.data().password : null;

        if (adminPassword && pwd === adminPassword) {
            document.getElementById('login-admin').style.display = 'none';
            document.getElementById('dashboard').style.display = 'block';
            loadAllData();
        } else {
            errEl.style.display = 'block';
            document.getElementById('admin-pwd').value = '';
        }
    } catch (e) {
        console.error('Erreur vérification mot de passe :', e);
        errEl.textContent  = 'Erreur de connexion. Réessayez.';
        errEl.style.display = 'block';
    }

    btn.textContent = 'Se connecter';
    btn.disabled    = false;
}

document.getElementById('btn-logout').addEventListener('click', () => {
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('login-admin').style.display = 'flex';
    document.getElementById('admin-pwd').value = '';
});

document.getElementById('btn-refresh').addEventListener('click', loadAllData);

// ── CHARGEMENT FIREBASE ───────────────────────────────────────────
async function loadAllData() {
    document.getElementById('btn-refresh').querySelector('.material-symbols-outlined').style.animation = 'spin 1s linear infinite';

    try {
        const snap = await getDocs(
            query(collection(db, "Score"), orderBy("ts", "desc"))
        );
        allScores = snap.docs.map(d => d.data());

        const now = new Date();
        document.getElementById('last-update').textContent =
            'Mis à jour à ' + now.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

        renderKPIs();
        renderFrequentation();
        renderDomains();
        renderPays();
        renderInactifs();
        renderProfilJoueurs();
        applyFilters();
        await loadAbandons();
        await loadReponses();

    } catch(e) {
        console.error(e);
    }

    document.getElementById('btn-refresh').querySelector('.material-symbols-outlined').style.animation = '';
}

// ── FRÉQUENTATION ────────────────────────────────────────────────
let currentFreqPeriod = 'day';

// Initialiser les onglets de période
document.querySelectorAll('.freq-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        currentFreqPeriod = btn.dataset.period;
        document.querySelectorAll('.freq-tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderFrequentation();
    });
});

function getDateBounds(period) {
    const now   = new Date();
    const start = new Date();

    if (period === 'day') {
        start.setHours(0, 0, 0, 0);
    } else if (period === 'week') {
        const day = start.getDay(); // 0=dim
        start.setDate(start.getDate() - ((day + 6) % 7)); // lundi
        start.setHours(0, 0, 0, 0);
    } else if (period === 'month') {
        start.setDate(1);
        start.setHours(0, 0, 0, 0);
    } else if (period === 'year') {
        start.setMonth(0, 1);
        start.setHours(0, 0, 0, 0);
    } else {
        return null; // 'all'
    }
    return { start, end: now };
}

function filterByPeriod(scores, period) {
    const bounds = getDateBounds(period);
    if (!bounds) return scores;
    return scores.filter(s => {
        if (!s.ts) return false;
        const d = s.ts.toDate ? s.ts.toDate() : new Date(s.ts);
        return d >= bounds.start && d <= bounds.end;
    });
}

function renderFrequentation() {
    if (allScores.length === 0) return;

    const filtered = filterByPeriod(allScores, currentFreqPeriod);

    // KPIs fréquentation
    document.getElementById('freq-parties').textContent = filtered.length.toLocaleString('fr');
    const uniques = new Set(filtered.map(s => (s.name || '').toLowerCase())).size;
    document.getElementById('freq-joueurs').textContent = uniques.toLocaleString('fr');
    const moyPct = filtered.length
        ? Math.round(filtered.reduce((a, s) => a + (parseInt(s.pct) || 0), 0) / filtered.length)
        : 0;
    document.getElementById('freq-score').textContent = filtered.length ? moyPct + '%' : '—';
    const pays = new Set(filtered.filter(s => s.countryCode).map(s => s.countryCode)).size;
    document.getElementById('freq-pays').textContent = pays || '—';

    // Graphe barres
    renderFreqChart();
}

function renderFreqChart() {
    const barsEl = document.getElementById('freq-bars');
    const titleEl = document.getElementById('freq-chart-title');

    // Construire les buckets selon la période
    let buckets = [];

    if (currentFreqPeriod === 'day') {
        // Toujours afficher les 24h complètes (0h → 23h)
        titleEl.textContent = "Activité par heure aujourd'hui";
        const now = new Date();
        for (let h = 0; h < 24; h++) {
            const label = h + 'h';
            const count = allScores.filter(s => {
                if (!s.ts) return false;
                const d = s.ts.toDate ? s.ts.toDate() : new Date(s.ts);
                return d.toDateString() === now.toDateString() && d.getHours() === h;
            }).length;
            buckets.push({ label, count, isFuture: h > now.getHours() });
        }
    } else if (currentFreqPeriod === 'week') {
        titleEl.textContent = 'Activité des 7 derniers jours';
        const jours = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
        const now = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const label = jours[(d.getDay() + 6) % 7];
            const count = allScores.filter(s => {
                if (!s.ts) return false;
                const sd = s.ts.toDate ? s.ts.toDate() : new Date(s.ts);
                return sd.toDateString() === d.toDateString();
            }).length;
            buckets.push({ label, count });
        }
    } else if (currentFreqPeriod === 'month') {
        titleEl.textContent = 'Activité par semaine ce mois';
        const now = new Date();
        const year = now.getFullYear(), month = now.getMonth();
        // Semaines du mois (S1..S5)
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        for (let w = 1; w <= 5; w++) {
            const from = (w - 1) * 7 + 1;
            const to   = Math.min(w * 7, daysInMonth);
            if (from > daysInMonth) break;
            const label = 'S' + w;
            const count = allScores.filter(s => {
                if (!s.ts) return false;
                const d = s.ts.toDate ? s.ts.toDate() : new Date(s.ts);
                return d.getFullYear() === year && d.getMonth() === month
                    && d.getDate() >= from && d.getDate() <= to;
            }).length;
            buckets.push({ label, count });
        }
    } else if (currentFreqPeriod === 'year') {
        titleEl.textContent = 'Activité par mois cette année';
        const mois = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Aoû','Sep','Oct','Nov','Déc'];
        const year = new Date().getFullYear();
        const nowMonth = new Date().getMonth();
        for (let m = 0; m <= nowMonth; m++) {
            const label = mois[m];
            const count = allScores.filter(s => {
                if (!s.ts) return false;
                const d = s.ts.toDate ? s.ts.toDate() : new Date(s.ts);
                return d.getFullYear() === year && d.getMonth() === m;
            }).length;
            buckets.push({ label, count });
        }
    } else {
        // all — par année
        titleEl.textContent = 'Activité par année (total)';
        const years = {};
        allScores.forEach(s => {
            if (!s.ts) return;
            const d = s.ts.toDate ? s.ts.toDate() : new Date(s.ts);
            const y = d.getFullYear();
            years[y] = (years[y] || 0) + 1;
        });
        Object.keys(years).sort().forEach(y => {
            buckets.push({ label: y, count: years[y] });
        });
    }

    if (buckets.length === 0) {
        barsEl.innerHTML = `<div class="empty-msg" style="padding:20px 0;width:100%">
            <span class="material-symbols-outlined" style="animation:none;font-size:28px">bar_chart_off</span>
            Aucune donnée pour cette période.
        </div>`;
        return;
    }

    const maxCount = Math.max(...buckets.map(b => b.count), 1);

    // Pour le mode 24h, on force une largeur min par colonne pour le scroll horizontal
    const is24h = currentFreqPeriod === 'day';
    const scrollWrap = document.getElementById('freq-bars-scroll-wrap');
    if (scrollWrap) {
        scrollWrap.style.overflowX = is24h ? 'auto' : 'visible';
        scrollWrap.style.webkitOverflowScrolling = is24h ? 'touch' : '';
        barsEl.style.minWidth = is24h ? (buckets.length * 36) + 'px' : '';
    }

    barsEl.innerHTML = buckets.map(b => {
        const pct = Math.max(Math.round((b.count / maxCount) * 100), b.count > 0 ? 4 : 0);
        const isFuture = b.isFuture || false;
        const barStyle = isFuture
            ? `height:${Math.max(pct,0)}%;opacity:0.18;background:var(--border-color)`
            : `height:${pct}%`;
        return `<div class="freq-bar-col${isFuture ? ' freq-bar-future' : ''}">
            <div class="freq-bar-count">${b.count > 0 && !isFuture ? b.count : ''}</div>
            <div class="freq-bar" style="${barStyle}" title="${b.label} : ${isFuture ? 'à venir' : b.count + ' partie(s)'}"></div>
            <div class="freq-bar-label">${b.label}</div>
        </div>`;
    }).join('');
}

// ── KPI ───────────────────────────────────────────────────────────
function renderKPIs() {
    document.getElementById('kpi-joueurs').textContent = allScores.length.toLocaleString('fr');

    const uniques = new Set(allScores.map(s => s.name.toLowerCase())).size;
    document.getElementById('kpi-uniques').textContent = uniques.toLocaleString('fr');

    const moyennePct = allScores.length
        ? Math.round(allScores.reduce((a, s) => a + (parseInt(s.pct) || 0), 0) / allScores.length)
        : 0;
    document.getElementById('kpi-score-moyen').textContent = moyennePct + '%';

    if (allScores.length) {
        const best = allScores.reduce((a, b) => (parseInt(b.pct) || 0) > (parseInt(a.pct) || 0) ? b : a);
        document.getElementById('kpi-best').textContent = best.pct + '%';
        document.getElementById('kpi-best-name').textContent = best.name + ' · ' + (NOM_DOMAINES[best.domain] || best.domain);
    }

    // KPI abandons — mis à jour après loadAbandons()
    renderAbandonsKPI();
}

function renderAbandonsKPI() {
    const kpiEl  = document.getElementById('kpi-abandons');
    const subEl  = document.getElementById('kpi-abandons-sub');
    if (!kpiEl) return;
    kpiEl.textContent = allAbandons.length.toLocaleString('fr');
    if (allAbandons.length > 0 && allScores.length > 0) {
        const taux = Math.round((allAbandons.length / (allAbandons.length + allScores.length)) * 100);
        subEl.textContent = `${taux}% des sessions commencées`;
    } else {
        subEl.textContent = 'Quiz commencés mais non terminés';
    }
}

// ── PAYS ─────────────────────────────────────────────────────────
function renderPays() {
    const grid = document.getElementById('pays-grid');
    if (!grid) return;

    // Collecter les pays directement depuis les champs Firebase (countryCode / countryName)
    const paysCounts = {};

    allScores.forEach(s => {
        if (!s.countryCode) return;
        const code = s.countryCode;
        if (!paysCounts[code]) {
            paysCounts[code] = { code, name: s.countryName || code, count: 0 };
        }
        paysCounts[code].count++;
    });

    const sorted = Object.values(paysCounts).sort((a, b) => b.count - a.count);

    // Mettre à jour le KPI pays
    const kpiPays = document.getElementById('kpi-pays');
    if (kpiPays) kpiPays.textContent = sorted.length.toLocaleString('fr');

    if (sorted.length === 0) {
        grid.innerHTML = `<div class="empty-msg" style="grid-column:1/-1">
            <span class="material-symbols-outlined" style="animation:none">public_off</span>
            Aucun pays détecté — les nouvelles parties enregistreront automatiquement le pays dans Firebase.
        </div>`;
        return;
    }

    const maxCount = sorted[0].count;
    const rows = sorted.map((p, i) => {
        const pct = Math.round((p.count / maxCount) * 100);

        let rankHtml;
        if      (i === 0) rankHtml = `<span class="rank-medal gold"><span class="material-symbols-outlined" style="font-size:18px">military_tech</span>1er</span>`;
        else if (i === 1) rankHtml = `<span class="rank-medal silver"><span class="material-symbols-outlined" style="font-size:18px">workspace_premium</span>2e</span>`;
        else if (i === 2) rankHtml = `<span class="rank-medal bronze"><span class="material-symbols-outlined" style="font-size:18px">grade</span>3e</span>`;
        else              rankHtml = `<span class="rank-medal other"><span class="material-symbols-outlined" style="font-size:16px">tag</span>${i + 1}</span>`;

        return `<tr>
            <td>${rankHtml}</td>
            <td>
                <div style="display:flex;align-items:center;gap:10px">
                    <img src="https://flagcdn.com/w40/${p.code.toLowerCase()}.png"
                         alt="${p.name}"
                         style="width:32px;height:22px;object-fit:cover;border-radius:3px;box-shadow:0 1px 4px rgba(0,0,0,0.15);flex-shrink:0">
                    <strong>${p.name}</strong>
                </div>
            </td>
            <td>
                <div style="display:flex;align-items:center;gap:10px">
                    <div style="flex:1;height:5px;background:var(--bg-element);border-radius:3px;overflow:hidden;min-width:80px">
                        <div style="height:100%;width:${pct}%;background:var(--primary);border-radius:3px;transition:width 0.6s ease"></div>
                    </div>
                    <span style="font-size:13px;font-weight:700;color:var(--primary);white-space:nowrap">${p.count} partie${p.count > 1 ? 's' : ''}</span>
                </div>
            </td>
        </tr>`;
    }).join('');

    grid.innerHTML = `<table class="score-table" style="width:100%">
        <thead><tr><th>#</th><th>Pays</th><th>Activité</th></tr></thead>
        <tbody>${rows}</tbody>
    </table>`;
}

// ── DOMAINES ──────────────────────────────────────────────────────
function renderDomains() {
    const grid = document.getElementById('domains-grid');

    // Compter par domaine
    const counts = {};
    const avgPcts = {};
    allScores.forEach(s => {
        const d = s.domain || 'autre';
        counts[d] = (counts[d] || 0) + 1;
        avgPcts[d] = (avgPcts[d] || []);
        avgPcts[d].push(parseInt(s.pct) || 0);
    });

    const maxCount = Math.max(...Object.values(counts), 1);
    const domaines = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);

    if (domaines.length === 0) {
        grid.innerHTML = '<div class="empty-msg"><span class="material-symbols-outlined">inbox</span>Aucune donnée.</div>';
        return;
    }

    grid.innerHTML = domaines.map(d => {
        const count  = counts[d];
        const ptcs   = avgPcts[d];
        const avgPct = Math.round(ptcs.reduce((a, b) => a + b, 0) / ptcs.length);
        const pct    = Math.round((count / maxCount) * 100);
        const icon   = DOMAINE_ICONS[d] || 'category';
        const nom    = NOM_DOMAINES[d] || d;

        return `<div class="domain-stat-card">
            <div class="domain-stat-header">
                <div class="domain-stat-name">
                    <span class="material-symbols-outlined">${icon}</span>
                    ${nom}
                </div>
                <span class="domain-stat-count">${count} partie${count > 1 ? 's' : ''}</span>
            </div>
            <div class="domain-stat-bar-bg">
                <div class="domain-stat-bar" style="width:${pct}%"></div>
            </div>
            <div class="domain-stat-footer">
                <span>Score moyen : <strong>${avgPct}%</strong></span>
                <span>${pct}% du max</span>
            </div>
        </div>`;
    }).join('');
}

// ── FILTRES ───────────────────────────────────────────────────────
['filter-domain', 'filter-niveau', 'filter-periode'].forEach(id => {
    document.getElementById(id).addEventListener('change', () => {
        currentPage = 1;
        applyFilters();
    });
});

function applyFilters() {
    const domain  = document.getElementById('filter-domain').value;
    const niveau  = document.getElementById('filter-niveau').value;
    const periode = document.getElementById('filter-periode').value;

    const now   = Date.now();
    const day   = 24 * 60 * 60 * 1000;

    filteredScores = allScores.filter(s => {
        if (domain && s.domain !== domain) return false;
        if (niveau && s.niveau !== niveau) return false;
        if (periode !== 'all' && s.ts) {
            const tsMs = s.ts.toDate ? s.ts.toDate().getTime() : new Date(s.ts).getTime();
            if (periode === 'today' && (now - tsMs) > day)       return false;
            if (periode === 'week'  && (now - tsMs) > 7 * day)   return false;
            if (periode === 'month' && (now - tsMs) > 30 * day)  return false;
        }
        return true;
    }).sort((a, b) => {
        const pctDiff = (parseInt(b.pct) || 0) - (parseInt(a.pct) || 0);
        if (pctDiff !== 0) return pctDiff;
        const aTs = a.ts ? (a.ts.toDate ? a.ts.toDate().getTime() : new Date(a.ts).getTime()) : 0;
        const bTs = b.ts ? (b.ts.toDate ? b.ts.toDate().getTime() : new Date(b.ts).getTime()) : 0;
        return aTs - bTs;
    });

    renderTable();
    renderPagination();
}

// ── TABLE ─────────────────────────────────────────────────────────
function flagUrl(code) {
    return `https://flagcdn.com/w40/${code.toLowerCase()}.png`;
}

function renderTable() {
    const container = document.getElementById('table-container');
    const start = (currentPage - 1) * PAGE_SIZE;
    const page  = filteredScores.slice(start, start + PAGE_SIZE);

    if (filteredScores.length === 0) {
        container.innerHTML = '<div class="empty-msg"><span class="material-symbols-outlined">inbox</span>Aucun résultat pour ces filtres.</div>';
        return;
    }

    const niveauClasse = { 'débutant': 'debutant', 'intermédiaire': 'intermediaire', 'avancé': 'avance', 'aléatoire': 'aleatoire' };
    const niveauLabel  = { 'débutant': 'Débutant', 'intermédiaire': 'Intermédiaire', 'avancé': 'Avancé', 'aléatoire': 'Aléatoire' };

    const rows = page.map((s, i) => {
        const rank       = start + i + 1;
        let rankHtml;
        if      (rank === 1) rankHtml = `<span class="rank-medal gold"><span class="material-symbols-outlined" style="font-size:18px">military_tech</span>1er</span>`;
        else if (rank === 2) rankHtml = `<span class="rank-medal silver"><span class="material-symbols-outlined" style="font-size:18px">workspace_premium</span>2e</span>`;
        else if (rank === 3) rankHtml = `<span class="rank-medal bronze"><span class="material-symbols-outlined" style="font-size:18px">grade</span>3e</span>`;
        else                 rankHtml = `<span class="rank-medal other"><span class="material-symbols-outlined" style="font-size:16px">tag</span>${rank}</span>`;

        // Drapeau depuis Firebase (champs countryCode / countryName sauvegardés à chaque partie)
        let flagHtml    = '';
        let countryName = '';
        if (s.countryCode) {
            flagHtml    = `<img class="player-flag" src="${flagUrl(s.countryCode)}" alt="${s.countryName || s.countryCode}" title="${s.countryName || s.countryCode}">`;
            countryName = s.countryName || '';
        }

        const pctNum   = parseInt(s.pct) || 0;
        const pctClass = pctNum >= 70 ? 'high' : pctNum >= 40 ? 'mid' : 'low';

        const niv    = s.niveau || '';
        const nivCls = niveauClasse[niv] || '';
        const nivLbl = niveauLabel[niv]  || niv;

        const domNom = NOM_DOMAINES[s.sub || s.domain] || NOM_DOMAINES[s.domain] || s.domain;

        return `<tr>
            <td>${rankHtml}</td>
            <td>
                <div class="player-cell">
                    ${flagHtml}
                    <div>
                        <strong>${s.name}</strong>
                        ${countryName ? `<div style="font-size:11px;color:var(--text-muted);margin-top:1px">${countryName}</div>` : ''}
                    </div>
                </div>
            </td>
            <td><span class="score-pill ${pctClass}">${s.score}/${s.total} · ${s.pct}%</span></td>
            <td>${domNom}</td>
            <td>${niv ? `<span class="niveau-chip ${nivCls}">${nivLbl}</span>` : '—'}</td>
            <td class="date-cell">${s.dateHeure || '—'}</td>
        </tr>`;
    }).join('');

    container.innerHTML = `<table class="score-table">
        <thead>
            <tr>
                <th>#</th>
                <th>Joueur</th>
                <th>Score</th>
                <th>Domaine</th>
                <th>Niveau</th>
                <th>Date</th>
            </tr>
        </thead>
        <tbody>${rows}</tbody>
    </table>`;
}

// ── PAGINATION ────────────────────────────────────────────────────
function renderPagination() {
    const total = Math.ceil(filteredScores.length / PAGE_SIZE);
    const pg    = document.getElementById('pagination');

    if (total <= 1) { pg.innerHTML = ''; return; }

    let html = `<button class="page-btn" id="pg-prev" ${currentPage === 1 ? 'disabled' : ''}>‹ Préc.</button>`;

    for (let i = 1; i <= total; i++) {
        if (i === 1 || i === total || Math.abs(i - currentPage) <= 2) {
            html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
        } else if (Math.abs(i - currentPage) === 3) {
            html += `<span style="color:var(--text-muted);padding:0 4px">…</span>`;
        }
    }

    html += `<button class="page-btn" id="pg-next" ${currentPage === total ? 'disabled' : ''}>Suiv. ›</button>`;
    pg.innerHTML = html;

    pg.querySelectorAll('[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
            currentPage = parseInt(btn.dataset.page);
            renderTable();
            renderPagination();
        });
    });

    pg.querySelector('#pg-prev')?.addEventListener('click', () => {
        if (currentPage > 1) { currentPage--; renderTable(); renderPagination(); }
    });

    pg.querySelector('#pg-next')?.addEventListener('click', () => {
        if (currentPage < total) { currentPage++; renderTable(); renderPagination(); }
    });
}

// ── JOUEURS INACTIFS ──────────────────────────────────────────────
let inactifsPage = 1;
const INACTIFS_PAGE_SIZE = 20;
let inactifsData = [];

document.getElementById('filter-inactif-seuil').addEventListener('change', () => {
    inactifsPage = 1;
    renderInactifs();
});

function renderInactifs() {
    const seuilJours = parseInt(document.getElementById('filter-inactif-seuil').value) || 30;
    const now = new Date();
    const seuilMs = seuilJours * 24 * 60 * 60 * 1000;

    // Regrouper les scores par joueur (nom normalisé)
    const parJoueur = {};
    allScores.forEach(s => {
        const nom = (s.name || '').trim();
        if (!nom) return;
        const nomKey = nom.toLowerCase();
        const ts = s.ts ? (s.ts.toDate ? s.ts.toDate() : new Date(s.ts)) : null;
        if (!ts) return;

        if (!parJoueur[nomKey]) {
            parJoueur[nomKey] = {
                nom,
                countryCode: s.countryCode || '',
                countryName: s.countryName || '',
                dernierePartie: ts,
                totalParties: 0,
                meilleurScore: 0,
                scoreTotal: 0,
            };
        }
        parJoueur[nomKey].totalParties++;
        const pctVal = parseInt(s.pct) || 0;
        if (pctVal > parJoueur[nomKey].meilleurScore) parJoueur[nomKey].meilleurScore = pctVal;
        parJoueur[nomKey].scoreTotal += pctVal;
        if (ts > parJoueur[nomKey].dernierePartie) {
            parJoueur[nomKey].dernierePartie = ts;
            // Met à jour le pays avec la partie la plus récente
            if (s.countryCode) {
                parJoueur[nomKey].countryCode = s.countryCode;
                parJoueur[nomKey].countryName = s.countryName || s.countryCode;
            }
        }
    });

    // Filtrer : joueurs dont la dernière partie est avant le seuil
    inactifsData = Object.values(parJoueur)
        .filter(j => (now - j.dernierePartie) >= seuilMs)
        .sort((a, b) => b.dernierePartie - a.dernierePartie); // les plus récemment actifs en premier

    renderInactifsTable();
    renderInactifsPagination();
}

function joursDepuis(date) {
    const diff = Date.now() - date.getTime();
    const j = Math.floor(diff / (24 * 60 * 60 * 1000));
    if (j < 30) return j + ' j';
    if (j < 365) return Math.floor(j / 30) + ' mois';
    return Math.floor(j / 365) + ' an' + (Math.floor(j / 365) > 1 ? 's' : '');
}

function renderInactifsTable() {
    const container = document.getElementById('inactifs-container');
    const start = (inactifsPage - 1) * INACTIFS_PAGE_SIZE;
    const page  = inactifsData.slice(start, start + INACTIFS_PAGE_SIZE);

    if (inactifsData.length === 0) {
        container.innerHTML = `<div class="empty-msg">
            <span class="material-symbols-outlined" style="animation:none">sentiment_satisfied</span>
            Tous les joueurs sont actifs sur cette période !
        </div>`;
        return;
    }

    const rows = page.map((j, i) => {
        const rank = start + i + 1;
        let rankHtml;
        if      (rank === 1) rankHtml = `<span class="rank-medal gold"><span class="material-symbols-outlined" style="font-size:18px">military_tech</span>1er</span>`;
        else if (rank === 2) rankHtml = `<span class="rank-medal silver"><span class="material-symbols-outlined" style="font-size:18px">workspace_premium</span>2e</span>`;
        else if (rank === 3) rankHtml = `<span class="rank-medal bronze"><span class="material-symbols-outlined" style="font-size:18px">grade</span>3e</span>`;
        else                 rankHtml = `<span class="rank-medal other"><span class="material-symbols-outlined" style="font-size:16px">tag</span>${rank}</span>`;

        let flagHtml = '';
        let countryName = '';
        if (j.countryCode) {
            flagHtml    = `<img class="player-flag" src="https://flagcdn.com/w40/${j.countryCode.toLowerCase()}.png" alt="${j.countryName}" title="${j.countryName}">`;
            countryName = j.countryName || '';
        }

        const moyScore  = j.totalParties ? Math.round(j.scoreTotal / j.totalParties) : 0;
        const absence   = joursDepuis(j.dernierePartie);
        const dateStr   = j.dernierePartie.toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' });

        return `<tr>
            <td>${rankHtml}</td>
            <td>
                <div class="player-cell">
                    ${flagHtml}
                    <div>
                        <strong>${j.nom}</strong>
                        ${countryName ? `<div style="font-size:11px;color:var(--text-muted);margin-top:1px">${countryName}</div>` : ''}
                    </div>
                </div>
            </td>
            <td style="text-align:center"><span style="font-size:13px;font-weight:700;color:var(--primary)">${j.totalParties}</span></td>
            <td style="text-align:center"><span class="score-pill ${moyScore >= 70 ? 'high' : moyScore >= 40 ? 'mid' : 'low'}">${moyScore}%</span></td>
            <td>
                <div style="display:flex;flex-direction:column;gap:2px">
                    <span style="font-size:12px;color:var(--text-muted)">${dateStr}</span>
                    <span style="font-size:12px;font-weight:700;color:var(--error)">
                        <span class="material-symbols-outlined" style="font-size:13px;vertical-align:middle">schedule</span>
                        Absent depuis ${absence}
                    </span>
                </div>
            </td>
        </tr>`;
    }).join('');

    container.innerHTML = `<table class="score-table" style="width:100%">
        <thead>
            <tr>
                <th>#</th>
                <th>Joueur</th>
                <th style="text-align:center">Parties</th>
                <th style="text-align:center">Score moy.</th>
                <th>Dernière activité</th>
            </tr>
        </thead>
        <tbody>${rows}</tbody>
    </table>`;
}

function renderInactifsPagination() {
    const total = Math.ceil(inactifsData.length / INACTIFS_PAGE_SIZE);
    const pg    = document.getElementById('pagination-inactifs');
    if (total <= 1) { pg.innerHTML = ''; return; }

    let html = `<button class="page-btn" id="pg-inactifs-prev" ${inactifsPage === 1 ? 'disabled' : ''}>‹ Préc.</button>`;
    for (let i = 1; i <= total; i++) {
        if (i === 1 || i === total || Math.abs(i - inactifsPage) <= 2) {
            html += `<button class="page-btn ${i === inactifsPage ? 'active' : ''}" data-inactifs-page="${i}">${i}</button>`;
        } else if (Math.abs(i - inactifsPage) === 3) {
            html += `<span style="color:var(--text-muted);padding:0 4px">…</span>`;
        }
    }
    html += `<button class="page-btn" id="pg-inactifs-next" ${inactifsPage === total ? 'disabled' : ''}>Suiv. ›</button>`;
    pg.innerHTML = html;

    pg.querySelectorAll('[data-inactifs-page]').forEach(btn => {
        btn.addEventListener('click', () => {
            inactifsPage = parseInt(btn.dataset.inactifsPage);
            renderInactifsTable();
            renderInactifsPagination();
        });
    });
    pg.querySelector('#pg-inactifs-prev')?.addEventListener('click', () => {
        if (inactifsPage > 1) { inactifsPage--; renderInactifsTable(); renderInactifsPagination(); }
    });
    pg.querySelector('#pg-inactifs-next')?.addEventListener('click', () => {
        if (inactifsPage < total) { inactifsPage++; renderInactifsTable(); renderInactifsPagination(); }
    });
}

// ── ABANDONS ──────────────────────────────────────────────────────
async function loadAbandons() {
    try {
        const snap = await getDocs(
            query(collection(db, "Abandons"), orderBy("ts", "desc"))
        );
        allAbandons = snap.docs.map(d => d.data());
        renderAbandonsKPI();
        renderAbandons();
    } catch(e) {
        // Collection peut ne pas exister encore — afficher un message d'aide
        allAbandons = [];
        renderAbandonsKPI();
        const container = document.getElementById('abandons-container');
        if (container) {
            container.innerHTML = `<div class="empty-msg" style="flex-direction:column;gap:10px;padding:32px 20px;text-align:center">
                <span class="material-symbols-outlined" style="animation:none;font-size:36px;color:var(--warning)">info</span>
                <strong style="color:var(--text-main)">Collection "Abandons" introuvable dans Firebase</strong>
                <p style="font-size:13px;color:var(--text-muted);max-width:480px">
                    Pour activer ce suivi, ajoutez dans votre quiz côté joueur un appel Firebase qui enregistre un document dans la collection <code>Abandons</code> lorsqu'un joueur quitte sans terminer.<br><br>
                    Champs recommandés : <code>name</code>, <code>domain</code>, <code>niveau</code>, <code>ts</code> (timestamp), <code>countryCode</code>, <code>countryName</code>, <code>questionAtteinte</code>.
                </p>
            </div>`;
        }
    }
}

// Filtres abandons
['filter-abandon-domaine', 'filter-abandon-niveau', 'filter-abandon-periode'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', () => {
        abandonsPage = 1;
        renderAbandons();
    });
});

function renderAbandons() {
    const domFil    = document.getElementById('filter-abandon-domaine')?.value || '';
    const nivFil    = document.getElementById('filter-abandon-niveau')?.value  || '';
    const periodeV  = document.getElementById('filter-abandon-periode')?.value || 'all';
    const now       = Date.now();
    const day       = 24 * 60 * 60 * 1000;

    let data = allAbandons.filter(a => {
        if (domFil && (a.domain || '') !== domFil) return false;
        if (nivFil && (a.niveau || '') !== nivFil) return false;
        if (periodeV !== 'all' && a.ts) {
            const tsMs = a.ts.toDate ? a.ts.toDate().getTime() : new Date(a.ts).getTime();
            if (periodeV === 'today' && (now - tsMs) > day)      return false;
            if (periodeV === 'week'  && (now - tsMs) > 7 * day)  return false;
            if (periodeV === 'month' && (now - tsMs) > 30 * day) return false;
        }
        return true;
    });

    const container = document.getElementById('abandons-container');
    const pg        = document.getElementById('pagination-abandons');

    if (data.length === 0) {
        container.innerHTML = `<div class="empty-msg">
            <span class="material-symbols-outlined" style="animation:none">sentiment_satisfied</span>
            Aucun abandon enregistré pour cette sélection.
        </div>`;
        pg.innerHTML = '';
        return;
    }

    const total = Math.ceil(data.length / ABANDONS_PAGE_SIZE);
    const start = (abandonsPage - 1) * ABANDONS_PAGE_SIZE;
    const page  = data.slice(start, start + ABANDONS_PAGE_SIZE);

    const niveauClasse = { 'débutant':'debutant','intermédiaire':'intermediaire','avancé':'avance','aléatoire':'aleatoire' };
    const niveauLabel  = { 'débutant':'Débutant','intermédiaire':'Intermédiaire','avancé':'Avancé','aléatoire':'Aléatoire' };

    const rows = page.map((a, i) => {
        const rank = start + i + 1;
        let rankHtml;
        if      (rank === 1) rankHtml = `<span class="rank-medal gold"><span class="material-symbols-outlined" style="font-size:18px">military_tech</span>1er</span>`;
        else if (rank === 2) rankHtml = `<span class="rank-medal silver"><span class="material-symbols-outlined" style="font-size:18px">workspace_premium</span>2e</span>`;
        else if (rank === 3) rankHtml = `<span class="rank-medal bronze"><span class="material-symbols-outlined" style="font-size:18px">grade</span>3e</span>`;
        else                 rankHtml = `<span class="rank-medal other"><span class="material-symbols-outlined" style="font-size:16px">tag</span>${rank}</span>`;

        // Drapeau
        let flagHtml = '';
        if (a.countryCode) {
            flagHtml = `<img class="player-flag" src="https://flagcdn.com/w40/${a.countryCode.toLowerCase()}.png" alt="${a.countryName || a.countryCode}" title="${a.countryName || a.countryCode}">`;
        }

        const domNom = NOM_DOMAINES[a.sub || a.domain] || NOM_DOMAINES[a.domain] || a.domain || '—';
        const niv    = a.niveau || '';
        const nivCls = niveauClasse[niv] || '';
        const nivLbl = niveauLabel[niv]  || niv;

        // Date & heure
        let dateStr = '—';
        if (a.ts) {
            const d = a.ts.toDate ? a.ts.toDate() : new Date(a.ts);
            dateStr = d.toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' })
                    + ' · ' + d.toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
        }

        // Question atteinte (optionnel)
        const qAtteinte = a.questionAtteinte ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">Arrêté à la question ${a.questionAtteinte}</div>` : '';

        return `<tr>
            <td>${rankHtml}</td>
            <td>
                <div class="player-cell">
                    ${flagHtml}
                    <div>
                        <strong>${a.name || '—'}</strong>
                        ${a.countryName ? `<div style="font-size:11px;color:var(--text-muted);margin-top:1px">${a.countryName}</div>` : ''}
                    </div>
                </div>
            </td>
            <td>${domNom}</td>
            <td>${niv ? `<span class="niveau-chip ${nivCls}">${nivLbl}</span>` : '—'}</td>
            <td>
                <div style="display:flex;flex-direction:column;gap:2px">
                    <span style="font-size:12px;color:var(--text-muted)">${dateStr}</span>
                    ${qAtteinte}
                </div>
            </td>
        </tr>`;
    }).join('');

    container.innerHTML = `<div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
        <table class="score-table" style="width:100%">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Joueur</th>
                    <th>Domaine</th>
                    <th>Niveau</th>
                    <th>Date &amp; heure</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    </div>`;

    // Pagination
    if (total <= 1) { pg.innerHTML = ''; return; }
    let html = `<button class="page-btn" id="pg-abandons-prev" ${abandonsPage === 1 ? 'disabled' : ''}>‹ Préc.</button>`;
    for (let i = 1; i <= total; i++) {
        if (i === 1 || i === total || Math.abs(i - abandonsPage) <= 2) {
            html += `<button class="page-btn ${i === abandonsPage ? 'active' : ''}" data-abandons-page="${i}">${i}</button>`;
        } else if (Math.abs(i - abandonsPage) === 3) {
            html += `<span style="color:var(--text-muted);padding:0 4px">…</span>`;
        }
    }
    html += `<button class="page-btn" id="pg-abandons-next" ${abandonsPage === total ? 'disabled' : ''}>Suiv. ›</button>`;
    pg.innerHTML = html;

    pg.querySelectorAll('[data-abandons-page]').forEach(btn => {
        btn.addEventListener('click', () => {
            abandonsPage = parseInt(btn.dataset.abandonsPage);
            renderAbandons();
        });
    });
    pg.querySelector('#pg-abandons-prev')?.addEventListener('click', () => {
        if (abandonsPage > 1) { abandonsPage--; renderAbandons(); }
    });
    pg.querySelector('#pg-abandons-next')?.addEventListener('click', () => {
        if (abandonsPage < total) { abandonsPage++; renderAbandons(); }
    });
}

// ── DONNÉES RÉPONSES ──────────────────────────────────────────────
let allReponses  = [];
let currentTab   = 'ratees';

async function loadReponses() {
    try {
        const snap = await getDocs(
            query(collection(db, "Reponses"), orderBy("ts", "desc"))
        );
        allReponses = snap.docs.map(d => d.data());

        // ── DIAGNOSTIC : affiche la structure des 3 premiers docs ──
        if (allReponses.length > 0) {
            console.group('🔍 Structure des documents Reponses (3 premiers)');
            allReponses.slice(0, 3).forEach((r, i) => {
                console.log(`Doc ${i + 1} :`, JSON.stringify(r, null, 2));
            });
            // Lister tous les champs trouvés
            const allKeys = new Set(allReponses.flatMap(r => Object.keys(r)));
            console.log('📋 Tous les champs trouvés :', [...allKeys].join(', '));
            // Lister les valeurs uniques pour domain, sub, niveau, level, difficulty
            ['domain','sub','niveau','level','difficulty','niveauChoisi','resultat'].forEach(k => {
                const vals = [...new Set(allReponses.map(r => r[k]).filter(v => v !== undefined))];
                if (vals.length) console.log(`  → ${k} :`, vals.join(' | '));
            });
            console.groupEnd();
        }

        renderMissed();
    } catch(e) {
        console.warn("Erreur chargement Reponses :", e);
    }
}

// ── ONGLETS ANALYSE ───────────────────────────────────────────────
document.querySelectorAll('.missed-tab').forEach(btn => {
    btn.addEventListener('click', () => {
        currentTab = btn.dataset.tab;
        document.querySelectorAll('.missed-tab').forEach(b => {
            const isActive = b === btn;
            b.style.borderBottomColor  = isActive ? 'var(--primary)' : 'transparent';
            b.style.background         = isActive ? 'var(--primary-light)' : 'transparent';
            b.style.color              = isActive ? 'var(--primary)' : 'var(--text-muted)';
            b.style.fontWeight         = isActive ? '600' : '500';
        });
        renderMissed();
    });
});

document.getElementById('filter-missed-domain').addEventListener('change', renderMissed);
document.getElementById('filter-missed-niveau').addEventListener('change', renderMissed);

// ── RENDU ANALYSE DES RÉPONSES ────────────────────────────────────
function renderMissed() {
    const list   = document.getElementById('missed-list');
    const domain = document.getElementById('filter-missed-domain').value;
    const niveau = document.getElementById('filter-missed-niveau') ? document.getElementById('filter-missed-niveau').value : '';

    if (allReponses.length === 0) {
        list.innerHTML = `<li class="empty-msg">
            <span class="material-symbols-outlined" style="animation:none">inbox</span>
            Aucune donnée de réponse enregistrée encore.<br>
            <span style="font-size:12px;margin-top:8px;display:block">Les données apparaîtront dès que des joueurs joueront avec le nouveau script.js</span>
        </li>`;
        return;
    }

    // ── Filtrer sur les données BRUTES (avant regroupement) ──────────
    let data = allReponses;

    // Domaine : chercher dans tous les champs possibles, insensible à la casse
    if (domain) {
        const d = domain.toLowerCase();
        data = data.filter(r =>
            (r.domain        || '').toLowerCase() === d ||
            (r.sub           || '').toLowerCase() === d ||
            (r.domaine       || '').toLowerCase() === d ||
            (r.categorie     || '').toLowerCase() === d ||
            (r.category      || '').toLowerCase() === d
        );
    }

    // Niveau : chercher dans tous les champs possibles, insensible à la casse
    if (niveau) {
        const n = niveau.toLowerCase();
        data = data.filter(r =>
            (r.niveau        || '').toLowerCase() === n ||
            (r.level         || '').toLowerCase() === n ||
            (r.difficulty    || '').toLowerCase() === n ||
            (r.niveauChoisi  || '').toLowerCase() === n ||
            (r.niveauJeu     || '').toLowerCase() === n
        );
    }

    // Filtrer par résultat selon l'onglet actif
    const resultatFiltre = currentTab === 'ratees' ? 'incorrect'
                         : currentTab === 'reussies' ? 'correct'
                         : 'timeout';

    data = data.filter(r => r.resultat === resultatFiltre);

    if (data.length === 0) {
        list.innerHTML = `<li class="empty-msg">
            <span class="material-symbols-outlined" style="animation:none">inbox</span>
            Aucune donnée pour cette sélection.
        </li>`;
        return;
    }

    // Regrouper par question — on stocke aussi le niveau
    const parQuestion = {};
    data.forEach(r => {
        const key = r.question;
        // Résoudre le niveau depuis tous les champs possibles
        const niveauDoc = r.niveau || r.level || r.difficulty || r.niveauChoisi || r.niveauJeu || '';
        // Résoudre le domaine affiché depuis tous les champs possibles
        const domainDoc = r.domain || r.domaine || r.category || r.categorie || '';
        const subDoc    = r.sub || '';

        if (!parQuestion[key]) {
            parQuestion[key] = {
                question: r.question,
                domain:   domainDoc,
                sub:      subDoc,
                niveau:   niveauDoc,
                options:  r.options || [],
                reponseCorrecte: r.reponseCorrecte || r.bonneReponse || r.correctAnswer || '',
                count:    0,
                optionsChoisies: {}
            };
        }
        parQuestion[key].count++;
        // Récupérer le niveau dès qu'un doc du groupe l'a
        if (!parQuestion[key].niveau && niveauDoc) {
            parQuestion[key].niveau = niveauDoc;
        }
        const optChoisie = r.optionChoisie || r.reponseChoisie || r.choix || r.selectedAnswer || '';
        if (optChoisie) {
            parQuestion[key].optionsChoisies[optChoisie] = (parQuestion[key].optionsChoisies[optChoisie] || 0) + 1;
        }
    });

    // Trier par count décroissant, garder top 15
    const sorted = Object.values(parQuestion)
        .sort((a, b) => b.count - a.count)
        .slice(0, 15);

    // Couleur et icône selon l'onglet
    const couleurCount = currentTab === 'ratees'   ? 'var(--error)'
                       : currentTab === 'reussies' ? 'var(--success)'
                       : 'var(--warning)';
    const labelSuffix  = currentTab === 'ratees'   ? 'fois ratée'
                       : currentTab === 'reussies' ? 'fois réussie'
                       : 'fois en timeout';

    // Badge couleur par niveau
    const niveauClasse = { 'débutant': 'debutant', 'intermédiaire': 'intermediaire', 'avancé': 'avance', 'aléatoire': 'aleatoire' };
    const niveauLabel  = { 'débutant': 'Débutant', 'intermédiaire': 'Intermédiaire', 'avancé': 'Avancé', 'aléatoire': 'Aléatoire' };

    list.innerHTML = sorted.map((q, i) => {
        const domNom  = NOM_DOMAINES[q.sub || q.domain] || NOM_DOMAINES[q.domain] || q.domain;
        const nivCls  = niveauClasse[q.niveau] || '';
        const nivLbl  = niveauLabel[q.niveau]  || q.niveau;
        const niveauBadge = nivLbl
            ? `<span class="niveau-chip ${nivCls}" style="font-size:11px">${nivLbl}</span>`
            : '';

        // Construire les barres d'options choisies (pour tous les onglets)
        let optionsBarsHtml = '';
        if (Object.keys(q.optionsChoisies).length > 0) {
            const maxOpts = Math.max(...Object.values(q.optionsChoisies));

            // Normalisation pour comparaison robuste (casse + espaces)
            const repCorrecteNorm = (q.reponseCorrecte || '').trim().toLowerCase();

            const lignes = Object.entries(q.optionsChoisies)
                .sort((a, b) => b[1] - a[1])
                .map(([opt, cnt]) => {
                    const pct = Math.round((cnt / maxOpts) * 100);

                    // Dans l'onglet "ratées" : toutes les options choisies sont fausses
                    // Dans l'onglet "réussies" : toutes les options choisies sont correctes
                    // Dans l'onglet "timeout" : on marque en vert uniquement si c'est la bonne réponse
                    let isCorr;
                    if (currentTab === 'ratees') {
                        isCorr = false; // jamais vert — toutes fausses par définition
                    } else if (currentTab === 'reussies') {
                        isCorr = true;  // toujours vert — toutes correctes par définition
                    } else {
                        // timeout : on compare proprement avec normalisation
                        isCorr = repCorrecteNorm.length > 0 &&
                                 opt.trim().toLowerCase() === repCorrecteNorm;
                    }

                    const labelCls = isCorr ? 'correct-opt' : 'wrong-opt';
                    const barCls   = isCorr ? 'correct-fill' : 'wrong-fill';
                    return `<div class="option-bar-row">
                        <span class="option-bar-label ${labelCls}" title="${opt}">
                            ${isCorr ? '✓ ' : ''}${opt}
                        </span>
                        <div class="option-bar-bg">
                            <div class="option-bar-fill ${barCls}" style="width:${pct}%"></div>
                        </div>
                        <span class="option-bar-count">${cnt}×</span>
                    </div>`;
                }).join('');

            // Pour "ratées" et "timeout" : ajouter une ligne séparée pour la bonne réponse
            let bonneReponseHtml = '';
            if (currentTab !== 'reussies' && q.reponseCorrecte) {
                bonneReponseHtml = `<div style="margin-top:6px;padding:4px 8px;background:var(--success-light);border-radius:6px;font-size:12px;color:var(--success);font-weight:600;display:inline-flex;align-items:center;gap:4px;">
                    <span style="font-size:14px">✓</span> Bonne réponse : ${q.reponseCorrecte}
                </div>`;
            }

            optionsBarsHtml = `<div class="option-bar-wrap">${lignes}</div>${bonneReponseHtml}`;
        } else if (q.reponseCorrecte) {
            // Pas de détail des options mais on affiche au moins la bonne réponse
            const label = currentTab === 'timeout' ? 'Bonne réponse' : 'Réponse correcte';
            optionsBarsHtml = `<div style="margin-top:6px;font-size:12px;color:var(--text-muted);">
                ${label} : <strong style="color:var(--success)">${q.reponseCorrecte}</strong>
            </div>`;
        }

        return `<li class="missed-item">
            <span class="missed-rank" style="color:${couleurCount}">#${i + 1}</span>
            <div class="missed-question" style="flex:1">
                <div style="font-weight:500;margin-bottom:4px">${q.question}</div>
                ${optionsBarsHtml}
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;min-width:80px">
                <span class="missed-domain">${domNom}</span>
                ${niveauBadge}
                <span class="missed-pct" style="color:${couleurCount}">${q.count}× ${labelSuffix}</span>
            </div>
        </li>`;
    }).join('');
}
// ── PROFIL DES JOUEURS (domaine & niveau favoris) ─────────────────
let profilPage = 1;
const PROFIL_PAGE_SIZE = 15;
let profilData = [];

document.getElementById('filter-profil-tri').addEventListener('change', () => {
    profilPage = 1;
    renderProfilJoueurs();
});
document.getElementById('filter-profil-domaine').addEventListener('change', () => {
    profilPage = 1;
    renderProfilJoueurs();
});
document.getElementById('filter-profil-niveau').addEventListener('change', () => {
    profilPage = 1;
    renderProfilJoueurs();
});

function renderProfilJoueurs() {
    const triVal    = document.getElementById('filter-profil-tri').value;
    const domFil    = document.getElementById('filter-profil-domaine').value;
    const nivFil    = document.getElementById('filter-profil-niveau').value;

    // ── 1. Regrouper tous les scores par joueur ──────────────────
    const parJoueur = {};
    allScores.forEach(s => {
        const nom = (s.name || '').trim();
        if (!nom) return;
        const key = nom.toLowerCase();
        const ts  = s.ts ? (s.ts.toDate ? s.ts.toDate() : new Date(s.ts)) : null;
        const pct = parseInt(s.pct) || 0;
        const dom = s.sub || s.domain || '';
        const niv = s.niveau || '';

        if (!parJoueur[key]) {
            parJoueur[key] = {
                nom,
                countryCode : s.countryCode  || '',
                countryName : s.countryName  || '',
                totalParties: 0,
                scoreTotal  : 0,
                meilleurPct : 0,
                domaines    : {},
                niveaux     : {},
                premierePartie: ts,
                dernierePartie: ts,
            };
        }
        const p = parJoueur[key];
        p.totalParties++;
        p.scoreTotal += pct;
        if (pct > p.meilleurPct) p.meilleurPct = pct;
        if (dom) p.domaines[dom] = (p.domaines[dom] || 0) + 1;
        if (niv) p.niveaux[niv]  = (p.niveaux[niv]  || 0) + 1;
        if (ts) {
            if (!p.dernierePartie || ts > p.dernierePartie) {
                p.dernierePartie = ts;
                if (s.countryCode) { p.countryCode = s.countryCode; p.countryName = s.countryName || s.countryCode; }
            }
            if (!p.premierePartie || ts < p.premierePartie) p.premierePartie = ts;
        }
    });

    // ── 2. Calculer les favoris pour chaque joueur ───────────────
    const joueurs = Object.values(parJoueur).map(p => {
        const domFavori = Object.keys(p.domaines).length
            ? Object.keys(p.domaines).reduce((a, b) => p.domaines[a] >= p.domaines[b] ? a : b) : '';
        const nivFavori = Object.keys(p.niveaux).length
            ? Object.keys(p.niveaux).reduce((a, b) => p.niveaux[a] >= p.niveaux[b] ? a : b) : '';

        // top 3 domaines avec leur %
        const totalDom = Object.values(p.domaines).reduce((a, b) => a + b, 0) || 1;
        const top3Dom  = Object.entries(p.domaines)
            .sort((a, b) => b[1] - a[1]).slice(0, 3)
            .map(([d, c]) => ({ dom: d, count: c, pct: Math.round((c / totalDom) * 100) }));

        // distribution niveaux
        const totalNiv = Object.values(p.niveaux).reduce((a, b) => a + b, 0) || 1;
        const distribNiv = Object.entries(p.niveaux)
            .sort((a, b) => b[1] - a[1])
            .map(([n, c]) => ({ niv: n, count: c, pct: Math.round((c / totalNiv) * 100) }));

        return {
            ...p,
            domFavori,
            nivFavori,
            top3Dom,
            distribNiv,
            scoreMoyen: p.totalParties ? Math.round(p.scoreTotal / p.totalParties) : 0,
        };
    });

    // ── 3. Filtres domaine / niveau favori ───────────────────────
    let filtered = joueurs;
    if (domFil) filtered = filtered.filter(j => j.domFavori === domFil);
    if (nivFil) filtered = filtered.filter(j => j.nivFavori === nivFil);

    // ── 4. Tri ───────────────────────────────────────────────────
    filtered.sort((a, b) => {
        if (triVal === 'score')    return b.scoreMoyen    - a.scoreMoyen;
        if (triVal === 'meilleur') return b.meilleurPct   - a.meilleurPct;
        return b.totalParties - a.totalParties; // défaut : parties
    });

    profilData = filtered;
    renderProfilTable();
    renderProfilPagination();
}

const NIVEAU_CLS = { 'débutant':'debutant','intermédiaire':'intermediaire','avancé':'avance','aléatoire':'aleatoire' };
const NIVEAU_LBL = { 'débutant':'Débutant','intermédiaire':'Intermédiaire','avancé':'Avancé','aléatoire':'Aléatoire' };

function renderProfilTable() {
    const container = document.getElementById('profil-container');
    const start = (profilPage - 1) * PROFIL_PAGE_SIZE;
    const page  = profilData.slice(start, start + PROFIL_PAGE_SIZE);

    if (profilData.length === 0) {
        container.innerHTML = `<div class="empty-msg">
            <span class="material-symbols-outlined" style="animation:none">inbox</span>
            Aucun joueur pour cette sélection.
        </div>`;
        return;
    }

    const rows = page.map((j, i) => {
        const rank = start + i + 1;

        // Médaille
        let rankHtml;
        if      (rank === 1) rankHtml = `<span class="rank-medal gold"><span class="material-symbols-outlined" style="font-size:18px">military_tech</span>1er</span>`;
        else if (rank === 2) rankHtml = `<span class="rank-medal silver"><span class="material-symbols-outlined" style="font-size:18px">workspace_premium</span>2e</span>`;
        else if (rank === 3) rankHtml = `<span class="rank-medal bronze"><span class="material-symbols-outlined" style="font-size:18px">grade</span>3e</span>`;
        else                 rankHtml = `<span class="rank-medal other"><span class="material-symbols-outlined" style="font-size:16px">tag</span>${rank}</span>`;

        // Drapeau
        const flagHtml = j.countryCode
            ? `<img class="player-flag" src="https://flagcdn.com/w40/${j.countryCode.toLowerCase()}.png" alt="${j.countryName}" title="${j.countryName}">`
            : '';

        // Domaine favori + icône
        const domIcon = DOMAINE_ICONS[j.domFavori] || 'category';
        const domNom  = NOM_DOMAINES[j.domFavori]  || j.domFavori || '—';

        // Top 3 domaines — mini barres
        const top3Html = j.top3Dom.map(d => {
            const dn = NOM_DOMAINES[d.dom] || d.dom;
            const ic = DOMAINE_ICONS[d.dom] || 'category';
            return `<div class="profil-dom-bar-row">
                <span class="material-symbols-outlined" style="font-size:13px;color:var(--primary);flex-shrink:0">${ic}</span>
                <span class="profil-dom-bar-label" title="${dn}">${dn}</span>
                <div class="profil-dom-bar-bg">
                    <div class="profil-dom-bar-fill" style="width:${d.pct}%"></div>
                </div>
                <span class="profil-dom-bar-pct">${d.count}×</span>
            </div>`;
        }).join('');

        // Niveaux — chips avec %
        const nivHtml = j.distribNiv.map(n => {
            const cls = NIVEAU_CLS[n.niv] || '';
            const lbl = NIVEAU_LBL[n.niv] || n.niv;
            return `<span class="niveau-chip ${cls}" title="${n.count} partie(s)">${lbl} <span style="opacity:.7">${n.pct}%</span></span>`;
        }).join(' ');

        // Score moyen coloré
        const sm = j.scoreMoyen;
        const smCls = sm >= 70 ? 'high' : sm >= 40 ? 'mid' : 'low';

        return `<tr class="profil-row">
            <td>${rankHtml}</td>
            <td>
                <div class="player-cell">
                    ${flagHtml}
                    <div>
                        <strong>${j.nom}</strong>
                        ${j.countryName ? `<div style="font-size:11px;color:var(--text-muted);margin-top:1px">${j.countryName}</div>` : ''}
                    </div>
                </div>
            </td>
            <td>
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
                    <span class="material-symbols-outlined" style="font-size:16px;color:var(--primary)">${domIcon}</span>
                    <strong style="font-size:13px">${domNom}</strong>
                </div>
                <div class="profil-dom-bars">${top3Html}</div>
            </td>
            <td>
                <div style="display:flex;flex-direction:column;gap:4px">${nivHtml || '—'}</div>
            </td>
            <td style="text-align:center">
                <span style="font-size:18px;font-weight:800;color:var(--primary)">${j.totalParties}</span>
                <div style="font-size:11px;color:var(--text-muted)">partie${j.totalParties > 1 ? 's' : ''}</div>
            </td>
            <td style="text-align:center">
                <span class="score-pill ${smCls}">${sm}%</span>
                <div style="font-size:11px;color:var(--text-muted);margin-top:3px">🏆 ${j.meilleurPct}%</div>
            </td>
        </tr>`;
    }).join('');

    container.innerHTML = `<div style="overflow-x:auto;-webkit-overflow-scrolling:touch">
        <table class="score-table profil-table" style="width:100%">
            <thead>
                <tr>
                    <th>#</th>
                    <th>Joueur</th>
                    <th>Domaines joués</th>
                    <th>Niveaux</th>
                    <th style="text-align:center">Parties</th>
                    <th style="text-align:center">Score moy. / Meilleur</th>
                </tr>
            </thead>
            <tbody>${rows}</tbody>
        </table>
    </div>`;
}

function renderProfilPagination() {
    const total = Math.ceil(profilData.length / PROFIL_PAGE_SIZE);
    const pg    = document.getElementById('pagination-profil');
    if (total <= 1) { pg.innerHTML = ''; return; }

    let html = `<button class="page-btn" id="pg-profil-prev" ${profilPage === 1 ? 'disabled' : ''}>‹ Préc.</button>`;
    for (let i = 1; i <= total; i++) {
        if (i === 1 || i === total || Math.abs(i - profilPage) <= 2) {
            html += `<button class="page-btn ${i === profilPage ? 'active' : ''}" data-profil-page="${i}">${i}</button>`;
        } else if (Math.abs(i - profilPage) === 3) {
            html += `<span style="color:var(--text-muted);padding:0 4px">…</span>`;
        }
    }
    html += `<button class="page-btn" id="pg-profil-next" ${profilPage === total ? 'disabled' : ''}>Suiv. ›</button>`;
    pg.innerHTML = html;

    pg.querySelectorAll('[data-profil-page]').forEach(btn => {
        btn.addEventListener('click', () => {
            profilPage = parseInt(btn.dataset.profilPage);
            renderProfilTable();
            renderProfilPagination();
        });
    });
    pg.querySelector('#pg-profil-prev')?.addEventListener('click', () => {
        if (profilPage > 1) { profilPage--; renderProfilTable(); renderProfilPagination(); }
    });
    pg.querySelector('#pg-profil-next')?.addEventListener('click', () => {
        if (profilPage < total) { profilPage++; renderProfilTable(); renderProfilPagination(); }
    });
}
