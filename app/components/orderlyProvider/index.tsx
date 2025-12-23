/**
 * ORDERLY PROVIDER - Scalable Wallet Provider System
 *
 * This component manages wallet authentication across multiple providers.
 *
 * HOW TO ADD A NEW WALLET PROVIDER:
 *
 * 1. Create connector component (e.g., app/components/orderlyProvider/rainbowkitConnector.tsx):
 *    ```tsx
 *    import { ReactNode } from 'react';
 *    import { RainbowKitProvider } from '@rainbow-me/rainbowkit';
 *    // ... setup provider with networkId prop
 *    export default RainbowkitConnector;
 *    ```
 *
 * 2. Add to PROVIDER_REGISTRY below:
 *    ```tsx
 *    'para': {
 *      Component: lazy(() => import("@/components/orderlyProvider/paraConnector"))
 *    }
 *    ```
 *
 * 3. Add provider option to WalletProviderSelector.tsx:
 *    ```tsx
 *    {
 *      type: 'para',
 *      name: 'Para',
 *      description: 'Universal wallet (EVM, Solana, Cosmos)',
 *      icon: '/images/walletproviders/para.png',
 *    }
 *    ```
 *
 * That's it! The system will automatically handle loading and rendering.
 */

import {
  ReactNode,
  useCallback,
  useState,
  useEffect,
  lazy,
  Suspense,
} from "react";
import { OrderlyAppProvider } from "@orderly.network/react-app";
import { useOrderlyConfig } from "@/utils/config";
import type { NetworkId } from "@orderly.network/types";
import {
  LocaleProvider,
  LocaleCode,
  LocaleEnum,
  defaultLanguages,
} from "@orderly.network/i18n";
import { withBasePath } from "@/utils/base-path";
import { getSEOConfig, getUserLanguage } from "@/utils/seo";
import {
  getRuntimeConfigBoolean,
  getRuntimeConfigArray,
  getRuntimeConfig,
} from "@/utils/runtime-config";
import { createSymbolDataAdapter } from "@/utils/symbol-filter";
import { DemoGraduationChecker } from "@/components/DemoGraduationChecker";
import ServiceDisclaimerDialog from "./ServiceRestrictionsDialog";
import {
  WalletProviderSelector,
  type WalletProviderType,
} from "@/components/WalletProviderSelector";
import { WalletProviderLoadingState } from "@/components/WalletProviderLoadingState";
import { useIpRestriction } from "@/hooks/useIpRestriction";

// ============================================================================
// WALLET PROVIDER REGISTRY
// ============================================================================
// To add a new wallet provider:
// 1. Create a new connector component (e.g., rainbowkitConnector.tsx)
// 2. Add it to the registry below with lazy loading
// 3. Add the provider option to WalletProviderSelector
// ============================================================================

interface ProviderComponent {
  Component: React.LazyExoticComponent<
    React.FC<{ children: ReactNode; networkId: NetworkId }>
  >;
}

const PROVIDER_REGISTRY: Record<WalletProviderType, ProviderComponent> = {
  privy: {
    Component: lazy(
      () => import("@/components/orderlyProvider/privyConnector")
    ),
  },
  "web3-onboard": {
    Component: lazy(
      () => import("@/components/orderlyProvider/walletConnector")
    ),
  },
  para: {
    Component: lazy(() => import("@/components/orderlyProvider/paraConnector")),
  },
  // Add more providers here as needed:
  // 'rainbowkit': {
  //   Component: lazy(() => import("@/components/orderlyProvider/rainbowkitConnector"))
  // },
  // 'particle': {
  //   Component: lazy(() => import("@/components/orderlyProvider/particleConnector"))
  // },
};

// ============================================================================
// PROVIDER RENDERER - Dynamically renders selected provider from registry
// ============================================================================
const ProviderRenderer = ({
  selectedProvider,
  networkId,
  children,
}: {
  selectedProvider: WalletProviderType;
  networkId: NetworkId;
  children: ReactNode;
}) => {
  const providerConfig = PROVIDER_REGISTRY[selectedProvider];

  if (!providerConfig) {
    console.error(
      `Provider "${selectedProvider}" not found in registry. Falling back to web3-onboard.`
    );
    const fallbackConfig = PROVIDER_REGISTRY["web3-onboard"];
    const FallbackComponent = fallbackConfig.Component;
    return (
      <FallbackComponent networkId={networkId}>{children}</FallbackComponent>
    );
  }

  const ProviderComponent = providerConfig.Component;
  return (
    <div key={selectedProvider}>
      <ProviderComponent networkId={networkId}>{children}</ProviderComponent>
    </div>
  );
};

const NETWORK_ID_KEY = "orderly_network_id";

const getNetworkId = (): NetworkId => {
  if (typeof window === "undefined") return "mainnet";

  const disableMainnet = getRuntimeConfigBoolean("VITE_DISABLE_MAINNET");
  const disableTestnet = getRuntimeConfigBoolean("VITE_DISABLE_TESTNET");

  if (disableMainnet && !disableTestnet) {
    return "testnet";
  }

  if (disableTestnet && !disableMainnet) {
    return "mainnet";
  }

  return (localStorage.getItem(NETWORK_ID_KEY) as NetworkId) || "mainnet";
};

const setNetworkId = (networkId: NetworkId) => {
  if (typeof window !== "undefined") {
    localStorage.setItem(NETWORK_ID_KEY, networkId);
  }
};

const getAvailableLanguages = (): string[] => {
  const languages = getRuntimeConfigArray("VITE_AVAILABLE_LANGUAGES");

  return languages.length > 0 ? languages : ["en"];
};

const getDefaultLanguage = (): LocaleCode => {
  const seoConfig = getSEOConfig();
  const userLanguage = getUserLanguage();
  const availableLanguages = getAvailableLanguages();

  if (typeof window !== "undefined") {
    const urlParams = new URLSearchParams(window.location.search);
    const langParam = urlParams.get("lang");
    if (langParam && availableLanguages.includes(langParam)) {
      return langParam as LocaleCode;
    }
  }

  if (seoConfig.language && availableLanguages.includes(seoConfig.language)) {
    return seoConfig.language as LocaleCode;
  }

  if (availableLanguages.includes(userLanguage)) {
    return userLanguage as LocaleCode;
  }

  return (availableLanguages[0] || "en") as LocaleCode;
};

const OrderlyProvider = (props: { children: ReactNode }) => {
  const config = useOrderlyConfig();
  const networkId = getNetworkId();
  const { isRestricted } = useIpRestriction();

  const [showProviderSelector, setShowProviderSelector] = useState(false);
  const [selectedProvider, setSelectedProvider] =
    useState<WalletProviderType>("web3-onboard");
  const [isAutoClicking, setIsAutoClicking] = useState(false);

  console.log("[OrderlyProvider v6] Selected provider:", selectedProvider);

  // Always intercept "Connect Wallet" button clicks to show provider selector
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;

      // Don't intercept clicks inside the provider selector modal
      if (target.closest("[data-wallet-provider-modal]")) {
        return;
      }

      // Don't intercept if we're auto-clicking
      if (isAutoClicking) {
        return;
      }

      // Check if this is a connect wallet button click
      const isConnectButton =
        target.closest('[class*="connect"]') ||
        target
          .closest("button")
          ?.textContent?.toLowerCase()
          .includes("connect");

      if (isConnectButton) {
        console.log(
          "[OrderlyProvider] Connect wallet clicked, showing provider selector"
        );
        e.preventDefault();
        e.stopPropagation();
        setShowProviderSelector(true);
      }
    };

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [isAutoClicking]);

  const handleProviderSelect = (type: WalletProviderType) => {
    console.log("[OrderlyProvider] Provider selected:", type);
    setSelectedProvider(type);
    setShowProviderSelector(false);

    // Set flag to prevent click interception during auto-click
    setIsAutoClicking(true);

    // Auto-click connect button after provider renders with retry logic
    const tryAutoClick = (attempts = 0, maxAttempts = 20) => {
      if (attempts >= maxAttempts) {
        console.log("[OrderlyProvider] Max auto-click attempts reached");
        setIsAutoClicking(false);
        return;
      }

      const connectButton = document.querySelector(
        'button[class*="connect"], button[id*="connect"]'
      ) as HTMLElement;

      if (
        connectButton &&
        connectButton.textContent?.toLowerCase().includes("connect")
      ) {
        console.log(
          "[OrderlyProvider] Auto-clicking connect button for",
          type,
          "after",
          attempts,
          "attempts"
        );
        connectButton.click();

        // Reset flag after auto-click completes
        setTimeout(() => {
          setIsAutoClicking(false);
        }, 100);
      } else {
        // Retry after 200ms
        setTimeout(() => tryAutoClick(attempts + 1, maxAttempts), 200);
      }
    };

    // Start trying after initial delay
    setTimeout(() => tryAutoClick(), 500);
  };

  const parseChainIds = (
    envVar: string | undefined
  ): Array<{ id: number }> | undefined => {
    if (!envVar) return undefined;
    return envVar
      .split(",")
      .map((id) => id.trim())
      .filter((id) => id)
      .map((id) => ({ id: parseInt(id, 10) }))
      .filter((chain) => !isNaN(chain.id));
  };

  const parseDefaultChain = (
    envVar: string | undefined
  ): { mainnet: { id: number } } | undefined => {
    if (!envVar) return undefined;

    const chainId = parseInt(envVar.trim(), 10);
    return !isNaN(chainId) ? { mainnet: { id: chainId } } : undefined;
  };

  const disableMainnet = getRuntimeConfigBoolean("VITE_DISABLE_MAINNET");
  const mainnetChains = disableMainnet
    ? []
    : parseChainIds(getRuntimeConfig("VITE_ORDERLY_MAINNET_CHAINS"));
  const disableTestnet = getRuntimeConfigBoolean("VITE_DISABLE_TESTNET");
  const testnetChains = disableTestnet
    ? []
    : parseChainIds(getRuntimeConfig("VITE_ORDERLY_TESTNET_CHAINS"));

  const chainFilter =
    mainnetChains || testnetChains
      ? {
          ...(mainnetChains && { mainnet: mainnetChains }),
          ...(testnetChains && { testnet: testnetChains }),
        }
      : undefined;

  const defaultChain = parseDefaultChain(
    getRuntimeConfig("VITE_DEFAULT_CHAIN")
  );

  const dataAdapter = createSymbolDataAdapter();

  const onChainChanged = useCallback(
    (_chainId: number, { isTestnet }: { isTestnet: boolean }) => {
      const currentNetworkId = getNetworkId();
      if (
        (isTestnet && currentNetworkId === "mainnet") ||
        (!isTestnet && currentNetworkId === "testnet")
      ) {
        const newNetworkId: NetworkId = isTestnet ? "testnet" : "mainnet";
        setNetworkId(newNetworkId);

        setTimeout(() => {
          window.location.reload();
        }, 100);
      }
    },
    []
  );

  const onLanguageChanged = async (lang: LocaleCode) => {
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      if (lang === LocaleEnum.en) {
        url.searchParams.delete("lang");
      } else {
        url.searchParams.set("lang", lang);
      }
      window.history.replaceState({}, "", url.toString());
    }
  };

  const loadPath = (lang: LocaleCode) => {
    const availableLanguages = getAvailableLanguages();

    if (!availableLanguages.includes(lang)) {
      return [];
    }

    if (lang === LocaleEnum.en) {
      return withBasePath(`/locales/extend/${lang}.json`);
    }
    return [
      withBasePath(`/locales/${lang}.json`),
      withBasePath(`/locales/extend/${lang}.json`),
    ];
  };

  const defaultLanguage = getDefaultLanguage();

  const availableLanguages = getAvailableLanguages();
  const filteredLanguages = defaultLanguages.filter((lang) =>
    availableLanguages.includes(lang.localCode)
  );

  if (isRestricted) {
    return (
      <>
        <ServiceDisclaimerDialog isRestricted={isRestricted} />
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', background: '#101014', color: '#fff', fontSize: '2rem', fontWeight: 'bold' }}>
          Service not available in your region.
        </div>
      </>
    );
  }

  const appProvider = (
    <OrderlyAppProvider
      brokerId={getRuntimeConfig("VITE_ORDERLY_BROKER_ID")}
      brokerName={getRuntimeConfig("VITE_ORDERLY_BROKER_NAME")}
      networkId={networkId}
      onChainChanged={onChainChanged}
      appIcons={config.orderlyAppProvider.appIcons}
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      {...(chainFilter && ({ chainFilter } as any))}
      defaultChain={defaultChain}
      dataAdapter={dataAdapter}
    >
      <DemoGraduationChecker />
      <ServiceDisclaimerDialog isRestricted={false} />
      {props.children}
    </OrderlyAppProvider>
  );

  return (
    <LocaleProvider
      onLanguageChanged={onLanguageChanged}
      backend={{ loadPath }}
      locale={defaultLanguage}
      languages={filteredLanguages}
    >
      <WalletProviderSelector
        isOpen={showProviderSelector}
        onSelect={handleProviderSelect}
        onClose={() => setShowProviderSelector(false)}
      />
      <Suspense fallback={<WalletProviderLoadingState />}>
        <ProviderRenderer
          selectedProvider={selectedProvider}
          networkId={networkId}
        >
          {appProvider}
        </ProviderRenderer>
      </Suspense>
    </LocaleProvider>
  );
};

export default OrderlyProvider;
