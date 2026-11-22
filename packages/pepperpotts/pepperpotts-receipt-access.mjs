import { pepperpottsLoadAuthoritativeReceipt, pepperpottsSetAcknowledgementStatus } from './pepperpotts-authoritative-adapter.mjs';

export const PEPPERPOTTS_ACTIONS = Object.freeze({
  READ_RECEIPT: 'receipt:read',
  CHANGE_STATUS: 'receipt:change-status'
});

export class PepperpottsAuthenticationRequiredError extends Error {
  constructor() { super('Authentication required'); this.name = 'PepperpottsAuthenticationRequiredError'; }
}

export class PepperpottsAccessDeniedError extends Error {
  constructor() { super('Receipt access denied'); this.name = 'PepperpottsAccessDeniedError'; }
}

async function requireAccess(reference, action, { principal, authorize } = {}) {
  if (!principal?.subject) throw new PepperpottsAuthenticationRequiredError();
  if (typeof reference !== 'string' || !/^[A-Za-z0-9_-]{4,80}$/.test(reference)) throw new PepperpottsAccessDeniedError();
  if (typeof authorize !== 'function') throw new TypeError('Receipt authorization policy is not configured');
  if (!await authorize({ principal, action, reference })) throw new PepperpottsAccessDeniedError();
}

/** Authentication is supplied by the host application; this module only enforces its authorization decision. */
export async function pepperpottsLoadAuthorizedReceipt(adapter, reference, accessContext) {
  await requireAccess(reference, PEPPERPOTTS_ACTIONS.READ_RECEIPT, accessContext);
  return pepperpottsLoadAuthoritativeReceipt(adapter, reference);
}

export async function pepperpottsChangeAuthorizedStatus(adapter, reference, status, accessContext) {
  await requireAccess(reference, PEPPERPOTTS_ACTIONS.CHANGE_STATUS, accessContext);
  return pepperpottsSetAcknowledgementStatus(adapter, reference, status, { actor: accessContext.principal.subject });
}
