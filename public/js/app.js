"use strict";

const KEY = "recargabus_sim_v1";
const PRECO = 4.5;
const ADMIN_LOGIN = "admin@recargabus.com";
const ADMIN_PASS = "admin123";

let db = loadDB();
let session = localStorage.getItem(KEY + "_sess") || null;
let cur = { code: "", qty: 10, method: "" };
let pixTimer = null;
let pixDeadline = 0;

function loadDB() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw && raw.users) return raw;
  } catch (e) {}
  return { users: {} };
}
function save() { localStorage.setItem(KEY, JSON.stringify(db)); }

function user() { return session ? db.users[session] : null; }
function fmt(v) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }
function fmtCode(digits) { return digits.replace(/(\d{4})(?=\d)/g, "$1 ").trim(); }
function totalUnits(u) { return Object.values(u.cards).reduce((a, b) => a + b, 0); }

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(t._h);
  t._h = setTimeout(() => t.classList.remove("show"), 2400);
}

const $ = id => document.getElementById(id);

function showLoginError(msg) {
  const el = $("login-error");
  el.textContent = msg;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
}

let loginMode = "login";

function setLoginMode(mode) {
  loginMode = mode;
  document.querySelectorAll("#login-mode .seg-btn").forEach(b =>
    b.classList.toggle("on", b.dataset.mode === mode)
  );
  const isCpf = mode === "cpf";
  $("in-login-field").style.display = isCpf ? "none" : "";
  $("in-cpf-field").style.display = isCpf ? "" : "none";
  if (isCpf) $("in-cpf").focus();
  else $("in-login").focus();
}

function maskCpf(v) {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return d.slice(0, 3) + "." + d.slice(3);
  if (d.length <= 9) return d.slice(0, 3) + "." + d.slice(3, 6) + "." + d.slice(6);
  return d.slice(0, 3) + "." + d.slice(3, 6) + "." + d.slice(6, 9) + "-" + d.slice(9);
}

function validCpf(cpf) {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = n => {
    let sum = 0;
    for (let i = 0; i < n; i++) sum += parseInt(d[i]) * (n + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === parseInt(d[9]) && calc(10) === parseInt(d[10]);
}

$("in-cpf").addEventListener("input", e => {
  e.target.value = maskCpf(e.target.value);
});

$("login-form").addEventListener("submit", e => {
  e.preventDefault();
  const pass = $("in-pass").value;
  let login;
  if (loginMode === "cpf") {
    const cpf = $("in-cpf").value;
    if (!validCpf(cpf)) return showLoginError("CPF inválido. Verifique os 11 dígitos.");
    login = "cpf:" + cpf.replace(/\D/g, "");
  } else {
    login = $("in-login").value.trim().toLowerCase();
    if (login.length < 3) return showLoginError("Informe um login com pelo menos 3 caracteres.");
  }
  if (pass.length < 4) return showLoginError("A senha precisa ter pelo menos 4 caracteres.");
  if (login === ADMIN_LOGIN) {
    if (pass !== ADMIN_PASS) return showLoginError("Senha incorreta para o administrador.");
  } else if (!db.users[login]) {
    db.users[login] = { cards: {}, tx: [] };
  }
  db.users[login].pass = pass;
  save();
  loginAs(login);
});

function loginAs(login) {
  session = login;
  localStorage.setItem(KEY + "_sess", login);
  $("shell").classList.remove("hidden");
  $("screen-login").classList.remove("active");
  go("home");
  toast("Bem-vindo(a), " + friendlyId(login) + "!");
}

function friendlyId(login) {
  if (/^cpf:/.test(login)) return maskCpf(login.slice(4));
  return login;
}

function logout() {
  if (!confirm("Sair da sua conta?")) return;
  clearInterval(pixTimer);
  stopMapPolling();
  closePay();
  session = null;
  localStorage.removeItem(KEY + "_sess");
  $("shell").classList.add("hidden");
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  $("screen-login").classList.add("active");
  $("in-login").value = "";
  $("in-pass").value = "";
}

function boot() {
  if (session && db.users[session]) {
    $("shell").classList.remove("hidden");
    go("home");
  } else {
    session = null;
    localStorage.removeItem(KEY + "_sess");
  }
}

function go(name) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  const target = $("screen-" + name);
  if (target) target.classList.add("active");
  document.querySelectorAll(".nav-item").forEach(n =>
    n.classList.toggle("active", n.dataset.nav === name)
  );
  renderAll();
  if (name === "mapa") initMapTab();
  else { stopMapPolling(); stopUserTracking(); }
  window.scrollTo({ top: 0 });
}

function renderAll() {
  const u = user();
  if (!u) return;
  const friendlyLogin = friendlyId(session);
  const first = u.isAdmin ? "Admin" : friendlyLogin.split(".")[0];
  const cap = first.charAt(0).toUpperCase() + first.slice(1);
  $("greet").textContent = "Olá, " + cap + "!";
  ["avatar", "avatar-ext", "avatar-perf", "avatar-sb"].forEach(id => $(id).textContent = first.charAt(0));
  $("profile-login").textContent = friendlyLogin;
  $("sb-login").textContent = friendlyLogin;
  $("sb-type").textContent = u.isAdmin ? "Administrador" : "Conta RecargaBus";
  $("profile-type").textContent = u.isAdmin ? "Conta administradora" : "Conta RecargaBus";

  const tot = totalUnits(u);
  $("total-units").innerHTML = tot + " <small>un.</small>";
  $("stat-units").textContent = tot;
  $("stat-count").textContent = u.tx.length;

  const list = $("cards-list");
  const codes = Object.keys(u.cards);
  if (!codes.length) {
    list.innerHTML =
      '<div class="empty-state">' +
      '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#6d7d75" stroke-width="1.6" stroke-linecap="round"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>' +
      '<p>Nenhum cartão por aqui ainda.<br><b>Faça sua primeira recarga!</b></p>' +
      '<button class="btn small" style="margin-top:16px" onclick="startRecharge()">Recarregar agora</button></div>';
  } else {
    list.innerHTML = codes.map(c => {
      const meta = (u.cardMeta && u.cardMeta[c]) || {};
      const type = meta.type === "estudante" ? "estudante" : meta.type === "idoso" ? "idoso" : "comum";
      const label = type === "estudante" ? "Estudante" : type === "idoso" ? "Idoso" : "Comum";
      return '<div class="card-item">' +
        '<img class="card-img" src="cards/' + type + '.jpg" alt="Cartão ' + label + '">' +
        '<div class="card-mid"><div class="card-type">' + label + '</div>' +
        '<div class="code">' + fmtCode(c) + '</div>' +
        (meta.doc ? '<div class="sub">' + meta.doc + '</div>' : '') +
        '</div><div class="units-pill">' + u.cards[c] + ' un.</div></div>';
    }).join("");
  }

  const tl = $("tx-list");
  if (!u.tx.length) {
    tl.innerHTML = '<div class="empty-state"><p>Você ainda não fez recargas.<br><b>Elas aparecerão aqui.</b></p></div>';
  } else {
    tl.innerHTML = u.tx.map(t => {
      const d = new Date(t.date).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
      const label = t.method === "pix" ? "Pix"
        : t.method === "boleto" ? "Boleto"
        : t.method === "deb" ? "Débito"
        : "Crédito" + (t.parcelas > 1 ? " · " + t.parcelas + "x" : "");
      return '<div class="tx-item"><div class="tx-ic ' + t.method + '">' +
        (t.method === "pix" ? "P" : t.method === "boleto" ? "B" : t.method === "deb" ? "D" : "C") +
        '</div><div class="tx-info"><b>+ ' + t.qty + ' unidades</b>' +
        '<span>' + label + " · " + fmtCode(t.code) + "</span>" +
        '<div class="status-ok">Aprovada · ' + d + '</div></div>' +
        '<div class="tx-amt"><b>' + fmt(t.total) + "</b><small>1×</small></div></div>";
    }).join("");
  }
}

function startRecharge() {
  cur = { code: "", qty: 10, method: "" };
  renderRechargeCards();
  setQty(10);
  $("in-senha").value = "";
  rstep(1);
  go("recharge");
}

function renderRechargeCards() {
  const u = user();
  const codes = Object.keys(u.cards);
  $("recharge-empty").classList.toggle("hidden", codes.length > 0);
  if (!codes.length) {
    $("recharge-card-list").innerHTML = "";
    cur.code = "";
    return;
  }
  if (!u.cards[cur.code]) cur.code = codes[0];
  $("recharge-card-list").innerHTML = codes.map(c => {
    const meta = (u.cardMeta && u.cardMeta[c]) || {};
    const type = meta.type === "estudante" ? "estudante" : meta.type === "idoso" ? "idoso" : "comum";
    const label = type === "estudante" ? "Estudante" : type === "idoso" ? "Idoso" : "Comum";
    return '<div class="pick-card' + (c === cur.code ? " sel" : "") + '" data-code="' + c + '" onclick="selectRechargeCard(this)">' +
      '<img class="card-img" src="cards/' + type + '.jpg" alt="Cartão ' + label + '">' +
      '<div class="card-mid"><div class="card-type">' + label + '</div>' +
      '<div class="code">' + fmtCode(c) + '</div></div>' +
      '<div class="units-pill">' + u.cards[c] + ' un.</div>' +
      '<span class="radio-pick' + (c === cur.code ? " on" : "") + '"></span></div>';
  }).join("");
}

function selectRechargeCard(el) {
  document.querySelectorAll(".pick-card").forEach(x => {
    x.classList.remove("sel");
    x.querySelector(".radio-pick").classList.remove("on");
  });
  el.classList.add("sel");
  el.querySelector(".radio-pick").classList.add("on");
  cur.code = el.dataset.code;
}

function pickRechargeCard() {
  if (!cur.code) { toast("Selecione um cartão para continuar"); return; }
  $("qty-card-code").textContent = fmtCode(cur.code);
  setQty(cur.qty);
  rstep(2);
}

$("in-senha").addEventListener("keydown", e => {
  if (e.key === "Enter") { e.preventDefault(); validateSenha(); }
});

function validateSenha() {
  const u = user();
  const pass = $("in-senha").value;
  if (pass.length < 4) { toast("Informe a senha da conta"); $("in-senha").focus(); return; }
  if (u.pass && u.pass !== pass) {
    toast("Senha incorreta");
    $("in-senha").value = "";
    $("in-senha").focus();
    return;
  }
  if (!u.pass) { u.pass = pass; save(); }
  rstep(4);
}

function rstep(n) {
  document.querySelectorAll(".r-step").forEach(s => {
    const on = Number(s.dataset.step) === n;
    s.classList.toggle("hidden", !on);
    s.style.display = on ? (n === 5 ? "flex" : "block") : "none";
  });
  document.querySelectorAll(".step-dot").forEach(d =>
    d.classList.toggle("on", Number(d.dataset.step) <= Math.min(n, 4))
  );
  $("steps-ind").style.visibility = n >= 5 ? "hidden" : "visible";
}

function chQty(delta) { setQty(Math.min(40, Math.max(1, cur.qty + delta))); }
function setQty(q) {
  cur.qty = q;
  $("qty-display").textContent = q;
  document.querySelectorAll(".chip").forEach(c =>
    c.classList.toggle("sel", Number(c.textContent) === q)
  );
  $("sum-detail").textContent = q + " un × " + fmt(PRECO);
  $("sum-total").textContent = fmt(q * PRECO);
}

function goRechStep3() {
  $("pay-summary").textContent = cur.qty + " unidades (" + fmt(cur.qty * PRECO) + ")";
  $("pay-card-code").textContent = fmtCode(cur.code);
  rstep(3);
}

function openPayment(method) {
  cur.method = method;
  $("pay-summary2").textContent = cur.qty + " unidades (" + fmt(cur.qty * PRECO) + ")";
  $("pay-card-code2").textContent = fmtCode(cur.code);
}

function openPix() {
  openPayment("pix");
  const payload = "00020126BR.GOV.BCB.PIX01RECARGABUS-SIM5204000053039865802BR5913SIMULADOR6009SAO PAULO62" +
    String(5000 + Math.floor(Math.random() * 900)) + "04" + Date.now().toString().slice(-10) + "6304ABCD";
  $("pix-amount").textContent = fmt(cur.qty * PRECO);
  $("pix-payload").textContent = payload;
  drawQR($("qr-canvas"), payload);
  startPixTimer();
  $("pix-confirm").disabled = false;
  $("pix-confirm").innerHTML = "Já paguei — confirmar";
  $("modal-pix").classList.add("show");
}

function startPixTimer() {
  clearInterval(pixTimer);
  pixDeadline = Date.now() + 600 * 1000;
  updateTimer();
  pixTimer = setInterval(updateTimer, 500);
}

function updateTimer() {
  const left = Math.max(0, Math.floor((pixDeadline - Date.now()) / 1000));
  const m = String(Math.floor(left / 60)).padStart(2, "0");
  const s = String(left % 60).padStart(2, "0");
  const el = $("pix-timer");
  el.textContent = "Pix expira em " + m + ":" + s + " (simulação)";
  el.classList.toggle("expired", left === 0);
  if (left === 0) {
    clearInterval(pixTimer);
    $("pix-confirm").disabled = true;
    $("pix-confirm").textContent = "Pix expirado";
  }
}

function copyPix() {
  const txt = $("pix-payload").textContent;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(() => toast("Código Pix copiado"), () => fallbackCopy(txt));
  } else fallbackCopy(txt);
}
function fallbackCopy(txt) {
  const ta = document.createElement("textarea");
  ta.value = txt; document.body.appendChild(ta); ta.select();
  try { document.execCommand("copy"); toast("Código Pix copiado"); } catch (e) {}
  ta.remove();
}

function confirmPix() {
  const btn = $("pix-confirm");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>&nbsp;Confirmando pagamento…';
  setTimeout(() => {
    clearInterval(pixTimer);
    approve("pix");
  }, 1800);
}

function openBoleto() {
  openPayment("boleto");
  $("boleto-amount").textContent = fmt(cur.qty * PRECO);
  const venc = new Date();
  venc.setDate(venc.getDate() + 3);
  $("boleto-venc").textContent = venc.toLocaleDateString("pt-BR");
  let line = "23793.90510 12345.670021 90000.104000 8 12345678901234";
  $("boleto-line").textContent = line;
  $("boleto-confirm").disabled = false;
  $("boleto-confirm").innerHTML = "Já paguei — confirmar";
  $("modal-boleto").classList.add("show");
}

function copyBoleto() {
  const v = $("boleto-line").textContent.replace(/\s+/g, "");
  if (navigator.clipboard && navigator.clipboard.writeText)
    navigator.clipboard.writeText(v).catch(() => {});
  toast("Linha digitável copiada");
}

function confirmBoleto() {
  const btn = $("boleto-confirm");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>&nbsp;Validando pagamento…';
  setTimeout(() => approve("boleto"), 1800);
}

const JUROS_CARTAO = 0.0249;
let cardMode = "deb";
let cardParcel = 1;

function openCard() {
  openPayment("cred");
  cardMode = "deb";
  cardParcel = 1;
  $("card-error").classList.remove("show");
  $("card-pay").disabled = false;
  $("card-pay").textContent = "Pagar agora";
  setCardMode("deb");
  $("modal-card").classList.add("show");
}

function pricePmt(base, n) {
  if (n <= 3) return [base / n, base];
  const parc = base * JUROS_CARTAO / (1 - Math.pow(1 + JUROS_CARTAO, -n));
  return [Math.round(parc * 100) / 100, Math.round(parc * n * 100) / 100];
}

function setCardMode(m) {
  cardMode = m;
  document.querySelectorAll("#card-mode .seg-btn").forEach(b =>
    b.classList.toggle("on", b.dataset.mode === m));
  const deb = $("card-deb-info");
  const parc = $("parcel-block");
  if (m === "cred") {
    parc.style.display = "";
    deb.style.display = "none";
    renderParcelas();
  } else {
    parc.style.display = "none";
    deb.style.display = "";
    const base = cur.qty * PRECO;
    $("card-deb-parc").textContent = fmt(base);
  }
  updateCardAmount();
}

function renderParcelas() {
  const base = cur.qty * PRECO;
  const list = $("parcel-list");
  list.innerHTML = "";
  for (let n = 1; n <= 12; n++) {
    const [parc, total] = pricePmt(base, n);
    const el = document.createElement("button");
    el.type = "button";
    el.className = "parc-opt" + (n === cardParcel ? " sel" : "");
    el.innerHTML = "<b>" + n + "x de " + fmt(parc) + "</b>" +
      "<span>Total " + fmt(total) + (n > 3 ? " · juros 2,49% a.m." : " · sem juros") + "</span>";
    el.onclick = () => { cardParcel = n; renderParcelas(); updateCardAmount(); };
    list.appendChild(el);
  }
}

function updateCardAmount() {
  const base = cur.qty * PRECO;
  $("card-amount").textContent = fmt(cardMode === "cred" ? pricePmt(base, cardParcel)[1] : base);
}

$("cc-num").addEventListener("input", e => {
  let v = e.target.value.replace(/\D/g, "").slice(0, 16);
  e.target.value = v.replace(/(\d{4})(?=\d)/g, "$1 ").trim();
});
$("cc-exp").addEventListener("input", e => {
  let v = e.target.value.replace(/\D/g, "").slice(0, 4);
  e.target.value = v.length > 2 ? v.slice(0, 2) + "/" + v.slice(2) : v;
});
$("cc-cvv").addEventListener("input", e => {
  e.target.value = e.target.value.replace(/\D/g, "").slice(0, 3);
});

$("card-form").addEventListener("submit", e => {
  e.preventDefault();
  const err = msg => {
    const el = $("card-error");
    el.textContent = msg;
    el.classList.remove("show");
    void el.offsetWidth;
    el.classList.add("show");
  };
  const num = $("cc-num").value.replace(/\D/g, "");
  const exp = $("cc-exp").value.replace(/\D/g, "");
  const cvv = $("cc-cvv").value;
  if (num.length !== 16) return err("O número do cartão deve ter 16 dígitos.");
  if (!$("cc-name").value.trim()) return err("Informe o nome impresso no cartão.");
  if (exp.length !== 4 || Number(exp.slice(0, 2)) < 1 || Number(exp.slice(0, 2)) > 12)
    return err("Validade inválida (use MM/AA).");
  if (cvv.length !== 3) return err("O CVV deve ter 3 dígitos.");
  const btn = $("card-pay");
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>&nbsp;Processando…';
  const [parc, total] = pricePmt(cur.qty * PRECO, cardMode === "deb" ? 1 : cardParcel);
  setTimeout(() => approve(cardMode === "deb" ? "deb" : "cred", total, cardMode === "deb" ? 1 : cardParcel, parc), 2000);
});

function closePay() {
  $("modal-pix").classList.remove("show");
  $("modal-card").classList.remove("show");
  $("modal-boleto").classList.remove("show");
  clearInterval(pixTimer);
}

function approve(method, total = +(cur.qty * PRECO).toFixed(2), parcelas = 1, parcelaVal = 0) {
  const u = user();
  u.cards[cur.code] = (u.cards[cur.code] || 0) + cur.qty;
  u.tx.unshift({
    date: new Date().toISOString(),
    code: cur.code,
    qty: cur.qty,
    method,
    parcelas,
    total,
    status: "Aprovada"
  });
  save();
  $("receipt").innerHTML =
    row("Cartão", fmtCode(cur.code)) +
    row("Unidades", "+" + cur.qty + " un.") +
    row("Pagamento", payLabel(method, parcelas, parcelaVal)) +
    row("Total", "<span style='color:var(--p-dark)'>" + fmt(total) + "</span>") +
    row("Status", "<span class='status-ok'>Aprovada (simulada)</span>");
  closePay();
  rstep(5);
  function row(k, v) { return '<div class="row"><span>' + k + "</span><b>" + v + "</b></div>"; }
}

function payLabel(method, parcelas, parcelaVal) {
  if (method === "pix") return "Pix";
  if (method === "boleto") return "Boleto bancário";
  if (method === "deb") return "Cartão de débito";
  return parcelas > 1
    ? "Cartão de crédito · " + parcelas + "x de " + fmt(parcelaVal)
    : "Cartão de crédito";
}

function finishRecharge() {
  go("home");
}

const CARD_TYPES = {
  comum: { label: "Comum", img: "cards/comum.jpg" },
  estudante: { label: "Estudante", img: "cards/estudante.jpg" },
  idoso: { label: "Idoso", img: "cards/idoso.jpg" }
};

function openAddCard() {
  $("ac-num").value = "";
  $("ac-type").value = "comum";
  $("ac-pdf").value = "";
  updateAddCardLabel();
  $("addcard-error").classList.remove("show");
  $("modal-addcard").classList.add("show");
  setTimeout(() => $("ac-num").focus(), 80);
}

function closeAddCard() {
  $("modal-addcard").classList.remove("show");
}

function updateAddCardLabel() {
  const t = $("ac-type").value;
  const field = $("ac-pdf-field");
  const file = $("ac-pdf");
  if (t === "comum") {
    field.style.display = "none";
    file.removeAttribute("required");
  } else {
    field.style.display = "";
    file.setAttribute("required", "required");
    $("ac-pdf-label").textContent =
      t === "estudante" ? "Anexar Histórico Escolar (PDF)" : "Anexar Comprovante / Doc. Idoso (PDF)";
  }
}

$("addcard-form").addEventListener("submit", function (e) {
  e.preventDefault();
  const u = user();
  if (!u) return;
  const err = $("addcard-error");
  err.classList.remove("show");
  const fail = m => { err.textContent = m; err.classList.add("show"); };
  const code = $("ac-num").value.replace(/\D/g, "").slice(0, 12);
  if (code.length !== 12) return fail("O número do cartão deve ter 12 dígitos.");
  const type = $("ac-type").value;
  const file = $("ac-pdf").files[0];
  if (!CARD_TYPES[type]) return fail("Tipo de cartão inválido.");
  if (file && !/\.pdf$/i.test(file.name)) return fail("Apenas arquivos PDF são aceitos.");
  if (type !== "comum" && !file)
    return fail(type === "estudante" ? "Anexe o histórico escolar em PDF." : "Anexe o comprovante do idoso em PDF.");
  if (!u.cards[code]) u.cards[code] = 0;
  if (!u.cardMeta) u.cardMeta = {};
  u.cardMeta[code] = { type: type, doc: file ? file.name : "" };
  save();
  closeAddCard();
  renderAll();
  renderRechargeCards();
  toast("Cartão " + fmtCode(code) + " (" + CARD_TYPES[type].label + ") adicionado");
});

["modal-pix", "modal-card", "modal-boleto"].forEach(id => {
  $(id).addEventListener("click", e => { if (e.target === $(id)) closePay(); });
});
$("modal-addcard").addEventListener("click", e => { if (e.target === $("modal-addcard")) closeAddCard(); });
document.addEventListener("keydown", e => { if (e.key === "Escape") { closePay(); closeAddCard(); } });

function resetData() {
  if (!confirm("Apagar todos os seus cartões e histórico?")) return;
  db.users[session] = { cards: {}, tx: [], isAdmin: user().isAdmin };
  save();
  renderAll();
  toast("Dados apagados");
}

function showRules() {
  alert(
    "Carregue seu cartão e acompanhe tudo em um só lugar.\n\n" +
    "- Crie sua conta com um login e senha.\n" +
    "- Adicione seus cartões e escolha a quantidade de unidades.\n" +
    "- Pague com Pix, cartão de débito/crédito ou boleto.\n" +
    "- Os dados ficam salvos apenas no seu navegador (localStorage)."
  );
}

function seedFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function drawQR(canvas, text) {
  const N = 25, Q = 2, M = N + Q * 2;
  const ctx = canvas.getContext("2d");
  const cell = canvas.width / M;
  const rnd = mulberry32(seedFrom(text));
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#12241b";
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++) {
      const inFinder = (x < 8 && y < 8) || (x > N - 9 && y < 8) || (x < 8 && y > N - 9);
      if (!inFinder && rnd() < 0.46)
        ctx.fillRect((x + Q) * cell, (y + Q) * cell, cell + 0.5, cell + 0.5);
    }
  const finder = (fx, fy) => {
    for (let y = 0; y < 7; y++)
      for (let x = 0; x < 7; x++) {
        const edge = x === 0 || y === 0 || x === 6 || y === 6;
        const core = x >= 2 && x <= 4 && y >= 2 && y <= 4;
        if (edge || core)
          ctx.fillRect((fx + x + Q) * cell, (fy + y + Q) * cell, cell + 0.5, cell + 0.5);
      }
  };
  finder(0, 0); finder(N - 7, 0); finder(0, N - 7);
}

/*
 * ── Mapa ao Vivo · Integração Auttran ─────────────────────────────
 * Dados: https://cdfuberaba.auttran.com/chegadas/chegadas.php
 * Endpoint interno: ../ajax/fulltable.php?codlinha=NNN&city=UBEN
 */
const AUTTRAN = {
  base: "https://cdfuberaba.auttran.com",
  city: "UBEN",
  refreshMs: 20000
};
/* Worker da Cloudflare que repassa as requisições à Auttran
   adicionando os cabeçalhos CORS (Access-Control-Allow-Origin: *) */
const AUTTRAN_WORKER_URL = "https://recargabus.sofiatressepires.workers.dev";
const UB_COORDS = { lat: -19.7475, lng: -47.9317 };
const UB_TERMINALS = [
  { name: "Terminal Univerde", lat: -19.7300, lng: -47.9420 },
  { name: "Terminal Beija-Flor", lat: -19.7550, lng: -47.9180 },
  { name: "Terminal Gameleiras", lat: -19.7310, lng: -47.9220 },
  { name: "Terminal Manoel Mendes", lat: -19.7660, lng: -47.9600 }
];
/* Mapeamento linha exibida → código interno (id vindo do chegadas.php) */
const NUM_LINHA = {
  "010":"1010","011":"11","012":"12","013":"13","014":"14","015":"15","016":"16","017":"17","018":"18","019":"7","020":"20","021":"21","022":"22","023":"23","024":"24","025":"1","026":"2","027":"3","028":"28","029":"8","030":"30","031":"31","032":"32","050":"1050","051":"4","052":"52","053":"1053","054":"54","055":"1055","056":"1056","057":"1057","058":"58","059":"59","060":"60","061":"1061","062":"62","064":"64","065":"1065","066":"19","067":"67","068":"1068","069":"69","072":"72","100":"100","110":"1005","111":"1006","120":"120","121":"121","200":"200"
};
function codeWin(code) { return NUM_LINHA[code] || code; }

let mapObj = null;
let stopMarkers = [];
let linePaths = [];
let mapPollTimer = null;
let mapPaused = false;
let selectedLineCode = "";
let linesData = [];
let lastUpdate = null;
let mapReqSeq = 0;
let userMarker = null;
let userWatchId = null;
let currentStops = [];
let userCoords = null;
let userAddress = "";
let userAccuracy = Infinity;
let lastGeocodeTs = 0;

function mapRetry() {
  loadMapLine(selectedLineCode);
}

function isLeafletReady() {
  return typeof window.L !== "undefined" && typeof window.L.map === "function";
}

function initMapTab() {
  const wrap = $("bus-map");
  if (!wrap) return;
  if (isLeafletReady()) {
    if (!mapObj) buildMap();
    else { setTimeout(() => mapObj.invalidateSize(), 300); }
    if (!mapPollTimer && !mapPaused) startMapPolling();
    populateLineSelect();
    if (selectedLineCode) loadMapLine(selectedLineCode);
    else loadMapLine("");
  } else {
    renderMapError("A biblioteca de mapas (Leaflet) não pôde ser carregada. Verifique a conexão com a internet.");
  }
}

function buildMap() {
  mapObj = L.map("bus-map", { zoomControl: true })
    .setView([UB_COORDS.lat, UB_COORDS.lng], 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  }).addTo(mapObj);
  L.control.scale({ imperial: false }).addTo(mapObj);
  startUserTracking();
  setTimeout(() => mapObj.invalidateSize(), 250);
  setTimeout(() => mapObj.invalidateSize(), 1000);
}

function startUserTracking() {
  if (!("geolocation" in navigator) || userWatchId !== null || !mapObj) return;
  userAccuracy = Infinity;
  userWatchId = navigator.geolocation.watchPosition(
    function (pos) {
      if (!mapObj) return;
      const acc = pos.coords.accuracy;
      if (acc >= userAccuracy) return;
      const first = userAccuracy === Infinity;
      const rlat = pos.coords.latitude;
      const rlng = pos.coords.longitude;
      userAccuracy = acc;
      userCoords = { lat: rlat, lng: rlng };
      if (userMarker) mapObj.removeLayer(userMarker);
      userMarker = L.circleMarker([rlat, rlng], {
        radius: 9, color: "#fff", weight: 2, fillColor: "#dc2626", fillOpacity: .95
      }).addTo(mapObj).bindPopup('<div class="bus-popup"><b>📍 Você está aqui</b></div>');
      refreshUserMarkerPopup();
      if (first || Date.now() - lastGeocodeTs > 2000) {
        lastGeocodeTs = Date.now();
        reverseGeocode(rlat, rlng, function (addr) {
          if (!mapObj || !userCoords || userCoords.lat !== rlat || userCoords.lng !== rlng) return;
          userAddress = addr;
          refreshUserMarkerPopup();
        });
      }
      if (first) userMarker.openPopup();
    },
    function () { userWatchId = null; },
    { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
  );
}

function stopUserTracking() {
  if (userWatchId !== null) {
    navigator.geolocation.clearWatch(userWatchId);
    userWatchId = null;
  }
  userCoords = null;
  userAccuracy = Infinity;
  userAddress = "";
  lastGeocodeTs = 0;
  if (userMarker && mapObj) { mapObj.removeLayer(userMarker); userMarker = null; }
}

function haversineDist(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const rad = a => a * Math.PI / 180;
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatDistM(m) {
  return m > 1000 ? (m / 1000).toFixed(1) + " km" : Math.round(m) + " m";
}

function nearestStop(lat, lng) {
  let best = null;
  let min = Infinity;
  currentStops.forEach(st => {
    const d = haversineDist(lat, lng, st.lat, st.lng);
    if (d < min) { min = d; best = st; }
  });
  return best ? { name: best.name, dist: min } : null;
}

function reverseGeocode(lat, lng, cb) {
  fetch("https://nominatim.openstreetmap.org/reverse?format=jsonv2&accept-language=pt-BR&lat=" + lat + "&lon=" + lng)
    .then(r => r.json())
    .then(d => cb(d && d.display_name ? d.display_name : "Endereço não identificado"))
    .catch(() => cb("Endereço não identificado"));
}

function refreshUserMarkerPopup() {
  if (!userMarker || !userCoords) return;
  const near = nearestStop(userCoords.lat, userCoords.lng);
  const end = userAddress || "Obtendo endereço…";
  const stopLabel = near ? near.name : "Nenhum ponto próximo";
  const distLabel = near ? formatDistM(near.dist) : "—";
  const html =
    '<div class="bus-popup" style="min-width:200px"><b>📍 Você está aqui</b>' +
    '<div style="font-size:12px;color:#333">' + end + "</div>" +
    '<hr style="margin:6px 0;border:0;border-top:1px solid #ccc">' +
    '<div class="pop-addr"><b>Ponto mais próximo:</b><br>' + stopLabel + " (" + distLabel + ")</div></div>";
  userMarker.bindPopup(html);
}

function showMapSearchStatus(msg) {
  const el = $("map-search-msg");
  if (!el) return;
  el.textContent = msg || "";
  if (msg) setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, 6000);
}

function searchAddress() {
  const input = $("map-search-input");
  const q = input ? input.value.trim() : "";
  if (!q) return;
  const btn = $("map-search-btn");
  if (btn) btn.disabled = true;
  const qGeoCoded = encodeURIComponent(q + ", Uberaba, MG");
  const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&accept-language=pt-BR" +
    "&countrycodes=br&viewbox=-48.05,-19.65,-47.85,-19.85&bounded=1&q=" + qGeoCoded;
  fetch(url)
    .then(r => r.json())
    .then(function (res) {
      if (!res || !res.length) throw new Error("endereco-nao-encontrado");
      const lat = parseFloat(res[0].lat);
      const lng = parseFloat(res[0].lon);
      setUserLocation(lat, lng, res[0].display_name || q);
    })
    .catch(function () {
      showMapSearchStatus("Endereço não encontrado. Tente outro termo.");
    })
    .finally(function () { if (btn) btn.disabled = false; });
}

function setUserLocation(lat, lng, label) {
  if (!mapObj) return;
  userCoords = { lat: lat, lng: lng };
  userAccuracy = 0;
  userAddress = label || "";
  if (userMarker) mapObj.removeLayer(userMarker);
  userMarker = L.circleMarker([lat, lng], {
    radius: 9, color: "#fff", weight: 2, fillColor: "#dc2626", fillOpacity: .95
  }).addTo(mapObj).bindPopup('<div class="bus-popup"><b>📍 Você está aqui</b></div>');
  refreshUserMarkerPopup();
  if (userMarker) userMarker.openPopup();
  mapObj.setView([lat, lng], Math.max(mapObj.getZoom(), 14));
}

function startMapPolling() {
  stopMapPolling();
  mapPollTimer = setInterval(mapPollTick, AUTTRAN.refreshMs);
}
function stopMapPolling() {
  if (mapPollTimer) { clearInterval(mapPollTimer); mapPollTimer = null; }
}
function toggleMapPause() {
  mapPaused = !mapPaused;
  const btn = $("map-pause-btn");
  btn.textContent = mapPaused ? "Retomar" : "Pausar";
  btn.classList.toggle("paused", mapPaused);
  if (mapPaused) stopMapPolling();
  else { startMapPolling(); mapPollTick(); }
}
function mapPollTick() {
  if (mapPaused) return;
  if (selectedLineCode) loadMapLine(selectedLineCode, true);
}

function populateLineSelect() {
  const sel = $("map-line-select");
  if (!sel || linesData.length) return;
  linesData = extractLinesFromHtml(UB_LINES_HTML);
  linesData.sort((a, b) => String(a.code).localeCompare(String(b.code)));
  sel.innerHTML = '<option value="">— Todas as linhas —</option>' +
    linesData.map(l => '<option value="' + l.code + '">' + l.code + ' · ' + l.name + "</option>").join("");
}
function selectMapLine(val) {
  selectedLineCode = val || "";
  loadMapLine(selectedLineCode);
}

function loadMapLine(code, silent) {
  if (!code) { renderAllTerminals(); return; }
  if (!silent) showMapLoading();
  const seq = ++mapReqSeq;
  const win = codeWin(code);
  const stamp = Date.now();
  const workerUrl = AUTTRAN_WORKER_URL + "/ajax/fulltable.php?codlinha=" + win + "&city=" + AUTTRAN.city + "&d=" + stamp;
  const directUrl = AUTTRAN.base + "/ajax/fulltable.php?codlinha=" + win + "&city=" + AUTTRAN.city + "&d=" + stamp;
  fetchAuttran(workerUrl, directUrl)
    .then(html => {
      if (seq !== mapReqSeq) return;
      const table = parseFulltable(html);
      renderMapData(table, !silent);
      lastUpdate = new Date();
    })
    .catch(err => {
      if (seq !== mapReqSeq) return;
      renderMapError("Não foi possível obter os dados em tempo real agora. Verifique se o Worker da Cloudflare está publicado e configurado.");
    });
}

function fetchAuttran(workerUrl, directUrl) {
  const grab = r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); };
  const timed = (p, ms) =>
    Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
  const attempt = (u, opts) => timed(fetch(u, Object.assign({ cache: "no-store" }, opts || {})), 12000).then(grab);
  return attempt(workerUrl, { mode: "cors" })
    .catch(() => attempt(directUrl, { mode: "cors" }));
}

function renderAllTerminals() {
  $("map-status").classList.add("hidden");
  document.getElementById("map-cors-note").style.display = "block";
  clearMapOverlays();
  if (mapObj) {
    mapObj.setView([UB_COORDS.lat, UB_COORDS.lng], 13);
    UB_TERMINALS.forEach(t => {
      const m = L.circleMarker([t.lat, t.lng], {
        radius: 12, color: "#fff", weight: 2, fillColor: "#f59e0b", fillOpacity: .95
      }).addTo(mapObj).bindPopup('<div class="bus-popup"><b>' + t.name + "</b><br>Clique para escolher uma linha e ver as chegadas.</div>");
      stopMarkers.push(m);
      currentStops.push({ name: t.name, lat: t.lat, lng: t.lng });
    });
  }
  document.getElementById("map-panel-content").innerHTML =
    '<div class="map-status">Selecione uma linha acima para ver os pontos de parada e os tempos de chegada previstos, com atualização automática a cada 20s.</div>';
  $("map-refresh-info").textContent = "Escolha uma linha para começar";
  refreshUserMarkerPopup();
}

function showMapLoading() {
  $("map-status").classList.add("hidden");
  document.getElementById("map-cors-note").style.display = "none";
  document.getElementById("map-panel-content").innerHTML =
    '<div class="map-loading"><div class="map-spinner"></div><span>Buscando dados de transporte da Auttran…</span></div>';
}
function renderMapError(msg) {
  const retry = '<a class="retry-link" href="#" onclick="event.preventDefault();mapRetry();return false;">Tentar novamente</a>';
  const official = '<a class="retry-link" href="https://cdfuberaba.auttran.com/chegadas/chegadas.php" target="_blank" rel="noopener">Abrir o site oficial da Auttran</a>';
  const extra = '<div style="margin-top:8px;font-size:12px">' + official + "</div>";
  const st = $("map-status");
  st.classList.remove("hidden");
  st.classList.add("error");
  st.innerHTML = msg + " " + retry + extra;
  const content = $("map-panel-content");
  content.innerHTML = '<div class="map-status">' + msg + " " + retry + extra + "</div>";
}

function extractLinesFromHtml(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const out = [];
  doc.querySelectorAll(".cltr").forEach(tr => {
    const cells = tr.querySelectorAll("td");
    if (cells.length < 3) return;
    const code = cells[1].textContent.trim();
    const name = cells[2].textContent.trim();
    if (code && name) out.push({ code, name });
  });
  return out;
}

function parseFulltable(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const dirs = [];
  let update = null;
  const upEl = doc.querySelector("table.tidtable span.lastupdate");
  if (upEl) {
    const m = upEl.textContent.match(/Atualizado às ([\d:]+)/);
    if (m) update = m[1];
  }
  doc.querySelectorAll("table.tidtable table.inttable").forEach(t => {
    const stops = [];
    t.querySelectorAll("tr").forEach(tr => {
      const cells = tr.querySelectorAll("td");
      if (cells.length < 3) return;
      const nameCell = cells[2], timeCell = cells[0], iconCell = cells[1];
      const text = nameCell.textContent.trim();
      const time = timeCell.textContent.trim();
      if (!text || !time || text === "entre os pontos") return;
      stops.push({
        time,
        name: text,
        icon: iconCell && iconCell.querySelector("img") ? iconCell.querySelector("img").src : ""
      });
    });
    if (stops.length) dirs.push(stops);
  });
  return { dirs, update };
}

function parseMins(str) {
  const m = String(str).match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return -1;
  return Number(m[1]) * 60 + Number(m[2]);
}

function geocodeStop(name, idx) {
  for (const t of UB_TERMINALS) {
    if (name.toLowerCase().includes(t.name.toLowerCase())) {
      const jitter = ((idx * 37) % 10 - 5) * 0.0004;
      return { lat: t.lat + jitter, lng: t.lng + jitter, isTerminal: true };
    }
  }
  const hash = seedFrom(name + idx);
  const arc = (hash % 6283) / 1000;
  const dist = 0.015 + (hash % 900) / 100000;
  return {
    lat: UB_COORDS.lat + dist * Math.cos(arc),
    lng: UB_COORDS.lng + dist * Math.sin(arc),
    isTerminal: false
  };
}

function renderMapData(data, fitBounds) {
  $("map-status").classList.add("hidden");
  document.getElementById("map-cors-note").style.display = "block";
  if (!data.dirs.length) {
    document.getElementById("map-panel-content").innerHTML =
      '<div class="map-status">Nenhum horário disponível para esta linha (operação fora do período).</div>';
    return;
  }

  clearMapOverlays();

  /* Posição única do ônibus:
     - Quando vários pontos reportam "agora" (tempo restante zerado), apenas o
       PRIMEIRO deles na sequência da rota é destacado como localização atual.
     - Os demais pontos "agora" continuam como marcadores normais da rota.
     - Se nenhum ponto estiver "agora", destaca o de menor tempo restante. */
  let busStopKey = null;
  let busStopMins = Infinity;
  data.dirs.forEach((stops, dirIdx) => {
    for (let i = 0; i < stops.length && busStopKey === null; i++) {
      const minsLeft = Math.max(0, parseMins(stops[i].time) - nowMinOfDay());
      if (minsLeft === 0) busStopKey = dirIdx + ":" + i;
      else if (minsLeft < busStopMins) busStopMins = minsLeft;
    }
  });
  if (busStopKey === null) {
    data.dirs.forEach((stops, dirIdx) => {
      stops.forEach((s, i) => {
        const minsLeft = Math.max(0, parseMins(s.time) - nowMinOfDay());
        if (minsLeft === busStopMins) busStopKey = dirIdx + ":" + i;
      });
    });
  }

  data.dirs.forEach((stops, dirIdx) => {
    const pts = stops.map((s, i) => geocodeStop(s.name, i + dirIdx * 100));
    /* Linhas (L.polyline) entre os pontos foram removidas: apenas marcadores visíveis */
    stops.forEach((s, i) => {
      const p = pts[i];
      const minsLeft = Math.max(0, parseMins(s.time) - nowMinOfDay());
      const isBusHere = busStopKey === dirIdx + ":" + i;
      let cls = "late";
      if (minsLeft >= 0 && minsLeft <= 2) cls = "soon";
      else if (minsLeft < 10) cls = "mid";
      const jitter = seedFrom(s.name + i);
      const markerColor = s.icon.toLowerCase().includes("apov1") || s.icon.toLowerCase().includes("aipov3") ? "#f59e0b" : "#6d7d75";
      const popup =
        '<div class="bus-popup"><b>Linha ' + (selectedLineCode || "—") + "</b>" +
        '<div class="pop-time">' + (minsLeft >= 0 ? "em " + minsLeft + " min" : s.time) + "</div>" +
        "<div>" + s.name + '</div><div class="pop-addr">Chegada prevista às ' + s.time + "</div>" +
        (isBusHere ? '<div class="bus-here">🚌 O Ônibus está aqui</div>' : "") +
        "</div>";
      const marker = L.circleMarker(p, {
        radius: isBusHere ? 11 : MarkerRadius(minsLeft, jitter),
        color: isBusHere ? "#00FF00" : "#fff",
        weight: isBusHere ? 3 : 2,
        fillColor: isBusHere ? "#28a745" : markerColor,
        fillOpacity: isBusHere ? .95 : .9
      }).addTo(mapObj).bindPopup(popup);
      marker.on("mouseover", e => e.target.openPopup());
      if (isBusHere) marker.openPopup();
      stopMarkers.push(marker);
      currentStops.push({ name: s.name, lat: p.lat, lng: p.lng });
    });
  });

  if (mapObj && data.dirs.length && fitBounds) {
    const all = stopMarkers.map(m => m.getLatLng());
    mapObj.fitBounds(L.latLngBounds(all).pad(0.08));
  }

  const panel = $("map-panel-content");
  panel.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:10px 16px">' +
    data.dirs.map((stops, idx) =>
      "<div><h4><span class='dir-dot " + (idx === 0 ? "a" : "b") + "'></span> " +
      (idx === 0 ? "Ida" : "Volta") + "</h4>" +
      stops.map((s, i) => {
        const raw = parseMins(s.time) - nowMinOfDay();
        const minsLeft = Math.max(0, raw);
        const isBusHere = (idx + ":" + i) === busStopKey;
        let cls = "late";
        if (isBusHere) cls = "soon";
        else if (raw < 0) cls = "late";
        else if (minsLeft <= 2) cls = "soon";
        else if (minsLeft < 10) cls = "mid";
        const when = isBusHere ? "agora" : (raw < 0 ? s.time : minsLeft + " min");
        return '<div class="stop-row"><span class="stop-dot' + (isBusHere ? " active" : "") + '"></span>' +
          '<span class="stop-name">' + s.name + '</span>' +
          '<span class="stop-time ' + cls + '">' + when + '</span></div>';
      }).join("") + "</div>"
    ).join("") +
    "</div>";

  $("map-refresh-info").textContent = lastUpdate
    ? "Atualizado " + lastUpdate.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", second: "2-digit" }) + " · a cada 20s"
    : "Atualizando a cada 20s";
  refreshUserMarkerPopup();
}

function MarkerRadius(minsLeft, seed) {
  if (minsLeft >= 0 && minsLeft <= 2) return 10;
  if (minsLeft < 8) return 7;
  return 5;
}

function clearMapOverlays() {
  stopMarkers.forEach(m => mapObj && mapObj.removeLayer(m));
  stopMarkers = [];
  linePaths.forEach(l => mapObj && mapObj.removeLayer(l));
  linePaths = [];
  currentStops = [];
}

function nowMinOfDay() {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

/* Lista estática das linhas (extraída do chegadas.php) */
const UB_LINES_HTML =
  '<div><table><tr class="cltr"><td></td><td>010</td><td>Terminal Univerde / São Cristóvão</td></tr>' +
  '<tr class="cltr"><td></td><td>011</td><td>Terminal Univerde / Jd. Uberaba</td></tr>' +
  '<tr class="cltr"><td></td><td>012</td><td>Terminal Beija-flor / Capelinha do Barreiro</td></tr>' +
  '<tr class="cltr"><td></td><td>013</td><td>Terminal Univerde / IFTM</td></tr>' +
  '<tr class="cltr"><td></td><td>014</td><td>Boa Vista / Volta Grande</td></tr>' +
  '<tr class="cltr"><td></td><td>015</td><td>Terminal Univerde / Distrito Industrial 2</td></tr>' +
  '<tr class="cltr"><td></td><td>016</td><td>Terminal Univerde / Santa Fé</td></tr>' +
  '<tr class="cltr"><td></td><td>017</td><td>Terminal Univerde / UFTM</td></tr>' +
  '<tr class="cltr"><td></td><td>018</td><td>Terminal Univerde / Jd. Triângulo</td></tr>' +
  '<tr class="cltr"><td></td><td>019</td><td>Santa Maria / Uniube</td></tr>' +
  '<tr class="cltr"><td></td><td>020</td><td>Terminal Univerde / Pq. das Laranjeiras</td></tr>' +
  '<tr class="cltr"><td></td><td>021</td><td>Terminal Beija-flor / Alfredo Freire</td></tr>' +
  '<tr class="cltr"><td></td><td>022</td><td>Terminal Univerde/ Vila Militar</td></tr>' +
  '<tr class="cltr"><td></td><td>023</td><td>Norte 1</td></tr>' +
  '<tr class="cltr"><td></td><td>024</td><td>Norte 2</td></tr>' +
  '<tr class="cltr"><td></td><td>025</td><td>Pacaembú (Via Rodoviária / Rui Barbosa)</td></tr>' +
  '<tr class="cltr"><td></td><td>026</td><td>Terminal Beija-flor / Jd. Copacabana</td></tr>' +
  '<tr class="cltr"><td></td><td>027</td><td>Pontal (Via Hospital Universitário)</td></tr>' +
  '<tr class="cltr"><td></td><td>028</td><td>Terminal Beija-flor / Jd. Marajó</td></tr>' +
  '<tr class="cltr"><td></td><td>029</td><td>Terminal Beija-flor / Ilha Bela</td></tr>' +
  '<tr class="cltr"><td></td><td>030</td><td>Terminal Beija-flor / Distrito Industrial 1</td></tr>' +
  '<tr class="cltr"><td></td><td>031</td><td>Terminal Beija-flor / Pq. dos Girassóis</td></tr>' +
  '<tr class="cltr"><td></td><td>032</td><td>Corujão</td></tr>' +
  '<tr class="cltr"><td></td><td>050</td><td>Abadia / Terminal Univerde / T. Gameleiras</td></tr>' +
  '<tr class="cltr"><td></td><td>051</td><td>Terminal Manoel Mendes / Elza Amuí</td></tr>' +
  '<tr class="cltr"><td></td><td>052</td><td>Terminal Manoel Mendes / Antônio Barbosa</td></tr>' +
  '<tr class="cltr"><td></td><td>053</td><td>Leblon / Terminal Univerde / T. Gameleiras</td></tr>' +
  '<tr class="cltr"><td></td><td>054</td><td>Terminal Manoel Mendes / Jd. Primavera</td></tr>' +
  '<tr class="cltr"><td></td><td>055</td><td>Terminal Gameleiras / Recreio dos Bandeirantes</td></tr>' +
  '<tr class="cltr"><td></td><td>056</td><td>Terminal Gameleiras / Jd. Maracanã</td></tr>' +
  '<tr class="cltr"><td></td><td>057</td><td>Terminal Gameleiras / Jd. Itália</td></tr>' +
  '<tr class="cltr"><td></td><td>058</td><td>Ponte Alta / Uberaba (via Peirópolis)</td></tr>' +
  '<tr class="cltr"><td></td><td>059</td><td>Cássio Resende / Uniube</td></tr>' +
  '<tr class="cltr"><td></td><td>060</td><td>Terminal Manoel Mendes / Residencial 2000</td></tr>' +
  '<tr class="cltr"><td></td><td>061</td><td>Terminal Univerde / Dist. Industrial 3 (via Baixa)</td></tr>' +
  '<tr class="cltr"><td></td><td>062</td><td>Terminal Manoel Mendes / Josa Bernardino</td></tr>' +
  '<tr class="cltr"><td></td><td>064</td><td>Terminal Manoel Mendes / Mercado Municipal</td></tr>' +
  '<tr class="cltr"><td></td><td>065</td><td>Terminal Gameleiras / Chica Ferreira</td></tr>' +
  '<tr class="cltr"><td></td><td>066</td><td>Terminal Univerde / Jd. Espirito Santo</td></tr>' +
  '<tr class="cltr"><td></td><td>067</td><td>Terminal Manoel Mendes / Jd. Anatê</td></tr>' +
  '<tr class="cltr"><td></td><td>068</td><td>Terminal Gameleiras / Rio de Janeiro</td></tr>' +
  '<tr class="cltr"><td></td><td>069</td><td>Terminal Gameleiras / Jd. Alvorada</td></tr>' +
  '<tr class="cltr"><td></td><td>072</td><td>Terminal Manoel Mendes / Maria da Gloria</td></tr>' +
  '<tr class="cltr"><td></td><td>100</td><td>BRT- Vetor</td></tr>' +
  '<tr class="cltr"><td></td><td>110</td><td>Circular 1 - via Prudente de Morais</td></tr>' +
  '<tr class="cltr"><td></td><td>111</td><td>Circular 2 - via João XXIII</td></tr>' +
  '<tr class="cltr"><td></td><td>120</td><td>Interbairros 1</td></tr>' +
  '<tr class="cltr"><td></td><td>121</td><td>Interbairros 2</td></tr>' +
  '<tr class="cltr"><td></td><td>200</td><td>BRT - Vetor</td></tr></table></div>';

function openCredits() {
  document.getElementById("modal-credits").classList.add("show");
}

function closeCredits() {
  document.getElementById("modal-credits").classList.remove("show");
}

$("modal-credits").addEventListener("click", e => {
  if (e.target === $("modal-credits")) closeCredits();
});

boot();
