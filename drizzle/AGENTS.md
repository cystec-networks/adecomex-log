# Database migration rules
- SQL functions iterate JSON arrays with `jsonb_array_elements(...) WITH ORDINALITY` and `->>` (never `jsonb_to_recordset` with ORDINALITY) and restore dynamic columns through `jsonb_populate_record`, because the other forms fail or store quoted text at runtime; test writes in a reverted transaction.
- Unused-file cleanup and package-file retirement rely on `private.archivos_rutas_referenciadas()`; add every new file-path column (or JSON holding paths) there so live files are never offered for deletion.
