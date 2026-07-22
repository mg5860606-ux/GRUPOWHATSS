# -*- coding: utf-8 -*-
import os, re

p = 'C:/gruposwhats-site-main'

with open(p + '/script.js', 'r', encoding='utf-8') as f:
    js = f.read()

# New functions with escaped template literals
BT = '`'  # backtick

new_funcs = '''
// ===== NOVAS FUNCOES ADMIN =====

// --- LOG DE ATIVIDADES ---
var adminActivityLog = [];

window.logActivity = function(action, detail) {
  var entry = {
    action: action,
    detail: detail || "",
    time: Date.now(),
    date: new Date().toLocaleString("pt-BR")
  };
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
  if (!adminActivityLog.length) {
    list.innerHTML = "<p style='color:#999;font-size:0.85rem;text-align:center;'>Nenhuma atividade registrada.</p>";
    return;
  }
  var html = "";
  for (var i = 0; i < adminActivityLog.length; i++) {
    var e = adminActivityLog[i];
    var borderColor = "#007bff";
    if (e.action.indexOf("Aprov") >= 0) borderColor = "#28a745";
    else if (e.action.indexOf("Reprov") >= 0) borderColor = "#dc3545";
    html += "<div style='display:flex;justify-content:space-between;align-items:center;padding:10px 15px;background:#f8f9fa;border-radius:8px;border-left:3px solid " + borderColor + ";'>" +
      "<div><strong style='font-size:0.85rem;'>" + e.action + "</strong>" +
      "<span style='font-size:0.75rem;color:#666;margin-left:5px;'>" + (e.detail || "") + "</span></div>" +
      "<span style='font-size:0.7rem;color:#999;white-space:nowrap;'>" + e.date + "</span></div>";
  }
  list.innerHTML = html;
};

window.clearActivityLog = function() {
  adminActivityLog = [];
  localStorage.removeItem("adminActivityLog");
  window.loadActivityLog();
};

// --- CRUD CATEGORIAS ---
window.loadCategorias = async function() {
  var list = document.getElementById("categoriasList");
  if (!list) return;
  try {
    var snap = await getDocs(collection(db, "categorias"));
    if (snap.empty) {
      list.innerHTML = "<p style='color:#999;font-size:0.85rem;text-align:center;'>Nenhuma categoria cadastrada.</p>";
      return;
    }
    var html = "";
    snap.forEach(function(d) {
      var data = d.data();
      var name = data.nome || d.id;
      html += "<div style='display:flex;justify-content:space-between;align-items:center;padding:12px 15px;background:#f8f9fa;border-radius:8px;border:1px solid #e0e0e0;'>" +
        "<span style='font-weight:700;font-size:0.9rem;'>" + name + "</span>" +
        "<div style='display:flex;gap:8px;'><button onclick=\"window.deleteCategoria('" + d.id + "')\" style='padding:6px 12px;background:#dc3545;color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer;font-size:0.75rem;'>Excluir</button></div></div>";
    });
    list.innerHTML = html;
  } catch(e) {
    list.innerHTML = "<p style='color:#dc3545;font-size:0.85rem;'>Erro: " + e.message + "</p>";
  }
};

window.addCategoria = async function() {
  var input = document.getElementById("newCategoriaName");
  if (!input || !input.value.trim()) { showAlert("Digite um nome para a categoria.", "error"); return; }
  var name = input.value.trim();
  try {
    await addDoc(collection(db, "categorias"), { nome: name, data: Date.now() });
    input.value = "";
    showAlert("Categoria adicionada com sucesso!", "success");
    window.loadCategorias();
    window.logActivity("Categoria criada", name);
  } catch(e) {
    showAlert("Erro ao adicionar categoria.", "error");
  }
};

window.deleteCategoria = async function(id) {
  if (!confirm("Excluir esta categoria?")) return;
  try {
    await deleteDoc(doc(db, "categorias", id));
    showAlert("Categoria excluida!", "success");
    window.loadCategorias();
  } catch(e) {
    showAlert("Erro ao excluir categoria.", "error");
  }
};

// --- DENUNCIAS ---
window.loadDenuncias = async function() {
  var list = document.getElementById("denunciasList");
  if (!list) return;
  list.innerHTML = "<p style='color:#999;font-size:0.85rem;text-align:center;'>Carregando...</p>";
  try {
    var snap = await getDocs(query(collection(db, "reportes"), where("resolvido", "!=", true)));
    if (snap.empty) {
      list.innerHTML = "<p style='color:#999;font-size:0.85rem;text-align:center;'>Nenhuma denuncia pendente.</p>";
      return;
    }
    var html = "";
    snap.forEach(function(d) {
      var data = d.data();
      var nome = data.grupoNome || "Desconhecido";
      var motivo = data.motivo || "Sem motivo";
      var desc = data.descricao || "Sem descricao";
      var dataStr = data.data ? new Date(data.data).toLocaleString("pt-BR") : "";
      var grupoId = data.grupoId || "";
      html += "<div style='background:#fff;border:1px solid #e0e0e0;border-radius:8px;padding:15px;'>" +
        "<div style='display:flex;justify-content:space-between;align-items:start;margin-bottom:8px;'>" +
        "<div><strong style='font-size:0.9rem;'>" + nome + "</strong>" +
        "<span style='font-size:0.75rem;color:#666;margin-left:8px;'>" + motivo + "</span></div>" +
        "<span style='font-size:0.7rem;color:#999;white-space:nowrap;'>" + dataStr + "</span></div>" +
        "<p style='font-size:0.8rem;color:#666;margin-bottom:10px;'>" + desc + "</p>" +
        "<div style='display:flex;gap:8px;'>" +
        "<button onclick=\"window.resolverDenuncia('" + d.id + "')\" style='padding:6px 12px;background:#28a745;color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer;font-size:0.75rem;'>Resolver</button>" +
        "<button onclick=\"window.removerGrupoDenunciado('" + d.id + "','" + grupoId + "')\" style='padding:6px 12px;background:#dc3545;color:#fff;border:none;border-radius:6px;font-weight:700;cursor:pointer;font-size:0.75rem;'>Remover Grupo</button>" +
        "</div></div>";
    });
    list.innerHTML = html;
  } catch(e) {
    list.innerHTML = "<p style='color:#dc3545;font-size:0.85rem;'>Erro: " + e.message + "</p>";
  }
};

window.resolverDenuncia = async function(id) {
  try {
    await updateDoc(doc(db, "reportes", id), { resolvido: true, resolvidoEm: Date.now() });
    showAlert("Denuncia resolvida!", "success");
    window.loadDenuncias();
    window.logActivity("Denuncia resolvida", id);
  } catch(e) {
    showAlert("Erro ao resolver denuncia.", "error");
  }
};

window.removerGrupoDenunciado = async function(reportId, grupoId) {
  if (!confirm("Remover este grupo do site permanentemente?")) return;
  try {
    if (grupoId) {
      await deleteDoc(doc(db, "grupos", grupoId));
    }
    await updateDoc(doc(db, "reportes", reportId), { resolvido: true, resolvidoEm: Date.now(), acao: "grupo_removido" });
    showAlert("Grupo removido e denuncia resolvida!", "success");
    window.loadDenuncias();
    window.logActivity("Grupo removido por denuncia", grupoId);
    if (typeof clearGroupsCache === "function") clearGroupsCache();
  } catch(e) {
    showAlert("Erro ao processar.", "error");
  }
};

// --- FILTRO E BUSCA NA MODERACAO ---
var allPendingGroups = [];

window.filterPendingGroups = function() {
  var searchEl = document.getElementById("pendingSearchInput");
  var catEl = document.getElementById("pendingCategoryFilter");
  var search = searchEl ? searchEl.value.toLowerCase() : "";
  var cat = catEl ? catEl.value : "";
  var filtered = [];
  for (var i = 0; i < allPendingGroups.length; i++) {
    var g = allPendingGroups[i];
    var matchName = !search || (g.nome || "").toLowerCase().indexOf(search) >= 0;
    var matchCat = !cat || (g.categoria || "") === cat;
    if (matchName && matchCat) filtered.push(g);
  }
  renderPendingList(filtered);
};

window.bulkApprove = async function() {
  var checks = document.querySelectorAll(".pending-check:checked");
  if (!checks.length) { showAlert("Selecione grupos para aprovar.", "error"); return; }
  if (!confirm("Aprovar " + checks.length + " grupos?")) 
