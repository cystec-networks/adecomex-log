# Authenticated route rules
- Expediente «Producto correcto» (Rectificación técnica) autosaves on blur only in created expedientes, as a single-column partial UPDATE guarded by `producto-correcto-rectificacion.ts`, and patches the edit-mode base and query cache, so it never resends the form or marks the global save dirty; Nuevo keeps it in the create payload.
