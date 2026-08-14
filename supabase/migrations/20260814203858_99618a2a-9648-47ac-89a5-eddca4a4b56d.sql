UPDATE public.catalogo_metodos_transporte SET codigo = 'IC52-002' WHERE nombre ILIKE 'Mar%timo';
UPDATE public.catalogo_metodos_transporte SET codigo = 'IC52-001' WHERE nombre ILIKE 'A%reo';
UPDATE public.catalogo_metodos_transporte SET codigo = 'IC52-003' WHERE nombre ILIKE 'Terrestre';

INSERT INTO public.catalogo_estados_producto (codigo, nombre, estado)
VALUES ('IC04-001', 'Nuevo', 'ACTIVO'), ('IC04-002', 'Usado', 'ACTIVO')
ON CONFLICT DO NOTHING;

INSERT INTO public.catalogo_tipos_despacho (codigo, nombre, estado)
VALUES ('IC38-002', 'Consumo (definitivo)', 'ACTIVO'),
       ('IC38-001', 'Admisión temporal', 'ACTIVO'),
       ('IC38-003', 'Reimportación', 'ACTIVO')
ON CONFLICT DO NOTHING;