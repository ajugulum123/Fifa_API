// Credential provider factory and exports

export type { QBCredentials, CredentialProvider, CredentialMode } from "./types.js";
export { getCredentialMode } from "./types.js";
export { AWSCredentialProvider } from "./aws-provider.js";
export { LocalCredentialProvider } from "./local-provider.js";

import { getCredentialMode } from "./types.js";
import type { CredentialProvider } from "./types.js";
import { AWSCredentialProvider } from "./aws-provider.js";
import { LocalCredentialProvider } from "./local-provider.js";

// Singleton provider instance
let providerInstance: CredentialProvider | null = null;

/**
 * Get the credential provider based on QBO_CREDENTIAL_MODE environment variable
 * - "aws": Uses AWS Secrets Manager and SSM Parameter Store
 * - "local" (default): Uses local file storage at ~/.quickbooks-mcp/credentials.json
 */
export function getCredentialProvider(): CredentialProvider {
  if (!providerInstance) {
    const mode = getCredentialMode();
    if (mode === "aws") {
      providerInstance = new AWSCredentialProvider();
    } else {
      providerInstance = new LocalCredentialProvider();
    }
  }
  return providerInstance;
}

/**
 * Clear the cached provider instance (for testing or credential mode changes)
 */
export function clearProviderCache(): void {
  providerInstance = null;
}

/**
 * Check if we're using local credential mode
 */
export function isLocalMode(): boolean {
  return getCredentialMode() === "local";
}

/**
 * Check if we're using AWS credential mode
 */
export function isAWSMode(): boolean {
  return getCredentialMode() === "aws";
}
