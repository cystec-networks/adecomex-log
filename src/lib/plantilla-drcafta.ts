/**
 * Plantilla HTML del Certificado de Origen DR-CAFTA (USA) + Hoja anexa,
 * reconstruida a partir del formulario oficial (PDF de referencia).
 *
 * Usa estilos inline (no <style>) para que el editor WYSIWYG y el
 * generador de PDF (html2canvas) la rendericen igual.
 *
 * Marcadores condicionales soportados por resolverPlantilla():
 *  - {{__cierre1_inicio__}} / {{__cierre1_fin__}}  → contenido de la página 1
 *  - {{__anexo_inicio__}} / {{__anexo_fin__}}      → hoja anexa
 */

const B = "1px solid #000";
const CELL = `border:${B};padding:3px 5px;vertical-align:top;`;
const LBL = "font-size:8.5px;line-height:1.25;";
const LBLB = "font-size:8.5px;line-height:1.25;font-weight:bold;";
const TXT = "font-size:10px;line-height:1.35;";
const NUM = "font-size:8.5px;";

function cabeceraMercancias(): string {
  return `<tr>
      <td style="${CELL}width:36%"><span style="${NUM}">5</span> <span style="${LBL}">Description of good(s) - </span><span style="${LBLB}">Descripción de la(s) mercancía(s)</span></td>
      <td style="${CELL}width:14%"><span style="${NUM}">6</span> <span style="${LBL}">HS tariff classification</span><br><span style="${LBLB}">Clasificación arancelaria</span></td>
      <td style="${CELL}width:17%"><span style="${NUM}">7</span> <span style="${LBL}">Preferential tariff treatment criteria</span><br><span style="${LBLB}">Criterio para trato arancelario preferencial</span></td>
      <td style="${CELL}width:16%"><span style="${NUM}">8</span> <span style="${LBL}">Other criteria</span><br><span style="${LBLB}">Otros criterios</span></td>
      <td style="${CELL}width:17%"><span style="${NUM}">9</span> <span style="${LBLB}">Producer<br>Productor</span></td>
    </tr>`;
}

function tablaMercancias(
  prefix: "producto" | "productoAnexo",
  alto: number,
): string {
  return `<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:-1px">
    ${cabeceraMercancias()}
    <tr>
      <td style="${CELL}${TXT}height:${alto}px">{{${prefix}.descripcion}}</td>
      <td style="${CELL}${TXT}text-align:center">{{${prefix}.codigo_arancelario}}</td>
      <td style="${CELL}${TXT}text-align:center">A</td>
      <td style="${CELL}${TXT}text-align:center">&nbsp;</td>
      <td style="${CELL}${TXT}text-align:center">SI</td>
    </tr>
  </table>`;
}

function bloqueCierre(paginas: string): string {
  return `<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:-1px">
    <tr>
      <td style="${CELL}height:22px" colspan="2"><span style="${NUM}">10</span> <span style="${LBL}">Remarks - </span><span style="${LBLB}">Observaciones</span></td>
    </tr>
    <tr>
      <td style="${CELL}width:50%"><span style="${NUM}">11</span> <span style="${LBL}">Under oath I certify that:</span></td>
      <td style="${CELL}width:50%"><span style="${LBLB}">Declaro bajo juramento que:</span></td>
    </tr>
    <tr>
      <td style="${CELL}${LBL}text-align:justify">
        - The information on this document is true and accurate and I assume the responsibility for proving such representations. I understand that I am liable for any false statements or material omissions made on or in connection with this document.<br><br>
        - I agree to maintain, and present upon request, documentation necessary to support this certification, and to inform, in writing, all persons to whom the certification was given of any changes that would affect the accuracy or validity of this Certification.<br><br>
        - The goods originated in the territory of one or more of the Parties, and comply with the origin requirements specified for those goods in the Central America - Dominican Republic - United States Free Trade Agreement, and that there has been no further processing or any other operation outside the territories of the Parties, other than unloading, reloading, or any other operation necessary to preserve the good in good condition or to transport the good to the territory of a Party.
      </td>
      <td style="${CELL}${LBLB}text-align:justify">
        - La información contenida en este documento es verdadera y exacta y me hago responsable de comprobar lo aquí certificado. Estoy consciente que soy responsable por cualquier declaración falsa u omisión material hecha en o relacionada con el presente documento.<br><br>
        - Me comprometo a conservar y presentar, en caso de ser requerido, los documentos necesarios que respalden el contenido de la presente certificación, así como a notificar por escrito a todas las personas a quienes se ha entregado la presente certificación, de cualquier cambio que pudiera afectar la exactitud o validez del mismo.<br><br>
        - Las mercancías son originarias del territorio de una o más Partes y cumplen con todos los requisitos de origen que les son aplicables conforme al Tratado de Libre Comercio entre Centroamérica, República Dominicana y Estados Unidos, y que no han sido objeto de procesamiento ulterior o de cualquier otra operación fuera de los territorios de las Partes, excepto la descarga, recarga o cualquier otra operación necesaria para mantener la mercancía en buena condición o para transportarla a territorio de una Parte.
      </td>
    </tr>
    <tr>
      <td style="${CELL}" colspan="2">
        <span style="${LBL}">This Certification consists of</span>
        <span style="${TXT}">&nbsp;&nbsp;${paginas}&nbsp;&nbsp;</span>
        <span style="${LBL}">pages, including all attachments</span><br>
        <span style="${LBLB}">Esta Certificación se compone de</span>
        <span style="${TXT}">&nbsp;&nbsp;${paginas}&nbsp;&nbsp;</span>
        <span style="${LBLB}">hojas incluyendo todos sus anexos.</span>
      </td>
    </tr>
  </table>`;
}

function bloqueFirmas(datos: boolean): string {
  const empresa = datos ? "{{expediente.suplidor}}" : "&nbsp;";
  return `<table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:-1px">
    <tr>
      <td style="${CELL}width:50%;height:44px"><span style="${LBL}">Authorized Signature - </span><span style="${LBLB}">Firma autorizada</span></td>
      <td style="${CELL}width:50%"><span style="${LBL}">Company - </span><span style="${LBLB}">Empresa</span><br><br><span style="${TXT}">${empresa}</span></td>
    </tr>
    <tr>
      <td style="${CELL}height:44px"><span style="${LBL}">Name - </span><span style="${LBLB}">Nombre</span><br><br><span style="${TXT}">&nbsp;</span></td>
      <td style="${CELL}"><span style="${LBL}">Title - </span><span style="${LBLB}">Cargo</span><br><br><span style="${TXT}">&nbsp;</span></td>
    </tr>
  </table>
  <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:-1px">
    <tr>
      <td style="${CELL}width:10%"><span style="${LBL}">Date - </span><span style="${LBLB}">Fecha</span></td>
      <td style="${CELL}width:7%;text-align:center"><span style="${LBL}">D</span></td>
      <td style="${CELL}width:7%;text-align:center"><span style="${LBL}">M</span></td>
      <td style="${CELL}width:10%;text-align:center"><span style="${LBL}">Y - A</span></td>
      <td style="${CELL}width:33%"><span style="${LBL}">Telephone - </span><span style="${LBLB}">Teléfono</span></td>
      <td style="${CELL}width:33%"><span style="${LBL}">Fax</span></td>
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

function encabezado(t1: string, t2: string, instrucciones: boolean): string {
  return `<table style="width:100%;border-collapse:collapse;table-layout:fixed">
  <tr>
    <td style="border:none;padding:2px 5px;width:50%;text-align:center;font-size:9.5px;font-weight:bold">Central America-Dominican Republic-United States Free Trade Agreement</td>
    <td style="border:none;padding:2px 5px;width:50%;text-align:center;font-size:9.5px;font-weight:bold">Tratado de Libre Comercio entre República Dominicana -Centroamérica- Estados Unidos de América</td>
  </tr>
  <tr>
    <td style="border:none;padding:2px 5px;text-align:center;font-size:11px;font-weight:bold">${t1}</td>
    <td style="border:none;padding:2px 5px;text-align:center;font-size:11px;font-weight:bold">${t2}</td>
  </tr>
  ${
    instrucciones
      ? `<tr>
    <td style="border:none;padding:0 5px 4px;text-align:center;${LBLB}">(Instructions on reverse)</td>
    <td style="border:none;padding:0 5px 4px;text-align:center;${LBLB}">(Instrucciones al reverso)</td>
  </tr>`
      : `<tr><td style="border:none;height:6px"></td><td style="border:none"></td></tr>`
  }
</table>`;
}

export const PLANTILLA_DRCAFTA_USA_HTML = `<div style="font-family:Arial,Helvetica,sans-serif;color:#000;font-size:10px">
{{__cierre1_inicio__}}
<div class="doc-page">
${encabezado("CERTIFICATE OF ORIGIN", "CERTIFICADO DE ORIGEN", true)}
<table style="width:100%;border-collapse:collapse;table-layout:fixed">
  <tr>
    <td style="${CELL}width:50%;height:100px">
      <span style="${NUM}">1</span> <span style="${LBL}">Exporter´s name, address and tax identification number:</span><br>
      <span style="${LBLB}">Nombre, dirección y número de registro fiscal del exportador:</span>
      <div style="${TXT}margin-top:8px">{{expediente.suplidor}}<br>RNC / Tax ID: {{expediente.suplidor_rnc}}</div>
    </td>
    <td style="${CELL}width:50%">
      <span style="${NUM}">2</span> <span style="${LBL}">Blanket period:</span><br>
      <span style="${LBLB}">Período que cubre:</span>
      <table style="width:100%;border-collapse:collapse;table-layout:fixed;margin-top:14px">
        <tr>
          <td style="border:none;width:14%"></td>
          <td style="border:none;text-align:center;${LBL}">D</td>
          <td style="border:none;text-align:center;${LBL}">M</td>
          <td style="border:none;text-align:center;${LBL}">Y - A</td>
          <td style="border:none;width:10%"></td>
          <td style="border:none;text-align:center;${LBL}">D</td>
          <td style="border:none;text-align:center;${LBL}">M</td>
          <td style="border:none;text-align:center;${LBL}">Y - A</td>
        </tr>
        <tr>
          <td style="border:none;${LBL}">From<br>De</td>
          <td style="border:${B};height:18px;${TXT}text-align:center">&nbsp;</td>
          <td style="border:${B};${TXT}text-align:center">&nbsp;</td>
          <td style="border:${B};${TXT}text-align:center">&nbsp;</td>
          <td style="border:none;${LBL}">To<br>A</td>
          <td style="border:${B};${TXT}text-align:center">&nbsp;</td>
          <td style="border:${B};${TXT}text-align:center">&nbsp;</td>
          <td style="border:${B};${TXT}text-align:center">&nbsp;</td>
        </tr>
      </table>
    </td>
  </tr>
  <tr>
    <td style="${CELL}height:100px">
      <span style="${LBL}">(If Known)</span><br>
      <span style="${NUM}">3</span> <span style="${LBL}">Producer´s name, address and tax identification number:</span><br>
      <span style="${LBL}">(Si es conocido)</span><br>
      <span style="${LBLB}">Nombre, dirección y número de registro fiscal del productor:</span>
      <div style="${TXT}margin-top:6px">{{expediente.suplidor}}</div>
    </td>
    <td style="${CELL}">
      <span style="${NUM}">4</span> <span style="${LBL}">Importer´s name, address and tax identification number:</span><br>
      <span style="${LBLB}">Nombre, dirección y número de registro fiscal del importador:</span>
      <div style="${TXT}margin-top:8px">{{cliente.nombre}}<br>{{cliente.direccion}}<br>Tel.: {{cliente.telefono}}, Email: {{cliente.email}}<br>RNC: {{cliente.rnc}}</div>
    </td>
  </tr>
</table>
${tablaMercancias("producto", 260)}
${bloqueCierre("2")}
${bloqueFirmas(true)}
</div>
{{__cierre1_fin__}}
{{__anexo_inicio__}}
<div class="doc-page" style="page-break-before:always">
${encabezado("Page annex", "Hoja anexa", false)}
${tablaMercancias("productoAnexo", 250)}
${bloqueCierre("&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;")}
${bloqueFirmas(false)}
</div>
{{__anexo_fin__}}
</div>`;
