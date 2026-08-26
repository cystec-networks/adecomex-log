/**
 * Plantilla HTML del Certificado de Origen DR-CAFTA (DGA) — formato oficial
 * de una sola página, solo en español (Dirección General de Aduanas).
 *
 * Usa estilos inline (no <style>) para que el editor WYSIWYG y el
 * generador de PDF (html2canvas) la rendericen igual.
 *
 * Campos de fusión soportados por resolverPlantilla():
 *  - {{exportador.bloque}} / {{productor.bloque}} → catálogo de terceros extranjeros
 *  - {{cliente.nombre|direccion|rnc}}             → importador
 *  - {{expediente.periodo_desde_d/m/a}} y {{expediente.periodo_hasta_d/m/a}}
 *  - {{expediente.pais_origen}}, {{expediente.certificado_remark}}
 *  - La fila con {{producto.*}} se repite una vez por línea de mercancía.
 */

const B = "1px solid #000";
const CELL = `border:${B};padding:3px 5px;vertical-align:top;`;
const LBL = "font-size:8.5px;line-height:1.25;";
const LBLB = "font-size:8.5px;line-height:1.25;font-weight:bold;";
const TXT = "font-size:10px;line-height:1.35;";
const NUM = "font-size:8.5px;";

function encabezado(): string {
  return `<table style="width:100%;border-collapse:collapse;table-layout:fixed">
  <tr><td style="border:${B};padding:4px 5px;text-align:center">
    <div style="font-size:9.5px;font-weight:bold">Tratado de Libre Comercio entre Centroamérica, República Dominicana y los Estados Unidos</div>
    <div style="font-size:12px;font-weight:bold;margin-top:2px">CERTIFICACIÓN DE ORIGEN</div>
    <div style="${LBLB}margin-top:2px">(Instrucciones al reverso)</div>
  </td></tr>
</table>`;
}

function casillas1a4(): string {
  return `<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:-1px">
  <tr>
    <td style="${CELL}width:50%;height:110px">
      <span style="${NUM}">1</span> <span style="${LBLB}">Nombre, dirección y número de registro fiscal del exportador:</span>
      <div style="${TXT}margin-top:8px">{{exportador.bloque}}</div>
    </td>
    <td style="${CELL}width:50%">
      <span style="${NUM}">2</span> <span style="${LBLB}">Período que cubre:</span>
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:14px">
        <tr>
          <td style="border:none;width:14%"></td>
          <td style="border:none;text-align:center;${LBL}">D</td>
          <td style="border:none;text-align:center;${LBL}">M</td>
          <td style="border:none;text-align:center;${LBL}">A</td>
          <td style="border:none;width:10%"></td>
          <td style="border:none;text-align:center;${LBL}">D</td>
          <td style="border:none;text-align:center;${LBL}">M</td>
          <td style="border:none;text-align:center;${LBL}">A</td>
        </tr>
        <tr>
          <td style="border:none;${LBL}">De</td>
          <td style="border:${B};height:18px;${TXT}text-align:center">{{expediente.periodo_desde_d}}</td>
          <td style="border:${B};${TXT}text-align:center">{{expediente.periodo_desde_m}}</td>
          <td style="border:${B};${TXT}text-align:center">{{expediente.periodo_desde_a}}</td>
          <td style="border:none;${LBL}">A</td>
          <td style="border:${B};${TXT}text-align:center">{{expediente.periodo_hasta_d}}</td>
          <td style="border:${B};${TXT}text-align:center">{{expediente.periodo_hasta_m}}</td>
          <td style="border:${B};${TXT}text-align:center">{{expediente.periodo_hasta_a}}</td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="${CELL}height:110px">
      <span style="${LBL}">(Si es conocido)</span><br>
      <span style="${NUM}">3</span> <span style="${LBLB}">Nombre, dirección y número de registro fiscal del productor:</span>
      <div style="${TXT}margin-top:6px">{{productor.bloque}}</div>
    </td>
    <td style="${CELL}">
      <span style="${NUM}">4</span> <span style="${LBLB}">Nombre, dirección y número de registro fiscal del importador:</span>
      <div style="${TXT}margin-top:8px">{{cliente.nombre}}<br>{{cliente.direccion}}<br>RNC: {{cliente.rnc}}</div>
    </td>
  </tr>
</table>`;
}

function tablaMercancias(): string {
  return `<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:-1px">
  <tr>
    <td style="${CELL}width:30%"><span style="${NUM}">5</span> <span style="${LBLB}">Descripción de la(s) mercancía(s)</span></td>
    <td style="${CELL}width:14%"><span style="${NUM}">6</span> <span style="${LBLB}">Clasificación arancelaria</span></td>
    <td style="${CELL}width:15%"><span style="${NUM}">7</span> <span style="${LBLB}">Criterio para trato preferencial</span></td>
    <td style="${CELL}width:14%"><span style="${NUM}">8</span> <span style="${LBLB}">Otros criterios</span></td>
    <td style="${CELL}width:12%"><span style="${NUM}">9</span> <span style="${LBLB}">Productor</span></td>
    <td style="${CELL}width:15%"><span style="${NUM}">10</span> <span style="${LBLB}">País de origen</span></td>
  </tr>
  <tr>
    <td style="${CELL}${TXT}height:60px">{{producto.descripcion}}</td>
    <td style="${CELL}${TXT}text-align:center">{{producto.codigo_arancelario}}</td>
    <td style="${CELL}${TXT}text-align:center">&nbsp;</td>
    <td style="${CELL}${TXT}text-align:center">&nbsp;</td>
    <td style="${CELL}${TXT}text-align:center">&nbsp;</td>
    <td style="${CELL}${TXT}text-align:center">{{expediente.pais_origen}}</td>
  </tr>
</table>`;
}

function casilla11Observaciones(): string {
  return `<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:-1px">
  <tr>
    <td style="${CELL}height:44px">
      <span style="${NUM}">11</span> <span style="${LBLB}">Observaciones:</span>
      <div style="${TXT}margin-top:4px">{{expediente.certificado_remark}}</div>
    </td>
  </tr>
</table>`;
}

function casilla12Declaracion(): string {
  return `<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:-1px">
  <tr>
    <td style="${CELL}">
      <span style="${NUM}">12</span> <span style="${LBLB}">Declaro bajo juramento que:</span>
      <div style="${LBL}text-align:justify;margin-top:4px">
        - La información contenida en este documento es verdadera y exacta y me hago responsable de comprobar lo aquí certificado. Estoy consciente que soy responsable por cualquier declaración falsa u omisión material hecha en o relacionada con el presente documento.<br><br>
        - Me comprometo a conservar y presentar, en caso de ser requerido, los documentos necesarios que respalden el contenido de la presente certificación, así como a notificar por escrito a todas las personas a quienes se ha entregado la presente certificación, de cualquier cambio que pudiera afectar la exactitud o validez del mismo.<br><br>
        - Las mercancías son originarias del territorio de una o más Partes y cumplen con todos los requisitos de origen que les son aplicables conforme al Tratado de Libre Comercio entre Centroamérica, República Dominicana y Estados Unidos, y que no han sido objeto de procesamiento ulterior o de cualquier otra operación fuera de los territorios de las Partes, excepto la descarga, recarga o cualquier otra operación necesaria para mantener la mercancía en buena condición o para transportarla a territorio de una Parte.
      </div>
      <div style="${LBL}margin-top:6px">Esta Certificación se compone de&nbsp;&nbsp;1&nbsp;&nbsp;hojas incluyendo todos sus anexos.</div>
    </td>
  </tr>
</table>`;
}

function bloqueFirmas(): string {
  return `<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:-1px">
  <tr>
    <td style="${CELL}width:50%;height:44px"><span style="${LBLB}">Firma autorizada</span></td>
    <td style="${CELL}width:50%"><span style="${LBLB}">Empresa</span><br><br><span style="${TXT}">&nbsp;</span></td>
  </tr>
  <tr>
    <td style="${CELL}height:44px"><span style="${LBLB}">Nombre</span><br><br><span style="${TXT}">&nbsp;</span></td>
    <td style="${CELL}"><span style="${LBLB}">Cargo</span><br><br><span style="${TXT}">&nbsp;</span></td>
  </tr>
</table>
<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:-1px">
  <tr>
    <td style="${CELL}width:10%"><span style="${LBLB}">Fecha</span></td>
    <td style="${CELL}width:7%;text-align:center"><span style="${LBL}">D</span></td>
    <td style="${CELL}width:7%;text-align:center"><span style="${LBL}">M</span></td>
    <td style="${CELL}width:10%;text-align:center"><span style="${LBL}">A</span></td>
    <td style="${CELL}width:33%"><span style="${LBLB}">Teléfono</span></td>
    <td style="${CELL}width:33%"><span style="${LBLB}">Email</span></td>
  </tr>
  <tr>
    <td style="${CELL}height:26px">&nbsp;</td>
    <td style="${CELL}${TXT}text-align:center">&nbsp;</td>
    <td style="${CELL}${TXT}text-align:center">&nbsp;</td>
    <td style="${CELL}${TXT}text-align:center">&nbsp;</td>
    <td style="${CELL}${TXT}text-align:center">&nbsp;</td>
    <td style="${CELL}${TXT}text-align:center">&nbsp;</td>
  </tr>
</table>`;
}

export const PLANTILLA_DRCAFTA_DGA_HTML = `<div style="font-family:Arial,Helvetica,sans-serif;color:#000;font-size:10px">
<div class="doc-page">
${encabezado()}
${casillas1a4()}
${tablaMercancias()}
${casilla11Observaciones()}
${casilla12Declaracion()}
${bloqueFirmas()}
</div>
</div>`;
