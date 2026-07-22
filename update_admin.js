const fs = require('fs');

let html = fs.readFileSync('admin.html', 'utf8');
const changes = [];

// 1. Chart.js CDN
const chartCdn = '<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>';
if (html.indexOf(chartCdn) === -1) {
  html = html.replace(
    '<script type="module" src="script.js"></script>',
    chartCdn + '\n    <script type="module" src="script.js"></script>'
  );
  changes.push('Chart.js CDN added');
}

// 2. Replace tabs bar - add new buttons
const oldTabs = '<button class="admin-tab-btn" onclick="switchAdminTab(\'reprovados\')" style="padding: 10px 15px; border: none; background: #dc3545; border-radius: 6px; font-weight: 800; cursor: pointer; font-size: 0.8rem; color:#fff;">REPROVADOS</button>';
const newTabs = '<button class="admin-tab-btn" onclick="switchAdminTab(\'categorias\')" style="padding: 10px 15px; border: none; background: #17a2b8; border-radius: 6px; font-weight: 800; cursor: pointer; font-size: 0.8rem; color:#fff;">CATEGORIAS</button>' +
  '<button class="admin-tab-btn" onclick="switchAdminTab(\'reprovados\')" style="padding: 10px 15px; border: none; background: #dc3545; border-radius: 6px; font-weight: 800; cursor: pointer; font-size: 0.8rem; color:#fff;">REPROVADOS</button>' +
  '<button class="admin-tab-btn" onclick="switchAdminTab(\'denuncias\')" style="padding: 10px 15px; border: none; background: #e83e8c; border-radius: 6px; font-weight: 800; cursor: pointer; font-size: 0.8rem; color:#fff;">DENÃšNCIAS</button>' +
  '<button class="admin-tab-btn" onclick="switchAdminTab(\'logs\')" style="padding: 10px 15px; border: none; background: #6c757d; border-radius: 6px; font-weight: 800; cursor: pointer; font-size: 0.8rem; color:#fff;">LOGS</button>';

if (html.indexOf(oldTabs) >= 0) {
  html = html.replace(oldTabs, newTabs);
  changes.push('New tabs: CATEGORIAS, DENUNCIAS, LOGS');
}

// 3. Add filter UI + bulk actions in moderation tab
const pendingTabEnd = '<div id="adminPendingTab" class="admin-tab-content" style="display:none;">\n                            <div id="pendingGroupsList" style="display: grid; gap: 15px;"></div>\n                        </div>';
const pendingTabNew = '<div id="adminPendingTab" class="admin-tab-content" style="display:none;">\n                            <div style="display:flex;gap:10px;margin-bottom:15px;flex-wrap:wrap;">\n                                <input type="text" id="pendingSearchInput" placeholder="Buscar por nome..." style="flex:1;min-width:150px;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:0.85rem;">\n                                <select id="pendingCategoryFilter" style="padding:10px;border:1px solid #ddd;border-radius:8px;font-size:0.85rem;">\n                                    <option value="">Todas categorias</option>\n                                </select>\n                                <button onclick="window.filterPendingGroups()" style="padding:10px 18px;background:#007bff;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;"><i class="fas fa-search"></i></button>\n                            </div>\n                            <div id="pendingBulkBar" style="display:none;background:#e8f5e9;padding:10px 15px;border-radius:8px;margin-bottom:15px;align-items:center;gap:10px;flex-wrap:wrap;">\n                                <span id="selectedCount" style="font-weight:700;font-size:0.85rem;">0 selecionados</span>\n                                <button onclick="window.bulkApprove()" style="padding:8px 15px;background:#28a745;color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer;"><i class="fas fa-check"></i> Aprovar</button>\n                                <button onclick="window.bulkReject()" style="padding:8px 15px;background:#dc3545;color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer;"><i class="fas fa-times"></i> Reprovar</button>\n                            </div>\n                            <div id="pendingGroupsList" style="display: grid; gap: 15px;"></div>\n                        </div>';

if (html.indexOf(pendingTabEnd) >= 0) {
  html = html.replace(pendingTabEnd, pendingTabNew);
  changes.push('Filter/bulk UI added to moderation');
}

// 4. Add new tab content divs
const categoriasHtml = '<div id="adminCategoriasTab" class="admin-tab-content" style="display:none;">\n                            <h3 style="margin:0 0 15px 0;font-size:1rem;color:#17a2b8;"><i class="fas fa-tags"></i> Gerenciar Categorias</h3>\n                            <div style="display:flex;gap:10px;margin-bottom:15px;">\n                                <input type="text" id="newCategoriaName" placeholder="Nova categoria..." style="flex:1;padding:10px;border:1px solid #ddd;border-radius:8px;font-size:0.85rem;">\n                                <button onclick="window.addCategoria()" style="padding:10px 18px;background:#28a745;color:#fff;border:none;border-radius:8px;font-weight:700;cursor:pointer;"><i class="fas fa-plus"></i> Adicionar</button>\n                            </div>\n                            <div id="categoriasList" style="display:grid;gap:10px;"></div>\n                        </div>';

const denunciasHtml = '<div id="adminDenunciasTab" class="admin-tab-content" style="display:none;">\n                            <h3 style="margin:0 0 15px 0;font-size:1rem;color:#e83e8c;"><i class="fas fa-flag"></i> DenÃºncias Recebidas</h3>\n                            <p style="font-size:0.8rem;color:#666;margin-bottom:15px;">Gerencie as denÃºncias enviadas pelos usuÃ¡rios.</p>\n                            <div id="denunciasList" style="display:grid;gap:12px;"></div>\n                        </div>';

const logsHtml = '<div id="adminLogsTab" class="admin-tab-content" style="display:none;">\n                            <h3 style="margin:0 0 15px 0;font-size:1rem;color:#6c757d;"><i class="fas fa-history"></i> Registro de Atividades</h3>\n                            <p style="font-size:0.8rem;color:#666;margin-bottom:15px;">Todas as aÃ§Ãµes realizadas no painel administrativo.</p>\n                            <div style="margin-bottom:15px;">\n                                <button onclick="window.clearActivityLog()" style="padding:8px 15px;background:#dc3545;color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer;"><i class="fas fa-trash"></i> Limpar Log</button>\n                            </div>\n                            <div id="activityLogList" style="display:grid;gap:8px;"></div>\n                        </div>';

html = html.replace('<div id="adminReprovadosTab" class="admin-tab-content" style="display:none;">', categoriasHtml + '\n                        <div id="adminReprovadosTab" class="admin-tab-content" style="display:none;">');
changes.push('Categorias tab content added');

html = html.replace('<div id="adminRecursosTab" class="admin-tab-content" style="display:none;">', denunciasHtml + '\n                        <div id="adminRecursosTab" class="admin-tab-content" style="display:none;">');
changes.push('Denuncias tab content added');

html = html.replace('<div id="adminConfigTab" class="admin-tab-content" style="display:none;">', logsHtml + '\n                        <div id="adminConfigTab" class="admin-tab-content" style="display:none;">');
changes.push('Logs tab content added');

fs.writeFileSync('admin.html', html, 'utf8');
console.log('=== ADMIN HTML CHANGES ===');
changes.forEach(c => console.log(c));
