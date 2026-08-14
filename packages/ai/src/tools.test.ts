import { describe, expect, it } from 'vitest';
import {
  isDeferredVideoEditingTool,
  liveToolNames,
} from './index';

describe('deferred video editing tools', () => {
  it('keeps subtitle tools out of live model declarations', () => {
    expect(isDeferredVideoEditingTool('transcribe_video_for_captions')).toBe(
      true
    );
    expect(isDeferredVideoEditingTool('render_captioned_video')).toBe(true);
    expect(isDeferredVideoEditingTool('publish_video_now')).toBe(false);
    expect(liveToolNames()).not.toContain('transcribe_video_for_captions');
    expect(liveToolNames()).not.toContain('render_captioned_video');
    expect(liveToolNames()).toContain('publish_video_now');
  });
});
