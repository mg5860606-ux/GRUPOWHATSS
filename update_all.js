const fs = require('fs');

// ============ PART 1: Update admin.html - fix filter UI ============
let html = fs.readFileSync('admin.html', 'utf8');

const filterHtml = '                            <div style="display:flex;gap:10px;margin-bottom:15px;flex-wrap:wrap;">\n                                <input type="text" id="pendingSearchInput" placeholder="Buscar por nome..." style="flex:1;min-width:150px;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:0.85rem;">\n                                <select id="pendingCategoryFilter" style="padding:10px;border:1px solid #ddd;border-radius:8px;font-size:0.85rem;">\n                                    <option value="">Todas categorias</option>\n                                </select>\n                                <button onclick="window.filterPendingGroups()" style="padding:10px 18px;background:#007bff;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;"><i class="fas fa-search"></i></button>\n                            </div>\n                            <div id="pendingBulkBar" style="display:none;background:#e8f5e9;padding:10px 15px;border-radius:8px;margin-bottom:15px;align-items:center;gap:10px;flex-wrap:wrap;">\n                                <span id="selectedCount" style="font-weight:700;font-size:0.85rem;">0 selecionados</span>\n                                <button onclick="window.bulkApprove()" style="padding:8px 15px;background:#28a745;color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer;"><i class="fas fa-check"></i> Aprovar todos</button>\n                                <button onclick="window.bulkReject()" style="padding:8px 15px;background:#dc3545;color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer;"><i class="fas fa-times"></i> Reprovar todos</button>\n                                <button onclick="window.clearSelections()" style="padding:8px 15px;background:#6c757d;color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer;">Limpar</button>\n                            </div>';

// Replace the pending tab content - add filter before pendingGroupsList
const pendingTab = '<div id="adminPendingTab" class="admin-tab-content" style="display:none;">\n                            <div id="pendingGroupsList" style="display: grid; gap: 15px;"></div>\n                        </div>';
const newPendingTab = '<div id="adminPendingTab" class="admin-tab-content" style="display:none;">\n                            <div id="pendingFilterBar" style="display:flex;gap:10px;margin-bottom:15px;flex-wrap:wrap;">\n                                <input type="text" id="pendingSearchInput" placeholder="Buscar por nome..." style="flex:1;min-width:150px;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:0.85rem;">\n                                <select id="pendingCategoryFilter" style="padding:10px;border:1px solid #ddd;border-radius:8px;font-size:0.85rem;"><option value="">Todas categorias</option></select>\n                                <button onclick="window.filterPendingGroups()" style="padding:10px 18px;background:#007bff;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;"><i class="fas fa-search"></i></button>\n                            </div>\n                            <div id="pendingBulkBar" style="display:none;background:#e8f5e9;padding:10px 15px;border-radius:8px;margin-bottom:15px;align-items:center;gap:10px;flex-wrap:wrap;">\n                                <span id="selectedCount" style="font-weight:700;font-size:0.85rem;">0 selecionados</span>\n                                <button onclick="window.bulkApprove()" style="padding:8px 15px;background:#28a745;color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer;"><i class="fas fa-check"></i> Aprovar todos</button>\n                                <button onclick="window.bulkReject()" style="padding:8px 15px;background:#dc3545;color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer;"><i class="fas fa-times"></i> Reprovar todos</button>\n                                <button onclick="window.clearSelections()" style="padding:8px 15px;background:#6c757d;color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer;">Limpar</button>\n                            </div>\n                            <div id="pendingGroupsList" style="display: grid; gap: 15px;"></div>\n                        </div>';

if (html.indexOf(pendingTab) >= 0) {
  html = html.replace(pendingTab, newPendingTab);
  console.log('Filter UI added to moderation');
}

// Add chart canvas to stats tab
const statsCanvas = '<div style="grid-column:1/-1;">\n                                <canvas id="visitsChart" style="background:#fff;border-radius:8px;padding:10px;"></canvas>\n                            </div>';
const statsTab = '<div id="adminStatsTab" class="admin-tab-content">\n                            <div id="adminStatsContent" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;"></div>\n                        </div>';
const newStatsTab = '<div id="adminStatsTab" class="admin-tab-content">\n                            <div id="adminStatsContent" style="display: grid; grid-template-columns: 1fr 1fr; gap: 15px;"></div>\n                            <div style="margin-top:20px;background:#f8f9fa;border-radius:12px;padding:20px;">\n                                <canvas id="visitsChart" style="width:100%;max-height:300px;"></canvas>\n                            </div>\n                        </div>';

if (html.indexOf(statsTab) >= 0) {
  html = html.replace(statsTab, newStatsTab);
  console.log('Chart canvas added to stats tab');
}

fs.writeFileSync('admin.html', html, 'utf8');
console.log('admin.html updated');

// ============ PART 2: Update script.js - add new admin functions ============
let js = fs.readFileSync('script.js', 'utf8');

// Find where to insert the new admin functions (before the switchAdminTab override at line ~1445)
const switchAdminTabOverride = 'const oldSwitchAdminTab = window.switchAdminTab;';

const newFunctions = `
// ===== NOVAS FUNCOES ADMIN =====

// --- LOG DE ATIVIDADES ---
var adminActivityLog = [];

window.logActivity = (action, detail) => {
  const entry = {
    action: action,
    detail: detail || '',
    time: Date.now(),
    date: new Date().toLocaleString('pt-BR')
  };
  adminActivityLog.unshift(entry);
  if (adminActivityLog.length > 200) adminActivityLog.pop();
  try { localStorage.setItem('adminActivityLog', JSON.stringify(adminActivityLog)); } catch(e) {}
};

try {
  const saved = localStorage.getItem('adminActivityLog');
  if (saved) adminActivityLog = JSON.parse(saved);
} catch(e) {}

window.loadActivityLog = () => {
  const list = document.getElementById('activityLogList');
  if (!list) return;
  if (!adminActivityLog.length) {
    list.innerHTML = '<p style="color:#999;font-size:0.85rem;text-align:center;">Nenhuma atividade registrada.</p>';
    return;
  }
  list.innerHTML = adminActivityLog.map(e => \`
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 15px;background:#f8f9fa;border-radius:8px;border-left:3px solid \${e.action.includes('Aprov') ? '#28a745' : e.action.includes('Reprov') ? '#dc3545' : '#007bff'};">
      <div>
        <strong style="font-size:0.85rem;">\${e.action}</strong>
        <span style="font-size:0.75rem;color:#666;margin-left:5px;">\${e.detail}</span>
      </div>
      <span style="font-size:0.7rem;color:#999;white-space:nowrap;">\${e.date}</span>
    </div>
  \`).join('');
};

window.clearActivityLog = () => {
  adminActivityLog = [];
  localStorage.removeItem('adminActivityLog');
  window.loadActivityLog();
};

// --- CRUD CATEGORIAS ---
window.loadCategorias = async () => {
  const list = document.getElementById('categoriasList');
  if (!list) return;
  try {
    const snap = await getDocs(collection(db, 'categorias'));
    if (snap.empty) {
      list.innerHTML = '<p style="color:#999;font-size:0.85rem;text-align:center;">Nenhuma categoria cadastrada.</p>';
      return;
    }
    list.innerHT
