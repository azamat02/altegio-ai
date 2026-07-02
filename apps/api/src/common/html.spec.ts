import { escapeHtml } from './html';

describe('escapeHtml', () => {
  it('escapes &, <, >', () => {
    expect(escapeHtml('Brow & Up <VIP>')).toBe('Brow &amp; Up &lt;VIP&gt;');
  });
  it('passes plain text through', () => {
    expect(escapeHtml('Оксана Гарифзянова')).toBe('Оксана Гарифзянова');
  });
});
