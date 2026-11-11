import { useCallback, useEffect, useState } from 'react';
import {
  getOrCreateBrowserSigner,
  isWebCryptoAvailable,
  rotateBrowserSigner,
  type BrowserSigner,
} from './crypto';

export function useAermSigner() {
  const [signer, setSigner] = useState<BrowserSigner | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!isWebCryptoAvailable()) {
      setError('WebCrypto (crypto.subtle) requires HTTPS or localhost.');
      setLoading(false);
      return;
    }

    getOrCreateBrowserSigner()
      .then((s) => {
        if (active) {
          setSigner(s);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (active) {
          setError(err instanceof Error ? err.message : 'Failed to initialize ES256 keypair');
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const rotate = useCallback(async (customIssuer?: string) => {
    setLoading(true);
    try {
      const fresh = await rotateBrowserSigner(customIssuer);
      setSigner(fresh);
      setError(null);
      return fresh;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to rotate ES256 keypair';
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  return { signer, loading, error, rotate };
}

