import { describe, expect, it } from 'vitest';
import { isDeferredVideoEditingTool, liveToolNames } from './index';

describe('deferred video editing tools', () => {
  it('keeps caption tools live now that English captions are enabled', () => {
    expect(isDeferredVideoEditingTool('transcribe_video_for_captions')).toBe(
      false
    );
    expect(isDeferredVideoEditingTool('render_captioned_video')).toBe(false);
    expect(isDeferredVideoEditingTool('publish_video_now')).toBe(false);
    expect(liveToolNames()).toContain('transcribe_video_for_captions');
    expect(liveToolNames()).toContain('render_captioned_video');
    expect(liveToolNames()).toContain('publish_video_now');
  });
});
