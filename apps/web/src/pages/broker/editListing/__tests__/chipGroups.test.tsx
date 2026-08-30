import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SingleChipGroup, MultiChipGroup, BHK_CHIP_OPTIONS } from '../chipGroups';

describe('SingleChipGroup', () => {
  it('renders all options', () => {
    render(
      <SingleChipGroup
        id="bhk"
        label="Bedrooms (BHK)"
        options={BHK_CHIP_OPTIONS}
        value="2"
        onValueChange={vi.fn()}
      />,
    );

    for (const opt of BHK_CHIP_OPTIONS) {
      expect(screen.getByRole('radio', { name: opt.label })).toBeInTheDocument();
    }
  });

  it('wrapper has data-testid={`chip-group-${id}`}', () => {
    render(
      <SingleChipGroup
        id="bhk"
        label="Bedrooms (BHK)"
        options={BHK_CHIP_OPTIONS}
        value="2"
        onValueChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('chip-group-bhk')).toBeInTheDocument();
  });

  it('Label has id=`${id}-label`, and ToggleGroup has matching aria-labelledby', () => {
    render(
      <SingleChipGroup
        id="bhk"
        label="Bedrooms (BHK)"
        options={BHK_CHIP_OPTIONS}
        value="2"
        onValueChange={vi.fn()}
      />,
    );

    const label = screen.getByText('Bedrooms (BHK)');
    expect(label.id).toBe('bhk-label');

    const toggleGroup = screen.getByRole('group', { name: 'Bedrooms (BHK)' });
    expect(toggleGroup).toHaveAttribute('aria-labelledby', 'bhk-label');
  });

  it('fires onValueChange with the chosen value on selecting an option', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <SingleChipGroup
        id="bhk"
        label="Bedrooms (BHK)"
        options={BHK_CHIP_OPTIONS}
        value="2"
        onValueChange={onValueChange}
      />,
    );

    await user.click(screen.getByRole('radio', { name: '3' }));
    expect(onValueChange).toHaveBeenCalledWith('3');
  });

  it('collapse guard — re-clicking the already-selected option does not fire onValueChange with an empty value', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <SingleChipGroup
        id="bhk"
        label="Bedrooms (BHK)"
        options={BHK_CHIP_OPTIONS}
        value="2"
        onValueChange={onValueChange}
      />,
    );

    await user.click(screen.getByRole('radio', { name: '2' }));
    expect(onValueChange).not.toHaveBeenCalledWith('');
    expect(onValueChange).not.toHaveBeenCalled();
  });
});

describe('MultiChipGroup', () => {
  it('renders all options', () => {
    render(
      <MultiChipGroup
        label="Amenities"
        options={BHK_CHIP_OPTIONS}
        value={[]}
        onValueChange={vi.fn()}
      />,
    );

    for (const opt of BHK_CHIP_OPTIONS) {
      expect(screen.getByRole('button', { name: opt.label })).toBeInTheDocument();
    }
  });

  it('when testId provided, wrapper has data-testid={testId}', () => {
    render(
      <MultiChipGroup
        label="Amenities"
        options={BHK_CHIP_OPTIONS}
        value={[]}
        onValueChange={vi.fn()}
        testId="chip-group-amenities"
      />,
    );

    expect(screen.getByTestId('chip-group-amenities')).toBeInTheDocument();
  });

  it('emits the final desired set on selection', async () => {
    const user = userEvent.setup();
    const onValueChange = vi.fn();
    render(
      <MultiChipGroup
        label="Amenities"
        options={BHK_CHIP_OPTIONS}
        value={['1']}
        onValueChange={onValueChange}
        testId="chip-group-amenities"
      />,
    );

    await user.click(screen.getByRole('button', { name: '2' }));
    expect(onValueChange).toHaveBeenCalledWith(['1', '2']);
  });
});
