import { useEffect, useState, useCallback, useRef } from 'react';

export interface PwaState {
  offlineReady: boolean;
  needRefresh: boolean;
  isUpdating: boolean;
  isInstallable: boolean;
  isInstalled: boolean;
  isStandalone: boolean;
  isIos: boolean;
  browserOnline: boolean;
  swRegistrationError: string | null;
}

export interface UsePwaReturn extends PwaState {
  updateServiceWorker: (reloadPage?: boolean) => Promise<void>;
  promptInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  dismissInstallPrompt: () => void;
  resetInstallPromptDismissal: () => void;
}

const STORAGE_DISMISSED_KEY = 'relay-miden-pwa-install-dismissed';

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: 'accepted' | 'dismissed';
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function usePwa(): UsePwaReturn {
  const [offlineReady, setOfflineReady] = useState(false);
  const [needRefresh, setNeedRefresh] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isInstallable, setIsInstallable] = useState(false);
  const [isStandalone, setIsStandalone] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
  });
  const [isInstalled, setIsInstalled] = useState(() => {
    if (typeof window === 'undefined') return false;
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
  });
  const [isIos] = useState(() => {
    if (typeof window === 'undefined') return false;
    const isStandaloneMode =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    return (
      (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
        (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) &&
      !isStandaloneMode
    );
  });
  const [browserOnline, setBrowserOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true,
  );
  const [swRegistrationError, setSwRegistrationError] = useState<string | null>(null);

  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const updateSwFnRef = useRef<((reload?: boolean) => Promise<void>) | null>(null);

  // 1. Standalone change listener
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const standaloneMedia = window.matchMedia('(display-mode: standalone)');
    const onMediaChange = (e: MediaQueryListEvent) => {
      setIsStandalone(e.matches);
      if (e.matches) {
        setIsInstalled(true);
      }
    };
    try {
      standaloneMedia.addEventListener('change', onMediaChange);
    } catch {
      standaloneMedia.addListener(onMediaChange);
    }

    return () => {
      try {
        standaloneMedia.removeEventListener('change', onMediaChange);
      } catch {
        standaloneMedia.removeListener(onMediaChange);
      }
    };
  }, []);

  // 2. Online / Offline browser lifecycle
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => setBrowserOnline(true);
    const handleOffline = () => setBrowserOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // 3. Installation prompt handling (beforeinstallprompt & appinstalled)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const isDismissed = localStorage.getItem(STORAGE_DISMISSED_KEY) === 'true';

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      if (!isDismissed) {
        setIsInstallable(true);
      }
    };

    const handleAppInstalled = () => {
      setIsInstalled(true);
      setIsInstallable(false);
      deferredPromptRef.current = null;
      localStorage.removeItem(STORAGE_DISMISSED_KEY);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // 4. Service worker registration & lifecycle
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
      return;
    }

    let active = true;

    // Dynamically register SW using virtual:pwa-register
    import('virtual:pwa-register')
      .then(({ registerSW }) => {
        if (!active) return;
        const updateSW = registerSW({
          immediate: true,
          onNeedRefresh() {
            if (active) {
              setNeedRefresh(true);
            }
          },
          onOfflineReady() {
            if (active) {
              setOfflineReady(true);
            }
          },
          onRegistered(r: ServiceWorkerRegistration | undefined) {
            if (r) {
              // Check if already active
              if (r.active) {
                setOfflineReady(true);
              }
              // Poll for updates periodically (e.g. every hour)
              setInterval(
                () => {
                  void r.update();
                },
                60 * 60 * 1000,
              );
            }
          },
          onRegisterError(error: unknown) {
            console.error('PWA service worker registration failed:', error);
            if (active) {
              setSwRegistrationError(
                error instanceof Error ? error.message : 'Service worker registration failed',
              );
            }
          },
        });
        updateSwFnRef.current = updateSW;
      })
      .catch((err) => {
        // Fallback or non-Vite environment
        console.debug('PWA registration module skipped:', err);
      });

    return () => {
      active = false;
    };
  }, []);

  // Update activation action
  const updateServiceWorker = useCallback(async (reloadPage = true) => {
    if (updateSwFnRef.current) {
      setIsUpdating(true);
      try {
        await updateSwFnRef.current(reloadPage);
      } catch (err) {
        setIsUpdating(false);
        setSwRegistrationError(err instanceof Error ? err.message : 'Update failed');
      }
    }
  }, []);

  // Prompt install action
  const promptInstall = useCallback(async (): Promise<'accepted' | 'dismissed' | 'unavailable'> => {
    const promptEvent = deferredPromptRef.current;
    if (!promptEvent) {
      return 'unavailable';
    }

    try {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === 'accepted') {
        setIsInstalled(true);
        setIsInstallable(false);
        deferredPromptRef.current = null;
        return 'accepted';
      } else {
        localStorage.setItem(STORAGE_DISMISSED_KEY, 'true');
        setIsInstallable(false);
        return 'dismissed';
      }
    } catch (err) {
      console.error('Install prompt error:', err);
      return 'unavailable';
    }
  }, []);

  // Dismiss install action
  const dismissInstallPrompt = useCallback(() => {
    localStorage.setItem(STORAGE_DISMISSED_KEY, 'true');
    setIsInstallable(false);
  }, []);

  // Reset dismissal (allows user to reconsider in Settings)
  const resetInstallPromptDismissal = useCallback(() => {
    localStorage.removeItem(STORAGE_DISMISSED_KEY);
    if (deferredPromptRef.current) {
      setIsInstallable(true);
    }
  }, []);

  return {
    offlineReady,
    needRefresh,
    isUpdating,
    isInstallable,
    isInstalled,
    isStandalone,
    isIos,
    browserOnline,
    swRegistrationError,
    updateServiceWorker,
    promptInstall,
    dismissInstallPrompt,
    resetInstallPromptDismissal,
  };
}
