# Current-Behaviour Coverage Matrix (`#2750` / `#1713` Clean-Slate E2E Finalisation)

This document is the authoritative **current-product behaviour coverage matrix** across all four verification layers:

1. **Canonical E2E Gate (`e2e/canonical/*.canonical.ts` — 14 files, 59 role-project tests across `J01`–`J16`)**: Cross-stack browser journeys running against the real local PostGIS fixture DB, real Spring Boot backend, real Vite production build (`dist/`), and real local Supabase-compatible JWT auth across `anon`, `user`, `broker`, and `admin` projects (`npm run test:e2e:gate`).
2. **Specialist Browser Suite (`e2e/specialist/*.specialist.ts` — 42 files, 240 browser tests)**: Real-browser DOM geometry, CSS layout/overflow, `elementFromPoint` hit-testing, Leaflet canvas/marker/cluster/polygon/camera interactions, Radix focus/portal traps, and mobile viewport (`390×844` / `375×667`) interactions (`npm run test:e2e:specialist`).
3. **Frontend Integration & Unit Suite (`apps/web/src/**/__tests__/*.test.{ts,tsx}`)**: Fast, deterministic Vitest + Testing Library component, controller, hook, and route-wiring tests with transient-mutation proof across all PRs `#2894`–`#2908`.
4. **Backend Integration & Unit Suite (`apps/api/src/test/java/**`)**: JUnit 5 + MockMvc + Testcontainers PostGIS/Flyway integration tests covering all Spring Boot controllers, services, spatial SQL queries, and security boundaries.

---

## 1. Product Route & Journey Coverage Matrix (`apps/web/src/App.tsx` + `apps/api`)

### 1.1 Public & Buyer Discovery Routes

| Route | Component | Supported Behaviour / Journey | Canonical E2E (`J01`–`J16`) | Specialist Browser (`e2e/specialist/`) | Frontend Integration / Unit (`apps/web/src/`) | Backend API / IT (`apps/api/src/test/`) |
|---|---|---|---|---|---|---|
| `/` | `LandingPage` | City selection, hero CTA to `/discover`, featured listings, area overview cards, trust section | `T1c` (`returnTo=/` + sign-out on homepage) | — | `pages/__tests__/LandingPage.navigation2859.test.tsx`, `pages/landing/__tests__/useLandingPageState.test.tsx` | `PublicListingControllerTest`, `AreaOverviewController` tests |
| `/auth` | `Auth` | Sign-in, sign-up, `returnTo` redirect preservation (`getSafeReturnTo`), invalid credentials handling | `J08`: `T1` (`user`, `broker`, `admin`), `T2`, `T2b`, `T3`, `T1c` | `issue-1589-broker-PostPropertyCTA-routing.specialist.ts` | `contexts/__tests__/AuthModalContext.realForms2847.test.tsx`, `contexts/__tests__/AuthModalContext.returnToMatrix2847.test.tsx`, `lib/__tests__/returnTo.test.ts` | `SecurityConfig` JWT filter tests |
| `/auth/callback` | `AuthCallback` | OAuth / magic-link session exchange and `returnTo` consumer redirect | `J08` (`T1`, `T2`, `T2b`) | — | `pages/__tests__/AuthCallback.consumerInvariant.test.tsx` | — |
| `/discover` (Area-First) | `MapDiscovery` | City hierarchy (`DIRECTION` → `AREA_CLUSTER` → `AREA` leaf), adaptive flat vs grouped cities, quick-filter chips, within-area keyword search, Buy/Rent intent continuity, `Search this area` viewport bounds, polygon draw filtering, multi-area set (`rscope=areas`), relaxation previews | `J01`: `T4`, `T5`, `T6`, `T10b`, `T18`, `T24`, `T25`, `T26`; `J04`: `T10`; `J11`: `T19`, `T20`; `J16`: `T23` | 29 Discover map/mobile/camera/marker/polygon specialist specs (see §2) | `pages/__tests__/MapDiscovery.*.test.tsx` (15 suites), `features/discover/**/__tests__/*.test.{ts,tsx}` | `NavigationControllerTest`, `CityAreaListings*IT`, `DiscoverListings*Test`, `DiscoverMarkers*IT`, `RelaxationPreviews*Test`, `PolygonRelaxationPreviewsControllerTest` |
| `/discover` (School-First) | `MapDiscovery` | `?journey=school-first`, area school count badges, `SchoolsInAreaPanel`, school card click → `schoolId` + `radiusKm=3`, compact school context (`#2770`), `SchoolRadiusLegend`, school pin vs empty pill (`#2715`), property-type filtering within radius | `J02`: `T7`, `T7b`, `T18` | `discover-issue-2715-school-pin-vs-empty-pill.specialist.ts`, `discover-issue-2770-compact-school-context.specialist.ts`, `discover-2717-school-filters-touch-target.specialist.ts`, `discover-schools-canonical-2124.specialist.ts`, `discover-schools-mobile-cluster-2124.specialist.ts`, `discover-issue-2149-mobile-school-first-marker-preview.specialist.ts`, `school-first-back-nav.specialist.ts` | `pages/__tests__/MapDiscovery.schoolJourney2857.test.tsx`, `components/map/__tests__/AreaMarkerLayer.schoolBadge2857.test.tsx`, `features/discover/controllers/__tests__/useDiscoverBadgeController.issue2190.test.ts` | `SchoolController` / `PublicSchoolRadiusListings*IT`, `SchoolAreaBoundsTrustBoundary2767IT` |
| `/discover` (Agri-First) | `MapDiscovery` | `?journey=agri-first`, direction/distance rings (`region`, `maxKm`), regional area groups, destination polygons (`destKey`), `AgriListingPanel`, `AgriGroupListingPeek`, anonymous price gate on map pins & cards | `J03`: `T8`, `T8b`, `T8c`, `T9` | `capture-discover-agri-first-polish-1771.specialist.ts`, `discover-agri-price-gate-1551.specialist.ts` | `pages/__tests__/MapDiscovery.agriDirectionFirst1448.test.tsx`, `pages/__tests__/MapDiscovery.agriOverlayPeek2857.test.tsx`, `hooks/__tests__/useRegionalAreaGroups.test.ts` | `AgriDestinations*IT`, `RegionalAreaGroups*Test`, `DiscoverAgriMapListings*IT` |
| `/discover` (Commercial) | `MapDiscovery` | Commercial purpose/subtype filtering (`office`, `retail_shop`, `warehouse`, `commercial_plot`, `showroom`), commercial card summary metrics, zero residential leakage | `J05`: `CC4`; `J07`: `CC1`–`CC4` | `commercial-subtype-wrap-2450.specialist.ts`, `commercial-rent-2726.specialist.ts` | `features/discover/state/__tests__/useDiscoverListings.issue2016.test.ts`, `features/discover/mappers/__tests__/discoverMappers.test.ts` | `CityAreaListingsCommercialSubtype2433IT`, `PublicSchoolRadiusListingsCommercialFacts2516IT` |
| `/listing/:id` | `ListingDetail` | Public listing detail (Residential, Commercial, Agricultural), anonymous price/contact/survey-number gating vs authenticated unlock, photo gallery lightbox, `ListingBoundaryMap` polygon vs centre-marker fallback, nearby POIs, Save Home toggle, Book Viewing modal, Owner/Broker preview banner & Take Offline / Reopen actions | `J04`/`J09`: `T11` (anon), `T12` (user); `J10`: `T16`, `T17`; `J13`: `T21` | `broker-listing-lifecycle-1595.specialist.ts` | `pages/__tests__/ListingDetail.sessionSwitch2859.test.tsx`, `pages/__tests__/ListingDetail.previewLifecycle2859.test.tsx`, `components/listing/agri/__tests__/AgriListingDetail.groupedJourney1412.test.tsx`, `components/listing/__tests__/NearbyPois2859.test.tsx`, `components/listing/__tests__/ListingGallery.anonLock2859.test.tsx` | `PublicListingControllerTest`, `PublicListingPhotoDisplayJourneyIT`, `ListingPoiControllerTest` |
| `/trends` | `Trends` | City & locality price trends, Recharts visualization, up-to-3 locality comparison (`areas=`), area intelligence cards | — | — | `pages/__tests__/Trends.exhaustiveDeps.test.tsx`, `pages/__tests__/Trends.areaIntelligenceWire2859.test.tsx`, `pages/__tests__/Trends.noErrorGuide2859.test.tsx` | `TrendsControllerTest`, `BuyerAreaIntelligence*IT` |
| `/trends/:citySlug/areas/:areaSlug` | `TrendsAreaResolved` | Deep-linked area guide, price bands, chip tiers, CTA into `/discover` | — | — | `__tests__/pages/TrendsAreaResolved.test.tsx`, `__tests__/App.trendsAreaRoute2859.test.tsx`, `components/area/__tests__/AreaGuide.test.tsx` | `BuyerAreaIntelligenceControllerTest`, `AreaOverviewController` |

### 1.2 Authenticated Buyer & Onboarding Routes

| Route | Component | Supported Behaviour / Journey | Canonical E2E (`J01`–`J16`) | Specialist Browser (`e2e/specialist/`) | Frontend Integration / Unit (`apps/web/src/`) | Backend API / IT (`apps/api/src/test/`) |
|---|---|---|---|---|---|---|
| `/onboarding` | `Onboarding` | Post-signup intent choice (`Browse & Invest` → `/`, `List as Owner` → `/broker/listings/new`, `Become a Broker` → `/broker/setup`), broker/admin redirect guard | — | — | `pages/__tests__/OnboardingAndBrokerSetup.test.tsx` | — |
| `/my-bookings` | `MyBookings` | Buyer viewing bookings list, status badges (`PENDING`, `CONFIRMED`, `CANCELLED`), cancel booking action | `J10`: `T17`, `T17b` | — | `pages/__tests__/MyBookings.test.tsx`, `pages/__tests__/useBrokerBookings.envelope.test.tsx` | `BookingControllerTest`, `BookingDuplicateActiveIndex2844IT` |
| `/saved-homes` | `SavedHomes` | Saved properties list, persistence across reload, unsave removal, empty state CTA | `J13`: `T21` | — | `pages/__tests__/SavedHomes.test.tsx` | `SavedListingsControllerTest`, `SavedListingsRepositoryIT` |
| `/saved-areas` | `SavedAreas` | Watched localities list, add/remove area watch, navigate to `/discover` or `/trends` | — | — | `pages/__tests__/SavedAreas2859.test.tsx` | `SavedAreaControllerTest` |

### 1.3 Broker & Owner Workspace Routes

| Route | Component | Supported Behaviour / Journey | Canonical E2E (`J01`–`J16`) | Specialist Browser (`e2e/specialist/`) | Frontend Integration / Unit (`apps/web/src/`) | Backend API / IT (`apps/api/src/test/`) |
|---|---|---|---|---|---|---|
| `/broker/setup` | `BrokerSetup` | Broker registration (`phone` + `acceptedTerms` → `POST /api/broker/setup`), role refresh (`refreshRole`), redirect to `/broker/dashboard`, 400/409 error states | — | — | `pages/__tests__/OnboardingAndBrokerSetup.test.tsx` | `BrokerSetupControllerTest`, `DealerSetupControllerTest` |
| `/broker/listings/new` | `NewListingJourneySelector` | Property family selector (`Residential`, `Commercial`, `Agricultural`) | `J06`, `J07`, `J15` | `issue-1589-broker-PostPropertyCTA-routing.specialist.ts` | `pages/broker/__tests__/NewListingJourneySelector.test.tsx`, `pages/broker/__tests__/NewListingJourneyRouting.test.tsx` | — |
| `/broker/listings/new/residential` | `ResidentialNewListingPage` | Single-page residential create/draft/submit flow (`apartment`, `house`, `villa`, `residential_plot`, `pg_hostel`), map pin picker, photo upload, required-field gating | `J06`: `T13`, `T14`, `T15`, `T15b` | `residential-required-fields-2040.specialist.ts`, `broker-listing-lifecycle-1595.specialist.ts` | `pages/broker/__tests__/ResidentialNewListingPage.test.tsx`, `components/broker/__tests__/ResidentialListingForm.locationFlow2859.test.tsx`, `components/broker/__tests__/ResidentialListingForm.subtypeSubmit2861.test.tsx` | `ListingControllerTest`, `ListingModerationLifecycleIT`, `ListingImageUploadUrlIT` |
| `/broker/listings/new/commercial` | `CommercialNewListingPage` | Commercial create/draft/submit flow across subtypes & Sale/Rent transaction types | `J07`: `CC1`, `CC1b`, `CC1c`, `CC2`, `CC3`, `CC4` | `commercial-rent-2726.specialist.ts`, `commercial-subtype-wrap-2450.specialist.ts` | `pages/broker/__tests__/CommercialNewListingPage.test.tsx`, `components/broker/__tests__/CommercialListingForm.*.test.tsx` | `CityAreaListingsCommercialSubtype2433IT`, `ListingControllerTest` |
| `/broker/listings/new/agricultural` | `AgriculturalNewListingPage` | Agricultural land create/draft/submit flow, polygon boundary drawing (`<=100 km²` validation), soil/water/crop/title specs | `J15`: `AG1`, `AG2`, `AG3` | — | `pages/broker/__tests__/AgriculturalNewListingPage.test.tsx`, `components/listing/agri/__tests__/AgriListingDetail.groupedJourney1412.test.tsx` | `AgriListingBoundaryJourneyIT` (including `>100 km²` `422 BOUNDARY_TOO_LARGE` persistence invariant) |
| `/broker/listings/:id/edit` | `EditListing` | Step-based listing edit (`DescribeStep`, `LocationStep`, `BoundaryStep`, `PhotosStep`, `ReviewStep`), rejected listing edit & resubmit (`REJECTED` → `PENDING_REVIEW`) | `J14`: `T22` | — | `pages/broker/__tests__/EditListing.*.test.tsx` (16 suites), `pages/broker/editListing/**/__tests__/*.test.tsx` | `ListingModerationLifecycleIT`, `ListingControllerTest` |
| `/broker/listings` | `BrokerListings` | Broker listings inventory, status tabs (`LIVE`, `PENDING_REVIEW`, `DRAFT`, `REJECTED`, `OFFLINE`), rejection reason banner, Take Offline / Reopen / Edit actions | `J06`, `J14` | `broker-listing-lifecycle-1595.specialist.ts`, `broker-shell-alignment.specialist.ts` | `pages/broker/__tests__/BrokerListings.bd4.test.tsx`, `components/broker/listings/__tests__/BrokerListingCard.moderation2859.test.tsx` | `ListingControllerTest`, `ListingModerationLifecycleIT` |
| `/broker/dashboard` | `BrokerDashboard` | Broker KPI summary, recent bookings, listing quality prompt, quick actions | — | `broker-shell-alignment.specialist.ts` | `pages/broker/__tests__/BrokerDashboard.pageHttp.test.tsx`, `pages/broker/__tests__/BrokerDashboard.v2.test.tsx` | `DashboardControllerTest`, `BrokerDashboardServiceIT` |
| `/broker/bookings` | `BrokerBookings` | Incoming buyer viewing requests, confirm/decline/reschedule actions | `J10`: `T17b` | `broker-shell-alignment.specialist.ts` | `pages/broker/__tests__/BrokerBookings.test.tsx` | `BookingControllerTest` |
| `/broker/listing-quality` | `ListingQuality` | Listing completeness scores, improvement recommendations, deep link to edit | — | — | `pages/broker/__tests__/ListingQuality.test.tsx`, `__tests__/App.brokerListingQualityRoute.test.tsx` | `ListingQualityControllerTest`, `ListingQualityOwnershipIT` |
| `/broker/preferences` | `Preferences` | Broker market focus areas, specialization preferences, RERA/identity trust progress panel (`TrustProgressPanel`), POI manager (`PoiManager`) | — | `broker-shell-alignment.specialist.ts` | `pages/broker/__tests__/Preferences.addFlow2859.test.tsx`, `pages/broker/__tests__/Preferences.realSelect2859.test.tsx`, `components/trust/__tests__/TrustProgressPanel.identityRealSelect2859.test.tsx`, `components/poi/__tests__/PoiManager.approve2859.test.tsx` | `BrokerMarketFocusControllerTest`, `BrokerMarketFocusIT`, `ListingPoiManagementControllerTest` |
| `/broker/demand-gaps` | `BrokerDemandGaps` | High-demand / low-supply locality gap insights for brokers | — | — | `pages/broker/__tests__/BrokerDemandGaps.pageHttp.test.tsx`, `pages/broker/__tests__/BrokerDemandGaps.test.tsx` | `BrokerDemandGapsControllerTest`, `BrokerDemandGapsServiceTest` |
| `/broker/areas/:citySlug/:areaKey` | `BrokerAreaInsights` | Per-locality supply/demand/pricing insights for brokers | — | — | `pages/broker/__tests__/BrokerAreaInsights.pageHttp.test.tsx`, `pages/broker/__tests__/BrokerAreaInsights.test.tsx` | `BrokerAreaInsightsControllerTest`, `BrokerAreaInsightsIT` |

### 1.4 Admin Workspace Routes

| Route | Component | Supported Behaviour / Journey | Canonical E2E (`J01`–`J16`) | Specialist Browser (`e2e/specialist/`) | Frontend Integration / Unit (`apps/web/src/`) | Backend API / IT (`apps/api/src/test/`) |
|---|---|---|---|---|---|---|
| `/admin/listings/pending` | `PendingListings` | Admin moderation queue, approve (`PENDING_REVIEW` → `LIVE`) and reject with reason (`PENDING_REVIEW` → `REJECTED`), detail drawer inspection | `J06`: `T14`; `J07`: `CC2`; `J15`: `AG2` | `broker-listing-lifecycle-1595.specialist.ts` | `pages/admin/__tests__/PendingListings.moderation2859.test.tsx`, `pages/admin/__tests__/PendingListings.test.tsx` | `AdminListingApprovePilotIT`, `AdminListingPendingQueueIT`, `AdminListingControllerTest` |
| `/admin/listings` | `Listings` | Full admin listings inventory, status/city/type filters, bulk/row moderation actions | — | — | `components/admin/listings/__tests__/AdminListingsInventory2859.test.tsx` | `AdminListingControllerTest` |
| `/admin/trust-review` | `TrustReviewQueue` | Broker identity & RERA verification review queue (`approve` / `reject`) | — | — | `pages/admin/__tests__/TrustReviewQueue.test.tsx`, `components/trust/__tests__/TrustProgressPanel.identity2859.test.tsx` | `AdminTrustControllerIdentityApproveTest`, `AdminTrustControllerTest` |
| `/admin/duplicates` | `SuspectedDuplicates` | Suspected duplicate listing pair review, merge/dismiss actions, non-admin route guard | — | — | `pages/admin/__tests__/Duplicates.2861.test.tsx` | `AdminDuplicateControllerTest`, `AdminDuplicateLifecycleIT` |
| `/admin/intelligence` | `Intelligence` | Admin area intelligence overview, price band refresh & metrics | — | — | `pages/admin/__tests__/AdminIntelligence.2861.test.tsx`, `pages/admin/__tests__/Intelligence.test.tsx` | `AdminIntelligenceControllerTest`, `AdminIntelligenceServiceTest` |
| `/admin/city-launch` & `/admin/city-launch/:cityId/preview/:revisionId` | `CityLaunch`, `CityLaunchPreview` | Admin city launch workflow, hierarchy node overrides, validation, preview map/markers scoping, launch promotion | — | — | `pages/admin/__tests__/CityLaunchPreview.test.tsx`, `pages/admin/__tests__/CityLaunchReadiness.test.tsx`, `pages/admin/__tests__/CityLaunchHierarchy2858.test.tsx`, `features/discover/state/usePreviewCityIdentity.test.tsx` | `AdminCityLaunch*IT` (`Preview`, `Launch`, `Validation`, `NavigationOverride`) |
| `/admin/property-requests` | `PropertyRequests` | Buyer property-request submissions queue (flag-gated via `VITE_PROPERTY_REQUESTS_ENABLED`) | `J12`: `RQ1`, `RQ2` | — | `pages/admin/__tests__/PropertyRequests.test.tsx`, `__tests__/App.propertyRequestsRoute.test.ts` | `PropertyRequest*` tests |
| `/admin/process`, `/admin/groups`, `/admin/feeds`, `/admin/posts`, `/admin/localities`, `/admin/audit-log`, `/admin/extension` | Admin Ops Screens | Social ingestion pipeline (`ProcessPosts`, `FacebookGroups`, `FeedRuns`, `ManualPost`), locality normalizer, audit log, extension setup; `ProtectedRoute requireAdmin` guard | `T1 [role:admin]` | — | `components/layout/__tests__/AppLayout.navRoles2859.test.tsx`, `lib/__tests__/routeAccess.test.ts`, `features/admin/process-posts/**/__tests__/*.test.ts` | `IngestionControllerTest`, `IngestionApiKeySecurityTest`, `AdminGeocodingControllerTest` |

---

## 2. Specialist Browser Suite Inventory (`e2e/specialist/` — 42 Files, 240 Tests)

Every browser-only invariant (Leaflet map canvas rendering, marker/cluster hit-testing, camera fit/restore races, mobile bottom-sheet & control-bar geometry, polygon draw interaction, and local-auth multi-role flows) is protected in `e2e/specialist/`:

1. `e2e/specialist/broker-listing-lifecycle-1595.specialist.ts` (`L36`)
2. `e2e/specialist/broker-shell-alignment.specialist.ts` (`L15`)
3. `e2e/specialist/capture-discover-agri-first-polish-1771.specialist.ts` (`L39`)
4. `e2e/specialist/capture-school-first-polish-1770.specialist.ts` (`L40`)
5. `e2e/specialist/commercial-rent-2726.specialist.ts` (`L28`)
6. `e2e/specialist/commercial-subtype-wrap-2450.specialist.ts` (`L31`)
7. `e2e/specialist/discover-1738-regression.specialist.ts` (`L37`)
8. `e2e/specialist/discover-1942-pin-price-band.specialist.ts` (`L41`)
9. `e2e/specialist/discover-2049-resize-marker-skew.specialist.ts` (`L42`)
10. `e2e/specialist/discover-2717-school-filters-touch-target.specialist.ts` (`L43`)
11. `e2e/specialist/discover-agri-price-gate-1551.specialist.ts` (`L48`)
12. `e2e/specialist/discover-area-groups-landing.specialist.ts` (`L54`)
13. `e2e/specialist/discover-batch-c-url-filters-and-gating.specialist.ts` (`L70`)
14. `e2e/specialist/discover-filter-draft-vs-applied-2626.specialist.ts` (`L71`)
15. `e2e/specialist/discover-map-info-dock-2748.specialist.ts` (`L73`)
16. `e2e/specialist/discover-mobile-map-badge-zoom-2716.specialist.ts` (`L74`)
17. `e2e/specialist/discover-mobile-map-filters-2712.specialist.ts` (`L75`)
18. `e2e/specialist/discover-results-reskin-2729.specialist.ts` (`L78`)
19. `e2e/specialist/discover-schools-canonical-2124.specialist.ts` (`L90`)
20. `e2e/specialist/discover-schools-mobile-cluster-2124.specialist.ts` (`L91`)
21. `e2e/specialist/discover-viewport-truncation.specialist.ts` (`L98`)
22. `e2e/specialist/discover-control-bar-mobile-reachability-1953.specialist.ts` (`L104`)
23. `e2e/specialist/discover-desktop-control-bar-shell-1953.specialist.ts` (`L105`)
24. `e2e/specialist/discover-issue-1823-camera-fit-policy.specialist.ts` (`L107`)
25. `e2e/specialist/discover-issue-1823-reentry-and-cluster-fit.specialist.ts` (`L108`)
26. `e2e/specialist/discover-issue-1956-pr3-direction-markers.specialist.ts` (`L117`)
27. `e2e/specialist/discover-issue-1956-pr4-listing-peek-camera-restore.specialist.ts` (`L118`)
28. `e2e/specialist/discover-issue-1956-pr4-mobile-listings-scroll.specialist.ts` (`L119`)
29. `e2e/specialist/discover-issue-1956-pr5-desktop-breadcrumb-regression.specialist.ts` (`L121`)
30. `e2e/specialist/discover-issue-1956-pr5-mobile-landmarks.specialist.ts` (`L122`)
31. `e2e/specialist/discover-issue-1956-pr5-s5-mobile-listing-preview.specialist.ts` (`L124`)
32. `e2e/specialist/discover-issue-2083-home-breadcrumb-back-camera-race.specialist.ts` (`L131`)
33. `e2e/specialist/discover-issue-2089-breadcrumb-list-flex-layout.specialist.ts` (`L134`)
34. `e2e/specialist/discover-issue-2089-filter-list-map-parity.specialist.ts` (`L135`)
35. `e2e/specialist/discover-issue-2089-marker-swap-fixture.specialist.ts` (`L136`)
36. `e2e/specialist/discover-issue-2089-pan-preserves-listing-preview.specialist.ts` (`L137`)
37. `e2e/specialist/discover-issue-2129-mobile-marker-occlusion.specialist.ts` (`L138`)
38. `e2e/specialist/discover-issue-2149-mobile-school-first-marker-preview.specialist.ts` (`L141`)
39. `e2e/specialist/discover-issue-2305-cluster-marker-skin.specialist.ts` (`L147`)
40. `e2e/specialist/discover-issue-2330-marker-reskin-visual.specialist.ts` (`L148`)
41. `e2e/specialist/discover-issue-2419-draw-invalid-polygon-toast.specialist.ts` (`L149`)
42. `e2e/specialist/discover-issue-2715-school-pin-vs-empty-pill.specialist.ts` (`L156`)
43. `e2e/specialist/discover-issue-2770-compact-school-context.specialist.ts` (`L157`)
44. `e2e/specialist/discover-mobile-filter-sheet-1953.specialist.ts` (`L158`)
45. `e2e/specialist/discover-mobile-list-map-shell-1953.specialist.ts` (`L160`)
46. `e2e/specialist/issue-1589-broker-PostPropertyCTA-routing.specialist.ts` (`L175`)
47. `e2e/specialist/issue-2016-result-scope-contract.specialist.ts` (`L178`)
48. `e2e/specialist/issue-2413-draw-polygon-area-filter.specialist.ts` (`L179`)
49. `e2e/specialist/issue-2426-search-this-area-cta-placement.specialist.ts` (`L182`)
50. `e2e/specialist/issue-2460-polygon-filter-composition.specialist.ts` (`L184`)
51. `e2e/specialist/residential-required-fields-2040.specialist.ts` (`L208`)
52. `e2e/specialist/school-first-back-nav.specialist.ts` (`L211`)

*(Note: 10 specs were admitted in S0/Wave 1 earlier, plus 11 in Wave 1 `#2904`, 9 in Wave 2 `#2905`, 5 in `#2856` `#2906`, 9 in Wave 3 `#2907`, and 8 in Wave 4 `#2908` = **42** `.specialist.ts` files total.)*

---

## 3. Consolidated Deletion Inventory — All 96 Remaining Legacy `e2e/**/*.spec.ts` Files

Every single one of the **96** remaining legacy `e2e/**/*.spec.ts` files (after moving `L70`, `L107`, `L108`, `L122`, `L135`, `L136`, `L158`, `L184` into `e2e/specialist/` in PR #2908) has verified replacement coverage on `main` across Canonical E2E, Specialist Browser E2E, Frontend Vitest, and Backend Maven/Testcontainers:

### Batch A — School-First & Agricultural Lower-Level Replacements (`#2857` / `#2890` — 9 files)
1. `e2e/broker-agri-listing.spec.ts` (`L12`) → Canonical `AG1`–`AG3` + `AgriListingBoundaryJourneyIT.java` (`#2894`)
2. `e2e/discover-agri-grouped-journey-1412.spec.ts` (`L44`) → `AgriListingDetail.groupedJourney1412.test.tsx` + `useRegionalAreaGroups.test.ts` (`#2895`)
3. `e2e/discover-agri-journey-1375.spec.ts` (`L45`) → Canonical `T8`/`T9` + `MapDiscovery.agriOverlayPeek2857.test.tsx` (`#2894`)
4. `e2e/discover-agri-overlay-peek-journey-1431.spec.ts` (`L47`) → `MapDiscovery.agriOverlayPeek2857.test.tsx` (`#2894`)
5. `e2e/discover-school-first-journey.spec.ts` (`L84`) → Canonical `T7`/`T7b` + `AreaMarkerLayer.schoolBadge2857.test.tsx` (`#2894`)
6. `e2e/discover-school-journey.spec.ts` (`L87`) → Canonical `T7` + `MapDiscovery.schoolJourney2857.test.tsx` (`#2894`)
7. `e2e/discover-school-selected.spec.ts` (`L89`) → Canonical `T7` + `MapDiscovery.schoolJourney2857.test.tsx` (`#2894`)
8. `e2e/discover/school-badge-suppression.spec.ts` (`L164`) → `useDiscoverBadgeController.issue2190.test.ts` (`#2894`)
9. `e2e/verify-agri-clusters-1372.spec.ts` (`L217`) → `useDiscoverMapDataController.areaFirstMarkers2857.test.ts` (`#2894`)

### Batch B — Discover Hierarchy, Preview, Request-Card & Error-State Lower-Level Replacements (`#2858` — 10 files)
10. `e2e/discover/area-drilldown-stale-viewport-1821.spec.ts` (`L102`) → `useDiscoverJourneySwitch.bareUrl2858.test.ts` (`#2897`)
11. `e2e/discover/issue-1956-pr3-area-clustering.spec.ts` (`L116`) → `MapDiscovery.areaClusteringBack2858.test.tsx` + `NavigationControllerTest.java` (`#2897`)
12. `e2e/discover/issue-2204-canonical-node-browser-proof.spec.ts` (`L143`) → `useDiscoverMapDataController.zoomBand2858.test.ts` (`#2897`)
13. `e2e/discover/issue-2205-admin-preview-node-scoping-browser-proof.spec.ts` (`L144`) → `usePreviewCityIdentity.test.tsx` (`#2897`)
14. `e2e/discover/issue-2207-admin-hierarchy-node-selection.spec.ts` (`L146`) → `CityLaunchHierarchy2858.test.tsx` + `AdminCityLaunchNavigationOverrideControllerTest.java` (`#2897`)
15. `e2e/discover/issue-2711-map-filter-intent-commit.spec.ts` (`L155`) → `MapFilterSheet.intentCommit2858.test.tsx` (`#2897`)
16. `e2e/discover/property-request-card-legacy-and-browse-all-2795.spec.ts` (`L162`) → `ListingsBody.requestCard2858.test.tsx` (`#2897`)
17. `e2e/discover/property-request-card.spec.ts` (`L163`) → Canonical `RQ1`/`RQ2` + `ListingsBody.requestCard2858.test.tsx` (`#2897`)
18. `e2e/discover/sr024-error-vs-empty.spec.ts` (`L171`) → `AreaLeafListingsSurface.sr024ErrorVsEmpty2858.test.tsx` (`#2897`)
19. `e2e/discover/thanisandra-hennur-belt-marker-degradation.spec.ts` (`L173`) → `AreaMarkerLayer.beltDegradation2858.test.tsx` (`#2897`)

### Batch C — Discover Controllers, Moderation, Lifecycle, Trends, POI & Broker Forms (`#2859` B1–B7 — 46 files)
20. `e2e/area-intelligence-1528.spec.ts` (`L7`) → `useAreaIntelligence.2859.test.tsx` + `Trends.areaIntelligenceWire2859.test.tsx` (`#2900`)
21. `e2e/broker-address-reconciliation.spec.ts` (`L11`) → `ResidentialListingForm.locationFlow2859.test.tsx` (`#2899`)
22. `e2e/broker-listing-form.spec.ts` (`L16`) → Canonical `T13`/`T22` + `ResidentialListingForm.locationFlow2859.test.tsx` (`#2899`)
23. `e2e/broker-preferences.spec.ts` (`L18`) → `Preferences.addFlow2859.test.tsx` + `Preferences.realSelect2859.test.tsx` (`#2898`)
24. `e2e/buyer-area-route-1539.spec.ts` (`L20`) → `App.trendsAreaRoute2859.test.tsx` + `TrendsAreaResolved.test.tsx` (`#2900`)
25. `e2e/commercial-create-listing-1684.spec.ts` (`L33`) → Canonical `CC1`–`CC4` + `CommercialListingForm.locationFlow2859.test.tsx` (`#2899`)
26. `e2e/commercial-subtype-implied-type-hotfix.spec.ts` (`L35`) → Canonical `CC1b`/`CC1c` + `CommercialListingForm.subtypeImplied2859.test.tsx` (`#2899`)
27. `e2e/discover-1939-listing-peek-url-restore.spec.ts` (`L38`) → `MapDiscovery.listingPeekRestore2859.test.tsx` (`#2903`)
28. `e2e/discover-2193-node-invariant.spec.ts` (`L41`) → `MapDiscovery.nodeInvariant2859.test.tsx` (`#2903`)
29. `e2e/discover-anon-price-consistency-1941.spec.ts` (`L50`) → `ListingDetail.sessionSwitch2859.test.tsx` + `CityAreaListingsPriceProjection2859IT.java` (`#2902`)
30. `e2e/discover-area-first-drilldown-1483.spec.ts` (`L53`) → `MapDiscovery.startOverUrl2859.test.tsx` (`#2903`)
31. `e2e/discover-area-keyword-search.spec.ts` (`L55`) → `discoverBadge.searchQuery2859.test.ts` (`#2901`)
32. `e2e/discover-badge.spec.ts` (`L59`) → `MapDiscovery.issue1152.test.tsx` (`#2901`)
33. `e2e/discover-bounded-listing-2087.spec.ts` (`L61`) → `MapDiscovery.nodeListingsBack2859.test.tsx` (`#2903`)
34. `e2e/discover-city-listings-empty-city-guard-2189.spec.ts` (`L62`) → `MapDiscovery.cityListingsRequest2859.test.tsx` (`#2903`)
35. `e2e/discover-city-switch.spec.ts` (`L63`) → `DiscoverControlBar.kundapur2859.test.tsx` (`#2903`)
36. `e2e/discover-cluster-focus-back.spec.ts` (`L64`) → `MapDiscovery.clusterFocusRelay2859.test.tsx` (`#2903`)
37. `e2e/discover-commercial-card-summary.spec.ts` (`L65`) → `useDiscoverListings.issue2016.test.ts` + `discoverMappers.test.ts` (`#2901`)
38. `e2e/discover-filter-chips.spec.ts` (`L68`) → `useDiscoverPageState.chipDismiss2859.test.tsx` (`#2901`)
39. `e2e/discover-group-results-1597.spec.ts` (`L69`) → `MapDiscovery.groupResultsCold2859.test.tsx` (`#2903`)
40. `e2e/discover-map-hierarchy.spec.ts` (`L72`) → `MapDiscovery.mapHierarchy2859.test.tsx` (`#2903`)
41. `e2e/discover-telemetry-consent-1531.spec.ts` (`L92`) → `DiscoverRightPanel.agriLocality2859.test.tsx` (`#2902`)
42. `e2e/discover-telemetry-consent-1576.spec.ts` (`L93`) → `DiscoverOverlaySurface.consentEmit2859.test.tsx` (`#2902`)
43. `e2e/discover-trust-badge-1567.spec.ts` (`L95`) → `useDiscoverMapDataController.legacyAreaTrust2859.test.ts` (`#2902`)
44. `e2e/discover-url-state.spec.ts` (`L97`) → `MapDiscovery.areaKeyColdLoad2859.test.tsx` (`#2903`)
45. `e2e/discover-viewport.spec.ts` (`L99`) → `useDiscoverPageState.chipDismiss2859.test.tsx` (`#2901`)
46. `e2e/discover/issue-1956-pr4-price-auth-contract.spec.ts` (`L120`) → `useDiscoverMapDataController.areaKeysPurpose2859.test.ts` + `CityAreaListingsPriceProjection2859IT.java` (`#2902`)
47. `e2e/homepage-listing-journey.spec.ts` (`L176`) → `LandingPage.navigation2859.test.tsx` + `ListingGallery.anonLock2859.test.tsx` (`#2900`)
48. `e2e/issue-2015-search-this-area-viewport.spec.ts` (`L178`) → `MapDiscovery.searchThisAreaRelay2859.test.tsx` (`#2903`)
49. `e2e/issue-2017-multi-area-areaset-commit-regression.spec.ts` (`L180`) → `AreaSetDraftPanel.realCommit2859.test.tsx` (`#2903`)
50. `e2e/issue-2454-scope-aware-relaxation-previews.spec.ts` (`L183`) → `useRelaxationPreviews.test.tsx` + `AreaZeroResultRecovery.test.tsx` (`#2901`)
51. `e2e/journey/admin-listings-inventory-2370.spec.ts` (`L189`) → `AdminListingsInventory2859.test.tsx` (`#2898`)
52. `e2e/journey/admin-moderation.spec.ts` (`L190`) → `PendingListings.moderation2859.test.tsx` (`#2898`)
53. `e2e/journey/area-trends-2581.spec.ts` (`L192`) → `AreaGuide.test.tsx` + `Trends.areaIntelligenceWire2859.test.tsx` (`#2900`)
54. `e2e/journey/listing-lifecycle.spec.ts` (`L195`) → Canonical `T13`–`T15b` + `ListingDetail.previewLifecycle2859.test.tsx` (`#2898`)
55. `e2e/journey/pending-approvals-review-2369.spec.ts` (`L196`) → `PendingListings.moderation2859.test.tsx` (`#2898`)
56. `e2e/journey/trust-identity-review.spec.ts` (`L197`) → `TrustProgressPanel.identityRealSelect2859.test.tsx` (`#2898`)
57. `e2e/listing-rejection-resubmit.spec.ts` (`L199`) → `ListingModerationLifecycleIT.java` + `BrokerListingCard.moderation2859.test.tsx` (`#2898`)
58. `e2e/map-filters.spec.ts` (`L202`) → `Trends.noErrorGuide2859.test.tsx` (`#2901`)
59. `e2e/nav-roles.spec.ts` (`L203`) → `AppLayout.navRoles2859.test.tsx` (`#2898`)
60. `e2e/poi-display.spec.ts` (`L204`) → `NearbyPois2859.test.tsx` + `PoiManager.approve2859.test.tsx` (`#2900`)
61. `e2e/poi-locality-teaser.spec.ts` (`L205`) → `PoiManager.approve2859.test.tsx` + `ReviewStep.locality2859.test.tsx` (`#2900`)
62. `e2e/regression-1240-marker-lat-lon.spec.ts` (`L209`) → `useDiscoverMapDataController.pins2859.test.ts` (`#2902`)
63. `e2e/residential-create-listing-1722.spec.ts` (`L210`) → `ResidentialListingForm.locationFlow2859.test.tsx` (`#2899`)
64. `e2e/trends.spec.ts` (`L215`) → `Trends.exhaustiveDeps.test.tsx` (`#2900`)
65. `e2e/user-journeys.spec.ts` (`L216`) → `SavedAreas2859.test.tsx` + `MyBookings.test.tsx` (`#2900`)

### Batch D — Canonical Extensions & Deletion-Gate Specs (`#2860` / `#2861` — 13 files, items 66–78)
66. `e2e/discover-agri-direction-first-1448.spec.ts` (`L43`) → `MapDiscovery.agriDirectionFirst1448.test.tsx` (`#2896`)
67. `e2e/discover-agri-locality-marker-1468.spec.ts` (`L46`) → Canonical `T8b`, `T9`, `T8c`, `T18` (`#2873` / `#2896`)
68. `e2e/discover/issue-1956-pr6-no-blank-panel.spec.ts` (`L129`) → Canonical `T10b` (`#2873` / `#2896`)
69. `e2e/discover/issue-2205-schoolfirst-groupid-clear-browser-proof.spec.ts` (`L145`) → Canonical `T7b` (`#2873` / `#2896`)
70. `e2e/issue-1065-final.spec.ts` (`L177`) → Canonical `T25` + `T10b` (`#2873` / `#2896`)
71. `e2e/admin-intelligence-smoke.spec.ts` (`L4`) → `AdminIntelligence.2861.test.tsx` (`#2896`)
72. `e2e/area-overview.spec.ts` (`L8`) → Obsolete standalone `/areas/:slug` route (superseded by `/trends/:citySlug/areas/:areaSlug` covered by `TrendsAreaResolved.test.tsx`)
73. `e2e/auth-journey-1509.spec.ts` (`L9`) → Canonical `T1c`, `T2`, `T2b` (`#2873` / `#2896`)
74. `e2e/discover-opensearch-parity.spec.ts` (`L75`) → Obsolete OpenSearch parity probe (search backed by PostGIS `CityAreaListingsController` / `DiscoverListingsController`)
75. `e2e/discover-to-trends.spec.ts` (`L94`) → `PropertyMap.discoverToTrends2861.test.tsx` + `AreaLeafListingsSurface.test.tsx` (`#2896`)
76. `e2e/journey/admin-duplicates.spec.ts` (`L188`) → `Duplicates.2861.test.tsx` (`#2896`)
77. `e2e/journey/booking-journey.spec.ts` (`L193`) → Canonical `T16`, `T17`, `T17b` + `BookingDuplicateActiveIndex2844IT.java` (`#2879` / `#2896`)
78. `e2e/journey/broker-listing-creation.spec.ts` (`L194`) → Canonical `T13`–`T15b` + `ResidentialListingForm.subtypeSubmit2861.test.tsx` (`#2896`)

### Batch E — Superseded / Baseline-Red Pre-`#1956` / Pre-`#2715` Specs (`#2826` / `#2855` / `#2856` — 18 files, items 79–96)
79. `e2e/discover-area-cards.spec.ts` (`L52`) → Superseded pre-`#1956` testids; covered by `discover-1738-regression.specialist.ts` + `useDiscoverNavigationController.test.ts`
80. `e2e/discover-area-nav-journey.spec.ts` (`L56`) → Superseded `window.__discoverMap` hook; covered by `discover-issue-1823-camera-fit-policy.specialist.ts` + `discover-issue-2083-home-breadcrumb-back-camera-race.specialist.ts`
81. `e2e/discover-area-reskin-mobile-2159.spec.ts` (`L57`) → Superseded legacy `?areaKey=` mobile layout; covered by `discover-mobile-list-map-shell-1953.specialist.ts` + `AreaLeafListingsSurface.test.tsx`
82. `e2e/discover-area-selected-filters.spec.ts` (`L58`) → Covered by Canonical `T5`/`T6`/`T23` + `discover-batch-c-url-filters-and-gating.specialist.ts` + `AreaLeafListingsSurface.test.tsx`
83. `e2e/discover-batch-b-journeys.spec.ts` (`L60`) → Superseded pre-`#1956` testids; covered by `discover-batch-c-url-filters-and-gating.specialist.ts` + `discover-1738-regression.specialist.ts`
84. `e2e/discover-correctness-1064.spec.ts` (`L66`) → `#2751` baseline-red obsolete pre-`#1956` spec; covered by Canonical `T4`–`T7` + `MapDiscovery.startOverUrl2859.test.tsx`
85. `e2e/discover-correctness-1067.spec.ts` (`L67`) → `#2751` baseline-red obsolete spec; covered by Canonical `T7` + `MapDiscovery.schoolJourney2857.test.tsx` + `discover-1738-regression.specialist.ts`
86. `e2e/discover-results-redesign-1547.spec.ts` (`L77`) → Superseded `discover-results-drawer`; covered by `AreaLeafListingsSurface.test.tsx`
87. `e2e/discover/active-context-chips-and-badge.spec.ts` (`L100`) → `#2751` baseline-red; covered by `useDiscoverPageState.chipDismiss2859.test.tsx`, `useDiscoverBadgeController.issue2190.test.ts`, and `discover-map-info-dock-2748.specialist.ts`
88. `e2e/discover/discover-mobile-guard.spec.ts` (`L106`) → `#2751` baseline-red (`discover-panel-drawer` removed in `#1953`); covered by `discover-mobile-list-map-shell-1953.specialist.ts` + `discover-control-bar-mobile-reachability-1953.specialist.ts`
89. `e2e/discover/issue-1956-areas-adaptive-journeys.spec.ts` (`L109`) → `#2751` baseline-red; covered by Canonical `T4`–`T6`/`T23`/`T24` + `MapDiscovery.mapHierarchy2859.test.tsx` + `discover-issue-2089-filter-list-map-parity.specialist.ts`
90. `e2e/discover/issue-1956-pr2-breadcrumb.spec.ts` (`L111`) → `#2751` baseline-red (`d:coastal` removed); covered by `discover-issue-1956-pr5-desktop-breadcrumb-regression.specialist.ts` + `discover-issue-2089-breadcrumb-list-flex-layout.specialist.ts`
91. `e2e/discover/issue-1956-pr5-mobile-list-first.spec.ts` (`L123`) → `#2751` baseline-red (`d:coastal` removed); covered by `discover-mobile-list-map-shell-1953.specialist.ts` + `discover-issue-1956-pr4-mobile-listings-scroll.specialist.ts`
92. `e2e/discover/issue-2083-camera-back-determinism.spec.ts` (`L130`) → `#2751` baseline-red; covered by `discover-issue-2083-home-breadcrumb-back-camera-race.specialist.ts` + `discover-issue-1823-camera-fit-policy.specialist.ts`
93. `e2e/discover/mobile-landing-journey-switcher-1953.spec.ts` (`L159`) → `#2751` baseline-red pre-`#2715` switcher; covered by `discover-control-bar-mobile-reachability-1953.specialist.ts`
94. `e2e/discover/thanisandra-hennur-belt-label-collision-1815.spec.ts` (`L172`) → Superseded `window.__discoverMap` hook; covered by `AreaMarkerLayer.beltDegradation2858.test.tsx`
95. `e2e/issue-2419-mobile-invalid-polygon.spec.ts` (`L181`) → `#2751` baseline-red; covered by `discover-issue-2419-draw-invalid-polygon-toast.specialist.ts`
96. `e2e/issue-2461-polygon-panel-parity.spec.ts` (`L185`) → `#2751` baseline-red; covered by `issue-2413-draw-polygon-area-filter.specialist.ts` + `issue-2460-polygon-filter-composition.specialist.ts`

### Batch F — Unused Legacy Fixture & Directory Artefacts (4 files)
- `e2e/fixtures/agri-boundary.json` (0 references outside retired legacy specs)
- `e2e/fixtures/regions-summary.json` (0 references outside retired legacy specs)
- `e2e/fixtures/test-image.jpg` (0 references outside retired legacy specs)
- `e2e/integration-ui/.gitkeep` (empty legacy directory placeholder)
