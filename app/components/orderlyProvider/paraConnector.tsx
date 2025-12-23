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
        // Validate it's in available chains for this network
        if (availableChainIds.includes(chainId)) {
          console.log('[Para Connector] Restored chain from localStorage:', chainId);
          return chainId;
        }
      }
    } catch (error) {
      console.error('[Para Connector] Error reading from localStorage:', error);
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
      console.log('[Para Connector] Saved chain to localStorage:', chainId);
    } catch (error) {
      console.error('[Para Connector] Error saving to localStorage:', error);
    }
  }, [networkId]);

  // Debug: Log when selectedChainId changes
  useEffect(() => {
    console.log('[Para Connector] selectedChainId changed to:', selectedChainId);
  }, [selectedChainId]);

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
      console.log('[Para Connector] Chain changed, emitting chainChanged event:', prevChainIdRef.current, '->', selectedChainId);

      // Emit to all registered listeners
      const listeners = eventListenersRef.current.get('chainChanged');
      if (listeners && listeners.size > 0) {
        console.log('[Para Connector] Emitting to', listeners.size, 'chainChanged listeners');
        listeners.forEach(listener => {
          try {
            listener(hexChainId);
          } catch (error) {
            console.error('[Para Connector] Error in chainChanged listener:', error);
          }
        });
      } else {
        console.log('[Para Connector] No chainChanged listeners registered');
      }

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

  // Debug: Log account state changes
  useEffect(() => {
    console.log('[Para Connector] Network configuration:', {
      networkId,
      availableChainIds,
      defaultChainId,
      selectedChainId,
    });
    console.log('[Para Connector] Account state:', {
      isConnected: account.isConnected,
      isLoading: account.isLoading,
      connectionType: account.connectionType,
      hasEvm: !!account.external?.evm?.address,
      hasSolana: !!account.external?.solana?.publicKey,
      hasEmbedded: account.embedded?.isConnected,
      evmAddress: account.external?.evm?.address,
      solanaAddress: account.external?.solana?.publicKey?.toString(),
      embeddedWallets: account.embedded?.wallets,
      embeddedData: account.embedded,
      walletData: walletQuery.data,
      walletLoading: walletQuery.isLoading,
    });

    // Deep log embedded wallets structure
    if (account.embedded?.wallets?.length) {
      console.log('[Para Connector] Embedded wallets (stringified):',
        JSON.stringify(account.embedded.wallets, null, 2)
      );
    }

    // Deep log wallet query data structure
    if (walletQuery.data) {
      console.log('[Para Connector] Wallet query data (stringified):',
        JSON.stringify(walletQuery.data, null, 2)
      );
      // Check for provider-related properties
      const wallet = walletQuery.data as ParaWallet | undefined;
      if (wallet) {
        console.log('[Para Connector] Checking for provider:', {
          hasProvider: !!wallet.provider,
          hasGetProvider: typeof wallet.getProvider === 'function',
          hasSigner: !!wallet.signer,
          hasGetSigner: typeof wallet.getSigner === 'function',
          allKeys: Object.keys(wallet),
        });
      }
    }

    // Deep log entire embedded object
    if (account.embedded) {
      console.log('[Para Connector] Embedded object (stringified):',
        JSON.stringify(account.embedded, null, 2)
      );
      // Check for provider-related properties on embedded
      const embedded = account.embedded as ParaEmbedded;
      console.log('[Para Connector] Checking embedded for provider:', {
        hasProvider: !!embedded.provider,
        hasGetProvider: typeof embedded.getProvider === 'function',
        hasSigner: !!embedded.signer,
        hasGetSigner: typeof embedded.getSigner === 'function',
        allKeys: Object.keys(embedded),
      });
    }
  }, [account, walletQuery, networkId, availableChainIds, defaultChainId, selectedChainId]);

  // Map Para account to Orderly WalletState
  const walletState = useMemo(() => {
    console.log('[Para Connector] Building wallet state...');

    // Check if we have an external wallet connected
    const hasEvm = account.external?.evm?.address;
    const hasSolana = account.external?.solana?.publicKey;

    // For embedded wallet, check if connected
    const hasEmbedded = account.embedded?.isConnected && !account.embedded?.isGuestMode;

    // Check if we have wallet data from query
    const hasWalletData = walletQuery.data;

    console.log('[Para Connector] Wallet checks:', { hasEvm, hasSolana, hasEmbedded, hasWalletData: !!hasWalletData });

    if (!hasEvm && !hasSolana && !hasEmbedded && !hasWalletData) {
      console.log('[Para Connector] No wallet detected, returning null');
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
      console.log('[Para Connector] Processing embedded wallet...');

      // For embedded wallet, try multiple approaches to get the address

      // Approach 1: Check embedded.wallets array
      const embedded = account.embedded as ParaEmbedded;
      if (embedded.wallets?.length) {
        console.log('[Para Connector] Approach 1: Checking embedded.wallets array...');
        const evmWallet = embedded.wallets.find((w) => w.chainType === 'EVM' || w.type === 'EVM');
        console.log('[Para Connector] Found EVM wallet:', evmWallet);
        if (evmWallet?.address) {
          address = evmWallet.address;
          namespace = ChainNamespace.evm;
          walletName = 'Para Embedded';
          // Use selectedChainId for multi-chain support
          chainId = selectedChainId;
          console.log('[Para Connector] Extracted address from Approach 1:', address, 'chainId:', chainId);
        }
      }

      // Approach 2: Check walletQuery.data (selected wallet from Para)
      if (!address && walletQuery.data) {
        console.log('[Para Connector] Approach 2: Checking walletQuery.data...');
        const wallet = walletQuery.data as ParaWallet;
        if (wallet.address) {
          address = wallet.address;
          namespace = wallet.chainType === 'SOLANA' ? ChainNamespace.solana : ChainNamespace.evm;
          walletName = 'Para Embedded';
          // Use selectedChainId for multi-chain support
          chainId = selectedChainId;
          console.log('[Para Connector] Extracted address from Approach 2:', address, 'chainId:', chainId);
        }
      }

      // Approach 3: Check if embedded has direct address property
      if (!address && embedded?.address) {
        console.log('[Para Connector] Approach 3: Checking embedded.address...');
        address = embedded.address;
        namespace = ChainNamespace.evm;
        walletName = 'Para Embedded';
        // Use selectedChainId for multi-chain support
        chainId = selectedChainId;
        console.log('[Para Connector] Extracted address from Approach 3:', address, 'chainId:', chainId);
      }
    }

    if (!address) {
      console.log('[Para Connector] No address found, returning null wallet state');
      return null;
    }

    console.log('[Para Connector] Creating wallet state with address:', address, 'chainId:', chainId, 'selectedChainId:', selectedChainId);

    // Create Para Ethers Signer with actual signing capabilities
    const actualChainId = typeof chainId === 'number' ? chainId : defaultChainId;
    const rpcUrl = getRpcUrl(actualChainId);
    console.log('[Para Connector] Using RPC URL:', rpcUrl, 'for chainId:', actualChainId);

    // Create a simple network object with just chainId
    // This prevents network auto-detection which can cause issues
    const ethersProvider = new ethers.JsonRpcProvider(
      rpcUrl,
      actualChainId  // Just pass the chainId directly
    );

    let signer: ParaEthersSigner | null = null;
    if (paraClient && account.isConnected && account.embedded?.wallets?.length) {
      signer = new ParaEthersSigner(paraClient, ethersProvider);
      console.log('[Para Connector] Created ParaEthersSigner with RPC:', rpcUrl, 'chainId:', actualChainId);
    }

    // Update provider state ref
    providerStateRef.current = {
      chainId: actualChainId,
      rpcUrl,
      signer,
      ethersProvider,
    };

    // Emit helper function
    const emit = (eventName: string, ...args: unknown[]) => {
      const listeners = eventListenersRef.current.get(eventName);
      if (listeners) {
        listeners.forEach(listener => {
          try {
            listener(...args);
          } catch (error) {
            console.error(`[Para Connector] Error in ${eventName} listener:`, error);
          }
        });
      }
    };

    // Create or reuse EIP-1193 compatible provider
    // Only create once, then reuse the same instance
    if (!stableProviderRef.current) {
      console.log('[Para Connector] Creating new stable provider instance');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stableProviderRef.current = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      request: async (request: { method: string; params?: any[] }) => {
        console.log('[Para Connector] Provider request:', request.method, request.params);

        // Use current state from ref
        const currentState = providerStateRef.current;
        if (!currentState) {
          throw new Error('Provider state not initialized');
        }

        const { signer: currentSigner, ethersProvider: currentEthersProvider, chainId: currentChainId, rpcUrl: currentRpcUrl } = currentState;

        if (!currentSigner) {
          throw new Error('Para signer not available. Please connect your wallet.');
        }

        try {
          switch (request.method) {
            case 'personal_sign':
            case 'eth_sign': {
              const [message, signerAddress] = request.params || [];
              console.log('[Para Connector] Signing message:', message, 'for address:', signerAddress);
              let signature = await currentSigner.signMessage(ethers.getBytes(message));

              // Normalize V value: Para might return v=0 or v=1, but Ethereum expects v=27 or v=28
              const v = parseInt(signature.slice(-2), 16);
              if (v < 27) {
                const normalizedV = (v + 27).toString(16).padStart(2, '0');
                signature = signature.slice(0, -2) + normalizedV;
                console.log('[Para Connector] Normalized V value from', v, 'to', v + 27);
              }

              console.log('[Para Connector] Signature:', signature);
              return signature;
            }

            case 'eth_signTypedData':
            case 'eth_signTypedData_v4': {
              const [signerAddress, typedData] = request.params || [];
              console.log('[Para Connector] Signing typed data for address:', signerAddress);
              const parsedData = typeof typedData === 'string' ? JSON.parse(typedData) : typedData;
              const { domain, types, message: typedMessage } = parsedData;
              // Remove EIP712Domain from types if present (Ethers adds it automatically)
              const filteredTypes = { ...types };
              delete filteredTypes.EIP712Domain;
              let signature = await currentSigner.signTypedData(domain, filteredTypes, typedMessage);

              // Normalize V value: Para might return v=0 or v=1, but Ethereum expects v=27 or v=28
              // Signature format: 0x + r (64 chars) + s (64 chars) + v (2 chars)
              const v = parseInt(signature.slice(-2), 16);
              if (v < 27) {
                const normalizedV = (v + 27).toString(16).padStart(2, '0');
                signature = signature.slice(0, -2) + normalizedV;
                console.log('[Para Connector] Normalized V value from', v, 'to', v + 27);
              }

              console.log('[Para Connector] Typed data signature:', signature);
              return signature;
            }

            case 'eth_sendTransaction': {
              const [transaction] = request.params || [];
              console.log('[Para Connector] Sending transaction:', transaction);
              const tx = await currentSigner.sendTransaction(transaction);
              const receipt = await tx.wait();
              console.log('[Para Connector] Transaction receipt:', receipt);
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
              // For other methods, try to proxy to the underlying ethers provider
              console.log('[Para Connector] Proxying to ethers provider:', request.method, 'params:', request.params);

              // Special logging for eth_call to debug
              if (request.method === 'eth_call' && request.params) {
                console.log('[Para Connector] eth_call details:', {
                  to: request.params[0]?.to,
                  data: request.params[0]?.data,
                  from: request.params[0]?.from,
                  block: request.params[1],
                  chainId: currentChainId,
                  rpcUrl: currentRpcUrl,
                });

                // Try to make the call directly to verify RPC works
                try {
                  const directResponse = await fetch(currentRpcUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      jsonrpc: '2.0',
                      id: 1,
                      method: request.method,
                      params: request.params,
                    }),
                  });
                  const directResult = await directResponse.json();
                  console.log('[Para Connector] Direct RPC response:', directResult);
                } catch (directError) {
                  console.error('[Para Connector] Direct RPC call failed:', directError);
                }
              }

              try {
                const providerWithSend = currentEthersProvider as { send: (method: string, params: unknown[]) => Promise<unknown> };
                const result = await providerWithSend.send(request.method, request.params || []);
                console.log('[Para Connector] RPC result:', result);
                return result;
              } catch (error) {
                console.error('[Para Connector] RPC call failed:', error);
                // Log the actual response if available
                const errorWithInfo = error as { info?: unknown };
                if (errorWithInfo.info) {
                  console.error('[Para Connector] RPC error info:', errorWithInfo.info);
                }
                throw error;
              }
            }
          }
        } catch (error) {
          console.error('[Para Connector] Provider request error:', error);
          throw error;
        }
      },
      on: (eventName: string, listener: (...args: unknown[]) => void) => {
        if (!eventListenersRef.current.has(eventName)) {
          eventListenersRef.current.set(eventName, new Set());
        }
        eventListenersRef.current.get(eventName)!.add(listener);
        console.log('[Para Connector] Registered listener for', eventName);
      },
      removeListener: (eventName: string, listener: (...args: unknown[]) => void) => {
        const listeners = eventListenersRef.current.get(eventName);
        if (listeners) {
          listeners.delete(listener);
          console.log('[Para Connector] Removed listener for', eventName);
        }
      },
      emit, // Expose emit for debugging
      } as EIP1193Provider;
    } else {
      console.log('[Para Connector] Reusing existing stable provider instance');
    }

    const provider = stableProviderRef.current;

    const finalWalletState = {
      label: walletName,
      icon: '', // Para doesn't expose wallet icons in a simple way
      provider,
      accounts: [{ address }],
      chains: [{ id: chainId, namespace }]
    };

    console.log('[Para Connector] Final wallet state:', finalWalletState);

    return finalWalletState;
  }, [account, walletQuery.data, defaultChainId, paraClient, getRpcUrl, selectedChainId]);

  // Get available chains - return all network chains even before connection
  // This allows users to select a chain before connecting their wallet
  const chains = useMemo(() => {
    const availableChains: Array<{ id: number | string; name: string; namespace: ChainNamespace }> = [];

    // Always include all available chains for the current network
    // This allows chain selection before wallet connection
    availableChainIds.forEach(chainId => {
      availableChains.push({
        id: chainId,
        name: getChainNameByChainId(chainId),
        namespace: ChainNamespace.evm
      });
    });

    console.log('[Para Connector] Returning chains:', availableChains);

    return availableChains;
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
      // Para handles connection through their modal
      return [];
    } catch (error) {
      console.error('Para connect error:', error);
      throw error;
    } finally {
      setConnecting(false);
    }
  };

  // Disconnect function
  const disconnect = async (): Promise<unknown[]> => {
    try {
      console.log('[Para Connector] Disconnect requested');

      // Try to logout using Para client if available
      if (paraClient && typeof (paraClient as { logout?: () => Promise<void> }).logout === 'function') {
        console.log('[Para Connector] Calling paraClient.logout()');
        await (paraClient as { logout: () => Promise<void> }).logout();
      }

      // Clear the wallet provider state
      stableProviderRef.current = null;
      providerStateRef.current = null;

      console.log('[Para Connector] Disconnect completed');
      return [];
    } catch (error) {
      console.error('Para disconnect error:', error);
      throw error;
    }
  };

  // Set chain function
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const setChain = async (options: { chainId: string | number }): Promise<any> => {
    setSettingChain(true);
    try {
      const requestedChainId = typeof options.chainId === 'string'
        ? parseInt(options.chainId, 16) // Convert hex to decimal if needed
        : options.chainId;

      console.log('[Para Connector] setChain requested:', requestedChainId, 'networkId:', networkId, 'isConnected:', account.isConnected);
      console.log('[Para Connector] Available chains for', networkId, ':', availableChainIds);

      // Validate that the requested chain is available for the current network
      if (!availableChainIds.includes(requestedChainId)) {
        console.error('[Para Connector] Chain', requestedChainId, 'not available for', networkId, 'network');
        throw new Error(`Chain ${requestedChainId} is not available for ${networkId} network. Available chains: ${availableChainIds.join(', ')}`);
      }

      // Update selectedChainId and persist to localStorage
      // This preserves chain selection across page refreshes and wallet connections
      console.log('[Para Connector] Updating chain from', selectedChainId, 'to', requestedChainId);
      setAndPersistChainId(requestedChainId);
      console.log('[Para Connector] Chain update requested, new chain:', requestedChainId);

      // For external wallets, chain switching would be handled by the external connector
      if (account.external?.evm?.connector && account.isConnected) {
        console.warn('Chain switching through Para external wallet not yet implemented');
      }

      return { success: true };
    } catch (error) {
      console.error('Para setChain error:', error);
      throw error;
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

  console.log('[Para Connector] Final context value:', {
    connecting: contextValue.connecting,
    wallet: contextValue.wallet,
    connectedChain: contextValue.connectedChain,
    namespace: contextValue.namespace,
    chains: contextValue.chains,
  });

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

  if (!paraApiKey) {
    console.warn('VITE_PARA_API_KEY not set. Para wallet connector may not work properly.');
  }

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
