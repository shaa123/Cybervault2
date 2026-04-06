import { invoke } from "@tauri-apps/api/core";

/** Capture first frame of a video via invoke (avoids protocol deadlock) */
export async function captureVideoFrame(fileId) {
  try {
    const b64 = await invoke("get_file_preview_chunk", { fileId, maxBytes: 8 * 1024 * 1024 });

    const mimeTypes = ["video/mp4", "video/webm", "video/x-matroska"];

    for (const mime of mimeTypes) {
      try {
        const binary = atob(b64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: mime });
        const blobUrl = URL.createObjectURL(blob);

        const result = await new Promise((resolve) => {
          const video = document.createElement("video");
          video.muted = true;
          video.preload = "auto";
          video.src = blobUrl;

          const timeout = setTimeout(() => {
            URL.revokeObjectURL(blobUrl);
            video.src = "";
            resolve(null);
          }, 10000);

          video.onloadeddata = () => {
            video.currentTime = 0.1;
          };

          video.onseeked = () => {
            clearTimeout(timeout);
            try {
              const canvas = document.createElement("canvas");
              canvas.width = 256;
              canvas.height = 256;
              const ctx = canvas.getContext("2d");
              const scale = Math.max(256 / video.videoWidth, 256 / video.videoHeight);
              const w = video.videoWidth * scale;
              const h = video.videoHeight * scale;
              ctx.drawImage(video, (256 - w) / 2, (256 - h) / 2, w, h);
              const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
              URL.revokeObjectURL(blobUrl);
              video.src = "";
              resolve(dataUrl.split(",")[1]);
            } catch (e) {
              URL.revokeObjectURL(blobUrl);
              video.src = "";
              resolve(null);
            }
          };

          video.onerror = () => {
            clearTimeout(timeout);
            URL.revokeObjectURL(blobUrl);
            video.src = "";
            resolve(null);
          };
        });

        if (result) return result;
      } catch (e) { /* try next mime */ }
    }

    return null;
  } catch (e) {
    return null;
  }
}

/** Generate thumbnails for all videos missing them. Returns count generated. */
export async function generateVideoThumbs() {
  try {
    const videoIds = await invoke("get_missing_video_thumb_ids");
    let count = 0;
    for (const vid of videoIds) {
      try {
        const thumbData = await captureVideoFrame(vid);
        if (thumbData) {
          await invoke("save_thumb_data", { fileId: vid, thumbBase64: thumbData });
          count++;
        }
      } catch (e) { /* skip */ }
    }
    return count;
  } catch (e) {
    return 0;
  }
}
