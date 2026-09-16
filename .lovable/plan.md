# Reducir el visor del comprobante de transporte

## Cambio
- Ajustar el diálogo del comprobante de Solicitud de Pago de Transporte para que abra en un tamaño compacto en escritorio, en lugar de ocupar casi toda la pantalla.
- Mantener un tamaño amplio y usable en móviles para que el documento siga siendo legible.
- Conservar sin cambios el comprobante de Pago por Transferencia.

## Verificación
- Abrir un comprobante desde Solicitudes de Pago de Transporte y confirmar visualmente que el diálogo aparece reducido y centrado.
- Comprobar que imprimir/cerrar siguen funcionando y que no hay errores.

## Detalle técnico
- El ajuste se hará únicamente en el tamaño del diálogo existente `SolicitudPagoPdfDialog`; no se cambiarán datos, cálculos ni navegación.
