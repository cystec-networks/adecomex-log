<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

Las restricciones de transición de Expediente se aplican tanto en `src/lib/estados-expediente.ts` como en el trigger `public.validar_transicion_expediente()`; así los cambios manuales y automáticos respetan los mismos requisitos.

El identificador visible de un expediente usa la clase compartida `expediente-numero`, basada en `--brand-red`, para mantener el mismo énfasis rojo y negrita en vistas y formularios.

En el volante de solicitud de pago, resolver primero el número del transporte vinculado y luego el TR reservado en la solicitud; un viaje puede tener varios controles TF, que siguen siendo secundarios para conciliación.

El PDF de preliquidación de expediente y cotización comparte el generador horizontal con resumen CIF, Impuestos y Servicios DGA; mantenerlo centralizado evita diferencias entre ambas impresiones.

Use explicit responsive grid slots and reserved action widths for the expediente header; desktop controls stay on one row, with secondary menus consolidated into More actions when the container cannot fit them, while mobile keeps accessible rows.
