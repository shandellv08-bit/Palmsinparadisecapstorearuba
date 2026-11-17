"use client";

import { useState } from "react";
import { ProductImage } from "@/components/ProductImage";

export function Gallery({ images, name, soldOut }: { images: string[]; name: string; soldOut: boolean }) {
  const [i, setI] = useState(0);
  const current = images[i] ? [images[i]] : [];
  return (
    <div className="gallery">
      <ProductImage images={current} alt={images.length > 1 ? `${name}, photo ${i + 1} of ${images.length}` : name} soldOut={soldOut} priority sizes="(min-width: 900px) 55vw, 100vw" />
      {images.length > 1 ? (
        <div className="thumbs" role="group" aria-label="Photos">
          {images.map((img, n) => (
            <button key={img} type="button" aria-pressed={n === i} aria-label={`Show photo ${n + 1}`} onClick={() => setI(n)}>
              <ProductImage images={[img]} alt="" sizes="76px" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
