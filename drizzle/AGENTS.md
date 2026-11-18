# Database migration rules
- SQL functions iterate JSON arrays with `jsonb_array_elements(...) WITH ORDINALITY` and `->>` (never `jsonb_to_recordset` with ORDINALITY) and restore dynamic columns through `jsonb_populate_record`, because the other forms fail or store quoted text at runtime; test writes in a reverted transaction.
