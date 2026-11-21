import { describe, expect, it } from 'vitest';
import { useTranscodeNotice } from '../useTranscodeNotice';

describe('useTranscodeNotice', () => {
  it('drives the overlay from start through progress to finish', () => {
    const { reporter, state } = useTranscodeNotice();
    expect(state).toMatchObject({ active: false, percent: -1 });

    reporter.start();
    expect(state).toMatchObject({ active: true, percent: -1 });

    reporter.progress(42);
    expect(state.percent).toBe(42);

    reporter.finish(true);
    expect(state).toMatchObject({ active: false, percent: -1 });
  });

  it('hides the overlay when the transcode is cancelled', () => {
    const { reporter, state } = useTranscodeNotice();
    reporter.start();
    reporter.progress(10);

    reporter.cancel();

    expect(state).toMatchObject({ active: false, percent: -1 });
  });
});
