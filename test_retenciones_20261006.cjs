const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
const begin = html.indexOf('function retFecha(');
const end = html.indexOf('/* ---------- DESCUENTOS ---------- */', begin);
assert(begin > 0 && end > begin, 'No se encontró el bloque real de cálculo');
const context = {
  Date, Math, Number, String, parseInt,
  PERIODOS: { SEMANAL: { dias: 7 }, QUINCENAL: { dias: 15 } },
  periodoPago: w => w.periodo_pago,
  isoWeek: () => 41,
  semRange: n => n === 40 ? ['2026-09-28', '2026-10-04'] : ['2026-10-05', '2026-10-11'],
  redondearCentavos: n => Math.round((n + Number.EPSILON) * 100) / 100,
  retencionInfonavitDesdeAviso: (_d, _w, dias, fecha) => dias * (fecha.getUTCMonth() === 9 ? 10 : 11),
  fechaFinSemanaISO: () => new Date('2026-10-11T12:00:00Z'),
  money: n => Number(n).toFixed(2),
  FISC: () => ({ sm: 315.04 }),
};
vm.createContext(context);
vm.runInContext(html.slice(begin, end), context);
const c = context;
const semanal = { periodo_pago: 'SEMANAL', sd: 400 };
const quincenal = { periodo_pago: 'QUINCENAL', sd: 400 };
const f = { tipo: 'FONACOT', cuota_mensual: 3100, monto: 700, periodicidad: 'SEMANAL', fonacot_prorrateo: 'DIAS_CALENDARIO' };

assert.equal(c.cuotaFonacotCalendario(3100, '2026-10-01', '2026-10-07'), 700);
assert.equal(c.cuotaFonacotCalendario(3100, '2026-09-28', '2026-10-04'), 710);
assert.equal(c.cuotaFonacotCalendario(2900, '2028-02-01', '2028-02-29'), 2900);
assert.equal(c.montoDescuento(f, { dias: 7 }, 'S40', semanal), 710);
assert.equal(c.montoDescuento({ ...f, fonacot_prorrateo: 'IMPORTE_CAPTURADO' }, { dias: 7 }, 'S40', semanal), 700);
assert.equal(c.montoDescuento({ ...f, fonacot_prorrateo_desde: '2026-10-05' }, { dias: 7 }, 'S40', semanal), 700);

const [firstStart, firstEnd] = ['2026-10-01', '2026-10-15'];
const first = c.cuotaFonacotCalendario(3100, firstStart, firstEnd);
const second = c.cuotaFonacotCalendario(3100, '2026-10-16', '2026-10-31');
assert.equal(first, 1500);
assert.equal(second, 1600);
assert.equal(first + second, 3100);
for (const cuota of [2800.80, 1527, 1896, 1764.48]) {
  const uno = c.cuotaFonacotCalendario(cuota, '2026-10-01', '2026-10-15');
  const dos = c.cuotaFonacotCalendario(cuota, '2026-10-16', '2026-10-31');
  assert.equal(Math.round((uno + dos) * 100) / 100, cuota);
  const semanas = [
    ['2026-10-01', '2026-10-04'], ['2026-10-05', '2026-10-11'],
    ['2026-10-12', '2026-10-18'], ['2026-10-19', '2026-10-25'],
    ['2026-10-26', '2026-10-31'],
  ];
  const acumulado = semanas.reduce((s, [ini, fin]) => s + c.cuotaFonacotCalendario(cuota, ini, fin), 0);
  assert.equal(Math.round(acumulado * 100) / 100, cuota);
}
assert.equal(c.rangoRetencion(quincenal, 'S41')[0], '2026-10-01');
assert.equal(c.retencionDiasExtra(f, semanal, '2026-10-01', 4), 400);

const adjusted = {
  ...f,
  ajustes_semana: { S41: { importe_base: 50, dias_extra_desde: '2026-10-01', dias_extra: 4 } },
};
assert.equal(c.retencionEvaluada(adjusted, semanal, 'S41', { dias: 7 }).monto, 450);
assert.equal(c.retencionEvaluada({ ...adjusted, excepciones: { S41: 'SUSPENDER' } }, semanal, 'S41', { dias: 7 }).monto, 0);
assert.equal(c.limiteFonacotPeriodo(semanal, 'S41').monto, 560);
assert.equal(c.retencionDiasExtra({ tipo: 'INFONAVIT', factor: 1 }, semanal, '2026-10-30', 4), 42);
assert.equal(c.descuentoVigenteSemana({ recurrente: true, created_at: '2026-10-06T12:00:00Z' }, 'S40'), false);
assert.equal(c.descuentoVigenteSemana({ recurrente: true, created_at: '2026-10-06T12:00:00Z' }, 'S41'), true);
console.log('OK: mes de 31 días, cambio de mes, febrero bisiesto, quincenas, días extra, importe manual y límite legal');
