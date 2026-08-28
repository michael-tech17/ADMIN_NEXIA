import { initializeApp }   from "https://www.gstatic.com/firebasejs/12.17.1/firebase-app.js";
import { getFirestore, collection, query, orderBy, getDocs, where, limit }
                           from "https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js";

// ── 1. CONFIG FIREBASE (identique à script.js) ──────────────────────
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

// ── 2. MOT DE PASSE ADMIN ───────────────────────────────────────────
// ⚠️ CHANGE CE MOT DE PASSE avant de mettre en ligne !
const ADMIN_PASSWORD = "FMK_Liverpool225";

// ── 3. ÉTAT ─────────────────────────────────────────────────────────
let allScores      = [];
let filteredScores = [];
let currentPage    = 1;
const PAGE_SIZE    = 20;

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
};

// ── 4. LOGIN ─────────────────────────────────────────────────────────
document.getElementById('admin-login-btn').addEventListener('click', handleLogin);
document.getElementById('admin-pwd').addEventListener('keydown', e => {
    if (e.key === 'Enter') handleLogin();
});

function handleLogin() {
    const pwd = document.getElementById('admin-pwd').value;
    if (pwd === ADMIN_PASSWORD) {
        document.getElementById('login-admin').style.display = 'none';
        document.getElementById('dashboard').style.display = 'block';
        loadAllData();
    } else {
        document.getElementById('login-error').style.display = 'block';
        document.getElementById('admin-pwd').value = '';
    }
}

document.getElementById('btn-logout').addEventListener('click', () => {
    document.getElementById('dashboard').style.display = 'none';
    document.getElementById('login-admin').style.display = 'flex';
    document.getElementById('admin-pwd').value = '';
});

document.getElementById('btn-refresh').addEventListener('click', loadAllData);

// ── 5. CHARGEMENT FIREBASE ───────────────────────────────────────────
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
        renderDomains();
        renderPays();
        applyFilters();
        await loadReponses();

    } catch(e) {
        console.error(e);
    }

    document.getElementById('btn-refresh').querySelector('.material-symbols-outlined').style.animation = '';
}

// ── 6. KPI ───────────────────────────────────────────────────────────
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
}

// ── 7. PAYS ─────────────────────────────────────────────────────────
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
    grid.innerHTML = sorted.map((p, i) => {
        const pct = Math.round((p.count / maxCount) * 100);
        let medal = '';
        if (i === 0) medal = '🥇';
        else if (i === 1) medal = '🥈';
        else if (i === 2) medal = '🥉';

        return `<div style="display:flex;align-items:center;gap:12px;padding:12px 20px;border-bottom:1px solid var(--bg-element);">
            <img src="https://flagcdn.com/w40/${p.code.toLowerCase()}.png"
                 alt="${p.name}"
                 style="width:32px;height:22px;object-fit:cover;border-radius:3px;box-shadow:0 1px 4px rgba(0,0,0,0.15);flex-shrink:0">
            <div style="flex:1">
                <div style="font-size:14px;font-weight:600;">
                    ${medal} ${p.name}
                </div>
                <div style="height:5px;background:var(--bg-element);border-radius:3px;margin-top:5px;overflow:hidden">
                    <div style="height:100%;width:${pct}%;background:var(--primary);border-radius:3px;transition:width 0.6s ease"></div>
                </div>
            </div>
            <div style="font-size:13px;font-weight:700;color:var(--primary);flex-shrink:0">
                ${p.count} partie${p.count > 1 ? 's' : ''}
            </div>
        </div>`;
    }).join('');
}

// ── 8. DOMAINES ──────────────────────────────────────────────────────
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

// ── 9. FILTRES ───────────────────────────────────────────────────────
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
        if (periode === 'today'  && (now - s.ts) > day)      return false;
        if (periode === 'week'   && (now - s.ts) > 7 * day)  return false;
        if (periode === 'month'  && (now - s.ts) > 30 * day) return false;
        return true;
    }).sort((a, b) => (parseInt(b.pct) || 0) - (parseInt(a.pct) || 0) || a.ts - b.ts);

    renderTable();
    renderPagination();
}

// ── 10. TABLE ─────────────────────────────────────────────────────────
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
        if      (rank === 1) rankHtml = `<span class="rank-medal gold"><span class="material-symbols-outlined" style="font-size:18px">emoji_events</span>1er</span>`;
        else if (rank === 2) rankHtml = `<span class="rank-medal silver"><span class="material-symbols-outlined" style="font-size:18px">emoji_events</span>2e</span>`;
        else if (rank === 3) rankHtml = `<span class="rank-medal bronze"><span class="material-symbols-outlined" style="font-size:18px">emoji_events</span>3e</span>`;
        else                 rankHtml = `<span class="rank-medal other">#${rank}</span>`;

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

// ── 11. PAGINATION ────────────────────────────────────────────────────
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

// ── 12. DONNÉES RÉPONSES ──────────────────────────────────────────────
let allReponses  = [];
let currentTab   = 'ratees';

async function loadReponses() {
    try {
        const snap = await getDocs(
            query(collection(db, "Reponses"), orderBy("ts", "desc"))
        );
        allReponses = snap.docs.map(d => d.data());
        renderMissed();
    } catch(e) {
        console.warn("Erreur chargement Reponses :", e);
    }
}

// ── 13. ONGLETS ANALYSE ───────────────────────────────────────────────
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

// ── 14. RENDU ANALYSE DES RÉPONSES ────────────────────────────────────
function renderMissed() {
    const list   = document.getElementById('missed-list');
    const domain = document.getElementById('filter-missed-domain').value;

    if (allReponses.length === 0) {
        list.innerHTML = `<li class="empty-msg">
            <span class="material-symbols-outlined" style="animation:none">inbox</span>
            Aucune donnée de réponse enregistrée encore.<br>
            <span style="font-size:12px;margin-top:8px;display:block">Les données apparaîtront dès que des joueurs joueront avec le nouveau script.js</span>
        </li>`;
        return;
    }

    // Filtrer par domaine
    let data = domain ? allReponses.filter(r => r.domain === domain) : allReponses;

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

    // Regrouper par question
    const parQuestion = {};
    data.forEach(r => {
        const key = r.question;
        if (!parQuestion[key]) {
            parQuestion[key] = {
                question: r.question,
                domain:   r.domain,
                sub:      r.sub,
                options:  r.options || [],
                reponseCorrecte: r.reponseCorrecte,
                count:    0,
                optionsChoisies: {} // option → count
            };
        }
        parQuestion[key].count++;
        if (r.optionChoisie) {
            const oc = r.optionChoisie;
            parQuestion[key].optionsChoisies[oc] = (parQuestion[key].optionsChoisies[oc] || 0) + 1;
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
                       : 'fois timeout';

    list.innerHTML = sorted.map((q, i) => {
        const domNom = NOM_DOMAINES[q.sub || q.domain] || NOM_DOMAINES[q.domain] || q.domain;

        // Construire les barres d'options choisies
        let optionsBarsHtml = '';
        if (currentTab === 'ratees' && Object.keys(q.optionsChoisies).length > 0) {
            const maxOpts = Math.max(...Object.values(q.optionsChoisies));
            const lignes  = Object.entries(q.optionsChoisies)
                .sort((a, b) => b[1] - a[1])
                .map(([opt, cnt]) => {
                    const pct      = Math.round((cnt / maxOpts) * 100);
                    const isCorr   = opt === q.reponseCorrecte;
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
            optionsBarsHtml = `<div class="option-bar-wrap">${lignes}</div>`;
        }

        if (currentTab === 'timeout') {
            // Pour timeout : pas d'option choisie, juste la bonne réponse
            optionsBarsHtml = `<div style="margin-top:6px;font-size:12px;color:var(--text-muted);">
                Bonne réponse : <strong style="color:var(--success)">${q.reponseCorrecte}</strong>
            </div>`;
        }

        if (currentTab === 'reussies') {
            // Pour réussies : afficher la bonne réponse
            optionsBarsHtml = `<div style="margin-top:6px;font-size:12px;color:var(--text-muted);">
                Réponse correcte : <strong style="color:var(--success)">${q.reponseCorrecte}</strong>
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
                <span class="missed-pct" style="color:${couleurCount}">${q.count} ${labelSuffix}${q.count > 1 ? 's' : ''}</span>
            </div>
        </li>`;
    }).join('');
}
