# Régimen suspensivo de impuestos (Zona Franca)

## Qué verá el usuario
- **Administración → Catálogos → Regímenes**: nueva columna "Régimen suspensivo de impuestos" (Sí/No). Se marca "Zona Franca" como Sí; cualquier otro régimen se puede marcar después sin tocar código.
- **Expediente con régimen suspensivo**:
  - Detalle de Mercancía: % Gravamen, Gravamen, % ISC, Selectivo e ITBIS por línea se muestran como "N/A" y suman 0.
  - Resultado oficial DGA / Pre-liquidación: Gravamen, Selectivo e ITBIS en 0; el total queda solo como Servicio Aduanero + Formulario DUA (RD$258.26).
  - Aviso visible en ambas secciones: "⚠ Régimen suspensivo de impuestos — Solo aplica Servicio Aduanero".
- **Al cambiar el régimen a uno suspensivo** y guardar: si alguna línea ya tiene % Gravamen / ISC capturados, aparece una confirmación. Si acepta, esos porcentajes se ponen en cero en las líneas; si cancela, no se guarda el cambio de régimen.
- **Override manual**: interruptor "Capturar impuestos manualmente (excepción DGA)" visible solo para admin y operaciones, con confirmación. Activado, el expediente calcula impuestos normalmente pese al régimen suspensivo; el aviso cambia a "Impuestos capturados manualmente (override)". Queda registro en auditoría.

## Lo que no cambia
- Regímenes no suspensivos: cálculo idéntico al actual.
- Servicio Aduanero, Formulario DUA, XML SIGA, validaciones de estado y guardado del resto de la ficha.

## Prueba end-to-end
En un expediente de prueba: poner Régimen = Zona Franca con líneas que tengan gravamen → confirmar puesta a cero → verificar N/A y total = Servicio + DUA → activar override como admin → verificar que vuelven a calcularse los impuestos → restaurar el expediente a su estado original.

## Detalles técnicos
- Migración: `catalogo_regimenes.suspensivo_impuestos boolean default false`; `expedientes.impuestos_override_manual boolean default false`, `impuestos_override_at timestamptz`, `impuestos_override_por uuid`. Actualizar la fila Zona Franca vía run_sql.
- `src/lib/impuestos.ts`: parámetro opcional `suspendido` en `calcImpuestosLinea` que devuelve impuestos en 0 (cif intacto). Hook `useRegimenSuspensivo(expediente)` que consulta el catálogo por nombre/código del régimen del expediente y combina con el override.
- Aplicar en `expedientes.$id.tsx` (tabla de mercancía, totales de Resultado oficial DGA), `pdf-preliquidacion.ts` y la pre-liquidación.
- Confirmación en `handleSave` cuando el régimen pasa a suspensivo y existen líneas con `pct_gravamen`/`pct_isc` no nulos; pone en cero con un update a `mercancia_items`.
- Override editable solo si `useMyRoles()` incluye admin u operaciones; inserción en `auditoria`.
