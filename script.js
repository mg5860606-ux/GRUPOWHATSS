/**
 * GRUPOSWHATS - VERSÃO FINAL ESTABILIZADA
 * Todos os direitos reservados ao Corvo.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getFirestore, collection, getDocs, addDoc, updateDoc, doc, deleteDoc, query, where, getDoc, orderBy, limit, increment, setDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

// 1. CONFIGURAÇÃO FIREBASE E GLOBAIS
const CONFIG = {
    firebase: {
        apiKey: "AIzaSyDgtqqGgjGgYmmNYg9cxhHIc-VIPASz3uE",
        authDomain: "grupos-whats-app.firebaseapp.com",
        projectId: "grupos-whats-app",
        storageBucket: "grupos-whats-app.firebasestorage.app",
        messagingSenderId: "1081682450204",
        appId: "1:1081682450204:web:1df9460ba25087bd93ccd9"
    },
    emailjs: {
        publicKey: "Y4pByrrLorqTgCJ8b",
        serviceId: "service_gmail",
        templateCupons: "template_cupons",
        templateRecibo: "template_recibo"
    },
    promisseToken: "", // Carregado do Firestore por seguranca
    adminPassword: "" // Removido conforme solicitado para maior privacidade
};

const app = initializeApp(CONFIG.firebase);
const db = getFirestore(app);
let IMGBB_API_KEY = ""; // Carregado dinamicamente do Firestore
// Inicializa EmailJS
if (typeof emailjs !== "undefined") { emailjs.init(CONFIG.emailjs.publicKey); }
// Aguarda o script carregar se ainda nao estiver disponivel
if (typeof emailjs === "undefined") {
    document.addEventListener("DOMContentLoaded", function () {
        if (typeof emailjs !== "undefined") emailjs.init(CONFIG.emailjs.publicKey);
    });
}
const auth = getAuth(app);

// 2. VARIÁVEIS DE ESTADO
let grupos = [];
let meusGrupos = JSON.parse(localStorage.getItem('meusGrupos') || '[]');
let currentFilter = 'todos';
let userCountry = 'BR';
let currentBoostGroupId = null;
let selectedPackageHours = 12; // Default 12h
let selectedPackagePrice = 9.90; // Default 9.90
let visibleCount = 20;
window.visibleCount = 20;

let PROMISSE_TOKEN = CONFIG.promisseToken;

// 3. CARREGAMENTO E RENDERIZAÇÃO
async function loadGlobalConfigs() {
    // Cache de configs (30 min)
    try {
        const cached = localStorage.getItem(CONFIGS_CACHE_KEY);
        const cachedTime = localStorage.getItem(CONFIGS_CACHE_TIME_KEY);
        if (cached && cachedTime && (Date.now() - parseInt(cachedTime)) < CONFIGS_MAX_AGE) {
            const data = JSON.parse(cached);
            applyConfigs(data);
            return;
        }
    } catch (e) { /* ignore */ }

    try {
        const configSnap = await getDoc(doc(db, "configuracoes", "global"));
        if (configSnap.exists()) {
            const data = configSnap.data();
            applyConfigs(data);
            // Salvar no cache
            try {
                localStorage.setItem(CONFIGS_CACHE_KEY, JSON.stringify(data));
                localStorage.setItem(CONFIGS_CACHE_TIME_KEY, String(Date.now()));
            } catch (e) { /* ignore */ }
        }
    } catch (err) {
        console.error("Erro ao carregar configuraçães globais:", err);
    }
}

function applyConfigs(data) {
    if (data.promisseToken) PROMISSE_TOKEN = data.promisseToken.trim();
    if (data.imgbbApiKey) IMGBB_API_KEY = data.imgbbApiKey.trim();
    if (data.emailjsPubKey) CONFIG.emailjs.publicKey = data.emailjsPubKey;
    if (data.emailjsServiceId) CONFIG.emailjs.serviceId = data.emailjsServiceId;
    if (data.emailjsTemplateCupons) CONFIG.emailjs.templateCupons = data.emailjsTemplateCupons;
    if (data.emailjsTemplateRecibo) CONFIG.emailjs.templateRecibo = data.emailjsTemplateRecibo;
    if (data.adminPassword) CONFIG.adminPassword = data.adminPassword;

    const noticeEl = document.getElementById('homeNoticeText');
    if (noticeEl && data.homeNotice) {
        noticeEl.innerText = data.homeNotice;
        noticeEl.parentElement.style.display = 'block';
    }
}

async function loadGroups() {
    // Dispara configs e grupos AO MESMO TEMPO (não espera configs antes de buscar grupos)
    const configsPromise = loadGlobalConfigs();

    const cached = loadGroupsFromCache();
    if (cached) {
        grupos = cached.groups;
        renderAll();
        loadFooterDiscovery();
        if (cached.fresh) {
            console.log("Grupos do cache (" + cached.groups.length + " grupos, " + Math.round(cached.age / 1000) + "s)");
            await configsPromise;
            return;
        }
        console.log("Cache stale, atualizando em background...");
    }

    try {
        // Carrega até 200 grupos (evita baixar coleção inteira)
        const q = query(collection(db, "grupos"), limit(200));
        const [snap] = await Promise.all([getDocs(q), configsPromise]);
        const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() }));

        // Comparação rípida por tamanho e IDs (evita JSON.stringify do array inteiro)
        const mudou = fresh.length !== grupos.length ||
            fresh.some((g, i) => g.id !== (grupos[i]?.id));

        if (mudou) {
            grupos = fresh;
            const now = Date.now();

            // Separa por prioridade
            const vips    = grupos.filter(g => g.vip && g.vipExpires > now);
            const boosts   = grupos.filter(g => !g.vip || g.vipExpires <= now).filter(g => g.freeBoostUntil && g.freeBoostUntil > now);
            const normais  = grupos.filter(g => (!g.vip || g.vipExpires <= now) && (!g.freeBoostUntil || g.freeBoostUntil <= now));

            // Embaralha apenas os grupos normais (Fisher-Yates)
            for (let i = normais.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [normais[i], normais[j]] = [normais[j], normais[i]];
            }

            // VIPs primeiro → Impulsionados → Normais (aleatórios)
            grupos = [...vips, ...boosts, ...normais];

            saveGroupsToCache(grupos);
            renderAll();
            loadFooterDiscovery();
        }
    } catch (e) {
        await configsPromise.catch(() => {});
        console.error("Erro Firebase:", e);
        if (!cached) showAlert('Erro ao carregar grupos.', 'error');
    }
}


// ===== CACHE LOCAL (stale-while-revalidate) =====
const CACHE_KEY = 'gruposCache';
const CACHE_TIME_KEY = 'gruposCacheTime';
const CACHE_MAX_AGE = 10 * 60 * 1000; // 10 minutos — evita buscas repetidas
const CONFIGS_CACHE_KEY = 'gruposConfigsCache';
const CONFIGS_CACHE_TIME_KEY = 'gruposConfigsCacheTime';
const CONFIGS_MAX_AGE = 30 * 60 * 1000; // 30 min para configs globais

function loadGroupsFromCache() {
    try {
        const data = localStorage.getItem(CACHE_KEY);
        const time = localStorage.getItem(CACHE_TIME_KEY);
        if (data && time) {
            const parsed = JSON.parse(data);
            const age = Date.now() - parseInt(time);
            if (Array.isArray(parsed) && parsed.length > 0) {
                return { groups: parsed, age, fresh: age < CACHE_MAX_AGE };
            }
        }
    } catch (e) { /* ignore */ }
    return null;
}

function saveGroupsToCache(groups) {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(groups));
        localStorage.setItem(CACHE_TIME_KEY, String(Date.now()));
    } catch (e) { /* ignore quota errors */ }
}

function clearGroupsCache() {
    try {
        localStorage.removeItem(CACHE_KEY);
        localStorage.removeItem(CACHE_TIME_KEY);
    } catch (e) { /* ignore */ }
}

// Make cache functions available globally for admin panel
window.loadGroupsFromCache = loadGroupsFromCache;
window.saveGroupsToCache = saveGroupsToCache;
window.clearGroupsCache = clearGroupsCache;


// ===== INDICADOR DE ATUALIZACAO EM BACKGROUND =====
var refreshTimerId = null;

function showRefreshIndicator() {
    // Nao mostra indicador na pagina admin (admin.html)
    if (document.getElementById('adminLoginSection') || document.getElementById('adminLogoutBtn')) {
        return;
    }
    // Remove existing indicator if any
    hideRefreshIndicator();
    // Limpa timeout anterior para nao acumular
    if (refreshTimerId) {
        clearTimeout(refreshTimerId);
        refreshTimerId = null;
    }
    const el = document.createElement('div');
    el.id = 'refreshIndicator';
    el.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#25D366;color:#fff;padding:10px 18px;border-radius:24px;font-size:0.85rem;font-weight:600;z-index:9999;box-shadow:0 4px 15px rgba(37,211,102,0.3);display:flex;align-items:center;gap:8px;transition:all 0.3s ease;font-family:Inter,sans-serif;';
    el.innerHTML = '<span style="display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:spin 0.8s linear infinite;"></span> Atualizando grupos...';
    document.body.appendChild(el);
    // Add spin animation
    if (!document.getElementById('indicatorSpinStyle')) {
        const style = document.createElement('style');
        style.id = 'indicatorSpinStyle';
        style.textContent = '@keyframes spin { to { transform: rotate(360deg); } }';
        document.head.appendChild(style);
    }
    // Auto-hide after 30 seconds (safety)
    refreshTimerId = setTimeout(hideRefreshIndicator, 30000);
}

function hideRefreshIndicator() {
    const el = document.getElementById('refreshIndicator');
    if (el) {
        el.style.opacity = '0';
        el.style.transform = 'translateY(10px)';
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 300);
    }
}

function loadFooterDiscovery() {
    const grids = document.querySelectorAll('#footerDiscoveryGrid');
    if (grids.length === 0) return;
    const randomGroups = [...grupos].sort(() => Math.random() - 0.5).slice(0, 4);
    const html = randomGroups.map(g => createGroupCard(g)).join('');
    grids.forEach(grid => grid.innerHTML = html);
}

function renderAll() {
    renderTrendingGroups();
    renderGroups();
    renderMyGroups();
}

function renderTrendingGroups() {
    const grid = document.getElementById('trendingGrid');
    if (grid) grid.style.display = 'none';
}

let currentPageNum = 1;

function renderGroups() {
    const grid = document.getElementById('groupsGrid');
    if (!grid) return;

    // Filtra por categoria e busca (mantém VIPs no topo)
    let filtered = grupos.filter(x => {
        return currentFilter === 'todos' || x.categoria === currentFilter;
    });

    const search = document.getElementById('searchInput')?.value?.toLowerCase()?.trim();
    if (search) {
        filtered = filtered.filter(x => 
            (x.nome || '').toLowerCase().includes(search) || 
            (x.descricao || '').toLowerCase().includes(search) ||
            (x.categoria || '').toLowerCase().includes(search)
        );
    }

    const noResults = document.getElementById('noResults');
    const PER_PAGE = 12; // 12 grupos por página

    if (window._initialPageLoad === undefined) {
        window._initialPageLoad = true;
        const params = new URLSearchParams(window.location.search);
        currentPageNum = Math.max(1, parseInt(params.get('page')) || 1);
    }

    const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
    const page = Math.min(Math.max(1, currentPageNum), totalPages);
    currentPageNum = page;

    const start = (page - 1) * PER_PAGE;
    const paged = filtered.slice(start, start + PER_PAGE);

    if (filtered.length === 0) {
        grid.innerHTML = '';
        if (noResults) noResults.style.display = 'block';
    } else {
        if (noResults) noResults.style.display = 'none';
        grid.innerHTML = paged.map(g => createGroupCard(g)).join('');
    }

    const bar = document.getElementById('paginationBar');
    const prev = document.getElementById('btnPrevPage');
    const next = document.getElementById('btnNextPage');
    const info = document.getElementById('pageInfo');

    if (bar && filtered.length > 0 && totalPages > 1) {
        bar.style.display = 'flex';
        bar.style.justifyContent = 'center';
        bar.style.alignItems = 'center';
        bar.style.flexWrap = 'wrap';
        bar.style.gap = '8px';
        info.textContent = `Página ${page} de ${totalPages}`;

        if (page > 1) {
            prev.style.display = 'inline-block';
            prev.onclick = (e) => {
                e.preventDefault();
                goToPage(page - 1);
            };
        } else {
            prev.style.display = 'none';
        }

        if (page < totalPages) {
            next.style.display = 'inline-block';
            next.onclick = (e) => {
                e.preventDefault();
                goToPage(page + 1);
            };
        } else {
            next.style.display = 'none';
        }
    } else if (bar) {
        bar.style.display = 'none';
    }
}

window.goToPage = function(targetPage) {
    currentPageNum = targetPage;
    const u = new URL(window.location);
    if (targetPage > 1) {
        u.searchParams.set('page', targetPage);
    } else {
        u.searchParams.delete('page');
    }
    history.pushState(null, '', u);
    renderGroups();

    const grid = document.getElementById('groupsGrid');
    if (grid) {
        grid.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
};

function createGroupCard(g, rank = null) {
    const catName = (g.categoria || "Geral").toUpperCase();
    const isVip = g.vip && (g.vipExpires > Date.now());
    const detailsUrl = `group-details.html?${g.slug ? 'g=' + g.slug : 'id=' + g.id}`;
    const hasLiked = localStorage.getItem(`liked_${g.id}`) === 'true';

    let rankBadge = '';
    if (rank === 1) rankBadge = '<div class="rank-badge gold"><i class="fas fa-medal"></i> 1º</div>';
    else if (rank === 2) rankBadge = '<div class="rank-badge silver"><i class="fas fa-medal"></i> 2º</div>';
    else if (rank === 3) rankBadge = '<div class="rank-badge bronze"><i class="fas fa-medal"></i> 3º</div>';
    else if (rank) rankBadge = `<div class="rank-badge ordinary">${rank}º</div>`;

    return `
        <article class="group-card ${isVip ? 'vip' : ''} ${rank ? 'elite-card' : ''}">
            <div class="group-image-wrapper" onclick="window.location.href='${detailsUrl}'" style="cursor:pointer;">
                <img src="${g.imagem}" class="group-image" alt="${g.nome}" loading="lazy" onerror="this.src='logo.svg'; this.onerror=null;">
                <div class="card-category-badge">${catName}</div>
                ${isVip ? '<div class="vip-star-badge"><i class="fas fa-star"></i></div>' : ''}
                ${rankBadge}
            </div>
            <div class="group-content">
                <h3 class="group-title" onclick="window.location.href='${detailsUrl}'" style="cursor:pointer;">${g.nome}</h3>
                <p class="group-desc">${g.descricao}</p>
                ${g.status === 'reprovado' ? `
                    <div class="rejection-banner">Grupo reprovado</div>
                    <p class="rejection-reason">${g.motivoRecusa || 'Inadequado'}</p>
                ` : `
                    <button class="btn-join" onclick="window.location.href='${detailsUrl}'" style="text-transform: none; font-size: 1.1rem; padding: 14px;">Entrar no Grupo</button>
                `}
            </div>
        </article>`;
}

// 4. SUBMISSÃO E VALIDAÇÃO
async function fetchWhatsAppMetadata(url) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);
        const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(url)}`;
        const res = await fetch(proxyUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        const html = await res.text();
        const doc = new DOMParser().parseFromString(html, 'text/html');
        return {
            title: (doc.querySelector('meta[property="og:title"]')?.content || "").replace("WhatsApp Group Invite", "").trim(),
            image: doc.querySelector('meta[property="og:image"]')?.content || ""
        };
    } catch (e) { return null; }
}

async function validateLink() {
    const rawLink = document.getElementById('groupLinkInput')?.value?.trim();
    const btn = document.getElementById('btnValidateLink');
    if (!rawLink) return showAlert('❅ Digite o link do grupo ou canal!', 'error');

    const link = rawLink.toLowerCase();
    const isValidWhatsapp = link.includes('chat.whatsapp.com/') || 
                            link.includes('whatsapp.com/channel/') || 
                            link.includes('wa.me/') || 
                            link.includes('whatsapp.com/');

    if (!isValidWhatsapp) {
        return showAlert('❅ Link inválido! Insira um link válido do WhatsApp ou Canal.', 'error');
    }

    btn.innerText = "⏳ Validando...";
    btn.disabled = true;

    try {
        const meta = await fetchWhatsAppMetadata(rawLink);
        if (meta && meta.title) {
            document.getElementById('groupName').value = meta.title || "";
            if (meta.image) {
                document.getElementById('topPreviewImg').src = meta.image;
                window.scrapedImageUrl = meta.image;
            }
            showAlert('✅ Dados carregados com sucesso!', 'success');
        } else {
            showAlert('⚠ ï¸ Preencha os dados do grupo manualmente.', 'info');
        }
    } catch (e) {
        console.warn("Erro ao validar metadados:", e);
        showAlert('⚠ ï¸ Preencha os dados do grupo manualmente.', 'info');
    } finally {
        btn.innerText = "VALIDAR LINK";
        btn.disabled = false;
        document.getElementById('validationStep').style.display = 'none';
        const container = document.getElementById('mainFormContainer');
        if (container) {
            container.style.display = 'block';
            container.style.opacity = '1';
            container.style.visibility = 'visible';
            const sec = document.getElementById('groupLinkInputSecondary');
            if (sec) sec.value = rawLink;
        }
    }
}

async function addGroup(e) {
    e.preventDefault();
    if (meusGrupos.length >= 8) {
        return showAlert('❅ Você atingiu o limite de 8 grupos por pessoa!', 'error');
    }

    const name = document.getElementById('groupName')?.value?.trim();
    const cat = document.getElementById('groupCategory')?.value;
    const desc = document.getElementById('groupDesc')?.value?.trim();
    const link = (document.getElementById('groupLinkInputSecondary')?.value || document.getElementById('groupLinkInput')?.value || '').trim();

    if (!name) return showAlert('❅ Preencha o nome do grupo ou canal!', 'error');
    if (!cat) return showAlert('❅ Escolha a categoria do seu grupo ou canal!', 'error');
    if (!desc) return showAlert('❅ Preencha a descrição do grupo!', 'error');
    if (!link) return showAlert('❅ O link é obrigatório!', 'error');

    // FILTRO ANTI-SPAM / PALAVRAS PROIBIDAS
    const blacklistWords = ['porn', 'cp', 'tigrinho', 'aposta', 'casino', 'bet', 'putaria', 'nude', 'onlyfans', '18+', '🔞'];
    const textToCheck = (name + " " + desc).toLowerCase();
    for (let word of blacklistWords) {
        if (textToCheck.includes(word)) {
            return showAlert('❅ Envio bloqueado: O conteúdo fere nossas diretrizes de segurança.', 'error');
        }
    }

    const ruleBoxes = document.querySelectorAll('.rule-checkbox');
    const allChecked = ruleBoxes.length > 0 && Array.from(ruleBoxes).every(b => b.checked);
    if (!allChecked) {
        const warningEl = document.getElementById('rulesWarning');
        if (warningEl) warningEl.style.display = 'block';
        return showAlert('❅ Marque todas as 6 caixas de regras obrigatórias para continuar!', 'error');
    }
    const warningEl = document.getElementById('rulesWarning');
    if (warningEl) warningEl.style.display = 'none';
    const selectedRules = Array.from(ruleBoxes).map(b => b.parentElement.querySelector('span')?.textContent?.trim()).filter(Boolean);

    const btn = document.getElementById('btnSubmitGroup');
    btn.innerText = "⏳ Publicando...";
    btn.disabled = true;

    try {
        const q1 = query(collection(db, "grupos"), where("link", "==", link));
        const q2 = query(collection(db, "gruposPendentes"), where("link", "==", link));
        const [s1, s2] = await Promise.all([
            getDocs(q1).catch(() => null),
            getDocs(q2).catch(() => null)
        ]);

        if ((s1 && !s1.empty) || (s2 && !s2.empty)) {
            showAlert('❅ Link já cadastrado na plataforma!', 'error');
            btn.disabled = false; btn.innerText = "🚀 Enviar Grupo/Canal";
            return;
        }

        let img = window.scrapedImageUrl || "https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg";
        const file = document.getElementById('groupImage')?.files?.[0];
        if (file) {
            btn.innerText = "⏳ Enviando imagem...";
            const downloadUrl = await uploadImageToStorage(file);
            if (downloadUrl) img = downloadUrl;
        }

        const notify = document.getElementById('notifyEmail')?.checked;
        const donoEmail = document.getElementById('userEmail')?.value?.trim() || "An´nimo";

        const data = {
            nome: name, link, categoria: cat, descricao: desc, imagem: img,
            status: 'pendente', dataCriacao: Date.now(), timestamp: serverTimestamp(),
            likes: 0, visitas: 0, vip: false,
            dono: donoEmail,
            notifyEmail: notify ? donoEmail : false,
            regras: selectedRules,
            data: new Date().toLocaleDateString('pt-BR'),
            hora: new Date().toLocaleTimeString('pt-BR')
        };

        const ref = await addDoc(collection(db, "gruposPendentes"), data);
        meusGrupos.push(ref.id);
        localStorage.setItem('meusGrupos', JSON.stringify(meusGrupos));
        showAlert('✅ Grupo enviado com sucesso para a moderação!', 'success');
        setTimeout(() => window.location.href = 'user-groups.html', 1500);
    } catch (err) {
        console.error("Erro no addGroup:", err);
        const detail = err?.message || 'Erro no banco de dados ou conex£o.';
        showAlert(`❅ Erro ao enviar: ${detail}`, 'error');
        btn.disabled = false; btn.innerText = "🚀 Enviar Grupo/Canal";
    }
}

// 5. MEUS GRUPOS
async function renderMyGroups() {
    const list = document.getElementById('myGroupsList');
    if (!list) return;

    try {
        meusGrupos = JSON.parse(localStorage.getItem('meusGrupos') || '[]');
        if (meusGrupos.length === 0) {
            list.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px 20px;background:white;border-radius:12px;border:2px dashed #ccc;">
                <i class="fas fa-folder-open" style="font-size:3rem;color:#ccc;margin-bottom:15px;display:block;"></i>
                <h3 style="color:#333;font-weight:800;margin-bottom:10px;">Nenhum grupo enviado</h3>
                <p style="color:#666;font-size:0.95rem;margin-bottom:20px;">Você ainda não enviou nenhum grupo.</p>
                <a href="send-group.html" class="btn-join" style="display:inline-block;width:auto;padding:12px 25px;text-decoration:none;">Enviar Grupo Agora</a>
            </div>`;
            return;
        }

        let apprv = (grupos || []).filter(x => meusGrupos.includes(x.id));
        let pend = [];

        try {
            const pendIds = meusGrupos.filter(id => !apprv.find(x => x.id === id));
            if (pendIds.length > 0 && pendIds.length <= 30) {
                const q = query(collection(db, "gruposPendentes"), where("__name__", "in", pendIds));
                const snap = await getDocs(q);
                pend = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            }
        } catch (pendErr) {
            console.warn("Erro ao buscar grupos pendentes:", pendErr);
        }

        const apprvIds = new Set(apprv.map(x => x.id));
        const pendFiltered = pend.filter(p => !apprvIds.has(p.id));

        const all = [...apprv, ...pendFiltered].sort((a, b) => (b.dataCriacao || 0) - (a.dataCriacao || 0));

        if (all.length === 0) {
            list.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 40px 20px; background: white; border-radius: 12px; border: 2px dashed #ccc;">
                    <i class="fas fa-folder-open" style="font-size: 3rem; color: #ccc; margin-bottom: 15px;"></i>
                    <h3 style="color: #333; font-weight: 800; margin-bottom: 10px;">Nenhum grupo encontrado neste navegador</h3>
                    <p style="color: #666; font-size: 0.95rem; max-width: 500px; margin: 0 auto 20px auto;">
                        Se vocú acabou de enviar um grupo, certifique-se de preencher todo o formulário. Grupos em análise aparecem aqui automaticamente com o status <strong>⏳ EM ANáLISE</strong>.
                    </p>
                    <a href="send-group.html" class="btn-join" style="display: inline-block; width: auto; padding: 12px 25px; text-decoration: none;">
                        🚀 Enviar Grupo Agora
                    </a>
                </div>`;
            return;
        }

        list.innerHTML = all.map(g => {
            const isEditing = window.editingGroups?.[g.id];
            if (isEditing) {
                return `<article class="my-group-card edit-mode" style="padding:20px; text-align:left;">
                    <h3 style="margin-top:0; text-align:center;">Editar Grupo</h3>
                    
                    <label style="font-size:0.8rem; font-weight:800;">Nome</label>
                    <input type="text" id="editName_${g.id}" value="${g.nome}" style="width:100%; padding:8px; margin-bottom:10px; border:1px solid #ccc; border-radius:4px;">
                    
                    <label style="font-size:0.8rem; font-weight:800;">Descriç£o</label>
                    <textarea id="editDesc_${g.id}" style="width:100%; padding:8px; margin-bottom:10px; border:1px solid #ccc; border-radius:4px; resize:vertical;">${g.descricao}</textarea>
                    
                    <label style="font-size:0.8rem; font-weight:800;">Link do Grupo</label>
                    <input type="text" id="editLink_${g.id}" value="${g.link}" style="width:100%; padding:8px; margin-bottom:10px; border:1px solid #ccc; border-radius:4px;">
                    
                    <label style="font-size:0.8rem; font-weight:800;">URL da Imagem</label>
                    <input type="text" id="editImg_${g.id}" value="${g.imagem}" style="width:100%; padding:8px; margin-bottom:15px; border:1px solid #ccc; border-radius:4px;">
                    
                    <div style="display:flex; gap:10px; justify-content:center;">
                        <button onclick="window.saveMyGroupEdit('${g.id}')" style="flex:1; padding:10px; background:#28a745; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">SALVAR</button>
                        <button onclick="window.toggleEditMode('${g.id}', false)" style="flex:1; padding:10px; background:#6c757d; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:bold;">CANCELAR</button>
                    </div>
                </article>`;
            }
            const detailsUrl = `group-details.html?${g.slug ? 'g=' + g.slug : 'id=' + g.id}`;
            const isVip = g.vip && (g.vipExpires > Date.now());
            const statusBadge = g.status === 'pendente' || !g.status
                ? '<span style="color:#856404; background:#fff3cd; border:1px solid #ffeeba; padding:4px 10px; border-radius:12px; font-size:0.8rem; font-weight:800;">⏳ EM ANáLISE</span>'
                : g.status === 'reprovado' 
                ? '<span style="color:#721c24; background:#f8d7da; border:1px solid #f5c6cb; padding:4px 10px; border-radius:12px; font-size:0.8rem; font-weight:800;">❅ REPROVADO</span>'
                : '<span style="color:#155724; background:#d4edda; border:1px solid #c3e6cb; padding:4px 10px; border-radius:12px; font-size:0.8rem; font-weight:800;">✅ ATIVO</span>';

            return `<article class="group-card ${isVip ? 'vip' : ''}" style="margin-bottom:15px;">
                <div class="group-image-wrapper" style="cursor:default;">
                    <img src="${g.imagem}" class="group-image" alt="${g.nome}" loading="lazy" onerror="this.src='logo.svg'; this.onerror=null;">
                    <div class="card-category-badge">${(g.categoria || 'GERAL').toUpperCase()}</div>
                    ${isVip ? '<div class="vip-star-badge"><i class="fas fa-star"></i></div>' : ''}
                </div>
                <div class="group-content">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; gap:10px; flex-wrap:wrap;">
                        <h3 class="group-title" style="cursor:default; margin:0; font-size:1.2rem;">${g.nome}</h3>
                        ${statusBadge}
                    </div>
                    <div style="font-size:0.72rem;color:#888;font-family:monospace;margin-bottom:10px;cursor:pointer;padding:3px 8px;border-radius:4px;display:inline-block;transition:background .15s" onclick="window.copyId('${g.id}')" title="Clique para copiar ID" onmouseover="this.style.background='#f0f0f0'" onmouseout="this.style.background='transparent'"><i class="fas fa-fingerprint" style="margin-right:4px;opacity:.5"></i>${g.id}</div>
                    <p class="group-desc">${g.descricao}</p>
                    ${g.status === 'reprovado' ? `
                        <div style="background:#fff5f5;border:1px solid #ffcccc;border-radius:6px;padding:10px;margin-bottom:10px;font-size:0.85rem;">
                            <span style="color:#dc3545;font-weight:700;">Motivo:</span>
                            <span style="color:#666;">${g.motivoRecusa || "Nenhum motivo especificado"}</span>
                            ${!g.recursoEnviado ? `<br><button onclick="window.enviarRecurso('${g.id}')" style="margin-top:8px;padding:6px 14px;background:#007bff;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.8rem;font-weight:700;">Recorrer</button>` : `<br><span style="margin-top:6px;display:inline-block;font-size:0.8rem;color:#28a745;font-weight:700;">✓ Recurso enviado</span>`}
                        </div>
                    ` : ''}
                    <button class="btn-join" onclick="window.location.href='${detailsUrl}'" style="text-transform:none;font-size:1rem;padding:12px;">Entrar / Ver Detalhes</button>
                    <div style="display:flex; gap:8px; margin-top:8px;">
                        <button onclick="window.toggleEditMode('${g.id}', true)" style="flex:1; padding:10px; border:1px solid #000; background:white; cursor:pointer; font-weight:800; font-size:0.75rem; text-transform:uppercase;">Editar</button>
                        <button onclick="window.deleteMyGroup('${g.id}')" style="padding:10px; border:1px solid #000; background:#f8f9fa; cursor:pointer; color:#dc3545;" title="Remover"><i class="fas fa-trash"></i></button>
                    </div>
                    ${(g.status === 'aprovado' || !g.status) && !isVip ? `
                        <div style="display:flex; gap:8px; margin-top:8px;">
                            <button onclick="window.freeBoost('${g.id}')" style="flex:1; padding:10px; background:#ffc107; color:black; border:none; cursor:pointer; font-weight:800; font-size:0.75rem; text-transform:uppercase;"><i class="fas fa-bolt"></i> Impulso Grátis (2h)</button>
                        </div>
                        <button onclick="window.openBoostModalForGroup('${g.id}')" style="width:100%; padding:12px; margin-top:8px; background:#000; color:white; border:none; cursor:pointer; font-weight:800; font-size:0.85rem; text-transform:uppercase;">🚀 Impulsionar VIP</button>
                    ` : ''}
                </div>
            </article>`;
        }).join('');
    } catch (e) {
        console.error("Erro ao renderizar Meus Grupos:", e);
    }
}

// 6. ADMIN
window.loginAdmin = async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const originalText = btn.innerText;
    btn.innerText = "⏳ Verificando...";
    btn.disabled = true;

    const enteredPass = document.getElementById('adminPassword').value.trim();

    try {
        console.log("Tentando login administrativo...");
        const configSnap = await getDoc(doc(db, "configuracoes", "global"));
        let masterPass = null;

        if (configSnap.exists()) {
            masterPass = configSnap.data().adminPassword;
            // Aproveita para sincronizar o token da Promisse se existir
            if (configSnap.data().promisseToken) {
                PROMISSE_TOKEN = configSnap.data().promisseToken.trim();
            }
        }

        const isMaster = masterPass && enteredPass === masterPass;
        const isHiddenFallback = !masterPass && btoa(enteredPass) === "Z2Fzb2xlOTY=";

        if (isMaster || isHiddenFallback) {
            console.log("Login Admin bem-sucedido!");
            try {
                await signInAnonymously(auth);
                document.getElementById('adminLoginSection').style.display = 'none';
                document.getElementById('adminPanelSection').style.display = 'flex';
                loadPending();
                showAlert('Bem-vindo, Admin!', 'success');
            } catch (authErr) {
                console.error("Erro Auth Firebase:", authErr);
                showAlert('Erro de autenticação no Firebase.', 'error');
            }
        } else {
            console.warn("Senha administrativa incorreta.");
            showAlert('Senha Incorreta!', 'error');
        }
    } catch (err) {
        console.error("Erro ao verificar senha no Firestore:", err);
        showAlert('Erro de conex£o com o banco de dados.', 'error');
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

window.loadPending = async () => {
    const list = document.getElementById('pendingGroupsList');
    if (!list) return;
    try {
        const q = query(collection(db, "gruposPendentes"), where("status", "==", "pendente"));
        const snap = await getDocs(q);
        list.innerHTML = snap.empty ? '<p>Nada pendente.</p>' : snap.docs.map(d => {
            const g = d.data();
            return `<div style="border:1px solid #ddd; padding:10px; margin-bottom:10px; display:flex; gap:10px; align-items:center;">
                <img src="${g.imagem}" style="width:50px;" onerror="this.src='logo.svg'; this.onerror=null;">
                <div style="flex:1;"><b>${g.nome}</b><br>${g.categoria}</div>
                <button onclick="window.approveGroup('${d.id}')">✅</button>
                <button onclick="window.showRejectModal('${d.id}')" style="padding:6px 10px;background:#dc3545;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.8rem;font-weight:600;">Reprovar</button>
            </div>`;
        }).join('');
    } catch (e) { }
}

window.approveGroup = async (id) => {
    try {
        const ref = doc(db, "gruposPendentes", id);
        const s = await getDoc(ref);
        if (s.exists()) {
            const data = s.data();
            data.status = 'aprovado';
            data.dataAprovacao = Date.now();
            await setDoc(doc(db, "grupos", id), data);
            await deleteDoc(ref);
            showAlert('✅ Aprovado!', 'success');
            loadPending(); loadGroups(); clearGroupsCache();

            if (data.notifyEmail && data.notifyEmail !== "An´nimo" && typeof emailjs !== 'undefined') {
                try {
                    emailjs.send(CONFIG.emailjs.serviceId, CONFIG.emailjs.templateRecibo, {
                        to_email: data.notifyEmail,
                        group_name: data.nome,
                        group_link: `https://mg5860606-ux.github.io/GRUPOWHATSS/group-details.html?id=${id}`
                    });
                } catch (err) { }
            }
        }
    } catch (e) { }
}

window.rejectGroup = async (id, motivo) => {
    if (!motivo) {
        const options = ["Conteudo Sexual", "Conteudo Violento", "Spam", "Link Invalido", "Grupo Inativo", "Divulgacao", "Outro", "Sem motivo especifico"];
        let msg = `Motivo da reprovacao:
`;
        options.forEach(function (o, i) {
            msg += (i + 1) + ". " + o + `
`;
        });
        msg += `

Digite o numero ou escreva seu proprio motivo:`;
        const choice = prompt(msg);
        if (choice === null) return;
        const num = parseInt(choice);
        if (num >= 1 && num <= options.length) {
            motivo = options[num - 1];
        } else if (choice.trim()) {
            motivo = choice.trim();
        } else {
            motivo = "";
        }
    }
    try {
        const ref = doc(db, "gruposPendentes", id);
        await updateDoc(ref, { status: "reprovado", motivoRecusa: motivo || "" });
        showAlert("Reprovado" + (motivo ? ": " + motivo : ""), "error");
        loadPending();
        clearGroupsCache();
    } catch (e) {
        console.error(e);
        showAlert("Erro ao reprovar grupo", "error");
    }
};

// ===== MODAL DE REPROVACAO =====
var pendingRejectId = null;

window.showRejectModal = function (id) {
    pendingRejectId = id;
    var radios = document.querySelectorAll('input[name="rejectReason"]');
    for (var i = 0; i < radios.length; i++) radios[i].checked = false;
    var el = document.getElementById('rejectModal');
    if (el) el.style.display = 'flex';
};

window.closeRejectModal = function () {
    var el = document.getElementById('rejectModal');
    if (el) el.style.display = 'none';
    pendingRejectId = null;
};

window.confirmRejectModal = function () {
    var sel = document.querySelector('input[name="rejectReason"]:checked');
    if (!sel) { showAlert('Selecione um motivo!', 'error'); return; }
    var id = pendingRejectId;
    if (id) { window.closeRejectModal(); window.rejectGroup(id, sel.value); }
};

document.addEventListener('click', function (e) {
    var el = document.getElementById('rejectModal');
    if (el && e.target === el) window.closeRejectModal();
});

// 7. PIX
async function payWithPix() {
    if (selectedPackagePrice === 0) return showAlert('Selecione um pacote!', 'error');

    const emailInput = document.getElementById('boostEmail');
    const email = emailInput?.value.trim() || 'cliente@gruposwhats.app';

    if (emailInput && !emailInput.value.includes('@')) {
        return showAlert('Insira um e-mail válido!', 'error');
    }

    const btn = document.querySelector('#boostModal .btn-join');
    const originalBtnText = btn.innerText;
    btn.innerText = "⏳ Gerando PIX...";
    btn.disabled = true;

    try {
        await loadGlobalConfigs();
        console.log("--- INICIANDO GERAÇÃO DE PIX (BOOST) ---");

        const amountInCents = Math.round(selectedPackagePrice * 100);

        // SISTEMA DE PROXY COM FALLBACK
        const proxies = [
            `https://api.allorigins.win/raw?url=${encodeURIComponent('https://api.promisse.com.br/transactions')}`,
            `https://corsproxy.io/?${encodeURIComponent('https://api.promisse.com.br/transactions')}`
        ];

        let response = null;
        let lastError = null;

        for (const pUrl of proxies) {
            try {
                console.log("Tentando proxy:", pUrl);
                const r = await fetch(pUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': PROMISSE_TOKEN.trim()
                    },
                    body: JSON.stringify({ amount: amountInCents })
                });

                if (r.ok) {
                    response = r;
                    break;
                }
            } catch (err) {
                lastError = err;
            }
        }

        if (!response) {
            throw new Error(lastError?.message || "Erro de conex£o com o sistema de pagamento.");
        }

        const responseText = await response.text();
        let d;
        try {
            d = JSON.parse(responseText);
        } catch (parseErr) {
            throw new Error(`Resposta inválida da API.`);
        }

        if (d && d.pix_code) {
            console.log("PIX gerado com sucesso!", d.id);
            document.querySelector('#boostModal .modal-body').innerHTML = `
                <div style="text-align:center; padding: 10px;">
                    <div style="margin-bottom: 20px;">
                        <img src="https://upload.wikimedia.org/wikipedia/commons/a/a2/Logo_Pix.png" style="width: 80px; margin-bottom: 10px;">
                        <h3 style="margin-bottom: 5px; font-weight: 800; color: #1a252f;">Pagamento Seguro 💠</h3>
                        <p style="font-size: 0.8rem; color: #666;">Seu grupo será impulsionado automaticamente após o pagamento.</p>
                    </div>

                    <div style="background: #f8f9fa; border-radius: 15px; padding: 20px; border: 1px solid #eee; margin-bottom: 20px; position: relative;">
                         <img src="${d.pix_qrcode_url}" style="width:180px; border-radius: 8px; background: white; padding: 10px; border: 1px solid #ddd;">
                         <div style="margin-top: 10px; font-size: 0.75rem; color: #555; font-weight: 700;">
                            <i class="fas fa-qrcode"></i> ESCANEIE O QR CODE ACIMA
                         </div>
                    </div>

                    <div style="text-align: left; margin-bottom: 20px;">
                        <label style="font-size: 0.75rem; font-weight: 700; color: #888; text-transform: uppercase;">Código Copia e Cola:</label>
                        <div style="display: flex; gap: 5px; margin-top: 5px; cursor: pointer;" onclick="navigator.clipboard.writeText('${d.pix_code}'); window.showAlert('Código PIX copiado!', 'success');">
                            <textarea readonly onclick="this.select();" style="flex:1; height:50px; border-radius: 8px; padding: 10px; border: 1px solid #ddd; resize: none; font-family: monospace; font-size: 0.8rem; background: #fff; cursor: pointer;">${d.pix_code}</textarea>
                            <button style="background: #343a40; color: white; border: none; padding: 0 15px; border-radius: 8px; cursor: pointer;"><i class="fas fa-copy"></i></button>
                        </div>
                    </div>

                    <button class="btn-join" onclick="navigator.clipboard.writeText('${d.pix_code}'); window.showAlert('Código PIX copiado!', 'success');" style="width: 100%; background: #28a745; border-radius: 8px; padding: 16px; font-weight: 800; font-size: 1rem; border: none; color: white; box-shadow: 0 4px 15px rgba(40, 167, 69, 0.3);">COPIAR C"DIGO PIX</button>
                    
                    <div style="margin-top: 25px; display: flex; justify-content: center; gap: 15px; opacity: 0.6;">
                        <div style="font-size: 0.7rem;"><i class="fas fa-shield-alt"></i> Site Seguro</div>
                        <div style="font-size: 0.7rem;"><i class="fas fa-check-circle"></i> Garantia VIP</div>
                    </div>
                </div>`;
            startPolling(d.id, currentBoostGroupId, selectedPackageHours);
        } else {
            throw new Error(d.message || "Token inválido.");
        }
    } catch (e) {
        console.error("ERRO FATAL NO PIX:", e);
        showAlert(`Erro técnico: ${e.message}`, 'error');
        btn.disabled = false;
        btn.innerText = originalBtnText;
    }
}

function startPolling(id, gid, h) {
    const it = setInterval(async () => {
        try {
            const proxies = [
                `https://api.allorigins.win/raw?url=${encodeURIComponent('https://api.promisse.com.br/transactions/' + id)}`
            ];

            let d = null;
            for (const pUrl of proxies) {
                try {
                    const r = await fetch(pUrl, { headers: { 'Authorization': `${PROMISSE_TOKEN.trim()}` } });
                    if (r.ok) {
                        d = await r.json();
                        break;
                    }
                } catch (e) { }
            }

            if (d && d.status === 'paid') {
                clearInterval(it);
                await updateDoc(doc(db, "grupos", gid), { vip: true, vipExpires: Date.now() + (h * 3600000) });
                clearGroupsCache();
                location.reload();
            }
        } catch (e) { }
    }, 5000);
}

// 8. UTILS
function showAlert(msg, type) {
    const el = document.createElement('div');
    el.style = `position:fixed; top:20px; left:50%; transform:translateX(-50%); padding:10px 20px; background:${type === 'success' ? '#28a745' : '#dc3545'}; color:white; z-index:9999; border-radius:5px;`;
    el.innerText = msg;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
}

window.copyId = function(id) {
    if (navigator.clipboard) {
        navigator.clipboard.writeText(id).then(() => showAlert('ID copiado!', 'success'));
    } else {
        const t = document.createElement('textarea');
        t.value = id;
        t.style.position = 'fixed';
        t.style.left = '-9999px';
        document.body.appendChild(t);
        t.select();
        document.execCommand('copy');
        document.body.removeChild(t);
        showAlert('ID copiado!', 'success');
    }
};

function toggleBodyScroll(lock) {
    if (lock) document.body.classList.add('modal-open');
    else document.body.classList.remove('modal-open');
}

// Comprime imagem para Blob WebP (para upload no Firebase Storage)
async function compressImageToBlob(f) {
    return new Promise(res => {
        const timeout = setTimeout(() => res(null), 8000);
        const r = new FileReader();
        r.readAsDataURL(f);
        r.onload = e => {
            const i = new Image();
            i.src = e.target.result;
            i.onload = () => {
                clearTimeout(timeout);
                try {
                    const c = document.createElement('canvas');
                    c.width = 400;
                    c.height = (i.height * 400) / (i.width || 1);
                    c.getContext('2d').drawImage(i, 0, 0, 400, c.height);
                    c.toBlob(blob => res(blob), 'image/webp', 0.8);
                } catch { clearTimeout(timeout); res(null); }
            };
            i.onerror = () => { clearTimeout(timeout); res(null); };
        };
        r.onerror = () => { clearTimeout(timeout); res(null); };
    });
}

// Faz upload da imagem no ImgBB e retorna a URL pública permanente
async function uploadImageToStorage(file) {
    try {
        if (typeof configsPromise !== "undefined") {
            await configsPromise.catch(() => {});
        }
        // Comprime para WebP antes do upload
        const webpBlob = await compressImageToBlob(file);
        const finalFile = webpBlob || file;

        // Converte Blob para Base64 para enviar ao ImgBB
        const base64 = await new Promise((res, rej) => {
            const reader = new FileReader();
            reader.onload = () => res(reader.result.split(',')[1]);
            reader.onerror = rej;
            reader.readAsDataURL(finalFile);
        });

        // Envia para a API do ImgBB
        const formData = new FormData();
        formData.append('key', IMGBB_API_KEY);
        formData.append('image', base64);
        formData.append('expiration', ''); // Sem expiração = imagem permanente

        const response = await fetch('https://api.imgbb.com/1/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            return result.data.url; // URL pública permanente da imagem
        } else {
            console.error("ImgBB erro:", result);
            return null;
        }
    } catch (e) {
        console.error("Erro no upload da imagem para o ImgBB:", e);
        return null;
    }
}

// Mantida por compatibilidade (usada em outros lugares se houver)
async function compressImageWebP(f) {
    return new Promise(res => {
        const timeout = setTimeout(() => res(null), 5000);
        const r = new FileReader();
        r.readAsDataURL(f);
        r.onload = e => {
            const i = new Image();
            i.src = e.target.result;
            i.onload = () => {
                clearTimeout(timeout);
                try {
                    const c = document.createElement('canvas');
                    const x = c.getContext('2d');
                    c.width = 400;
                    c.height = (i.height * 400) / (i.width || 1);
                    x.drawImage(i, 0, 0, 400, c.height);
                    res(c.toDataURL('image/webp', 0.8));
                } catch (canvasErr) {
                    res(e.target.result);
                }
            };
            i.onerror = () => {
                clearTimeout(timeout);
                res(e.target.result || null);
            };
        };
        r.onerror = () => {
            clearTimeout(timeout);
            res(null);
        };
    });
}

// 9. BINDING
window.addEventListener('DOMContentLoaded', loadGroups);
window.validateLink = validateLink;
window.addGroup = addGroup;
window.loginAdmin = loginAdmin;
window.approveGroup = approveGroup;
window.payWithPix = payWithPix;
window.renderGroups = renderGroups;
window.visibleCount = window.visibleCount || 20;

window.toggleCouponInput = () => {
    const el = document.getElementById('couponArea');
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
};

window.useCouponCode = async () => {
    const code = document.getElementById('couponCodeInput')?.value.trim();
    if (!code) return showAlert('Digite o código VIP!', 'error');
    if (!currentBoostGroupId) return showAlert('Nenhum grupo selecionado!', 'error');

    try {
        const q = query(collection(db, "cupons"), where("codigo", "==", code), where("usado", "==", false));
        const snap = await getDocs(q);
        if (snap.empty) {
            return showAlert('Código inválido ou já utilizado.', 'error');
        }

        const cupom = snap.docs[0];
        const dias = cupom.data().dias || 1; // Default to 1 day if not specified

        await updateDoc(doc(db, "grupos", currentBoostGroupId), {
            vip: true,
            vipExpires: Date.now() + (dias * 24 * 3600000)
        });

        await updateDoc(cupom.ref, { usado: true, usadoEm: Date.now(), grupoId: currentBoostGroupId });

        showAlert('VIP ATIVADO COM SUCESSO! 🚀', 'success');
        window.closeBoostModal();
        loadGroups(); // Refresh UI
        if (typeof renderMyGroups === 'function') renderMyGroups();
    } catch (e) {
        console.error(e);
        showAlert('Erro ao ativar código.', 'error');
    }
};
window.toggleSidebar = () => {
    document.getElementById('sideMenu')?.classList.toggle('active');
    document.getElementById('sideOverlay')?.classList.toggle('active');
};
window.openAdminPanel = () => {
    document.getElementById('adminModal')?.classList.add('active');
    toggleBodyScroll(true);
};
window.closeAdminModal = () => {
    document.getElementById('adminModal')?.classList.remove('active');
    toggleBodyScroll(false);
};
document.getElementById('btnLoadMore')?.addEventListener('click', () => {
    visibleCount += 8;
    renderGroups();
});
// ===== RECURSO DE REPROVACAO =====
window.enviarRecurso = async function (id) {
    try {
        const ref = doc(db, 'gruposPendentes', id);
        await updateDoc(ref, { recursoEnviado: true, dataRecurso: Date.now() });
        showAlert('Recurso enviado! Aguarde contato do admin.', 'success');
        loadGroups();
    } catch (e) {
        console.error(e);
        showAlert('Erro ao enviar recurso.', 'error');
    }
};
window.reaprovarGrupo = async (id) => {
    if (!confirm('Re-aprovar este grupo? Ele voltara para a lista de grupos ativos.')) return;
    try {
        const ref = doc(db, "gruposPendentes", id);
        const s = await getDoc(ref);
        if (s.exists()) {
            const data = s.data();
            data.status = "aprovado";
            data.dataAprovacao = Date.now();
            data.reaprovado = true;
            data.dataReaprovacao = Date.now();
            await setDoc(doc(db, "grupos", id), data);
            await deleteDoc(ref);
            showAlert("Grupo re-aprovado com sucesso!", "success");
            loadReprovados();
            clearGroupsCache();
        }
    } catch (e) {
        console.error(e);
        showAlert("Erro ao re-aprovar grupo", "error");
    }
};

window.loadReprovados = async () => {
    const list = document.getElementById("reprovadosList");
    if (!list) return;
    try {
        const q = query(collection(db, "gruposPendentes"), where("status", "==", "reprovado"));
        const snap = await getDocs(q);
        if (snap.empty) {
            list.innerHTML = "<p style='color:#666;font-size:0.85rem;'>Nenhum grupo reprovado no momento.</p>";
            return;
        }
        list.innerHTML = snap.docs.map(d => {
            const g = d.data();
            const motivo = g.motivoRecusa || "Nenhum motivo especificado";
            const dataRep = g.dataReprovacao ? new Date(g.dataReprovacao).toLocaleString("pt-BR") : "Data desconhecida";
            const img = g.imagem
                ? '<img src="' + g.imagem + '" style="width:45px;height:45px;border-radius:6px;object-fit:cover;">'
                : '<div style="width:45px;height:45px;border-radius:6px;background:#ffe0e0;display:flex;align-items:center;justify-content:center;font-size:1.2rem;">📨</div>';
            return '<div style="border:1px solid #ffcccc;background:#fff5f5;border-radius:8px;padding:12px;display:flex;align-items:center;gap:12px;">'
                + img
                + '<div style="flex:1;min-width:0;"><b style="font-size:0.9rem;">' + g.nome + '</b><div style="font-size:0.75rem;color:#666;margin-top:2px;">' + (g.categoria || "Sem categoria") + ' · Motivo: ' + motivo + '</div><div style="font-size:0.7rem;color:#999;">Reprovado em: ' + dataRep + '</div></div>'
                + '<button onclick=\'window.reaprovarGrupo("' + d.id + '")\' style="padding:8px 14px;background:#28a745;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.8rem;font-weight:700;white-space:nowrap;">Re-aprovar</button>'
                + '</div>';
        }).join('');
    } catch (e) {
        console.error(e);
        list.innerHTML = "<p style='color:#dc3545;font-size:0.85rem;'>Erro ao carregar grupos reprovados.</p>";
    }
};

window.loadRecursos = async () => {
    const list = document.getElementById('recursosList');
    if (!list) return;

    try {
        const q = query(collection(db, "gruposPendentes"), where("recursoEnviado", "==", true), where("recursoNegado", "!=", true));
        const snap = await getDocs(q);

        if (snap.empty) {
            list.innerHTML = '<p style="color:#666;font-size:0.85rem;">Nenhum recurso pendente.</p>';
            return;
        }

        list.innerHTML = snap.docs.map(d => {
            const g = d.data();
            const dataRecurso = g.dataRecurso ? new Date(g.dataRecurso).toLocaleString('pt-BR') : 'Data desconhecida';
            return `<div style="background:#fff;border:1px solid #ffc107;border-radius:8px;padding:15px;">
                <div style="display:flex;gap:12px;align-items:flex-start;">
                    ${g.imagem ? `<img src="${g.imagem}" style="width:50px;height:50px;border-radius:6px;object-fit:cover;">` : `<div style="width:50px;height:50px;border-radius:6px;background:#f0f0f0;display:flex;align-items:center;justify-content:center;font-size:1.2rem;">📸</div>`}
                    <div style="flex:1;">
                        <b style="font-size:0.95rem;">${g.nome || 'Sem nome'}</b>
                        <div style="font-size:0.8rem;color:#666;margin-top:4px;">
                            Motivo: <span style="color:#dc3545;font-weight:600;">${g.motivoRecusa || 'Nenhum'}</span>
                        </div>
                        <div style="font-size:0.75rem;color:#999;margin-top:2px;">
                            Recurso enviado em: ${dataRecurso}
                        </div>
                        <div style="margin-top:8px;display:flex;gap:6px;">
                            <button onclick="window.aprovarRecurso('${d.id}')" style="padding:6px 14px;background:#28a745;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:600;font-size:0.8rem;">Aprovar</button>
                            <button onclick="window.manterReprovado('${d.id}')" style="padding:6px 14px;background:#6c757d;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:600;font-size:0.8rem;">Manter Reprovado</button>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');
    } catch (e) {
        console.error(e);
        list.innerHTML = '<p style="color:#dc3545;font-size:0.85rem;">Erro ao carregar recursos.</p>';
    }
};

window.aprovarRecurso = async (id) => {
    if (!confirm('Aprovar este grupo? Ele sera publicado no site.')) return;
    try {
        const ref = doc(db, "gruposPendentes", id);
        const s = await getDoc(ref);
        if (s.exists()) {
            const data = s.data();
            data.status = 'aprovado';
            data.dataAprovacao = Date.now();
            data.recursoAprovado = true;
            await setDoc(doc(db, "grupos", id), data);
            await deleteDoc(ref);
            showAlert('Grupo aprovado por recurso!', 'success');
            loadRecursos();
            loadGroups();
            clearGroupsCache();
        }
    } catch (e) {
        console.error(e);
        showAlert('Erro ao aprovar recurso.', 'error');
    }
};

window.manterReprovado = async (id) => {
    if (!confirm('Manter grupo reprovado? O recurso sera marcado como negado.')) return;
    try {
        const ref = doc(db, "gruposPendentes", id);
        await updateDoc(ref, { recursoNegado: true, dataNegacao: Date.now() });
        showAlert('Recurso negado.', 'error');
        loadRecursos();
        clearGroupsCache();
    } catch (e) {
        console.error(e);
        showAlert('Erro ao negar recurso.', 'error');
    }
};


window.switchAdminTab = (t) => {
    document.querySelectorAll('.admin-tab-content').forEach(el => el.style.display = 'none');
    document.getElementById(`admin${t.charAt(0).toUpperCase() + t.slice(1)}Tab`).style.display = 'block';
    if (t === 'pending') loadPending();
};
window.openBoostModalForGroup = (id) => {
    currentBoostGroupId = id;
    document.getElementById('boostModal')?.classList.add('active');
    toggleBodyScroll(true);
};
window.closeBoostModal = () => {
    document.getElementById('boostModal')?.classList.remove('active');
    toggleBodyScroll(false);
};
window.selectBoostPackage = (h, p, el) => {
    selectedPackageHours = h; selectedPackagePrice = p;
    document.querySelectorAll('.boost-option-card').forEach(x => x.classList.remove('active'));
    el?.classList.add('active');
};
window.filterByCategory = (c) => { 
    currentFilter = c; 
    currentPageNum = 1; 
    const u = new URL(window.location); 
    u.searchParams.delete('page'); 
    history.replaceState(null, '', u); 
    renderGroups(); 
};
window.clearFilters = () => { 
    currentFilter = 'todos'; 
    currentPageNum = 1; 
    const searchInput = document.getElementById('searchInput');
    if (searchInput) searchInput.value = '';
    const u = new URL(window.location); 
    u.searchParams.delete('page'); 
    history.replaceState(null, '', u); 
    renderGroups(); 
};
window.likeGroup = async (id, e) => {
    if (e) e.stopPropagation();
    try {
        await updateDoc(doc(db, "grupos", id), { likes: increment(1) });
        const c = document.getElementById(`countLike_${id}`); if (c) c.innerText = parseInt(c.innerText) + 1;
        showAlert('❤️ Valeu!', 'success');
    } catch (err) { }
};
window.deleteMyGroup = async (id) => {
    if (!confirm('Deseja realmente remover este grupo da sua lista de Meus Grupos?')) return;
    try {
        await deleteDoc(doc(db, "gruposPendentes", id)).catch(() => null);
        await deleteDoc(doc(db, "grupos", id)).catch(() => null);
    } catch (e) {
        console.warn("Erro ao deletar no servidor:", e);
    } finally {
        meusGrupos = meusGrupos.filter(x => x !== id);
        localStorage.setItem('meusGrupos', JSON.stringify(meusGrupos));
        renderMyGroups();
        if (typeof showAlert === 'function') showAlert('Grupo removido da lista.', 'info');
    }
};
window.openStoreModal = (id) => {
    document.getElementById('checkoutBody').innerHTML = `<div style="text-align:center; padding: 20px;">
        <h3 style="margin-bottom: 20px; font-weight: 800; color: #333;">Comprar Plano ${id.replace('vip_', '').toUpperCase()}</h3>
        <button class="btn-join" onclick="window.payStorePix('${id}')" style="width: 100%; font-size: 1.1rem; padding: 15px; border-radius: 8px;">GERAR PIX</button>
    </div>`;
    document.getElementById('checkoutModal')?.classList.add('active');
    toggleBodyScroll(true);
};
window.closeCheckoutModal = () => {
    document.getElementById('checkoutModal')?.classList.remove('active');
    toggleBodyScroll(false);
};
window.payStorePix = (id) => {
    let price = "";
    if (id === 'vip_bronze') price = "R$ 9,90";
    else if (id === 'vip_prata') price = "R$ 19,80";
    else if (id === 'vip_ouro') price = "R$ 49,90";
    else if (id === 'vip_diamante') price = "R$ 99,90";
    else if (id === 'bronze') price = "R$ 99,00";
    else if (id === 'prata') price = "R$ 210,38";
    else if (id === 'ouro') price = "R$ 371,25";
    else if (id === 'diamante') price = "R$ 643,50";

    const msg = encodeURIComponent(`Olá, quero comprar um plano no valor de ${price}`);
    const phone = "5511947285405";
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
};

window.giveVipById = async () => {
    const id = document.getElementById('adminVipGroupId')?.value.trim();
    const days = parseInt(document.getElementById('adminVipDays')?.value) || 1;
    if (!id) return showAlert('Insira o ID do grupo!', 'error');

    try {
        const docRef = doc(db, "grupos", id);
        const snap = await getDoc(docRef);
        if (!snap.exists()) return showAlert('Grupo não encontrado!', 'error');

        await updateDoc(docRef, {
            vip: true,
            vipExpires: Date.now() + (days * 24 * 3600000)
        });
        clearGroupsCache();
        loadGroups();
        showAlert(`✅ VIP de ${days} dias ativado para ${snap.data().nome}!`, 'success');
        document.getElementById('adminVipGroupId').value = '';
    } catch (e) {
        console.error(e);
        showAlert('Erro ao ativar VIP.', 'error');
    }
};
window.toggleEditMode = (id, s) => {
    if (!window.editingGroups) window.editingGroups = {};
    window.editingGroups[id] = s; renderMyGroups();
};
window.saveMyGroupEdit = async (id) => {
    const n = document.getElementById(`editName_${id}`).value.trim();
    const d = document.getElementById(`editDesc_${id}`).value.trim();
    const l = document.getElementById(`editLink_${id}`).value.trim();
    const img = document.getElementById(`editImg_${id}`).value.trim();

    try {
        await updateDoc(doc(db, "grupos", id), { nome: n, descricao: d, link: l, imagem: img });
        window.toggleEditMode(id, false);
        showAlert('✅ Grupo atualizado!', 'success');
        renderMyGroups();
    } catch (e) {
        try {
            await updateDoc(doc(db, "gruposPendentes", id), { nome: n, descricao: d, link: l, imagem: img });
            window.toggleEditMode(id, false);
            showAlert('✅ Grupo atualizado!', 'success');
            renderMyGroups();
        } catch (e2) {
            showAlert('❅ Erro ao salvar.', 'error');
        }
    }
};
window.skipValidation = () => {
    document.getElementById('validationStep').style.display = 'none';
    document.getElementById('mainFormContainer').style.display = 'block';
};
window.previewImage = (input) => {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = function (e) {
            document.getElementById('topPreviewImg').src = e.target.result;
            const textEl = document.getElementById('uploadText');
            if (textEl) textEl.innerText = "Foto carregada com sucesso! Clique se quiser alterar.";
        };
        reader.readAsDataURL(input.files[0]);
    }
};

window.freeBoost = async (id) => {
    try {
        const docRef = doc(db, "grupos", id);
        const s = await getDoc(docRef);
        if (s.exists()) {
            const data = s.data();
            const now = Date.now();
            if (data.freeBoostUntil && data.freeBoostUntil > now) {
                return showAlert('Impulso já está ativo! Aguarde.', 'error');
            }
            await updateDoc(docRef, { freeBoostUntil: now + (2 * 3600000), lastBoostAt: now });
            showAlert('Grupo Impulsionado Grátis! 🚀', 'success');
            loadGroups();
        }
    } catch (e) {
        showAlert('Erro ao impulsionar', 'error');
    }
};

window.searchGroups = () => { renderGroups(); };

window.reportDeadLink = (id, e) => { if (e) e.stopPropagation(); showAlert('Obrigado!', 'success'); };

window.loadAdminStats = async () => {
    const elGrupos = grupos.length;
    const visitasTotal = grupos.reduce((acc, g) => acc + (g.visitas || 0), 0);

    // FETCH NEW ANALYTICS
    let hojeTotal = 0;
    let horaHTML = '<p style="font-size:12px; color:#666;">Ainda sem dados detalhados para hoje.</p>';

    try {
        const todayStr = new Date().toISOString().split('T')[0];
        const s = await getDoc(doc(db, "analytics_visits", todayStr));
        if (s.exists()) {
            const data = s.data();
            hojeTotal = data.total || 0;
            if (data.horas) {
                horaHTML = Object.entries(data.horas).sort((a, b) => parseInt(b[0]) - parseInt(a[0])).slice(0, 10).map(([h, v]) => `
                    <div style="display:flex; justify-content:space-between; border-bottom:1px solid #eee; padding:8px 0; font-size: 0.95rem;">
                        <span><i class="far fa-clock"></i> ${h}:00 - ${parseInt(h) + 1}:00</span>
                        <strong>${v} visitas</strong>
                    </div>
                `).join('');
            }
        }
    } catch (e) { console.error("Admin Analytics:", e); }

    let repSize = 0;
    let logHTML = '<p>Nenhuma atividade.</p>';
    try {
        const repSnap = await getDocs(collection(db, "reportes"));
        repSize = repSnap.size;

        // Busca estatisticas de grupos reprovados
        let reprovData = { total: 0, motivos: {} };
        try {
            const reprovSnap = await getDocs(query(collection(db, "gruposPendentes"), where("status", "==", "reprovado")));
            reprovData.total = reprovSnap.size;
            reprovSnap.docs.forEach(d => {
                const m = d.data().motivoRecusa || 'Sem motivo';
                reprovData.motivos[m] = (reprovData.motivos[m] || 0) + 1;
            });
        } catch (e) { }
        logHTML = repSnap.docs.slice(0, 5).map(r => `<p style="font-size:14px; margin-bottom:5px; padding:10px; background:#f8f9fa; border-radius:4px;"><i class="fas fa-flag" style="color:#dc3545;"></i> <b>${r.data().groupName || 'Grupo'}</b> reportado.</p>`).join('');
    } catch (e) { }

    // Gerar HTML dos motivos de reprovacao
    let reprovMotivosHTML = '';
    if (reprovData.total > 0) {
        const sorted = Object.entries(reprovData.motivos).sort((a, b) => b[1] - a[1]);
        const items = sorted.map(function (item) {
            const m = item[0], c = item[1];
            const pct = Math.round(c / reprovData.total * 100);
            return '<div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f0f0f0;font-size:0.85rem;"><span>' + m + '</span><span style="font-weight:800;color:#dc3545;">' + c + ' (' + pct + '%)</span></div>';
        }).join('');
        reprovMotivosHTML = '<div style="background:#fff5f5;border:1px solid #ffcccc;border-radius:8px;padding:15px;grid-column:1/-1;"><h4 style="margin:0 0 10px 0;font-size:0.9rem;color:#dc3545;">Motivos de Reprovação</h4>' + items + '</div>';
    }

    document.getElementById('adminStatsContent').innerHTML = `
        <div style="background:#fff; border:1px solid #ddd; padding:20px; border-radius:8px; text-align:center;">
            <i class="fas fa-users" style="font-size:2rem; color:#007bff; margin-bottom:10px;"></i>
            <h3 style="margin:0; font-size:1.8rem;">${elGrupos}</h3>
            <p style="margin:0; font-size:0.85rem; color:#666; font-weight:800;">GRUPOS ATIVOS</p>
        </div>
        <div style="background:#fff; border:1px solid #ddd; padding:20px; border-radius:8px; text-align:center;">
            <i class="fas fa-eye" style="font-size:2rem; color:#28a745; margin-bottom:10px;"></i>
        <div style="background:#fff; border:1px solid #ffcccc; padding:20px; border-radius:8px; text-align:center;">
            <i class="fas fa-ban" style="font-size:2rem; color:#dc3545; margin-bottom:10px;"></i>
            <h3 style="margin:0; font-size:1.8rem; color:#dc3545;">${reprovData.total}</h3>
            <p style="margin:0; font-size:0.85rem; color:#666; font-weight:800;">REPROVADOS</p>
        </div>
            <h3 style="margin:0; font-size:1.8rem;">${hojeTotal}</h3>
            <p style="margin:0; font-size:0.85rem; color:#666; font-weight:800;">VISITAS HOJE</p>
        </div>
        <div style="background:#fff; border:1px solid #ddd; padding:20px; border-radius:8px; text-align:center;">
            <i class="fas fa-chart-line" style="font-size:2rem; color:#17a2b8; margin-bottom:10px;"></i>
            <h3 style="margin:0; font-size:1.8rem;">${visitasTotal}</h3>
            <p style="margin:0; font-size:0.85rem; color:#666; font-weight:800;">VISITAS HIST"RICO</p>
        </div>
        <div style="background:#fff; border:1px solid #ddd; padding:20px; border-radius:8px; text-align:center;">
            <i class="fas fa-exclamation-triangle" style="font-size:2rem; color:#dc3545; margin-bottom:10px;"></i>
            <h3 style="margin:0; font-size:1.8rem;">${repSize}</h3>
            <p style="margin:0; font-size:0.85rem; color:#666; font-weight:800;">REPORTES</p>
        </div>
        <div style="grid-column: 1 / -1; background:#fff; border:1px solid #ddd; padding:20px; border-radius:8px; text-align:left;">
            <h4 style="margin-top:0; font-weight:900; color:#333;"><i class="fas fa-clock"></i> Visitas por Hora (Hoje)</h4>
            ${horaHTML}
        </div>
        <div style="grid-column: 1 / -1; background:#fff; border:1px solid #ddd; padding:20px; border-radius:8px; text-align:left;">
            <h4 style="margin-top:0; font-weight:900; color:#333;"><i class="fas fa-list"></i> últimos Reportes</h4>
            ${logHTML}
        </div>
        ${reprovMotivosHTML}
    `;
};

window.adminSearchGroups = () => {
    const q = document.getElementById('adminSearchInput')?.value.toLowerCase() || '';
    const list = document.getElementById('adminGroupsManageList');
    if (!list) return;
    const filtered = grupos.filter(g => g.nome.toLowerCase().includes(q) || g.id.includes(q));
    list.innerHTML = filtered.slice(0, 20).map(g => {
        if (window.adminEditingGroups && window.adminEditingGroups[g.id]) {
            return `<div style="border:1px solid #dee2e6; padding:15px; margin-bottom:10px; border-radius:8px;">
                <input type="text" id="adminEditName_${g.id}" value="${g.nome}" style="width:100%; margin-bottom:5px; padding:8px; border: 1px solid #ccc; border-radius: 4px;">
                <input type="text" id="adminEditLink_${g.id}" value="${g.link}" style="width:100%; margin-bottom:10px; padding:8px; border: 1px solid #ccc; border-radius: 4px;">
                <button onclick="window.adminSaveGroupEdit('${g.id}')" style="background:#28a745; color:white; border:none; padding:8px 12px; border-radius:4px; font-weight:bold; cursor:pointer;">Salvar</button>
                <button onclick="window.adminToggleEdit('${g.id}', false)" style="background:#6c757d; color:white; border:none; padding:8px 12px; border-radius:4px; font-weight:bold; cursor:pointer;">Cancelar</button>
            </div>`;
        }
        return `<div style="border:1px solid #dee2e6; padding:15px; margin-bottom:10px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
        <div><b style="color:#333;">${g.nome}</b> <br> <span style="font-size:12px; color:#666;">ID: ${g.id}</span></div>
        <div style="display:flex; gap:5px;">
            <button onclick="window.adminToggleEdit('${g.id}', true)" style="background:#ffc107; color:#000; border:none; padding:8px 12px; border-radius:4px; font-weight:bold; cursor:pointer;"><i class="fas fa-edit"></i> Editar</button>
            <button onclick="window.deleteAnyGroup('${g.id}')" style="background:#dc3545; color:white; border:none; padding:8px 12px; border-radius:4px; font-weight:bold; cursor:pointer;"><i class="fas fa-trash"></i></button>
        </div>
    </div>`}).join('') || '<p>Nenhum grupo encontrado.</p>';
};

window.adminToggleEdit = (id, s) => {
    if (!window.adminEditingGroups) window.adminEditingGroups = {};
    window.adminEditingGroups[id] = s;
    window.adminSearchGroups();
};

window.adminSaveGroupEdit = async (id) => {
    const n = document.getElementById(`adminEditName_${id}`).value;
    const l = document.getElementById(`adminEditLink_${id}`).value;
    try {
        await updateDoc(doc(db, "grupos", id), { nome: n, link: l });
        window.adminToggleEdit(id, false);
        showAlert('✅ Atualizado!', 'success');
        loadGroups(); clearGroupsCache();
        setTimeout(window.adminSearchGroups, 500);
    } catch (e) { showAlert('Erro ao atualizar', 'error'); }
};

window.deleteAnyGroup = async (id) => {
    if (confirm('Tem certeza que deseja excluir permanentemente este grupo?')) {
        await deleteDoc(doc(db, "grupos", id));
        showAlert('Excluído!', 'success');
        loadGroups(); clearGroupsCache();
        setTimeout(window.adminSearchGroups, 500);
    }
};

window.loadActiveVips = () => {
    const now = Date.now();
    const vips = grupos.filter(g => g.vip && g.vipExpires > now);
    const list = document.getElementById('activeVipsList');
    if (!list) return;
    list.innerHTML = vips.length ? vips.map(g => `<div style="border:1px solid #ffeeba; background:#fff3cd; padding:15px; margin-bottom:10px; border-radius:8px; display:flex; justify-content:space-between; align-items:center;">
        <div><b>${g.nome}</b> <br> <span style="font-size:12px; color:#856404;">Expira em: ${new Date(g.vipExpires).toLocaleString('pt-BR')}</span></div>
        <button onclick="window.revokeVip('${g.id}')" style="background:#343a40; color:white; border:none; padding:8px 12px; border-radius:4px; font-weight:bold; cursor:pointer;"><i class="fas fa-times"></i> Revogar VIP</button>
    </div>`).join('') : '<p>Nenhum VIP ativo no momento.</p>';
};

window.revokeVip = async (id) => {
    if (confirm('Revogar VIP deste grupo?')) {
        await updateDoc(doc(db, "grupos", id), { vip: false, vipExpires: 0 });
        showAlert('VIP Revogado!', 'success');
        loadGroups(); clearGroupsCache();
        setTimeout(window.loadActiveVips, 500);
    }
};

window.saveGlobalConfig = async () => {
    const notice = document.getElementById('cfgHomeNotice')?.value || '';
    const token = document.getElementById('cfgPromisseToken')?.value || '';
    const imgbbApiKey = document.getElementById('cfgImgbbApiKey')?.value || '';
    const pubKey = document.getElementById('cfgEmailjsPublicKey')?.value || '';
    const serviceId = document.getElementById('cfgEmailjsServiceId')?.value || '';
    const tempCupons = document.getElementById('cfgEmailjsTemplateCupons')?.value || '';
    const tempRecibo = document.getElementById('cfgEmailjsTemplateRecibo')?.value || '';
    const supportPhone = document.getElementById('cfgSupportPhone')?.value || '';
    const newAdminPass = document.getElementById('cfgAdminPassword')?.value || '';

    try {
        const data = {
            homeNotice: notice,
            promisseToken: token,
            imgbbApiKey: imgbbApiKey,
            emailjsPubKey: pubKey,
            emailjsServiceId: serviceId,
            emailjsTemplateCupons: tempCupons,
            emailjsTemplateRecibo: tempRecibo,
            supportPhone: supportPhone
        };

        // Só atualiza a senha se o campo não estiver vazio
        if (newAdminPass.trim() !== "") {
            data.adminPassword = newAdminPass.trim();
        }

        await setDoc(doc(db, "configuracoes", "global"), data, { merge: true });
        showAlert('Configurações Salvas com Sucesso!', 'success');
        if (token) PROMISSE_TOKEN = token;
        if (imgbbApiKey) IMGBB_API_KEY = imgbbApiKey.trim();
        if (newAdminPass.trim() !== "") {
            document.getElementById('cfgAdminPassword').value = '';
        }
    } catch (e) {
        console.error("Erro ao salvar config:", e);
        showAlert('Erro ao salvar no banco de dados.', 'error');
    }
};

window.banUser = async () => {
    const uid = document.getElementById('adminBanUid')?.value;
    if (!uid) return showAlert('Insira o Email ou ID', 'error');
    try {
        await setDoc(doc(db, "blacklist", uid.replace(/\./g, '_')), { banned: true, timestamp: Date.now() });
        showAlert('Usuário Banido!', 'success');
        document.getElementById('adminBanUid').value = '';
    } catch (e) {
        showAlert('Erro ao banir.', 'error');
    }
};

window.exportToCSV = () => {
    let csv = "ID,Nome,Categoria,Link,Status,Visitas,VIP\n";
    grupos.forEach(g => {
        csv += `${g.id},"${g.nome}","${g.categoria}","${g.link}","${g.status}",${g.visitas || 0},${g.vip ? 'SIM' : 'NAO'}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gruposwhats_backup_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    showAlert('Download do Banco de Dados iniciado!', 'success');
};

window.clearRejectedGroups = async () => {
    if (!confirm("Atenção: Isso vai excluir PERMANENTEMENTE todos os grupos que estão com status 'reprovado'. Continuar?")) return;
    try {
        const q = query(collection(db, "gruposPendentes"), where("status", "==", "reprovado"));
        const snap = await getDocs(q);
        if (snap.empty) return showAlert('A lixeira já está vazia!', 'success');

        showAlert(`Excluindo ${snap.size} grupos... Aguarde.`, 'success');
        const { deleteDoc } = await import("https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js");

        const deletePromises = snap.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deletePromises);

        showAlert('Lixeira esvaziada com sucesso!', 'success');
        if (typeof loadPending === 'function') loadPending();
    } catch (e) {
        console.error(e);
        showAlert('Erro ao esvaziar lixeira.', 'error');
    }
};

window.logoutAdmin = async () => {
    try {
        await auth.signOut();
        document.getElementById('adminPanelSection').style.display = 'none';
        document.getElementById('adminLoginSection').style.display = 'block';
        document.getElementById('adminPassword').value = '';
        showAlert('Desconectado!', 'success');
    } catch (e) { }
};

const oldSwitchAdminTab = window.switchAdminTab;
window.switchAdminTab = (t) => {
    oldSwitchAdminTab(t);
    if (t === 'stats') window.loadAdminStats();
    if (t === 'manage') window.adminSearchGroups();
    if (t === 'vips') window.loadActiveVips();
    if (t === 'reprovados') window.loadReprovados();
    if (t === 'recursos') window.loadRecursos();
};

window.generateManualCodes = async () => {
    const qtyInput = document.getElementById('genQty');
    const packInput = document.getElementById('genType');
    const qty = parseInt(qtyInput?.value) || 1;
    const pack = packInput?.value;
    const output = document.getElementById('generatedCodesOutput');

    if (!output) return;

    // Verificar se está autenticado
    if (!auth.currentUser) {
        console.error("Tentativa de gerar códigos sem autenticação.");
        showAlert('❅ Erro: Você precisa estar logado no painel!', 'error');
        output.style.display = 'block';
        output.innerText = '❅ Erro: Autenticação não encontrada. Tente sair e entrar no painel novamente.\n\nSe o erro persistir, ative o "Anonymous Auth" no Firebase.';
        return;
    }

    console.log(`Iniciando geraç£o de ${qty} códigos para pacote: ${pack}`);
    output.style.display = 'block';
    output.innerText = '⏳ Gerando códigos no banco de dados...';

    const codes = [];
    try {
        for (let i = 0; i < qty; i++) {
            const code = 'VIP-' + Math.random().toString(36).substr(2, 9).toUpperCase();
            console.log(`Gerando código ${i + 1}/${qty}: ${code}`);
            await setDoc(doc(db, "codigos", code), {
                pacote: pack,
                criadoEm: Date.now(),
                usado: false,
                usadoPor: null,
                usadoEm: null
            });
            codes.push(code);
        }

        const finalOutput = `✅ Códigos Gerados (${qty}x ${pack}):\n\n` + codes.join('\n');
        output.innerText = finalOutput;
        console.log("Geraç£o concluída com sucesso!");

        try {
            await navigator.clipboard.writeText(codes.join('\n'));
            showAlert('✅ Códigos gerados e copiados!', 'success');
        } catch (err) {
            console.warn("Falha ao copiar para o clipboard:", err);
            showAlert('✅ Gerados! Copie da caixa preta.', 'success');
        }
    } catch (e) {
        console.error("Erro fatal na geraç£o de códigos:", e);
        const errorMsg = e.message || 'Erro desconhecido';
        output.innerText = `❅ Erro do Firebase: ${errorMsg}\n\nVerifique se o "Anonymous Auth" está ativado no console do Firebase e se as regras do Firestore permitem escrita em /codigos.`;
        showAlert('Erro na gravação do banco.', 'error');
    }
};

// 10. EXPORTS PARA OUTRAS PáGINAS (EX: group-details.html)
export { db, doc, getDoc, updateDoc, increment, collection, query, where, getDocs, setDoc, limit };
