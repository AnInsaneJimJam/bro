export default function PrivacyPage() {
  return (
    <main
      style={{
        maxWidth: 760,
        margin: '64px auto',
        padding: 24,
        fontFamily: 'Arial',
        lineHeight: 1.6,
      }}
    >
      <h1>Bro privacy notice</h1>
      <p>
        Bro processes account identifiers and OAuth tokens, bounded samples of
        your owned posts and comments, uploaded videos and derived
        audio/captions, scripts, schedules, and audit records to provide creator
        workflows you request.
      </p>
      <p>
        Tokens are encrypted server-side and are never exposed to the browser or
        language model. Demo mode uses labeled synthetic records and makes no
        platform calls. Disconnect and account-deletion workflows revoke tokens
        where supported and enqueue deletion of cached content, media, comments,
        and analyses.
      </p>
      <p>
        This development notice must be replaced with reviewed retention
        periods, controller contact details, and provider-specific disclosures
        before public launch.
      </p>
    </main>
  );
}
