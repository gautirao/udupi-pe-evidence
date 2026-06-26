import { RoleAwareHeader } from '@/components/layout/AppLayout';

/**
 * Public-facing marketing header for the consumer Discover experience (Issue #1588 / #1646).
 * Delegates to RoleAwareHeader so all routes share the unified role-aware navigation zones.
 */
export function PublicHeader() {
  return <RoleAwareHeader />;
}


