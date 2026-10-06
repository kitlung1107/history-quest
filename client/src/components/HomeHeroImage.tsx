import { useState } from "react";
import { imagePosition, type ImagePosition } from "@/lib/imagePosition";
import ResponsiveImage from "./ResponsiveImage";
import { HERO_IMAGE_SIZES } from "@/lib/responsiveImage";

/** The parent keys this image by its source, so a changed selection retries it. */
export default function HomeHeroImage({
  image,
  alt,
  fallback,
  fallbackAlt,
  position,
  sizes = HERO_IMAGE_SIZES,
}: {
  image: string;
  alt: string;
  fallback: string;
  fallbackAlt: string;
  position?: ImagePosition | null;
  sizes?: string;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <ResponsiveImage
      src={failed ? fallback : image}
      priority
      sizes={sizes}
      alt={failed ? fallbackAlt : alt}
      onError={failed || image === fallback ? undefined : () => setFailed(true)}
      style={{ objectPosition: imagePosition(position) }}
      className="absolute inset-0 -z-10 h-full w-full object-cover"
    />
  );
}
