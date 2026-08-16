const AVATAR_SIZE = 256;

/** Crop and downscale a user-selected image before storing its data URL. */
export const processAvatarFile = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      try {
        const side = Math.min(image.width, image.height);
        const sx = (image.width - side) / 2;
        const sy = (image.height - side) / 2;
        const canvas = document.createElement("canvas");
        canvas.width = AVATAR_SIZE;
        canvas.height = AVATAR_SIZE;
        const context = canvas.getContext("2d");
        context.imageSmoothingQuality = "high";
        context.drawImage(image, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
        resolve(canvas.toDataURL("image/jpeg", 0.85));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error("image-load-failed"));
    image.src = reader.result;
  };
  reader.onerror = () => reject(new Error("file-read-failed"));
  reader.readAsDataURL(file);
});
