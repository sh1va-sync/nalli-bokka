import AuditEvent from '../models/AuditEvent.js';

export async function recordStoreAudit({
  session,
  req,
  action,
  entityType,
  entityId,
  previousState,
  nextState,
  changedFields
}) {
  await AuditEvent.create([{
    actorId: req.auth.id,
    actorRole: 'store',
    action,
    entityType,
    entityId,
    ...(previousState ? { previousState } : {}),
    ...(nextState ? { nextState } : {}),
    ...(changedFields?.length ? { changedFields } : {}),
    ...(req.requestId ? { requestId: req.requestId } : {})
  }], { session });
}
