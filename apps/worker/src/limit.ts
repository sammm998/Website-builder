/**
 * Runs `fn` over `items` with at most `limit` running at once. After the first failure no new items are
 * started; items already running finish (their steps are saved, so a resumed job skips them), then the
 * first error is thrown. Never retries anything.
 */
export async function forEachLimited<T>(items: T[], limit: number, fn: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  let failure: { error: unknown } | null = null;
  const lane = async () => {
    while (!failure && next < items.length) {
      const index = next++;
      try {
        await fn(items[index]!, index);
      } catch (error) {
        failure ??= { error };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane));
  if (failure) throw (failure as { error: unknown }).error;
}
