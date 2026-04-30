import { describe, expect, it } from "vitest";
import {
  isRemotePostLookupDocument,
  noteJsonFromRawLookupDocument,
  remoteNoteActorId,
} from "./lookup";

describe("remote post lookup mapping", () => {
  it("recognizes direct Note documents", () => {
    const note = {
      id: "https://remote.example/notes/1",
      type: "Note",
      attributedTo: "https://remote.example/users/alice",
    };

    expect(isRemotePostLookupDocument(note)).toBe(true);
    expect(noteJsonFromRawLookupDocument(note)).toBe(note);
  });

  it("recognizes Create activities with embedded Notes", () => {
    const note = {
      id: "https://remote.example/notes/1",
      type: "Note",
      attributedTo: "https://remote.example/users/alice",
    };
    const create = {
      id: "https://remote.example/activities/1",
      type: "Create",
      actor: "https://remote.example/users/alice",
      object: note,
    };

    expect(isRemotePostLookupDocument(create)).toBe(true);
    expect(noteJsonFromRawLookupDocument(create)).toBe(note);
  });

  it("extracts the note author from attributedTo or Create actor", () => {
    expect(remoteNoteActorId({
      type: "Note",
      attributedTo: "https://remote.example/users/alice",
    })).toBe("https://remote.example/users/alice");
    expect(remoteNoteActorId({ type: "Note" }, {
      type: "Create",
      actor: "https://remote.example/users/bob",
    })).toBe("https://remote.example/users/bob");
  });

  it("rejects non-note lookup documents", () => {
    expect(isRemotePostLookupDocument({ type: "Person" })).toBe(false);
    expect(noteJsonFromRawLookupDocument({ type: "Create", object: "https://remote.example/notes/1" })).toBeNull();
    expect(noteJsonFromRawLookupDocument(null)).toBeNull();
  });
});

