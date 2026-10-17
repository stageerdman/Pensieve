import { createReactBlockSpec } from "@blocknote/react";
import { Gallery } from "./gallery/Gallery";

// The BlockNote block SPEC for the inline gallery (`imageGroup`). Deliberately thin: it only
// registers the block + its primitive propSchema and mounts <Gallery>, the orchestrator. The
// actual UI is decomposed under ./gallery/ (Gallery → GalleryRow → GalleryTile → image/audio
// elements + the drop/reorder/resize logic). Markdown round-trips via lib/md/gallery.
export const ImageGroupBlock = createReactBlockSpec(
  {
    type: "imageGroup",
    content: "none",
    propSchema: {
      // The ordered entry list as a JSON string (BlockNote props must be primitives); each
      // entry is { url, caption?, saving?, kind? } — see lib/md/gallery. SAVE rewrites each
      // url → its vault ref and emits the `pensieve:gallery` fence (encodeImageGroupBlock),
      // so this block is never handed to BlockNote's own Markdown converter.
      images: { default: "[]" },
      // The user-dragged display height (px) for the justified strip; 0 = auto. Round-trips
      // via the fence's `h=` header (lib/md/gallery).
      height: { default: 0, type: "number" },
    },
  },
  {
    render: (props) => <Gallery block={props.block as never} editor={props.editor as never} />,
  },
)();
