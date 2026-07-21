import { describe, expect, it } from "vitest";

import { CONCRETE_PARTITION_PRESET } from "@/domain/presets/concrete-partition";
import {
  SceneDocumentSerializationError,
  createSceneDocumentV2,
  parseSceneDocument,
  serializeSceneDocument,
  toClassicScene,
} from "@/domain/scene-document/serialize";
import type { SceneDocumentV2 } from "@/domain/scene-document/types";
import { parseScene } from "@/domain/scene/serialize";

describe("versioned scene documents", () => {
  it("envelopes a validated v1 scene without altering its Classic projection", () => {
    const baseScene = structuredClone(CONCRETE_PARTITION_PRESET);
    const document = createSceneDocumentV2(baseScene, {
      spatial3d: {
        coordinateSystem: "x-right-y-up-z-forward",
        floorElevationM: 0,
        listenerHeightM: 1.5,
        sourceHeightsM: { radio: 1.3, rain: 2.2 },
      },
      propagation3d: { maxReflectionOrder: 1, receiverConnection: false },
    });

    const parsed = parseSceneDocument(serializeSceneDocument(document));

    expect(parsed).toEqual(document);
    expect(toClassicScene(parsed)).toEqual(baseScene);
    expect(parseScene(serializeSceneDocument(document))).toEqual(baseScene);
  });

  it("preserves a v1 document as the Classic document type", () => {
    const parsed = parseSceneDocument(JSON.stringify(CONCRETE_PARTITION_PRESET));

    expect(parsed).toEqual(CONCRETE_PARTITION_PRESET);
    expect("documentVersion" in parsed).toBe(false);
  });

  it("rejects a v2 compatibility hash that does not match its base scene", () => {
    const document = createSceneDocumentV2(structuredClone(CONCRETE_PARTITION_PRESET));
    const tampered = structuredClone(document);
    tampered.baseScene.name = "Tampered Classic Scene";

    expect(() => parseSceneDocument(JSON.stringify(tampered))).toThrow(
      SceneDocumentSerializationError,
    );
    expect(() => parseSceneDocument(JSON.stringify(tampered))).toThrow(/projection hash/i);
  });

  it("rejects 3D source heights that cannot be mapped to the v1 scene", () => {
    const document = createSceneDocumentV2(structuredClone(CONCRETE_PARTITION_PRESET), {
      spatial3d: {
        coordinateSystem: "x-right-y-up-z-forward",
        floorElevationM: 0,
        listenerHeightM: 1.5,
        sourceHeightsM: { radio: 1.2 },
      },
    });
    const tampered = JSON.parse(serializeSceneDocument(document)) as {
      extensions: { spatial3d: { sourceHeightsM: Record<string, number> } };
    };
    tampered.extensions.spatial3d.sourceHeightsM.unknown_source = 1.2;

    expect(() => parseSceneDocument(JSON.stringify(tampered))).toThrow(/unknown source/i);
  });

  it("does not permit an extension-only v2 document to remove the valid base scene", () => {
    const document = createSceneDocumentV2(structuredClone(CONCRETE_PARTITION_PRESET));
    const invalid = {
      ...document,
      baseScene: undefined,
    } as unknown as SceneDocumentV2;

    expect(() => serializeSceneDocument(invalid)).toThrow(/validation failed/i);
  });
});
