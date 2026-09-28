/**
 * PhotosStep — Issue #1838 slice 6a characterisation tests.
 *
 * PhotosStep is a STATELESS presentational component extracted from
 * EditListingForm.tsx's step-2 ("Add Photos") render block. It owns no
 * state; all values/setters/handlers arrive as props.
 *
 * CRITICAL (repo lesson, commit e79526df / #1837): ImageUploader is mocked
 * to a lightweight stub — an unstable heavy-child mock previously caused a
 * 4GB/10min OOM in this test suite.
 */
import React, { useEffect } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PhotosStep } from '../PhotosStep';
import type { PhotosStepProps } from '../stepContracts';

const mountCount = vi.hoisted(() => ({ current: 0 }));

vi.mock('@/components/broker/ImageUploader', () => ({
  // onCanSubmitChange is accepted (matches the real component's prop surface)
  // but not exercised here — PhotosStep's own "Save & Continue" gate tests
  // below cover canSubmitImages behaviour.
  ImageUploader: () => {
    useEffect(() => {
      mountCount.current += 1;
      // Intentionally mount-only (empty deps): a genuine remount (unmount+mount from
      // a `currentStep === 2 &&` conditional wrapper) is what this test guards
      // against, not prop-identity churn from unrelated parent re-renders.
    }, []);
    return <div data-testid="image-uploader-stub" />;
  },
}));

function baseProps(overrides: {
  view?: Partial<PhotosStepProps['view']>;
  commands?: Partial<PhotosStepProps['commands']>;
} = {}): PhotosStepProps {
  return {
    view: {
      id: 'listing-1',
      isSubmittable: true,
      videoUrl: '',
      videoUrlError: '',
      canSubmitImages: false,
      ...overrides.view,
    },
    commands: {
      changeVideoUrl: vi.fn(),
      continue: vi.fn(),
      reportImageReadiness: vi.fn(),
      ...overrides.commands,
    },
  };
}

describe('PhotosStep', () => {
  it('renders ImageUploader and disables continue while canSubmitImages is false', () => {
    render(<PhotosStep {...baseProps()} />);
    expect(screen.getByTestId('image-uploader-stub')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /save & continue/i })).toBeDisabled();
    expect(screen.getByText(/add at least 3 photos to continue/i)).toBeInTheDocument();
  });

  it('enables continue and calls commands.continue when canSubmitImages is true', async () => {
    const user = userEvent.setup();
    const handleStep2Continue = vi.fn();
    render(<PhotosStep {...baseProps({ view: { canSubmitImages: true }, commands: { continue: handleStep2Continue } })} />);

    const continueBtn = screen.getByRole('button', { name: /save & continue/i });
    expect(continueBtn).toBeEnabled();
    await user.click(continueBtn);
    expect(handleStep2Continue).toHaveBeenCalledOnce();
  });

  it('shows the YouTube thumbnail preview for a valid YouTube video URL', () => {
    render(
      <PhotosStep
        {...baseProps({ view: { videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' } })}
      />,
    );
    expect(screen.getByAltText('Video thumbnail')).toBeInTheDocument();
  });

  it('shows the video URL validation error when present', () => {
    render(
      <PhotosStep
        {...baseProps({ view: { videoUrl: 'not-a-url', videoUrlError: 'Enter a valid video URL' } })}
      />,
    );
    expect(screen.getByText('Enter a valid video URL')).toBeInTheDocument();
  });

  it('renders nothing when isSubmittable is false', () => {
    render(<PhotosStep {...baseProps({ view: { isSubmittable: false } })} />);
    expect(screen.queryByTestId('image-uploader-stub')).not.toBeInTheDocument();
  });

  it('does NOT remount ImageUploader when the parent re-renders with a different prop (step-switch simulation)', () => {
    mountCount.current = 0;
    const { rerender } = render(<PhotosStep {...baseProps({ view: { videoUrl: 'a' } })} />);
    expect(mountCount.current).toBe(1);

    // Simulate the parent re-rendering PhotosStep with a changed prop (e.g. as the
    // broker types in an unrelated field, or another step's state changes) — the
    // always-mounted display:none wrapper in the parent must keep PhotosStep (and
    // therefore ImageUploader) mounted across these re-renders, never remounting it.
    rerender(<PhotosStep {...baseProps({ view: { videoUrl: 'ab' } })} />);
    rerender(<PhotosStep {...baseProps({ view: { videoUrl: 'abc', canSubmitImages: true } })} />);

    expect(mountCount.current).toBe(1);
    expect(screen.getByTestId('image-uploader-stub')).toBeInTheDocument();
  });
});
