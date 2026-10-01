/** Read actual response bytes; unknown lengths report completion only. */
export async function readProgressBuffer(response, onProgress, decodedLength = 0) {
  if (!onProgress || !response.body) return response.arrayBuffer();
  const encoded = response.headers.get('Content-Encoding');
  const total = encoded ? decodedLength : Number(response.headers.get('Content-Length'));
  const reader = response.body.getReader(), chunks = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); received += value.byteLength;
      if (total > 0) onProgress(Math.min(.99, received / total));
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes.buffer;
}

/** Prioritize visible scenes; then prepare all others, one background scene at a time. */
export function planGalaxyLoads(order, foreground, loaded, pending, failed) {
  const missing = id => !loaded.has(id) && !pending.has(id) && !failed.has(id);
  const immediate = foreground.filter(missing).slice(0, Math.max(0, 2 - pending.size));
  if (immediate.length) return immediate;
  if (pending.size || !foreground.every(id => loaded.has(id) || failed.has(id))) return [];
  const index = order.indexOf(foreground.at(-1));
  const candidates = [...order.slice(index + 1), ...order.slice(0, index + 1)];
  const next = candidates.find(missing);
  return next ? [next] : [];
}
