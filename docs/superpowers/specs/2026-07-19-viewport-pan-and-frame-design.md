# Viewport Pan and Frame Controls Design

**Status:** Approved for implementation on 2026-07-19.

## Goal

Make scenes larger than the visible viewport practical to inspect in both Classic 2.5D and Hybrid 3D without changing authored geometry. The interaction should follow familiar modelling-tool conventions and preserve the existing object manipulation gestures.

## Interaction contract

Both modes support:

- middle-button drag from any viewport location to pan the view;
- Shift + left-button drag from empty viewport space to pan the view;
- wheel zoom anchored inside the viewport without scrolling the page;
- `Home` to restore the mode's default rotation, zoom, and zero pan;
- `Frame All` to centre and fit the enabled room and scene objects;
- a grab/grabbing cursor while a pan gesture is available or active.

Classic keeps ordinary left-button object and Wall-endpoint dragging. Hybrid keeps ordinary empty-space left-button orbit, ordinary object X/Z dragging, and Shift + left-button object dragging for Y height. Middle-button drag always wins over object manipulation and pans even when it starts over an object.

## Camera and projection contract

`WorkspaceCamera` adds finite `panX` and `panY` values measured in virtual viewport pixels. Each mode owns and persists its own camera state. Camera and presentation changes remain outside authoring Undo/Redo and do not change the project revision used by acoustic Workers.

Classic applies zoom around the viewport centre and then applies screen-space pan to every world-to-SVG projection. Pointer-to-world conversion uses the exact inverse transform. Hybrid applies pan after its orthographic yaw/pitch/zoom projection; fixed-height unprojection removes pan before solving world X/Z. The transform pairs must round-trip within floating-point tolerance.

Existing cache documents without pan fields migrate by adding zero pan. Invalid or non-finite camera input is rejected or clamped through the existing safe-default migration path.

## Home and Frame All

`Home` restores the current mode's default camera:

- Classic: zero pan and zoom 1;
- Hybrid: default yaw/pitch, zero pan, and zoom 1.

`Frame All` collects the room bounds plus every enabled Listener, source, Wall endpoint, Portal and relevant vertical extent. It calculates a bounded zoom with visual padding, then offsets the projected bounds to the viewport centre. Disabled objects do not influence the result. The calculation is deterministic and must remain finite for maximum supported room and entity limits.

## Pointer-state safety

Pan state records the initiating pointer, initial camera, and gesture kind. Pointer capture keeps dragging stable outside the element. Pointer up, pointer cancel, and lost capture terminate the gesture. Panning prevents default browser actions and must never dispatch an authoring mutation.

Wall-placement mode keeps its existing two-click behavior for unmodified left click. Middle-button and Shift + left-button panning remain available while placement mode is active and must not add a Wall point.

## Presentation

Classic and Hybrid viewport headers expose compact `Home` and `Frame All` buttons. Hybrid retains Top and Front views; those view buttons preserve zero pan unless a subsequent pan occurs. The inline help uses short labels for Orbit, Pan, Height, and Wheel zoom.

## Verification

Unit tests cover:

- Classic projection/inverse round trips with pan and zoom;
- Hybrid projection/inverse round trips with pan and zoom;
- camera clamping and legacy cache migration;
- deterministic Frame All output and bounds containment.

Production Chromium tests cover:

- middle-button and Shift + left-button pan in both modes;
- no object movement during pan;
- Hybrid Shift + object height behavior remains intact;
- wheel zoom stays inside both viewports;
- Home and Frame All;
- independent per-mode camera persistence across switching and refresh;
- wall placement remains correct after pan and zoom;
- no page errors or page scrolling during viewport navigation.
