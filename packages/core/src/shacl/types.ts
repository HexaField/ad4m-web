export interface PerspectiveAction {
  action: 'addLink' | 'removeLink' | 'setSingleTarget' | 'collectionSetter'
  source: string
  predicate: string
  target: string
  local?: boolean
}

export interface PropertyShape {
  name: string
  path: string
  datatype?: string
  maxCount?: number
  minCount?: number
  classRef?: string
  resolveLanguage?: string
  writable?: boolean
  initial?: string
  setter?: PerspectiveAction[]
  adder?: PerspectiveAction[]
  remover?: PerspectiveAction[]
}

export interface SubjectClass {
  name: string
  namespace: string
  properties: PropertyShape[]
  constructor?: PerspectiveAction[]
  destructor?: PerspectiveAction[]
}
