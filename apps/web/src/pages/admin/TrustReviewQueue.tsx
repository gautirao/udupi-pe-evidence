import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ShieldCheck } from 'lucide-react';
import { useTrustBadgeQuery } from '@/components/admin/trust-review/useTrustBadgeQuery';
import { useTrustIdentityQuery } from '@/components/admin/trust-review/useTrustIdentityQuery';
import { useTrustReviewMutations } from '@/components/admin/trust-review/useTrustReviewMutations';
import { BadgeReviewTable, type BadgeReviewCommands, type BadgeReviewView } from '@/components/admin/trust-review/BadgeReviewTable';
import { IdentityReviewTable, type IdentityReviewCommands, type IdentityReviewView } from '@/components/admin/trust-review/IdentityReviewTable';
import { BadgeRejectDialog } from '@/components/admin/trust-review/BadgeRejectDialog';
import { IdentityRejectDialog } from '@/components/admin/trust-review/IdentityRejectDialog';
import type { PendingIdentityEvidence, PendingTrustReview } from '@/components/admin/trust-review/trustReviewTypes';

/**
 * Composition root for the Trust Review Queue admin page (issue #2663
 * decomposition — see components/admin/trust-review/ for the extracted
 * query/mutation hooks and presentational components). Admin route gating
 * lives entirely in App.tsx's <ProtectedRoute requireAdmin>; `isAdmin` here
 * only gates the two queries' `enabled` flags, unchanged from before.
 */
export default function TrustReviewQueue() {
  const { isAdmin } = useAuth();

  const [rejectTarget, setRejectTarget] = useState<PendingTrustReview | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [identityRejectTarget, setIdentityRejectTarget] = useState<PendingIdentityEvidence | null>(null);
  const [identityRejectReason, setIdentityRejectReason] = useState('');

  const closeBadgeReject = () => {
    setRejectTarget(null);
    setRejectReason('');
  };

  const closeIdentityReject = () => {
    setIdentityRejectTarget(null);
    setIdentityRejectReason('');
  };

  const { reviews, isLoading, isError, error, refetch } = useTrustBadgeQuery({ enabled: isAdmin });
  const { items: identityItems, isLoading: identityLoading, isError: identityError, refetch: identityRefetch } =
    useTrustIdentityQuery({ enabled: isAdmin });

  const workflow = useTrustReviewMutations({ closeBadgeReject, closeIdentityReject });

  const badgeReviewView: BadgeReviewView = {
    reviews,
    isLoading,
    isError,
    error,
    action: workflow.badge.action,
  };

  const badgeReviewCommands: BadgeReviewCommands = {
    review: {
      approve: workflow.badge.approve,
      openReject: (review) => setRejectTarget(review),
    },
    queue: {
      retry: () => refetch(),
    },
  };

  const identityReviewView: IdentityReviewView = {
    items: identityItems,
    isLoading: identityLoading,
    isError: identityError,
    action: workflow.identity.action,
  };

  const identityReviewCommands: IdentityReviewCommands = {
    review: {
      approve: workflow.identity.approve,
      openReject: (item) => setIdentityRejectTarget(item),
    },
    queue: {
      retry: () => identityRefetch(),
    },
  };

  return (
    <AppLayout>
      <div className="container py-6 max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldCheck className="h-6 w-6 text-primary" />
              Trust Review Queue
            </h1>
            <p className="text-muted-foreground">
              Review pending trust badge submissions
            </p>
          </div>
        </div>

        <Tabs defaultValue="badges" className="space-y-4">
          <TabsList>
            <TabsTrigger value="badges">
              Badges ({reviews.length})
            </TabsTrigger>
            <TabsTrigger value="identity">
              Identity Evidence ({identityItems.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="badges">
            <BadgeReviewTable view={badgeReviewView} commands={badgeReviewCommands} />
          </TabsContent>

          <TabsContent value="identity">
            <IdentityReviewTable view={identityReviewView} commands={identityReviewCommands} />
          </TabsContent>
        </Tabs>

        <BadgeRejectDialog
          target={rejectTarget}
          reason={rejectReason}
          onReasonChange={setRejectReason}
          onCancel={closeBadgeReject}
          onConfirm={() => {
            if (rejectTarget) workflow.badge.reject(rejectTarget.dimensionId, rejectReason);
          }}
          isPending={workflow.badge.isRejecting}
        />

        <IdentityRejectDialog
          target={identityRejectTarget}
          reason={identityRejectReason}
          onReasonChange={setIdentityRejectReason}
          onCancel={closeIdentityReject}
          onConfirm={() => {
            if (identityRejectTarget) {
              workflow.identity.reject(identityRejectTarget.evidenceId, identityRejectReason);
            }
          }}
          isPending={workflow.identity.isRejecting}
        />
      </div>
    </AppLayout>
  );
}
