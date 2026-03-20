export { NobleCryptoProvider } from './crypto'
export { publicKeyToDid, didToPublicKey, generateDidDocument } from './did'
export { signExpression, verifyExpression } from './signing'
export { AgentService } from './agent'
export { hasCapability, isAdminCredential, createAdminCapabilities } from './capabilities'
export type { CapabilityClaims, AuthInfo, Capability, ResourceDomain } from './capabilities'
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
