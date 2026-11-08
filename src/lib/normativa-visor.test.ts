import { describe, expect, it } from "vitest";

import { enlaceCitaNormativa, paginaValida, parsearEnlaceCita } from "./normativa-visor";

const ID = "54b89ec3-8854-4b8f-b610-c6fd5a16785d";

describe("enlaces de cita de la Base normativa", () => {
  it("la cita con página abre el visor en esa página", () => {
    expect(enlaceCitaNormativa(ID, 12)).toBe(`/normativa/${ID}?pagina=12`);
    expect(parsearEnlaceCita(`/normativa/${ID}?pagina=12`)).toEqual({ documentoId: ID, pagina: 12 });
  });

  it("sin página válida abre el documento desde el principio", () => {
    expect(enlaceCitaNormativa(ID, 0)).toBe(`/normativa/${ID}`);
    expect(parsearEnlaceCita(`/normativa/${ID}?pagina=abc`)).toEqual({ documentoId: ID, pagina: null });
  });

  it("acepta la URL absoluta del propio sitio, no la de otro sitio", () => {
    const origen = "https://app.adecomex.com";
    expect(parsearEnlaceCita(`${origen}/normativa/${ID}?pagina=3`, origen)).toEqual({ documentoId: ID, pagina: 3 });
    expect(parsearEnlaceCita(`https://otro.com/normativa/${ID}?pagina=3`, origen)).toBeNull();
    expect(parsearEnlaceCita(`https://otro.com/normativa/${ID}`)).toBeNull();
  });

  it("los demás enlaces no son citas", () => {
    expect(parsearEnlaceCita("https://dga.gob.do/aviso.pdf")).toBeNull();
    expect(parsearEnlaceCita("/normativa/no-es-un-id")).toBeNull();
    expect(parsearEnlaceCita(undefined)).toBeNull();
  });

  it("solo acepta páginas enteras positivas", () => {
    expect(paginaValida("7")).toBe(7);
    expect(paginaValida(-1)).toBeNull();
    expect(paginaValida(2.5)).toBeNull();
  });
});
