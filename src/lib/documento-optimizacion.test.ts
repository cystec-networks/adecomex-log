import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, PDFName, PDFNumber, PDFDict } from "@cantoo/pdf-lib";
import jpeg from "jpeg-js";
import { encode as pngEncode } from "fast-png";
import { optimizarDocumento, pdfProtegido, dimensiones200Dpi, reducirImagen } from "./documento-optimizacion";

describe("optimización conservadora de documentos", () => {
  it("reduce 300 DPI a 200 DPI y nunca amplía una imagen de 150 DPI", () => {
    assert.deepEqual(dimensiones200Dpi(2550,3300,612,792), { width:1700,height:2200 });
    assert.deepEqual(dimensiones200Dpi(1275,1650,612,792), { width:1275,height:1650 });
  });
  it("conserva exactamente un PDF con firma digital incluso dentro de objetos comprimidos", async () => {
    const pdf = await PDFDocument.create(); pdf.addPage();
    pdf.context.register(pdf.context.obj({ Type:"Sig", ByteRange:[0,100,200,300] }));
    const bytes = await pdf.save();
    assert.equal(await pdfProtegido(bytes), true);
    const out = await optimizarDocumento(bytes,"application/pdf");
    assert.equal(out.bytes,bytes); assert.equal(out.motivo,"firmado");
  });
  it("conserva el original cuando falla la optimización", async () => {
    const bytes = new TextEncoder().encode("%PDF-1.7 roto");
    const out = await optimizarDocumento(bytes,"application/pdf");
    assert.equal(out.bytes,bytes); assert.equal(out.motivo,"fallo");
  });
  it("conserva el original si no reduce el tamaño", async () => {
    const pdf = await PDFDocument.create(); pdf.addPage(); pdf.context.trailerInfo.Info = undefined;
    const bytes = await pdf.save(); const out = await optimizarDocumento(bytes,"application/pdf");
    assert.equal(out.bytes,bytes); assert.equal(out.ahorro,0);
  });
  it("elimina metadatos prescindibles sin cambiar texto vectorial", async () => {
    const pdf = await PDFDocument.create(); pdf.addPage().drawText("Factura legal 12345"); pdf.setSubject("metadata ".repeat(20000));
    const bytes = await pdf.save(); const out = await optimizarDocumento(bytes,"application/pdf");
    assert.equal(out.motivo,"optimizado"); assert.ok(out.bytes.length < bytes.length);
    assert.equal((await PDFDocument.load(out.bytes)).getSubject(),undefined);
  });
  it("promedia píxeles para preservar trazos y no elimina la transparencia de PNG", async () => {
    const data = new Uint8Array([0,0,0,255,255,255,255,255,0,0,0,255,255,255,255,255]);
    assert.deepEqual([...reducirImagen(data,2,2,1,1)],[128,128,128,255]);
    const bytes = pngEncode({width:2,height:2,data,channels:4,text:{Note:"texto ".repeat(1000)}});
    const out = await optimizarDocumento(bytes,"image/png");
    assert.ok(out.bytes.length <= bytes.length);
  });
  it("reduce únicamente una imagen escaneada de 300 a 200 DPI conservando página y texto", async () => {
    const w=1500,h=1800; const data=new Uint8Array(w*h*4);
    for(let i=0;i<data.length;i+=4){const v=220+(i/4%29);data[i]=v;data[i+1]=v;data[i+2]=v;data[i+3]=255;}
    const image=jpeg.encode({width:w,height:h,data},98).data;
    const pdf=await PDFDocument.create();const jpg=await pdf.embedJpg(image);pdf.addPage([360,432]).drawImage(jpg,{x:0,y:0,width:360,height:432});
    const out=await optimizarDocumento(await pdf.save(),"application/pdf");
    assert.equal(out.motivo,"optimizado");
    const loaded=await PDFDocument.load(out.bytes); assert.equal(loaded.getPageCount(),1);
    const objects=loaded.context.enumerateIndirectObjects().map(([,o])=>o);
    const img=objects.find(o=>"dict" in o && (o.dict as PDFDict).get(PDFName.of("Subtype"))?.toString()==="/Image");
    assert.ok(img && "dict" in img);
    assert.equal((img.dict as PDFDict).lookup(PDFName.of("Width"),PDFNumber).asNumber(),1000);
    assert.equal((img.dict as PDFDict).lookup(PDFName.of("Height"),PDFNumber).asNumber(),1200);
  });
});