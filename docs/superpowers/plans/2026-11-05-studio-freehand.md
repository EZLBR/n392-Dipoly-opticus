# Studio freehand layers (#85)

Base the work on the Studio patterns branch. Build on the existing artwork zones and projection.

- [ ] Keep text-only artwork version 1 readable and writable. Add version 2 for mixed layers with up to six layers total. Store up to 32 strokes per drawing, with up to 128 points per stroke. Coordinates use integer units from 0 to 1000 within the allowed zone. Store stroke color and integer width from 2 to 20 percent of the drawing area's height. Older full configuration edits must preserve newer drawing layers or return a compatibility error if the combined layers would exceed the limit.
- [ ] Paint normalized strokes to a transparent texture and use the same rim and temple projection as text. Verify the footprint and attachment across silhouettes and folding angles. The four permitted zones map to specific frame patches. Lenses, hinge and pad meshes stay outside the projection.
- [ ] Add a responsive drawing pad for pointer devices and a form for entering a straight stroke by coordinates. Provide color, width, undo, redo, zone and layer removal controls. Redo applies within the current editing session. Keep the existing save and factory validation behavior.
- [ ] Test normalization, server round trips, limits, older writes, drawing controls and silhouette changes. Run both suites, type checks and builds.
