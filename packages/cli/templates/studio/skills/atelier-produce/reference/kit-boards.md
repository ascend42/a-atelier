# Series kit boards

Pick only boards relevant to the platform mix. Options are written per
series — the axes below are prompts, not a menu.

Each board: **owner**, **asks**, **facets** (mix & match units),
**writes** (into `series-kit.yaml`), **reference** (quick / deep).

## series-intent — Patrick + Quill
- **Asks:** Who is this for, what does every episode promise, what's the tone?
- **Facets:** audience · promise · tone · episode length
- **Writes:** `intent.*`
- **Reference:** none

## platform-mix — Patrick
- **Asks:** Which platforms, what goes on each, at what cadence?
- **Facets:** platforms · per-platform deliverables · cadence · release order
- **Writes:** `platforms`, `deliverables`, `cadence`
- **Reference:** quick deliverable map for one episode · deep the same as a visual release calendar

## recording-spec — Patrick + Lux
- **Asks:** What do we capture so every downstream piece works?
- **Facets:** camera angles · framing (vertical-crop safe zone) · B-roll list · thumbnail-face moments · audio (per-speaker tracks, mic) · resolution/frame rate
- **Writes:** `recording_spec`
- **Reference:** quick frame guides over a real frame · deep 16:9 / 9:16 / 1:1 crops of a real clip side by side

## intro-card — Lux
- **Asks:** How does every episode open?
- **Facets:** length (2–8 s) · motion style · logo treatment · episode-number/title treatment · music sting
- **Writes:** `templates.intro`, `tokens.motion`
- **Reference:** quick key frames · deep rendered clips with the real logo/name

## end-card — Lux
- **Asks:** How does every episode close and hand off?
- **Facets:** length · CTA · YouTube end-screen layout (element zones) · next-episode tease
- **Writes:** `templates.end_card`
- **Reference:** quick frame with end-screen zones overlaid · deep rendered clip

## thumbnail-system — Lux + Quill
- **Asks:** What does every thumbnail look like?
- **Facets:** face (expression, crop) · text (words max, type, placement) · color/background · guest treatment · series branding
- **Writes:** `templates.thumbnail`, rule `thumbnail-text-max`
- **Reference:** quick mockups from real frames at feed size · deep feed size + mobile size + next to the creator's reference channels

## lower-thirds — Lux
- **Asks:** How are speakers and guests identified on screen?
- **Facets:** position · type · motion · duration
- **Writes:** `templates.lower_third`
- **Reference:** quick still over a real frame · deep rendered on a real clip

## short-form — Patrick + Quill + Lux
- **Asks:** What makes a short from this show, and how is it cut?
- **Facets:** clip length · hook style (cold open / question / claim) · framing (center crop / split speaker / dynamic reframe) · pacing (jump cuts, zooms) · per-episode count
- **Writes:** `shorts.*`
- **Reference:** quick storyboard frames · deep one real moment cut per option (9:16)

## captions — Lux
- **Asks:** What do captions look like on long-form and shorts?
- **Facets:** words per line · emphasis (keyword highlight) · type · position (inside UI safe zones) · burned-in vs. native
- **Writes:** `captions.*`
- **Reference:** quick still · deep over a real clip with each platform's UI overlay

## titles-descriptions — Quill
- **Asks:** How do we title and describe episodes?
- **Facets:** title formula · length (front-loaded) · description structure · links block · hashtags/tags
- **Writes:** `copy.title`, `copy.description` templates
- **Reference:** a real episode written per option with truncation previews (search, feed, mobile)

## chapters-show-notes — Quill
- **Asks:** How are chapters and show notes written?
- **Facets:** chapter granularity · naming style · show-notes length · timestamps · guest links
- **Writes:** `copy.chapters`, `copy.show_notes`
- **Reference:** a real episode in each format

## social-newsletter — Quill
- **Asks:** How does the show talk on LinkedIn / X and in the newsletter?
- **Facets:** voice · length · structure · CTA · newsletter shape (recap / essay / key takeaways)
- **Writes:** `copy.social.*`, `copy.newsletter`
- **Reference:** one episode's posts + newsletter intro per option

## quote-cards — Lux + Quill
- **Asks:** What do pull-quote graphics look like?
- **Facets:** layout · type · photo vs. text-only · sizes (feed 1:1 / 4:5, story 9:16)
- **Writes:** `templates.quote_card`
- **Reference:** real quotes rendered per option at each size

## guest-kit — Patrick
- **Asks:** What do guests get to share?
- **Facets:** clips (count, which) · quote cards · copy (suggested post) · delivery (folder / link / email draft)
- **Writes:** `deliverables.guest_kit`
- **Reference:** the kit contents for one real episode
