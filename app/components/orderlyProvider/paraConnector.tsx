import { ReactNode, useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ParaProvider, useModal, useWallet, useAccount, useClient } from "@getpara/react-sdk";
import "@getpara/react-sdk/styles.css";
import { ChainNamespace, type NetworkId } from '@orderly.network/types';
import { WalletConnectorContext, type WalletConnectorContextState, type WalletState } from '@orderly.network/hooks';
import { type EIP1193Provider } from '@web3-onboard/common';
import { getRuntimeConfig } from '@/utils/runtime-config';
import { ParaEthersSigner } from '@getpara/ethers-v6-integration';
import { ethers } from 'ethers';
import { getChainNameByChainId } from '@/utils/chains/chain';

// Type definitions for Para SDK objects
interface ParaWallet {
  chainType?: 'EVM' | 'SOLANA';
  type?: 'EVM' | 'SOLANA';
  address?: string;
  provider?: unknown;
  getProvider?: () => unknown;
  signer?: unknown;
  getSigner?: () => unknown;
}

interface ParaEmbedded {
  isConnected?: boolean;
  isGuestMode?: boolean;
  wallets?: ParaWallet[];
  address?: string;
  provider?: unknown;
  getProvider?: () => unknown;
  signer?: unknown;
  getSigner?: () => unknown;
}

// Create QueryClient outside component to avoid re-creating on every render
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Para Wallet Connector Bridge Component
 *
 * This component bridges Para's wallet system with Orderly's WalletConnectorContextState interface.
 * It wraps the app with ParaProvider and provides Orderly-compatible wallet connection state.
 */
const ParaWalletBridge = ({
  children,
  networkId,
}: {
  children: ReactNode;
  networkId: NetworkId;
}) => {
  const { openModal } = useModal();
  const walletQuery = useWallet();
  const account = useAccount();
  const paraClient = useClient();

  const [connecting, setConnecting] = useState(false);
  const [settingChain, setSettingChain] = useState(false);

  // Get chains available for the current network (mainnet or testnet)
  const availableChainIds = useMemo(() => {
    const chainsConfig = networkId === 'mainnet'
      ? getRuntimeConfig('VITE_ORDERLY_MAINNET_CHAINS')
      : getRuntimeConfig('VITE_ORDERLY_TESTNET_CHAINS');

    return chainsConfig?.split(',').map(id => parseInt(id.trim(), 10)) || [];
  }, [networkId]);

  // Get default chain from config
  const defaultChainId = useMemo(() => {
    const configDefault = parseInt(getRuntimeConfig('VITE_DEFAULT_CHAIN') || '1329', 10);
    // Ensure default chain is in the available chains for this network
    return availableChainIds.includes(configDefault) ? configDefault : availableChainIds[0] || configDefault;
  }, [availableChainIds]);

  // Get initial chain from localStorage or default
  const getInitialChainId = (): number => {
    try {
      const stored = localStorage.getItem(`para_selected_chain_${networkId}`);
      if (stored) {
        const chainId = parseInt(stored, 10);
        if (availableChainIds.includes(chainId)) {
          return chainId;
        }
      }
    } catch {
      // Ignore localStorage errors
    }
    return defaultChainId;
  };

  // Track currently selected chain (for multi-chain support)
  const [selectedChainId, setSelectedChainId] = useState<number>(getInitialChainId);

  // Wrap setSelectedChainId to also save to localStorage
  const setAndPersistChainId = useCallback((chainId: number) => {
    setSelectedChainId(chainId);
    try {
      localStorage.setItem(`para_selected_chain_${networkId}`, chainId.toString());
    } catch {
      // Ignore localStorage errors
    }
  }, [networkId]);

  // Store event listeners for the provider
  const eventListenersRef = useRef<Map<string, Set<(...args: unknown[]) => void>>>(new Map());

  // Store the previous chainId to detect changes
  const prevChainIdRef = useRef<number>(defaultChainId);

  // Store current provider state (updated without recreating provider object)
  const providerStateRef = useRef<{
    chainId: number;
    rpcUrl: string;
    signer: ParaEthersSigner | null;
    ethersProvider: ethers.JsonRpcProvider;
  } | null>(null);

  // Create a stable provider instance that doesn't get recreated
  const stableProviderRef = useRef<EIP1193Provider | null>(null);

  // Emit chainChanged event when chain changes
  useEffect(() => {
    if (selectedChainId !== prevChainIdRef.current) {
      const hexChainId = `0x${selectedChainId.toString(16)}`;
      const listeners = eventListenersRef.current.get('chainChanged');
      listeners?.forEach(listener => {
        try {
          listener(hexChainId);
        } catch {
          // Ignore listener errors
        }
      });
      prevChainIdRef.current = selectedChainId;
    }
  }, [selectedChainId]);

  // Get RPC URL for the chain - using reliable public RPC endpoints
  const getRpcUrl = useCallback((chainId: number): string => {
    // Map chain IDs to RPC URLs based on network type
    const mainnetRpcUrls: Record<number, string> = {
      1: 'https://ethereum-rpc.publicnode.com', // Ethereum mainnet
      1329: 'https://evm-rpc.sei-apis.com', // Sei mainnet
      80094: 'https://berachain.drpc.org', // Berachain
      8453: 'https://mainnet.base.org', // Base mainnet (official)
      56: 'https://bsc-dataseed1.binance.org', // BSC mainnet (official)
    };

    const testnetRpcUrls: Record<number, string> = {
      421614: 'https://sepolia-rollup.arbitrum.io/rpc', // Arbitrum Sepolia
      97: 'https://data-seed-prebsc-1-s1.binance.org:8545', // BSC Testnet
      10143: 'https://sepolia.base.org', // Base Sepolia
      11124: 'https://rpc.test.abs.xyz', // Abstract Testnet
      901901901: 'https://rpc.test.abs.xyz', // Another testnet chain
    };

    const rpcUrls = networkId === 'mainnet' ? mainnetRpcUrls : testnetRpcUrls;
    return rpcUrls[chainId] || mainnetRpcUrls[chainId] || 'https://ethereum-rpc.publicnode.com';
  }, [networkId]);

  // Map Para account to Orderly WalletState
  const walletState = useMemo(() => {
    // Check if we have an external wallet connected
    const hasEvm = account.external?.evm?.address;
    const hasSolana = account.external?.solana?.publicKey;

    // For embedded wallet, check if connected
    const hasEmbedded = account.embedded?.isConnected && !account.embedded?.isGuestMode;

    // Check if we have wallet data from query
    const hasWalletData = walletQuery.data;

    if (!hasEvm && !hasSolana && !hasEmbedded && !hasWalletData) {
      return null;
    }

    // Prioritize external wallets over embedded
    let address: string | undefined;
    let namespace: ChainNamespace = ChainNamespace.evm;
    let walletName = 'Para Wallet';
    let chainId: number | string = 1;

    if (hasEvm && account.external.evm.address) {
      address = account.external.evm.address;
      namespace = ChainNamespace.evm;
      walletName = account.external.evm.connector?.name || 'Para EVM';
      chainId = account.external.evm.chainId || 1;
    } else if (hasSolana && account.external.solana.publicKey) {
      address = account.external.solana.publicKey.toString();
      namespace = ChainNamespace.solana;
      walletName = account.external.solana.name || 'Para Solana';
      chainId = 'solana-mainnet';
    } else if (hasEmbedded) {
      // For embedded wallet, try multiple approaches to get the address
      const embedded = account.embedded as ParaEmbedded;

      // Approach 1: Check embedded.wallets array
      if (embedded.wallets?.length) {
        const evmWallet = embedded.wallets.find((w) => w.chainType === 'EVM' || w.type === 'EVM');
        if (evmWallet?.address) {
          address = evmWallet.address;
          namespace = ChainNamespace.evm;
          walletName = 'Para Embedded';
          chainId = selectedChainId;
        }
      }

      // Approach 2: Check walletQuery.data (selected wallet from Para)
      if (!address && walletQuery.data) {
        const wallet = walletQuery.data as ParaWallet;
        if (wallet.address) {
          address = wallet.address;
          namespace = wallet.chainType === 'SOLANA' ? ChainNamespace.solana : ChainNamespace.evm;
          walletName = 'Para Embedded';
          chainId = selectedChainId;
        }
      }

      // Approach 3: Check if embedded has direct address property
      if (!address && embedded?.address) {
        address = embedded.address;
        namespace = ChainNamespace.evm;
        walletName = 'Para Embedded';
        chainId = selectedChainId;
      }
    }

    if (!address) {
      return null;
    }

    // Create Para Ethers Signer with actual signing capabilities
    const actualChainId = typeof chainId === 'number' ? chainId : defaultChainId;
    const rpcUrl = getRpcUrl(actualChainId);

    // Create a simple network object with just chainId
    // This prevents network auto-detection which can cause issues
    const ethersProvider = new ethers.JsonRpcProvider(
      rpcUrl,
      actualChainId  // Just pass the chainId directly
    );

    let signer: ParaEthersSigner | null = null;
    if (paraClient && account.isConnected && account.embedded?.wallets?.length) {
      signer = new ParaEthersSigner(paraClient, ethersProvider);
    }

    // Update provider state ref
    providerStateRef.current = {
      chainId: actualChainId,
      rpcUrl,
      signer,
      ethersProvider,
    };

    // Create or reuse EIP-1193 compatible provider
    // Only create once, then reuse the same instance
    if (!stableProviderRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stableProviderRef.current = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      request: async (request: { method: string; params?: any[] }) => {
        const currentState = providerStateRef.current;
        if (!currentState) {
          throw new Error('Provider state not initialized');
        }

        const { signer: currentSigner, ethersProvider: currentEthersProvider, chainId: currentChainId } = currentState;

        if (!currentSigner) {
          throw new Error('Para signer not available. Please connect your wallet.');
        }

        switch (request.method) {
          case 'personal_sign':
          case 'eth_sign': {
            const [message] = request.params || [];
            let signature = await currentSigner.signMessage(ethers.getBytes(message));

            // Normalize V value: Para might return v=0 or v=1, but Ethereum expects v=27 or v=28
            const v = parseInt(signature.slice(-2), 16);
            if (v < 27) {
              const normalizedV = (v + 27).toString(16).padStart(2, '0');
              signature = signature.slice(0, -2) + normalizedV;
            }

            return signature;
          }

          case 'eth_signTypedData':
          case 'eth_signTypedData_v4': {
            const [, typedData] = request.params || [];
            const parsedData = typeof typedData === 'string' ? JSON.parse(typedData) : typedData;
            const { domain, types, message: typedMessage } = parsedData;
            // Remove EIP712Domain from types if present (Ethers adds it automatically)
            const filteredTypes = { ...types };
            delete filteredTypes.EIP712Domain;
            let signature = await currentSigner.signTypedData(domain, filteredTypes, typedMessage);

            // Normalize V value: Para might return v=0 or v=1, but Ethereum expects v=27 or v=28
            const v = parseInt(signature.slice(-2), 16);
            if (v < 27) {
              const normalizedV = (v + 27).toString(16).padStart(2, '0');
              signature = signature.slice(0, -2) + normalizedV;
            }

            return signature;
          }

          case 'eth_sendTransaction': {
            const [transaction] = request.params || [];
            const tx = await currentSigner.sendTransaction(transaction);
            const receipt = await tx.wait();
            return receipt?.hash;
          }

          case 'eth_accounts':
          case 'eth_requestAccounts': {
            return [address];
          }

          case 'eth_chainId': {
            return `0x${currentChainId.toString(16)}`;
          }

          default: {
            // For other methods, proxy to the underlying ethers provider
            const providerWithSend = currentEthersProvider as { send: (method: string, params: unknown[]) => Promise<unknown> };
            return providerWithSend.send(request.method, request.params || []);
          }
        }
      },
      on: (eventName: string, listener: (...args: unknown[]) => void) => {
        if (!eventListenersRef.current.has(eventName)) {
          eventListenersRef.current.set(eventName, new Set());
        }
        eventListenersRef.current.get(eventName)!.add(listener);
      },
      removeListener: (eventName: string, listener: (...args: unknown[]) => void) => {
        eventListenersRef.current.get(eventName)?.delete(listener);
      },
      } as EIP1193Provider;
    }

    const provider = stableProviderRef.current;

    return {
      label: walletName,
      icon: '',
      provider,
      accounts: [{ address }],
      chains: [{ id: chainId, namespace }]
    };
  }, [account, walletQuery.data, defaultChainId, paraClient, getRpcUrl, selectedChainId]);

  // Get available chains - return all network chains even before connection
  const chains = useMemo(() => {
    return availableChainIds.map(chainId => ({
      id: chainId,
      name: getChainNameByChainId(chainId),
      namespace: ChainNamespace.evm
    }));
  }, [availableChainIds]);

  // Get connected chain
  const connectedChain = useMemo(() => {
    if (account.external?.evm?.address) {
      return {
        id: account.external.evm.chainId || 1,
        namespace: ChainNamespace.evm
      };
    }

    if (account.external?.solana?.publicKey) {
      return {
        id: 'solana-mainnet',
        namespace: ChainNamespace.solana
      };
    }

    // Check embedded wallet - use selectedChainId for multi-chain support
    const embedded = account.embedded as ParaEmbedded | undefined;
    if (embedded?.isConnected && embedded.wallets?.length) {
      const evmWallet = embedded.wallets.find((w) => w.chainType === 'EVM' || w.type === 'EVM');
      if (evmWallet) {
        return {
          id: selectedChainId,
          namespace: ChainNamespace.evm
        };
      }
    }

    return null;
  }, [account, selectedChainId]);

  // Current namespace
  const namespace = useMemo(() => {
    if (account.external?.evm?.address) {
      return ChainNamespace.evm;
    }

    if (account.external?.solana?.publicKey) {
      return ChainNamespace.solana;
    }

    const embedded = account.embedded as ParaEmbedded | undefined;
    if (embedded?.isConnected && embedded.wallets?.length) {
      const evmWallet = embedded.wallets.find((w) => w.chainType === 'EVM' || w.type === 'EVM');
      if (evmWallet) {
        return ChainNamespace.evm;
      }
    }

    return null;
  }, [account]);

  // Connect function - opens Para modal
  const connect = async (): Promise<WalletState[]> => {
    setConnecting(true);
    try {
      openModal();
      return [];
    } finally {
      setConnecting(false);
    }
  };

  // Disconnect function
  const disconnect = async (): Promise<unknown[]> => {
    // Try to logout using Para client if available
    if (paraClient && typeof (paraClient as { logout?: () => Promise<void> }).logout === 'function') {
      await (paraClient as { logout: () => Promise<void> }).logout();
    }

    // Clear the wallet provider state
    stableProviderRef.current = null;
    providerStateRef.current = null;
    return [];
  };

  // Set chain function
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setChain = async (options: { chainId: string | number }): Promise<any> => {
    setSettingChain(true);
    try {
      const requestedChainId = typeof options.chainId === 'string'
        ? parseInt(options.chainId, 16)
        : options.chainId;

      // Validate that the requested chain is available for the current network
      if (!availableChainIds.includes(requestedChainId)) {
        throw new Error(`Chain ${requestedChainId} is not available for ${networkId} network. Available chains: ${availableChainIds.join(', ')}`);
      }

      setAndPersistChainId(requestedChainId);
      return { success: true };
    } finally {
      setSettingChain(false);
    }
  };

  // Create context value
  const contextValue: WalletConnectorContextState = {
    connect,
    disconnect,
    connecting: connecting || account.isLoading,
    setChain,
    chains,
    wallet: walletState,
    connectedChain,
    settingChain,
    namespace
  };

  return (
    <WalletConnectorContext.Provider value={contextValue}>
      {children}
    </WalletConnectorContext.Provider>
  );
};

/**
 * Para Connector - Main export
 *
 * Wraps children with ParaProvider and WalletConnectorContext
 */
const ParaConnector = ({ children, networkId }: {
  children: ReactNode;
  networkId: NetworkId;
}) => {
  const paraApiKey = getRuntimeConfig('VITE_PARA_API_KEY');
  const appName = getRuntimeConfig('VITE_ORDERLY_BROKER_NAME') || 'Orderly Network';

  return (
    <QueryClientProvider client={queryClient}>
      <ParaProvider
        paraClientConfig={{
          apiKey: paraApiKey || '',
        }}
        config={{
          appName,
        }}
      >
        <ParaWalletBridge networkId={networkId}>
          {children}
        </ParaWalletBridge>
      </ParaProvider>
    </QueryClientProvider>
  );
};

export default ParaConnector;
