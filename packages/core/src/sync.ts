import type { Provider } from './index';

export function planConnectedProviderSync(
  requested: Provider[],
  connected: Provider[]
) {
  const connectedSet = new Set(connected);
  const uniqueRequested = [...new Set(requested)];
  return {
    providers: uniqueRequested.filter((provider) => connectedSet.has(provider)),
    skipped: uniqueRequested.filter((provider) => !connectedSet.has(provider)),
  };
}
