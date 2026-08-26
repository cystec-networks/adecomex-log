UPDATE public.plantillas_documentos
SET contenido_html = replace(
      replace(contenido_html,
        '<div style="font-size:10px;line-height:1.35;margin-top:8px">&nbsp;</div>',
        '<div style="font-size:10px;line-height:1.35;margin-top:8px">{{exportador.bloque}}</div>'),
      '<div style="font-size:10px;line-height:1.35;margin-top:6px">&nbsp;</div>',
      '<div style="font-size:10px;line-height:1.35;margin-top:6px">{{productor.bloque}}</div>')
WHERE nombre LIKE '%DR-CAFTA%';