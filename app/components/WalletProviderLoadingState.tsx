/**
 * Loading state displayed while switching wallet providers
 */
export const WalletProviderLoadingState = () => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-[#101014] to-[#1a1a1f]">
      <div className="flex flex-col items-center gap-4">
        {/* Spinner */}
        <div className="relative w-16 h-16">
          <div className="absolute inset-0 rounded-full border-4 border-gray-800"></div>
          <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-blue-500 border-l-blue-500 animate-spin"></div>
        </div>

        {/* Loading text */}
        <div className="flex flex-col items-center gap-2">
          <p className="text-white text-lg font-semibold">
            Switching Provider
          </p>
          <p className="text-gray-400 text-sm">
            Please wait a moment...
          </p>
        </div>
      </div>
    </div>
  );
};
