# Current-Behaviour Coverage Matrix (`#2750` / `#1713` Clean-Slate E2E Finalisation)

This document is the authoritative **current-product behaviour coverage matrix** across all four verification layers:

1. **Canonical E2E Gate (`e2e/canonical/*.canonical.ts` — 17 files, 59 role-project tests across `J01`–`J16`)**: Cross-stack browser journeys running against the real local PostGIS fixture DB, real Spring Boot backend, real Vite production build (`dist/`), and real local Supabase-compatible JWT auth across `anon`, `user`, `broker`, and `admin` projects (`npm run test:e2e:gate`).
2. **Specialist Browser Suite (`e2e/specialist/*.specialist.ts` — 42 files, 240 browser tests)**: Real-browser DOM geometry, CSS layout/overflow, `elementFromPoint` hit-testing, Leaflet canvas/marker/cluster/polygon/camera interactions, Radix focus/portal traps, and mobile viewport (`390×844` / `375×667`) interactions (`npm run test:e2e:specialist`).
3. **Frontend Integration & Unit Suite (`apps/web/src/**/__tests__/*.test.{ts,tsx}`)**: Fast, deterministic Vitest + Testing Library component, controller, hook, and route-wiring tests with transient-mutation proof across all PRs `#2894`–`#2908`.
4. **Backend Integration & Unit Suite (`apps/api/src/test/java/**`)**: JUnit 5 + MockMvc + Testcontainers PostGIS/Flyway integration tests covering all Spring Boot controllers, services, spatial SQL queries, and security boundaries.

---

## 1. Product Route & Journey Coverage Matrix (`apps/web/src/App.tsx` + `apps/api`)

### 1.1 Public & Buyer Discovery Routes

| Route | Component | Supported Behaviour / Journey | Canonical E2E (`e2e/canonical/`) | Specialist Browser (`e2e/specialist/`) | Frontend Integration / Unit (`apps/web/src/`) | Backend API / IT (`apps/api/src/test/`) |
|---|---|---|---|---|---|---|
| `/` | `LandingPage` | City selection, hero CTA to `/discover`, featured listings, area overview cards, trust section | `auth-session.canonical.ts` (`T1c`: `returnTo=/` + sign-out on homepage) | — | `pages/__tests__/LandingPage.navigation2859.test.tsx`, `pages/landing/__tests__/useLandingPageState.test.tsx` | `PublicListingControllerTest.java` |
| `/auth` | `Auth` | Sign-in, sign-up, `returnTo` redirect preservation (`getSafeReturnTo`), invalid credentials handling | `auth-session.canonical.ts` (`J08`: `T1`, `T2`, `T2b`, `T3`, `T1c`) | — | `contexts/__tests__/AuthModalContext.realForms2847.test.tsx`, `contexts/__tests__/AuthModalContext.returnToMatrix2847.test.tsx`, `pages/__tests__/Auth.returnToMatrix2836.test.tsx` | `DbRoleJwtAuthenticationConverterTest.java` |
| `/auth/callback` | `AuthCallback` | OAuth / magic-link session exchange and `returnTo` consumer redirect | `auth-session.canonical.ts` (`T1`, `T2`, `T2b`) | — | `pages/__tests__/AuthCallback.consumerInvariant.test.tsx`, `pages/__tests__/AuthCallback.returnToMatrix2836.test.tsx` | — |
| `/discover` (Area-First) | `MapDiscovery` | City hierarchy (`DIRECTION` → `AREA_CLUSTER` → `AREA` leaf), adaptive flat vs grouped cities, quick-filter chips, within-area keyword search, Buy/Rent intent continuity, `Search this area` viewport bounds, polygon draw filtering, multi-area set (`rscope=areas`), relaxation previews | `discover-area-first.canonical.ts` (`T4`, `T5`, `T6`, `T10b`, `T24`, `T25`, `T26`), `anon-discover-teaser.canonical.ts` (`T10`), `panel-exclusivity.canonical.ts` (`T18`), `map-marker-interaction.canonical.ts` (`T19`, `T20`), `discover-intent.canonical.ts` (`T23`) | 32 Discover map/mobile/camera/marker/polygon specialist specs (see §2) | `pages/__tests__/MapDiscovery.mapHierarchy2859.test.tsx`, `pages/__tests__/MapDiscovery.areaKeyColdLoad2859.test.tsx`, `pages/__tests__/MapDiscovery.searchThisAreaRelay2859.test.tsx`, `features/discover/components/__tests__/AreaSetDraftPanel.realCommit2859.test.tsx` | `NavigationControllerTest.java`, `CityAreaListingsIT.java`, `PolygonRelaxationPreviewsControllerTest.java`, `RelaxationPreviewsSecurityIT.java` |
| `/discover` (School-First) | `MapDiscovery` | `?journey=school-first`, area school count badges, `SchoolsInAreaPanel`, school card click → `schoolId` + `radiusKm=3`, compact school context (`#2770`), `SchoolRadiusLegend`, school pin vs empty pill (`#2715`), property-type filtering within radius, mobile `390×844` reflow (`#1745` `B8`) | `discover-school-first.canonical.ts` (`J02`: `T7`, `T7b`), `panel-exclusivity.canonical.ts` (`T18`) | `discover-issue-2715-school-pin-vs-empty-pill.specialist.ts`, `discover-issue-2770-compact-school-context.specialist.ts`, `discover-2717-school-filters-touch-target.specialist.ts`, `discover-schools-mobile-cluster-2124.specialist.ts`, `discover-issue-2149-mobile-school-first-marker-preview.specialist.ts`, `discover-journey-switch-overlay-cleanup-1940.specialist.ts` | `pages/__tests__/MapDiscovery.schoolJourney2857.test.tsx`, `components/map/__tests__/AreaMarkerLayer.schoolBadge2857.test.tsx`, `features/discover/controllers/useDiscoverBadgeController.issue2190.test.ts` | `SchoolAreaBoundsTrustBoundary2767IT.java`, `PublicSchoolRadiusListingsCommercialFacts2516IT.java` |
| `/discover` (Agri-First) | `MapDiscovery` | `?journey=agri-first`, direction/distance rings (`region`, `maxKm`), regional area groups, destination polygons (`destKey`), `AgriListingPanel`, `AgriGroupListingPeek`, anonymous price gate on map pins & cards | `discover-agri-first.canonical.ts` (`J03`: `T8`, `T8b`, `T8c`, `T9`) | — | `pages/__tests__/MapDiscovery.agriDirectionFirst1448.test.tsx`, `pages/__tests__/MapDiscovery.agriOverlayPeek2857.test.tsx`, `hooks/__tests__/useRegionalAreaGroups.test.ts`, `components/discover/__tests__/DiscoverRightPanel.agriGroupPeek.test.tsx` | `AgriListingBoundaryJourneyIT.java` |
| `/discover` (Commercial) | `MapDiscovery` | Commercial purpose/subtype filtering (`office`, `retail_shop`, `warehouse`, `commercial_plot`, `showroom`), commercial card summary metrics, zero residential leakage | `commercial-lifecycle.canonical.ts` (`J05`/`J07`: `CC1`–`CC4`) | `commercial-subtype-wrap-2450.specialist.ts` | `hooks/__tests__/useDiscoverListings.issue2016.test.ts`, `lib/__tests__/discoverMappers.test.ts`, `components/map/filters/__tests__/PropertyTypeFilter.impliedPropertyType.test.tsx` | `CityAreaListingsCommercialSubtype2433IT.java`, `CommercialSubtypeFilter2431IT.java` |
| `/listing/:id` | `ListingDetail` | Public listing detail (Residential, Commercial, Agricultural), anonymous price/contact/survey-number gating vs authenticated unlock, photo gallery lightbox, `ListingBoundaryMap` polygon vs centre-marker fallback, nearby POIs, Save Home toggle, Book Viewing modal, Owner/Broker preview banner & Take Offline / Reopen actions | `listing-detail-gating.canonical.ts` (`T11`, `T12`), `booking-request.canonical.ts` (`T16`, `T17`), `saved-homes.canonical.ts` (`T21`) | `discover-listing-detail-reskin-desktop-2159.specialist.ts`, `discover-listing-detail-reskin-mobile-2159.specialist.ts` | `pages/__tests__/ListingDetail.sessionSwitch2859.test.tsx`, `pages/__tests__/ListingDetail.previewLifecycle2859.test.tsx`, `components/listing/agri/__tests__/AgriListingDetail.groupedJourney1412.test.tsx`, `components/poi/__tests__/NearbyPois2859.test.tsx`, `components/listing/__tests__/ListingGallery.anonLock2859.test.tsx` | `PublicListingControllerTest.java`, `PoiApproveAuthorization2859IT.java` |
| `/trends` | `Trends` | City & locality price trends, Recharts visualization, up-to-3 locality comparison (`areas=`), area intelligence cards | — | — | `pages/__tests__/Trends.exhaustiveDeps.test.tsx`, `pages/__tests__/Trends.areaIntelligenceWire2859.test.tsx`, `pages/__tests__/Trends.noErrorGuide2859.test.tsx`, `hooks/__tests__/useAreaIntelligence.2859.test.tsx` | `AreaIntelligenceSnapshotRollupJobIT.java`, `BuyerAreaIntelligenceServiceTest.java` |
| `/trends/:citySlug/areas/:areaSlug` | `TrendsAreaResolved` | Deep-linked area guide, price bands, chip tiers, CTA into `/discover` | — | — | `__tests__/pages/TrendsAreaResolved.test.tsx`, `__tests__/App.trendsAreaRoute2859.test.tsx`, `components/area/__tests__/AreaGuide.test.tsx` | `BuyerAreaIntelligenceServiceTest.java` |

### 1.2 Authenticated Buyer & Onboarding Routes

| Route | Component | Supported Behaviour / Journey | Canonical E2E (`e2e/canonical/`) | Specialist Browser (`e2e/specialist/`) | Frontend Integration / Unit (`apps/web/src/`) | Backend API / IT (`apps/api/src/test/`) |
|---|---|---|---|---|---|---|
| `/onboarding` | `Onboarding` | Post-signup intent choice (`Browse & Invest` → `/`, `List as Owner` → `/broker/listings/new`, `Become a Broker` → `/broker/setup`), broker/admin redirect guard | — | — | `pages/__tests__/OnboardingAndBrokerSetup.test.tsx` | — |
| `/my-bookings` | `MyBookings` | Buyer viewing bookings list, status badges (`PENDING`, `CONFIRMED`, `CANCELLED`), cancel booking action | `booking-request.canonical.ts` (`J10`: `T17`, `T17b`) | — | `pages/__tests__/MyBookings.test.tsx`, `pages/__tests__/useBrokerBookings.envelope.test.tsx` | `BookingServiceTest.java`, `BookingPersistenceIT.java` |
| `/saved-homes` | `SavedHomes` | Saved properties list, persistence across reload, unsave removal, empty state CTA | `saved-homes.canonical.ts` (`J13`: `T21`) | — | `hooks/__tests__/useSavedListings.test.ts` | `SavedListingsRepositoryIT.java` |
| `/saved-areas` | `SavedAreas` | Watched localities list, add/remove area watch, navigate to `/discover` or `/trends` | — | — | `pages/__tests__/SavedAreas2859.test.tsx` | — |

### 1.3 Broker & Owner Workspace Routes

| Route | Component | Supported Behaviour / Journey | Canonical E2E (`e2e/canonical/`) | Specialist Browser (`e2e/specialist/`) | Frontend Integration / Unit (`apps/web/src/`) | Backend API / IT (`apps/api/src/test/`) |
|---|---|---|---|---|---|---|
| `/broker/setup` | `BrokerSetup` | Broker registration (`phone` + `acceptedTerms` → `POST /api/broker/setup`), role refresh (`refreshRole`), redirect to `/broker/dashboard`, 400/409 error states | — | — | `pages/__tests__/OnboardingAndBrokerSetup.test.tsx` | `DealerSetupControllerTest.java` |
| `/broker/listings/new` | `NewListingJourneySelector` | Property family selector (`Residential`, `Commercial`, `Agricultural`) | `listing-lifecycle.canonical.ts` (`J06`), `commercial-lifecycle.canonical.ts` (`J07`), `agri-lifecycle.canonical.ts` (`J15`) | — | `pages/broker/__tests__/NewListingJourneySelector.test.tsx`, `pages/broker/__tests__/NewListingJourneyRouting.test.tsx` | — |
| `/broker/listings/new/residential` | `ResidentialNewListingPage` | Single-page residential create/draft/submit flow (`apartment`, `house`, `villa`, `residential_plot`, `pg_hostel`), map pin picker, photo upload, required-field gating | `listing-lifecycle.canonical.ts` (`J06`: `T13`, `T14`, `T15`, `T15b`) | `residential-required-fields-2040.specialist.ts` | `pages/broker/__tests__/ResidentialNewListingPage.test.tsx`, `components/broker/__tests__/ResidentialListingForm.locationFlow2859.test.tsx`, `components/broker/__tests__/ResidentialListingForm.subtypeSubmit2861.test.tsx` | `ListingControllerTest.java`, `ListingModerationLifecycleIT.java` |
| `/broker/listings/new/commercial` | `CommercialNewListingPage` | Commercial create/draft/submit flow across subtypes & Sale/Rent transaction types | `commercial-lifecycle.canonical.ts` (`J07`: `CC1`, `CC1b`, `CC1c`, `CC2`, `CC3`, `CC4`) | `commercial-subtype-wrap-2450.specialist.ts` | `pages/broker/__tests__/CommercialNewListingPage.test.tsx`, `components/broker/__tests__/CommercialListingForm.gating2859.test.tsx` | `CityAreaListingsCommercialSubtype2433IT.java`, `ListingControllerTest.java` |
| `/broker/listings/new/agricultural` | `AgriculturalNewListingPage` | Agricultural land create/draft/submit flow, polygon boundary drawing (`<=100 km²` validation), soil/water/crop/title specs | `agri-lifecycle.canonical.ts` (`J15`: `AG1`, `AG2`, `AG3`) | — | `pages/broker/__tests__/AgriculturalNewListingPage.test.tsx`, `components/listing/agri/__tests__/AgriListingDetail.groupedJourney1412.test.tsx` | `AgriListingBoundaryJourneyIT.java` (including `>100 km²` `422 BOUNDARY_TOO_LARGE` persistence invariant) |
| `/broker/listings/:id/edit` | `EditListing` | Step-based listing edit (`DescribeStep`, `LocationStep`, `BoundaryStep`, `PhotosStep`, `ReviewStep`), rejected listing edit & resubmit (`REJECTED` → `PENDING_REVIEW`) | `listing-edit.canonical.ts` (`J14`: `T22`) | — | `pages/broker/editListing/__tests__/EditListingForm.titleLocality2859.test.tsx`, `pages/broker/editListing/__tests__/EditListingForm.rejectedBanner2859.test.tsx`, `pages/broker/editListing/steps/__tests__/ReviewStep.locality2859.test.tsx` | `ListingModerationLifecycleIT.java`, `ListingControllerTest.java` |
| `/broker/listings` | `BrokerListings` | Broker listings inventory, status tabs (`LIVE`, `PENDING_REVIEW`, `DRAFT`, `REJECTED`, `OFFLINE`), rejection reason banner, Take Offline / Reopen / Edit actions | `listing-lifecycle.canonical.ts` (`J06`), `listing-edit.canonical.ts` (`J14`) | — | `pages/broker/__tests__/BrokerListings.bd4.test.tsx`, `components/broker/listings/__tests__/BrokerListingCard.moderation2859.test.tsx` | `ListingControllerTest.java`, `ListingModerationLifecycleIT.java` |
| `/broker/dashboard` | `BrokerDashboard` | Broker KPI summary, recent bookings, listing quality prompt, quick actions | — | — | `pages/broker/__tests__/BrokerDashboard.pageHttp.test.tsx`, `pages/broker/__tests__/BrokerDashboard.v2.test.tsx` | `DashboardControllerTest.java` |
| `/broker/bookings` | `BrokerBookings` | Incoming buyer viewing requests, confirm/decline/reschedule actions | `booking-request.canonical.ts` (`J10`: `T17b`) | — | `pages/__tests__/useBrokerBookings.envelope.test.tsx`, `pages/broker/__tests__/BrokerBookings.test.tsx` | `BookingServiceTest.java`, `BookingPersistenceIT.java` |
| `/broker/listing-quality` | `ListingQuality` | Listing completeness scores, improvement recommendations, deep link to edit | — | — | `pages/broker/__tests__/ListingQuality.test.tsx`, `__tests__/App.brokerListingQualityRoute.test.tsx` | `ListingQualityControllerTest.java` |
| `/broker/preferences` | `Preferences` | Broker market focus areas, specialization preferences, RERA/identity trust progress panel (`TrustProgressPanel`), POI manager (`PoiManager`) | — | — | `pages/broker/__tests__/Preferences.addFlow2859.test.tsx`, `pages/broker/__tests__/Preferences.realSelect2859.test.tsx`, `pages/broker/__tests__/Preferences.pageHttp.test.tsx`, `components/trust/__tests__/TrustProgressPanel.identityRealSelect2859.test.tsx`, `components/poi/__tests__/PoiManager.approve2859.test.tsx` | `BrokerMarketFocusControllerTest.java`, `BrokerMarketFocusServiceTest.java`, `PoiApproveAuthorization2859IT.java` |
| `/broker/demand-gaps` | `BrokerDemandGaps` | High-demand / low-supply locality gap insights for brokers | — | — | `pages/broker/__tests__/BrokerDemandGaps.pageHttp.test.tsx`, `pages/broker/__tests__/BrokerDemandGaps.test.tsx` | `BrokerDemandGapsControllerTest.java` |
| `/broker/areas/:citySlug/:areaKey` | `BrokerAreaInsights` | Per-locality supply/demand/pricing insights for brokers | — | — | `pages/broker/__tests__/BrokerAreaInsights.pageHttp.test.tsx`, `pages/broker/__tests__/BrokerAreaInsights.test.tsx` | `BrokerAreaInsightsControllerTest.java` |

### 1.4 Admin Workspace Routes

| Route | Component | Supported Behaviour / Journey | Canonical E2E (`e2e/canonical/`) | Specialist Browser (`e2e/specialist/`) | Frontend Integration / Unit (`apps/web/src/`) | Backend API / IT (`apps/api/src/test/`) |
|---|---|---|---|---|---|---|
| `/admin/listings/pending` | `PendingListings` | Admin moderation queue, approve (`PENDING_REVIEW` → `LIVE`) and reject with reason (`PENDING_REVIEW` → `REJECTED`), detail drawer inspection | `listing-lifecycle.canonical.ts` (`T14`), `commercial-lifecycle.canonical.ts` (`CC2`), `agri-lifecycle.canonical.ts` (`AG2`) | — | `pages/admin/__tests__/PendingListings.moderation2859.test.tsx`, `pages/admin/__tests__/PendingListings.test.tsx` | `AdminListingControllerTest.java`, `ListingModerationLifecycleIT.java` |
| `/admin/listings` | `Listings` | Full admin listings inventory, status/city/type filters, bulk/row moderation actions | — | — | `components/admin/listings/__tests__/ListingEditorDrawer.inventory2859.test.tsx`, `pages/admin/__tests__/Listings.editParam2859.test.tsx` | `AdminListingControllerTest.java` |
| `/admin/trust-review` | `TrustReviewQueue` | Broker identity & RERA verification review queue (`approve` / `reject`) | — | — | `pages/admin/__tests__/TrustReviewQueue.test.tsx`, `components/trust/__tests__/TrustProgressPanel.identity2859.test.tsx` | `AdminTrustControllerIdentityApproveTest.java`, `TrustIdentityApprovalIT.java` |
| `/admin/duplicates` | `SuspectedDuplicates` | Suspected duplicate listing pair review, merge/dismiss actions, non-admin route guard | — | — | `pages/admin/__tests__/Duplicates.2861.test.tsx` | `AdminDuplicateControllerTest.java`, `AdminDuplicateLifecycleIT.java` |
| `/admin/intelligence` | `Intelligence` | Admin area intelligence overview, price band refresh & metrics | — | — | `pages/admin/__tests__/AdminIntelligence.2861.test.tsx`, `pages/admin/__tests__/Intelligence.test.tsx` | `AreaIntelligenceSnapshotRollupJobIT.java` |
| `/admin/city-launch` & `/admin/city-launch/:cityId/preview/:revisionId` | `CityLaunch`, `CityLaunchPreview` | Admin city launch workflow, hierarchy node overrides, validation, preview map/markers scoping, launch promotion | — | — | `pages/admin/__tests__/CityLaunchPreview.test.tsx`, `pages/admin/__tests__/CityLaunchReadiness.test.tsx`, `components/discover/cityLaunchPreview/__tests__/NavigationHierarchyTree.test.tsx`, `features/discover/state/usePreviewCityIdentity.test.tsx` | `AdminCityLaunchNavigationOverrideControllerTest.java`, `AdminCityLaunchPreviewControllerIT.java` |
| `/admin/property-requests` | `PropertyRequests` | Buyer property-request submissions queue (flag-gated via `VITE_PROPERTY_REQUESTS_ENABLED`) | `property-request.canonical.ts` (`J12`: `RQ1`, `RQ2`) | — | `pages/admin/__tests__/PropertyRequests.test.tsx`, `__tests__/App.propertyRequestsRoute.test.ts` | `PropertyRequestControllerTest.java` |
| `/admin/process`, `/admin/groups`, `/admin/feeds`, `/admin/posts`, `/admin/localities`, `/admin/audit-log`, `/admin/extension` | Admin Ops Screens | Social ingestion pipeline (`ProcessPosts`, `FacebookGroups`, `FeedRuns`, `ManualPost`), locality normalizer, audit log, extension setup; `ProtectedRoute requireAdmin` guard | `auth-session.canonical.ts` (`T1 [role:admin]`) | — | `components/layout/__tests__/AppLayout.navRoles2859.test.tsx`, `lib/__tests__/routeAccess.test.ts` | `IngestionControllerTest.java`, `IngestionApiKeySecurityTest.java` |

---

## 2. Specialist Browser Suite Inventory (`e2e/specialist/` — 42 Files, 240 Tests)

Every browser-only invariant (Leaflet map canvas rendering, marker/cluster hit-testing, camera fit/restore races, mobile bottom-sheet & control-bar geometry, polygon draw interaction, and local-auth multi-role flows) is protected in `e2e/specialist/` across the exact **42** committed specialist files on disk:

1. `e2e/specialist/commercial-subtype-wrap-2450.specialist.ts` (`L36`)
2. `e2e/specialist/discover-1738-regression.specialist.ts` (`L37`)
3. `e2e/specialist/discover-1942-pin-price-band.specialist.ts` (`L39`)
4. `e2e/specialist/discover-2049-resize-marker-skew.specialist.ts` (`L40`)
5. `e2e/specialist/discover-2717-school-filters-touch-target.specialist.ts` (`L42`)
6. `e2e/specialist/discover-control-bar-mobile-reachability-1953.specialist.ts` (`L104`)
7. `e2e/specialist/discover-desktop-control-bar-shell-1953.specialist.ts` (`L105`)
8. `e2e/specialist/discover-issue-1762-listing-density-clustering.specialist.ts` (`L107`)
9. `e2e/specialist/discover-issue-1823-camera-fit-policy.specialist.ts` (`L108`)
10. `e2e/specialist/discover-issue-1956-pr4-listing-peek-camera-restore.specialist.ts` (`L117`)
11. `e2e/specialist/discover-issue-1956-pr4-mobile-listings-scroll.specialist.ts` (`L119`)
12. `e2e/specialist/discover-issue-1956-pr5-desktop-breadcrumb-regression.specialist.ts` (`L121`)
13. `e2e/specialist/discover-issue-1956-pr5-mobile-cluster-sheet.specialist.ts` (`L122`)
14. `e2e/specialist/discover-issue-1956-pr5-s5-mobile-listing-preview.specialist.ts` (`L124`)
15. `e2e/specialist/discover-issue-2083-home-breadcrumb-back-camera-race.specialist.ts` (`L131`)
16. `e2e/specialist/discover-issue-2089-breadcrumb-list-flex-layout.specialist.ts` (`L134`)
17. `e2e/specialist/discover-issue-2089-filter-list-map-parity.specialist.ts` (`L135`)
18. `e2e/specialist/discover-issue-2089-marker-swap-fixture.specialist.ts` (`L136`)
19. `e2e/specialist/discover-issue-2089-pan-preserves-listing-preview.specialist.ts` (`L137`)
20. `e2e/specialist/discover-issue-2129-mobile-marker-occlusion.specialist.ts` (`L138`)
21. `e2e/specialist/discover-issue-2149-mobile-school-first-marker-preview.specialist.ts` (`L141`)
22. `e2e/specialist/discover-issue-2150-cluster-tap-spiderfy-regression.specialist.ts` (`L142`)
23. `e2e/specialist/discover-issue-2305-cluster-marker-skin.specialist.ts` (`L147`)
24. `e2e/specialist/discover-issue-2330-marker-reskin-visual.specialist.ts` (`L148`)
25. `e2e/specialist/discover-issue-2419-pr1-polygon-scope.specialist.ts` (`L149`)
26. `e2e/specialist/discover-issue-2715-school-pin-vs-empty-pill.specialist.ts` (`L156`)
27. `e2e/specialist/discover-issue-2770-compact-school-context.specialist.ts` (`L157`)
28. `e2e/specialist/discover-journey-switch-overlay-cleanup-1940.specialist.ts` (`L158`)
29. `e2e/specialist/discover-listing-detail-reskin-desktop-2159.specialist.ts` (`L70`)
30. `e2e/specialist/discover-listing-detail-reskin-mobile-2159.specialist.ts` (`L71`)
31. `e2e/specialist/discover-map-info-dock-2748.specialist.ts` (`L73`)
32. `e2e/specialist/discover-mobile-list-map-shell-1953.specialist.ts` (`L160`)
33. `e2e/specialist/discover-mobile-map-badge-zoom-2716.specialist.ts` (`L74`)
34. `e2e/specialist/discover-mobile-map-filters-2712.specialist.ts` (`L161`)
35. `e2e/specialist/discover-results-reskin-2729.specialist.ts` (`L78`)
36. `e2e/specialist/discover-schools-mobile-cluster-2124.specialist.ts` (`L91`)
37. `e2e/specialist/discover-viewport-truncation.specialist.ts` (`L98`)
38. `e2e/specialist/issue-2016-result-scope-contract.specialist.ts` (`L179`)
39. `e2e/specialist/issue-2426-search-this-area-cta-placement.specialist.ts` (`L182`)
40. `e2e/specialist/issue-2456-map-candidate-callouts.specialist.ts` (`L184`)
41. `e2e/specialist/issue-2759-consent-clickable.specialist.ts` (`L186`)
42. `e2e/specialist/residential-required-fields-2040.specialist.ts` (`L211`)

*(Breakdown across waves: 5 specs in `S0` + 6 in Wave 1 `#2904` + 9 in Wave 2 `#2905` + 5 in `#2856` `#2906` + 9 in Wave 3 `#2907` + 8 in Wave 4 `#2908` = **42** specialist files total.)*

---

## 3. Consolidated Deletion Inventory — All 96 Remaining Legacy `e2e/**/*.spec.ts` Files

Every single one of the **96** remaining legacy `e2e/**/*.spec.ts` files (after moving `L70`, `L107`, `L108`, `L122`, `L135`, `L136`, `L158`, `L184` into `e2e/specialist/` in PR #2908) has verified replacement coverage on disk across Canonical E2E, Specialist Browser E2E, Frontend Vitest, and Backend Maven/Testcontainers:

### Batch A — School-First & Agricultural Lower-Level Replacements (`#2857` / `#2890` — 9 files)
1. `e2e/broker-agri-listing.spec.ts` (`L12`) → `e2e/canonical/agri-lifecycle.canonical.ts` (`AG1`–`AG3`) + `apps/api/src/test/java/com/example/realestate/listing/api/AgriListingBoundaryJourneyIT.java` (`#2894`)
2. `e2e/discover-agri-grouped-journey-1412.spec.ts` (`L44`) → `apps/web/src/components/listing/agri/__tests__/AgriListingDetail.groupedJourney1412.test.tsx` (`L44-N1`..`L44-N6`, `M1`..`M14`) + `apps/web/src/components/listing/agri/__tests__/AgriListingDetail.priceGate2859.test.tsx` + `apps/web/src/hooks/__tests__/useRegionalAreaGroups.test.ts` + `apps/api/src/test/java/com/example/realestate/listing/api/PublicListingControllerTest.java` + `apps/api/src/test/java/com/example/realestate/discover/DiscoverAgriMapListingsServiceTest.java` (`#2895` / `#2899`; see §4.5 below)
3. `e2e/discover-agri-journey-1375.spec.ts` (`L45`) → `e2e/canonical/discover-agri-first.canonical.ts` (`T8`/`T9`) + `apps/web/src/pages/__tests__/MapDiscovery.agriOverlayPeek2857.test.tsx` (`#2894`)
4. `e2e/discover-agri-overlay-peek-journey-1431.spec.ts` (`L47`) → `apps/web/src/pages/__tests__/MapDiscovery.agriOverlayPeek2857.test.tsx` (`#2894`)
5. `e2e/discover-school-first-journey.spec.ts` (`L84`) → `e2e/canonical/discover-school-first.canonical.ts` (`T7`/`T7b`) + `apps/web/src/components/map/__tests__/AreaMarkerLayer.schoolBadge2857.test.tsx` (`#2894`)
6. `e2e/discover-school-journey.spec.ts` (`L87`) → `e2e/canonical/discover-school-first.canonical.ts` (`T7`) + `apps/web/src/pages/__tests__/MapDiscovery.schoolJourney2857.test.tsx` (`#2894`)
7. `e2e/discover-school-selected.spec.ts` (`L89`) → `e2e/canonical/discover-school-first.canonical.ts` (`T7`) + `apps/web/src/pages/__tests__/MapDiscovery.schoolJourney2857.test.tsx` (`#2894`)
8. `e2e/discover/school-badge-suppression.spec.ts` (`L164`) → `apps/web/src/features/discover/controllers/useDiscoverBadgeController.issue2190.test.ts` (`#2894`)
9. `e2e/verify-agri-clusters-1372.spec.ts` (`L217`) → `apps/web/src/features/discover/controllers/__tests__/useDiscoverMapDataController.areaFirstMarkers2857.test.ts` (`#2894`)

### Batch B — Discover Hierarchy, Preview, Request-Card & Error-State Lower-Level Replacements (`#2858` — 10 files)
10. `e2e/discover/area-drilldown-stale-viewport-1821.spec.ts` (`L102`) → `apps/web/src/hooks/__tests__/useDiscoverPageState.test.ts` + `apps/web/src/features/discover/state/useDiscoverJourneyTransitions.test.tsx` (`#2897`)
11. `e2e/discover/issue-1956-pr3-area-clustering.spec.ts` (`L116`) → `apps/web/src/components/map/__tests__/AreaMarkerLayer.destinations.test.tsx` + `apps/web/src/features/discover/state/url/__tests__/clusterFocus.test.ts` + `apps/api/src/test/java/com/example/realestate/discover/navigation/NavigationControllerTest.java` (`#2897`)
12. `e2e/discover/issue-2204-canonical-node-browser-proof.spec.ts` (`L143`) → `apps/web/src/features/discover/controllers/useDiscoverMapDataController.test.ts` + `apps/web/src/features/discover/state/url/__tests__/navigation.applyNodeDelta.test.ts` (`#2897`)
13. `e2e/discover/issue-2205-admin-preview-node-scoping-browser-proof.spec.ts` (`L144`) → `apps/web/src/features/discover/controllers/useDiscoverMapDataController.test.ts` + `apps/web/src/features/discover/state/usePreviewCityIdentity.test.tsx` (`#2897`)
14. `e2e/discover/issue-2207-admin-hierarchy-node-selection.spec.ts` (`L146`) → `apps/web/src/components/discover/cityLaunchPreview/__tests__/NavigationHierarchyTree.test.tsx` + `apps/web/src/pages/admin/__tests__/CityLaunchPreview.test.tsx` + `apps/api/src/test/java/com/example/realestate/discover/citylaunch/AdminCityLaunchNavigationOverrideControllerTest.java` (`#2897`)
15. `e2e/discover/issue-2711-map-filter-intent-commit.spec.ts` (`L155`) → `apps/web/src/features/discover/components/map/__tests__/MapFilterSheet.history2711.test.tsx` (`#2897`)
16. `e2e/discover/property-request-card-legacy-and-browse-all-2795.spec.ts` (`L162`) → `apps/web/src/features/discover/area-selected/sections/__tests__/ListingsBody.requestCard.test.tsx` (`#2897`)
17. `e2e/discover/property-request-card.spec.ts` (`L163`) → `e2e/canonical/property-request.canonical.ts` (`RQ1`/`RQ2`) + `apps/web/src/features/discover/area-selected/sections/__tests__/ListingsBody.requestCard.test.tsx` (`#2897`)
18. `e2e/discover/sr024-error-vs-empty.spec.ts` (`L171`) → `apps/web/src/features/discover/navigation/__tests__/discoverAreasJourneyPanelFilterIdentityAndError.test.tsx` + `e2e/specialist/discover-issue-1956-pr4-mobile-listings-scroll.specialist.ts` (`#2897`)
19. `e2e/discover/thanisandra-hennur-belt-marker-degradation.spec.ts` (`L173`) → `apps/web/src/components/map/__tests__/AreaMarkerLayer.test.tsx` + `apps/web/src/components/map/__tests__/AreaMarkerLayer.destinations.test.tsx` (`#2897`)

### Batch C — Discover Controllers, Moderation, Lifecycle, Trends, POI & Broker Forms (`#2859` B1–B7 — 46 files)
20. `e2e/area-intelligence-1528.spec.ts` (`L7`) → `apps/web/src/hooks/__tests__/useAreaIntelligence.2859.test.tsx` + `apps/web/src/pages/__tests__/Trends.areaIntelligenceWire2859.test.tsx` (`#2900`)
21. `e2e/broker-address-reconciliation.spec.ts` (`L11`) → `apps/web/src/components/broker/__tests__/ResidentialListingForm.locationFlow2859.test.tsx` + `apps/web/src/pages/broker/editListing/__tests__/EditListingForm.titleLocality2859.test.tsx` (`#2899`)
22. `e2e/broker-listing-form.spec.ts` (`L16`) → `e2e/canonical/listing-lifecycle.canonical.ts` (`T13`) + `e2e/canonical/listing-edit.canonical.ts` (`T22`) + `apps/web/src/components/broker/__tests__/ResidentialListingForm.locationFlow2859.test.tsx` (`#2899`)
23. `e2e/broker-preferences.spec.ts` (`L18`) → `apps/web/src/pages/broker/__tests__/Preferences.addFlow2859.test.tsx` + `apps/web/src/pages/broker/__tests__/Preferences.realSelect2859.test.tsx` + `apps/web/src/pages/broker/__tests__/Preferences.pageHttp.test.tsx` + `apps/api/src/test/java/com/example/realestate/broker/focus/BrokerMarketFocusControllerTest.java` + `apps/api/src/test/java/com/example/realestate/broker/focus/BrokerMarketFocusServiceTest.java` (`#2898`; see §4.2 below)
24. `e2e/buyer-area-route-1539.spec.ts` (`L20`) → `apps/web/src/__tests__/App.trendsAreaRoute2859.test.tsx` + `apps/web/src/__tests__/pages/TrendsAreaResolved.test.tsx` (`#2900`)
25. `e2e/commercial-create-listing-1684.spec.ts` (`L33`) → `e2e/canonical/commercial-lifecycle.canonical.ts` (`CC1`–`CC4`) + `apps/web/src/components/broker/__tests__/CommercialListingForm.gating2859.test.tsx` (`#2899`)
26. `e2e/commercial-subtype-implied-type-hotfix.spec.ts` (`L35`) → `e2e/canonical/commercial-lifecycle.canonical.ts` (`CC1b`/`CC1c`) + `apps/web/src/components/map/filters/__tests__/PropertyTypeFilter.impliedPropertyType.test.tsx` (`#2899`)
27. `e2e/discover-1939-listing-peek-url-restore.spec.ts` (`L38`) → `apps/web/src/pages/__tests__/MapDiscovery.listingSelectedMarker2859.test.tsx` (`#2903`)
28. `e2e/discover-2193-node-invariant.spec.ts` (`L41`) → `apps/web/src/features/discover/controllers/__tests__/useDiscoverMapDataController.pins2859.test.tsx` + `apps/api/src/test/java/com/example/realestate/discover/NodeAreaInvariant2193IT.java` (`#2902`)
29. `e2e/discover-anon-price-consistency-1941.spec.ts` (`L50`) → `apps/web/src/pages/__tests__/ListingDetail.sessionSwitch2859.test.tsx` + `apps/api/src/test/java/com/example/realestate/discover/CityAreaListingsPriceProjection2859IT.java` (`#2902`)
30. `e2e/discover-area-first-drilldown-1483.spec.ts` (`L53`) → `apps/web/src/pages/__tests__/MapDiscovery.startOverUrl2859.test.tsx` (`#2903`)
31. `e2e/discover-area-keyword-search.spec.ts` (`L55`) → `apps/web/src/features/discover/presentation/__tests__/discoverBadge.searchQuery2859.test.ts` + `apps/web/src/hooks/__tests__/useDiscoverUrlState.searchQuery2859.test.ts` (`#2901`)
32. `e2e/discover-badge.spec.ts` (`L59`) → `apps/web/src/pages/__tests__/MapDiscovery.issue1152.test.ts` (`#2901`)
33. `e2e/discover-bounded-listing-2087.spec.ts` (`L61`) → `apps/web/src/pages/__tests__/MapDiscovery.nodeListingsBack2859.test.tsx` (`#2903`)
34. `e2e/discover-city-listings-empty-city-guard-2189.spec.ts` (`L62`) → `apps/web/src/pages/__tests__/MapDiscovery.cityListingsRequest2859.test.tsx` (`#2903`)
35. `e2e/discover-city-switch.spec.ts` (`L63`) → `apps/web/src/components/discover/__tests__/DiscoverControlBar.kundapur2859.test.tsx` (`#2903`)
36. `e2e/discover-cluster-focus-back.spec.ts` (`L64`) → `apps/web/src/pages/__tests__/MapDiscovery.clusterFocusRelay2859.test.tsx` (`#2903`)
37. `e2e/discover-commercial-card-summary.spec.ts` (`L65`) → `apps/web/src/hooks/__tests__/useDiscoverListings.issue2016.test.ts` + `apps/web/src/lib/__tests__/discoverMappers.test.ts` (`#2901`)
38. `e2e/discover-filter-chips.spec.ts` (`L68`) → `apps/web/src/hooks/__tests__/useDiscoverPageState.chipDismiss2859.test.tsx` (`#2901`)
39. `e2e/discover-group-results-1597.spec.ts` (`L69`) → `apps/web/src/pages/__tests__/MapDiscovery.groupResultsCold2859.test.tsx` (`#2903`)
40. `e2e/discover-map-hierarchy.spec.ts` (`L72`) → `apps/web/src/pages/__tests__/MapDiscovery.mapHierarchy2859.test.tsx` (`#2903`)
41. `e2e/discover-telemetry-consent-1531.spec.ts` (`L92`) → `apps/web/src/components/discover/__tests__/DiscoverRightPanel.agriLocality2859.test.tsx` (`#2902`)
42. `e2e/discover-telemetry-consent-1576.spec.ts` (`L93`) → `apps/web/src/features/discover/surfaces/__tests__/DiscoverOverlaySurface.consentEmit2859.test.tsx` (`#2902`)
43. `e2e/discover-trust-badge-1567.spec.ts` (`L95`) → `apps/web/src/features/discover/controllers/__tests__/useDiscoverMapDataController.legacyAreaTrust2859.test.ts` (`#2902`)
44. `e2e/discover-url-state.spec.ts` (`L97`) → `apps/web/src/pages/__tests__/MapDiscovery.areaKeyColdLoad2859.test.tsx` (`#2903`)
45. `e2e/discover-viewport.spec.ts` (`L99`) → `apps/web/src/hooks/__tests__/useDiscoverPageState.chipDismiss2859.test.tsx` (`#2901`)
46. `e2e/discover/issue-1956-pr4-price-auth-contract.spec.ts` (`L120`) → `apps/web/src/features/discover/controllers/__tests__/useDiscoverMapDataController.areaKeysPurpose2859.test.ts` + `apps/api/src/test/java/com/example/realestate/discover/CityAreaListingsPriceProjection2859IT.java` (`#2902`)
47. `e2e/homepage-listing-journey.spec.ts` (`L176`) → `apps/web/src/pages/__tests__/LandingPage.navigation2859.test.tsx` + `apps/web/src/components/listing/__tests__/ListingGallery.anonLock2859.test.tsx` (`#2900`)
48. `e2e/issue-2015-search-this-area-viewport.spec.ts` (`L178`) → `apps/web/src/pages/__tests__/MapDiscovery.searchThisAreaRelay2859.test.tsx` (`#2903`)
49. `e2e/issue-2017-multi-area-areaset-commit-regression.spec.ts` (`L180`) → `apps/web/src/features/discover/components/__tests__/AreaSetDraftPanel.realCommit2859.test.tsx` (`#2903`)
50. `e2e/issue-2454-scope-aware-relaxation-previews.spec.ts` (`L183`) → `apps/web/src/hooks/__tests__/useRelaxationPreviews.test.ts` + `apps/web/src/components/discover/panels/__tests__/AreaZeroResultRecovery.test.tsx` (`#2901`)
51. `e2e/journey/admin-listings-inventory-2370.spec.ts` (`L189`) → `apps/web/src/components/admin/listings/__tests__/ListingEditorDrawer.inventory2859.test.tsx` + `apps/web/src/pages/admin/__tests__/Listings.editParam2859.test.tsx` (`#2898`)
52. `e2e/journey/admin-moderation.spec.ts` (`L190`) → `apps/web/src/pages/admin/__tests__/PendingListings.moderation2859.test.tsx` (`#2898`)
53. `e2e/journey/area-trends-2581.spec.ts` (`L192`) → `apps/web/src/pages/__tests__/TrendsAreaResolved.journey2581.test.tsx` + `apps/web/src/components/area/__tests__/AreaGuide.test.tsx` + `apps/web/src/pages/__tests__/Trends.areaIntelligenceWire2859.test.tsx` + `apps/api/src/test/java/com/example/realestate/intelligence/AreaIntelligenceSnapshotRollupJobIT.java` (`#2900` / `#2909`; see §4.4 below)
54. `e2e/journey/listing-lifecycle.spec.ts` (`L195`) → `e2e/canonical/listing-lifecycle.canonical.ts` (`T13`–`T15b`) + `apps/web/src/pages/__tests__/ListingDetail.previewLifecycle2859.test.tsx` (`#2898`)
55. `e2e/journey/pending-approvals-review-2369.spec.ts` (`L196`) → `apps/web/src/pages/admin/__tests__/PendingListings.moderation2859.test.tsx` (`#2898`)
56. `e2e/journey/trust-identity-review.spec.ts` (`L197`) → `apps/web/src/components/trust/__tests__/TrustProgressPanel.identityRealSelect2859.test.tsx` (`#2898`)
57. `e2e/listing-rejection-resubmit.spec.ts` (`L199`) → `apps/api/src/test/java/com/example/realestate/listing/api/ListingModerationLifecycleIT.java` + `apps/web/src/components/broker/listings/__tests__/BrokerListingCard.moderation2859.test.tsx` (`#2898`)
58. `e2e/map-filters.spec.ts` (`L202`) → `apps/web/src/pages/__tests__/Trends.noErrorGuide2859.test.tsx` (`#2901`)
59. `e2e/nav-roles.spec.ts` (`L203`) → `apps/web/src/components/layout/__tests__/AppLayout.navRoles2859.test.tsx` (`#2898`)
60. `e2e/poi-display.spec.ts` (`L204`) → `apps/web/src/components/poi/__tests__/NearbyPois2859.test.tsx` + `apps/web/src/components/poi/__tests__/PoiManager.approve2859.test.tsx` (`#2900`)
61. `e2e/poi-locality-teaser.spec.ts` (`L205`) → `apps/web/src/components/poi/__tests__/PoiManager.approve2859.test.tsx` + `apps/web/src/pages/broker/editListing/steps/__tests__/ReviewStep.locality2859.test.tsx` (`#2900`)
62. `e2e/regression-1240-marker-lat-lon.spec.ts` (`L209`) → `apps/web/src/features/discover/controllers/__tests__/useDiscoverMapDataController.pins2859.test.tsx` (`#2902`)
63. `e2e/residential-create-listing-1722.spec.ts` (`L210`) → `apps/web/src/components/broker/__tests__/ResidentialListingForm.locationFlow2859.test.tsx` (`#2899`)
64. `e2e/trends.spec.ts` (`L215`) → `apps/web/src/pages/__tests__/Trends.exhaustiveDeps.test.tsx` (`#2900`)
65. `e2e/user-journeys.spec.ts` (`L216`) → `apps/web/src/pages/__tests__/SavedAreas2859.test.tsx` + `apps/web/src/pages/__tests__/MyBookings.test.tsx` (`#2900`)

### Batch D — Canonical Extensions & Deletion-Gate Specs (`#2860` / `#2861` — 13 files, items 66–78)
66. `e2e/discover-agri-direction-first-1448.spec.ts` (`L43`) → `apps/web/src/pages/__tests__/MapDiscovery.agriDirectionFirst1448.test.tsx` (`#2896`)
67. `e2e/discover-agri-locality-marker-1468.spec.ts` (`L46`) → `e2e/canonical/discover-agri-first.canonical.ts` (`T8b`, `T9`, `T8c`) + `e2e/canonical/panel-exclusivity.canonical.ts` (`T18`) (`#2873` / `#2896`)
68. `e2e/discover/issue-1956-pr6-no-blank-panel.spec.ts` (`L129`) → `e2e/canonical/discover-area-first.canonical.ts` (`T10b`) (`#2873` / `#2896`)
69. `e2e/discover/issue-2205-schoolfirst-groupid-clear-browser-proof.spec.ts` (`L145`) → `e2e/canonical/discover-school-first.canonical.ts` (`T7b`) (`#2873` / `#2896`)
70. `e2e/issue-1065-final.spec.ts` (`L177`) → `e2e/canonical/discover-area-first.canonical.ts` (`T25`, `T10b`) (`#2873` / `#2896`)
71. `e2e/admin-intelligence-smoke.spec.ts` (`L4`) → `apps/web/src/pages/admin/__tests__/AdminIntelligence.2861.test.tsx` (`#2896`)
72. `e2e/area-overview.spec.ts` (`L8`) → `apps/web/src/pages/__tests__/TrendsAreaResolved.journey2581.test.tsx` + `apps/web/src/pages/__tests__/Trends.noErrorGuide2859.test.tsx` + `apps/web/src/pages/__tests__/Trends.issue1528.test.tsx` + `apps/web/src/components/layout/__tests__/AppLayout.navRoles2859.test.tsx` (`#2909`; `/insights` route retired in `apps/web/src/App.tsx`; see §4.1 below)
73. `e2e/auth-journey-1509.spec.ts` (`L9`) → `e2e/canonical/auth-session.canonical.ts` (`T1c`, `T2`, `T2b`) (`#2873` / `#2896`)
74. `e2e/discover-opensearch-parity.spec.ts` (`L75`) → `apps/api/src/test/java/com/example/realestate/discover/CityAreaListingsIT.java` + `e2e/canonical/discover-area-first.canonical.ts` (`T4`–`T6`) + `e2e/canonical/discover-school-first.canonical.ts` (`T7`) + `apps/web/src/features/discover/controllers/__tests__/useDiscoverFilterChromeController.search2859.test.tsx` + `apps/api/src/test/java/com/example/realestate/discover/RoutingDiscoverListingsServiceTest.java` + `apps/api/src/test/java/com/example/realestate/discover/DiscoverQueryDslTest.java` (`#2909`; see §4.3 below)
75. `e2e/discover-to-trends.spec.ts` (`L94`) → `apps/web/src/components/map/__tests__/PropertyMap.discoverToTrends2861.test.tsx` + `apps/web/src/features/discover/navigation/__tests__/discoverAreasJourneyPanelAreaLeaf.test.tsx` (`#2896`)
76. `e2e/journey/admin-duplicates.spec.ts` (`L188`) → `apps/web/src/pages/admin/__tests__/Duplicates.2861.test.tsx` (`#2896`)
77. `e2e/journey/booking-journey.spec.ts` (`L193`) → `e2e/canonical/booking-request.canonical.ts` (`T16`, `T17`, `T17b`) + `apps/api/src/test/java/com/example/realestate/booking/BookingPersistenceIT.java` (`#2879` / `#2896`)
78. `e2e/journey/broker-listing-creation.spec.ts` (`L194`) → `e2e/canonical/listing-lifecycle.canonical.ts` (`T13`–`T15b`) + `apps/web/src/components/broker/__tests__/ResidentialListingForm.subtypeSubmit2861.test.tsx` (`#2896`)

### Batch E — Superseded / Baseline-Red Pre-`#1956` / Pre-`#2715` Specs (`#2826` / `#2855` / `#2856` — 18 files, items 79–96)
79. `e2e/discover-area-cards.spec.ts` (`L52`) → Superseded pre-`#1956` testids; covered by `e2e/specialist/discover-issue-1823-camera-fit-policy.specialist.ts` + `e2e/specialist/discover-issue-2305-cluster-marker-skin.specialist.ts` + `apps/web/src/components/map/__tests__/AreaMarkerLayer.destinations.test.tsx`
80. `e2e/discover-area-nav-journey.spec.ts` (`L56`) → Superseded `scope=` guided-entry state; covered by `e2e/specialist/discover-issue-1823-camera-fit-policy.specialist.ts` + `e2e/specialist/discover-issue-2083-home-breadcrumb-back-camera-race.specialist.ts`
81. `e2e/discover-area-reskin-mobile-2159.spec.ts` (`L57`) → Browser assertions (`390px` no h-overflow, single-column card layout, `node=` surviving `List -> Map -> List`) migrated directly into `e2e/specialist/discover-issue-1956-pr4-mobile-listings-scroll.specialist.ts` (`L119`) + `e2e/specialist/discover-listing-detail-reskin-mobile-2159.specialist.ts` (`L71`)
82. `e2e/discover-area-selected-filters.spec.ts` (`L58`) → Covered by `e2e/canonical/discover-area-first.canonical.ts` (`T5`/`T6`/`T24`) + `e2e/specialist/discover-journey-switch-overlay-cleanup-1940.specialist.ts` + `e2e/specialist/discover-issue-2089-filter-list-map-parity.specialist.ts`
83. `e2e/discover-batch-b-journeys.spec.ts` (`L60`) → `B5` covered by `e2e/specialist/discover-issue-2715-school-pin-vs-empty-pill.specialist.ts`; `B8` (`390×844` mobile school-selected h-overflow, `school-summary-band` width, and no document double-scroll) migrated directly into `e2e/specialist/discover-issue-2770-compact-school-context.specialist.ts` (`L157`)
84. `e2e/discover-correctness-1064.spec.ts` (`L66`) → `#2751` baseline-red obsolete pre-`#1956` spec; covered by `e2e/canonical/discover-area-first.canonical.ts` (`T4`–`T6`) + `apps/web/src/pages/__tests__/MapDiscovery.startOverUrl2859.test.tsx`
85. `e2e/discover-correctness-1067.spec.ts` (`L67`) → `#2751` baseline-red obsolete spec; covered by `e2e/canonical/discover-school-first.canonical.ts` (`T7`) + `apps/web/src/pages/__tests__/MapDiscovery.schoolJourney2857.test.tsx` + `e2e/specialist/discover-1738-regression.specialist.ts`
86. `e2e/discover-results-redesign-1547.spec.ts` (`L77`) → Superseded pre-`#2729` card selection contract; covered by `e2e/specialist/discover-issue-1956-pr4-mobile-listings-scroll.specialist.ts` + `e2e/specialist/discover-issue-1956-pr4-listing-peek-camera-restore.specialist.ts` + `e2e/specialist/discover-results-reskin-2729.specialist.ts`
87. `e2e/discover/active-context-chips-and-badge.spec.ts` (`L100`) → `#2751` baseline-red; covered by `apps/web/src/hooks/__tests__/useDiscoverPageState.chipDismiss2859.test.tsx`, `apps/web/src/features/discover/controllers/useDiscoverBadgeController.issue2190.test.ts`, and `e2e/specialist/discover-map-info-dock-2748.specialist.ts`
88. `e2e/discover/discover-mobile-guard.spec.ts` (`L106`) → `#2751` baseline-red (`discover-panel-drawer` removed in `#1953`); covered by `e2e/specialist/discover-mobile-list-map-shell-1953.specialist.ts` + `e2e/specialist/discover-control-bar-mobile-reachability-1953.specialist.ts`
89. `e2e/discover/issue-1956-areas-adaptive-journeys.spec.ts` (`L109`) → `#2751` baseline-red; covered by `e2e/canonical/discover-area-first.canonical.ts` (`T4`–`T6`/`T24`) + `apps/web/src/pages/__tests__/MapDiscovery.mapHierarchy2859.test.tsx` + `e2e/specialist/discover-issue-2089-filter-list-map-parity.specialist.ts`
90. `e2e/discover/issue-1956-pr2-breadcrumb.spec.ts` (`L111`) → `#2751` baseline-red (`d:coastal` removed); covered by `e2e/specialist/discover-issue-1956-pr5-desktop-breadcrumb-regression.specialist.ts` + `e2e/specialist/discover-issue-2089-breadcrumb-list-flex-layout.specialist.ts`
91. `e2e/discover/issue-1956-pr5-mobile-list-first.spec.ts` (`L123`) → `#2751` baseline-red (`d:coastal` removed); covered by `e2e/specialist/discover-mobile-list-map-shell-1953.specialist.ts` + `e2e/specialist/discover-issue-1956-pr4-mobile-listings-scroll.specialist.ts`
92. `e2e/discover/issue-2083-camera-back-determinism.spec.ts` (`L130`) → `#2751` baseline-red; covered by `e2e/specialist/discover-issue-2083-home-breadcrumb-back-camera-race.specialist.ts` + `e2e/specialist/discover-issue-1823-camera-fit-policy.specialist.ts`
93. `e2e/discover/mobile-landing-journey-switcher-1953.spec.ts` (`L159`) → `#2751` baseline-red pre-`#2715` switcher; covered by `e2e/specialist/discover-control-bar-mobile-reachability-1953.specialist.ts`
94. `e2e/discover/thanisandra-hennur-belt-label-collision-1815.spec.ts` (`L172`) → Superseded `groupId=thanisandra-hennur-belt`; covered by `e2e/specialist/discover-issue-2305-cluster-marker-skin.specialist.ts` + `e2e/specialist/discover-issue-2330-marker-reskin-visual.specialist.ts` + `apps/web/src/components/map/__tests__/AreaMarkerLayer.destinations.test.tsx`
95. `e2e/issue-2419-mobile-invalid-polygon.spec.ts` (`L181`) → `#2751` baseline-red; covered by `e2e/specialist/discover-issue-2419-pr1-polygon-scope.specialist.ts` + `e2e/specialist/issue-2016-result-scope-contract.specialist.ts`
96. `e2e/issue-2461-polygon-panel-parity.spec.ts` (`L185`) → `#2751` baseline-red; covered by `e2e/specialist/issue-2016-result-scope-contract.specialist.ts` + `e2e/specialist/discover-issue-2419-pr1-polygon-scope.specialist.ts`

### Batch F — Unused Legacy Fixture & Directory Artefacts (4 files)
- `e2e/fixtures/agri-boundary.json` (0 references outside retired legacy specs)
- `e2e/fixtures/regions-summary.json` (0 references outside retired legacy specs)
- `e2e/fixtures/test-image.jpg` (0 references outside retired legacy specs)
- `e2e/integration-ui/.gitkeep` (empty legacy directory placeholder)

---

## 4. Resolution of the Five Specific Coverage Concerns (`L8`, `L18`, `L75`, `L192`, `L44`)

### 4.1 `L8` — `e2e/area-overview.spec.ts` (`AO5`–`AO9`)
- **Current supported or obsolete behaviour:**
  - `AO1`–`AO4` were already removed inside the spec itself (`area-overview.spec.ts:4-5`: tested legacy confidence-tier tables on `/area-overview`).
  - `AO5` (**Supported**): Global header navigation displays `"Trends"` (never `"Insights"`), and clicking `"Trends"` navigates to `/trends`.
  - `AO6` (**Obsolete / Retired**): The legacy `/insights` route was removed from `apps/web/src/App.tsx` (`App.tsx:127-128, 415` routes `/trends` and `/trends/:citySlug/areas/:areaSlug` only; `/insights` falls through to `<Route path="*" element={<NotFound />} />`).
  - `AO7` (**Supported**): Unknown non-pipe `areaKey` (`/trends?areaKey=INVALID...`) renders `"Area not found"` without crashing, while a full pipe `areaKey` renders `AreaGuide` without falling through to the legacy error screen.
  - `AO8` (**Superseded in `#1528`, Supported via `AreaGuide`**): Under `#1528` (`apps/web/src/pages/Trends.tsx:25-38, 100-101, 205-231`), `AreaGuide` is the default `/trends` experience (`shouldRenderGuide = isAreaGuideMode || selectedKey === ''`); the old `"Select an area to explore"` empty state from the legacy `#771` dashboard was intentionally removed (`Trends.issue1528.test.tsx:215-217`), and `/trends?city=udupi&areaKey=` renders `AreaGuide` (`AreaGuideSkeleton` / default-area auto-population / `AreaGuideNoCityAreas`) without crashing or showing `"Area not found"`.
  - `AO9` (**Supported**): `/trends?city=udupi&areaKey=IN|KA|Udupi|Manipal` (4-segment pipe key) renders the area heading (`<h1>Manipal</h1>`) without `"Area not found"` or crash.
- **Exact existing or newly implemented replacement tests:**
  - `apps/web/src/components/layout/__tests__/AppLayout.test.tsx:141` (`"Insights"` nav link absent)
  - `apps/web/src/components/layout/__tests__/AppLayout.navRoles2859.test.tsx` & `apps/web/src/pages/__tests__/LandingPage.navigation2859.test.tsx` (`"Trends"` nav link visible and click lands on `/trends`)
  - `apps/web/src/pages/__tests__/Trends.noErrorGuide2859.test.tsx` (`M4.neg`: pipe `areaKey` renders guide `h1` and never `"Area not found"`)
  - `apps/web/src/pages/__tests__/Trends.issue1528.test.tsx` (bare `/trends`, `/trends?city=udupi`, no-area city `AreaGuideNoCityAreas`, pipe `areaKey` heading, and non-pipe `areaKey` legacy fallback)
  - `apps/web/src/pages/__tests__/TrendsAreaResolved.journey2581.test.tsx` (**Newly implemented**: `AO6` `/insights` 404 boundary proof + `AO8`/`AO9` `/trends?city=udupi&areaKey=` and `/trends?city=udupi` default-area auto-population into `<h1>Manipal</h1>`)
- **Remaining gaps and how they were closed:**
  - Explicit route-level verification of `/insights` hitting `NotFound` (`AO6`) and `/trends?city=udupi&areaKey=` + `/trends?city=udupi` auto-population (`AO8`/`AO9`) was added in `apps/web/src/pages/__tests__/TrendsAreaResolved.journey2581.test.tsx`. Zero remaining gaps.
- **Final deletion justification:**
  - `AO6` (`/insights` redirect) and the pre-`#1528` `"Select an area to explore"` copy in `AO8` are deliberately retired as obsolete product contracts; all supported `/trends` navigation, empty-param, invalid-key, and pipe-key behaviours (`AO5`, `AO7`, `AO8`, `AO9`) are protected in deterministic Vitest route/component suites. Manifest row `L8` is updated to `MOVE_DOWN` → `apps/web/src/pages/__tests__/TrendsAreaResolved.journey2581.test.tsx`.

### 4.2 `L18` — `e2e/broker-preferences.spec.ts` (`BP1`–`BP5`, `BP-422`)
- **Current supported or obsolete behaviour:**
  - All broker market-focus behaviours in `e2e/broker-preferences.spec.ts` are **supported** in current product code (`apps/web/src/pages/broker/Preferences.tsx` and `apps/api/src/main/java/com/example/realestate/broker/focus/BrokerMarketFocusController.java`):
    - `BP1-a..b`: `/broker/preferences` route guard for broker role vs anonymous/buyer redirect.
    - `BP2-a..d`: `GET /api/broker/market-focus` renders seeded and manual focus rows, heading, and re-seed button (with Remove action only on `manual` rows).
    - `BP3-a..e`: Empty state renders `"Seed from my listings"` button, `POST /api/broker/market-focus/seed`, and refetches list.
    - `BP4-a..j`: Add market-focus form with real Radix `<Select>` dropdowns for Area (`Kadri, Mangalore`), Property Type (`Apartment`), and Purpose (`For Rent`), `POST /api/broker/market-focus` sending `{ areaKey, propertyType, listingPurpose }` (no `citySlug`), refetching `GET` (`1 -> 2` rows), and rendering the new row with `manual` badge.
    - `BP-422`: `422` response on `POST /api/broker/market-focus` renders error toast (`"Unknown area"`) via real `<Toaster />`.
    - `BP5-a..j`: Clicking Remove opens `alertdialog`, confirming sends `DELETE /api/broker/market-focus` with `citySlug` in body, and refetches list back to empty state.
- **Exact existing or newly implemented replacement tests:**
  - `apps/web/src/pages/broker/__tests__/Preferences.realSelect2859.test.tsx` (`BP4-c`: real Radix Select interaction for Area / Property Type / Purpose; mutation `M-BP4c` killed)
  - `apps/web/src/pages/broker/__tests__/Preferences.addFlow2859.test.tsx` (`BP4-e..j` + `BP-422`: exact `POST` body without `citySlug`, refetch `1 -> 2`, rendered `Kadri, Mangalore`, `manual` vs `seeded` badge, and `422` `<Toaster />` `"Unknown area"`; mutations `A29`, `A30`, `A31`, `A33`, `M-BP4g`, `M-BP4i`, `M-BP4j`, `M-BP422` killed)
  - `apps/web/src/pages/broker/__tests__/Preferences.pageHttp.test.tsx` (`BP2-a..d`, `BP3-a..e`, `BP4-a..b`, `BP5-a..j`: `GET` list, empty state, `POST /seed`, Remove `alertdialog`, `DELETE` with `citySlug`, refetch; 9 tests)
  - `apps/web/src/__tests__/App.brokerWorkspaceRoutes.test.tsx` (`BP1-a..b`: `/broker/preferences` route protection)
  - `apps/api/src/test/java/com/example/realestate/broker/focus/BrokerMarketFocusControllerTest.java` & `apps/api/src/test/java/com/example/realestate/broker/focus/BrokerMarketFocusServiceTest.java` (backend persistence, `422` area validation, duplicate handling, and JWT broker isolation)
- **Remaining gaps and how they were closed:**
  - Historical `PR-6a` (`#2835`) had marked `L18` as `KEEP` solely because `BP4-c`, `BP4-e..j`, and `BP-422` (`A29, A30, A31, A33`) lacked lower-level coverage at that time. Issue `#2859` Batch B1 (`docs/testing/e2e-retirement-map-2859-b1.md:174-191`, merged in `#2898`) closed every one of those surviving mutations with `Preferences.realSelect2859.test.tsx` and `Preferences.addFlow2859.test.tsx`. Zero remaining gaps.
- **Final deletion justification:**
  - Supersedes the historical `PR-6a` conditional `KEEP` decision under the clean-slate direction: 100% of `BP1`–`BP5` and `BP-422` UI, Radix Select, toast, HTTP payload, and backend persistence contracts are mutation-proven in Vitest and JUnit.

### 4.3 `L75` — `e2e/discover-opensearch-parity.spec.ts` (`J1`–`J4`)
- **Current supported or obsolete behaviour:**
  - **OpenSearch Feature Flag Status:** `discover.opensearch.enabled` defaults to `false` in `apps/api/src/main/resources/application.yml` (`@Value("${discover.opensearch.enabled:false}")`), and `OpenSearchAreaCountProvider.java:29` / `PostgresAreaSchoolCountProvider.java:20` explicitly document that `discover.opensearch.enabled` **must remain `false`** in production and CI because the area-hierarchy and school-count indices exist only in PostgreSQL/PostGIS. Consequently, running a Playwright browser spec against the default-off runtime never exercised OpenSearch — it only re-tested the standard PostgreSQL/PostGIS `/api/discover/**` endpoints.
  - **Supported Buyer & API Behaviours (`J1`–`J4`):**
    - `J1`: Anonymous area-first `/api/discover/cities/{city}/listings` returns `200`, renders listing cards, emits zero `401`/`403`, respects `limitPerArea`, and leaks zero private seller/broker PII fields (`sellerPhone`, `sellerEmail`, `sellerWhatsapp`, `brokerUserId`, `adminNotes`, `ExactPricePaise`).
    - `J2` & `J3`: Anonymous and authenticated school-radius `/api/discover/cities/{city}/school-radius-listings` returns `200` with boolean `hasMore` and renders listing cards.
    - `J4`: Keyword contextual search (`q=apartment`) narrows area listings (`filtered <= baseline`) and clearing `q` restores the baseline count.
    - **Backend OpenSearch Adapter Contract:** Flag-gated routing (`RoutingDiscoverListingsService`, `RoutingDiscoverMarkersService`, `RoutingDiscoverSummaryService`) and OpenSearch DSL generation (`DiscoverQueryDsl`, `OpenSearchDiscoverListingsAdapter`).
- **Exact existing or newly implemented replacement tests:**
  - **Canonical & Specialist Browser E2E (PostgreSQL/PostGIS runtime):**
    - `e2e/canonical/discover-area-first.canonical.ts` (`T4`, `T5`, `T6`: area-first drilldown, card rendering, filter narrowing)
    - `e2e/canonical/discover-school-first.canonical.ts` (`T7`: school-first selection and radius listings)
    - `e2e/specialist/discover-viewport-truncation.specialist.ts` (`L98`: `limitPerArea` truncation indicator and cap)
  - **Frontend Integration / Controller Unit Tests:**
    - `apps/web/src/pages/__tests__/MapDiscovery.schoolJourney2857.test.tsx` (`J2`/`J3` school-radius listings request and card rendering)
    - `apps/web/src/features/discover/controllers/__tests__/useDiscoverFilterChromeController.search2859.test.tsx`, `apps/web/src/hooks/__tests__/useDiscoverUrlState.searchQuery2859.test.ts`, and `apps/web/src/features/discover/presentation/__tests__/discoverBadge.searchQuery2859.test.ts` (`J4`: `q=` keyword search narrowing and chip dismiss restoring baseline)
  - **Backend Integration & Unit Tests (PostGIS + OpenSearch Routing/DSL):**
    - `apps/api/src/test/java/com/example/realestate/discover/CityAreaListingsIT.java` & `apps/api/src/test/java/com/example/realestate/discover/CityAreaListingsPriceProjection2859IT.java` (`J1` & `J4`: `/api/discover/cities/{city}/listings`, `limitPerArea`, keyword `q=`, and anonymous PII/price projection omission)
    - `apps/api/src/test/java/com/example/realestate/discover/SchoolRadiusListingsControllerIT.java` (`J2` & `J3`: `/api/discover/cities/{city}/school-radius-listings` and `hasMore` contract)
    - `apps/api/src/test/java/com/example/realestate/discover/RoutingDiscoverListingsServiceTest.java`, `apps/api/src/test/java/com/example/realestate/discover/RoutingDiscoverMarkersServiceTest.java`, `apps/api/src/test/java/com/example/realestate/discover/RoutingDiscoverSummaryServiceTest.java`, `apps/api/src/test/java/com/example/realestate/discover/DiscoverQueryDslTest.java`, and `apps/api/src/test/java/com/example/realestate/discover/OpenSearchDiscoverListingsAdapterTest.java` (flag-on vs flag-off delegation and OpenSearch query DSL parity)
- **Remaining gaps and how they were closed:**
  - No functional gaps existed; manifest row `L75` was updated from stale `DELETE_OBSOLETE` (`awaiting owner ruling`) to `MOVE_DOWN` → `apps/api/src/test/java/com/example/realestate/discover/CityAreaListingsIT.java` with full citations across Canonical E2E, Vitest, PostGIS ITs, and OpenSearch unit tests.
- **Final deletion justification:**
  - Browser-level OpenSearch parity testing against a default-off (`discover.opensearch.enabled=false`) backend is redundant with Canonical E2E (`T4`–`T7`) and PostGIS ITs, while the OpenSearch routing and DSL contracts are directly tested in `RoutingDiscover*ServiceTest` and `DiscoverQueryDslTest`.

### 4.4 `L192` — `e2e/journey/area-trends-2581.spec.ts` (`Arms 1–9`)
- **Current supported or obsolete behaviour:**
  - All 9 arms (`A0`, `A1`–`A3`, `A1-A3.tier`, `A1-A3.wiring`, `A4`, `A5`, `A6`, `A7`, `A8.href`, `A8.land`, `A9`) represent **supported** product behaviour across Discover area leaf (`AreaLeafListingsSurface` / `AreaSelectedPanel`), `/trends/:citySlug/areas/:areaSlug` (`TrendsAreaResolved` + `AreaGuide`), and `/admin/intelligence` (`AdminIntelligence`).
- **Exact existing or newly implemented replacement tests:**
  - `apps/web/src/pages/__tests__/TrendsAreaResolved.journey2581.test.tsx` (**Newly implemented — 7 journey tests covering all `#2859 B4` `RETAIN` subclaims**):
    - `A0 + A1-A3.wiring + A4` (3 parameterized tests across Arms 1–3): mounts the real `AreaSelectedPanel` wired with `slugifyFromAreaKey(areaKey)` → clicks `'Trends'` link → navigates router to `/trends/udupi/areas/manipal` (`FULL` → `'Enough data'`), `/trends/udupi/areas/brahmavar` (`LIMITED` → `'Limited data'`), and `/trends/udupi/areas/kaup` (`INSUFFICIENT` → `'Not enough data yet'`) via `GET /api/trends/resolve-area` and `GET /api/trends/area-intelligence` for an anonymous buyer with zero `/auth` redirect.
    - `A5`: signed-in normal `USER` role navigating from Discover area leaf to `/trends/udupi/areas/brahmavar` renders `'Limited data'` with zero `/auth` redirect.
    - `A6`: mobile `390×844` viewport (`mockMatchMediaWidth(390)`) renders the mobile toolbar `'Trends'` link on `AreaSelectedPanel`, navigates to `/trends/udupi/areas/kaup`, and renders `'Not enough data yet'`.
    - `A7 + A8.land`: remounting/reloading at `/trends/udupi/areas/manipal` preserves URL and `'Enough data'`, and clicking `'View homes in Manipal'` lands on `/discover?city=udupi&areaKey=IN%7CKA%7CUdupi%7CManipal`, where the mounted real `MapDiscovery` restores the selected `Manipal` area leaf (`areas-breadcrumb-trail` = `'Manipal'`, auto-committed `rscope=areas&rareas=IN%7CKA%7CUdupi%7CManipal`, and `compact-results-trends-link` wired back to `/trends/udupi/areas/manipal`).
    - `A9`: mounts `AdminIntelligence` at `/admin/intelligence` (`Full`, `Limited`, `Insufficient`) and mounts `TrendsAreaResolved` across all three buyer pages (`/trends/udupi/areas/manipal` → `'Enough data'`, `/trends/udupi/areas/brahmavar` → `'Limited data'`, `/trends/udupi/areas/kaup` → `'Not enough data yet'`).
  - `apps/api/src/test/java/com/example/realestate/intelligence/AreaIntelligenceSnapshotRollupJobIT.java` (`run_seedsThreeBands_persistsDistinctConfidenceOutcomes`): seeds real LIVE listings across all 3 bands (`36` full, `15` limited, `3` insufficient) against real PostgreSQL, executes `AreaIntelligenceSnapshotRollupJob.run()`, and asserts real-DB cross-path parity between `AdminIntelligenceService.getAreaIntelligence(null)` live aggregate confidence (`"full"`, `"limited"`, `"insufficient"`) and `BuyerAreaIntelligenceService.getAreaIntelligence("udupi", areaKey)` cached snapshot `confidenceLabel` (`"Enough data"`, `"Limited data"`, `"Not enough data yet"`).
  - `apps/web/src/components/area/__tests__/AreaGuide.test.tsx` (`A1`, `A2`, `A3` chip rendering and styling, `MA1r`–`MA3r`)
  - `apps/web/src/__tests__/pages/TrendsAreaResolved.test.tsx` (`A8.href` CTA href `/discover?city=udupi&areaKey=IN%7CKA%7CUdupi%7CMalpe`, `MTA1`)
  - `apps/api/src/test/java/com/example/realestate/intelligence/BuyerAreaIntelligenceServiceTest.java` (`MBA2`: tier → buyer confidence label)
- **Remaining gaps and how they were closed:**
  - The `#2859 B4` retirement map (`docs/testing/e2e-retirement-map-2859-b4.md:144-152`) had left `A0`, `A1-A3.wiring`, `A4`, `A5`, `A6`, `A7`, `A8.land`, and `A9` marked `RETAIN`. All 8 subclaims are now closed across `apps/web/src/pages/__tests__/TrendsAreaResolved.journey2581.test.tsx` (including real `MapDiscovery` area restoration in `A8.land` and all 3 buyer pages in `A9`) and `apps/api/src/test/java/com/example/realestate/intelligence/AreaIntelligenceSnapshotRollupJobIT.java` (real-DB cross-path Admin live vs Buyer snapshot confidence parity across all 3 bands).
- **Final deletion justification:**
  - Every assertion of `e2e/journey/area-trends-2581.spec.ts` (including the previously self-skipping admin-credential E2E arm `A9`) now runs deterministically and unconditionally across `TrendsAreaResolved.journey2581.test.tsx`, `AreaIntelligenceSnapshotRollupJobIT.java`, `AreaGuide.test.tsx`, `TrendsAreaResolved.test.tsx`, and `BuyerAreaIntelligenceServiceTest.java`.

### 4.5 `L44` — `e2e/discover-agri-grouped-journey-1412.spec.ts` (`Tests #1`–`#12`)
- **Current supported or obsolete behaviour:**
  - **Obsolete / Retired (`#1`–`#4`, `#5b`, `#12`):** Tested the unmounted `AgriRegionalGroupsPanel` (`apps/web/src/components/discover/panels/AgriRegionalGroupsPanel.tsx:153`), legacy `?group=DIR:BAND` URL parameter (migrated to `region=` in `apps/web/src/features/discover/state/url/agricultural.ts:156-185`), and plural `areaKeys=` on `/api/discover/agri-map-listings` (replaced by singular `areaKey` / corridor params).
  - **Supported (`#5a`, `#5c`, `#6`, `#7`, `#8`, `#9`, `#10`, `#11`):**
    - `#5a` & `#5c`: Anonymous agri journey calls `GET /api/discover/cities/udupi/regional-area-groups?propertyType=agricultural_land` without `Authorization` and makes `0` requests to `/api/discover/markers`.
    - `#6` & `#10`: Clicking an agri listing card or clicking a rendered agri parcel `<Polygon>` (opening `AgriListingPanel` and clicking `agri-view-full-details-cta`) navigates to `/listing/:id`.
    - `#7`, `#8`, `#9`, `#11`: `AgriListingDetail` renders agricultural spec rows (`Water Source`, `Soil Type`, `Cultivation Status`, `Road Access`, `Ownership Type`, `Land Area`, `Approx. Area`, crops), renders the real `ListingDetailBoundaryMap` (`<Polygon>` + `fitBounds` when `boundary` GeoJSON is present; `<Marker>` centre fallback and `0` disclaimers when `boundary` is `null`), gates price and survey number for anonymous viewers (`agri-detail-survey-signin`, zero seller PII in backend teaser response), and displays formatted price, per-acre price, and survey number (`SY-88/4B`) for authenticated viewers.
- **Exact existing or newly implemented replacement tests:**
  - `apps/web/src/components/listing/agri/__tests__/AgriListingDetail.groupedJourney1412.test.tsx` (`L44-N1`..`L44-N6`, 6 tests, 14 transient mutation proofs `M1`..`M14` delivered in merged PR `#2899` / issue `#2890`; full per-assertion table in `docs/testing/e2e-retirement-map-2890-l44.md`)
  - `apps/web/src/components/listing/agri/__tests__/AgriListingDetail.priceGate2859.test.tsx` (anonymous vs authenticated price gating)
  - `apps/web/src/components/discover/panels/__tests__/DiscoverRightPanel.routing.test.tsx:850` & `apps/web/src/features/discover/controllers/__tests__/useDiscoverMapDataController.test.ts:1388` (`#6` card routing & `#5c` anonymous `0` markers requests)
  - `apps/api/src/test/java/com/example/realestate/listing/api/ListingResponseMapperTest.java:985-1036`, `apps/api/src/test/java/com/example/realestate/listing/api/PublicListingControllerTest.java:1008-1063`, and `apps/api/src/test/java/com/example/realestate/discover/DiscoverAgriMapListingsServiceTest.java:238-359` (backend PII/price/survey omission for anonymous agri responses and full payload for authenticated viewers)
  - `e2e/canonical/discover-agri-first.canonical.ts` (`T8`, `T8b`, `T8c`, `T9`: modern corridor-card `region=` agri-first browser journey)
- **Remaining gaps and how they were closed:**
  - All live assertion gaps (`#5a`, `#7`, `#8`, `#9`, `#10`, `#11`) were closed and mutation-proven (`M1`..`M14`) in merged PR `#2899`. In this PR (`#2909`), the stale manifest row (`L44`) and `docs/testing/e2e-retirement-map-2890-l44.md` §3 were updated from `DELETE_OBSOLETE` / `'replacement coverage scheduled after Friday in #2890'` to `MOVE_DOWN` → `apps/web/src/components/listing/agri/__tests__/AgriListingDetail.groupedJourney1412.test.tsx`.
- **Final deletion justification:**
  - All live agricultural discovery, parcel polygon selection, and `AgriListingDetail` behaviours (`#5a`, `#5c`, `#6`–`#11`) are protected by mutation-proven Vitest, JUnit, and Canonical E2E (`T8`–`T9`) tests; the remaining legacy assertions (`#1`–`#4`, `#5b`, `#12`) target the retired `?group=DIR:BAND` / `AgriRegionalGroupsPanel` / plural `areaKeys=` contract.
