# Changelog

This changelog tracks Humanly product milestones after the policy-enforcement
epic. Version labels are release-note milestones; create matching Git tags only
when a formal public release is cut.

## v0.4.0 - Workspace Preview and Evidence Polish

Release focus: make setup, writing preview, certificates, and logs feel like one
coherent evidence workflow.

### Added

- Added setup workspace preview for personal writing and admin task creation.
  The setup page opens a new tab with a read-only workspace preview that mirrors
  the real writing surface.
- Added a real selected-text preview state so writers can see the same AI
  shortcut menu they will use in the workspace.
- Added first-entry writing rules dialog and a persistent Rules entry point in
  the workspace.
- Added certificate grouping by writing task or document, with collapsible
  certificate folders.
- Added certificate deletion and certificate-folder deletion.
- Added certificate environment export so reviewers can download the active
  writing configuration.
- Added left-workspace and returned-workspace events to the activity timeline.
- Added `chat_refusal` as a structured anomaly signal for policy-refused AI
  chat requests on newly generated certificates.

### Changed

- Reworked certificate pages so owner-facing certificates and public shared
  certificates use the same core layout and terminology.
- Redesigned Authorship Statistics around typed, pasted, and AI-improvement
  composition, plus event counts, final text length, and writing time.
- Moved seal and integrity details into the certificate details area instead of
  exposing them as a primary action.
- Changed Environment and Replay sections to default-collapsed supporting
  evidence sections.
- Removed the JSON Data button from the certificate UI; sharing now centers on
  the certificate link.
- Simplified activity-log labels, tags, and colors so major events, minor
  activity, and anomaly review signals are easier to scan.
- Reworked admin analytics and event-log colors to use a softer Morandi-style
  palette.
- Aligned admin dashboard surfaces more closely with the user portal visual
  system.

### Fixed

- Fixed preview quick-action positioning by reusing the real selected-text menu
  behavior instead of a separate preview-only approximation.
- Fixed preview editing guards so preview text is selectable but cannot be
  edited, pasted into, cut, or dropped onto.
- Fixed certificate log navigation so returning from logs can go back to the
  certificate instead of the editor.
- Fixed certificate timestamp canonicalization so public verification remains
  stable across non-UTC server time zones.
- Fixed stale or invalid socket-token handling in deployed workspace sessions.

## v0.3.0 - Policy, AI Modes, and Sharing

Release focus: make AI access and shared-link entry explicit and configurable.

### Added

- Added four AI-use modes: Off, Only polish, Only agent chat, and Full.
- Added mode-specific AI controls across user and admin settings.
- Added OpenAI-compatible provider configuration for the expanded model/provider
  setup.
- Added shared-link guest policy controls for assigned writing tasks.
- Added explicit guest-vs-logged-in entry choices when guest submission is
  allowed.
- Added policy hash binding to new certificate seal payloads.

### Changed

- Changed selected-text AI controls to match the active AI mode:
  polish-only workspaces show polish shortcuts only, chat-only workspaces show
  Ask AI only, and full workspaces show both.
- Separated guest writing mode from logged-in writing mode in shared-link flows.
- Removed guest-inappropriate navigation actions such as logout, admin portal,
  and back-to-certificates from guest contexts.
- Unified signup so users provide basic information on first dashboard entry
  rather than during initial account creation.
- Added basic-information editing in My Account.

### Fixed

- Fixed admin-to-user navigation requiring an unnecessary re-login.
- Fixed certificate fetch failures for logged-in users entering via shared
  links.
- Fixed initial shared-link saving state that could spin too long before any
  writing had happened.
- Fixed basic-information button labels and spacing.

## v0.2.0 - Demo, Certificates, and Public Verification

Release focus: make the public demo and verification surface match the real
Humanly workflow.

### Added

- Added Humanly Demo as a separate demo workspace opened from the homepage.
- Added certificate integrity seal display and public verification support.
- Added replay and AI-assistance details to public certificate pages.
- Added clickable `writehumanly.net` attribution in certificate surfaces.

### Changed

- Renamed Fast Writing Demo to Humanly Demo.
- Moved the homepage demo section after the FAQ and simplified the call to
  action to Open Demo.
- Reworked the demo to follow the personal writing setup, writing, and
  certificate flow instead of the admin task-creation flow.
- Shortened demo-step copy and aligned the demo background with the rest of the
  site.
- Standardized verification and certificate wording around Certificate.

### Fixed

- Fixed empty verification card states.
- Fixed missing or inconsistent certificate actions across owner and public
  views.
- Fixed several public-certificate layout and button-alignment issues.

## v0.1.0 - Admin and Account Foundation

Release focus: clean up user onboarding, admin task management, and account
controls before the policy epic shipped.

### Added

- Added Delete my account under account settings.
- Added task-level controls for whether a shared link allows guest submission.
- Added admin-side controls for the richer writing environment configuration.

### Changed

- Hid task settings for active tasks so admins do not modify writing policy
  while submissions are in progress.
- Refined admin chart styling and added visible nodes to trend lines.
- Improved account setup and My Account editing paths.

### Fixed

- Fixed several setup-form spacing, copy, and empty-state issues in the user
  portal and admin dashboard.
