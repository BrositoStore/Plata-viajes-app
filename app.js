const STORAGE_KEY = 'plata-viajes-pwa-v4';

const uid = () => Math.random().toString(36).slice(2, 10);
const today = () => new Date().toISOString().slice(0, 10);
const monthKeyNow = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};
const toMonthKey = (date) => String(date || '').slice(0, 7);
const money = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Number(n || 0));
const norm = (v) => String(v || '').trim().toLowerCase();

function lineAmounts(item) {
  const total = Number(item?.cobro || 0);
  let cobrado = item && Object.prototype.hasOwnProperty.call(item, 'cobradoActual')
    ? Number(item.cobradoActual || 0)
    : (item?.pagado ? total : 0);
  if (Number.isNaN(cobrado)) cobrado = 0;
  cobrado = Math.max(0, Math.min(total, cobrado));
  const pendiente = Math.max(0, total - cobrado);
  return {
    total,
    cobrado,
    pendiente,
    estado: pendiente === 0 ? 'Pagado' : cobrado > 0 ? 'Pago parcial' : 'Debe',
  };
}

function normalizeTripLine(item) {
  if (!item) return item;
  const amounts = lineAmounts(item);
  item.cobradoActual = amounts.cobrado;
  item.pagado = amounts.pendiente === 0;
  if (!Array.isArray(item.pagos)) item.pagos = [];
  return item;
}

function normalizeTrip(trip) {
  if (!trip) return trip;
  ['pasajeros', 'pedidosTransferencia', 'pedidosConSobre', 'pedidosProvincia'].forEach((section) => {
    trip[section] = (trip[section] || []).map((item) => normalizeTripLine(item));
  });
  return trip;
}


const emptyTrip = () => ({
  fecha: today(),
  notas: '',
  pasajeros: [],
  pedidosTransferencia: [],
  pedidosConSobre: [],
  pedidosProvincia: [],
  gastos: [],
});

const baseMonth = () => ({
  gastosFijos: [
    { id: uid(), nombre: 'Alquiler local', monto: 0, pagado: false },
    { id: uid(), nombre: 'Alquiler casa', monto: 0, pagado: false },
    { id: uid(), nombre: 'Seguro', monto: 0, pagado: false },
    { id: uid(), nombre: 'Monotributo', monto: 0, pagado: false },
    { id: uid(), nombre: 'Teléfono', monto: 0, pagado: false },
    { id: uid(), nombre: 'Tasa municipal + contadora', monto: 0, pagado: false },
    { id: uid(), nombre: 'ChatGPT', monto: 0, pagado: false },
  ],
  movimientos: [],
});

const initialState = () => {
  const mk = monthKeyNow();
  return {
    currentMonth: mk,
    months: { [mk]: baseMonth() },
    compromisos: [],
    tripExpenseCategories: ['Combustible', 'Peajes', 'Comida', 'Cadetería', 'Cochera', 'Repuestos', 'Otros'],
    clientesFrecuentes: [],
    deudores: [],
    viajeActual: emptyTrip(),
    historialViajes: [],
  };
};

let state = loadState();
normalizeTrip(state.viajeActual);
(state.historialViajes || []).forEach(normalizeTrip);

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw);
    return parsed;
  } catch (e) {
    console.error(e);
    return initialState();
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function ensureMonth(monthKey) {
  if (!state.months[monthKey]) {
    const source = state.months[state.currentMonth] || baseMonth();
    state.months[monthKey] = {
      gastosFijos: (source.gastosFijos || []).map((g) => ({ ...g, id: uid(), pagado: false })),
      movimientos: [],
    };
  }
}

function currentMonthData() {
  ensureMonth(state.currentMonth);
  return state.months[state.currentMonth];
}

function currentTrip() {
  if (!state.viajeActual) state.viajeActual = emptyTrip();
  return state.viajeActual;
}

function setTab(tabName) {
  document.querySelectorAll('.tab').forEach((btn) => btn.classList.toggle('active', btn.dataset.tab === tabName));
  document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.toggle('active', panel.id === `tab-${tabName}`));
}

function statCard(label, value, hint = '') {
  return `<div class="stat"><div class="label">${label}</div><div class="value">${value}</div>${hint ? `<div class="hint">${hint}</div>` : ''}</div>`;
}

function emptyHtml(text) {
  return `<div class="empty">${text}</div>`;
}

function statusBadge(text) {
  return `<span class="badge-status">${text}</span>`;
}

function clientTripSummaryText(clientName, trip = currentTrip()) {
  const groups = buildTripClientSummary(trip);
  const g = groups.find((x) => norm(x.cliente) === norm(clientName));
  if (!g) return `${clientName}: sin datos en este viaje`;
  const detailParts = [];
  if (g.counts.Pasajeros) detailParts.push(`${g.counts.Pasajeros} pasaj.`);
  if (g.counts.Transferencia) detailParts.push(`${g.counts.Transferencia} transf.`);
  if (g.counts.Sobres) detailParts.push(`${g.counts.Sobres} sobres`);
  if (g.counts.Provincia) detailParts.push(`${g.counts.Provincia} prov.`);
  return [
    `Cliente: ${g.cliente}`,
    `Ítems: ${g.totalItems}`,
    `Detalle: ${detailParts.join(' · ') || 'Sin detalle'}`,
    `Facturado: ${money(g.facturado)}`,
    `Cobrado: ${money(g.cobrado)}`,
    `Pendiente: ${money(g.pendiente)}`,
  ].join('\n');
}

function getClientAnalytics(name) {
  const analytics = {
    viajes: 0,
    items: 0,
    facturado: 0,
    cobrado: 0,
    pendienteActual: 0,
  };
  const seenTrips = new Set();
  (state.historialViajes || []).forEach((trip) => {
    ['pasajeros', 'pedidosTransferencia', 'pedidosConSobre', 'pedidosProvincia'].forEach((section) => {
      (trip[section] || []).forEach((rawItem) => {
        const item = normalizeTripLine(rawItem);
        if (norm(item.cliente) !== norm(name)) return;
        const amounts = lineAmounts(item);
        analytics.items += 1;
        analytics.facturado += amounts.total;
        analytics.cobrado += amounts.cobrado;
        if (!seenTrips.has(trip.id)) {
          seenTrips.add(trip.id);
          analytics.viajes += 1;
        }
      });
    });
  });
  (state.deudores || []).forEach((d) => {
    if (norm(d.nombre) === norm(name)) analytics.pendienteActual += Number(d.saldo || 0);
  });
  return analytics;
}

function buildTripClientSummary(trip) {
  const groups = {};
  const sections = [
    ['pasajeros', 'Pasajeros'],
    ['pedidosTransferencia', 'Transferencia'],
    ['pedidosConSobre', 'Sobres'],
    ['pedidosProvincia', 'Provincia'],
  ];
  sections.forEach(([key, label]) => {
    (trip[key] || []).forEach((rawItem) => {
      const item = normalizeTripLine(rawItem);
      const amounts = lineAmounts(item);
      const name = item.cliente || 'Sin nombre';
      if (!groups[name]) {
        groups[name] = {
          cliente: name,
          totalItems: 0,
          counts: { Pasajeros: 0, Transferencia: 0, Sobres: 0, Provincia: 0 },
          facturado: 0,
          cobrado: 0,
          pendiente: 0,
          detalles: [],
        };
      }
      groups[name].totalItems += 1;
      groups[name].counts[label] += 1;
      groups[name].facturado += amounts.total;
      groups[name].cobrado += amounts.cobrado;
      groups[name].pendiente += amounts.pendiente;
      if (item.detalle) groups[name].detalles.push(item.detalle);
    });
  });
  return Object.values(groups).sort((a, b) => b.totalItems - a.totalItems || a.cliente.localeCompare(b.cliente));
}

function generateTripSummaryText(trip) {
  const allLines = [
    ...(trip.pasajeros || []),
    ...(trip.pedidosTransferencia || []),
    ...(trip.pedidosConSobre || []),
    ...(trip.pedidosProvincia || []),
  ].map(normalizeTripLine);
  const totalFacturado = allLines.reduce((a, i) => a + lineAmounts(i).total, 0);
  const totalCobrado = allLines.reduce((a, i) => a + lineAmounts(i).cobrado, 0);
  const totalPendiente = allLines.reduce((a, i) => a + lineAmounts(i).pendiente, 0);
  const totalGastos = (trip.gastos || []).reduce((a, i) => a + Number(i.monto || 0), 0);
  const gananciaContable = totalFacturado - totalGastos;
  const cajaNeta = totalCobrado - totalGastos;
  const groups = buildTripClientSummary(trip);

  const lines = [
    `Fecha: ${trip.fecha || '-'}`,
    trip.notas ? `Notas: ${trip.notas}` : null,
    '',
    `Facturado: ${money(totalFacturado)}`,
    `Cobrado: ${money(totalCobrado)}`,
    `Pendiente: ${money(totalPendiente)}`,
    `Gastos: ${money(totalGastos)}`,
    `Ganancia neta contable: ${money(gananciaContable)}`,
    `Caja neta real: ${money(cajaNeta)}`,
    '',
    'Resumen por cliente:',
    ...groups.map((g) => `- ${g.cliente}: ${g.totalItems} ítems | Facturado ${money(g.facturado)} | Cobrado ${money(g.cobrado)} | Pendiente ${money(g.pendiente)}`),
  ].filter(Boolean);

  return lines.join('\n');
}

function mergeDebtors(existing, incoming) {
  const idx = existing.findIndex((d) => norm(d.nombre) === norm(incoming.nombre));
  if (idx === -1) return [{ ...incoming, id: uid(), historial: incoming.historial || [] }, ...existing];
  const copy = [...existing];
  const current = copy[idx];
  copy[idx] = {
    ...current,
    saldo: Number(current.saldo || 0) + Number(incoming.saldo || 0),
    itemsPendientes: Number(current.itemsPendientes || 0) + Number(incoming.itemsPendientes || 0),
    ultimoViaje: incoming.ultimoViaje || current.ultimoViaje,
    detalle: [current.detalle, incoming.detalle].filter(Boolean).join(' | '),
    historial: [...(incoming.historial || []), ...(current.historial || [])],
  };
  return copy;
}

function render() {
  saveState();
  renderGlobalStats();
  renderPlata();
  renderViajes();
  bindFormDefaults();
}

function renderGlobalStats() {
  const month = currentMonthData();
  const totalFijos = (month.gastosFijos || []).reduce((a, g) => a + Number(g.monto || 0), 0);
  const totalPagadoFijos = (month.gastosFijos || []).filter((g) => g.pagado).reduce((a, g) => a + Number(g.monto || 0), 0);
  const totalIngresos = (month.movimientos || []).filter((m) => m.tipo === 'ingreso').reduce((a, m) => a + Number(m.monto || 0), 0);
  const totalGastos = (month.movimientos || []).filter((m) => m.tipo === 'gasto').reduce((a, m) => a + Number(m.monto || 0), 0);
  const compromisos = (state.compromisos || []).reduce((a, c) => a + (c.tipo === 'saldo' ? Number(c.saldoPendiente || 0) : Number(c.montoCuota || 0) * Number(c.cuotasRestantes || 0)), 0);
  const balanceCaja = totalIngresos - totalGastos - totalPagadoFijos;
  document.getElementById('globalStats').innerHTML = [
    statCard('Gastos fijos', money(totalFijos)),
    statCard('Pagado fijo', money(totalPagadoFijos)),
    statCard('Compromisos pendientes', money(compromisos)),
    statCard('Ingresos del mes', money(totalIngresos)),
    statCard('Balance de caja', money(balanceCaja), 'ingresos - gastos - fijos pagados'),
  ].join('');
}

function renderPlata() {
  const month = currentMonthData();
  document.getElementById('monthPicker').value = state.currentMonth;

  const fixedList = document.getElementById('fixedList');
  fixedList.innerHTML = (month.gastosFijos || []).length ? '' : emptyHtml('No hay gastos fijos cargados.');
  (month.gastosFijos || []).forEach((g) => {
    fixedList.insertAdjacentHTML('beforeend', `
      <div class="row">
        <div>
          <div class="title">${g.nombre || 'Sin nombre'}</div>
          <div class="sub">${money(g.monto)} · ${g.pagado ? 'Pagado' : 'Pendiente'}</div>
        </div>
        <div class="row-actions">
          <button class="secondary small" onclick="toggleFixedPaid('${g.id}')">${g.pagado ? 'Marcar pendiente' : 'Marcar pagado'}</button>
          <button class="secondary small" onclick="editFixed('${g.id}')">Editar</button>
          <button class="secondary small" onclick="removeFixed('${g.id}')">Borrar</button>
        </div>
      </div>
    `);
  });

  const commitmentsList = document.getElementById('commitmentsList');
  commitmentsList.innerHTML = (state.compromisos || []).length ? '' : emptyHtml('No cargaste compromisos todavía.');
  (state.compromisos || []).forEach((c) => {
    const resume = c.tipo === 'saldo' ? `Debés ${money(c.saldoPendiente)}` : `${c.cuotasRestantes} cuotas restantes de ${money(c.montoCuota)}`;
    const history = (c.historial || []).map((h) => `<div class="row"><div><div class="title">${h.texto}</div><div class="sub">${h.fecha}</div></div><div class="amount">${money(h.monto)}</div></div>`).join('');
    commitmentsList.insertAdjacentHTML('beforeend', `
      <div class="card inner">
        <div class="card-body">
          <div class="row">
            <div>
              <div class="title">${c.nombre}</div>
              <div class="sub">${resume}</div>
            </div>
            <div class="row-actions">
              <button class="secondary small" onclick="editCommitment('${c.id}')">Editar</button>
              <button class="secondary small" onclick="registerCommitmentPayment('${c.id}')">Registrar pago</button>
              <button class="secondary small" onclick="removeCommitment('${c.id}')">Borrar</button>
            </div>
          </div>
          ${(c.historial || []).length ? `<div class="stack">${history}</div>` : ''}
        </div>
      </div>
    `);
  });

  const movementsList = document.getElementById('movementsList');
  movementsList.innerHTML = (month.movimientos || []).length ? '' : emptyHtml('No hay movimientos cargados.');
  (month.movimientos || []).forEach((m) => {
    movementsList.insertAdjacentHTML('beforeend', `
      <div class="row">
        <div>
          <div class="title">${m.descripcion || m.categoria}</div>
          <div class="sub">${m.fecha} · ${m.categoria} · ${m.tipo}</div>
        </div>
        <div class="row-actions">
          <div class="amount ${m.tipo === 'ingreso' ? 'good' : 'danger'}">${money(m.monto)}</div>
          <button class="secondary small" onclick="editMovement('${m.id}')">Editar</button>
          <button class="secondary small" onclick="removeMovement('${m.id}')">Borrar</button>
        </div>
      </div>
    `);
  });

  const totalIngresos = (month.movimientos || []).filter((m) => m.tipo === 'ingreso').reduce((a, m) => a + Number(m.monto || 0), 0);
  const totalGastos = (month.movimientos || []).filter((m) => m.tipo === 'gasto').reduce((a, m) => a + Number(m.monto || 0), 0);
  const totalPagadoFijos = (month.gastosFijos || []).filter((g) => g.pagado).reduce((a, g) => a + Number(g.monto || 0), 0);
  const balanceCaja = totalIngresos - totalGastos - totalPagadoFijos;
  document.getElementById('plataSummary').innerHTML = [
    statCard('Total ingresos', money(totalIngresos)),
    statCard('Total gastos', money(totalGastos)),
    statCard('Fijos pagados', money(totalPagadoFijos)),
    statCard('Caja del mes', money(balanceCaja)),
  ].join('');
}

function renderViajes() {
  const trip = currentTrip();
  document.getElementById('tripDate').value = trip.fecha || today();
  document.getElementById('tripNotes').value = trip.notas || '';
  fillClientDatalists();
  fillExpenseCategories();

  const tripSummary = getTripMetrics(trip);
  document.getElementById('tripSummaryStats').innerHTML = [
    statCard('Facturado viaje', money(tripSummary.totalFacturado)),
    statCard('Cobrado viaje', money(tripSummary.totalCobrado)),
    statCard('Pendiente viaje', money(tripSummary.totalPendiente)),
    statCard('Gastos viaje', money(tripSummary.totalGastos)),
    statCard('Ganancia neta contable', money(tripSummary.gananciaContable), 'facturado - gastos'),
    statCard('Caja neta real', money(tripSummary.cajaNetaReal), 'cobrado - gastos'),
  ].join('');

  renderTripSection('pasajeros', 'listPasajeros');
  renderTripSection('pedidosTransferencia', 'listTransfer');
  renderTripSection('pedidosConSobre', 'listSobres');
  renderTripSection('pedidosProvincia', 'listProvincia');

  const tripExpensesList = document.getElementById('tripExpensesList');
  tripExpensesList.innerHTML = (trip.gastos || []).length ? '' : emptyHtml('Sin gastos cargados.');
  (trip.gastos || []).forEach((g) => {
    tripExpensesList.insertAdjacentHTML('beforeend', `
      <div class="row">
        <div>
          <div class="title">${g.categoria}</div>
          <div class="sub">${g.detalle || 'Sin detalle'}</div>
        </div>
        <div class="row-actions">
          <div class="amount">${money(g.monto)}</div>
          <button class="secondary small" onclick="editTripExpense('${g.id}')">Editar</button>
          <button class="secondary small" onclick="removeTripExpense('${g.id}')">Borrar</button>
        </div>
      </div>
    `);
  });

  const categoriesList = document.getElementById('expenseCategoriesList');
  categoriesList.innerHTML = '';
  (state.tripExpenseCategories || []).forEach((cat) => {
    categoriesList.insertAdjacentHTML('beforeend', `<div class="chip">${cat}<button onclick="removeExpenseCategory('${cat.replace(/'/g, "\\'")}')">×</button></div>`);
  });

  const groups = buildTripClientSummary(trip);
  const tripClientsSummary = document.getElementById('tripClientsSummary');
  tripClientsSummary.innerHTML = groups.length ? '' : emptyHtml('Todavía no cargaste clientes en este viaje.');
  groups.forEach((g) => {
    const detailParts = [];
    if (g.counts.Pasajeros) detailParts.push(`${g.counts.Pasajeros} pasaj.`);
    if (g.counts.Transferencia) detailParts.push(`${g.counts.Transferencia} transf.`);
    if (g.counts.Sobres) detailParts.push(`${g.counts.Sobres} sobres`);
    if (g.counts.Provincia) detailParts.push(`${g.counts.Provincia} prov.`);
    const safeName = g.cliente.replace(/'/g, "\\'");
    tripClientsSummary.insertAdjacentHTML('beforeend', `
      <div class="row">
        <div>
          <div class="title">${g.cliente}</div>
          <div class="sub">${detailParts.join(' · ') || 'Sin detalle'} · ${g.totalItems} ítems</div>
          <div class="meta">Cobrado ${money(g.cobrado)} / Pendiente ${money(g.pendiente)}</div>
        </div>
        <div class="row-actions">
          <div class="amount">${money(g.facturado)}</div>
          <button class="secondary small" onclick="copyClientTripSummary('${safeName}')">Copiar</button>
          ${g.pendiente > 0 ? `<button class="secondary small" onclick="setClientPaidStatus('${safeName}', true)">Marcar todo cobrado</button>` : `<button class="secondary small" onclick="setClientPaidStatus('${safeName}', false)">Volver a pendiente</button>`}
        </div>
      </div>
    `);
  });

  document.getElementById('tripAutoSummary').textContent = generateTripSummaryText(trip);

  const tripHistory = document.getElementById('tripHistoryList');
  tripHistory.innerHTML = (state.historialViajes || []).length ? '' : emptyHtml('Todavía no cerraste viajes.');
  (state.historialViajes || []).forEach((v) => {
    tripHistory.insertAdjacentHTML('beforeend', `
      <div class="row">
        <div>
          <div class="title">Viaje ${v.fecha}</div>
          <div class="sub">Facturado ${money(v.totalFacturado)} · Cobrado ${money(v.totalCobrado)} · Pendiente ${money(v.totalPendiente)} · Gastos ${money(v.totalGastosViaje)}</div>
          <div class="meta">${statusBadge(v.estado || 'cerrado')}</div>
        </div>
        <div class="row-actions">
          <div class="amount good">${money(v.cajaNetaReal)}</div>
          <button class="secondary small" onclick="copyTripHistorySummary('${v.id}')">Copiar resumen</button>
          <button class="secondary small" onclick="removeTripHistory('${v.id}')">Borrar</button>
        </div>
      </div>
    `);
  });

  const tripMonthHistory = (state.historialViajes || []).filter((v) => toMonthKey(v.fecha) === state.currentMonth);
  const summary = {
    cantidad: tripMonthHistory.length,
    facturado: tripMonthHistory.reduce((a, v) => a + Number(v.totalFacturado || 0), 0),
    cobrado: tripMonthHistory.reduce((a, v) => a + Number(v.totalCobrado || 0), 0),
    pendiente: tripMonthHistory.reduce((a, v) => a + Number(v.totalPendiente || 0), 0),
    gastos: tripMonthHistory.reduce((a, v) => a + Number(v.totalGastosViaje || 0), 0),
    utilidad: tripMonthHistory.reduce((a, v) => a + Number(v.gananciaContable || 0), 0),
    caja: tripMonthHistory.reduce((a, v) => a + Number(v.cajaNetaReal || 0), 0),
  };
  document.getElementById('tripMonthSummary').innerHTML = [
    statCard('Viajes', String(summary.cantidad)),
    statCard('Facturado', money(summary.facturado)),
    statCard('Cobrado', money(summary.cobrado)),
    statCard('Pendiente', money(summary.pendiente)),
    statCard('Gastos', money(summary.gastos)),
    statCard('Caja neta real', money(summary.caja), 'cobrado - gastos'),
    statCard('Ganancia neta contable', money(summary.utilidad), 'facturado - gastos'),
    statCard('Diferencia pendiente', money(summary.utilidad - summary.caja), 'ganancia todavía no cobrada'),
  ].join('');

  renderClients();
  renderDebtors();
}

function renderTripSection(sectionKey, targetId) {
  const list = document.getElementById(targetId);
  const trip = currentTrip();
  const items = trip[sectionKey] || [];
  list.innerHTML = items.length ? '' : emptyHtml('Sin cargar.');
  items.forEach((rawItem) => {
    const item = normalizeTripLine(rawItem);
    const amounts = lineAmounts(item);
    list.insertAdjacentHTML('beforeend', `
      <div class="row">
        <div>
          <div class="title">${item.cliente || 'Sin cliente'}</div>
          <div class="sub">${item.detalle || 'Sin detalle'}</div>
          <div class="meta">${amounts.estado} · Cobrado ${money(amounts.cobrado)} / Pendiente ${money(amounts.pendiente)}</div>
        </div>
        <div class="row-actions">
          <div class="amount ${amounts.pendiente === 0 ? 'good' : amounts.cobrado > 0 ? '' : 'danger'}">${money(amounts.total)}</div>
          ${amounts.pendiente > 0 ? `<button class="secondary small" onclick="registerTripItemPayment('${sectionKey}','${item.id}')">Registrar pago</button>` : `<button class="secondary small" onclick="resetTripItemPayment('${sectionKey}','${item.id}')">Volver a pendiente</button>`}
          <button class="secondary small" onclick="editTripLine('${sectionKey}','${item.id}')">Editar</button>
          <button class="secondary small" onclick="removeTripItem('${sectionKey}','${item.id}')">Borrar</button>
        </div>
      </div>
    `);
  });
}

function renderClients() {
  const q = norm(document.getElementById('clientSearch').value);
  const list = document.getElementById('clientsList');
  const clients = (state.clientesFrecuentes || []).filter((c) => !q || [c.nombre, c.telefono, c.notas].join(' ').toLowerCase().includes(q));
  list.innerHTML = clients.length ? '' : emptyHtml('No hay clientes cargados.');
  clients.forEach((c) => {
    const stats = getClientAnalytics(c.nombre);
    list.insertAdjacentHTML('beforeend', `
      <div class="row">
        <div>
          <div class="title">${c.nombre}</div>
          <div class="sub">${c.telefono || 'Sin teléfono'}${c.notas ? ` · ${c.notas}` : ''}</div>
          <div class="meta">Viajes: ${stats.viajes} · Ítems: ${stats.items} · Facturado: ${money(stats.facturado)} · Debe hoy: ${money(stats.pendienteActual)}</div>
        </div>
        <div class="row-actions">
          <button class="secondary small" onclick="copyClientHistorySummary('${c.id}')">Copiar ficha</button>
          <button class="secondary small" onclick="editClient('${c.id}')">Editar</button>
          <button class="secondary small" onclick="removeClient('${c.id}')">Borrar</button>
        </div>
      </div>
    `);
  });
}

function renderDebtors() {
  const q = norm(document.getElementById('debtorSearch')?.value || '');
  const list = document.getElementById('debtorsList');
  const debtors = (state.deudores || []).filter((d) => !q || [d.nombre, d.detalle].join(' ').toLowerCase().includes(q));
  list.innerHTML = debtors.length ? '' : emptyHtml('No hay deudores activos.');
  debtors.forEach((d) => {
    const history = (d.historial || []).map((h) => `
      <div class="row">
        <div>
          <div class="title">${h.texto}</div>
          <div class="sub">${h.fecha}</div>
        </div>
        <div class="amount">${money(h.monto)}</div>
      </div>
    `).join('');
    list.insertAdjacentHTML('beforeend', `
      <div class="card inner">
        <div class="card-body">
          <div class="row">
            <div>
              <div class="title">${d.nombre}</div>
              <div class="sub">Saldo ${money(d.saldo)} · Ítems ${d.itemsPendientes || 1}</div>
              <div class="meta">Último movimiento: ${d.ultimoViaje || '-'}${d.detalle ? ` · ${d.detalle}` : ''}</div>
            </div>
            <div class="row-actions">
              <button class="secondary small" onclick="editDebtor('${d.id}')">Editar</button>
              <button class="secondary small" onclick="payDebtor('${d.id}')">Registrar pago</button>
              <button class="secondary small" onclick="removeDebtor('${d.id}')">Borrar</button>
            </div>
          </div>
          ${history ? `<div class="stack">${history}</div>` : ''}
        </div>
      </div>
    `);
  });
}

function getTripMetrics(trip) {
  const allLines = [
    ...(trip.pasajeros || []),
    ...(trip.pedidosTransferencia || []),
    ...(trip.pedidosConSobre || []),
    ...(trip.pedidosProvincia || []),
  ].map(normalizeTripLine);
  const totalFacturado = allLines.reduce((a, i) => a + lineAmounts(i).total, 0);
  const totalCobrado = allLines.reduce((a, i) => a + lineAmounts(i).cobrado, 0);
  const totalPendiente = allLines.reduce((a, i) => a + lineAmounts(i).pendiente, 0);
  const totalGastos = (trip.gastos || []).reduce((a, g) => a + Number(g.monto || 0), 0);
  return {
    totalFacturado,
    totalCobrado,
    totalPendiente,
    totalGastos,
    gananciaContable: totalFacturado - totalGastos,
    cajaNetaReal: totalCobrado - totalGastos,
  };
}

function fillClientDatalists() {
  document.querySelectorAll('datalist[id^="clientList"]').forEach((dl) => {
    dl.innerHTML = (state.clientesFrecuentes || []).map((c) => `<option value="${escapeHtml(c.nombre)}"></option>`).join('');
  });
}

function fillExpenseCategories() {
  const select = document.getElementById('tripExpenseCategorySelect');
  select.innerHTML = (state.tripExpenseCategories || []).map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function bindFormDefaults() {
  const movementDate = document.querySelector('#movementForm [name="fecha"]');
  if (movementDate && !movementDate.value) movementDate.value = today();
}

function addFixed() {
  currentMonthData().gastosFijos.push({ id: uid(), nombre: 'Nuevo gasto', monto: 0, pagado: false });
  render();
}
function toggleFixedPaid(id) {
  const item = currentMonthData().gastosFijos.find((g) => g.id === id);
  if (!item) return;
  item.pagado = !item.pagado;
  render();
}
function editFixed(id) {
  const item = currentMonthData().gastosFijos.find((g) => g.id === id);
  if (!item) return;
  const nombre = prompt('Nombre del gasto fijo:', item.nombre);
  if (nombre === null) return;
  const monto = prompt('Monto del gasto fijo:', item.monto);
  if (monto === null) return;
  item.nombre = nombre.trim();
  item.monto = Number(monto || 0);
  render();
}
function removeFixed(id) {
  currentMonthData().gastosFijos = currentMonthData().gastosFijos.filter((g) => g.id !== id);
  render();
}

function addCommitmentFromForm(ev) {
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const tipo = fd.get('tipo');
  const nombre = String(fd.get('nombre') || '').trim();
  if (!nombre) return;
  if (tipo === 'saldo') {
    const saldoPendiente = Number(fd.get('saldoPendiente') || 0);
    if (!saldoPendiente) return;
    state.compromisos.unshift({ id: uid(), tipo, nombre, saldoPendiente, historial: [] });
  } else {
    const montoCuota = Number(fd.get('montoCuota') || 0);
    const cuotasRestantes = Number(fd.get('cuotasRestantes') || 0);
    if (!montoCuota || !cuotasRestantes) return;
    state.compromisos.unshift({ id: uid(), tipo, nombre, montoCuota, cuotasRestantes, historial: [] });
  }
  ev.target.reset();
  render();
}
function editCommitment(id) {
  const c = state.compromisos.find((x) => x.id === id);
  if (!c) return;
  const nombre = prompt('Nombre:', c.nombre);
  if (nombre === null) return;
  c.nombre = nombre.trim();
  if (c.tipo === 'saldo') {
    const saldo = prompt('Saldo pendiente:', c.saldoPendiente);
    if (saldo === null) return;
    c.saldoPendiente = Number(saldo || 0);
  } else {
    const monto = prompt('Monto de cuota:', c.montoCuota);
    if (monto === null) return;
    const cuotas = prompt('Cuotas restantes:', c.cuotasRestantes);
    if (cuotas === null) return;
    c.montoCuota = Number(monto || 0);
    c.cuotasRestantes = Number(cuotas || 0);
  }
  render();
}
function registerCommitmentPayment(id) {
  const c = state.compromisos.find((x) => x.id === id);
  if (!c) return;
  if (c.tipo === 'saldo') {
    const monto = prompt('Monto entregado:', '0');
    if (monto === null) return;
    const m = Number(monto || 0);
    c.saldoPendiente = Math.max(0, Number(c.saldoPendiente || 0) - m);
    c.historial.unshift({ id: uid(), fecha: today(), monto: m, texto: 'Pago registrado' });
  } else {
    const cuotasPagadas = prompt('Cuotas pagadas:', '1');
    if (cuotasPagadas === null) return;
    const q = Math.max(1, Number(cuotasPagadas || 1));
    const monto = prompt('Monto pagado (vacío = cuota x cantidad):', '');
    if (monto === null) return;
    const m = Number(monto || 0) || Number(c.montoCuota || 0) * q;
    c.cuotasRestantes = Math.max(0, Number(c.cuotasRestantes || 0) - q);
    c.historial.unshift({ id: uid(), fecha: today(), monto: m, texto: `${q} cuota${q > 1 ? 's' : ''} pagada${q > 1 ? 's' : ''}` });
  }
  render();
}
function removeCommitment(id) {
  state.compromisos = state.compromisos.filter((x) => x.id !== id);
  render();
}

function addMovementFromForm(ev) {
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const entry = {
    id: uid(),
    fecha: fd.get('fecha') || today(),
    tipo: fd.get('tipo') || 'gasto',
    categoria: String(fd.get('categoria') || '').trim(),
    descripcion: String(fd.get('descripcion') || '').trim(),
    monto: Number(fd.get('monto') || 0),
  };
  if (!entry.categoria || !entry.monto) return;
  currentMonthData().movimientos.unshift(entry);
  ev.target.reset();
  document.querySelector('#movementForm [name="fecha"]').value = today();
  render();
}
function editMovement(id) {
  const m = currentMonthData().movimientos.find((x) => x.id === id);
  if (!m) return;
  const fecha = prompt('Fecha (AAAA-MM-DD):', m.fecha);
  if (fecha === null) return;
  const tipo = prompt('Tipo (gasto o ingreso):', m.tipo);
  if (tipo === null) return;
  const categoria = prompt('Categoría:', m.categoria);
  if (categoria === null) return;
  const descripcion = prompt('Descripción:', m.descripcion || '');
  if (descripcion === null) return;
  const monto = prompt('Monto:', m.monto);
  if (monto === null) return;
  Object.assign(m, { fecha, tipo, categoria, descripcion, monto: Number(monto || 0) });
  render();
}
function removeMovement(id) {
  currentMonthData().movimientos = currentMonthData().movimientos.filter((x) => x.id !== id);
  render();
}

function addTripLineFromForm(ev) {
  ev.preventDefault();
  const section = ev.target.dataset.section;
  const fd = new FormData(ev.target);
  const cobro = Number(fd.get('cobro') || 0);
  const cobradoInicial = Math.max(0, Math.min(Number(fd.get('cobradoInicial') || 0), cobro));
  const item = normalizeTripLine({
    id: uid(),
    cliente: String(fd.get('cliente') || '').trim(),
    detalle: String(fd.get('detalle') || '').trim(),
    cobro,
    cobradoActual: cobradoInicial,
    pagos: cobradoInicial > 0 ? [{ id: uid(), fecha: today(), monto: cobradoInicial, texto: cobradoInicial >= cobro ? 'Pago inicial completo' : 'Pago inicial parcial' }] : [],
  });
  if (!item.cliente && !item.detalle) return;
  currentTrip()[section].unshift(item);
  if (item.cliente && !(state.clientesFrecuentes || []).some((c) => norm(c.nombre) === norm(item.cliente))) {
    state.clientesFrecuentes.unshift({ id: uid(), nombre: item.cliente, telefono: '', notas: '' });
  }
  ev.target.reset();
  render();
}
function editTripLine(section, id) {
  const item = currentTrip()[section].find((x) => x.id === id);
  if (!item) return;
  normalizeTripLine(item);
  const cliente = prompt('Cliente:', item.cliente || '');
  if (cliente === null) return;
  const detalle = prompt('Detalle:', item.detalle || '');
  if (detalle === null) return;
  const cobro = prompt('Total a cobrar:', item.cobro);
  if (cobro === null) return;
  const cobradoActual = prompt('Ya cobrado en este viaje:', item.cobradoActual || 0);
  if (cobradoActual === null) return;
  item.cliente = cliente.trim();
  item.detalle = detalle.trim();
  item.cobro = Number(cobro || 0);
  item.cobradoActual = Math.max(0, Math.min(Number(cobradoActual || 0), Number(item.cobro || 0)));
  item.pagado = item.cobradoActual >= item.cobro;
  if (item.cliente && !(state.clientesFrecuentes || []).some((c) => norm(c.nombre) === norm(item.cliente))) {
    state.clientesFrecuentes.unshift({ id: uid(), nombre: item.cliente, telefono: '', notas: '' });
  }
  render();
}
function registerTripItemPayment(section, id) {
  const item = currentTrip()[section].find((x) => x.id === id);
  if (!item) return;
  normalizeTripLine(item);
  const amounts = lineAmounts(item);
  const amount = prompt(`Monto que pagó ahora:
Pendiente actual: ${money(amounts.pendiente)}`, String(amounts.pendiente));
  if (amount === null) return;
  const m = Number(amount || 0);
  if (!m) return;
  const aplicado = Math.max(0, Math.min(m, amounts.pendiente));
  item.cobradoActual = amounts.cobrado + aplicado;
  item.pagado = item.cobradoActual >= item.cobro;
  item.pagos.unshift({ id: uid(), fecha: today(), monto: aplicado, texto: 'Pago durante viaje' });
  render();
}
function resetTripItemPayment(section, id) {
  const item = currentTrip()[section].find((x) => x.id === id);
  if (!item) return;
  if (!confirm('¿Volver este registro a pendiente y resetear lo cobrado en el viaje?')) return;
  item.cobradoActual = 0;
  item.pagado = false;
  item.pagos = [];
  render();
}
function toggleTripItemPaid(section, id) {
  const item = currentTrip()[section].find((x) => x.id === id);
  if (!item) return;
  normalizeTripLine(item);
  const amounts = lineAmounts(item);
  if (amounts.pendiente > 0) {
    item.cobradoActual = amounts.total;
    item.pagado = true;
  } else {
    item.cobradoActual = 0;
    item.pagado = false;
  }
  render();
}
function removeTripItem(section, id) {
  currentTrip()[section] = currentTrip()[section].filter((x) => x.id !== id);
  render();
}

function addTripExpenseFromForm(ev) {
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const item = {
    id: uid(),
    categoria: String(fd.get('categoria') || '').trim(),
    detalle: String(fd.get('detalle') || '').trim(),
    monto: Number(fd.get('monto') || 0),
  };
  if (!item.categoria || !item.monto) return;
  currentTrip().gastos.unshift(item);
  ev.target.reset();
  render();
}
function editTripExpense(id) {
  const item = currentTrip().gastos.find((x) => x.id === id);
  if (!item) return;
  const categoria = prompt('Categoría:', item.categoria);
  if (categoria === null) return;
  const detalle = prompt('Detalle:', item.detalle || '');
  if (detalle === null) return;
  const monto = prompt('Monto:', item.monto);
  if (monto === null) return;
  Object.assign(item, { categoria: categoria.trim(), detalle: detalle.trim(), monto: Number(monto || 0) });
  if (categoria.trim() && !(state.tripExpenseCategories || []).includes(categoria.trim())) state.tripExpenseCategories.push(categoria.trim());
  render();
}
function removeTripExpense(id) {
  currentTrip().gastos = currentTrip().gastos.filter((x) => x.id !== id);
  render();
}
function addExpenseCategory() {
  const input = document.getElementById('newExpenseCategory');
  const val = String(input.value || '').trim();
  if (!val) return;
  if (!(state.tripExpenseCategories || []).includes(val)) state.tripExpenseCategories.push(val);
  input.value = '';
  render();
}
function removeExpenseCategory(name) {
  state.tripExpenseCategories = (state.tripExpenseCategories || []).filter((c) => c !== name);
  render();
}

function addClientFromForm(ev) {
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const nombre = String(fd.get('nombre') || '').trim();
  if (!nombre) return;
  if ((state.clientesFrecuentes || []).some((c) => norm(c.nombre) === norm(nombre))) return;
  state.clientesFrecuentes.unshift({ id: uid(), nombre, telefono: String(fd.get('telefono') || '').trim(), notas: String(fd.get('notas') || '').trim() });
  ev.target.reset();
  render();
}
function editClient(id) {
  const c = (state.clientesFrecuentes || []).find((x) => x.id === id);
  if (!c) return;
  const nombre = prompt('Nombre:', c.nombre);
  if (nombre === null) return;
  const telefono = prompt('Teléfono:', c.telefono || '');
  if (telefono === null) return;
  const notas = prompt('Notas:', c.notas || '');
  if (notas === null) return;
  Object.assign(c, { nombre: nombre.trim(), telefono: telefono.trim(), notas: notas.trim() });
  render();
}
function removeClient(id) {
  state.clientesFrecuentes = (state.clientesFrecuentes || []).filter((x) => x.id !== id);
  render();
}

function addManualDebtorFromForm(ev) {
  ev.preventDefault();
  const fd = new FormData(ev.target);
  const nombre = String(fd.get('nombre') || '').trim();
  const saldo = Number(fd.get('saldo') || 0);
  const detalle = String(fd.get('detalle') || '').trim();
  if (!nombre || !saldo) return;
  state.deudores = mergeDebtors(state.deudores || [], {
    nombre,
    saldo,
    itemsPendientes: 1,
    ultimoViaje: today(),
    detalle,
    historial: [{ id: uid(), fecha: today(), monto: saldo, texto: 'Alta manual' }],
  });
  ev.target.reset();
  render();
}
function editDebtor(id) {
  const d = (state.deudores || []).find((x) => x.id === id);
  if (!d) return;
  const nombre = prompt('Nombre:', d.nombre);
  if (nombre === null) return;
  const saldo = prompt('Saldo:', d.saldo);
  if (saldo === null) return;
  const items = prompt('Ítems pendientes:', d.itemsPendientes || 1);
  if (items === null) return;
  const detalle = prompt('Detalle:', d.detalle || '');
  if (detalle === null) return;
  Object.assign(d, { nombre: nombre.trim(), saldo: Number(saldo || 0), itemsPendientes: Number(items || 1), detalle: detalle.trim() });
  render();
}
function payDebtor(id) {
  const d = (state.deudores || []).find((x) => x.id === id);
  if (!d) return;
  const amount = prompt('Monto que pagó:', '0');
  if (amount === null) return;
  const m = Number(amount || 0);
  d.saldo = Math.max(0, Number(d.saldo || 0) - m);
  d.historial.unshift({ id: uid(), fecha: today(), monto: m, texto: 'Pago registrado' });
  state.deudores = state.deudores.filter((x) => Number(x.saldo || 0) > 0);
  render();
}
function removeDebtor(id) {
  state.deudores = (state.deudores || []).filter((x) => x.id !== id);
  render();
}

function closeTrip() {
  const trip = currentTrip();
  const metrics = getTripMetrics(trip);
  const preview = [
    `Fecha: ${trip.fecha}`,
    `Facturado: ${money(metrics.totalFacturado)}`,
    `Cobrado: ${money(metrics.totalCobrado)}`,
    `Pendiente: ${money(metrics.totalPendiente)}`,
    `Gastos: ${money(metrics.totalGastos)}`,
    `Ganancia contable: ${money(metrics.gananciaContable)}`,
    `Caja neta real: ${money(metrics.cajaNetaReal)}`,
    '',
    '¿Cerrar viaje con estos datos?'
  ].join('\n');
  if (!confirm(preview)) return;
  const allDebtLines = [
    ...(trip.pasajeros || []).map((i) => ({ ...i, origen: 'Pasajero' })),
    ...(trip.pedidosTransferencia || []).map((i) => ({ ...i, origen: 'Transferencia' })),
    ...(trip.pedidosConSobre || []).map((i) => ({ ...i, origen: 'Sobre' })),
    ...(trip.pedidosProvincia || []).map((i) => ({ ...i, origen: 'Provincia' })),
  ].map((i) => ({ ...normalizeTripLine(i), __amounts: lineAmounts(i) })).filter((i) => i.__amounts.pendiente > 0);

  const summaryText = generateTripSummaryText(trip);
  const estado = metrics.totalPendiente > 0 ? 'cerrado con deuda' : 'cerrado completo';
  const closedTrip = {
    ...JSON.parse(JSON.stringify(trip)),
    id: uid(),
    cerradoEn: new Date().toISOString(),
    estado,
    totalFacturado: metrics.totalFacturado,
    totalCobrado: metrics.totalCobrado,
    totalPendiente: metrics.totalPendiente,
    totalGastosViaje: metrics.totalGastos,
    gananciaContable: metrics.gananciaContable,
    cajaNetaReal: metrics.cajaNetaReal,
    summaryText,
  };

  let debtors = [...(state.deudores || [])];
  allDebtLines.forEach((i) => {
    debtors = mergeDebtors(debtors, {
      nombre: i.cliente || 'Sin nombre',
      saldo: Number(i.__amounts.pendiente || 0),
      itemsPendientes: 1,
      ultimoViaje: trip.fecha,
      detalle: `${i.origen}${i.detalle ? ` · ${i.detalle}` : ''}`,
      historial: [{ id: uid(), fecha: today(), monto: Number(i.__amounts.pendiente || 0), texto: `Sumado desde viaje ${trip.fecha}` }],
    });
  });

  state.deudores = debtors;
  state.historialViajes.unshift(closedTrip);
  currentMonthData().movimientos.unshift({
    id: uid(),
    fecha: today(),
    tipo: 'ingreso',
    categoria: 'Caja neta viaje',
    descripcion: `Viaje ${trip.fecha}`,
    monto: metrics.cajaNetaReal,
  });
  state.viajeActual = emptyTrip();
  render();
}

function copyTripSummary() {
  navigator.clipboard.writeText(generateTripSummaryText(currentTrip())).then(() => alert('Resumen copiado.'));
}
function copyTripHistorySummary(id) {
  const trip = (state.historialViajes || []).find((x) => x.id === id);
  if (!trip) return;
  navigator.clipboard.writeText(trip.summaryText || '').then(() => alert('Resumen copiado.'));
}
function removeTripHistory(id) {
  state.historialViajes = (state.historialViajes || []).filter((x) => x.id !== id);
  render();
}

function backupData() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  const stamp = new Date().toISOString().replace(/[:.]/g,'-');
  link.download = `backup-plata-viajes-${state.currentMonth}-${stamp}.json`;
  link.click();
}
function importData(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state = JSON.parse(String(reader.result));
      render();
      alert('Backup importado.');
    } catch {
      alert('No se pudo importar el backup.');
    }
  };
  reader.readAsText(file);
}


function setClientPaidStatus(clientName, paid) {
  const trip = currentTrip();
  ['pasajeros', 'pedidosTransferencia', 'pedidosConSobre', 'pedidosProvincia'].forEach((section) => {
    (trip[section] || []).forEach((item) => {
      if (norm(item.cliente) === norm(clientName)) {
        normalizeTripLine(item);
        item.cobradoActual = paid ? Number(item.cobro || 0) : 0;
        item.pagado = !!paid;
      }
    });
  });
  render();
}

function copyClientTripSummary(clientName) {
  const text = clientTripSummaryText(clientName);
  navigator.clipboard.writeText(text).then(() => alert('Resumen del cliente copiado.'));
}

function copyClientHistorySummary(id) {
  const c = (state.clientesFrecuentes || []).find((x) => x.id === id);
  if (!c) return;
  const stats = getClientAnalytics(c.nombre);
  const text = [
    `Cliente: ${c.nombre}`,
    `Teléfono: ${c.telefono || '-'}`,
    `Notas: ${c.notas || '-'}`,
    `Viajes registrados: ${stats.viajes}`,
    `Ítems registrados: ${stats.items}`,
    `Facturado histórico: ${money(stats.facturado)}`,
    `Cobrado histórico: ${money(stats.cobrado)}`,
    `Saldo activo actual: ${money(stats.pendienteActual)}`,
  ].join('\n');
  navigator.clipboard.writeText(text).then(() => alert('Ficha del cliente copiada.'));
}

function wireEvents() {
  document.querySelectorAll('.tab').forEach((btn) => btn.addEventListener('click', () => setTab(btn.dataset.tab)));
  document.getElementById('nextMonthBtn').addEventListener('click', () => {
    const [y, m] = state.currentMonth.split('-').map(Number);
    const d = new Date(y, m, 1);
    state.currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    ensureMonth(state.currentMonth);
    render();
  });
  document.getElementById('monthPicker').addEventListener('change', (e) => {
    state.currentMonth = e.target.value;
    ensureMonth(state.currentMonth);
    render();
  });
  document.getElementById('backupBtn').addEventListener('click', backupData);
  document.getElementById('importInput').addEventListener('change', (e) => importData(e.target.files?.[0]));

  document.getElementById('addFixedBtn').addEventListener('click', addFixed);
  document.getElementById('commitmentForm').addEventListener('submit', addCommitmentFromForm);
  document.getElementById('movementForm').addEventListener('submit', addMovementFromForm);

  document.querySelectorAll('.trip-line-form').forEach((form) => form.addEventListener('submit', addTripLineFromForm));
  document.getElementById('tripExpenseForm').addEventListener('submit', addTripExpenseFromForm);
  document.getElementById('addExpenseCategoryBtn').addEventListener('click', addExpenseCategory);
  document.getElementById('tripDate').addEventListener('change', (e) => { currentTrip().fecha = e.target.value; render(); });
  document.getElementById('tripNotes').addEventListener('input', (e) => { currentTrip().notas = e.target.value; render(); });
  document.getElementById('closeTripBtn').addEventListener('click', closeTrip);
  document.getElementById('copyTripSummaryBtn').addEventListener('click', copyTripSummary);

  document.getElementById('clientForm').addEventListener('submit', addClientFromForm);
  document.getElementById('clientSearch').addEventListener('input', render);
  const debtorSearch = document.getElementById('debtorSearch');
  if (debtorSearch) debtorSearch.addEventListener('input', render);
  document.getElementById('manualDebtorForm').addEventListener('submit', addManualDebtorFromForm);
}

window.toggleFixedPaid = toggleFixedPaid;
window.editFixed = editFixed;
window.removeFixed = removeFixed;
window.editCommitment = editCommitment;
window.registerCommitmentPayment = registerCommitmentPayment;
window.removeCommitment = removeCommitment;
window.editMovement = editMovement;
window.removeMovement = removeMovement;
window.toggleTripItemPaid = toggleTripItemPaid;
window.registerTripItemPayment = registerTripItemPayment;
window.resetTripItemPayment = resetTripItemPayment;
window.editTripLine = editTripLine;
window.removeTripItem = removeTripItem;
window.editTripExpense = editTripExpense;
window.removeTripExpense = removeTripExpense;
window.removeExpenseCategory = removeExpenseCategory;
window.editClient = editClient;
window.removeClient = removeClient;
window.editDebtor = editDebtor;
window.payDebtor = payDebtor;
window.removeDebtor = removeDebtor;
window.setClientPaidStatus = setClientPaidStatus;
window.copyClientTripSummary = copyClientTripSummary;
window.copyClientHistorySummary = copyClientHistorySummary;
window.copyTripHistorySummary = copyTripHistorySummary;
window.removeTripHistory = removeTripHistory;

wireEvents();
render();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./service-worker.js').catch(console.error));
}
