import { useState } from "react";
import { imagePosition, type ImagePosition } from "@/lib/imagePosition";
import { mediaUrl } from "@/lib/siteSettings";

/** The parent keys this image by its source, so a changed selection retries it. */
export default function HomeHeroImage({
  image,
  alt,
  fallback,
  fallbackAlt,
  position,
}: {
  image: string;
  alt: string;
  fallback: string;
  fallbackAlt: string;
  position?: ImagePosition | null;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <img
      src={mediaUrl(failed ? fallback : image)}
      alt={failed ? fallbackAlt : alt}
      onError={failed || image === fallback ? undefined : () => setFailed(true)}
      style={{ objectPosition: imagePosition(position) }}
      className="absolute inset-0 -z-10 h-full w-full object-cover"
    />
  );
}
