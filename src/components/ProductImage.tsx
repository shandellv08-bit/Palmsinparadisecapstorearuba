import { photoUrl } from "@/lib/config";

/** A product photo in the crown-shaped frame. Missing photos show a plain note, never a stock image. */
export function ProductImage({
  images,
  alt,
  soldOut = false,
  priority = false,
  sizes = "(min-width: 700px) 25vw, 50vw",
}: {
  images: string[];
  alt: string;
  soldOut?: boolean;
  priority?: boolean;
  sizes?: string;
}) {
  const first = images[0];
  return (
    <div className={`crown${soldOut ? " soldout" : ""}`}>
      {first ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl(first, 600)}
          srcSet={`${photoUrl(first, 600)} 600w, ${photoUrl(first, 1600)} 1600w`}
          sizes={sizes}
          alt={alt}
          width={600}
          height={600}
          loading={priority ? "eager" : "lazy"}
          fetchPriority={priority ? "high" : undefined}
          decoding="async"
        />
      ) : (
        <span className="placeholder" aria-hidden="true">
          Photo not set
        </span>
      )}
    </div>
  );
}
