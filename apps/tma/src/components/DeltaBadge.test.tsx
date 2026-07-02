import { describe, it, expect } from 'vitest';
import { renderToString } from 'react-dom/server';
import { DeltaBadge } from './DeltaBadge';

describe('DeltaBadge', () => {
  it('renders ▲ +N% for positive deltas', () => {
    const html = renderToString(<DeltaBadge deltaPct={15} />);
    expect(html).toContain('▲ +15%');
    expect(html).toContain('class="badge up"');
  });

  it('renders ▼ −N% for negative deltas (minus sign is U+2212)', () => {
    const html = renderToString(<DeltaBadge deltaPct={-20} />);
    expect(html).toContain('▼ −20%');
    expect(html).toContain('class="badge down"');
  });

  it('renders новый when deltaPct is null', () => {
    const html = renderToString(<DeltaBadge deltaPct={null} />);
    expect(html).toContain('новый');
    expect(html).toContain('badge muted');
  });
});
