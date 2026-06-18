import { useEffect, useRef, useState } from "react";

type BouncingImage = {
  imageUrl: string;
};

type BouncingImagesProps = {
  images: BouncingImage[];
  alt: string;
  className?: string;
  speed?: number;
  mobileSpeed?: number;
};

export default function BouncingImages({ images, alt, className = "", speed = 78, mobileSpeed = 56 }: BouncingImagesProps) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const positionRef = useRef({ x: 0, y: 0 });
  const velocityRef = useRef({ x: speed * 0.78, y: speed * 0.62 });
  const [isMobile, setIsMobile] = useState(false);
  const [imageIndex, setImageIndex] = useState(0);
  const effectiveSpeed = isMobile ? mobileSpeed : speed;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 480px)");
    const syncMobileState = () => setIsMobile(media.matches);

    syncMobileState();
    media.addEventListener("change", syncMobileState);

    return () => {
      media.removeEventListener("change", syncMobileState);
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    const image = imageRef.current;
    if (!stage || !image || images.length === 0) {
      return undefined;
    }

    let mounted = true;
    const directionX = Math.sign(velocityRef.current.x) || 1;
    const directionY = Math.sign(velocityRef.current.y) || 1;
    velocityRef.current = {
      x: directionX * effectiveSpeed * 0.78,
      y: directionY * effectiveSpeed * 0.62,
    };

    const imageSize = () => ({
      width: image.offsetWidth,
      height: image.offsetHeight,
    });

    const placeImage = () => {
      const bounds = stage.getBoundingClientRect();
      const size = imageSize();
      const maxX = Math.max(bounds.width - size.width, 0);
      const maxY = Math.max(bounds.height - size.height, 0);

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
      const size = imageSize();
      const maxX = Math.max(bounds.width - size.width, 0);
      const maxY = Math.max(bounds.height - size.height, 0);
      const next = {
        x: positionRef.current.x + velocityRef.current.x * delta,
        y: positionRef.current.y + velocityRef.current.y * delta,
      };
      let bounced = false;

      if (maxX > 0 && ((next.x <= 0 && velocityRef.current.x < 0) || (next.x >= maxX && velocityRef.current.x > 0))) {
        next.x = Math.min(Math.max(next.x, 0), maxX);
        velocityRef.current.x *= -1;
        bounced = true;
      }

      if (maxY > 0 && ((next.y <= 0 && velocityRef.current.y < 0) || (next.y >= maxY && velocityRef.current.y > 0))) {
        next.y = Math.min(Math.max(next.y, 0), maxY);
        velocityRef.current.y *= -1;
        bounced = true;
      }

      next.x = Math.min(Math.max(next.x, 0), maxX);
      next.y = Math.min(Math.max(next.y, 0), maxY);
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
  }, [effectiveSpeed, images.length]);

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
