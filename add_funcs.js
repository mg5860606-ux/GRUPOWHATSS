const fs = require('fs');
let js = fs.readFileSync('script.js', 'utf8');

const newCode = `
// ===== NOVAS FUNCOES ADMIN =====
var adminActivityLog = [];
window.logActivity = function(action, detail) {
  var entry = { action: action, detail: detail || "", time: Date.now(), date: new Date().toLocaleString("pt-BR") };
  adminActivityLog.unshift(entry);
  if (adminActivityLog.length > 200) adminActivityLog.pop();
  try { localStorage.setItem("adminActivityLog", JSON.stringify(adminActivityLog)); } catch(e) {}
};
try {
  var saved = localStorage.getItem("adminActivityLog");
  if (saved) adminActivityLog = JSON.parse(saved);
} catch(e) {}
window.loadActivityLog = function() {
  var list = document.getElementById("activityLogList");
  if (!list) return;
  if (!adminActivityLog.length) { list.innerHTML = "<p style='color:#999;text-align:center;'>Nenhuma atividade.</p>"; return; }
  var html = "";
  for (var i = 0; i < adminActivityLog.length; i++) {
    var e = adminActivityLog[i];
    var bc = e.action.indexOf("Aprov") >= 0 ? "#28a745" : e.action.indexOf("Reprov") >= 0 ? "#dc3545" : "#007bff";
    html += "<div style='display:flex;justify-content:space-between;padding:8px 12px;background:#f8f9fa;border-radius:6px;border-left:3px solid ", bc, ";'><div><strong>", e.action, "</strong><span style='color:#666;margin-left:5px;font-size:0.8rem;'>", (e.detail||""), "</span></div><span style='color:#999;font-size:0.75rem;'>", e.date, "</span></div>";
  }
  list.innerHTML = html;
};
window.clearActivityLog = function() { adminActivityLog = []; localStorage.removeItem("adminActivityLog"); window.loadActivityLog(); };
window.loadCategorias = async function() {
  var list = document.getElementById("categoriasList");
  if (!list) return;
  try {
    var snap = await getDocs(collection(db, "categorias"));
    if (snap.empty) { list.innerHTML = "<p style='color:#999;'>Nenhuma categoria.</p>"; return; }
    var html = "";
    snap.forEach(function(d) {
      var name = d.data().nome || d.id;
      html += "<div style='display:flex;justify-content:space-between;padding:10px;background:#f8f9fa;border-radius:6px;border:1px solid #e0e0e0;'><span style='font-weight:700;'>" + name + "</span><button onclick=\"window.deleteCategoria('" + d.id + "')\" style='padding:4px 10px;background:#dc3545;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:0.75rem;'>Excluir</button></div>";
    });
    list.innerHTML = html;
  } catch(e) { list.innerHTML = "<p style='color:#dc3545;'>Erro.</p>"; }
};
window.addCategoria = async function() {
  var input = document.getElementById("newCategoriaName");
  if (!input || !input.value.trim()) { showAlert("Digite um nome.", "error"); return; }
  try {
    await addDoc(collection(db, "categorias"), { nome: input.value.trim(), data: Date.now() });
    input.value = "";
    showAlert("Categoria criada!", "success");
    window.loadCategorias();
    window.logActivity("Categoria criada", input.value);
  } catch(e) { showAlert("Erro.", "error"); }
};
window.deleteCategoria = async function(id) {
  if (!confirm("Excluir?")) return;
  try { await deleteDoc(doc(db, "categorias", id)); showAlert("Excluida!", "success"); window.loadCategorias(); }
  catch(e) { showAlert("Erro.", "error"); }
};
window.loadDenuncias = async function() {
  var list = document.getElementById("denunciasList");
  if (!list) return;
  list.innerHTML = "<p>Carregando...</p>";
  try {
    var snap = await getDocs(query(collection(db, "reportes"), where("resolvido", "!=", true)));
    if (snap.empty) { list.innerHTML = "<p style='color:#999;'>Nenhuma denuncia.</p>"; return; }
    var html = "";
    snap.forEach(function(d) {
      var data = d.data();
      html += "<div style='background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:12px;margin-bottom:10px;'><div style='display:flex;justify-content:space-between;'><div><strong>" + (data.grupoNome||"?") + "</strong><span style='color:#666;margin-left:8px;'>" + (data.motivo||"") + "</span></div></div><div style='margin-top:8px;display:flex;gap:8px;'><button onclick=\"window.resolverDenuncia('" + d.id + "')\" style='padding:5px 12px;background:#28a745;color:#fff;border:none;border-radius:4px;cursor:pointer;'>Resolver</button><button onclick=\"window.removerGrupoDenunciado('" + d.id + "','" + (data.grupoId||"") + "')\" style='padding:5px 12px;background:#dc3545;color:#fff;border:none;border-radius:4px;cursor:pointer;'>Remover Grupo</button></div></div>";
    });
    list.innerHTML = html;
  } catch(e) { list.innerHTML = "<p style='color:#dc3545;'>Erro.</p>"; }
};
window.resolverDenuncia = async function(id) {
  try { await updateDoc(doc(db, "reportes", id), { resolvido: true, resolvidoEm: Date.now() }); showAlert("Resolvida!", "success"); window.loadDenuncias(); } catch(e) { showAlert("Erro.", "error"); }
};
window.removerGrupoDenunciado = async function(reportId, grupoId) {
  if (!confirm("Remover grupo?")) return;
  try {
    if (grupoId) await deleteDoc(doc(db, "grupos", grupoId));
    await updateDoc(doc(db, "reportes", reportId), { resolvido: true, resolvidoEm: Date.now(), acao: "removido" });
    showAlert("Grupo removido!", "success");
    window.loadDenuncias();
    if (typeof clearGroupsCache === "function") clearGroupsCache();
  } catch(e) { showAlert("Erro.", "error"); }
};
var allPendingGroups = [];
window.filterPendingGroups = function() {
  var search = (document.getElementById("pendingSearchInput")?.value||"").toLowerCase();
  var cat = document.getElementById("pendingCategoryFilter")?.value||"";
  var filtered = [];
  for (var i = 0; i < allPendingGroups.length; i++) {
    var g = allPendingGroups[i];
    if ((!search || (g.nome||"").toLowerCase().indexOf(search) >= 0) && (!cat || g.categoria === cat)) filtered.push(g);
  }
  renderPendingList(filtered);
};
window.bulkApprove = async function() {
  var checks = document.querySelectorAll(".pending-check:checked");
  if (!checks.length) { showAlert("Selecione grupos.", "error"); return; }
  if (!confirm("Aprovar " + checks.length + " grupos?")) return;
  for (var i = 0; i < checks.length; i++) await window.approveGroup(checks[i].value);
  showAlert(checks.length + " aprovados!", "success");
  window.loadPending();
  window.logActivity("Aprovacao em massa", checks.length + " grupos");
};
window.bulkReject = async function() {
  if (!confirm("Reprovar TODOS?")) return;
  for (var i = 0; i < allPendingGroups.length; i++) {
    try { await updateDoc(doc(db, "gruposPendentes", allPendingGroups[i].id), { status: "reprovado", motivoRecusa: "Reprovado em massa" }); } catch(e) {}
  }
  showAlert("Todos reprovados!", "success");
  window.loadPending();
  window.logActivity("Reprovacao em massa", allPendingGroups.length + " grupos");
};
window.clearSelections = function() {
  document.querySelectorAll(".pending-check").forEach(function(c) { c.checked = false; });
  var bar = document.getElementById("pendingBulkBar");
  if (bar) bar.style.display = "none";
};
window.renderVisitsChart = function(horasData) {
  var canvas = document.getElementById("visitsChart");
  if (!canvas || typeof Chart === "undefined") return;
  if (window._visitsChart) window._visitsChart.destroy();
  var labels = [], values = [];
  for (var h = 0; h < 24; h++) {
    labels.push(h + ":00");
    values.push(horasData && horasData[h] ? horasData[h] : 0);
  }
  window._visitsChart = new Chart(canvas, {
    type: "bar",
    data: { labels: labels, datasets: [{ label: "Visitas", data: values, backgroundColor: "rgba(37,211,102,0.6)", borderColor: "#25d366", borderWidth: 1 }] },
    options: { responsive: true, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
  });
};
var originalLoadAdminStats = window.loadAdminStats;
window.loadAdminStats = async function() {
  await originalLoadAdminStats();
  if (typeof Chart !== "undefined") {
    try {
      var snap = await getDoc(doc(db, "analytics_visits", new Date().toISOString().split("T")[0]));
      if (snap.exists()) window.renderVisitsChart(snap.data().horas || {});
    } catch(e) {}
  }
};
`;

// Remove old override
const oldOverride = 'cons
