# P4 L-AUTHZ — RESULT: PASS

Target: listing 824df417-5458-4e8c-913a-413b8c273ec4
Endpoints: POST /api/admin/listings/{id}/approve, /reject, /return-for-edits

## BUYER token (role=user, not admin)
approve            -> 403 {"error":"Requires admin role"} (p4_buyer_approve.json)
reject             -> 403 (p4_buyer_reject.json)
return-for-edits   -> 403 (p4_buyer_return-for-edits.json)

## No token
approve            -> 401 (p4_notoken_approve.json)
reject             -> 401 (p4_notoken_reject.json)
return-for-edits   -> 401 (p4_notoken_return-for-edits.json)

RESULT: All three admin moderation endpoints correctly refuse non-admin and unauthenticated callers
server-side. No evidence of an authz gap on these three routes.
