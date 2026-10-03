// Share SDK loads across mounts, including React's development effect replay.
const pendingScripts = new Map<string, Promise<void>>();

export function loadPlayerScript(src: string, isReady: () => boolean): Promise<void> {
  if (isReady()) return Promise.resolve();
  const pending = pendingScripts.get(src);
  if (pending) return pending;

  const promise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[src="' + src + '"]');
    const script = existing ?? document.createElement("script");
    const finish = (error?: Error) => {
      clearInterval(poll);
      clearTimeout(timeout);
      script.removeEventListener("error", fail);
      if (error) {
        pendingScripts.delete(src);
        if (!existing) script.remove();
        reject(error);
      } else {
        resolve();
      }
    };
    const fail = () => finish(new Error("Player script could not load"));
    // YouTube loads a second script, so the first script's load event is insufficient.
    const poll = setInterval(() => { if (isReady()) finish(); }, 50);
    const timeout = setTimeout(fail, 15_000);
    script.addEventListener("error", fail);
    if (!existing) {
      script.src = src;
      script.async = true;
      document.body.appendChild(script);
    }
  });
  pendingScripts.set(src, promise);
  return promise;
}
