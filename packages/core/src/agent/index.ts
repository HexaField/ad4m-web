export { NobleCryptoProvider } from './crypto'
export { publicKeyToDid, didToPublicKey, generateDidDocument } from './did'
export { signExpression, verifyExpression } from './signing'
export { AgentService } from './agent'
export { hasCapability, isAdminCredential, createAdminCapabilities } from './capabilities'
export type { CapabilityClaims, AuthInfo, Capability, ResourceDomain } from './capabilities'
export { signJwt, verifyJwt, decodeJwtUnsafe } from './jwt'
export type { VerifyOptions } from './jwt'
export { CapabilityStore } from './capability-store'
export type { PendingRequest, GrantedApp } from './capability-store'
export type {
  CryptoProvider,
  WalletStore,
  WalletData,
  AgentStatus,
  AgentData,
  ExpressionProof,
  DecoratedExpressionProof,
  Expression,
  Link
} from './types'
