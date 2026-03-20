export interface EntanglementProof {
  did: string
  didSigningKeyId: string
  deviceKey: string
  deviceKeySignedByDid: string
  didSignedByDeviceKey: string
}

export class EntanglementService {
  private proofs: EntanglementProof[] = []

  getProofs(): EntanglementProof[] {
    return [...this.proofs]
  }

  addProofs(proofs: EntanglementProof[]): EntanglementProof[] {
    this.proofs.push(...proofs)
    return this.getProofs()
  }

  deleteProofs(proofs: EntanglementProof[]): EntanglementProof[] {
    for (const p of proofs) {
      const idx = this.proofs.findIndex((ep) => ep.did === p.did && ep.deviceKey === p.deviceKey)
      if (idx >= 0) this.proofs.splice(idx, 1)
    }
    return this.getProofs()
  }

  preFlight(deviceKey: string, deviceKeyType: string): EntanglementProof {
    return {
      did: '',
      didSigningKeyId: '',
      deviceKey,
      deviceKeySignedByDid: `preflight-${deviceKeyType}`,
      didSignedByDeviceKey: ''
    }
  }
}
