import type { TabCoordinator } from './coordinator'

/**
 * Implements the same interface as GraphQLEngine but proxies
 * all queries to the leader tab via the TabCoordinator.
 */
export class ProxyGraphQLEngine {
  constructor(private coordinator: TabCoordinator) {}

  async execute(query: string, variables?: Record<string, any>): Promise<any> {
    return this.coordinator.executeGraphQL(query, variables)
  }
}
