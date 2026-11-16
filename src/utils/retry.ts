/**
 * Exponential Backoff Retry Utility for high-reliability emergency reporting.
 * Handles transient network dips, Firestore connection drops, and socket drops.
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  backoffMultiplier?: number;
  maxDelayMs?: number;
  timeoutMs?: number;
  onRetry?: (attempt: number, maxRetries: number, delayMs: number, error: unknown) => void;
}

/**
 * Executes an async operation with exponential backoff and jitter.
 */
export async function executeWithExponentialBackoff<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? 4;
  const initialDelayMs = options.initialDelayMs ?? 800;
  const backoffMultiplier = options.backoffMultiplier ?? 2;
  const maxDelayMs = options.maxDelayMs ?? 8000;
  const timeoutMs = options.timeoutMs ?? 12000;

  let attempt = 0;
  let currentDelay = initialDelayMs;

  while (true) {
    attempt++;
    try {
      // Execute operation wrapped with a timeout safeguard
      let timer: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`Emergency transmission timed out after ${timeoutMs}ms (attempt ${attempt})`));
        }, timeoutMs);
      });

      const opPromise = operation(attempt);
      const result = await Promise.race([opPromise, timeoutPromise]);
      if (timer) clearTimeout(timer);
      return result;
    } catch (error) {
      if (attempt >= maxRetries) {
        // Exceeded all retries
        throw error;
      }

      // Calculate exponential backoff with +/- 20% random jitter
      const jitter = (Math.random() - 0.5) * 0.4 * currentDelay;
      const actualDelay = Math.min(Math.max(Math.round(currentDelay + jitter), 200), maxDelayMs);

      if (options.onRetry) {
        options.onRetry(attempt, maxRetries, actualDelay, error);
      }

      // Pause before next attempt
      await new Promise((resolve) => setTimeout(resolve, actualDelay));
      currentDelay = Math.min(currentDelay * backoffMultiplier, maxDelayMs);
    }
  }
}
