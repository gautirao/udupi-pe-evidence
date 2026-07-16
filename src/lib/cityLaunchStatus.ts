/**
 * Issue #1911 PR2 — status → presentation mapping for the admin City Launch
 * "Select City" screen (ui_kits/admin/SelectCityScreen.jsx is the approved
 * visual reference; RTA_STATUS / actionFor there is the source of the
 * label/tone/action vocabulary mirrored here for the real React page).
 *
 * Backend status vocabulary (CityLaunchStatusDto.status): not-started |
 * preparing | ready-preview | ready-launch | failed (+ defensively: live).
 * Only "not-started" (Prepare) and "failed" (Rerun) trigger a real mutation
 * in this slice — ready-preview/ready-launch are inert placeholders until
 * PR3/PR5 land the preview and launch screens.
 */

export type CityLaunchStatus =
  | 'not-started'
  | 'preparing'
  | 'ready-preview'
  | 'ready-launch'
  | 'failed'
  | 'live';

export interface CityLaunchStatusConfig {
  /** Human label for the status badge. */
  label: string;
  /** Tailwind classes for the status badge. */
  badgeClassName: string;
  /** Label for the row's context action button. */
  actionLabel: string;
  /** Whether the action button is clickable in this slice. */
  actionEnabled: boolean;
  /** Tooltip/title shown when the action is disabled (or as extra context). */
  actionTooltip?: string;
}

const CITY_LAUNCH_STATUS_CONFIG: Record<CityLaunchStatus, CityLaunchStatusConfig> = {
  'not-started': {
    label: 'Not started',
    badgeClassName: 'bg-muted text-muted-foreground',
    actionLabel: 'Prepare city',
    actionEnabled: true,
  },
  preparing: {
    label: 'Preparing',
    badgeClassName: 'bg-blue-100 text-blue-800',
    actionLabel: 'View progress',
    actionEnabled: true,
  },
  'ready-preview': {
    label: 'Ready for preview',
    badgeClassName: 'bg-teal-100 text-teal-800',
    actionLabel: 'Continue',
    actionEnabled: false,
    actionTooltip: 'Available in PR3',
  },
  'ready-launch': {
    label: 'Ready to launch',
    badgeClassName: 'bg-green-100 text-green-800',
    actionLabel: 'Review & launch',
    actionEnabled: false,
    actionTooltip: 'Available in PR5',
  },
  failed: {
    label: 'Failed',
    badgeClassName: 'bg-red-100 text-red-800',
    actionLabel: 'See failure',
    actionEnabled: true,
  },
  live: {
    label: 'Live',
    badgeClassName: 'bg-green-100 text-green-800 border border-green-300',
    actionLabel: 'Manage from Dashboard',
    actionEnabled: false,
    actionTooltip: 'Live cities are managed from Dashboard',
  },
};

const FALLBACK_STATUS_CONFIG: CityLaunchStatusConfig = {
  label: 'Unknown',
  badgeClassName: 'bg-muted text-muted-foreground',
  actionLabel: 'Open',
  actionEnabled: false,
};

function isKnownCityLaunchStatus(status: string): status is CityLaunchStatus {
  return Object.prototype.hasOwnProperty.call(CITY_LAUNCH_STATUS_CONFIG, status);
}

/** Look up the badge/action config for a raw status string from the API. */
export function getCityLaunchStatusConfig(status: string): CityLaunchStatusConfig {
  if (isKnownCityLaunchStatus(status)) {
    return CITY_LAUNCH_STATUS_CONFIG[status];
  }
  return FALLBACK_STATUS_CONFIG;
}

/** States a prepare run is actively progressing through (used for polling). */
export const ACTIVE_PREP_STATES = new Set(['RUNNING', 'PENDING']);

/** States a prepare run has finished in (polling should stop). */
export function isTerminalPrepState(prepState: string | null | undefined): boolean {
  return prepState === 'DONE' || prepState === 'FAILED';
}
