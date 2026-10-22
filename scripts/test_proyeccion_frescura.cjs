// Regression test: an already-open session must read corrected Supabase data
// before showing or exporting a payroll projection.
const fs = require('fs');
const vm = require('vm');
const html = require('./fuente_frontend.cjs').html();
function fn(marker) {
  const start = html.indexOf(marker);
  if (start < 0) throw new Error(`Missing ${marker}`);
  const brace = html.indexOf('){', start) + 1;
  let depth = 0;
  for (let i = brace; i < html.length; i++) {
    if (html[i] === '{') depth++;
    else if (html[i] === '}' && --depth === 0) return html.slice(start, i + 1);
  }
  throw new Error(`Unbalanced ${marker}`);
}
// Entire fixture is synthetic: never publish employee identity or medical/payroll data.
const worker = { id: 'worker-fixture', obra_id: 'obra-fixture', no_trab: 999,
  estatus: 'ACTIVO', sal_semanal: 1000 };
const old = { trabajador_id: worker.id, obra_id: worker.obra_id,
  tipo: 'FALTA', monto: 300, semana: 'S26', activo: true, recurrente: false };
const updated = { ...old, tipo: 'INCIDENCIA', monto: 200,
  motivo: 'INCIDENCIA SINTÉTICA PARA PRUEBA' };
const elements = { 'py-prev': { innerHTML: '' }, 'py-btn': { disabled: false } };
let refreshed = 0;
const box = {
  OBRA: { id: worker.obra_id }, WORKERS: [worker], DESC: [old], DIFS: [],
  perDe: () => ({ cve: 'SEMANAL', dias: 7 }),
  descuentoVigenteSemana: () => true,
  difDe: () => 0, redondearCentavos: n => Math.round((n + Number.EPSILON) * 100) / 100,
  fullName: () => 'PERSONA FICTICIA DE PRUEBA', empresaDeTrabajador: () => 'EMPRESA FICTICIA',
  OBRAS: [], ST: Object.fromEntries(['title','sub','head','cellC','cell','money','fin',
    'finMoney','sect','sect2','total','totalMoney'].map(k => [k, {}])),
  buildSheet: rows => { box.exportedRows = rows; return {}; },
  $: id => elements[id], pyPreview: () => { refreshed++;
    elements['py-btn'].disabled = false; }, toast: () => {},
  sb: { from: table => ({ table, select() { return this; }, eq() { return this; } }) },
  fetchAllRows: async query => {
    const { table } = query();
    return { data: table === 'trabajadores' ? [worker] :
      table === 'descuentos' ? [updated] : [], error: null };
  }
};
vm.createContext(box);
vm.runInContext([...['descuentoCorrespondePeriodo','adaptarRetencionPeriodo','retencionesDePeriodo'].map(n=>fn('function '+n+'(')),fn('function descuentosDe('),fn('async function proyLeerFiniquitos('),fn('async function proyCargarHistoricos('), fn('async function pyDatosFrescos('),
  fn('function buildProyWS(')].join('\n'), box);
(async () => {
  const before = +(worker.sal_semanal - box.descuentosDe(worker, 'S26').total).toFixed(2);
  if (before !== 700) throw new Error(`Wrong stale baseline: ${before}`);
  if (!await box.pyDatosFrescos()) throw new Error('Fresh fetch failed');
  const after = +(worker.sal_semanal - box.descuentosDe(worker, 'S26').total).toFixed(2);
  if (after !== 800 || refreshed !== 1)
    throw new Error(`Projection did not refresh: net ${after}, previews ${refreshed}`);
  console.log('OK datos obsoletos $700 → datos nuevos $800');
  const exportData = box.buildProyWS({ titulo: 'Prueba', sub: 'Obra ficticia', pie: '',
    act: box.WORKERS, fins: [], sem: 'S26', colB: 'CONTRATISTA' });
  const row = box.exportedRows.find(r => r[0] === 999);
  if (!row || row[6] !== 1000 || row[7] !== 200 || row[8] !== 800 ||
      exportData.auditoria[0].monto_aplicado !== 800)
    throw new Error(`Excel build did not carry corrected deduction: ${JSON.stringify(row)}`);
  console.log('OK fila de Excel y bitácora usan $800');

  box.fetchAllRows = async query => ({ data: [], error: query().table === 'descuentos'
    ? { message: 'simulated network failure' } : null });
  if (await box.pyDatosFrescos() || !elements['py-btn'].disabled)
    throw new Error('Export was not blocked on refresh failure');
  console.log('OK falla de actualización bloquea Excel obsoleto');
  const reentry={...worker,estatus:'ACTIVO',fecha_baja:'2026-10-05',fecha_reingreso:'2026-10-12'};
  box.fetchAllRows=async build=>({data:build().table==='trabajadores'?[reentry]:[],error:build().table==='historial'?{message:'historial inaccesible'}:null});
  if(await box.pyDatosFrescos()||!elements['py-btn'].disabled||box._PY_FRESCOS!==false)
    throw Error('Falla de historial omitió un finiquito sin bloquear la exportación');
  console.log('OK historial inaccesible bloquea exportación en vez de omitir finiquitos');
})().catch(error => { console.error(error); process.exitCode = 1; });
