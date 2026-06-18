import { useEffect, useRef, useState } from "react";

type BouncingImage = {
  imageUrl: string;
};

type BouncingImagesProps = {
  images: BouncingImage[];
  alt: string;
  className?: string;
  speed?: number;
};

export default function BouncingImages({ images, alt, className = "", speed = 92 }: BouncingImagesProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const positionRef = useRef({ x: 0, y: 0 });
  const velocityRef = useRef({ x: speed * 0.78, y: speed * 0.62 });
  const [imageIndex, setImageIndex] = useState(0);

  useEffect(() => {
    const stage = stageRef.current;
    const image = imageRef.current;
    if (!stage || !image || images.length === 0) {
      return undefined;
    }

    let mounted = true;

    const placeImage = () => {
      const bounds = stage.getBoundingClientRect();
      const imageBounds = image.getBoundingClientRect();
      const maxX = Math.max(bounds.width - imageBounds.width, 0);
      const maxY = Math.max(bounds.height - imageBounds.height, 0);

      positionRef.current = {
        x: Math.min(positionRef.current.x || maxX / 2, maxX),
        y: Math.min(positionRef.current.y || maxY / 2, maxY),
      };
      image.style.transform = `translate3d(${positionRef.current.x}px, ${positionRef.current.y}px, 0)`;
    };

    const animate = (time: number) => {
      if (!mounted) {
        return;
      }

      const lastTime = lastTimeRef.current ?? time;
      const delta = Math.min((time - lastTime) / 1000, 0.05);
      lastTimeRef.current = time;

      const bounds = stage.getBoundingClientRect();
      const imageBounds = image.getBoundingClientRect();
      const maxX = Math.max(bounds.width - imageBounds.width, 0);
      const maxY = Math.max(bounds.height - imageBounds.height, 0);
      const next = {
        x: positionRef.current.x + velocityRef.current.x * delta,
        y: positionRef.current.y + velocityRef.current.y * delta,
      };
      let bounced = false;

      if (next.x <= 0 || next.x >= maxX) {
        next.x = Math.min(Math.max(next.x, 0), maxX);
        velocityRef.current.x *= -1;
        bounced = true;
      }

      if (next.y <= 0 || next.y >= maxY) {
        next.y = Math.min(Math.max(next.y, 0), maxY);
        velocityRef.current.y *= -1;
        bounced = true;
      }

      positionRef.current = next;
      image.style.transform = `translate3d(${next.x}px, ${next.y}px, 0)`;

      if (bounced && images.length > 1) {
        setImageIndex((current) => (current + 1) % images.length);
      }

      frameRef.current = window.requestAnimationFrame(animate);
    };

    placeImage();
    frameRef.current = window.requestAnimationFrame(animate);

    const resizeObserver = new ResizeObserver(placeImage);
    resizeObserver.observe(stage);
    resizeObserver.observe(image);

    return () => {
      mounted = false;
      resizeObserver.disconnect();
      if (frameRef.current) {
        window.cancelAnimationFrame(frameRef.current);
      }
      lastTimeRef.current = null;
    };
  }, [images.length, speed]);

  if (images.length === 0) {
    return null;
  }

  return (
    <div className={`bouncing-image-stage ${className}`.trim()} ref={stageRef}>
      <img
        ref={imageRef}
        className="bouncing-image"
        src={images[imageIndex]?.imageUrl}
        alt={alt}
        onLoad={() => {
          lastTimeRef.current = null;
        }}
      />
    </div>
  );
}
