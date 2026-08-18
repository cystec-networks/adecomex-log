/**
 * Plantilla HTML del Certificado de Origen DR-CAFTA (USA),
 * reconstruida a partir del formato oficial en Excel.
 *
 * Usa estilos inline (no <style>) para que el editor WYSIWYG y el
 * generador de PDF (html2canvas) la rendericen igual.
 *
 * Marcadores condicionales soportados por resolverPlantilla():
 *  - {{__cierre1_inicio__}} / {{__cierre1_fin__}}  → cierre en página 1 (≤ 3 productos)
 *  - {{__anexo_inicio__}} / {{__anexo_fin__}}      → hoja anexa (> 3 productos)
 */

const B = "1px solid #000";
const CELL = `border:${B};padding:2px 4px;vertical-align:top;`;
const LBL = "font-size:9px;line-height:1.2;";
const TXT = "font-size:11px;line-height:1.3;";
const NUM = "font-size:10px;font-weight:bold;";

function tablaMercancias(prefix: "producto" | "productoAnexo", filasVacias: number): string {
  const vacia = `<tr>
    <td style="${CELL}height:20px">&nbsp;</td>
    <td style="${CELL}">&nbsp;</td>
    <td style="${CELL}">&nbsp;</td>
    <td style="${CELL}">&nbsp;</td>
    <td style="${CELL}">&nbsp;</td>
  </tr>`;
  return `<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:-1px">
    <tr>
      <td style="${CELL}width:34%"><span style="${NUM}">5.</span> <span style="${LBL}">Description of good(s) - Descripción de la(s) mercancía(s)</span></td>
      <td style="${CELL}width:15%"><span style="${NUM}">6.</span> <span style="${LBL}">HS tariff classification<br>Clasificación arancelaria</span></td>
      <td style="${CELL}width:19%"><span style="${NUM}">7.</span> <span style="${LBL}">Preferential tariff treatment criteria<br>Criterio para trato arancelario preferencial</span></td>
      <td style="${CELL}width:17%"><span style="${NUM}">8.</span> <span style="${LBL}">Other criteria<br>Otros criterios</span></td>
      <td style="${CELL}width:15%"><span style="${NUM}">9.</span> <span style="${LBL}">Producer<br>Productor</span></td>
    </tr>
    <tr>
      <td style="${CELL}${TXT}">{{${prefix}.descripcion}}</td>
      <td style="${CELL}${TXT}text-align:center">{{${prefix}.codigo_arancelario}}</td>
      <td style="${CELL}${TXT}text-align:center">A</td>
      <td style="${CELL}${TXT}text-align:center">&nbsp;</td>
      <td style="${CELL}${TXT}text-align:center">SI</td>
    </tr>
    ${vacia.repeat(filasVacias)}
  </table>`;
}

function bloqueCierre(): string {
  return `<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:-1px">
    <tr>
      <td style="${CELL}height:34px" colspan="2"><span style="${NUM}">10.</span> <span style="${LBL}">Remarks - Observaciones</span></td>
    </tr>
    <tr>
      <td style="${CELL}width:50%"><span style="${NUM}">11.</span> <span style="${LBL}">Under oath I certify that:</span></td>
      <td style="${CELL}width:50%"><span style="${LBL}">Declaro bajo juramento que:</span></td>
    </tr>
    <tr>
      <td style="${CELL}${LBL}">
        - The information on this document is true and accurate and I assume the responsibility for proving such representations. I understand that I am liable for any false statements or material omissions made on or in connection with this document.<br><br>
        - I agree to maintain, and present upon request, documentation necessary to support this certification, and to inform, in writing, all persons to whom the certification was given of any changes that would affect the accuracy or validity of this Certification.<br><br>
        - The goods originated in the territory of one or more of the Parties, and comply with the origin requirements specified for those goods in the Central America - Dominican Republic - United States Free Trade Agreement, and that there has been no further processing or any other operation outside the territories of the Parties, other than unloading, reloading, or any other operation necessary to preserve the good in good condition or to transport the good to the territory of a Party.
      </td>
      <td style="${CELL}${LBL}">
        - La información contenida en este documento es verdadera y exacta y me hago responsable de comprobar lo aquí certificado. Estoy consciente que soy responsable por cualquier declaración falsa u omisión material hecha en o relacionada con el presente documento.<br><br>
        - Me comprometo a conservar y presentar, en caso de ser requerido, los documentos necesarios que respalden el contenido de la presente certificación, así como a notificar por escrito a todas las personas a quienes se ha entregado la presente certificación, de cualquier cambio que pudiera afectar la exactitud o validez del mismo.<br><br>
        - Las mercancías son originarias del territorio de una o más Partes y cumplen con todos los requisitos de origen que les son aplicables conforme al Tratado de Libre Comercio entre Centroamérica, República Dominicana y Estados Unidos, y que no han sido objeto de procesamiento ulterior o de cualquier otra operación fuera de los territorios de las Partes, excepto la descarga, recarga o cualquier otra operación necesaria para mantener la mercancía en buena condición o para transportarla a territorio de una Parte.
      </td>
    </tr>
    <tr>
      <td style="${CELL}${LBL}" colspan="2">
        This Certification consists of ______ pages, including all attachments.<br>
        Esta Certificación se compone de ______ hojas incluyendo todos sus anexos.
      </td>
    </tr>
  </table>
  <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:-1px">
    <tr>
      <td style="${CELL}width:50%;height:38px"><span style="${LBL}">Authorized Signature - Firma autorizada</span></td>
      <td style="${CELL}width:50%"><span style="${LBL}">Company - Empresa</span><br><span style="${TXT}">&nbsp;</span></td>
    </tr>
    <tr>
      <td style="${CELL}height:30px"><span style="${LBL}">Name - Nombre</span><br><span style="${TXT}">&nbsp;</span></td>
      <td style="${CELL}"><span style="${LBL}">Title - Cargo</span><br><span style="${TXT}">&nbsp;</span></td>
    </tr>
    <tr>
      <td style="${CELL}"><span style="${LBL}">Date - Fecha (D / M / Y-A)</span><br><span style="${TXT}">____ / ____ / ________</span></td>
      <td style="${CELL}"><span style="${LBL}">Telephone - Teléfono / Fax</span><br><span style="${TXT}">&nbsp;</span></td>
    </tr>
  </table>`;
}

const ENCABEZADO = `<table style="width:100%;border-collapse:collapse;table-layout:fixed">
  <tr>
    <td style="${CELL}width:50%;text-align:center;font-size:10px;font-weight:bold">Central America - Dominican Republic - United States Free Trade Agreement</td>
    <td style="${CELL}width:50%;text-align:center;font-size:10px;font-weight:bold">Tratado de Libre Comercio entre República Dominicana - Centroamérica - Estados Unidos de América</td>
  </tr>
  <tr>
    <td style="${CELL}text-align:center;font-size:14px;font-weight:bold">CERTIFICATE OF ORIGIN</td>
    <td style="${CELL}text-align:center;font-size:14px;font-weight:bold">CERTIFICADO DE ORIGEN</td>
  </tr>
  <tr>
    <td style="${CELL}text-align:center;${LBL}">(Instructions on reverse)</td>
    <td style="${CELL}text-align:center;${LBL}">(Instrucciones al reverso)</td>
  </tr>
</table>`;

export const PLANTILLA_DRCAFTA_USA_HTML = `<div style="font-family:Arial,Helvetica,sans-serif;color:#000;font-size:11px">
${ENCABEZADO}
<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:-1px">
  <tr>
    <td style="${CELL}width:50%;height:95px">
      <span style="${NUM}">1.</span> <span style="${LBL}">Exporter´s name, address and tax identification number:<br>Nombre, dirección y número de registro fiscal del exportador:</span>
      <div style="${TXT}margin-top:4px">{{expediente.suplidor}}<br>RNC / Tax ID: {{expediente.suplidor_rnc}}</div>
    </td>
    <td style="${CELL}width:50%">
      <span style="${NUM}">2.</span> <span style="${LBL}">Blanket period:<br>Período que cubre:</span>
      <div style="${TXT}margin-top:10px">From / De: ____ / ____ / ________<br><br>To / A: ____ / ____ / ________</div>
    </td>
  </tr>
  <tr>
    <td style="${CELL}height:95px">
      <span style="${NUM}">3.</span> <span style="${LBL}">Producer’s name, address and tax identification number (If Known):<br>Nombre, dirección y número de registro fiscal del productor (Si es conocido):</span>
      <div style="${TXT}margin-top:4px">{{expediente.suplidor}}</div>
    </td>
    <td style="${CELL}">
      <span style="${NUM}">4.</span> <span style="${LBL}">Importer´s name, address and tax identification number:<br>Nombre, dirección y número de registro fiscal del importador:</span>
      <div style="${TXT}margin-top:4px">{{cliente.nombre}}<br>{{cliente.direccion}}<br>Tel.: {{cliente.telefono}} · Email: {{cliente.email}}<br>RNC: {{cliente.rnc}}</div>
    </td>
  </tr>
</table>
{{__cierre1_inicio__}}
${tablaMercancias("producto", 6)}
${bloqueCierre()}
{{__cierre1_fin__}}
{{__anexo_inicio__}}
${tablaMercancias("producto", 4)}
<div style="page-break-before:always;height:8px"></div>
${ENCABEZADO.replace(
  ">CERTIFICATE OF ORIGIN<",
  ">Page annex<",
).replace(">CERTIFICADO DE ORIGEN<", ">Hoja anexa<")}
${tablaMercancias("productoAnexo", 4)}
${bloqueCierre()}
{{__anexo_fin__}}
</div>`;
