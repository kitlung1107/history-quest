import { useState, type ImgHTMLAttributes } from 'react';
import { mediaUrl } from '@/lib/siteSettings';
import { responsiveImage } from '@/lib/responsiveImage';

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src' | 'srcSet'> & { src: string; priority?: boolean };

/** Keep a single img DOM node, including existing CSS child selectors and crop rules. */
export default function ResponsiveImage({ src, priority = false, onError, ...props }: Props) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const asset = failedSource === src ? null : responsiveImage(src);
  return <img
    {...props}
    data-image-source={src}
    width={asset?.width}
    height={asset?.height}
    src={mediaUrl(asset?.variants.at(-1)?.src || src)}
    srcSet={asset?.variants.map(item => `${mediaUrl(item.src)} ${item.width}w`).join(', ')}
    loading={priority ? 'eager' : 'lazy'}
    fetchPriority={priority ? 'high' : 'auto'}
    decoding="async"
    onError={event => {
      // Missing derivative or unsupported WebP first retries the untouched original.
      if (asset) setFailedSource(src);
      else onError?.(event);
    }}
  />;
}
