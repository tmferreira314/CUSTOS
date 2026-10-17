/* ==========================================================
   Carteira — app de gastos e ganhos pessoais
   JavaScript puro, sem frameworks e sem internet.

   Ordem do ficheiro:
   1) Utilidades e formatos
   2) Base de dados local (IndexedDB)
   3) Estado da app
   4) Períodos e baldeação (agrupar por dia/mês)
   5) Gráficos em SVG
   6) Abas: Gastos, Ganhos, Balanço, Histórico
   7) Modal de adicionar/editar movimento
   8) Definições: categorias, exportar/importar
   9) Arranque (service worker + armazenamento persistente)
   ========================================================== */

/* ---------- 1. Utilidades e formatos ---------- */

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const $$ = (sel, raiz = document) => [...raiz.querySelectorAll(sel)];

const CATS_GASTO = ['Comida', 'Festas', 'Viagens', 'Roupa', 'Faculdade', 'Projeto pessoal', 'Subscrições'];
const ORIGENS_GANHO = ['Mesada', 'Salário', 'Presente', 'Venda', 'Outro'];
const OUTRO = 'Outro';

/* Coles fixas das fatias dos gráficos (funcionam no claro e no escuro) */
const CORES = ['#0a84ff', '#ff9f0a', '#30d158', '#ff453a', '#bf5af2', '#5ac8fa', '#ffd60a', '#64d2ff', '#ff375f', '#ac8e68'];

const PERIODOS = [
  { id: 'dia', nome: 'Dia' },
  { id: 'semana', nome: 'Semana' },
  { id: 'mes', nome: 'Mês' },
  { id: 'ano', nome: 'Ano' },
  { id: 'sempre', nome: 'Sempre' },
  { id: 'intervalo', nome: 'Intervalo' }
];

/* ---------- 1b. Idioma (português / inglês) ---------- */

let LANG = 'pt';
try { LANG = localStorage.getItem('carteira-lang') === 'en' ? 'en' : 'pt'; } catch (e) { LANG = 'pt'; }

let eurFmt, pctFmt, dtLongo, dtCurto, dtSemana, dtMes, dtMesAno;

/* Cria os formatos de número/data consoante o idioma */
function criarFormatos() {
  const loc = LANG === 'en' ? 'en-GB' : 'pt-PT';
  eurFmt = new Intl.NumberFormat(loc, { style: 'currency', currency: 'EUR' });
  pctFmt = new Intl.NumberFormat(loc, { maximumFractionDigits: 1 });
  dtLongo = new Intl.DateTimeFormat(loc, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  dtCurto = new Intl.DateTimeFormat(loc, { day: '2-digit', month: 'short' });
  dtSemana = new Intl.DateTimeFormat(loc, { weekday: 'short' });
  dtMes = new Intl.DateTimeFormat(loc, { month: 'short' });
  dtMesAno = new Intl.DateTimeFormat(loc, { month: 'short', year: '2-digit' });
}
criarFormatos();

/* Textos fixos do HTML (data-i18n / data-i18n-ph / data-i18n-aria) */
const TRAD = {
  pt: {
    titulo_app: 'Carteira — Gastos e Ganhos',
    descricao: 'Regista os teus gastos e ganhos pessoais. Funciona 100% offline, sem contas.',
    gastos: 'Gastos', ganhos: 'Ganhos', balanco: 'Balanço', historico: 'Histórico',
    titulo_definicoes: 'Definições', fechar: 'Fechar',
    add_gasto: 'Adicionar gasto', valor_gasto: 'Valor gasto (€)', tipo_gasto: 'Tipo de gasto',
    origem_ganho: 'Origem do ganho', escreve_origem: 'Escreve a origem', data: 'Data',
    explicacao: 'Explicação (opcional)', exemplo_nota: 'Ex.: almoço com amigos',
    apagar: 'Apagar', guardar: 'Guardar', precisa_js: 'Esta app precisa de JavaScript activo.',
    filtros: 'Filtros'
  },
  en: {
    titulo_app: 'Wallet — Expenses and Income',
    descricao: 'Track your personal expenses and income. Works 100% offline, no accounts.',
    gastos: 'Expenses', ganhos: 'Income', balanco: 'Balance', historico: 'History',
    titulo_definicoes: 'Settings', fechar: 'Close',
    add_gasto: 'Add expense', valor_gasto: 'Amount spent (€)', tipo_gasto: 'Type of expense',
    origem_ganho: 'Source of income', escreve_origem: 'Type the source', data: 'Date',
    explicacao: 'Note (optional)', exemplo_nota: 'E.g.: lunch with friends',
    apagar: 'Delete', guardar: 'Save', precisa_js: 'This app needs JavaScript enabled.'
  }
};
function tr(chave) {
  return (TRAD[LANG] && TRAD[LANG][chave]) || TRAD.pt[chave] || chave;
}

/* Dicionário de frases em português → inglês, aplicado ao texto já desenhado.
   Frases mais longas primeiro, para não partir expressões compostas. */
const PT_EN = {
  'Carteira v1.3 —': 'Wallet v1.3 —',
  'O JSON substitui tudo (restauro completo). O CSV acrescenta movimentos aos que já tens. No iPhone, os ficheiros ficam em "Ficheiros → Descarregamentos".':
    'JSON replaces everything (full restore). CSV adds movements to the ones you already have. On iPhone, files are saved in "Files → Downloads".',
  'Apaga apenas os movimentos do período escolhido. Para apagar um movimento em particular, abre-o no Histórico (ou numa lista) e usa "Apagar".':
    'Deletes only the movements in the chosen period. To delete a single movement, open it in History (or a list) and use "Delete".',
  'Que % dos ganhos foi gasta (por categoria)': '% of income spent (by category)',
  'Comparação com o período anterior': 'Comparison with previous period',
  'Sem comparação disponível para este período.': 'No comparison available for this period.',
  'Total do período anterior': 'Previous period total',
  'Saldo do período (ganhos − gastos)': 'Period balance (income − expenses)',
  'Média por dia · semana · mês': 'Average per day · week · month',
  'Categorias em destaque': 'Top categories',
  'Origens em destaque': 'Top sources',
  'Mais categoria (nº de vezes)': 'Most frequent category',
  'Mais origem (nº de vezes)': 'Most frequent source',
  'Mais dinheiro (gasto)': 'Most money (expenses)',
  'Mais dinheiro (ganho)': 'Most money (income)',
  'Média por registo': 'Average per record',
  'Média por dia': 'Average per day',
  'Total por categoria': 'Total by category',
  'Total por origem': 'Total by source',
  'Total gasto': 'Total spent', 'Total ganho': 'Total received',
  'Total do período anterior': 'Previous period total',
  'Registos': 'Records',
  'Movimentos do período': 'Movements in period',
  'Sem dados para mostrar no período.': 'No data to show for this period.',
  'Sem movimentos neste período.': 'No movements in this period.',
  'Sem ganhos neste período.': 'No income in this period.',
  'Sem ganhos ou sem gastos neste período.': 'No income or expenses in this period.',
  'Ainda não há movimentos para mostrar.': 'No movements to show yet.',
  'Sem entradas': 'No entries',
  'Desde o início': 'From the beginning',
  'sem base de comparação': 'no comparison basis',
  'Saldo acumulado': 'Cumulative balance',
  'Taxa de poupança': 'Savings rate',
  'Por cada 100 € ganhos, guardas': 'For every €100 earned, you save',
  'Médias calculadas sobre': 'Averages calculated over',
  'dias do período': 'days in the period',
  'Melhor e pior': 'Best and worst',
  'Melhor': 'Best', 'Pior': 'Worst',
  'Comparação com o período anterior': 'Comparison with previous period',
  'Período anterior': 'Previous period',
  'Variação': 'Change',
  'Evolução': 'Evolution', 'por dia': 'by day', 'por mês': 'by month',
  'Categorias de gastos': 'Expense categories',
  'Origens de ganhos': 'Income sources',
  'Nova categoria': 'New category', 'Nova origem': 'New source',
  'Backup dos dados': 'Data backup',
  'Exportar JSON': 'Export JSON', 'Exportar CSV': 'Export CSV',
  'Importar JSON': 'Import JSON', 'Importar CSV': 'Import CSV',
  'Apagar todos os dados': 'Delete all data',
  'Apagar movimentos por período': 'Delete movements by period',
  'O que apagar': 'What to delete',
  'Só gastos': 'Expenses only', 'Só ganhos': 'Income only',
  'Tudo (gastos e ganhos)': 'Everything (income and expenses)',
  'Esta semana': 'This week', 'Este mês': 'This month', 'Este ano': 'This year',
  'Intervalo…': 'Range…', 'Todo o histórico': 'Entire history',
  'Apagar estes movimentos': 'Delete these movements',
  'Sobre': 'About',
  'Idioma': 'Language',
  'Procurar atualizações': 'Check for updates',
  'Adicionar': 'Add', 'Adicionada ✓': 'Added ✓',
  'Guardar': 'Save', 'Apagar': 'Delete', 'Fechar': 'Close',
  'Definições': 'Settings',
  'Data': 'Date',
  'Gastos': 'Expenses', 'Ganhos': 'Income', 'Balanço': 'Balance', 'Histórico': 'History',
  'Semana': 'Week', 'Mês': 'Month', 'Ano': 'Year', 'Sempre': 'All time', 'Intervalo': 'Range',
  'Dia': 'Day', 'Total': 'Total', 'Período': 'Period', 'Registos': 'Records',
  'Por dia': 'By day', 'Gastos por dia': 'Expenses by day', 'Ganhos por dia': 'Income by day',
  'Ganhos, gastos e saldo por dia': 'Income, expenses and balance by day',
  'Escolhe o dia.': 'Choose the day.',
  'Tudo': 'All', 'Todas': 'All',
  'categoria': 'category', 'origem': 'source',
  'Comida': 'Food', 'Festas': 'Parties', 'Viagens': 'Travel', 'Roupa': 'Clothes',
  'Faculdade': 'University', 'Projeto pessoal': 'Personal project', 'Subscrições': 'Subscriptions',
  'Mesada': 'Allowance', 'Salário': 'Salary', 'Presente': 'Gift', 'Venda': 'Sale', 'Outro': 'Other',
  /* avisos e mensagens */
  'App pronta para funcionar offline ✓': 'App ready to work offline ✓',
  'A operação falhou.': 'The operation failed.',
  'Escreve um nome primeiro.': 'Type a name first.',
  'Já existe uma entrada com esse nome.': 'An entry with that name already exists.',
  'Novo tipo adicionado ✓': 'New type added ✓',
  'Não foi possível adicionar o tipo.': 'Could not add the type.',
  'A origem “Outro” não pode ser alterada.': 'The "Other" source cannot be changed.',
  'A origem “Outro” não pode ser apagada.': 'The "Other" source cannot be deleted.',
  'Novo nome:': 'New name:',
  'movimento(s) actualizados': 'movement(s) updated',
  'movimento(s) apagados ✓': 'movement(s) deleted ✓',
  'movimento(s) importado(s) ✓': 'movement(s) imported ✓',
  'Nada foi apagado.': 'Nothing was deleted.',
  'Apagada ✓': 'Deleted ✓',
  'Categoria e': 'Category and',
  'está usada em': 'is used in',
  'Apagar a categoria E esses movimentos?': 'Delete the category AND those movements?',
  'Apagar TODOS os movimentos e categorias deste dispositivo?': 'Delete ALL movements and categories on this device?',
  'Isto não pode ser anulado. Continuar?': 'This cannot be undone. Continue?',
  'Todos os dados foram apagados.': 'All data has been deleted.',
  'Não há movimentos nesse período.': 'There are no movements in that period.',
  'Esta secção não tem gráfico para exportar.': 'This section has no chart to export.',
  'Imagem do gráfico exportada ✓': 'Chart image exported ✓',
  'Não foi possível criar a imagem.': 'Could not create the image.',
  'Partilha indisponível aqui — CSV descarregado.': 'Sharing unavailable here — CSV downloaded.',
  'CSV exportado ✓': 'CSV exported ✓', 'JSON exportado ✓': 'JSON exported ✓',
  'Escreve um valor maior que zero.': 'Enter a value greater than zero.',
  'Cria uma categoria de gastos primeiro (Definições).': 'Create an expense category first (Settings).',
  'Não foi possível guardar. Tenta outra vez.': 'Could not save. Try again.',
  'Apagar este movimento?': 'Delete this movement?',
  'Movimento apagado ✓': 'Movement deleted ✓',
  'Não foi possível apagar.': 'Could not delete.',
  'O ficheiro não é um JSON válido.': 'The file is not valid JSON.',
  'JSON não reconhecido (falta a lista "movimentos").': 'Unrecognized JSON (missing "movimentos" list).',
  'Substituir todos os dados por': 'Replace all data with',
  'movimento(s) do ficheiro?': 'movement(s) from the file?',
  'O CSV não tem movimentos.': 'The CSV has no movements.',
  'CSV precisa das colunas: data, tipo, valor.': 'CSV needs the columns: data, tipo, valor.',
  'Não foi possível ler o ficheiro.': 'Could not read the file.',
  'Nova versão disponível. Toca em "Procurar atualizações" para instalar.':
    'New version available. Tap "Check for updates" to install.',
  'A procurar atualizações…': 'Checking for updates…',
  'A atualizar…': 'Updating…',
  'Não foi possível atualizar. Tenta outra vez.': 'Could not update. Try again.',
  'Esta versão não tem atualizações automáticas.': 'This version has no automatic updates.',
  'Atualização': 'Update',
  'Procura uma versão nova na rede (só quando há internet).':
    'Looks for a new version online (only when connected).',
  'Com a app publicada em GitHub Pages, o Safari substitui os ficheiros sozinho.':
    'With the app published on GitHub Pages, Safari replaces the files by itself.',
  'tudo guardado apenas neste dispositivo (IndexedDB).':
    'everything stored only on this device (IndexedDB).',
  'Sem contas, sem servidores, funciona offline.': 'No accounts, no servers, works offline.',
  'Idioma': 'Language',
  'Escolhe o intervalo de tempo.': 'Choose the time range.',
  'Nada corresponde a esses filtros.': 'Nothing matches these filters.',
  'Escolhe as duas datas.': 'Choose both dates.',
  'Adicionar gasto': 'Add expense', 'Adicionar ganho': 'Add income',
  'Editar gasto': 'Edit expense', 'Editar ganho': 'Edit income',
  'Valor gasto (€)': 'Amount spent (€)', 'Valor recebido (€)': 'Amount received (€)',
  'Nome do novo tipo de gasto:': 'Name of the new expense type:',
  'Nome da nova origem de ganho:': 'Name of the new income source:',
  'Sem ligação à internet. Liga-te e tenta outra vez.': 'No internet connection. Connect and try again.',
  'Já tens a versão mais recente.': 'You already have the latest version.',
  'Sem ligação à internet. Liga-te e tenta outra vez.': 'No internet connection. Connect and try again.',
  'A atualizar…': 'Updating…',
  'Idioma definido para português.': 'Language set to Portuguese.',
  'Idioma definido para inglês.': 'Language set to English.',
  /* filtros do Histórico */
  'Filtros': 'Filters', 'Categorias': 'Categories', 'Tempo': 'Time',
  'Limpar': 'Clear', 'Aplicar': 'Apply',
  /* movimentos recorrentes */
  'Movimentos recorrentes': 'Recurring movements',
  'Dia do mês': 'Day of month', 'Categoria/Origem': 'Category/Source',
  'Valor (€)': 'Amount (€)', 'Adicionar recorrente': 'Add recurring',
  'Sem recorrentes': 'No recurring rules',
  'Recorrente criado ✓': 'Recurring rule created ✓',
  'Recorrente apagado ✓': 'Recurring rule deleted ✓',
  'Recorrente': 'Recurring',
  'Apagar este recorrente? Os movimentos já criados mantêm-se.':
    'Delete this recurring rule? Movements already created are kept.',
  'Escolhe uma categoria.': 'Choose a category.',
  'movimento(s) adicionado(s) ✓': 'movement(s) added ✓',
  'movimento(s) recorrente(s) adicionado(s) ✓': 'recurring movement(s) added ✓',
  'Cria sozinho um movimento fixo todos os meses no dia escolhido':
    'Creates a fixed movement every month on the chosen day',
  '(nos meses mais curtos usa o último dia) e, sempre que abres a app, completa o que faltar.':
    '(in shorter months it uses the last day) and, whenever you open the app, fills in what is missing.',
  'O que': 'What'
};
let PT_ORDENADO = [];
function iniciarDicionario() {
  PT_ORDENADO = Object.keys(PT_EN).sort((a, b) => b.length - a.length);
}
iniciarDicionario();

function traduzirTexto(s) {
  if (LANG !== 'en' || s === null || s === undefined) return s;
  let out = String(s);
  for (const pt of PT_ORDENADO) {
    if (out.indexOf(pt) !== -1) out = out.split(pt).join(PT_EN[pt]);
  }
  return out;
}

const ATRIBUTOS_TRAD = ['placeholder', 'aria-label', 'title'];
function traduzirNo(no) {
  if (LANG !== 'en') return;
  if (no.nodeType === 3) { // texto
    const novo = traduzirTexto(no.nodeValue);
    if (novo !== no.nodeValue) no.nodeValue = novo;
  } else if (no.nodeType === 1) {
    ATRIBUTOS_TRAD.forEach((at) => {
      const v = no.getAttribute && no.getAttribute(at);
      if (v) { const nv = traduzirTexto(v); if (nv !== v) no.setAttribute(at, nv); }
    });
    no.childNodes.forEach(traduzirNo);
  }
}
function traduzirDOM(raiz) {
  if (LANG !== 'en' || !raiz) return;
  if (raiz.nodeType === 1 || raiz.nodeType === 3) traduzirNo(raiz);
  else if (raiz.childNodes) raiz.childNodes.forEach(traduzirNo);
}

function aplicarEstaticos() {
  document.documentElement.lang = LANG === 'en' ? 'en' : 'pt-PT';
  document.title = tr('titulo_app');
  const md = document.querySelector('meta[name="description"]');
  if (md) md.setAttribute('content', tr('descricao'));
  $$('[data-i18n]').forEach((el) => { el.textContent = tr(el.dataset.i18n); });
  $$('[data-i18n-ph]').forEach((el) => { el.setAttribute('placeholder', tr(el.dataset.i18nPh)); });
  $$('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', tr(el.dataset.i18nAria)); });
}


function round2(v) { return Math.round((Number(v) + Number.EPSILON) * 100) / 100; }
function fmt(v) { return eurFmt.format(round2(v)); }
function fmtPct(v) { return pctFmt.format(round2(v)) + ' %'; }

/* Escapa texto do utilizador antes de o meter no HTML */
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* Converte "12,50" / "1.234,56" / "12.5" em número */
function parseValor(txt) {
  let s = String(txt ?? '').replace(/[^\d.,-]/g, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.')
      ? s.replace(/\./g, '').replace(',', '.')
      : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

/* Datas (strings "AAAA-MM-DD", sempre na hora local) */
function iso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function hojeISO() { return iso(new Date()); }
function dataDe(s) { const [a, m, d] = String(s).split('-').map(Number); return new Date(a, m - 1, d); }
function addDias(s, n) { const d = dataDe(s); d.setDate(d.getDate() + n); return iso(d); }
function diffDias(a, b) { return Math.round((dataDe(b) - dataDe(a)) / 86400000); }

/* Cor estável por nome de categoria/origem */
function corDe(nome) {
  let h = 0;
  for (const ch of String(nome)) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return CORES[h % CORES.length];
}

function cssVar(nome) {
  return getComputedStyle(document.documentElement).getPropertyValue(nome).trim() || '#888888';
}

let avisoTimer = null;
function aviso(msg) {
  const el = $('#aviso');
  el.textContent = traduzirTexto(msg);
  el.hidden = false;
  clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => { el.hidden = true; }, 2800);
}

/* As caixas do sistema (confirmar/pedir texto) seguem o idioma escolhido */
const confirmOriginal = (typeof window !== 'undefined' && window.confirm) ? window.confirm.bind(window) : () => true;
const promptOriginal = (typeof window !== 'undefined' && window.prompt) ? window.prompt.bind(window) : () => null;
window.confirm = (m) => confirmOriginal(traduzirTexto(m));
window.prompt = (m, d) => promptOriginal(traduzirTexto(m), d);

/* ---------- 2. Base de dados local (IndexedDB) ---------- */

const NOME_BD = 'carteira';
const V_BD = 2;
let bd = null;

function abrirBD() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(NOME_BD, V_BD);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('movimentos')) {
        db.createObjectStore('movimentos', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('categorias')) {
        db.createObjectStore('categorias', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('recorrentes')) {
        db.createObjectStore('recorrentes', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = () => { bd = req.result; res(bd); };
    req.onerror = () => rej(req.error);
  });
}

function idbTodos(store) {
  return new Promise((res, rej) => {
    const r = bd.transaction(store).objectStore(store).getAll();
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

function idbAdd(store, valor) {
  return new Promise((res, rej) => {
    const t = bd.transaction(store, 'readwrite');
    const r = t.objectStore(store).add(valor);
    t.oncomplete = () => res(r.result);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}

function idbPut(store, valor) {
  return new Promise((res, rej) => {
    const t = bd.transaction(store, 'readwrite');
    t.objectStore(store).put(valor);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}

function idbDel(store, chave) {
  return new Promise((res, rej) => {
    const t = bd.transaction(store, 'readwrite');
    t.objectStore(store).delete(chave);
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}

function idbLote(store, itens) {
  return new Promise((res, rej) => {
    const t = bd.transaction(store, 'readwrite');
    const s = t.objectStore(store);
    itens.forEach((i) => s.add(i));
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}

/* Substitui tudo (usado no restauro de JSON) */
function idbSubstituir(movs, cats, recs) {
  return new Promise((res, rej) => {
    const lojas = ['movimentos', 'categorias'];
    if (recs) lojas.push('recorrentes');
    const t = bd.transaction(lojas, 'readwrite');
    const sm = t.objectStore('movimentos');
    const sc = t.objectStore('categorias');
    sm.clear();
    sc.clear();
    movs.forEach((m) => sm.put(m)); // se não têm id, o próprio IndexedDB cria
    cats.forEach((c) => sc.put(c));
    if (recs) {
      const sr = t.objectStore('recorrentes');
      sr.clear();
      recs.forEach((r) => sr.put(r));
    }
    t.oncomplete = () => res();
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error);
  });
}

function idbApagarTudo() {
  return idbSubstituir([], [], []);
}

/* ---------- 3. Estado da app ---------- */

const estado = {
  movs: [],
  cats: [],
  recs: [],
  aba: 'gastos',
  periodo: { gastos: 'mes', ganhos: 'mes', balanco: 'mes' },
  custom: { gastos: null, ganhos: null, balanco: null },
  /* Dia escolhido no filtro "Dia" de cada aba */
  dia: { gastos: hojeISO(), ganhos: hojeISO(), balanco: hojeISO() },
  hist: 'tudo',
  /* Filtros do Histórico: categorias (multi) e tempo */
  histCats: [],
  histTempo: { tipo: 'tudo', data: hojeISO(), ini: '', fim: '' }
};

/* Cada gráfico/secção registada aqui pode ser exportada (CSV/imagem/partilha) */
let exportadores = {};

function customPadrao() { return { inicio: addDias(hojeISO(), -30), fim: hojeISO() }; }
function catsDe(tipo) { return estado.cats.filter((c) => c.tipo === tipo).map((c) => c.nome); }

function padraoCats() {
  return [
    ...CATS_GASTO.map((nome) => ({ nome, tipo: 'gasto' })),
    ...ORIGENS_GANHO.map((nome) => ({ nome, tipo: 'ganho' }))
  ];
}

async function carregarDados() {
  estado.movs = await idbTodos('movimentos');
  estado.cats = await idbTodos('categorias');
  estado.recs = (await idbTodos('recorrentes')) || [];

  if (!estado.cats.length) {
    await idbLote('categorias', padraoCats());
    estado.cats = await idbTodos('categorias');
  }

  /* Cria categorias em falta (ex.: movimentos importados com categoria nova) */
  const vistos = new Set(estado.cats.map((c) => c.tipo + '|' + c.nome));
  const faltam = [];
  estado.movs.forEach((m) => {
    const chave = m.tipo + '|' + m.categoria;
    if (!vistos.has(chave)) { vistos.add(chave); faltam.push({ tipo: m.tipo, nome: m.categoria }); }
  });
  if (faltam.length) {
    await idbLote('categorias', faltam);
    estado.cats = await idbTodos('categorias');
  }
}

/* ---------- 4. Períodos ---------- */

/* Devolve {tipo, inicio, fim, prev, gran} — prev = período anterior igual */
function periodoDe(aba) {
  const tipo = estado.periodo[aba];
  const hoje = hojeISO();
  const d = dataDe(hoje);
  let ini, fim, prev = null, gran = 'dia';

  if (tipo === 'dia') {
    const sel = (estado.dia && estado.dia[aba]) || hoje;
    ini = fim = sel;
    prev = { inicio: addDias(sel, -1), fim: addDias(sel, -1) };
  } else if (tipo === 'semana') {
    const dow = (d.getDay() + 6) % 7; // segunda-feira = 0
    ini = addDias(hoje, -dow);
    fim = addDias(ini, 6);
    prev = { inicio: addDias(ini, -7), fim: addDias(ini, -1) };
  } else if (tipo === 'mes') {
    ini = iso(new Date(d.getFullYear(), d.getMonth(), 1));
    fim = iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    const am = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    prev = { inicio: iso(am), fim: iso(new Date(am.getFullYear(), am.getMonth() + 1, 0)) };
  } else if (tipo === 'ano') {
    ini = iso(new Date(d.getFullYear(), 0, 1));
    fim = iso(new Date(d.getFullYear(), 11, 31));
    prev = { inicio: iso(new Date(d.getFullYear() - 1, 0, 1)), fim: iso(new Date(d.getFullYear() - 1, 11, 31)) };
    gran = 'mes';
  } else if (tipo === 'sempre') {
    ini = '1900-01-01';
    fim = '9999-12-31';
    gran = 'mes';
  } else {
    if (!estado.custom[aba]) estado.custom[aba] = customPadrao();
    const c = estado.custom[aba];
    ini = c.inicio < c.fim ? c.inicio : c.fim;
    fim = c.inicio < c.fim ? c.fim : c.inicio;
    const dias = diffDias(ini, fim) + 1;
    prev = { inicio: addDias(ini, -dias), fim: addDias(ini, -1) };
    gran = dias <= 45 ? 'dia' : 'mes';
  }
  return { tipo, inicio: ini, fim, prev, gran };
}

function emPeriodo(movs, p) {
  return movs.filter((m) => m.data >= p.inicio && m.data <= p.fim);
}

function periodoTexto(p) {
  if (!p) return '';
  if (p.tipo === 'sempre') return 'Desde o início';
  const a = dtCurto.format(dataDe(p.inicio));
  const b = dtCurto.format(dataDe(p.fim));
  return p.inicio === p.fim ? a : `${a} – ${b}`;
}

/* Cria "balde" (caixas) por dia ou por mês e soma gastos/ganhos em cada um */
function baldear(movs, p) {
  let ini = p.inicio, fim = p.fim;

  if (p.tipo === 'sempre') { // limita ao intervalo com dados
    const datas = movs.map((m) => m.data);
    if (datas.length) {
      ini = datas.reduce((a, b) => (a < b ? a : b));
      fim = datas.reduce((a, b) => (a > b ? a : b));
    } else {
      ini = fim = hojeISO();
    }
    if (fim < hojeISO()) fim = hojeISO();
  }

  const baldes = [];
  const mapa = new Map();

  if (p.gran === 'dia') {
    let d = ini;
    while (d <= fim && baldes.length < 400) {
      const b = { ini: d, fim: d, rotulo: String(Number(d.slice(8))), gastos: 0, ganhos: 0, n: 0 };
      baldes.push(b);
      mapa.set(d, b);
      d = addDias(d, 1);
    }
    movs.forEach((m) => {
      const b = mapa.get(m.data);
      if (b) somar(b, m);
    });
  } else {
    let a = Number(ini.slice(0, 4));
    let m = Number(ini.slice(5, 7));
    const fa = Number(fim.slice(0, 4));
    const fm = Number(fim.slice(5, 7));
    const comAno = a !== fa;
    while ((a < fa || (a === fa && m <= fm)) && baldes.length < 600) {
      const chave = `${a}-${String(m).padStart(2, '0')}`;
      const rotulo = (comAno ? dtMesAno : dtMes).format(new Date(a, m - 1, 1)).replace('.', '');
      const b = {
        ini: `${chave}-01`,
        fim: iso(new Date(a, m, 0)),
        rotulo, gastos: 0, ganhos: 0, n: 0
      };
      baldes.push(b);
      mapa.set(chave, b);
      m += 1;
      if (m > 12) { m = 1; a += 1; }
    }
    movs.forEach((mv) => {
      const b = mapa.get(mv.data.slice(0, 7));
      if (b) somar(b, mv);
    });
  }
  return baldes;
}

function somar(b, m) {
  if (m.tipo === 'gasto') b.gastos += m.valor;
  else b.ganhos += m.valor;
  b.n += 1;
}

/* Dias do período já contados só até hoje (para as médias) */
function diasDoPeriodo(p) {
  let ini = p.inicio, fim = p.fim;
  if (p.tipo === 'sempre') {
    const datas = estado.movs.map((m) => m.data);
    ini = datas.length ? datas.reduce((a, b) => (a < b ? a : b)) : hojeISO();
    fim = hojeISO();
    const maxData = datas.reduce((a, b) => (a > b ? a : b), '');
    if (maxData > fim) fim = maxData;
  } else if (fim > hojeISO()) {
    fim = hojeISO();
  }
  if (ini > fim) return 1;
  return Math.max(1, diffDias(ini, fim) + 1);
}

function agrupar(movs) {
  const mapa = new Map();
  movs.forEach((m) => {
    const g = mapa.get(m.categoria) || { nome: m.categoria, total: 0, n: 0 };
    g.total += m.valor;
    g.n += 1;
    mapa.set(m.categoria, g);
  });
  return [...mapa.values()]
    .map((g) => ({ ...g, total: round2(g.total), cor: corDe(g.nome) }))
    .sort((a, b) => b.total - a.total);
}

function ordenarDesc(movs) {
  return movs.slice().sort((a, b) => b.data.localeCompare(a.data) || b.id - a.id);
}

/* ---------- 5. Gráficos em SVG (próprios, sem bibliotecas) ---------- */

/* Donut (rosca) com as fatias de cada categoria */
function donutSVG(grupos, total) {
  const R = 54;
  const C = 2 * Math.PI * R;
  let off = 0;
  let arcos = '';

  if (total > 0) {
    grupos.forEach((g) => {
      if (!(g.total > 0)) return;
      const frac = g.total / total;
      const comp = frac * C;
      arcos += `<circle cx="80" cy="80" r="${R}" fill="none" stroke="${g.cor}" stroke-width="26" ` +
        `stroke-dasharray="${comp.toFixed(2)} ${(C - comp).toFixed(2)}" ` +
        `transform="rotate(${(-90 + off * 360).toFixed(2)} 80 80)"/>`;
      off += frac;
    });
  }

  return `<svg viewBox="0 0 160 160" class="donut" role="img" aria-label="Distribuição de ${fmt(total)}">
    <circle cx="80" cy="80" r="${R}" fill="none" stroke="var(--chip)" stroke-width="26"/>
    ${arcos}
    <text x="80" y="77" text-anchor="middle" class="donut-centro">${fmt(total)}</text>
    <text x="80" y="94" text-anchor="middle" class="donut-centro2">TOTAL</text>
  </svg>`;
}

/* Barras verticais simples (evolução) */
function barrasSVG(baldes, campo, cor) {
  if (!baldes.length || Math.max(...baldes.map((b) => b[campo])) <= 0) {
    return '<p class="vazio">Sem dados para mostrar no período.</p>';
  }
  const W = 320, H = 160, pt = 18, pb = 24, pe = 4;
  const alt = H - pt - pb;
  const max = Math.max(...baldes.map((b) => b[campo]));
  const n = baldes.length;
  const slot = (W - pe * 2) / n;
  const bw = Math.max(2, slot * 0.65);
  const passo = Math.max(1, Math.ceil(n / 8));

  let barras = '';
  let rotulos = '';
  baldes.forEach((b, i) => {
    const h = (b[campo] / max) * alt;
    const x = pe + i * slot + (slot - bw) / 2;
    const y = H - pb - h;
    if (b[campo] > 0) {
      barras += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${bw.toFixed(1)}" ` +
        `height="${Math.max(2, h).toFixed(1)}" rx="${Math.min(3, bw / 2).toFixed(1)}" fill="${cor}">` +
        `<title>${esc(b.rotulo)}: ${fmt(b[campo])}</title></rect>`;
    }
    if (i % passo === 0) {
      rotulos += `<text x="${(pe + i * slot + slot / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="svg-rotulo">${esc(b.rotulo)}</text>`;
    }
  });

  return `<svg viewBox="0 0 ${W} ${H}" class="grafico" role="img" aria-label="Evolução">
    <text x="${pe}" y="12" class="svg-max">máx. ${fmt(max)}</text>
    ${barras}${rotulos}
  </svg>`;
}

/* Gráfico do balanço: barras agrupadas (ganhos/gastos) + linha de saldo acumulado */
function balancoSVG(baldes) {
  if (!baldes.length || Math.max(...baldes.flatMap((b) => [b.ganhos, b.gastos])) <= 0) {
    return '<p class="vazio">Sem dados para mostrar no período.</p>';
  }
  const W = 320, H = 180, pt = 18, pb = 26, pe = 4;
  const alt = H - pt - pb;
  const n = baldes.length;
  const slot = (W - pe * 2) / n;
  const bw = Math.max(1.5, slot * 0.3);

  const maxBar = Math.max(1, ...baldes.flatMap((b) => [b.ganhos, b.gastos]));
  let acum = 0;
  const cums = baldes.map((b) => { acum += b.ganhos - b.gastos; return acum; });
  const cMin = Math.min(0, ...cums);
  const cMax = Math.max(0, ...cums);
  const span = (cMax - cMin) || 1;

  const yBar = (v) => H - pb - (v / maxBar) * alt;
  const yLin = (v) => pt + (1 - (v - cMin) / span) * alt;

  const corGan = cssVar('--ganho');
  const corGas = cssVar('--gasto');
  const corLin = cssVar('--roxo');

  let rects = '';
  let pontos = '';
  const passo = Math.max(1, Math.ceil(n / 8));
  let rotulos = '';

  baldes.forEach((b, i) => {
    const x0 = pe + i * slot;
    const hg = (b.ganhos / maxBar) * alt;
    const hs = (b.gastos / maxBar) * alt;
    if (b.ganhos > 0) {
      rects += `<rect x="${(x0 + slot * 0.12).toFixed(1)}" y="${yBar(b.ganhos).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(2, hg).toFixed(1)}" rx="1.5" fill="${corGan}"><title>${esc(b.rotulo)} ganhos: ${fmt(b.ganhos)}</title></rect>`;
    }
    if (b.gastos > 0) {
      rects += `<rect x="${(x0 + slot * 0.12 + bw + 1.5).toFixed(1)}" y="${yBar(b.gastos).toFixed(1)}" width="${bw.toFixed(1)}" height="${Math.max(2, hs).toFixed(1)}" rx="1.5" fill="${corGas}"><title>${esc(b.rotulo)} gastos: ${fmt(b.gastos)}</title></rect>`;
    }
    pontos += `${(x0 + slot / 2).toFixed(1)},${yLin(cums[i]).toFixed(1)} `;
    if (i % passo === 0) {
      rotulos += `<text x="${(x0 + slot / 2).toFixed(1)}" y="${H - 8}" text-anchor="middle" class="svg-rotulo">${esc(b.rotulo)}</text>`;
    }
  });

  const linha = `<polyline points="${pontos.trim()}" fill="none" stroke="${corLin}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;

  return `<svg viewBox="0 0 ${W} ${H}" class="grafico" role="img" aria-label="Ganhos, gastos e saldo acumulado">
    ${rects}${linha}${rotulos}
  </svg>`;
}

function legendaItem(cor, texto, comoLinha) {
  return `<span class="legenda-linha"><span class="ponto${comoLinha ? ' linha-legenda' : ''}" style="background:${cor}"></span>${esc(texto)}</span>`;
}

/* Cartão de comparação com o período anterior */
function cartaoComparacao(valAnt, valAtual, rotuloAnt, bomSeSobe) {
  if (valAnt === null) {
    return `<div class="cartao"><h3>Comparação com o período anterior</h3>
      <p class="vazio">Sem comparação disponível para este período.</p></div>`;
  }
  let variacao = '—';
  let classe = '';
  if (valAnt !== 0) {
    const v = ((valAtual - valAnt) / Math.abs(valAnt)) * 100;
    const sobe = v > 0;
    variacao = `${v === 0 ? '•' : sobe ? '▲' : '▼'} ${fmtPct(Math.abs(v))}`;
    if (v !== 0) classe = sobe === bomSeSobe ? 'pos' : 'neg';
  } else {
    variacao = 'sem base de comparação';
  }
  return `<div class="cartao"><h3>Comparação com o período anterior</h3>
    <div class="linha-est"><span>Período anterior</span><b>${esc(rotuloAnt)}</b></div>
    <div class="linha-est"><span>Total do período anterior</span><b>${fmt(valAnt)}</b></div>
    <div class="linha-est"><span>Variação</span><b class="${classe}">${variacao}</b></div>
  </div>`;
}

/* ---------- 6. Abas ---------- */

function mostrarAba(nome) {
  estado.aba = nome;
  $$('.aba').forEach((s) => s.classList.toggle('ativa', s.id === 'aba-' + nome));
  $$('.tab-btn').forEach((b) => b.classList.toggle('ativa', b.dataset.aba === nome));
  $('#titulo-aba').textContent = tr({ gastos: 'gastos', ganhos: 'ganhos', balanco: 'balanco', historico: 'historico' }[nome]);
  renderAba(nome);
  window.scrollTo(0, 0);
}

function renderAba(nome) {
  if (nome === 'gastos') renderStats('gasto');
  else if (nome === 'ganhos') renderStats('ganho');
  else if (nome === 'balanco') renderBalanco();
  else renderHistorico();
}

/* Chips de filtro de período (+ intervalo personalizado) */
function renderFiltros(aba) {
  const atual = estado.periodo[aba];
  if (atual === 'intervalo' && !estado.custom[aba]) estado.custom[aba] = customPadrao();
  const c = estado.custom[aba] || customPadrao();

  $('#filtros-' + aba).innerHTML =
    '<div class="chips-linha">' +
    PERIODOS.map((p) =>
      `<button type="button" class="chip${p.id === atual ? ' ativa' : ''}" data-per="${p.id}" data-aba="${aba}">${p.nome}</button>`
    ).join('') +
    '</div>' +
    (atual === 'dia'
      ? `<div class="intervalo">
          <input type="date" class="controlo" id="dia-${aba}" value="${estado.dia[aba]}" aria-label="Dia">
          <button type="button" class="btn-mini azul" data-acao="aplicar-dia" data-aba="${aba}">OK</button>
        </div>`
      : '') +
    (atual === 'intervalo'
      ? `<div class="intervalo">
          <input type="date" class="controlo" id="ini-${aba}" value="${c.inicio}" aria-label="Data de início">
          <input type="date" class="controlo" id="fim-${aba}" value="${c.fim}" aria-label="Data de fim">
          <button type="button" class="btn-mini azul" data-acao="aplicar" data-aba="${aba}">OK</button>
        </div>`
      : '');
}

function aplicarIntervalo(aba) {
  const ini = $('#ini-' + aba).value;
  const fim = $('#fim-' + aba).value;
  if (!ini || !fim) { aviso('Escolhe as duas datas.'); return; }
  estado.custom[aba] = {
    inicio: ini < fim ? ini : fim,
    fim: ini < fim ? fim : ini
  };
  renderAba(aba);
}

function aplicarDia(aba) {
  const v = $('#dia-' + aba).value;
  if (!v) { aviso('Escolhe o dia.'); return; }
  estado.dia[aba] = v;
  renderAba(aba);
}

/* Linha de movimento (usada nas listas) */
function linhaMov(m, mostrarData) {
  const pos = m.tipo === 'ganho';
  let sub = '';
  if (mostrarData) {
    const quando = dtCurto.format(dataDe(m.data));
    sub = m.nota ? `${quando} · ${esc(m.nota)}` : quando;
  } else {
    sub = esc(m.nota || '');
  }
  return `<button type="button" class="mov" data-id="${m.id}">
    <span class="cor" style="background:${corDe(m.categoria)}"></span>
    <span class="meio"><span class="t">${m.recorrenteId ? '<span class="marca-rec" aria-label="Recorrente">↻</span> ' : ''}${esc(m.categoria)}</span><span class="n">${sub}</span></span>
    <span class="val ${pos ? 'pos' : 'neg'}">${pos ? '+' : '−'}${fmt(m.valor)}</span>
  </button>`;
}

/* Soma gastos/ganhos agrupados por dia, do mais recente para o mais antigo */
function resumoPorDia(p) {
  const mapa = new Map();
  emPeriodo(estado.movs, p).forEach((m) => {
    let d = mapa.get(m.data);
    if (!d) { d = { data: m.data, gastos: 0, ganhos: 0, n: 0 }; mapa.set(m.data, d); }
    if (m.tipo === 'gasto') d.gastos += m.valor; else d.ganhos += m.valor;
    d.n++;
  });
  return [...mapa.values()].sort((a, b) => b.data.localeCompare(a.data));
}

/* Cartão "por dia". modo: 'gasto' | 'ganho' | 'ambos' (balanço) */
const MAX_DIAS_TABELA = 60; // limita o comprimento em períodos muito longos
function cartaoPorDia(aba, p, modo) {
  if (p.inicio === p.fim) return ''; // um só dia → não faz sentido uma tabela diária
  const lista = resumoPorDia(p);
  if (!lista.length) return '';

  const visivel = lista.slice(0, MAX_DIAS_TABELA);
  const capado = lista.length > MAX_DIAS_TABELA;
  const dia = (d) => {
    const dt = dataDe(d);
    return `${dtSemana.format(dt).slice(0, 3)} ${dtCurto.format(dt)}`;
  };
  const somaG = round2(lista.reduce((s, x) => s + x.gastos, 0));
  const somaN = round2(lista.reduce((s, x) => s + x.ganhos, 0));

  let titulo, cabCSV, linhasCSV, cabecalho, corpo, rodape;
  if (modo === 'gasto') {
    titulo = 'Gastos por dia';
    cabCSV = ['data', 'gastos'];
    linhasCSV = lista.map((x) => [x.data, round2(x.gastos)]);
    cabecalho = '<tr><th>Dia</th><th>Gastos</th></tr>';
    corpo = visivel.map((x) => `<tr><td>${dia(x.data)}</td><td class="neg">${fmt(x.gastos)}</td></tr>`).join('');
    rodape = `<tr class="tabela-total"><td>Total</td><td class="neg">${fmt(somaG)}</td></tr>`;
  } else if (modo === 'ganho') {
    titulo = 'Ganhos por dia';
    cabCSV = ['data', 'ganhos'];
    linhasCSV = lista.map((x) => [x.data, round2(x.ganhos)]);
    cabecalho = '<tr><th>Dia</th><th>Ganhos</th></tr>';
    corpo = visivel.map((x) => `<tr><td>${dia(x.data)}</td><td class="pos">${fmt(x.ganhos)}</td></tr>`).join('');
    rodape = `<tr class="tabela-total"><td>Total</td><td class="pos">${fmt(somaN)}</td></tr>`;
  } else {
    titulo = 'Ganhos, gastos e saldo por dia';
    cabCSV = ['data', 'ganhos', 'gastos', 'saldo'];
    linhasCSV = lista.map((x) => [x.data, round2(x.ganhos), round2(x.gastos), round2(x.ganhos - x.gastos)]);
    cabecalho = '<tr><th>Dia</th><th>Ganhos</th><th>Gastos</th><th>Saldo</th></tr>';
    corpo = visivel.map((x) => {
      const s = round2(x.ganhos - x.gastos);
      return `<tr><td>${dia(x.data)}</td><td class="pos">${fmt(x.ganhos)}</td><td class="neg">${fmt(x.gastos)}</td>
        <td class="${s >= 0 ? 'pos' : 'neg'}">${s >= 0 ? '+' : '−'}${fmt(Math.abs(s))}</td></tr>`;
    }).join('');
    const sTot = round2(somaN - somaG);
    rodape = `<tr class="tabela-total"><td>Total</td><td class="pos">${fmt(somaN)}</td><td class="neg">${fmt(somaG)}</td>
      <td class="${sTot >= 0 ? 'pos' : 'neg'}">${sTot >= 0 ? '+' : '−'}${fmt(Math.abs(sTot))}</td></tr>`;
  }

  const chave = aba + '-dias';
  registarExportador(chave, aba + '-por-dia', cabCSV, linhasCSV);
  return `<div class="cartao">
    <h3>${titulo} <span class="sub">${lista.length} ${LANG === 'en' ? (lista.length === 1 ? 'day' : 'days') : (lista.length === 1 ? 'dia' : 'dias')}</span></h3>
    ${barraExportar(chave)}
    <table class="tabela tabela-dias">
      <thead>${cabecalho}</thead>
      <tbody>${corpo}${rodape}</tbody>
    </table>
    ${capado
      ? `<p class="def-nota">A mostrar os últimos ${MAX_DIAS_TABELA} dias com movimentos; a linha de total inclui todo o período.</p>`
      : ''}
  </div>`;
}

/* ----- Estatísticas de Gastos e de Ganhos (mesma estrutura) ----- */
function renderStats(tipo) {
  const aba = tipo === 'gasto' ? 'gastos' : 'ganhos';
  exportadores = {};
  renderFiltros(aba);
  const p = periodoDe(aba);

  const movs = emPeriodo(estado.movs.filter((m) => m.tipo === tipo), p);
  const total = movs.reduce((s, m) => s + m.valor, 0);
  const n = movs.length;
  const media = n ? total / n : 0;
  const nomeCat = tipo === 'gasto' ? 'categoria' : 'origem';
  const grupos = agrupar(movs);
  const ord = ordenarDesc(movs);

  const maisVezes = grupos.slice().sort((a, b) => b.n - a.n || b.total - a.total)[0];
  const maisDinheiro = grupos.slice().sort((a, b) => b.total - a.total)[0];

  const baldes = baldear(movs, p);
  const campo = tipo === 'gasto' ? 'gastos' : 'ganhos';
  const corBarras = tipo === 'gasto' ? cssVar('--gasto') : cssVar('--ganho');

  let comp;
  if (p.prev) {
    const ant = emPeriodo(estado.movs.filter((m) => m.tipo === tipo), p.prev)
      .reduce((s, m) => s + m.valor, 0);
    comp = cartaoComparacao(round2(ant), total, periodoTexto({ tipo: 'x', ...p.prev }), tipo === 'gasto' ? false : true);
  } else {
    comp = cartaoComparacao(null, total, '', true);
  }

  const cartoes = [
    /* Total + média por registo */
    `<div class="cartao">
      <h3>Total ${tipo === 'gasto' ? 'gasto' : 'ganho'} · ${periodoTexto(p)}</h3>
      <div class="total-grande">${fmt(total)}</div>
      <div class="linha-est"><span>Registos</span><b>${n}</b></div>
      <div class="linha-est"><span>Média por registo</span><b>${fmt(media)}</b></div>
    </div>`,

    /* Tabela dia a dia (gastos ou ganhos) */
    cartaoPorDia(aba, p, tipo),

    /* Total por categoria/origem (donut + percentagens) */
    n
      ? (registarExportador(`${aba}-cat`, `${aba}-por-${nomeCat === 'categoria' ? 'categoria' : 'origem'}`,
          ['categoria', 'valor', 'percentagem'],
          grupos.map((g) => [g.nome, g.total, total ? (g.total / total) * 100 : 0])),
        `<div class="cartao">
          <h3>Total por ${nomeCat}</h3>
          ${barraExportar(`${aba}-cat`)}
          ${donutSVG(grupos, total)}
          <div class="legenda">${grupos.map((g) => `
            <div class="legenda-linha toca" role="button" tabindex="0"
                 data-cat="${esc(g.nome)}" data-dtipo="${tipo}">
              <span class="ponto" style="background:${g.cor}"></span>
              <span class="legenda-nome">${esc(g.nome)}</span>
              <span class="legenda-val">${fmt(g.total)}</span>
              <span class="legenda-pct">${fmtPct((g.total / total) * 100)}</span>
            </div>`).join('')}
          </div>
        </div>`)
      : `<div class="cartao"><h3>Total por ${nomeCat}</h3><p class="vazio">Sem ${tipo === 'gasto' ? 'gastos' : 'ganhos'} neste período.</p></div>`,

    /* Categoria/origem mais comum: nº de vezes e mais dinheiro */
    n
      ? `<div class="cartao">
          <h3>${tipo === 'gasto' ? 'Categorias' : 'Origens'} em destaque</h3>
          <div class="linha-est"><span>Mais ${nomeCat} (nº de vezes)</span><b>${esc(maisVezes.nome)} · ${maisVezes.n}×</b></div>
          <div class="linha-est"><span>Mais dinheiro (${tipo === 'gasto' ? 'gasto' : 'ganho'})</span><b>${esc(maisDinheiro.nome)} · ${fmt(maisDinheiro.total)}</b></div>
        </div>`
      : '',

    /* Evolução ao longo do tempo */
    (registarExportador(`${aba}-evolucao`, `${aba}-evolucao`, ['periodo', campo === 'gastos' ? 'gastos' : 'ganhos'], baldes.map((b) => [b.rotulo, b[campo]])),
    `<div class="cartao">
      <h3>Evolução · por ${p.gran === 'dia' ? 'dia' : 'mês'}</h3>
      ${barraExportar(`${aba}-evolucao`)}
      ${barrasSVG(baldes, campo, corBarras)}
    </div>`),

    /* Comparação com o período anterior */
    comp,

    /* Lista dos movimentos do período */
    n
      ? (registarExportador(`${aba}-movs`, `${aba}-movimentos`, ['data','tipo','valor','categoria','nota'], ord.map(movLinhaCSV)),
        `<div class="cartao">
          <h3>Movimentos do período (${n})</h3>
          ${barraExportar(`${aba}-movs`)}
          ${ord.map((m) => linhaMov(m, true)).join('')}
        </div>`)
      : ''
  ];

  $('#stats-' + aba).innerHTML = cartoes.join('');
}

/* ----- Balanço ----- */
function renderBalanco() {
  exportadores = {};
  renderFiltros('balanco');
  const p = periodoDe('balanco');

  const gastos = emPeriodo(estado.movs.filter((m) => m.tipo === 'gasto'), p);
  const ganhos = emPeriodo(estado.movs.filter((m) => m.tipo === 'ganho'), p);
  const totGan = round2(ganhos.reduce((s, m) => s + m.valor, 0));
  const totGas = round2(gastos.reduce((s, m) => s + m.valor, 0));
  const saldo = round2(totGan - totGas);
  const taxa = totGan > 0 ? (saldo / totGan) * 100 : null;

  const baldes = baldear([...ganhos, ...gastos], p);
  const dias = diasDoPeriodo(p);
  const nomeGran = p.gran === 'dia' ? 'dia' : 'mês';

  /* Melhor e pior período (com movimentos) */
  const comDados = baldes.filter((b) => b.n > 0);
  const porSaldo = comDados.slice().sort((a, b) => (b.ganhos - b.gastos) - (a.ganhos - a.gastos));
  const melhor = porSaldo[0];
  const pior = porSaldo[porSaldo.length - 1];
  const rotuloDe = (b) => p.gran === 'dia'
    ? dtCurto.format(dataDe(b.ini))
    : dtMesAno.format(dataDe(b.ini)).replace('.', '');

  /* Comparação do saldo com o período anterior */
  let comp;
  if (p.prev) {
    const antG = emPeriodo(estado.movs.filter((m) => m.tipo === 'ganho'), p.prev).reduce((s, m) => s + m.valor, 0);
    const antS = emPeriodo(estado.movs.filter((m) => m.tipo === 'gasto'), p.prev).reduce((s, m) => s + m.valor, 0);
    comp = cartaoComparacao(round2(antG - antS), saldo, periodoTexto({ tipo: 'x', ...p.prev }), true);
  } else {
    comp = cartaoComparacao(null, saldo, '', true);
  }

  /* Distribuição: que % dos ganhos foi gasta em cada categoria */
  const gruposGas = agrupar(gastos);
  const dist = totGan > 0
    ? gruposGas.map((g) => ({ ...g, pct: (g.total / totGan) * 100 }))
    : [];

  const cartoes = [
    /* Totais */
    (registarExportador('balanco-totais', 'balanco-totais', ['indicador','valor'],
        [['Ganhos', totGan], ['Gastos', totGas], ['Saldo', saldo], ['Taxa de poupança (%)', taxa === null ? 0 : taxa]]),
    `<div class="cartao">
      <h3>Balanço · ${periodoTexto(p)}</h3>
      <div class="total-grande ${saldo >= 0 ? 'pos' : 'neg'}">${saldo >= 0 ? '+' : '−'}${fmt(Math.abs(saldo))}</div>
      <div class="sub">Saldo do período (ganhos − gastos)</div>
      <div class="grelha-2" style="margin-top:12px">
        <div class="mini"><span class="v pos">${fmt(totGan)}</span><span class="r">Ganhos</span></div>
        <div class="mini"><span class="v neg">${fmt(totGas)}</span><span class="r">Gastos</span></div>
      </div>
    </div>`),

    /* Tabela dia a dia: ganhos, gastos e saldo */
    cartaoPorDia('balanco', p, 'ambos'),

    /* Gráfico: barras agrupadas + saldo acumulado */
    (registarExportador('balanco-evolucao', 'balanco-evolucao', ['periodo','ganhos','gastos','saldo'], baldes.map((b) => [b.rotulo, b.ganhos, b.gastos, round2(b.ganhos - b.gastos)])),
    `<div class="cartao">
      <h3>Evolução · por ${nomeGran}</h3>
      ${barraExportar('balanco-evolucao')}
      ${balancoSVG(baldes)}
      <div class="legenda" style="flex-direction:row;flex-wrap:wrap;gap:14px;margin-top:10px">
        ${legendaItem(cssVar('--ganho'), 'Ganhos')}
        ${legendaItem(cssVar('--gasto'), 'Gastos')}
        ${legendaItem(cssVar('--roxo'), 'Saldo acumulado', true)}
      </div>
    </div>`),

    /* Taxa de poupança */
    `<div class="cartao">
      <h3>Taxa de poupança</h3>
      <div class="total-grande medio ${taxa !== null && taxa >= 0 ? 'pos' : 'neg'}">${taxa === null ? '—' : fmtPct(taxa)}</div>
      <div class="sub">${taxa === null
        ? 'Sem ganhos neste período.'
        : `Por cada 100 € ganhos, guardas ${fmtPct(taxa)}.`}</div>
    </div>`,

    /* Médias por dia, semana e mês */
    `<div class="cartao">
      <h3>Média por dia · semana · mês</h3>
      <table class="tabela">
        <thead><tr><th>Período</th><th>Ganhos</th><th>Gastos</th></tr></thead>
        <tbody>
          <tr><td>Dia</td><td class="pos">${fmt(totGan / dias)}</td><td class="neg">${fmt(totGas / dias)}</td></tr>
          <tr><td>Semana</td><td class="pos">${fmt(totGan / (dias / 7))}</td><td class="neg">${fmt(totGas / (dias / 7))}</td></tr>
          <tr><td>Mês</td><td class="pos">${fmt(totGan / (dias / 30.44))}</td><td class="neg">${fmt(totGas / (dias / 30.44))}</td></tr>
        </tbody>
      </table>
      <p class="def-nota">Médias calculadas sobre ${dias} ${dias === 1 ? 'dia' : 'dias'} do período.</p>
    </div>`,

    /* Melhor e pior período */
    melhor
      ? (registarExportador('balanco-melhorpior', 'balanco-melhor-pior', ['tipo','rotulo','saldo'],
          [['Melhor ' + nomeGran, rotuloDe(melhor), round2(melhor.ganhos - melhor.gastos)],
           ...(pior && pior !== melhor ? [['Pior ' + nomeGran, rotuloDe(pior), round2(pior.ganhos - pior.gastos)]] : [])]),
        `<div class="cartao">
          <h3>Melhor e pior ${nomeGran}</h3>
          ${barraExportar('balanco-melhorpior')}
          <div class="linha-est"><span>Melhor ${nomeGran}</span><b class="${melhor.ganhos - melhor.gastos >= 0 ? 'pos' : 'neg'}">${rotuloDe(melhor)} · ${fmt(melhor.ganhos - melhor.gastos)}</b></div>
          ${pior && pior !== melhor
            ? `<div class="linha-est"><span>Pior ${nomeGran}</span><b class="${pior.ganhos - pior.gastos < 0 ? 'neg' : ''}">${rotuloDe(pior)} · ${fmt(pior.ganhos - pior.gastos)}</b></div>`
            : ''}
        </div>`)
      : `<div class="cartao"><h3>Melhor e pior ${nomeGran}</h3><p class="vazio">Sem movimentos neste período.</p></div>`,

    /* Comparação com o período anterior */
    comp,

    /* Distribuição dos gastos ( % dos ganhos ) */
    (registarExportador('balanco-dist', 'balanco-distribuicao', ['categoria','valor_gasto','percentagem_dos_ganhos'], dist.map((g) => [g.nome, g.total, g.pct])),
    `<div class="cartao">
      <h3>Que % dos ganhos foi gasta (por categoria)</h3>
      ${barraExportar('balanco-dist')}
      ${dist.length
        ? dist.map((g) => `
          <div class="dist-item toca" role="button" tabindex="0"
               data-cat="${esc(g.nome)}" data-dtipo="gasto">
            <div class="linha-est" style="border:none;padding:0 0 3px">
              <span style="color:var(--texto)">${esc(g.nome)}</span>
              <b>${fmtPct(g.pct)} · ${fmt(g.total)}</b>
            </div>
            <div class="barra-fundo"><div class="barra-fill" style="width:${Math.min(100, g.pct).toFixed(1)}%;background:${g.cor}"></div></div>
          </div>`).join('')
        : '<p class="vazio">Sem ganhos ou sem gastos neste período.</p>'}
    </div>`)
  ];

  $('#stats-balanco').innerHTML = cartoes.join('');
}

/* ----- Histórico ----- */

/* Opções de filtro temporal do Histórico */
function histTempoOpcoes() {
  return [['tudo', 'Sempre'], ['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês'], ['ano', 'Ano'], ['intervalo', 'Intervalo…']];
}

/* Intervalo escolhido no Histórico (null = sem filtro de tempo) */
function histIntervalo() {
  const t = estado.histTempo;
  if (t.tipo === 'tudo') return null;
  if (t.tipo === 'dia') { const d = t.data || hojeISO(); return { inicio: d, fim: d }; }
  if (t.tipo === 'intervalo') {
    if (!t.ini || !t.fim) return null;
    return t.ini <= t.fim ? { inicio: t.ini, fim: t.fim } : { inicio: t.fim, fim: t.ini };
  }
  const d = dataDe(t.data || hojeISO());
  if (t.tipo === 'semana') {
    const dow = (d.getDay() + 6) % 7; // segunda-feira = 0
    const ini = new Date(d.getFullYear(), d.getMonth(), d.getDate() - dow);
    return { inicio: iso(ini), fim: iso(new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + 6)) };
  }
  if (t.tipo === 'mes') {
    return { inicio: iso(new Date(d.getFullYear(), d.getMonth(), 1)),
             fim: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
  }
  if (t.tipo === 'ano') {
    return { inicio: iso(new Date(d.getFullYear(), 0, 1)),
             fim: iso(new Date(d.getFullYear(), 11, 31)) };
  }
  return null;
}

/* Movimentos depois dos filtros de tipo e de tempo */
function histBase() {
  let movs = ordenarDesc(estado.movs);
  if (estado.hist === 'gastos') movs = movs.filter((m) => m.tipo === 'gasto');
  if (estado.hist === 'ganhos') movs = movs.filter((m) => m.tipo === 'ganho');
  if (estado.histCats.length) {
    const escolhidas = new Set(estado.histCats);
    movs = movs.filter((m) => escolhidas.has(m.tipo + '|' + m.categoria));
  }
  const iv = histIntervalo();
  if (iv) movs = movs.filter((m) => m.data >= iv.inicio && m.data <= iv.fim);
  return movs;
}

function renderHistorico() {
  exportadores = {};

  /* 1. Tipo: tudo / gastos / ganhos (únicos botões sempre visíveis) */
  const filtros = [['tudo', 'Tudo'], ['gastos', 'Gastos'], ['ganhos', 'Ganhos']];
  $('#filtro-historico').innerHTML = filtros
    .map(([id, nome]) => `<button type="button" class="chip${estado.hist === id ? ' ativa' : ''}" data-hist="${id}">${nome}</button>`)
    .join('');

  /* Contador no botão "Filtros" */
  const nFiltros = estado.histCats.length + (estado.histTempo.tipo !== 'tudo' ? 1 : 0);
  const badge = $('#badge-filtros');
  if (badge) { badge.textContent = nFiltros ? String(nFiltros) : ''; badge.hidden = !nFiltros; }

  let movs = histBase();

  registarExportador('historico-lista', 'historico', ['data','tipo','valor','categoria','nota'], movs.map(movLinhaCSV));

  if (!movs.length) {
    const iv = histIntervalo();
    const semPeriodo = estado.histTempo.tipo === 'intervalo' && !iv;
    const texto = semPeriodo
      ? 'Escolhe o intervalo de tempo.'
      : (estado.histTempo.tipo !== 'tudo' || estado.histCats.length || estado.hist !== 'tudo'
          ? 'Nada corresponde a esses filtros.'
          : 'Ainda não há movimentos para mostrar.');
    $('#lista-historico').innerHTML = `<p class="vazio">${texto}</p>`;
    return;
  }

  /* Agrupa por dia, mais recente primeiro */
  const grupos = [];
  let diaAtual = null;
  movs.forEach((m) => {
    if (!diaAtual || diaAtual.data !== m.data) {
      diaAtual = { data: m.data, itens: [], ganhos: 0, gastos: 0 };
      grupos.push(diaAtual);
    }
    diaAtual.itens.push(m);
    if (m.tipo === 'gasto') diaAtual.gastos += m.valor;
    else diaAtual.ganhos += m.valor;
  });

  const iv = histIntervalo();
  const rotulo = estado.histTempo.tipo === 'tudo' ? '' :
    (iv ? periodoTexto({ tipo: 'intervalo', ...iv }) : '');
  const nomesCats = estado.histCats.map((k) => k.split('|')[1]).join(', ');

  $('#lista-historico').innerHTML = `<div class="cartao">
    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:8px">
      <h3 style="margin:0">Histórico (${movs.length})${rotulo ? ` · ${rotulo}` : ''}</h3>
      ${barraExportar('historico-lista')}
    </div>
    ${nomesCats ? `<div class="filtros-resumo">${esc(nomesCats)}</div>` : ''}
    ${grupos.map((g) => {
      const net = round2(g.ganhos - g.gastos);
      return `<div class="lista-dia">
        <div class="dia-cab">
          <span>${dtLongo.format(dataDe(g.data))}</span>
          <span class="total-dia ${net > 0 ? 'pos' : net < 0 ? 'neg' : ''}">${net > 0 ? '+' : net < 0 ? '−' : ''}${fmt(Math.abs(net))}</span>
        </div>
        ${g.itens.map((m) => linhaMov(m, false)).join('')}
      </div>`;
    }).join('')}
  </div>`;
}

/* ---------- 6a-bis. Painel de filtros do Histórico ---------- */

let rascunhoFiltros = null;

/* Categorias/origens disponíveis para o tipo escolhido */
function gruposCatHist() {
  const tipos = estado.hist === 'tudo' ? ['gasto', 'ganho'] : [estado.hist === 'gastos' ? 'gasto' : 'ganho'];
  return tipos.map((t) => ({ tipo: t, nomes: catsDe(t) }));
}

/* Mantém apenas categorias compatíveis com o tipo escolhido */
function podarHistCats() {
  const permitidos = new Set();
  gruposCatHist().forEach((g) => g.nomes.forEach((n) => permitidos.add(g.tipo + '|' + n)));
  estado.histCats = estado.histCats.filter((k) => permitidos.has(k));
}

function abrirFiltros() {
  rascunhoFiltros = {
    histCats: [...estado.histCats],
    histTempo: { ...estado.histTempo }
  };
  renderFiltrosHist();
  $('#filtros-fundo').hidden = false;
  document.body.classList.add('sem-scroll');
}

function fecharFiltros() {
  $('#filtros-fundo').hidden = true;
  rascunhoFiltros = null;
  libertarScroll();
}

function aplicarFiltrosHist() {
  if (rascunhoFiltros) {
    estado.histCats = rascunhoFiltros.histCats;
    estado.histTempo = rascunhoFiltros.histTempo;
  }
  fecharFiltros();
  renderHistorico();
}

function renderFiltrosHist() {
  if (!rascunhoFiltros) return;
  const t = rascunhoFiltros.histTempo;

  const secoes = gruposCatHist().map((g) => `
    <h4>${g.tipo === 'gasto' ? 'Categorias de gastos' : 'Origens de ganhos'}</h4>
    <div class="chips">
      ${g.nomes.map((n) => {
        const k = g.tipo + '|' + n;
        const on = rascunhoFiltros.histCats.includes(k);
        return `<button type="button" class="chip${on ? ' ativa' : ''}" data-fcat="${esc(k)}">${esc(n)}</button>`;
      }).join('') || '<p class="vazio">Sem entradas</p>'}
    </div>`).join('');

  $('#filtros-conteudo').innerHTML = `
    <div class="def-sec">
      <h3>Categorias</h3>
      ${secoes}
    </div>
    <div class="def-sec">
      <h3>Tempo</h3>
      <div class="chips">
        ${histTempoOpcoes().map(([id, nome]) =>
          `<button type="button" class="chip${t.tipo === id ? ' ativa' : ''}" data-ftempo="${id}">${nome}</button>`).join('')}
      </div>
      ${t.tipo === 'dia'
        ? `<div class="def-grelha"><label>Dia
             <input type="date" class="controlo" id="hf-dia" value="${t.data || hojeISO()}"></label></div>` : ''}
      ${t.tipo === 'intervalo'
        ? `<div class="def-grelha">
             <label>De <input type="date" class="controlo" id="hf-ini" value="${t.ini}"></label>
             <label>Até <input type="date" class="controlo" id="hf-fim" value="${t.fim}"></label>
           </div>` : ''}
    </div>
    <div class="acoes-folha">
      <button type="button" class="btn-secundario" id="btn-limpar-filtros">Limpar</button>
      <button type="button" class="btn-grande azul" id="btn-aplicar-filtros">Aplicar</button>
    </div>`;

  traduzirDOM($('#filtros-conteudo'));
}

function onFiltrosClick(ev) {
  if (!rascunhoFiltros) return;
  const fcat = ev.target.closest('[data-fcat]');
  if (fcat) {
    const k = fcat.dataset.fcat;
    const i = rascunhoFiltros.histCats.indexOf(k);
    if (i === -1) rascunhoFiltros.histCats.push(k);
    else rascunhoFiltros.histCats.splice(i, 1);
    renderFiltrosHist();
    return;
  }
  const ftempo = ev.target.closest('[data-ftempo]');
  if (ftempo) {
    rascunhoFiltros.histTempo.tipo = ftempo.dataset.ftempo;
    renderFiltrosHist();
    return;
  }
  if (ev.target.closest('#btn-limpar-filtros')) {
    rascunhoFiltros = {
      histCats: [],
      histTempo: { tipo: 'tudo', data: hojeISO(), ini: '', fim: '' }
    };
    renderFiltrosHist();
    return;
  }
  if (ev.target.closest('#btn-aplicar-filtros')) { aplicarFiltrosHist(); }
}

function onFiltrosChange(ev) {
  if (!rascunhoFiltros) return;
  const t = rascunhoFiltros.histTempo;
  if (ev.target.id === 'hf-dia') t.data = ev.target.value || hojeISO();
  else if (ev.target.id === 'hf-ini') t.ini = ev.target.value;
  else if (ev.target.id === 'hf-fim') t.fim = ev.target.value;
  else return;
  renderFiltrosHist();
}

/* ---------- 6b. Detalhe de um tipo (ao clicar num gráfico) ---------- */

/* Período que está a ser mostrado na aba actual (para o detalhe) */
function detalhePeriodo() {
  if (estado.aba === 'historico') {
    const iv = histIntervalo();
    return iv ? { tipo: 'intervalo', ...iv } : { tipo: 'sempre', inicio: '1900-01-01', fim: '9999-12-31' };
  }
  return periodoDe(estado.aba === 'balanco' ? 'balanco' : estado.aba);
}

function abrirDetalheCat(tipo, nome) {
  const p = detalhePeriodo();
  const movs = ordenarDesc(emPeriodo(estado.movs.filter((m) => m.tipo === tipo && m.categoria === nome), p));
  const total = round2(movs.reduce((s, m) => s + m.valor, 0));
  const n = movs.length;

  $('#detalhe-titulo').textContent = nome;
  $('#detalhe-conteudo').innerHTML = `
    <div class="cartao">
      <h3>${tipo === 'gasto' ? 'Gastos' : 'Ganhos'} · ${periodoTexto(p)}</h3>
      <div class="total-grande ${tipo === 'gasto' ? 'neg' : 'pos'}">${fmt(total)}</div>
      <div class="linha-est"><span>Registos</span><b>${n}</b></div>
      <div class="linha-est"><span>Média por registo</span><b>${fmt(n ? total / n : 0)}</b></div>
      ${estado.histCats.length && estado.aba === 'historico'
        ? `<div class="sub">${esc(estado.histCats.map((k) => k.split('|')[1]).join(', '))}</div>` : ''}
    </div>
    ${n
      ? `<div class="cartao">${movs.map((m) => linhaMov(m, true)).join('')}</div>`
      : '<p class="vazio">Sem movimentos neste período.</p>'}`;

  $('#detalhe-fundo').hidden = false;
  document.body.classList.add('sem-scroll');
  traduzirDOM($('#detalhe-conteudo'));
}

function fecharDetalhe() {
  const el = $('#detalhe-fundo');
  if (el) el.hidden = true;
  libertarScroll();
}

/* ---------- 6c. Movimentos recorrentes (valor fixo, todos os meses) ---------- */

/* Datas devidas de uma regra desde a última gerada até hoje */
function ocorrenciasDevidas(regra, hoje) {
  const datas = [];
  const inicio = regra.inicio || hoje;
  const fim = dataDe(hoje);
  let ano = dataDe(inicio).getFullYear();
  let mes = dataDe(inicio).getMonth(); // 0-11
  while (ano < fim.getFullYear() || (ano === fim.getFullYear() && mes <= fim.getMonth())) {
    const ultimoDia = new Date(ano, mes + 1, 0).getDate();
    const d = iso(new Date(ano, mes, Math.min(regra.dia, ultimoDia)));
    if (d >= inicio && d <= hoje && (!regra.ultimo || d > regra.ultimo)) datas.push(d);
    mes++; if (mes > 11) { mes = 0; ano++; }
  }
  return datas;
}

/* Cria os movimentos em falta de todas as regras e devolve quantos criou */
async function gerarRecorrentes() {
  const hoje = hojeISO();
  const regras = (await idbTodos('recorrentes')) || [];
  let total = 0;
  for (const r of regras) {
    if (r.ativo === false) continue;
    const datas = ocorrenciasDevidas(r, hoje);
    if (!datas.length) continue;
    for (const d of datas) {
      await idbAdd('movimentos', {
        tipo: r.tipo, valor: round2(r.valor), categoria: r.categoria,
        data: d, nota: r.nota || '', criado: Date.now(), recorrenteId: r.id
      });
      total++;
    }
    await idbPut('recorrentes', { ...r, ultimo: datas[datas.length - 1] });
  }
  return total;
}

async function adicionarRecorrente() {
  const tipo = $('#rec-tipo').value;
  const valor = parseValor($('#rec-valor').value);
  if (!(valor > 0)) { aviso('Escreve um valor maior que zero.'); return; }

  const dia = Math.min(31, Math.max(1, parseInt($('#rec-dia').value, 10) || 1));
  const sel = $('#rec-cat');
  const categoria = (sel && sel.value) || catsDe(tipo)[0];
  if (!categoria) { aviso('Escolhe uma categoria.'); return; }

  await idbAdd('recorrentes', {
    tipo, valor: round2(valor), categoria, dia,
    nota: $('#rec-nota').value.trim(), inicio: hojeISO(), ultimo: null, ativo: true
  });
  const n = await gerarRecorrentes();
  await carregarDados();
  renderDefinicoes();
  renderAba(estado.aba);
  aviso(n ? `Recorrente criado · ${n} movimento(s) adicionado(s) ✓` : 'Recorrente criado ✓');
}

async function apagarRecorrente(id) {
  const r = estado.recs.find((x) => x.id === Number(id));
  if (!r) return;
  if (!confirm('Apagar este recorrente? Os movimentos já criados mantêm-se.')) return;
  await idbDel('recorrentes', r.id);
  await carregarDados();
  renderDefinicoes();
  aviso('Recorrente apagado ✓');
}

/* Lista de opções de categoria/origem no formulário de recorrentes */
function renderRecCatOptions() {
  const sel = $('#rec-cat');
  const tipoEl = $('#rec-tipo');
  if (!sel || !tipoEl) return;
  sel.innerHTML = catsDe(tipoEl.value)
    .map((n) => `<option value="${esc(n)}">${esc(n)}</option>`).join('');
}

/* ---------- 7. Modal de adicionar/editar movimento ---------- */

const modal = { tipo: 'gasto', id: null, cat: '' };

function abrirModal(tipo, mov) {
  fecharDetalhe();
  modal.tipo = tipo;
  modal.id = mov ? mov.id : null;
  modal.cat = mov ? mov.categoria : (catsDe(tipo)[0] || '');

  $('#erro-form').hidden = true;
  $('#modal-titulo').textContent = (mov ? 'Editar ' : 'Adicionar ') + (tipo === 'gasto' ? 'gasto' : 'ganho');
  $('#rot-valor').textContent = tipo === 'gasto' ? 'Valor gasto (€)' : 'Valor recebido (€)';
  traduzirDOM($('#modal-fundo').querySelector('.folha-cabecalho'));
  traduzirDOM($('#rot-valor').parentNode);
  $('#f-valor').value = mov ? String(mov.valor.toFixed(2)).replace('.', ',') : '';
  $('#f-data').value = mov ? mov.data : hojeISO();
  $('#f-nota').value = mov ? (mov.nota || '') : '';

  const ehGasto = tipo === 'gasto';
  $('#campo-categoria').hidden = !ehGasto;
  $('#campo-origem').hidden = ehGasto;
  if (ehGasto) renderChipsCat();
  else renderSelectOrigem(mov);

  $('#btn-apagar-mov').hidden = !mov;
  $('#btn-guardar-mov').className = 'btn-grande ' + (ehGasto ? 'vermelho' : 'verde');

  $('#modal-fundo').hidden = false;
  document.body.classList.add('sem-scroll');
  setTimeout(() => $('#f-valor').focus(), 80);
}

function renderChipsCat() {
  const lista = catsDe('gasto');
  if (!lista.includes(modal.cat)) modal.cat = lista[0] || '';
  $('#chips-categoria').innerHTML = lista.map((nome) =>
    `<button type="button" class="chip grande${nome === modal.cat ? ' ativa' : ''}" data-cat="${esc(nome)}">${esc(nome)}</button>`
  ).join('') + `<button type="button" class="chip grande novo" data-novo="gasto">＋ Novo tipo</button>`;
}

function renderSelectOrigem(mov) {
  const sel = $('#f-origem');
  const txt = $('#f-origem-texto');
  let lista = catsDe('ganho');
  if (!lista.some((n) => n.toLowerCase() === OUTRO.toLowerCase())) lista = [...lista, OUTRO];

  sel.innerHTML = lista.map((nome) => `<option value="${esc(nome)}">${esc(nome)}</option>`).join('') + `<option value="__novo__">＋ Nova origem…</option>`;

  const cat = mov ? mov.categoria : '';
  const existe = cat && lista.some((n) => n === cat);
  if (cat && existe) {
    sel.value = cat;
    txt.hidden = true;
    txt.value = '';
  } else if (cat) { // origem escrita à mão antes
    sel.value = OUTRO;
    txt.value = cat;
    txt.hidden = false;
  } else {
    sel.value = lista[0] || OUTRO;
    txt.value = '';
    txt.hidden = true;
  }
}

function fecharModal() {
  $('#modal-fundo').hidden = true;
  $('#erro-form').hidden = true;
  libertarScroll();
}

/* Tira o bloqueio do fundo só quando já não há nenhuma folha aberta */
function libertarScroll() {
  const abertas = ['#modal-fundo', '#def-fundo', '#detalhe-fundo', '#filtros-fundo']
    .some((s) => { const el = $(s); return el && !el.hidden; });
  if (!abertas) document.body.classList.remove('sem-scroll');
}

function mostrarErro(msg) {
  const el = $('#erro-form');
  el.textContent = msg;
  el.hidden = false;
}

async function guardarMovimento(ev) {
  ev.preventDefault();

  const valor = parseValor($('#f-valor').value);
  if (!(valor > 0)) { mostrarErro('Escreve um valor maior que zero.'); return; }

  let categoria;
  if (modal.tipo === 'gasto') {
    categoria = modal.cat || catsDe('gasto')[0];
    if (!categoria) { aviso('Cria uma categoria de gastos primeiro (Definições).'); return; }
  } else {
    const sel = $('#f-origem').value;
    categoria = sel.toLowerCase() === OUTRO.toLowerCase()
      ? ($('#f-origem-texto').value.trim() || OUTRO)
      : (sel === '__novo__' ? OUTRO : sel);
  }

  const data = $('#f-data').value || hojeISO();
  const nota = $('#f-nota').value.trim();

  try {
    if (modal.id) {
      const antigo = estado.movs.find((m) => m.id === modal.id);
      await idbPut('movimentos', { ...antigo, valor: round2(valor), categoria, data, nota });
    } else {
      await idbAdd('movimentos', { tipo: modal.tipo, valor: round2(valor), categoria, data, nota, criado: Date.now() });
      pedirPersistencia(); // relembrar o sistema para guardar sempre os dados
    }
    const eraEdicao = !!modal.id;
    const texto = (modal.tipo === 'gasto' ? 'Gasto' : 'Ganho') + (eraEdicao ? ' atualizado' : ' guardado') + ' ✓';
    fecharModal();
    await carregarDados();
    renderAba(estado.aba);
    aviso(texto);
  } catch (err) {
    console.error(err);
    mostrarErro('Não foi possível guardar. Tenta outra vez.');
  }
}

async function apagarMovimento() {
  if (!modal.id) return;
  if (!confirm('Apagar este movimento?')) return;
  try {
    await idbDel('movimentos', modal.id);
    fecharModal();
    await carregarDados();
    renderAba(estado.aba);
    aviso('Movimento apagado ✓');
  } catch (err) {
    console.error(err);
    aviso('Não foi possível apagar.');
  }
}

/* ---------- 8. Definições: categorias e backup ---------- */

function abrirDef() {
  renderDefinicoes();
  $('#def-fundo').hidden = false;
  document.body.classList.add('sem-scroll');
}

function fecharDef() {
  $('#def-fundo').hidden = true;
  libertarScroll();
}

function renderDefinicoes() {
  const seccao = (titulo, tipo, placeholder) => {
    const lista = catsDe(tipo);
    const itens = lista.map((nome) => {
      const usos = estado.movs.filter((m) => m.tipo === tipo && m.categoria === nome).length;
      const especial = tipo === 'ganho' && nome.toLowerCase() === OUTRO.toLowerCase();
      return `<li>
        <span class="ponto" style="background:${corDe(nome)}"></span>
        <span class="nome">${esc(nome)}</span>
        <span class="n">${usos}</span>
        ${especial ? '' : `
          <button type="button" class="btn-mini" data-accao="renomear" data-tipo="${tipo}" data-nome="${esc(nome)}" aria-label="Renomear ${esc(nome)}">✎</button>
          <button type="button" class="btn-mini perigo" data-accao="apagar" data-tipo="${tipo}" data-nome="${esc(nome)}" aria-label="Apagar ${esc(nome)}">✕</button>`}
      </li>`;
    }).join('');

    return `<section class="def-sec">
      <h3>${titulo}</h3>
      <ul class="def-lista">${itens || '<li><span class="nome">Sem entradas</span></li>'}</ul>
      <div class="adicionar-linha">
        <input type="text" class="controlo" id="nova-${tipo}" placeholder="${placeholder}" autocomplete="off">
        <button type="button" class="btn-mini azul" data-accao="adicionar" data-tipo="${tipo}">Adicionar</button>
      </div>
    </section>`;
  };

  const listaRec = (estado.recs || []).map((r) => `
    <li>
      <span class="ponto" style="background:${corDe(r.categoria)}"></span>
      <span class="nome">${esc(r.categoria)} · ${fmt(r.valor)} · dia ${r.dia}</span>
      <span class="n">${r.tipo === 'gasto' ? '−' : '+'}</span>
      <button type="button" class="btn-mini perigo" data-accao="del-rec" data-id="${r.id}"
              aria-label="Apagar recorrente">✕</button>
    </li>`).join('');

  const secRec = `<section class="def-sec">
    <h3>Movimentos recorrentes</h3>
    <ul class="def-lista">${listaRec || '<li><span class="nome">Sem recorrentes</span></li>'}</ul>
    <div class="def-grelha">
      <label>O que
        <select id="rec-tipo" class="controlo">
          <option value="gasto">Gasto</option>
          <option value="ganho">Ganho</option>
        </select>
      </label>
      <label>Valor (€)
        <input type="text" inputmode="decimal" class="controlo" id="rec-valor" placeholder="0,00" autocomplete="off">
      </label>
      <label>Dia do mês
        <input type="number" min="1" max="31" class="controlo" id="rec-dia" value="1">
      </label>
    </div>
    <div class="def-grelha">
      <label>Categoria/Origem
        <select id="rec-cat" class="controlo"></select>
      </label>
      <label>Explicação (opcional)
        <input type="text" class="controlo" id="rec-nota" maxlength="140">
      </label>
    </div>
    <button type="button" class="btn-mini azul" data-accao="add-rec">Adicionar recorrente</button>
    <p class="def-nota">Cria sozinho um movimento fixo todos os meses no dia escolhido
    (nos meses mais curtos usa o último dia) e, sempre que abres a app, completa o que faltar.</p>
  </section>`;

  $('#def-conteudo').innerHTML =
    seccao('Categorias de gastos', 'gasto', 'Nova categoria') +
    seccao('Origens de ganhos', 'ganho', 'Nova origem') +
    secRec +
    `<section class="def-sec">
      <h3>Backup dos dados</h3>
      <div class="botoes-def">
        <button type="button" class="btn-mini" id="btn-exp-json">Exportar JSON</button>
        <button type="button" class="btn-mini" id="btn-exp-csv">Exportar CSV</button>
        <button type="button" class="btn-mini" id="btn-imp-json">Importar JSON</button>
        <button type="button" class="btn-mini" id="btn-imp-csv">Importar CSV</button>
        <button type="button" class="btn-mini perigo" id="btn-tudo">Apagar todos os dados</button>
      </div>
      <p class="def-nota">O JSON substitui tudo (restauro completo). O CSV acrescenta movimentos aos que já tens.
      No iPhone, os ficheiros ficam em "Ficheiros → Descarregamentos".</p>
      <input type="file" id="f-json" accept=".json,application/json" hidden>
      <input type="file" id="f-csv" accept=".csv,text/csv" hidden>
    </section>
    <section class="def-sec">
      <h3>Apagar movimentos por período</h3>
      <div class="def-grelha">
        <label>O que apagar
          <select id="ap-tipo" class="controlo">
            <option value="gasto">Só gastos</option>
            <option value="ganho">Só ganhos</option>
            <option value="tudo" selected>Tudo (gastos e ganhos)</option>
          </select>
        </label>
        <label>Período
          <select id="ap-per" class="controlo">
            <option value="semana">Esta semana</option>
            <option value="mes" selected>Este mês</option>
            <option value="ano">Este ano</option>
            <option value="intervalo">Intervalo…</option>
            <option value="tudo">Todo o histórico</option>
          </select>
        </label>
      </div>
      <div class="def-grelha" id="ap-intervalo" hidden>
        <label>De <input type="date" id="ap-ini" class="controlo"></label>
        <label>Até <input type="date" id="ap-fim" class="controlo"></label>
      </div>
      <button type="button" class="btn-mini perigo" id="btn-ap-periodo">Apagar estes movimentos</button>
      <p class="def-nota">Apaga apenas os movimentos do período escolhido. Para apagar um movimento em particular, abre-o no Histórico (ou numa lista) e usa "Apagar".</p>
    </section>
    <section class="def-sec">
      <h3>Idioma</h3>
      <div class="def-grelha">
        <label>Idioma
          <select id="f-lang" class="controlo">
            <option value="pt"${LANG === 'pt' ? ' selected' : ''}>Português</option>
            <option value="en"${LANG === 'en' ? ' selected' : ''}>English</option>
          </select>
        </label>
      </div>
    </section>
    <section class="def-sec">
      <h3>Atualização</h3>
      <button type="button" class="btn-mini azul" id="btn-update">Procurar atualizações</button>
      <p class="def-nota" id="upd-nota">Procura uma versão nova na rede (só quando há internet).
      Com a app publicada em GitHub Pages, o Safari substitui os ficheiros sozinho.</p>
    </section>
    <section class="def-sec">
      <h3>Sobre</h3>
      <p class="def-nota">Carteira v1.3 — tudo guardado apenas neste dispositivo (IndexedDB).
      Sem contas, sem servidores, funciona offline.</p>
    </section>`;

  renderRecCatOptions();
}

async function onDefClick(ev) {
  const alvo = ev.target.closest('[data-accao], #btn-exp-json, #btn-exp-csv, #btn-imp-json, #btn-imp-csv, #btn-tudo, #btn-ap-periodo, #btn-update');
  if (!alvo) return;

  try {
    if (alvo.id === 'btn-exp-json') { exportarJSON(); return; }
    if (alvo.id === 'btn-exp-csv') { exportarCSV(); return; }
    if (alvo.id === 'btn-imp-json') { $('#f-json').click(); return; }
    if (alvo.id === 'btn-imp-csv') { $('#f-csv').click(); return; }
    if (alvo.id === 'btn-tudo') { await apagarTudo(); return; }
    if (alvo.id === 'btn-ap-periodo') { await apagarPorPeriodo(); return; }
    if (alvo.id === 'btn-update') { await atualizarApp(); return; }

    const { accao, tipo, nome } = alvo.dataset;
    if (accao === 'adicionar') await adicionarCat(tipo, $('#nova-' + tipo).value);
    else if (accao === 'renomear') await renomearCat(tipo, nome);
    else if (accao === 'apagar') await apagarCat(tipo, nome);
    else if (accao === 'add-rec') await adicionarRecorrente();
    else if (accao === 'del-rec') await apagarRecorrente(alvo.dataset.id);
  } catch (err) {
    console.error(err);
    aviso('A operação falhou.');
  }
}

async function onDefChange(ev) {
  if (ev.target.id === 'f-lang') {
    definirIdioma(ev.target.value);
    return;
  }
  if (ev.target.id === 'rec-tipo') {
    renderRecCatOptions();
    return;
  }
  if (ev.target.id === 'ap-per') {
    const c = document.querySelector('#ap-intervalo');
    if (c) c.hidden = ev.target.value !== 'intervalo';
    return;
  }
  const ficheiro = ev.target.files && ev.target.files[0];
  if (!ficheiro) return;
  try {
    if (ev.target.id === 'f-json') await importarJSON(ficheiro);
    else if (ev.target.id === 'f-csv') await importarCSV(ficheiro);
  } catch (err) {
    console.error(err);
    aviso('Não foi possível ler o ficheiro.');
  }
  ev.target.value = ''; // permite escolher o mesmo outra vez
}

function ehOutroEspecial(tipo, nome) {
  return tipo === 'ganho' && nome.toLowerCase() === OUTRO.toLowerCase();
}

async function adicionarCat(tipo, nome) {
  nome = String(nome || '').trim();
  if (!nome) { aviso('Escreve um nome primeiro.'); return; }
  if (catsDe(tipo).some((n) => n.toLowerCase() === nome.toLowerCase())) { aviso('Já existe uma entrada com esse nome.'); return; }
  await idbAdd('categorias', { nome, tipo });
  await carregarDados();
  renderDefinicoes();
  renderAba(estado.aba);
  aviso('Adicionada ✓');
}

/* Cria um tipo/origem novo a partir do próprio modal de adicionar movimento */
async function criarCatRapida(tipo) {
  const pergunta = tipo === 'gasto' ? 'Nome do novo tipo de gasto:' : 'Nome da nova origem de ganho:';
  const nome = String(prompt(pergunta) || '').trim();
  if (!nome) { if (tipo === 'ganho') renderSelectOrigem(null); return; }
  if (catsDe(tipo).some((n) => n.toLowerCase() === nome.toLowerCase())) {
    aviso('Já existe uma entrada com esse nome.');
    if (tipo === 'ganho') renderSelectOrigem(null);
    return;
  }
  try {
    await idbAdd('categorias', { nome, tipo });
    await carregarDados();
    if (tipo === 'gasto') { modal.cat = nome; renderChipsCat(); }
    else renderSelectOrigem({ categoria: nome });
    renderAba(estado.aba);
    aviso('Novo tipo adicionado ✓');
  } catch (err) {
    console.error(err);
    aviso('Não foi possível adicionar o tipo.');
  }
}

async function renomearCat(tipo, antigo) {
  if (ehOutroEspecial(tipo, antigo)) { aviso('A origem “Outro” não pode ser alterada.'); return; }
  const novo = String(prompt('Novo nome:', antigo) || '').trim();
  if (!novo || novo === antigo) return;
  if (catsDe(tipo).some((n) => n.toLowerCase() === novo.toLowerCase())) { aviso('Já existe uma entrada com esse nome.'); return; }

  const afetados = estado.movs.filter((m) => m.tipo === tipo && m.categoria === antigo);
  for (const m of afetados) await idbPut('movimentos', { ...m, categoria: novo });
  const cat = estado.cats.find((c) => c.tipo === tipo && c.nome === antigo);
  if (cat) { cat.nome = novo; await idbPut('categorias', cat); }

  await carregarDados();
  renderDefinicoes();
  renderAba(estado.aba);
  aviso(`Renomeada ✓ (${afetados.length} movimento(s) actualizados)`);
}

async function apagarCat(tipo, nome) {
  if (ehOutroEspecial(tipo, nome)) { aviso('A origem “Outro” não pode ser apagada.'); return; }
  const afetados = estado.movs.filter((m) => m.tipo === tipo && m.categoria === nome);
  const usos = afetados.length;

  if (usos > 0) {
    /* Apagar a categoria, apagando também os movimentos que a usam */
    if (!confirm(`“${nome}” está usada em ${usos} movimento(s). Apagar a categoria E esses movimentos?`)) {
      aviso('Nada foi apagado.');
      return;
    }
    for (const m of afetados) await idbDel('movimentos', m.id);
  } else if (!confirm(`Apagar “${nome}”?`)) {
    return;
  }

  const cat = estado.cats.find((c) => c.tipo === tipo && c.nome === nome);
  if (cat) await idbDel('categorias', cat.id);
  await carregarDados();
  renderDefinicoes();
  renderAba(estado.aba);
  aviso(usos > 0 ? `Categoria e ${usos} movimento(s) apagados ✓` : 'Apagada ✓');
}

async function apagarTudo() {
  if (!confirm('Apagar TODOS os movimentos e categorias deste dispositivo?')) return;
  if (!confirm('Isto não pode ser anulado. Continuar?')) return;
  await idbApagarTudo();
  await carregarDados();
  renderDefinicoes();
  renderAba(estado.aba);
  aviso('Todos os dados foram apagados.');
}

function periodoApagar(tipo, per, ini, fim) {
  const hoje = hojeISO();
  if (per === 'tudo') return { tipo, inicio: '1900-01-01', fim: '9999-12-31' };
  if (per === 'semana') {
    const d = dataDe(hoje);
    const dow = (d.getDay() + 6) % 7;
    const i = addDias(hoje, -dow);
    return { tipo, inicio: i, fim: addDias(i, 6) };
  }
  if (per === 'mes') {
    const d = dataDe(hoje);
    return { tipo, inicio: iso(new Date(d.getFullYear(), d.getMonth(), 1)), fim: iso(new Date(d.getFullYear(), d.getMonth() + 1, 0)) };
  }
  if (per === 'ano') {
    const y = dataDe(hoje).getFullYear();
    return { tipo, inicio: iso(new Date(y, 0, 1)), fim: iso(new Date(y, 11, 31)) };
  }
  const a = ini || hoje;
  const b = fim || hoje;
  return { tipo, inicio: a < b ? a : b, fim: a < b ? b : a };
}

async function apagarPorPeriodo() {
  const tipoSel = document.querySelector('#ap-tipo');
  const perSel = document.querySelector('#ap-per');
  const iniSel = document.querySelector('#ap-ini');
  const fimSel = document.querySelector('#ap-fim');
  if (!tipoSel || !perSel) return;
  const tipo = tipoSel.value;
  const per = perSel.value;
  const p = periodoApagar(tipo, per, iniSel ? iniSel.value : '', fimSel ? fimSel.value : '');
  const alvo = estado.movs.filter((m) => (p.tipo === 'tudo' || m.tipo === p.tipo) && m.data >= p.inicio && m.data <= p.fim);
  if (!alvo.length) { aviso('Não há movimentos nesse período.'); return; }
  const oQue = tipo === 'gasto' ? 'gastos' : tipo === 'ganho' ? 'ganhos' : 'movimentos (gastos e ganhos)';
  const rotulo = per === 'tudo' ? 'TODO o histórico' : `${dtCurto.format(dataDe(p.inicio))} – ${dtCurto.format(dataDe(p.fim))}`;
  if (!confirm(`Apagar ${alvo.length} ${oQue} de ${rotulo}?`)) return;
  for (const m of alvo) await idbDel('movimentos', m.id);
  await carregarDados();
  renderDefinicoes();
  renderAba(estado.aba);
  aviso(`${alvo.length} movimento(s) apagado(s) ✓`);
}

/* ----- Exportar / importar ----- */

function baixar(nome, conteudo, tipo) {
  const blob = new Blob([conteudo], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function exportarJSON() {
  const dados = {
    app: 'carteira',
    versao: 1,
    exportadoEm: new Date().toISOString(),
    movimentos: estado.movs,
    categorias: estado.cats,
    recorrentes: estado.recs || []
  };
  baixar(`carteira-backup-${hojeISO()}.json`, JSON.stringify(dados, null, 2), 'application/json');
  aviso('JSON exportado ✓');
}

function campoCSV(s) { return '"' + String(s ?? '').replace(/"/g, '""') + '"'; }

function exportarCSV() {
  const linhas = ['data;tipo;valor;categoria;nota'];
  estado.movs
    .slice()
    .sort((a, b) => a.data.localeCompare(b.data))
    .forEach((m) => {
      linhas.push([
        m.data,
        m.tipo,
        campoCSV(String(m.valor.toFixed(2)).replace('.', ',')),
        campoCSV(m.categoria),
        campoCSV(m.nota || '')
      ].join(';'));
    });
  baixar(`carteira-movimentos-${hojeISO()}.csv`, '\uFEFF' + linhas.join('\r\n'), 'text/csv');
  aviso('CSV exportado ✓');
}

/* ---------- Exportação por gráfico (CSV, imagem e partilha) ---------- */

function campoCSVtxt(s) { return '"' + String(s ?? '').replace(/"/g, '""') + '"'; }
function numCSV(v) { return round2(v).toFixed(2).replace('.', ','); }

/* Constrói um CSV em pt-PT: separador ';', números com vírgula decimal (abre no Excel) */
function csvDe(cabecalho, linhas) {
  const todas = [cabecalho.map(campoCSVtxt).join(';')];
  linhas.forEach((linha) => {
    todas.push(linha.map((c) => (typeof c === 'number' ? numCSV(c) : campoCSVtxt(c))).join(';'));
  });
  return '\uFEFF' + todas.join('\r\n');
}

function movLinhaCSV(m) { return [m.data, m.tipo, m.valor, m.categoria, m.nota || '']; }

function registarExportador(chave, nome, cabecalho, linhas) {
  exportadores[chave] = { nome, cabecalho, linhas };
}

function barraExportar(chave) {
  return `<div class="exp-barra">
    <button type="button" class="btn-mini" data-exp-csv="${chave}">⬇ CSV</button>
    <button type="button" class="btn-mini" data-exp-img="${chave}">⬇ Imagem</button>
    <button type="button" class="btn-mini" data-exp-part="${chave}">✉ Partilhar</button>
  </div>`;
}

function baixarBlob(nome, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function exportarCSVChave(chave) {
  const e = exportadores[chave];
  if (!e) return;
  baixar(`carteira-${e.nome}-${hojeISO()}.csv`, csvDe(e.cabecalho, e.linhas), 'text/csv');
  aviso('CSV exportado ✓');
}

function svgDoBotao(botao) {
  const cartao = botao.closest('.cartao');
  return cartao ? cartao.querySelector('svg') : null;
}

/* Converte o gráfico SVG num PNG (para inserir no Excel/Word) */
function svgParaBlob(svg) {
  return new Promise((resolve, reject) => {
    const cs = getComputedStyle(document.documentElement);
    const val = (n, alt) => cs.getPropertyValue(n).trim() || alt;
    const clone = svg.cloneNode(true);

    /* Substitui var(--x) por cores concretas (o desenho isolado não vê o CSS da página) */
    const resolver = (s) => s.replace(/var\((--[a-z0-9-]+)\)/gi, (_, n) => val(n, '#000'));
    clone.querySelectorAll('*').forEach((el) => {
      ['fill', 'stroke', 'style'].forEach((at) => {
        const v = el.getAttribute(at);
        if (v && v.includes('var(')) el.setAttribute(at, resolver(v));
      });
    });
    clone.insertAdjacentHTML('afterbegin',
      `<style>
        text{font-family:-apple-system,'Segoe UI',Roboto,sans-serif}
        .svg-rotulo{font-size:9px;fill:${val('--texto2', '#666')}}
        .svg-max{font-size:10px;font-weight:700;fill:${val('--texto2', '#666')}}
        .donut-centro{font-size:15px;font-weight:800;fill:${val('--texto', '#000')}}
        .donut-centro2{font-size:8.5px;fill:${val('--texto2', '#666')}}
      </style>`);

    const vb = (clone.getAttribute('viewBox') || '0 0 320 160').split(/\s+/).map(Number);
    const w = vb[2] || 320, h = vb[3] || 160, escala = 3;
    /* Safari precisa de xmlns e de tamanho explícitos para desenhar o SVG num canvas */
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    clone.setAttribute('width', String(w));
    clone.setAttribute('height', String(h));
    const url = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone));
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = Math.round(w * escala);
      c.height = Math.round(h * escala);
      const x = c.getContext('2d');
      x.fillStyle = val('--cartao', '#ffffff');
      x.fillRect(0, 0, c.width, c.height);
      x.drawImage(img, 0, 0, c.width, c.height);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('png'))), 'image/png');
    };
    img.onerror = () => reject(new Error('svg'));
    img.src = url;
  });
}

async function exportarImagemChave(chave, botao) {
  const e = exportadores[chave];
  const svg = svgDoBotao(botao);
  if (!e || !svg) { aviso('Esta secção não tem gráfico para exportar.'); return; }
  try {
    const blob = await svgParaBlob(svg);
    baixarBlob(`carteira-${e.nome}-${hojeISO()}.png`, blob);
    aviso('Imagem do gráfico exportada ✓');
  } catch (err) {
    console.error(err);
    aviso('Não foi possível criar a imagem.');
  }
}

/* Partilha o CSV (no iPhone abre o menu: Mail, Ficheiros, WhatsApp, ...) */
async function partilharChave(chave) {
  const e = exportadores[chave];
  if (!e) return;
  const csv = csvDe(e.cabecalho, e.linhas);
  const nome = `carteira-${e.nome}-${hojeISO()}.csv`;
  if (navigator.canShare && navigator.canShare({ files: [new File([csv], nome, { type: 'text/csv' })] })) {
    try {
      await navigator.share({ files: [new File([csv], nome, { type: 'text/csv' })], title: nome });
      return;
    } catch (err) {
      if (err && err.name === 'AbortError') return;
    }
  }
  baixar(nome, csv, 'text/csv');
  aviso('Partilha indisponível aqui — CSV descarregado.');
}

/* Lê um CSV (aceita ; ou , e campos entre aspas) */
function parseCSV(texto) {
  texto = String(texto).replace(/^\uFEFF/, '');
  const primeira = texto.split(/\r?\n/)[0] || '';
  const sep = primeira.includes(';') ? ';' : ',';
  const linhas = [];
  let linha = [], campo = '', aspas = false;

  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (aspas) {
      if (ch === '"') {
        if (texto[i + 1] === '"') { campo += '"'; i++; }
        else aspas = false;
      } else campo += ch;
    } else if (ch === '"') {
      aspas = true;
    } else if (ch === sep) {
      linha.push(campo); campo = '';
    } else if (ch === '\n') {
      linha.push(campo); linhas.push(linha); linha = []; campo = '';
    } else if (ch !== '\r') {
      campo += ch;
    }
  }
  linha.push(campo);
  if (linha.some((x) => x.trim() !== '')) linhas.push(linha);
  return linhas;
}

/* Valida e normaliza um movimento vindo de um ficheiro */
function sanearMov(o) {
  if (!o || typeof o !== 'object') return null;
  const tipo = o.tipo === 'gasto' || o.tipo === 'ganho' ? o.tipo : null;
  if (!tipo) return null;
  const valor = typeof o.valor === 'number' ? o.valor : parseValor(o.valor);
  const data = typeof o.data === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(o.data) ? o.data : null;
  if (!(valor > 0) || !data) return null;

  const mov = {
    tipo,
    valor: round2(valor),
    data,
    categoria: String(o.categoria || '').trim() || OUTRO,
    nota: String(o.nota || '').slice(0, 200),
    criado: Number(o.criado) || Date.now()
  };
  if (Number.isInteger(o.id)) mov.id = o.id;
  return mov;
}

async function importarJSON(ficheiro) {
  const texto = await ficheiro.text();
  let obj;
  try { obj = JSON.parse(texto); } catch { aviso('O ficheiro não é um JSON válido.'); return; }

  const movsBrutos = Array.isArray(obj.movimentos) ? obj.movimentos : null;
  if (!movsBrutos) { aviso('JSON não reconhecido (falta a lista "movimentos").'); return; }

  const movs = movsBrutos.map(sanearMov).filter(Boolean);
  const vistos = new Set();
  movs.forEach((m) => { if (m.id !== undefined && vistos.has(m.id)) delete m.id; else if (m.id !== undefined) vistos.add(m.id); });

  let cats = Array.isArray(obj.categorias)
    ? obj.categorias
        .filter((c) => c && typeof c === 'object' && (c.tipo === 'gasto' || c.tipo === 'ganho') && String(c.nome || '').trim())
        .map((c) => ({ nome: String(c.nome).trim(), tipo: c.tipo, ...(Number.isInteger(c.id) ? { id: c.id } : {}) }))
    : [];
  if (!cats.length) cats = padraoCats();

  const recs = Array.isArray(obj.recorrentes)
    ? obj.recorrentes
        .filter((r) => r && typeof r === 'object' && (r.tipo === 'gasto' || r.tipo === 'ganho')
          && Number.isFinite(Number(r.valor)) && Number(r.valor) > 0 && String(r.categoria || '').trim())
        .map((r) => ({
          tipo: r.tipo,
          valor: round2(Number(r.valor)),
          categoria: String(r.categoria).trim(),
          dia: Math.min(31, Math.max(1, parseInt(r.dia, 10) || 1)),
          nota: String(r.nota || '').slice(0, 140),
          inicio: /^\d{4}-\d{2}-\d{2}$/.test(r.inicio) ? r.inicio : hojeISO(),
          ultimo: /^\d{4}-\d{2}-\d{2}$/.test(r.ultimo) ? r.ultimo : null,
          ativo: r.ativo !== false
        }))
    : [];

  if (!confirm(`Substituir todos os dados por ${movs.length} movimento(s) do ficheiro?`)) return;

  await idbSubstituir(movs, cats, recs);
  await carregarDados();
  fecharDef();
  renderAba(estado.aba);
  aviso(`${movs.length} movimento(s) importado(s) ✓`);
}

async function importarCSV(ficheiro) {
  const texto = await ficheiro.text();
  const linhas = parseCSV(texto);
  if (linhas.length < 2) { aviso('O CSV não tem movimentos.'); return; }

  const cabecalho = linhas[0].map((h) => h.trim().toLowerCase());
  const iData = cabecalho.findIndex((h) => h === 'data' || h === 'date');
  const iTipo = cabecalho.findIndex((h) => h === 'tipo' || h === 'type');
  const iVal = cabecalho.findIndex((h) => h === 'valor' || h === 'value');
  const iCat = cabecalho.findIndex((h) => h === 'categoria' || h === 'origem' || h === 'category');
  const iNota = cabecalho.findIndex((h) => h === 'nota' || h === 'note');
  if (iData < 0 || iTipo < 0 || iVal < 0) {
    aviso('CSV precisa das colunas: data, tipo, valor.');
    return;
  }

  let feitos = 0;
  for (let i = 1; i < linhas.length; i++) {
    const l = linhas[i];
    const mov = sanearMov({
      data: (l[iData] || '').trim(),
      tipo: (l[iTipo] || '').trim().toLowerCase(),
      valor: l[iVal],
      categoria: iCat >= 0 ? l[iCat] : '',
      nota: iNota >= 0 ? l[iNota] : ''
    });
    if (mov) {
      await idbAdd('movimentos', mov);
      feitos++;
    }
  }

  await carregarDados();
  fecharDef();
  renderAba(estado.aba);
  aviso(`${feitos} movimento(s) importado(s) ✓`);
}

/* ---------- 9. Arranque ---------- */

/* Registo do Service Worker (usado para procurar atualizações) */
let SW_REG = null;

function registrarSW() {
  if (!('serviceWorker' in navigator)) return;
  const primeiraVez = !navigator.serviceWorker.controller;

  /* Avisa quando a app fica pronta a funcionar offline (1.ª visita) */
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (primeiraVez) aviso('App pronta para funcionar offline ✓');
  });

  navigator.serviceWorker.register('sw.js')
    .then((reg) => {
      SW_REG = reg;
      /* Procura atualizações em cada abertura (só usa rede se houver internet) */
      if (navigator.onLine !== false && reg.update) reg.update().catch(() => {});
      reg.addEventListener('updatefound', () => {
        const nova = reg.installing;
        if (!nova) return;
        nova.addEventListener('statechange', () => {
          const el = $('#upd-nota');
          if (nova.state === 'installed' && navigator.serviceWorker.controller && el) {
            el.textContent = 'Nova versão disponível. Toca em "Procurar atualizações" para instalar.';
          }
        });
      });
    })
    .catch((err) => console.warn('Falha ao registar o Service Worker:', err));
}

/* ---------- 9b. Idioma, orientação e atualização ---------- */

function definirIdioma(l) {
  LANG = l === 'en' ? 'en' : 'pt';
  try { localStorage.setItem('carteira-lang', LANG); } catch (err) { /* sem armazenamento */ }
  criarFormatos();
  aplicarEstaticos();
  if (LANG === 'en') traduzirDOM(document.body);
  if (!$('#def-fundo').hidden) renderDefinicoes();
  mostrarAba(estado.aba);
  aviso(LANG === 'en' ? 'Idioma definido para inglês.' : 'Idioma definido para português.');
}

/* Traduz tudo o que é inserido na página a partir de agora */
let obsIdioma = null;
function iniciarObservadorIdioma() {
  if (typeof MutationObserver === 'undefined' || obsIdioma) return;
  obsIdioma = new MutationObserver((lista) => {
    if (LANG !== 'en') return;
    lista.forEach((mut) => {
      if (mut.type === 'characterData' || mut.type === 'attributes') traduzirNo(mut.target);
      else mut.addedNodes.forEach(traduzirNo);
    });
  });
  obsIdioma.observe(document.body, {
    subtree: true, childList: true, characterData: true, attributes: true,
    attributeFilter: ['placeholder', 'aria-label', 'title']
  });
}

/* Altura real da janela (no iPhone a barra do Safari encurta o ecrã) */
function ajustarAlturaVisual() {
  const vv = window.visualViewport;
  const h = Math.round(vv ? vv.height : (window.innerHeight || 0));
  if (h > 0) document.documentElement.style.setProperty('--vvh', h + 'px');
}

function ligarViewport() {
  ajustarAlturaVisual();
  window.addEventListener('resize', ajustarAlturaVisual);
  window.addEventListener('orientationchange', () => setTimeout(ajustarAlturaVisual, 200));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', ajustarAlturaVisual);
  if (window.screen && screen.orientation && screen.orientation.addEventListener) {
    screen.orientation.addEventListener('change', ajustarAlturaVisual);
  }
}

/* Tenta manter o ecrã em vertical (o manifesto já impõe portrait) */
function travarTela() {
  try {
    if (screen.orientation && typeof screen.orientation.lock === 'function') {
      const r = screen.orientation.lock('portrait');
      if (r && r.catch) r.catch(() => {});
    } else if (screen.lockOrientation) {
      screen.lockOrientation('portrait');
    }
  } catch (err) { /* nem todos os navegadores permitem (ex.: Safari em iPhone) */ }
}

function notaAtualizacao(txt) {
  const el = $('#upd-nota');
  if (el) el.textContent = traduzirTexto(txt);
}

/* Limpa as cópias antigas e volta a carregar os ficheiros mais recentes */
async function atualizarApp() {
  if (!('serviceWorker' in navigator)) { notaAtualizacao('Esta versão não tem atualizações automáticas.'); return; }
  if (navigator.onLine === false) { notaAtualizacao('Sem ligação à internet. Liga-te e tenta outra vez.'); return; }

  notaAtualizacao('A procurar atualizações…');
  try {
    const reg = SW_REG || await navigator.serviceWorker.getRegistration();
    if (reg && reg.update) await reg.update().catch(() => {});
    if (typeof caches !== 'undefined') {
      const temCaches = await caches.keys();
      for (const k of temCaches) if (k.indexOf('carteira') === 0) await caches.delete(k);
    }
    notaAtualizacao('A atualizar…');
    setTimeout(() => location.reload(), 150);
  } catch (err) {
    console.warn(err);
    notaAtualizacao('Não foi possível atualizar. Tenta outra vez.');
  }
}

async function arrancar() {
  aplicarEstaticos();
  await abrirBD();
  await carregarDados();
  const nRec = await gerarRecorrentes();
  if (nRec) await carregarDados();
  bindEventos();
  mostrarAba('gastos');
  iniciarObservadorIdioma();
  if (LANG === 'en') traduzirDOM(document.body);
  ligarViewport();
  travarTela();
  registrarSW();
  pedirPersistencia();
  if (nRec) aviso(`${nRec} movimento(s) recorrente(s) adicionado(s) ✓`);
}

function pedirPersistencia() {
  if (navigator.storage && navigator.storage.persist) {
    navigator.storage.persist()
      .then((ok) => console.log('Armazenamento persistente:', ok))
      .catch(() => {});
  }
}

function bindEventos() {
  $('#btn-add-gasto').addEventListener('click', () => abrirModal('gasto'));
  $('#btn-add-ganho').addEventListener('click', () => abrirModal('ganho'));
  $('#btn-fechar-modal').addEventListener('click', fecharModal);
  $('#modal-fundo').addEventListener('click', (e) => { if (e.target.id === 'modal-fundo') fecharModal(); });
  $('#btn-apagar-mov').addEventListener('click', apagarMovimento);
  $('#form-mov').addEventListener('submit', guardarMovimento);

  /* Origem "Outro" → mostra a caixa de texto (e "＋ Nova origem" → cria) */
  $('#f-origem').addEventListener('change', () => {
    const v = $('#f-origem').value;
    if (v === '__novo__') { criarCatRapida('ganho'); return; }
    const ehOutro = v.toLowerCase() === OUTRO.toLowerCase();
    $('#f-origem-texto').hidden = !ehOutro;
    if (ehOutro) setTimeout(() => $('#f-origem-texto').focus(), 50);
  });

  /* Chips do tipo de gasto dentro do modal */
  $('#chips-categoria').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (!chip) return;
    if (chip.dataset.novo) { criarCatRapida('gasto'); return; }
    modal.cat = chip.dataset.cat;
    renderChipsCat();
  });

  $('#btn-definicoes').addEventListener('click', abrirDef);
  $('#btn-fechar-def').addEventListener('click', fecharDef);
  $('#def-fundo').addEventListener('click', (e) => { if (e.target.id === 'def-fundo') fecharDef(); });

  $('#btn-fechar-detalhe').addEventListener('click', fecharDetalhe);
  $('#detalhe-fundo').addEventListener('click', (e) => { if (e.target.id === 'detalhe-fundo') fecharDetalhe(); });

  /* Painel de filtros do Histórico */
  $('#btn-filtros-hist').addEventListener('click', abrirFiltros);
  $('#btn-fechar-filtros').addEventListener('click', fecharFiltros);
  $('#filtros-fundo').addEventListener('click', (e) => { if (e.target.id === 'filtros-fundo') fecharFiltros(); });
  $('#filtros-conteudo').addEventListener('click', onFiltrosClick);
  $('#filtros-conteudo').addEventListener('change', onFiltrosChange);

  $$('.tab-btn').forEach((b) => b.addEventListener('click', () => mostrarAba(b.dataset.aba)));

  /* Filtro "Dia": aplica logo que se escolhe a data */
  document.addEventListener('change', (e) => {
    if (e.target && /^dia-(gastos|ganhos|balanco)$/.test(e.target.id)) {
      const aba = e.target.id.slice(4);
      estado.dia[aba] = e.target.value || hojeISO();
      renderAba(aba);
    }
  });

  /* Definições (conteúdo recriado dinamicamente → delegação) */
  $('#def-conteudo').addEventListener('click', onDefClick);
  $('#def-conteudo').addEventListener('change', onDefChange);

  /* Clique único para: filtros, histórico e abrir/ver movimentos */
  document.addEventListener('click', (e) => {
    /* Exportação por gráfico/secção (CSV, imagem, partilha) */
    const bCsv = e.target.closest('[data-exp-csv]');
    if (bCsv) { exportarCSVChave(bCsv.dataset.expCsv); return; }
    const bImg = e.target.closest('[data-exp-img]');
    if (bImg) { exportarImagemChave(bImg.dataset.expImg, bImg); return; }
    const bPart = e.target.closest('[data-exp-part]');
    if (bPart) { partilharChave(bPart.dataset.expPart); return; }

    const chipPer = e.target.closest('[data-per]');
    if (chipPer) { estado.periodo[chipPer.dataset.aba] = chipPer.dataset.per; renderAba(chipPer.dataset.aba); return; }

    const ok = e.target.closest('[data-acao="aplicar"]');
    if (ok) { aplicarIntervalo(ok.dataset.aba); return; }

    const okDia = e.target.closest('[data-acao="aplicar-dia"]');
    if (okDia) { aplicarDia(okDia.dataset.aba); return; }

    const chipHist = e.target.closest('[data-hist]');
    if (chipHist) {
      estado.hist = chipHist.dataset.hist;
      podarHistCats();
      renderHistorico();
      return;
    }

    /* Clicar num tipo (legenda do donut ou distribuição do balanço) → detalhe */
    const toca = e.target.closest('[data-dtipo][data-cat]');
    if (toca) { abrirDetalheCat(toca.dataset.dtipo, toca.dataset.cat); return; }

    const linha = e.target.closest('.mov[data-id]');
    if (linha) {
      const m = estado.movs.find((x) => x.id === Number(linha.dataset.id));
      if (m) abrirModal(m.tipo, m);
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { fecharFiltros(); fecharDetalhe(); fecharModal(); fecharDef(); }
  });

  /* Actualiza as cores dos gráficos se o utilizador mudar claro/escuro */
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  if (mq.addEventListener) mq.addEventListener('change', () => renderAba(estado.aba));
}

arrancar().catch((err) => {
  console.error(err);
  document.body.insertAdjacentHTML('afterbegin',
    '<p class="vazio">Erro ao abrir a base de dados local. Tenta reabrir a app.</p>');
});
