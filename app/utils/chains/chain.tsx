import { Chain } from "viem/chains";
import {
  berachainMainnet,
  berachainBepoliaTestnet,
  arbitrumSepoliaTestnet,
  sepoliaTestnet,
  arbitrumMainnet,
  baseMainnet,
  ethMainnet,
  bscMainnet,
  optimismMainnet,
  polygonMainnet,
  avalancheMainnet,
  lineaMainnet,
  blastMainnet,
  mantaMainnet,
  modeMainnet,
  sonicMainnet,
  confluxESpaceMainnet,
  merlinMainnet,
  monadTestnet,
  seiMainnet,
} from "./chainBaseConfig";

export class Network {
  isActive = true;
  iconUrl = "";
  displayName?: string;
  chain!: Chain;

  get chainId() {
    return this.chain.id;
  }

  constructor(config?: {
    chain?: Chain;
    iconUrl?: string;
    displayName?: string;
    isActive?: boolean;
  }) {
    if (config) {
      Object.assign(this, config);
    }
  }

  /**
   * Get the base explorer URL without trailing slash
   */
  private getBaseExplorerUrl(): string | null {
    const explorer = this.chain?.blockExplorers?.default;
    if (!explorer) {
      return null;
    }
    return explorer.url.endsWith("/")
      ? explorer.url.slice(0, -1)
      : explorer.url;
  }

  /**
   * Get the explorer URL for a given address
   */
  getAddressExplorerUrl(address: string): string {
    const baseUrl = this.getBaseExplorerUrl();
    return baseUrl ? `${baseUrl}/address/${address}` : "#";
  }

  /**
   * Get the explorer URL for a given transaction hash
   */
  getTransactionExplorerUrl(txHash: string): string {
    const baseUrl = this.getBaseExplorerUrl();
    return baseUrl ? `${baseUrl}/tx/${txHash}` : "#";
  }

  /**
   * Get the display name for this network
   */
  getName(): string {
    return this.displayName || this.chain?.name || `Chain ${this.chainId}`;
  }
}

export const bscMainnetNetwork = new Network({
  displayName: "BNB Chain",
  iconUrl: "https://bscscan.com/token/images/bnbchain2_32.png",
  chain: bscMainnet,
});

export const berachainBepoliaNetwork = new Network({
  iconUrl:
    "https://cdn.prod.website-files.com/633c67ced5457aa4dec572be/67b845abe842d21521095c26_667ac3022260a22071b3cf37_u_b_f51944d0-b527-11ee-be26-a5e0a0cc15ce.png",
  chain: berachainBepoliaTestnet,
});

export const berachainNetwork = new Network({
  iconUrl:
    "https://cdn.prod.website-files.com/633c67ced5457aa4dec572be/67b845abe842d21521095c26_667ac3022260a22071b3cf37_u_b_f51944d0-b527-11ee-be26-a5e0a0cc15ce.png",
  chain: berachainMainnet,
});

export const arbitrumSepoliaNetwork = new Network({
  chain: arbitrumSepoliaTestnet,
  iconUrl: "/images/icons/chains/arbitrum.png",
});

export const sepoliaNetwork = new Network({
  chain: sepoliaTestnet,
  iconUrl:
    "https://developers.moralis.com/wp-content/uploads/web3wiki/1147-sepolia/637aee14aa9d9f521437ec16_hYC2y965v3QD7fEoVvutzGbJzVGLSOk6RZPwEQWcA_E-300x300.jpeg",
});

export const arbitrumOneNetwork = new Network({
  chain: arbitrumMainnet,
  iconUrl: "/images/icons/chains/arbitrum.png",
});

export const baseNetwork = new Network({
  chain: baseMainnet,
  iconUrl: "/images/icons/chains/base.png",
});

export const ethNetwork = new Network({
  chain: ethMainnet,
  iconUrl: "/images/icons/chains/ethereum.png",
});

// Optimism Network
export const optimismNetwork = new Network({
  chain: optimismMainnet,
  displayName: "Optimism",
  iconUrl:
    "https://assets.coingecko.com/coins/images/25244/standard/Optimism.png",
});

// Polygon Network
export const polygonNetwork = new Network({
  chain: polygonMainnet,
  iconUrl:
    "https://assets.coingecko.com/coins/images/4713/standard/polygon.png",
});

// Avalanche Network
export const avalancheNetwork = new Network({
  chain: avalancheMainnet,
  iconUrl:
    "https://assets.coingecko.com/coins/images/12559/standard/Avalanche_Circle_RedWhite_Trans.png",
});

// Linea Network
export const lineaNetwork = new Network({
  chain: lineaMainnet,
  iconUrl: "https://lineascan.build/images/svg/brands/main.svg",
});

// Blast Network
export const blastNetwork = new Network({
  chain: blastMainnet,
  iconUrl: "https://blastscan.io/images/svg/brands/main.svg",
});

// Manta Pacific Network
export const mantaNetwork = new Network({
  chain: mantaMainnet,
  iconUrl: "https://icons.llamao.fi/icons/chains/rsz_manta.jpg",
});

// Mode Network
export const modeNetwork = new Network({
  chain: modeMainnet,
  iconUrl: "https://avatars.githubusercontent.com/u/126394483",
});

// Sonic Network
export const sonicNetwork = new Network({
  chain: sonicMainnet,
  iconUrl: "https://explorer.soniclabs.com/favicon.ico",
});

// Conflux eSpace Network
export const confluxNetwork = new Network({
  chain: confluxESpaceMainnet,
  iconUrl:
    "https://s1.coincarp.com/logo/1/confluxtoken.png?style=200&v=1674808025",
});

// Merlin Network
export const merlinNetwork = new Network({
  chain: merlinMainnet,
  iconUrl: "https://icons.llamao.fi/icons/chains/rsz_merlin.jpg",
});

// Monad Network
export const monadNetworkTestnet = new Network({
  chain: monadTestnet,
  iconUrl:
    "https://cdn.prod.website-files.com/667c57e6f9254a4b6d914440/66c3711574e166ac115bba8a_Logo%20Mark.svg",
});

// Sei Network
export const seiNetwork = new Network({
  chain: seiMainnet,
  displayName: "Sei",
  iconUrl: "https://assets.coingecko.com/coins/images/28205/standard/Sei_Logo_-_Transparent.png",
});

export const networks = [
  berachainNetwork,
  arbitrumOneNetwork,
  baseNetwork,
  ethNetwork,
  berachainBepoliaNetwork,
  arbitrumSepoliaNetwork,
  sepoliaNetwork,
  bscMainnetNetwork,
  optimismNetwork,
  polygonNetwork,
  avalancheNetwork,
  lineaNetwork,
  blastNetwork,
  mantaNetwork,
  modeNetwork,
  sonicNetwork,
  confluxNetwork,
  merlinNetwork,
  monadNetworkTestnet,
  seiNetwork,
];

export const networksMap = networks.reduce((acc, network) => {
  acc[network.chainId] = network;
  return acc;
}, {} as Record<number | string, Network>);

/**
 * Get the chain name by chain ID
 * @param chainId - The chain ID as a string or number
 * @returns The chain name (displayName if available, otherwise chain.name, or a fallback)
 */
export function getChainNameByChainId(chainId: string | number): string {
  const network = networksMap[chainId];
  return network?.getName() ?? `Chain ${chainId}`;
}

/**
 * Get chain information by chain ID
 * @param chainId - The chain ID as a string or number
 * @returns Object with id, name, and namespace, or null if not found
 */
export function getChainInfoByChainId(
  chainId: string | number
): { id: number | string; name: string } | null {
  const network = networksMap[chainId];
  if (!network) {
    return null;
  }
  return {
    id: chainId,
    name: network.getName(),
  };
}

/**
 * Get network by chain ID
 * @param chainId - The chain ID as a string or number
 * @returns The Network instance or undefined if not found
 */
export function getNetworkByChainId(
  chainId: string | number
): Network | undefined {
  return networksMap[chainId];
}
