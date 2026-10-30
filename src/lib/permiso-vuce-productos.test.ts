import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { normalizarProductosVuce, productosVuceGuardados } from "./permiso-vuce-productos";
import { aplicarDetalleVuce, leerPermisoVuce } from "./permiso-vuce";
const fila = { secuencia: "1", arancel: "3002.90.10 - - Cultivo de microorganismos", codigo: "PRT201105-\n0C008AB19B", producto: "FERMENTOS CHOOZIT MA 50 DCU EN CAJAS", pais_origen: "FRANCIA", unidad: "Unidades", cantidad: "2,500.0000", valor_fob: "14,150.00", peso: "52.5600", descripcion: "FERMENTO CHOOZIT MA 11 LYO 50 DCU REF. 50406" };
describe("Productos VUCE", () => {
 it("conserva las seis filas documentales aunque tengan códigos repetidos", () => {
  const cantidades = ["2,500.0000","2,500.0000","500.0000","500.0000","150.0000","700.0000"];
  const fob = ["14,150.00","14,150.00","3,835.00","3,835.00","849.00","3,962.00"];
  const pesos = ["52.5600","52.5500","10.5100","10.5100","3.1500","14.7200"];
  const p=normalizarProductosVuce(cantidades.map((cantidad,i)=>({...fila,secuencia:String(i+1),cantidad,valor_fob:fob[i],peso:pesos[i]})));
  assert.equal(p.length,6);
  assert.deepEqual(p.map(r=>[r.arancel,r.cantidad,r.valor_fob,r.peso]),[
   ["3002.90.10","2500.0000","14150.00","52.5600"], ["3002.90.10","2500.0000","14150.00","52.5500"],
   ["3002.90.10","500.0000","3835.00","10.5100"], ["3002.90.10","500.0000","3835.00","10.5100"],
   ["3002.90.10","150.0000","849.00","3.1500"], ["3002.90.10","700.0000","3962.00","14.7200"]]);
  assert.equal(p[0].codigo,"PRT201105-0C008AB19B");
  assert.equal(p[0].descripcion,fila.descripcion);
 });
 it("un único producto mantiene una fila y vacíos sin inventar",()=>{
  const p=normalizarProductosVuce([{...fila,peso:null,valor_fob:""}]);
  assert.equal(p.length,1); assert.equal(p[0].peso,""); assert.equal(p[0].valor_fob,"");
 });
 it("actualiza las filas al reemplazar y conserva correcciones al guardar",()=>{
  const d=leerPermisoVuce("No. Trámite: TRM-1026-2565293\nEstado: Pendiente de Pago");
  assert.ok(d);
  const form={numero:"",institucion_emisora:"",estado:"solicitado",estado_vuce:null,fecha_vencimiento:"",fecha_aprobacion:"",productos:[{...fila,cantidad:"999"}]};
  const updated=aplicarDetalleVuce(form,{...d,productos:normalizarProductosVuce([fila])});
  assert.equal(updated.productos[0].cantidad,"2500.0000");
  updated.productos[0].cantidad="2499.5000";
  assert.equal(productosVuceGuardados(JSON.parse(JSON.stringify(updated.productos)))[0].cantidad,"2499.5000");
  assert.deepEqual(aplicarDetalleVuce(updated,d).productos,updated.productos);
 });
});

describe("Productos VUCE wcIC012003", () => {
  it("carga Marca y Modelo y deja vacíos País, FOB y Peso sin bloquear", () => {
    const [p] = normalizarProductosVuce([{ secuencia: "1", arancel: "3002.90.10", producto: "VACUNA", descripcion: "VACUNA", marca: "ZOETIS", modelo: "X1", unidad: "Dosis", cantidad: "1,000" }]);
    assert.equal(p.marca, "ZOETIS"); assert.equal(p.modelo, "X1"); assert.equal(p.cantidad, "1000");
    assert.equal(p.pais_origen, ""); assert.equal(p.valor_fob, ""); assert.equal(p.peso, "");
  });
  it("filas guardadas antes de Marca/Modelo siguen cargando", () => {
    assert.equal(productosVuceGuardados([{ secuencia: "1", arancel: "", codigo: "", producto: "A", pais_origen: "", unidad: "", cantidad: "", valor_fob: "", peso: "", descripcion: "" }])[0].marca, "");
  });
});
