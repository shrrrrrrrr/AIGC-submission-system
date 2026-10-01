/** Mount the approved galaxy visual modules; return complete route-unmount cleanup. */
export function mountGalaxyHome(root: HTMLElement, callbacks?: { onProgress?: (percent: number) => void; onHeroReady?: () => void }): () => void;
