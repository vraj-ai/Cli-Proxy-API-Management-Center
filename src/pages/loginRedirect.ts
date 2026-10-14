type RedirectState = { from?: { pathname?: string; search?: string } };

// Rebuilds the post-login landing target from ProtectedRoute's `from` state.
// The search portion must survive so deep links like /fleet/access?tab=models
// keep their tab after the login bounce.
export const resolveLoginRedirect = (state: unknown): string => {
  const from = (state as RedirectState | null)?.from;
  return `${from?.pathname || '/'}${from?.search || ''}`;
};
