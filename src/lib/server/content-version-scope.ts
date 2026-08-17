import { AsyncLocalStorage } from 'node:async_hooks';

/**
 * Un mensaje lee la version del arbol una sola vez.
 *
 * La version existe para que una instancia note de inmediato lo que escribio
 * otra, y eso obliga a leerla de la base en vez de confiar en un reloj. Pero
 * resolver un mensaje toca el arbol dos docenas de veces —cada resolucion de
 * filas, cada rama, cada intento— y preguntarla en cada una convertia la cache
 * en veinticinco viajes a la base: 43 ms pasaron a 77 ms en local, donde un
 * viaje cuesta 3 ms. Contra Supabase hospedado eso es medio segundo por
 * mensaje, en un webhook que ya bloquea mientras envia.
 *
 * Fijarla al inicio del mensaje tampoco pierde frescura: el siguiente mensaje
 * vuelve a preguntarla. Y de paso el mensaje se responde entero contra la
 * misma version del contenido, en vez de cambiar de arbol a la mitad.
 */
const storage = new AsyncLocalStorage<Map<object, Promise<number>>>();

export function withContentVersionScope<T>(work: () => Promise<T>): Promise<T> {
  return storage.run(new Map(), work);
}

export function readContentVersionOnce(
  client: object,
  load: () => Promise<number>
): Promise<number> {
  const memo = storage.getStore();
  if (!memo) return load();

  const pending = memo.get(client);
  if (pending) return pending;

  const started = load();
  memo.set(client, started);
  // Un fallo no se guarda: la siguiente lectura del mismo mensaje vuelve a
  // intentarlo en vez de arrastrar el error hasta el final.
  started.catch(() => memo.delete(client));
  return started;
}
