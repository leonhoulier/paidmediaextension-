import { EntityLevel, Platform } from '@media-buying-governance/shared';
import { buildExtractionSnapshot, formatSnapshotValue } from '../extraction-snapshot.js';

describe('buildExtractionSnapshot()', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('should separate Meta selector gaps from getter gaps', () => {
    document.body.innerHTML = `
      <input aria-label="Campaign name" value="Meta Spring Campaign" />
      <div role="radiogroup">
        <div aria-checked="true">Traffic</div>
      </div>
    `;

    const snapshot = buildExtractionSnapshot(Platform.META, {
      'campaign.name': 'Meta Spring Campaign',
      'campaign.objective': null,
      'custom.state_only_field': 'from require',
    });

    const fields = new Map(snapshot.fields.map((field) => [field.fieldPath, field]));

    expect(fields.get('campaign.name')).toMatchObject({
      hasValue: true,
      selectorConfigured: true,
      selectorFound: true,
      valuePreview: 'Meta Spring Campaign',
    });

    expect(fields.get('campaign.objective')).toMatchObject({
      hasValue: false,
      selectorConfigured: true,
      selectorFound: true,
    });

    expect(fields.get('custom.state_only_field')).toMatchObject({
      hasValue: true,
      selectorConfigured: false,
      selectorFound: null,
      valuePreview: 'from require',
    });

    expect(snapshot.missingWithSelector).toBeGreaterThanOrEqual(1);
  });

  it('should scope Meta snapshot fields to the active entity level', () => {
    document.body.innerHTML = `
      <input aria-label="Campaign name" value="Meta Spring Campaign" />
      <input aria-label="Ad set name" value="Meta Ad Set" />
    `;

    const snapshot = buildExtractionSnapshot(
      Platform.META,
      {
        'campaign.name': null,
        'ad_set.name': 'Meta Ad Set',
      },
      { entityLevel: EntityLevel.AD_SET },
    );

    const fieldPaths = snapshot.fields.map((field) => field.fieldPath);
    expect(fieldPaths).toContain('ad_set.name');
    expect(fieldPaths).not.toContain('campaign.name');
  });
});

describe('formatSnapshotValue()', () => {
  it('should serialize arrays and trim very long previews', () => {
    expect(formatSnapshotValue(['FR', 'US'])).toBe('["FR","US"]');

    const longValue = 'x'.repeat(140);
    expect(formatSnapshotValue(longValue).length).toBeLessThan(longValue.length);
  });
});
