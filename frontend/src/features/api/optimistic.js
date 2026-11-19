// Centralize rollback so failed writes never leave a false successful state.
export async function settleOptimistic(queryFulfilled, patches) {
  try {
    await queryFulfilled
  } catch {
    for (const patch of patches.reverse()) patch.undo()
  }
}
