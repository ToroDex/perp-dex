import type { WalletInit, EIP1193Provider } from "@web3-onboard/common";

/**
 * Gate Wallet Web3-Onboard Integration Module
 *
 * This module provides Gate Wallet support for Web3-Onboard.
 * Gate Wallet may inject its provider at multiple locations:
 * - window.gatewallet (with request method)
 * - window.gatewallet.ethereum (nested provider)
 * - window.ethereum (with isGateWallet flag)
 * - window.ethereum.providers[] (in multi-wallet environments)
 */

const GATE_WALLET_ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="6" fill="#2354E6"/>
  <path d="M16 6C10.477 6 6 10.477 6 16s4.477 10 10 10 10-4.477 10-10S21.523 6 16 6zm0 18c-4.411 0-8-3.589-8-8s3.589-8 8-8 8 3.589 8 8-3.589 8-8 8zm4-8c0 2.209-1.791 4-4 4s-4-1.791-4-4 1.791-4 4-4v4h4z" fill="#fff"/>
</svg>`;

interface GateWalletProvider extends EIP1193Provider {
  isGateWallet?: boolean;
}

interface GateWalletNamespace {
  ethereum?: unknown;
  request?: EIP1193Provider["request"];
  on?: EIP1193Provider["on"];
  removeListener?: EIP1193Provider["removeListener"];
  isGateWallet?: boolean;
}

interface EthereumWithProviders {
  isGateWallet?: boolean;
  providers?: GateWalletProvider[];
  request?: EIP1193Provider["request"];
}

declare global {
  interface Window {
    gatewallet?: GateWalletNamespace;
  }
}

/**
 * Type guard to check if an object is a valid EIP-1193 provider
 */
function isValidProvider(obj: unknown): obj is EIP1193Provider {
  return (
    typeof obj === "object" &&
    obj !== null &&
    typeof (obj as EIP1193Provider).request === "function"
  );
}

/**
 * Get the ethereum object from window with proper typing
 */
function getWindowEthereum(): EthereumWithProviders | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (window as any).ethereum as EthereumWithProviders | undefined;
}

/**
 * Attempts to find the Gate Wallet provider from various injection points
 */
function getGateWalletProvider(): EIP1193Provider | null {
  if (typeof window === "undefined") {
    return null;
  }

  // Priority 1: window.gatewallet itself as provider
  if (window.gatewallet && isValidProvider(window.gatewallet)) {
    return window.gatewallet as unknown as EIP1193Provider;
  }

  // Priority 2: window.gatewallet.ethereum (nested provider)
  if (window.gatewallet?.ethereum && isValidProvider(window.gatewallet.ethereum)) {
    return window.gatewallet.ethereum as EIP1193Provider;
  }

  const ethereum = getWindowEthereum();

  // Priority 3: window.ethereum with isGateWallet flag
  if (ethereum?.isGateWallet && isValidProvider(ethereum)) {
    return ethereum as unknown as EIP1193Provider;
  }

  // Priority 4: Multi-wallet environment (window.ethereum.providers array)
  if (ethereum?.providers) {
    const gateProvider = ethereum.providers.find(
      (p: GateWalletProvider) => p.isGateWallet && isValidProvider(p)
    );
    if (gateProvider) {
      return gateProvider as EIP1193Provider;
    }
  }

  return null;
}

/**
 * Checks if Gate Wallet extension is installed in the browser
 */
function isGateWalletInstalled(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const ethereum = getWindowEthereum();

  return !!(
    window.gatewallet ||
    ethereum?.isGateWallet ||
    ethereum?.providers?.some((p: GateWalletProvider) => p.isGateWallet)
  );
}

const GATE_WALLET_INSTALL_URL = "https://www.gate.io/web3";

/**
 * Gate Wallet module for Web3-Onboard
 *
 * @returns WalletInit function for Web3-Onboard configuration
 *
 * @example
 * ```ts
 * import gateWallet from "./wallets/gateWallet";
 *
 * const wallets = [
 *   gateWallet(),
 *   // ... other wallets
 * ];
 * ```
 */
function gateWallet(): WalletInit {
  if (typeof window === "undefined") {
    return () => null;
  }

  return () => {
    return {
      label: "Gate Wallet",
      getIcon: async () => GATE_WALLET_ICON,
      getInterface: async () => {
        // If Gate Wallet is not installed, redirect to install page
        if (!isGateWalletInstalled()) {
          window.open(GATE_WALLET_INSTALL_URL, "_blank");
          throw new Error("Please install Gate Wallet extension to continue");
        }

        const provider = getGateWalletProvider();

        if (!provider) {
          window.open(GATE_WALLET_INSTALL_URL, "_blank");
          throw new Error("Gate Wallet provider not found. Please install or refresh the page.");
        }

        // Request chain ID to ensure provider has synced its state
        // This fixes "Wrong network" errors on initial connection
        try {
          await provider.request({ method: "eth_chainId" });
        } catch {
          // Ignore errors, provider will still work
        }
        return { provider };
      },
      platforms: ["desktop"],
    };
  };
}

export default gateWallet;
