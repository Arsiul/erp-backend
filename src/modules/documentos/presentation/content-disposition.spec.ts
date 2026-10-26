import { contentDisposition } from './content-disposition';

describe('contentDisposition', () => {
  it('sends an ASCII fallback and the UTF-8 name', () => {
    expect(contentDisposition('Guía "año" (1)*.pdf', false)).toBe(
      `attachment; filename="Gu_a _a_o_ (1)*.pdf"; filename*=UTF-8''Gu%C3%ADa%20%22a%C3%B1o%22%20%281%29%2A.pdf`,
    );
  });

  it('marks the safe types as inline', () => {
    expect(contentDisposition("a'b.png", true)).toBe(
      `inline; filename="a'b.png"; filename*=UTF-8''a%27b.png`,
    );
  });
});
