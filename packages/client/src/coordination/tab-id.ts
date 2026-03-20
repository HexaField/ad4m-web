export function getTabId(): string {
  let id = sessionStorage.getItem('ad4m-web-tab-id')
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem('ad4m-web-tab-id', id)
  }
  return id
}
