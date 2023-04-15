export type JupiterQuoteResponse = {
  data: {
    inAmount: string;
    outAmount: string;
    priceImpactPct: number;
    amount: string;
    slippageBps: number;
    otherAmountThreshold: string;
    swapMode: "ExactIn" | "ExactOut";
    marketInfos: {
      id: string;
      label: string;
      inputMint: string;
      outputMint: string;
      notEnoughLiquidity: boolean;
      inAmount: string;
      outAmount: string;
      priceImpactPct: number;
      lpFee: {
        amount: string;
        mint: string;
        pct: number;
      };
      platformFee: {
        amount: string;
        mint: string;
        pct: number;
      };
    }[];
  }[];
};
